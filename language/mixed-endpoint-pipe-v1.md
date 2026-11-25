# Mixed-endpoint continuous `pipe` (AttoLang design contract v1)

**Status:** accepted language direction, proposed normative contract; implementation is partial. This document supersedes the continuous-I/O interpretations of `>>` and `<<` in `endpoint-io-piping-v1.md`. It does not assert executable compiler/runtime/backend parity.

## Operator boundary

| Operator | Contract |
| --- | --- |
| `source >> val binding`, `val binding << source` | Exactly one checked read |
| `sink << value` | Exactly one checked write |
| `value |> callable`, `callable <| value` | Functional application, never a stream pump |
| `source pipe sink` | A continuous connection flowing LEFT to RIGHT |
| `sink rpipe source` | A continuous connection flowing RIGHT to LEFT |
| `spawn A() pipe spawn B()` | Existing actor pipeline, now a specialization of the same connection model |

`source >> sink` and `sink << source` MUST NOT be interpreted as continuous pumping. They are invalid unless the right/left side is a legal single-value operation. No `|>>` / `<<|` continuous operators are introduced.

## Examples (target language, not yet executable on the Rust/Wasm browser compiler)

```atto
val channel = Channel<Reading>.bounded(32);
val connection = spawn Sensor() pipe channel;
channel >> val received;

val stream_link = readings pipe spawn Analyzer();
val generator_link = generator pipe channel;

val chain = spawn Producer()
    pipe Stream.buffered<int>(32)
    pipe spawn Consumer();
```

An actor's *pipeline source* is its explicit `emit(T)` event stream. Its ordinary `ActorRef.send`, unary request replies, and authenticated priority supervisor CONTROL messages are separate. An actor pipeline sink accepts `T` via its typed `receives` mailbox contract. `sends` describes a broader outbound effect, not the set of emitted pipeline values.

## Actor declarations and pipe roles

Actor pipe source/sink capabilities are based on **declared** `emits T` and `receives T`, not arbitrary method signatures or calls to `send`. See the normative [actor pipe port declarations contract](actor-pipe-port-contracts-v1.md). A `receives I emits O` actor derives both roles and the `PipeTransform<I,O>` capability; no manually written transform interface is required. The current Rust frontend's inferred `emit` type is transitional and is not an authorization for mixed endpoint attachment. Supervisor CONTROL, unary replies, and other outbound sends remain separate.

## Static endpoint capabilities

Core language or compiler-recognized contracts:

```atto
interface PipeSource<T> {}
interface PipeSink<T> {}
```

- `ActorRef<A>`: `PipeSource<T>` only when `A emits T` is declared and checked against `emit(T)`; `PipeSink<U>` only when `A receives U` is declared and backed by the typed receive handler. Combined declarations imply `PipeTransform<U,T>`. Ordinary sends never infer a pipe source.
- `Channel<T>`: both source and sink. A shared channel does not become exclusively owned by merely connecting it.
- `Stream<T>`: source only, unless using a distinct writable port/sink. `Stream.port<T>(capacity)` exposes separate writable and readable capabilities.
- `Generator<T>` and `AsyncGenerator<T>`: source only, with one consumer by default.
- Writable transport/stream sink: sink only, subject to declared item type and effects.
- Pipeline adapters may expose both input sink and output source if their semantics explicitly permit onward chaining.

The compiler must check every adjacent `PipeSource<T> pipe PipeSink<T>` edge, including type compatibility, `Sendable`/ownership domain transfer, effects, and capabilities. An actor may independently have one supervisor and many downstream pipeline peers. Multiple downstream peers must be explicit; `pipe` does not imply broadcast. Type inference never creates an implicit channel, async task, serializer or element conversion. An actor-to-actor edge keeps the legacy explicit-spawn form valid.

## Initial typed adapter constructor profile (browser frontend; no guest runtime)

The narrow Rust/Wasm browser frontend can recognize these **type-checked, fail-closed** forms as direct `pipe` stages, currently with `T` limited to `int` and `bool`:

```atto
spawn Sensor() pipe Channel<int>.bounded(16);
spawn Sensor() pipe Stream.buffered<int>(16) pipe spawn Consumer();
spawn Sensor() pipe Stream.port<int>(16).sink();
Stream.port<int>(16).stream() pipe spawn Consumer();
```

- `Channel<T>.bounded(capacity)` is a duplex pipe stage (`PipeSink<T>` and `PipeSource<T>`).
- `Stream.buffered<T>(capacity)` is an explicit buffered graph adapter with both input and output capabilities. The resulting readable view belongs to the structured connection.
- `Stream.port<T>(capacity).sink()` is **write-only**; it cannot be an internal transform/source stage or a readable stream.
- `Stream.port<T>(capacity).stream()` is **read-only**; it cannot be a sink. Creating a port and its two views should normally be done once and retained; independently constructing the two views does not magically pair them.
- The browser frontend's capacity must be a compile-time nonnegative integer literal in `0..=4096` (zero gives rendezvous semantics). These restrictions are staging limits, not a global upper bound for all AttoLang targets. Capacity allocation remains **unimplemented** in this compiler.
- Static validation checks each actor's declared `receives` / `emits` role and every adjacent known item type. A syntactically recognized but not-yet-resolved general endpoint is *not* inferred to be an untyped `Any` source/sink and never grants executable guest behavior.
- The parser and checker must still return `E_UNSUPPORTED` for a graph with valid static roles, pending actual `PipeHandle`, capability lifetimes, typed stream/channel allocation, backpressure and guest scheduler/transport ABI. These constructor expressions also fail closed when evaluated outside a pipe.

