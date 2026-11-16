# Mixed-endpoint continuous `pipe` (AttoLang design contract v1)

**Status:** accepted language direction, proposed normative contract; implementation is partial. This document supersedes the continuous-I/O interpretations of `>>` and `<<` in `endpoint-io-piping-v1.md`. It does not assert executable compiler/runtime/backend parity.

## Operator boundary

| Operator | Contract |
| --- | --- |
| `source >> val binding`, `val binding << source` | Exactly one checked read |
| `sink << value` | Exactly one checked write |
| `value |> callable`, `callable <| value` | Functional application, never a stream pump |
| `source pipe sink` | A continuous connection between typed endpoints |
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

## Static endpoint capabilities

Core language or compiler-recognized contracts:

```atto
interface PipeSource<T> {}
interface PipeSink<T> {}
```

- `ActorRef<A>`: `PipeSource<T>` if `A` has a statically checked homogeneous `emit(T)` output contract; `PipeSink<U>` if `A receives U`. A source actor cannot be inferred from ordinary sends.
- `Channel<T>`: both source and sink. A shared channel does not become exclusively owned by merely connecting it.
- `Stream<T>`: source only, unless using a distinct writable port/sink. `Stream.port<T>(capacity)` exposes separate writable and readable capabilities.
- `Generator<T>` and `AsyncGenerator<T>`: source only, with one consumer by default.
- Writable transport/stream sink: sink only, subject to declared item type and effects.
- Pipeline adapters may expose both input sink and output source if their semantics explicitly permit onward chaining.

The compiler must check every adjacent `PipeSource<T> pipe PipeSink<T>` edge, including type compatibility, `Sendable`/ownership domain transfer, effects, and capabilities. An actor may independently have one supervisor and many downstream pipeline peers. Multiple downstream peers must be explicit; `pipe` does not imply broadcast. Type inference never creates an implicit channel, async task, serializer or element conversion. An actor-to-actor edge keeps the legacy explicit-spawn form valid.

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
pipe_expression = pipeline_operand, { "pipe", pipeline_operand };
pipeline_operand = spawn_expression | endpoint_expression ;
```

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
