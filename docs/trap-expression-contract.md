# Caller-side `trap expression` contract

Status: **proposed normative semantic contract**, awaiting independent review.
Source language: AttoLang (`.atto`). This is distinct from any terminal
Wasm engine trap, panic instruction, or proposal for a bare `trap;` statement.

## Rule

For an expression `e` whose static result type is `T`, the expression
`trap e` has static type **`Option<T>`**.

- When `e` returns normally with value `v`, evaluate it exactly once and
  return `Some(v)`.
- When an ordinary language-level **`throw`** escapes evaluation of `e`,
  perform the required ordinary-throw cleanup exactly once and return `None`.
  A `throw` caught within `e` is not intercepted by the outer `trap`.
- `raise`, `panic`, actor supervisor control faults and cancellation are
  **not** caught; they propagate under their own language/runtime rules.
- A Wasm engine trap, host error, memory fault, checked integer overflow,
  quota violation or other panic **must never** be turned into `None`.
- `Result.Err(error)` is ordinary *data*. Neither it nor `Option.None`
  constitutes a thrown exception; the outer `trap` never flattens, converts
  or discards inner variants.
- `trap` is a caller-side expression operator; it is **not** a declaration
  modifier or an alternate name for `throw`.

These rules do not imply a new general-purpose `Monad` interface, automatic
`Result` conversion or implicit Option unwrapping.

## Type and value examples

| Source | Static type | Normal outcome |
| --- | --- | --- |
| `checked_id(5)` | `Result<int,String>` | `Ok(5)` |
| `trap checked_id(5)` | `Option<Result<int,String>>` | `Some(Ok(5))` |
| `trap checked_id(-1)` | `Option<Result<int,String>>` | `Some(Err("id must be nonnegative"))` |
| `trap get_id(9)` | `Option<int>` | `Some(9)` |
| `trap get_optional()` | `Option<Option<int>>` | `Some(None)` when `get_optional()` returns `None` |
| `trap may_throw()` | `Option<T>` | `None` if an ordinary `throw` escapes |

A function declared with parameter `Result<int,String>` must reject an
argument of type `Option<Result<int,String>>`; a caller must explicitly
match `Some(result)` and pass that `result`. Matching `Some`/`None`
against a bare `Result` must fail; matching `Ok`/`Err` against a bare
`Option` must fail. Every match is checked for exhaustiveness.

## Runtime obligations

Implementations must prove type-directed selection of the catchable effect,
left-to-right evaluation, exactly-once effects, correct drop/defer execution,
nested trap boundaries, no cross-actor catch, and panic/cancellation bypass.
A WebAssembly host must not convert arbitrary `WebAssembly.RuntimeError`
or other engine exceptions to `None`. True throw-to-None behavior requires
guest-language-level typed throwing and unwinding.

## Conformance matrix (requirements, not pass claims)

1. `Some(Ok(5))`, `Some(Err(...))`, `Some(None)` stay distinct.
2. Ordinary `throw` becomes outer `None` only when uncaught inside `e`.
3. `raise`, `panic`, cancellation, checked overflow and Wasm faults bypass.
4. Call/argument mismatch, wrong-family patterns and missing variants reject
   statically; unsupported types reject with a diagnostic, no partial guest.
5. Assert the exact compiled guest outcome on Java/Graal, LLVM, .NET and
   Rust/Wasm independently (plus Forge when the backend is available).

## Current implementation boundaries (2026-11-13)

`atto-source.rs` has concrete `Option<int>`,
`Result<int,string>`, and `Option<Result<int,string>>` heap profiles.
Draft `atto-source.rs#67` adds the **non-throwing subset only**: values
become `Some(...)`; ordinary `throw` is still rejected, so none of its
tests can prove `throw` -> `None`. In particular, the positive fixtures
do not establish the full normative contract. The public playground's
pinned compiler must remain labeled as a preview until a separately
approved actual compiled-guest release has passed its checks.

A separate older proposal `atto-source.rs#54` uses bare `trap;` as a
terminal panic-code-4 fault. Do not silently conflate that operation with
caller-side `trap expression`; its spelling/semantics require a separate
language decision and compatibility review.
