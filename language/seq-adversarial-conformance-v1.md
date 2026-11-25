# Sequence (`seq`) adversarial conformance and backend release gate

Status: **draft normative hardening proposal** layered on atto-spec #86.
The grammar authority remains [return-shorthand-and-sequences-v1.md](return-shorthand-and-sequences-v1.md).
This file is a coverage matrix, **not** proof that a compiler or formatter passed.
Do not count an unexecuted case as a pass.

## Nonnegotiable sequence invariants

1. `seq(a, b, c)` and `(> a, b, c)` evaluate in **source order**, exactly once, yielding `c` only. Ordinary `(a, b, c)` stays a tuple, even when tuple lowering is unsupported.
2. `seq(x)` is a valid one-item sequence with value `x`. Zero-item sequences, missing members, trailing commas and semicolon separators are errors.
3. Prefix bindings have a **fresh lexical scope**. An inner sequence can read or mutate a legally mutable outer binding but cannot export a binding or reuse one name twice at the same scope level. A returned resource/borrow must be checked for escape and cleanup before any backend admits it.
4. Assignments are prefix **statements**, never tail expressions. `seq(z += 1, z)` performs the normal mutability/borrow/checked-arithmetic rules for an assignment; this syntax grants no privileged mutation.
5. Delimiter ownership is **syntactic**: `f(seq a, b, c)` is one final argument; use `f(seq(a, b), c)` for an earlier sequence argument. An inner call, tuple, array, generic or lambda owns its own delimiters.
6. `seq` as a statement discards its result without returning from the callable. Only `return`/`^` or the active `::` body-mode rules determine a callable's return. `^` never acts as a sequence expression operand or a nonlocal return.
7. Every prefix and tail undergoes type, ownership, borrow, purity, failure/effect, cancellation, and actor-state checks; ignored results are **not** ignored effects. Each backend must reject unsupported owned-resource, generator, actor-reference and suspension cases rather than claim a complete generic value model.
8. Short-circuit operators, conditional arms, `?` propagation, `throw`/`raise`/`panic`, `defer` and cleanup must retain their ordinary evaluation and exit rules when nested within sequences. A step after an unconditional exit must be diagnosed unreachable; implementations may conservatively reject forms not yet lowered.
9. Preserve the v1/v2 callable-body selector. Never silently migrate unmarked v1 comma bodies to strict v2, and never change `::`, commas, semicolons or `return` spelling when formatting.
10. Enforce bounded item count, delimiter nesting, AST depth, input bytes and compiled guest resources, with stable diagnostic classes. Rejected guest input must not produce an artifact.

## Edition-sensitive delimiter boundary

The closing `)` token ends an explicit `seq(...)` expression. A subsequent comma is owned by the **enclosing callable body**, whereas a bare `seq ...;` statement owns its commas through its own semicolon. Conflating these contexts can conceal the required version diagnostic.

```atto
// v1 accepted, strict v2 rejects with E_BODY_VERSION
fnc f() -> int seq(1, 2), 42 end

// v1 and v2 accepted
fnc f() -> int :: seq(1, 2), 42 end

// v1 and v2 accepted; no implicit return from the seq statement
fnc f() -> int seq 1, 2; return 42; end
```

The checker must not retry the v1 grammar silently in v2 or reinterpret the outer comma as belonging to the already-closed delimited sequence.

## Mandatory coverage matrix

| Domain | Positive cases | Negative/boundary cases |
| --- | --- | --- |
| Value | one item; nested `seq`; nested `(> ...)`; arithmetic precedence | empty; missing middle/tail; mistaken tuple |
| Lexing | multiline layout; whitespace and comments; a string containing commas | unmatched delimiters; `^^` vs `^`; `( >` vs contiguous `(>` |
| Calls | bare final argument; delimited first argument; nested call arguments | incorrect arity; accidental leakage of argument commas |
| Scope | nested shadowing; separate same-name scopes; outer mutable update | duplicate in same scope; inner-name escape; immutable assignment |
| Ownership | primitive result and legal borrow; move checked once | use after `take!`; escaped loan; unsupported owned tail; double cleanup |
| Effects | ordered stdout writes; pure local mutation | effectful step in `pure`; skipped expression; repeated side effect |
| Exit | explicit `return`/`^`; normal statement-discard behavior | return value mismatch; return inside expression position; unreachable tail |
| Async/failures | suspension/panic/propagation follows existing callable rules | cancellation/defer bypass; forbidden await/critical-section crossing |
| Safety | boundary-admitted item count; bounded nesting and guest memory | limit + 1; adversarial nesting; malformed token storm |
| Editions/format | v1 default and opt-in v2; formatting idempotent | implicit body-mode conversion; formatter changed guest bytes |

## Execution evidence contract

For **each** backend, each case needs: exact repository + commit SHA + full tree SHA,
language-version selector, compiler command, expected diagnostic/result, outcome
(`passed`, `failed`, `unsupported`, `not_executed`), guest execution receipt
when applicable, and formatter parse-equivalence evidence when formatting is in scope.

Do not collapse `unsupported` into `passed`. Host-structure checks and parser AST
tests cannot establish compiled execution. A native compiler and a Wasm compiler
producing identical guest bytes also does not prove LLVM, Java, .NET, Forge, or
any other backend. Keep each backend's admission independent until conformance runs.

### Initial coverage status

| Target | This hardening suite |
| --- | --- |
| `atto-source.rs` parser/checker | Not executed on the new audit branch |
| `atto-source.rs` native/Wasm guest | Not executed on the new audit branch |
| `atto-format` | Not executed against the new audit branch |
| `atto-source.llvm`, `.wasm`, `.java`, `.net`, `.forge`, `.cranelift`, `.js`, `.atto`, `.hdl` | Not executed |

Historical CI from integration PRs #86/#330/#12 remains useful **only for the
exact historical heads recorded in those PRs**; new audit commits need new receipts.
