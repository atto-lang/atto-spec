# Checked failure semantics across directional I/O and pipelines

**Status:** proposed normative error/effect contract. Supplements
[directed-rpipe-and-stream-capture-v1.md](directed-rpipe-and-stream-capture-v1.md),
[io-direction-shorthand-v1.md](io-direction-shorthand-v1.md), and
[typed-io-continuation-pipelines-v1.md](typed-io-continuation-pipelines-v1.md).
Align with the separate actor escalation, throwable-capability, and
caller-side `trap` draft specifications before merging. This is not
a claim of executable mixed-pipe error handling or backend parity.

## Distinguish VALUE, OPERATION and GRAPH error domains

| Operator | Cardinality | Success | Checked failure |
| --- | --- | --- | --- |
| `sink << value` | one write | typed single-write acknowledgment | the sink's typed I/O `Err` (including closed/cancelled where applicable) |
| `source >> val x` / `val x << source` | one read | one checked read result; EOF remains explicit | typed `Err` rather than silent `None` |
| `value |> f` / `f <| value` | one application | exactly one `f(value)` evaluation | effect and `Result/Option` semantics of `f`, no implicit flattening |
| `source pipe sink` | continuous left→right | owned structured graph | checked setup/completion failure |
| `sink rpipe source` | continuous right→left | identical directed graph contract | same failure behavior as `pipe`, no special reverse exception semantics |

`|<` is NOT the reverse functional spelling; `<|` is.
A `pipe` or `rpipe` never iterates by repeatedly evaluating
`<<` / `>>` in user syntax, and none of these symbols silently
create a detached task.

Single-value `val result: T << transform <| susp ... <| future`
is the established **checked terminal capture** context: it does
not write into a Writable or pump a stream.

## Explicit outcome channels and `?`

The target checked setup contract is `Result<PipeHandle,PipeSetupError>`
(or an equivalent explicitly typed checked effect when formally resolved).
The outcome must be consumed, pattern-matched or propagated; constructing
a pipeline as an ignored expression statement must not silently discard a
failed setup. After connection admission, `get_done()` reports
`Result<PipeStats, PipeError>` with explicit terminal categories.

```atto
// Illustrative target syntax; not executable in current browser compiler:
val connection = (readable pipe transform pipe writable)?;
val stats: PipeStats = (await connection.get_done())?;

// Reverse declaration, same graph:
val reverse_connection = (writable rpipe transform rpipe readable)?;
```

`?` propagates `Result.Err` or `Option.None` along a compatible
enclosing function/effect. It does not turn an ordinary `Err` into
a `throw`, `raise`, or `panic` by default. A transform returning
`Result<O,E>` can intentionally emit an `Err(E)` **as stream DATA**
if the actual item type is `Result<O,E>`. If a stage uses `?` to exit
its execution instead, its checked failure belongs to the stage lifecycle,
not automatically to the DATA stream. No implicit `filter_map`,
flattening, EOF conversion or error swallowing is permitted.

`Option.None` **inside** `Stream<Option<T>>` is an ordinary
payload, distinct from the stream's EOF terminal event. A read that
can reach EOF should use the source's explicitly declared checked
outcome, typically `Result<Option<T>,IoError>`. Do not treat
`None` as an `IoError`, an empty value or an automatic retry.

## `trap` only catches ordinary `throw`

Existing caller-side contract:

```atto
trap expression : Option<T>
```

- A successful expression `v:T` becomes `Some(v)`.
- An **ordinary throw** that reaches this caller-side trap becomes
  `None`. Only the ordinary throw channel is handled.
- `trap` NEVER implicitly catches or suppresses `raise`, `panic`,
  cancellation, host failure, fatal engine trap or a supervisor CONTROL notice.
- `trap` does NOT catch a returned `Err(E)`; `trap f()` where
  `f():Result<T,E>` yields `Option<Result<T,E>>`. In particular,
  `Some(Err(e))` and `None` are distinct.
- `trap` is not a lossy alias for `?`; choose explicitly between
  `Option`, `Result`, a `try/catch`, and a supervisor fault.
- It evaluates its operand once. An ordinary throw leaves the resource
  cleanup defined by normal unwinding; trapping must not leak a half-open
  pipe or release the same message twice.

