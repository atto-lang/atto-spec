# Actor pipe port declarations and inferred capabilities (v1)

**Status:** proposed normative extension to [mixed-endpoint-pipe-v1.md](mixed-endpoint-pipe-v1.md), reconciled with draft [typed actor receives/sends](https://github.com/atto-lang/atto-spec/pull/28) and [unary/stream replies](https://github.com/atto-lang/atto-spec/pull/40). This is *not* a declaration of executable multi-backend support.

## Design decision: actor roles are declared; pipe traits are inferred

`PipeSource<T>`, `PipeSink<T>` and `PipeTransform<In,Out>` are compiler-checked capabilities, not user-overloadable operator implementations. Do **not** introduce separate `readable`, `writable`, or `transform` declaration keywords on actor classes.

- `receives T` declares the application message type and derives `PipeSink<T>` on an `ActorRef` *when the corresponding typed receive handler exists*.
- `emits T` declares the pipeline-output event type and derives `PipeSource<T>` on an `ActorRef`. Every `emit(v)` in admitted pipeline handlers must have `v: T`.
- `receives I emits O` derives `PipeTransform<I,O>` (equivalent to both capabilities). A transform is zero-to-many by default; neither one-to-one cardinality nor automatic forwarding is implied.
- `sends M` is an **independent** outbound actor messaging effect. It does not imply `emits M` or that `send(M)` pushes a pipeline element.
- No actor's supervisor CONTROL path, ordinary unary request reply, or `StreamRequest` reply sidecar is a pipe event. Explicit adapters would be needed to expose correlated replies as streams.

Canonical clause order is **`receives`, `emits`, `sends`**, whether used with an inline `define actor Name ... as ... end` or a body-free nominal `declare actor Name ...;`. The parser also tolerates `receives T sends M emits O`, with formatter normalization to `receives T emits O sends M`. See [declared-actor-pipe-signatures-v1.md](declared-actor-pipe-signatures-v1.md) for public/private visibility, `implements`, namespace linker and backward-compatible `declare actor Foo;` rules. `receives` and `sends` come from the separate actor-contract proposal; `emits` is the sole new pipe-specific clause. Runtime does not infer an `emits` declaration from scanning method bodies. In a strict pipeline profile, actor endpoints without the required declaration are rejected; a migration profile may continue parsing older actors but must not grant them implicit pipe capabilities.

### Example (target AttoLang)

```atto
define actor Sensor receives Tick emits Reading as
    receive(ActorMail<Tick> m): void {
        emit(sample(m.value));
    }
end

define actor Analyzer receives Reading emits Finding as
    receive(ActorMail<Reading> m): void {
        if useful(m.value) then
            emit(analyze(m.value));
        fi
    }
end

define actor Storage receives Finding as
    receive(ActorMail<Finding> m): void {
        persist(m.value);
    }
end

val connection =
    spawn Sensor() pipe spawn Analyzer() pipe spawn Storage();
```

The graph **does not** send an implicit Tick/Start request to Sensor. Spawn and connection establishment do not execute a producer loop or make source emissions appear without an actor-specific start contract or external input. A source that emits on startup must use an explicit, supervised lifecycle hook; naming and phase ordering of that hook are a separate runtime contract.

## Compile-time role and type rules

For each adjacent pair `A pipe B`, require A's source type to equal B's sink type under AttoLang's nominal, ownership-safe type rules; **no** implicit serialization, numeric conversion, `Future` flattening, broad union narrowing, or automatic `await`.

1. `A` in first position requires `PipeSource<T>`.
2. `B` in last position requires `PipeSink<T>`.
3. Every internal stage requires `PipeSink<In>` **and** `PipeSource<Out>`; a sink-only actor cannot appear in the middle even if its handler calls ordinary `send`.
4. Actor receiving declaration must exactly match its handler's accepted payload(s). An unresolved/missing handler is not proof of a sink.
5. Every `emit` has the statically declared output type; output declarations with no valid emission mechanism are rejected or remain explicitly nonexecuting. A multi-type `emits` needs an explicit typed `out<T>()` view, not guessing from downstream context.
6. Exposing more than one input type requires an explicit `in<T>()` view (or a named port); do not pick one based on a downstream `pipe` operand's type. Typed port selectors are a future separate syntax contract.
7. `PipeTransform<I,O>` is **not** assumed to be pure, deterministic, bijective, or single-response. It may emit zero, one, or N outputs for each message; backpressure and cancellation still apply.
8. An actor may have multiple independently typed destinations and still exactly one supervising parent. An ordinary `sends` list or capability token does not automatically broadcast `emit` events.

### Matrix

| Source | Destination | Admission |
| --- | --- | --- |
| `Actor emits Reading` | `Actor receives Reading` | Typed edge |
| `Actor emits Reading` | `Channel<Reading>` | Typed edge |
| `Stream<Reading>` | `Actor receives Reading` | Typed edge |
| `Actor emits Reading` | `Stream.port<Reading>(32).sink()` | Typed edge |
| `Actor receives Reading` (no emits) | `Channel<Reading>` | Reject source role |
| `Actor emits Reading` | `Actor receives Finding` | Reject type mismatch |
| `Actor sends Reading` (no emits) | `Channel<Reading>` | Reject: sends != emits |
| `Actor emits Reading` | `Stream<Reading>` readable view | Reject: read-only destination |
| `Stream<Reading>` | `Actor emits Reading` (no receives) | Reject sink role |
| `Actor receives I emits O` | next sink `O` | Valid transform when matching `I` upstream |

## Scheduling and ownership contract

- `emit(value)` is effectful: admission may cooperatively **suspend** on bounded downstream pressure, so the emitting handler must have a permitted suspension/effect context. It cannot implicitly block an OS thread or suspend while holding a sealed actor state critical lease.
- `emit` commits to the graph at one linearization point and must return a typed admission outcome or propagate a checked error by the canonical actor-handling contract. There is no silent drop or detached enqueue.
- A channel has read/write capabilities but may have other owners. A plain shared channel's EOF is **not** inferred from the end of one producer. A bounded `Stream.port<T>` represents an owned graph adapter with writer/reader halves and a separately defined EOF protocol; it must not leak or hang at graph completion.
- On a failed connection setup, publish no partial connections and spawn no detached forwarding tasks. On cancellation, preserve admitted-count and uncommitted-value ownership. All edges must honor flow-control and exact actor mailbox generation fencing.
- Typed `ActorRef` is a handle. The pipe contract does not grant access to sealed actor fields, authorize application messages through supervisor CONTROL, or expose private addresses across isolates.
- The connection is unicast by default. Multiple `pipe` uses of the same source require an explicit fan-out adapter and ownership policy.

## Tests before implementation can be claimed

1. Header role parser: `receives T`, `emits T`, combined, bad order/duplicate, unavailable type, nonmatching receive handler.
2. Emission preflight: exact declared emit type; mixed emitted types; missing `emits`; declared `emits` with no emit body (or not yet executable producer hook); `send(T)` alone does not grant a source.
3. Wiring: source-only, sink-only and transform actor across actor/channel/stream/generator; reject unusable roles at first/middle/last and wrong nominal payload.
4. Control and async: no supervisor CONTROL leakage, no automatic request-reply streaming, no initial message injected on `spawn`, no suspended `emit` under sealed critical lock, bounded backpressure and cancellation ownership.
5. Strict executable acceptance requires actual Atto-compiled guest behavior and exact source tree, Rust native and wasm32, real Chromium, plus independent backend receipts. A reference model or parser-only test remains marked SOURCE_ONLY or NOT_EXECUTED.

## Immediate Rust/Wasm staging

The browser compiler currently has a small `receive(ActorMail<T>)` implementation and infers homogeneous `emit` from receive bodies; it has **no general channel/stream transport ABI**. Introduce source declaration fields and ensure declared types agree with existing observed receive/emission types. For **mixed** pipelines, require actor stages to have appropriate explicit header role declarations. Legacy actor-only `pipe` input syntax may retain historical inference temporarily, but this is a migration exception, not the strict target contract. Do not mark any mixed pipe executable until typed endpoint capabilities and a structured `PipeHandle` exist.
