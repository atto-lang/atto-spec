# Trap-to-Result typing and ordinary throw capture v1

**Status:** normative language contract; executable compiler/backend support must be proven separately. Supersedes any earlier `trap`-to-`Option` description. The Rust/Wasm draft compiler now executes a **bounded** Result/Error subset (int, Option<int>, void and existing Result<...,Error>) with exact-tree guest validation on PR #275; generic error joins, Error subclasses, actors, remaining backends and publication are **not** thereby certified.

## Source spelling and migration

New canonical Atto source uses `trap! expression` and `throw! Error(...)`; `raise!` and `panic!` use the same contiguous exceptional-keyword suffix. This spelling amendment preserves type/effect checking, original error identity and cleanup. Bare forms and older examples remain migration-compatible. See [exception-control bang spellings v1](exception-control-bang-spellings-v1.md). Non-Error trait-conforming payloads are separately gated by the [November 23 decision](cross-backend-semantics-reconciliation-v1.md#errors-macros-and-pipelines); the Error-based trap profile here is unchanged. Historical fixtures remain pinned.

## Meaning

`trap expression` evaluates its operand exactly once and catches **only ordinary source `throw`** at that expression's dynamic caller-side trap boundary. It converts that caught Error (preserving its type, payload and identity) into `Err(error)`. It never invents `None`, discards an `Err`, or catches a source `raise`, `panic`, authenticated cancellation, host failure, OOM, or fatal WebAssembly trap. Existing ordinary catch-vs-recover precedence across the full call chain remains in force.

`Err` is a returned value, not an exception. `None` is absence, not an exception. A function can return either without invoking the trap handler.

## Checked unwrap failures (proposed November 25 amendment)

The built-in `Option<T>.unwrap()` returns the Some payload, and `Result<T,E>.unwrap()` returns the Ok payload. On None or Err, respectively, these operations issue an ordinary guest Throw, not a Panic. Consequently `trap! option.unwrap()` and `trap! result.unwrap()` produce a checked Result. This changes the historical unwrap-panic contract; preserve historical receipts, but do not use them as current conformance expectations.

Proposed nominal Error subtype names are `OptionUnwrapError` and `ResultUnwrapError`. A Result unwrap failure must retain the original E payload (including non-Error values, and object identity for reference values) in its typed error representation, without stringification or unsafe alias transfer. The representation and stable ABI codes require shared registration before backend publication. A backend unable to represent this contract must fail closed. Neither failure is a host exception, fatal machine trap, cancellation, raise, or panic. Outside a trap/catch the ordinary unhandled-Throw escalation policy applies. The existing effect checker must account for the possible Throw unless sound flow/ownership analysis proves success. This amendment never authorizes trapping arbitrary panic, host fatal, or cancellation.

The operand executes once. `trap! None` (with a known Option type) returns Ok(None), and trapping an existing Err returns that Err unchanged; neither performs unwrap. A trapping unwrap whose success payload itself has Result type follows the existing one-layer result-aware trap rule. Both trap spellings remain equivalent.

For an inline `sync task<T>`, an escaping unwrap Throw reaches the dynamically enclosing caller trap after normal exceptional cleanup. No new scheduler identity, implicit rollback, retry or cancellation is introduced. Effects already performed remain visible according to the language's ownership/writeback rules; later statements do not execute. For an independently scheduled task, test the ordinary error at the actual join/await boundary separately; do not turn terminal task failures into ordinary errors. Optimizations may eliminate checks only with a stable proof, including guard narrowing, alias mutation, task writeback and suspension invalidation.

### Pipelined typed match (November 26 user decision)

```atto
declare type Bounded = int where self >= 1 and self <= 42;

pub fnc main() -> int {
    val Option<int> x = None;

    return trap! x.unwrap() |> match<int>  over
        on Ok(n): int -> n,
        on Err(): int -> 42,
    end;
}
```

The exact source is a required positive fixture returning 42. The `declare type` refinement declaration is admitted in addition to the already-supported bare declaration spelling. Its presence does not refine unrelated int expressions. A typed subjectless match stage takes the preceding pipeline value, evaluated once, as its subject. The parse is `(trap! x.unwrap()) |> match<int> over ... end`: trap ends before entering the match arms. An ordinary throw in the selected arm is not caught by that upstream trap; panic/raise/cancellation remain terminal according to their own rules. Only the selected arm runs. `match<int>` denotes the arm result type, not the subject type; `Err()` discards its payload without changing its type or weakening ownership rules. Require positive None and Some (distinct fallback), bare trap migration spelling, effectful receiver evaluated once, arm throw outside the upstream trap, and rejection of wrong receiver/arity or nonexhaustive/ill-typed match. Compile-time folding is valid only if all observable effects and cleanup are preserved. Parser/host-only evidence does not establish backend parity.

### Required compiled guest cases (authored expectations, not executed evidence)

```atto
fnc and_case(bool run): int {
    let int count = 0;
    let Option<int> state = None;
    val bool result = run && sync task<bool> {
        count = count + 2;
        state = Some(40);
        return true;
    };
    if run do
        guard result, state.is_some() { return 1; }
        return count + state.unwrap();
    fi
    guard !result, state.is_none() { return 2; }
    return count + 42;
}
```

Both calls return 42, but also use separate observable counters to establish that the false path never executes the task and the true path writes back exactly once. The original source alone cannot distinguish all incorrect implementations from the final scalar result.

```atto
fnc unwrap_case(bool present): Result<int, Error> {
    let Option<int> state = None;
    if present do
        state = Some(42);
    fi
    return trap! state.unwrap();
}
```

| Case | Expected |
| --- | --- |
| Some(42).unwrap, Ok(42).unwrap under trap | Ok(42) |
| runtime None.unwrap under trap | Err with Option unwrap identity |
| runtime Err.unwrap under trap | Err with Result unwrap identity and original E |
| trap without unwrap on None / existing Err | Ok(None) / unchanged Err |
| inline task with dynamic None.unwrap | outer trap Err; cleanup once; no post-failure work |
| nested traps and subsequent independent traps | correct one-layer Result and handler retirement |
| short-circuited RHS containing unwrap or task | no evaluation, no failure or side effect |
| unwrap failure with defer/finally | exact cleanup order, original error unless existing cleanup precedence supersedes |
| explicit panic, raise, cancellation and host fatal | bypass trap unchanged |
| incompatible trap error join / invalid unwrap receiver | semantic rejection, no artifact |

Require compiled .atto guest receipts on Java JVM and Native Image, .NET CoreCLR and NativeAOT, LLVM native, Wasm, Rust, Forge/Cranelift and JS where applicable. Do not count parser rejection, host-model assertions, historical panic fixtures, or zero-step CI as success. Reconcile [historical conformance #446](https://github.com/atto-lang/atto-platform-conformance/pull/446), [v5 #520](https://github.com/atto-lang/atto-platform-conformance/pull/520) and [Java #1177](https://github.com/atto-lang/atto-source.java/pull/1177) explicitly before promotion.

## Static result type

Let `F` denote the statically permitted ordinary thrown Error type of the operand (normally `Error`, or a narrower declared `throws(F)` upper bound). Let `join_error(E,F)` be a type able to represent *both* returned `Err(E)` values and caught `throw(F)` values without losing their discriminants or payloads.

| Operand expression type | Type of `trap expression` |
| --- | --- |
| `T` (not `Result`) | `Result<T,F>` |
| `Option<T>` | `Result<Option<T>,F>` |
| `Result<T,E>` | `Result<T,join_error(E,F)>` |
| `Result<Option<T>,E>` | `Result<Option<T>,join_error(E,F)>` |
| `void` | `Result<void,F>` |

If `E` already accommodates `F`, `join_error(E,F) = E`. In particular `Result<T,Error>` remains `Result<T,Error>` when catching a subtype of `Error`. A compiler may select a safe, explicitly defined union/sum or common Error supertype only when all `E` and `F` values remain representable. **Do not silently coerce a non-Error error such as `String` into `Error`, drop the original `E`, or erase an Error subtype.** If the join cannot be represented in the target type system, emit a deterministic `E_TRAP_ERROR_JOIN` (no generated artifact) and require an explicit user conversion. No premature `Result<T,Error>` promise for `Result<T,String>` unless a representation is defined.

The `trap` operator is *one-layer result-aware*, not a recursive flattening operation. An expression deliberately returning `Result<Result<T,E1>,E2>` retains the inner `Result` as its success payload. Do not erase intentional nesting, `Option` layers, or `Future` layers.

## Observable semantics

```atto
fnc checked_id(int id): Result<int, Error> {
    if id < 0 then
        return Err(Error("negative id"));
    fi
    return Ok(id);
}

fnc checked_or_throw(int id): Result<int, Error> throws Error {
    if id eq 13 then
        throw Error("unexpected id");
    fi
    return checked_id(id);
}

val good: Result<int, Error> = trap checked_id(5);         // Ok(5)
val rejected: Result<int, Error> = trap checked_id(-1);   // Err(Error("negative id"))
val thrown: Result<int, Error> = trap checked_or_throw(13); // Err(Error("unexpected id"))
```

The last two have the same container but distinct origins; neither may be translated into `None`.

```atto
fnc maybe_user(int id): Option<User> throws Error { /* body */ }
val found: Result<Option<User>, Error> = trap maybe_user(1);
// Ok(Some(user)), Ok(None), or Err(error); never Option<Option<User>>
```

With `Result`-returning operands, `trap` preserves returned `Err` objects unchanged and returns existing `Ok` values unchanged. With non-`Result` operands, normal completion becomes `Ok(value)`. Only caught ordinary throws become `Err(error)`.

`trap` does not implicitly unwrap or propagate: `(trap f())?` explicitly propagates the outer `Err` using the existing `?` rules. Pattern matching must support `on Ok(...)` and `on Err(...)`; `on Some`/`on None` do not match the outer `trap` result.

## Cleanup-aware propagation and caught Error identity

A `?` on `Result<T,E>` propagates the **original tagged Err handle** when
the expression is `Err`; `?` on `Option<T>` propagates the original `None`.
This is a **function return**, not a source `throw`: ordinary `catch` and
`recover` handlers are not invoked for a returned `Err`.

If the function has dynamically registered `defer` callbacks and/or active
`try/finally` scopes, the failed `?` must traverse the **same cleanup exit**
as an explicit return, preserving the exact Error/Result identity. Nested
`finally` scopes execute **inner to outer**, followed by registered `defer`
callbacks **LIFO**, each exactly once. A defer registration that the program
has not executed yet must not run. Error propagation must close any owned
iterator/continuation resources required on early return and restore
compiler-managed exception handler depth.

While the pending-outcome replacement semantics for an implicit early return
*inside* `defer`, `recover` or `finally` are not specified, a backend must
reject such `?` use deterministically rather than silently discard an existing
throw, raise, panic or pending return. That restriction is **not** permission to
reject ordinary `?` in a function containing cleanup.

A typed `catch (Error e)` binder denotes the **original caught Error object**
(including its subtype, payload and identity), not a new Error constructed
from the same message. The binding is scoped to the catch handler. A separate
Error object with identical message text must not compare as object-identical.
An implementation may expose a dedicated identity-testing builtin for
conformance; its name does not change the core value-vs-reference equality
contract.

A nested `trap` must never leak an active ordinary-throw handler after an
early return or non-ordinary unwind. `raise`, `panic`, host faults and other
exception tags bypass ordinary capture; rethrowing an escaping exception must
preserve its tag and payload. The next independent recover/supervisor decision
must observe the correct handler state.

## Required negative tests and versioning

1. Positive: scalar, void, Option, Result and nested `Result<Option<...>>` normal and error paths; single evaluation; object identity and precise Error subtype retained.
2. Negative: no `Some(Ok(...))`, `Some(Err(...))`, or `None` outer outcome from `trap`; no `Result<Result<...>,...>` accidentally introduced for an already-Result expression; reject impossible error joins (`E_TRAP_ERROR_JOIN`) without emitting code.
3. Negative: raise, panic, cancellation, host faults and traps bypass `trap`; non-Error throw is statically rejected; no runtime catch-all or hidden JS fallback.
4. Differential guest tests on each claimed backend, with exact source SHA/tree and positive/negative actual execution receipts. A parser-only or host-model test is **not** guest conformance.
5. Until a backend implements these rules, **fail closed as unsupported** for `trap` rather than emit the obsolete `Option` behavior. Do not publish a replacement compiler binary or re-label a preview as executable without a reviewed release and guest ABI verification.

Migration: replace `Option<Result<T,E>> = trap f()` with a correctly joined `Result<T,E'>`; change outer `Some`/`None` matching to `Ok`/`Err`; keep any legitimately returned inner `Option` layers. Existing binaries exposing the legacy type require an explicit versioned compatibility boundary, not silent reinterpretation.