Trapping pipeline **construction** only handles an ordinary throw in
that synchronous setup. It cannot retroactively trap asynchronous
element processing or a later failure reported by
`await connection.get_done()`. Because the latter is a Result,
`trap await connection.get_done()` is
`Option<Result<PipeStats,PipeError>>`, and a normal returned
`Err(PipeError)` remains wrapped in `Some(Err(...))`.

To turn an `Err` into `None`, write an explicit `match` or
`Result`→`Option` conversion. Never make `trap` silently do this.

## `throw`, `raise`, `panic` are not interchangeable

- **throw**: ordinary `Error & Throwable` failure; nearest eligible
  `try/catch` or caller-side `trap` may handle it. An unhandled throw
  follows the documented escalation path rather than being silently
  converted to an ordinary `Err` DATA element.
- **raise**: `Error & Raisable` failure; bypass ordinary
  `try/catch` and `trap`, perform eligible `defer/recover`,
  then escalate if not recovered.
- **panic**: `Error & Panicable` terminal failure; no actor can
  intercept its own panic. The parent supervisor receives an
  authenticated priority CONTROL notice; this is NOT a stream DATA event,
  not an `Err` emitted into `Stream<Result<T,E>>`, and not a
  return value from an unrelated actor's callback.
- Unhandled `throw → raise → panic` escalation must retain the
  original error identity, provenance, actor/generation and causal
  metadata. A transform's terminal failure must also settle its
  owning `PipeHandle` exactly once.
- Cancellation is a typed lifecycle outcome (and possibly a
  supervisor shutdown event), NOT synthesized `panic` or `throw`.
  Forced process termination may prevent guest `defer` execution;
  the runtime cannot claim otherwise.

These clauses are effect/capability checked on the **actual stage
implementation**, not guessed from a lambda name or from `rpipe`
direction. `trap` cannot authorize an illegal effect or bypass the
`suspends` requirement for `await`/bounded backpressure.

## Cleanup, ordering, actor boundaries

1. If graph setup fails, no edge is published and no orphan pump
   remains. An inline `Stream<T>` binder is visible only after
   successful setup/checked propagation; it must not expose a dangling
   readable view after a failed connection.
2. Exactly one lifecycle completion occurs per graph. Failure after
   partial admission preserves committed messages and returns checked
   partial progress; there is no hidden retry/broadcast or duplicate
   error delivery.
3. A bounded sink's backpressure suspends cooperatively; cancellation,
   failure and EOF wake blocked readers/writers. A stream item remains
   linear/owned until its checked transfer/rollback completes.
4. Cross-actor exceptions are not caught by arbitrary parent
   `try/catch` or `trap`; they use authenticated supervisor
   notices, with origin/generation and replay protection.
5. The pipe handle may report a failure in a typed `PipeError`
   independent of the supervisor CONTROL path. The presence of that
   checked observer does **not** authorize swallowing the underlying
   terminal `panic` or duplicating delivery.
6. The compiler may not synthesize a fake normal Result or Option
   merely because a runtime or backend lacks throw/raise/panic or
   pipe transport. The unsupported feature fails before guest emission.

## Required backend-neutral conformance

Positive and negative executions must cover ordinary value, `Result.Err`,
`Option.None`, EOF, I/O error, closed sink, admission error, stage
`throw`, stage `raise`, stage `panic`, cancellation, supervisor
CONTROL, partial progress, and exhausted backpressure across:
`<<`, `>>`, `|>`, `<|`, `pipe` and `rpipe`.

Assertions include `Some(Err(e)) != None`, `None` stream payload
`!=` EOF, one-time evaluation, no observable guest artifact for
unsupported combinations, exact distinct failure categories, no
double resume/throw/finish, and source-order versus actual dataflow
order when `rpipe` constructs side-effectful endpoints.

The current Rust/Wasm browser compiler can admit some parser and
static role/type contracts but **does not execute mixed graph transport,
general source raise/panic, or generic typed I/O**. Node reference
models and Rust syntax tests may verify only their stated layer;
they are not execution receipts for Atto guest code or other backends.

## Lifecycle observers and io.pipe

The optional terminal observer, PipeHandle.on(#event, callback), and
checked io.pipe(source, sink) are specified in
[pipe-observers-and-io-pipe-v1.md](pipe-observers-and-io-pipe-v1.md).
Observers cannot consume DATA or CONTROL, suppress a get_done() failure,
or replace mandatory checked setup and completion results. A late #error
subscription must replay the terminal outcome exactly once; an inline
observer is installed before activation.
