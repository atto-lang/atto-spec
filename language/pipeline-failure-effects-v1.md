# Checked failure semantics across directional I/O and pipelines

**Status:** proposed normative error/effect contract. Supplements
[directed-rpipe-and-stream-capture-v1.md](directed-rpipe-and-stream-capture-v1.md),
[io-direction-shorthand-v1.md](io-direction-shorthand-v1.md), and
[typed-io-continuation-pipelines-v1.md](typed-io-continuation-pipelines-v1.md).
For proof-oriented static obligations see [pipeline-effect-proof-v1.md](pipeline-effect-proof-v1.md).
Java-style signature `throws(Error)` and attached `@throws(Error)` have identical
semantic obligations; see [checked-throws-annotation-v1.md](checked-throws-annotation-v1.md).
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

## `trap` preserves failures as `Result` (updated contract)

The newer [trap-to-Result contract](https://github.com/atto-lang/atto-spec/blob/feat/trap-result-contract-20261117/language/trap-result-v1.md) (atto-spec PR #71)
**supersedes** the earlier `trap -> Option` proposal in this draft.
The language semantics are:

| Operand type | `trap expression` type |
| --- | --- |
| `T` | `Result<T,F>` |
| `Option<T>` | `Result<Option<T>,F>` |
| `Result<T,E>` | `Result<T,join_error(E,F)>` |
| `void` | `Result<void,F>` |

`F` is the statically possible ordinary thrown Error type.
`join_error` must represent both returned `Err(E)` and caught
`throw(F)` **losslessly**, without inventing a nested outer Result,
discarding an Error subtype, or converting an arbitrary `E` to
`Error`. Reject unavailable joins with `E_TRAP_ERROR_JOIN` and emit
no guest. The bounded Rust/Wasm candidate currently admits only
concrete proven joins.

- Success returns `Ok(v)` (or preserves the original `Ok` when
  the operand was already a Result); a returned `Err(e)` stays
  `Err(e)`, retaining error identity, type, and payload.
- Only an ordinary source `throw Error` crossing the trap boundary
  becomes `Err(original_error)`. The operand is evaluated once.
- `raise`, `panic`, cancellation, host faults, engine traps, and
  supervisor CONTROL **bypass** `trap`.
- `trap` does not transform a later asynchronous pipeline failure into
  the construction-time Result. The caller still owns and must handle
  `await handle.get_done()` independently.
- `(trap f())?` is explicit Result propagation. A returned `Err`
  is **not** a source exception, and cannot run `catch`/`recover`.
  The `?` exit must run proven cleanup, preserve original tagged
  Error/Result identity, and not be allowed inside unproven
  `defer`/`recover`/`finally` replacement paths.

Example target syntax (not proof of mixed-pipe runtime support):

```atto
val setup = trap (readable pipe transform pipe writable);
// setup is a checked Result, not Option and not a live-graph completion.
val connection = setup?;
val stats = (await connection.get_done())?;
```

Legacy `Option<Result<T,E>>` / `Some(Err(e))` / `None` descriptions
of `trap` must not be used in new compiler lowering, fixtures, or docs.
`Option.None` remains distinct from stream EOF and from `Err`.

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

Assertions include `Ok(None) != Err(error)`, `None` stream payload
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
