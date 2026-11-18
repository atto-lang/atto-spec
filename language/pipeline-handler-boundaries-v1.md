# Pipeline exception and effect boundaries (v1 hardening)

**Status: proposed normative contract and regression target.** This document
extends [pipeline-failure-effects-v1.md](pipeline-failure-effects-v1.md) and
[pipe-observers-and-io-pipe-v1.md](pipe-observers-and-io-pipe-v1.md).
It does **not** assert a working continuous-transport ABI, general
`raise`/`panic` guest execution, or cross-backend parity.

## Four operators, two failure domains

| Form | Normal form | Failure jurisdiction |
| --- | --- | --- |
| `x |> f |> g` | `g(f(x))` | the active function call / lexical effect handler |
| `g <| f <| x` | `g(f(x))` | exactly the same as forward application |
| `source pipe transform pipe sink` | continuously directed source→sink graph | checked setup **and** checked asynchronous graph completion |
| `sink rpipe transform rpipe source` | same source→sink graph | exactly the same setup/completion and supervisor rules |

The spelling `<|` is the reverse functional application operator; `|<`
is never an alias. Functional `|>`/`<|` apply a **single value** per
expression. They do not create a pump, capture later asynchronous stage
failures, auto-unwrap `Result`, flatten `Option`, or invent a retry.

Evaluation is single-use and stage-ordered. For `x |> f |> g`, `f`
finishes (or exits abnormally) before `g` starts; no downstream
stage runs if `f` exits. `g <| f <| x` has the same runtime call order.
A stage's explicit additional argument expressions follow ordinary
function-call evaluation rules, with no extra evaluation introduced by
desugaring. Preserve ownership/moves, source positions and exception
provenance when lowering the AST.

Continuous graph *endpoint constructors* run once in **lexical order**,
even in `rpipe`, while DATA flows in the opposite (source-to-sink) order.
An exception during graph construction is a checked setup failure and
cannot leave a published half-graph, leaked capture, or detached worker.
Reversing graph spelling never reverses DATA, propagates exceptions into
a sink as ordinary values, or reorders constructor side effects.

## Exact exception handling jurisdiction

| Encountered outcome | `try/catch` | caller-side `trap` | `recover` | stage/graph boundary |
| --- | --- | --- | --- | --- |
| return `T` | no intervention | `Some(T)` | no intervention | ordinary value |
| return `Result.Err(E)` | **not** an exception | `Some(Err(E))` | **not** an exception | typed DATA unless explicitly propagated |
| return `Option.None` | **not** an exception | `Some(None)` | **not** an exception | typed DATA, not EOF |
| `throw Error` | nearest eligible catch | converts to `None` when it reaches this trap | not implicitly a raise | otherwise escalates per error contract |
| `raise Error` | bypasses | bypasses | nearest eligible recover | otherwise escalates; graph fails if stage exits |
| `panic Error` | bypasses | bypasses | bypasses | actor supervisor CONTROL; graph also settles on failure |
| cancellation | does not synthesize a throw | does not synthesize `None` | not a raise | typed cancellation and quiescence |

All `throw`, `raise`, and `panic` operands must satisfy the language's
existing appropriate `Error` capability requirement; non-Error payloads
are rejected statically. Only a handler **inside the execution boundary**
can turn a stage exception into a normal stage value. A caller's
`try/catch` or `trap` around construction may handle *synchronous*
construction throws, but never an independently scheduled later
stage failure. A stage-local eligible `recover` may resolve a `raise`
according to its existing rules; it must not resume an already-committed
item twice, rewind another actor, or intercept `panic`.

A stage with an unhandled ordinary `throw` follows the language's
`throw → raise → panic` escalation rule. Retain the **original**
cause, actor identity/generation, stage path, stack provenance, and
suppressed cleanup causes across conversions. The nearest eligible
handler is determined by lexical/dynamic effect scope, **not** by the
directional operator's text. `rpipe` gives no additional catch rights.

## Typed outcomes and the `?` operator

A composed function's effect requirements must include all actual
reachable stage effects (including closure captures and suspension);
a pure caller cannot hide `raise`, `panic`, I/O, or `suspends` merely by
placing an operation inside `|>`, `<|`, `trap`, or `rpipe`.
Unimplemented effect handling is `E_UNSUPPORTED` before guest emission,
not fake `Some`, `Ok`, EOF, or a successful pipeline handle.

`Result.Err(E)` and `Option.None` remain ordinary values in a
functional chain until explicitly handled or propagated. The `?`
operator exits the **enclosing callable/stage** on `Err` or `None`
according to its declared result type; it does not automatically turn
`Err` into `throw` or broadcast an error through graph DATA.
In `Stream<Result<T,E>>`, an `Err(E)` item is DATA; in
`Stream<Option<T>>`, `None` is DATA, never EOF.

Continuous construction produces checked
`Result<PipeHandle,PipeSetupError>`; its completion is checked by
`await handle.get_done(): Result<PipeStats,PipeError>` (candidate API).
Both paths must be deliberately consumed. `trap (graph construction)`
cannot catch later completion; `trap (await handle.get_done())`
still gives `Some(Err(PipeError))` for a normally returned error.
A `PipeError.StageFailure` preserves the exact originating effect,
stage and causal error, but is **not** a replacement supervisor notice.

## Graph termination, actor isolation and cleanup

1. On a terminal stage failure, fence new admissions; cancel or unwind
   graph-owned tasks; wake blocked readers/writers. Do not run a later
   transform for the failed item, auto-retry, or emit fake normal EOF.
2. Preserve the first terminal *pipe outcome* once. Later errors appear
   only as suppressed diagnostics. In-flight data retains linear
   ownership until admitted, returned or safely destroyed; publish
   completion only after the physical quiescence barrier.
3. An actor `panic` always sends its authenticated priority CONTROL
   notice to its supervisor, **even when cancellation or another graph
   failure won the PipeHandle terminal race**. Neither observer
   callbacks nor an unrelated actor's caller-side `trap` can intercept it.
4. `defer` cleanup follows the existing unwind contract; cleanup failure
   never replaces the original primary cause or delivers duplicate
   terminal events. A forced kill cannot claim cleanup that did not run.
5. All observer callbacks are passive. Their own
   throw/raise/panic follows the callback's execution context, never
   rewrites `get_done()` or suppresses supervisor CONTROL.

## Tests and merge criteria

The `tests/pipeline-effect-boundaries-reference.test.mjs` suite has
14 **host-only** executable regression cases covering forward/reverse
short-circuiting, trap/recover jurisdiction, Result DATA versus failures,
lexical constructor order, first-cause wins, quiescence and CONTROL after
cancellation. These model tests are not native Atto executions.

Before upgrading from candidate to implemented: reconcile functional
`<|` compiler PR #218 with directed `rpipe` PR #224; add parser,
type/effect checker, Rust/Wasm guest and actor-runtime execution tests
for all matrix rows; prove cross-actor authenticated supervisor notices
and once-only completion; require exact commit/tree SHA and jobs with
**executed steps**, not zero-step GitHub Actions failures. Other backends
require their own native receipts.
