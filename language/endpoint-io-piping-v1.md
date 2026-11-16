# Endpoint-to-endpoint I/O piping — superseded draft

**Status: superseded by [mixed-endpoint-pipe-v1.md](mixed-endpoint-pipe-v1.md).**

This historical candidate previously proposed using `source >> sink` or `sink << source` to pump an entire stream. **That proposal is rejected.** Those two single-I/O operators are not whole-stream piping operators.

## Accepted replacement

```atto
// Exactly one checked read
source >> val item;
val item << source;

// Exactly one checked write
sink << item;

// A continuous source-to-sink connection
val connection = source pipe sink;

// Actor to actor, channel, stream or generator integration
val messages = spawn Producer() pipe channel;
val stream_link = generator pipe channel;
val actor_link = stream pipe spawn Consumer();
```

Only the `pipe` keyword creates a continuous pipeline. `|>` and `<|` remain functional application, distinct from `pipe` and from single I/O. Actor-generated values enter a pipe only via the actor's explicit `emit(T)` output contract.

The earlier proposal's bounded buffering, backpressure, ordered transfer, EOF, cancellation, error propagation, borrowed endpoint lifetime, and single outstanding in-flight item requirements **remain required**, but they now apply to `source pipe sink` exclusively. They do not make `>>` and `<<` implicit loops.

See [mixed-endpoint-pipe-v1.md](mixed-endpoint-pipe-v1.md) for normative syntax, typed `PipeSource<T>` / `PipeSink<T>` capabilities, actor emission semantics, supervisor CONTROL-path isolation, connection handle lifecycle, ownership rules, examples, and conformance gates.

**Implementation status:** The Rust/Wasm browser compiler has a parser/type-checker draft for mixed pipes but does not yet implement executable mixed endpoint guest transport. Do not promote syntax-only or reference-model test results to runtime proof.