The compiler source-only reference-model test suite `tests/pipe_contract_reference.mjs` checks bounded transport behavior, while `src/pipe_contract.rs` validates graph role/type admission. Neither proves Atto compiled guest transport.

## Execution and lifecycle

- `source pipe sink` is **one connection expression**, not a loop of syntax-level single-read operators. Evaluate endpoint operands exactly once in their lexical order; acquire and validate capabilities before publishing the graph.
- On successful checked setup, start a **supervised, structured**, asynchronously progressing connection and return an owned `PipeHandle` (or a typed composite with equivalent lifecycle). Setup errors must be observable.
- `await connection.get_done()` reports checked completion, read/write/cancellation errors and partial committed progress; the exact error type is a runtime integration task. Dropping the last owning handle cancels the connection; explicit ownership transfer to an actor supervisor can extend lifetime.
- Preserve per-source order and whole-message boundaries. In the default unicast form every emitted element is admitted **at most once** and in order; no retry-driven duplicate sends or accidental broadcast. An acknowledgment means sink admission, not completed consumer processing.
- Backpressure is mandatory for bounded consumers. At most one unresolved transfer per edge by default; do not read ahead indefinitely or silently grow an unbounded buffer. An actor `emit` must suspend cooperatively when its downstream capacity is exhausted. No OS thread parking.
- Normal producer completion drains admitted elements, then marks owned adapters EOF. It does not automatically close shared channels, borrowed streams, stdio, or other externally owned endpoints.
- Cancellation and failures propagate to the pipeline's checked outcome and the relevant actor supervisor notice without leaking ordinary CONTROL messages into the data stream. Previously committed items remain committed. Atomic transfer and ownership of uncommitted payloads must be specified.
- Joining a stage to a running graph requires an explicit ownership-safe reconfiguration operation; static `pipe` composition does not mutate arbitrary unrelated connections.

## Syntax and precedence

```ebnf
pipe_expression = forward_pipe_expression | reverse_pipe_expression ;
forward_pipe_expression = pipeline_operand, { "pipe", pipeline_operand };
reverse_pipe_expression = pipeline_operand, { "rpipe", pipeline_operand };
pipeline_operand = spawn_expression | endpoint_expression | contextual_stream_capture ;
```

`pipe` connects each left stage into the right stage, whereas `rpipe`
connects each right stage into the left stage. Do not treat `pipe` as
bidirectional or direction-inferred. In-pipeline `Stream<T>` declarations,
owned graph lifetimes, and reverse-order stage validation are separately
specified in [directed-rpipe-and-stream-capture-v1.md](directed-rpipe-and-stream-capture-v1.md).
That extension is still a **draft, non-executable candidate**.

`pipe` is a keyword, not an overloadable binary function. It binds more loosely than member access, constructors and function application. A complete chain is **one owned connection graph**, not several separately spawned discarded `PipeHandle` values. If actor-only legacy `|` is supported, it is accepted **only between explicit spawned actor stages**, not for channel/stream mixing, and the formatter should canonicalize actor pipelines to `pipe`.

Do not interpret `a pipe b` as a pure transformation (`|>`), one I/O operation (`<<` / `>>`), numeric shift, boolean OR, or supervisor link.

## Required conformance cases

1. Parse and check actor→actor, actor→channel, actor→stream-port, stream→actor, channel→actor, generator→channel and a three-or-more-stage mixed graph.
2. Reject wrong element types and missing `PipeSource/PipeSink` capabilities; reject actors with no suitable `emit` or `receives`, and reject use of ordinary `send` as an inferred pipeline output.
3. Reject malformed/literal stages, invalid `|` aliases, repeated/duplicated consumed generator ownership, wrong effects, and exceeds-stage-budget graphs.
4. Verify exact-once ordered transfer with 0/1/N items, EOF, single-slot and zero-capacity backpressure, cancellation during a pending write, and producer/consumer failure with partial progress.
5. Prove supervisor CONTROL isolation, no accidental broadcast to multiple sinks, no automatic close of external channels, and task/handle cleanup under panic, drop and cancellation.
6. Prove `readable >> val x` and `sink << x` remain single operations and `|>` / `<|` remain callable application.
7. Build and run true compiled guests with the native and Wasm compilers, then independent browser, Java, LLVM, .NET and other backend receipts as applicable. Record source-head/tree SHA and nonzero runner steps; grammar or reference-model tests are not guest execution.

## Current implementation boundary

The stacked Rust/Wasm compiler patch on `atto-source.rs` extends the parser AST to `MixedPipeline` and preserves checked actor-to-actor segments. It returns `E_UNSUPPORTED` for mixed pipelines because `Channel<T>`, `Stream<T>`, `AsyncGenerator<T>`, typed `PipeSource/PipeSink`, structured `PipeHandle` and in-guest transport ABI are not yet implemented. Existing actor-only `pipe` checks also remain staged. Do not promote parser recognition to a release support claim.
