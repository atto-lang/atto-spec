# 14 — Actor Pipeline Factories and Connections

**Status: DRAFT / PROPOSED API, TARGET semantics.** No guest compiler/backend is certified by this chapter. In particular, a Wasm host-only selector or a source-free reference test is **not** execution of `Actor.pipe(...)` in AttoLang.

## Scope and spelling

The existing `pipe` keyword remains the canonical infix actor pipeline expression. The proposed nominal, compiler-recognized `Actor` factory API is an alternative expression spelling, **not another language keyword**:

```atto
// Infix starts immediately; factories are deferred until .start().
val graph_result = spawn Reader() pipe spawn Transformer() pipe spawn Writer()
val builder = Actor.pipe(Reader(), Transformer(), Writer())
val configured_builder = Actor.pipe(Reader, Transformer, Writer)
```

The first form uses explicit actor spawn operands, which require *staged* publication when used in a `pipe` expression. For the factory forms, `Reader(...)` is parsed **contextually** as an unspawned, statically resolved actor-constructor specification. It does not allocate a running actor, invoke `receive`, mint an actor identity or execute actor code when argument evaluation occurs. Constructor arguments may be evaluated as normal language expressions according to their declared effects, then copied/moved into an owned, immutable build plan. The compiler MUST reject an argument whose evaluation or capture would violate isolation, lifetime, permission or effect rules. In particular, construction arguments are not implicit capability grants.

The bare `Reader` form is a **statically known nominal actor type** with an accessible zero-argument initializer. It is sugar for `Reader()` **only in the factory's actor-constructor argument position**; it does not introduce general runtime type values or host reflection. A type requiring arguments must use `Reader(args...)`.

`Actor.pipe(spawn Reader(), spawn Writer())` is rejected: running `ActorRef` instances belong to `Actor.connect`, not to the new-actor factory. `Actor.pipe(make_reader(), ...)` is also rejected unless `make_reader()` has a separately specified compile-time-safe actor-constructor descriptor type; ordinary function calls are not reinterpreted as declarations.

## Factory and connection distinction

| Surface | Operands | Effect and ownership | Result (conceptual) |
| --- | --- | --- | --- |
| `spawn A() pipe spawn B()` | Staged actor spawns | Creates a new owned graph | `Result<ActorGraph<In,Out>, PipelineError>` |
| `Actor.pipe(A(), B())` | Unspawned actor constructor descriptors | Deferred new-actor graph plan; one owner | `ActorPipelineBuilder<In,Out>` |
| `Actor.pipe(A, B)` | Zero-argument actor type references | Exact sugar for preceding form | Same deferred builder |
| `Actor.connect(a_ref, b_ref)` | Two already-spawned, live `ActorRef` values | Connects existing actors; does **not** adopt or spawn them | `Result<ConnectionRef<T>, PipelineError>` |

These signatures are **conceptual**, not an assertion that AttoLang currently supports a specific variadic generic declaration grammar. An outer builder's `.start()` and the immediate infix spelling MUST lower to the same typed graph IR and use the same runtime admission protocol. `Actor.pipe(...)` **alone neither spawns nor returns** an `ActorGraph`. The builder is move-only, including configuration methods; nesting consumes each inner builder exactly once. The `.start()` result is an explicit admission outcome that may require suspension/Future depending on verified async hook semantics; `?` can propagate a Result only in a compatible callable. Merely binding an unwrapped result is not proof of successful startup.

```atto
// Construct an unstarted graph plan; only start attempts publication.
val graph_result = Actor.pipe(
  Reader("/tmp/source"),
  Transformer(batch_size=256),
  Writer("/tmp/destination")
).start()
// Check/propagate graph_result before using the graph.

// Existing actors: no new actor ownership is created.
val reader = spawn Reader()
val writer = spawn Writer()
val link = Actor.connect(reader, writer)?
```

A `connect` argument naming a type rather than a live `ActorRef` is a type error. Additional existing-actor varargs, arbitrary DAG/fan-out builders, live-graph reconfiguration and `Actor.connect(a,b,c)` remain unsupported by this initial contract. Nested sequential `Actor.pipe(...)` descriptors and `.start()` are a **new draft amendment** requiring coordinated source/ABI review; see [chapter 15](15-nested-actor-pipelines.md).

## Types and ports

Each pipeline participant declares a nominal, statically known compatible role and its DATA input/output payload types. A **started** linear graph has **at least two actor stages**; a deferred subsegment may contain a single stage for composition but must not start alone. For the initial linear factory contract the first stage has the `readable` source role, the last has the `writable` sink role, and intermediate stages have compatible `transform` or `duplex` roles. A `duplex` terminal or upstream-only transform requires a separate explicit endpoint-exposure contract, not an implicit unconnected port. The compiler checks every adjacent edge:

```text
Reader.Output == Transformer.Input
Transformer.Output == Writer.Input
```

Implicit conversions are not allowed across ownership/serialization/security domains; explicit adapters are ordinary typed stages. A supervisor or other CONTROL-only entity is never a DATA stage.

Existing typed pipeline semantics include **correlation-bound reverse DATA replies** through `self.backward(value)`, separate from `self.forward(value)` (see the [shared pipeline v1 contract](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/blob/main/contracts/pipeline/v1/README.md)). A factory MUST preserve that behavior when its actor roles declare backward input/output types: each reverse hop must be nominally type-compatible, bounded, ticket/correlation-scoped and actor-generation-fenced. A reverse response is **not** a generic feedback-cycle edge, an untyped callback, or supervisor CONTROL traffic. The proposed factory must not erase existing forward/backward roles merely to make a one-way constructor convenience API. The Wasm host-only factory planner presently checks **forward topology only**, so it is not a full reference implementation of bidirectional pipeline semantics. Duplicate actor identities, incompatible ports, unsupported roles, mixed spawned/unspawned operands and unbounded graphs MUST be rejected before publishing a graph. This is a typed actor *connection graph*, not a conventional value-composition operator; `|>` remains reserved for functional value pipelines.

The result `ActorGraph<In,Out>` owns **only newly created** child actor refs, connection leases and lifecycle scope. It exposes bounded entry/exit handles where the graph role permits, a graceful `stop()`, and `get_done()` for physical completion; the exact source-level endpoint and return signatures remain subject to grammar/type admission tests. A `ConnectionRef<T>` owns only its connection lease; neither stopping it nor dropping it implicitly stops or reparents its endpoint actors.

## Atomic publication, effects and concurrency

- The compiler emits ordered `ActorStageSpec` and `ActorEdgeSpec` records with static initializer IDs, payload type IDs, constructor argument ownership plans, effect bounds, supervisor ownership context and required capabilities. No runtime host-reflection or runtime source evaluation is required, including in **full guest AOT**.
- The runtime validates nominal types, every edge, arena/queue and byte budgets, trust domain, tenant, permissions, supervisor control receipts, actor generations and constructor authority **before public graph publication**. Constructible metadata is not itself a spawn or connection authority.
- Admitted constructors initialize in an unpublished staging scope; no DATA message is routed until *all* graph links and actor references are ready. Stage initialization must not publish irreversible user-visible side effects before commit without a separately declared and admitted effect. Failed admission rolls back reserved identities, mailbox and memory quotas, staging allocations and links; it cannot magically undo external side effects that were independently allowed during argument evaluation.
- Graph publication occurs once, with consistent epoch/generation fencing and bounded transport credits. A failure during admission cannot expose half a graph, leak ownership or report success. Failure/cancellation must physically retire admitted native resources before reporting a completion barrier.
- `Actor.connect(a,b)` checks both live actor incarnations and matching `T`, verifies explicit connection authority and tenant/isolation permits, reserves bounded credits, and installs the edge at one linearization point. A concurrent stop/restart/hot reload must either win before admission or cause a typed stale/closed failure; no pending DATA delivery may silently target a new actor generation.
- Connection and factory results indicate **admission**, not the delivery or processing of every message. Backpressure, closure, cancellation and supervision follow chapters 05, 06 and 13.
- Without explicit `.with_supervision`, a new graph is **not** a new supervisor: new actors inherit the authorized spawning context's controlling supervisor. A builder with an explicit `.with_supervision(strategy)` requests a separate, authorized *child supervisor instance*; an explicitly supervised nested segment is one subordinate supervisor child, not a DATA stage. `connect` never changes controlling supervisor and cannot carry supervisor CONTROL traffic, bypass a private state boundary, or grant untrusted actors authority by wiring.
- A simple factory constructs an acyclic, ordered chain. Cycles and feedback require an explicit, capacity-bounded, separately typed and approved feedback construction API.

An implementation MAY choose optimized allocation or zero-copy routes when the same ownership, capability, closure and observable admission semantics hold. A platform that cannot provide transactional publication or the requested isolation MUST fail closed rather than silently running an unsafe partial implementation.

## Required rejection and race fixtures

A portable `.atto` suite MUST cover:
1. Positive 2-stage and 3-stage typed chains; non-default constructor parameters; zero-arg type sugar; explicit infix `pipe` equivalence; endpoint types, order and `Result` behavior.
2. Negative mismatched payload and ownership, non-actor stage, supervisor/CONTROL stage, malformed/duplicate stage, zero/one stage, source-without-output, sink-without-input, spawned refs passed to `Actor.pipe`, bare types with required initializer args, `Actor.connect` passed types, capability forgery, cross-tenant and stale incarnations.
3. Resource reservation limits, mid-stage initialization failure, cancellation during staging, concurrent stop/close/restart, full mailbox/backpressure, physical resource retirement, and no DATA visibility before publication.
4. Real source compilation **and execution** from the same fixture on JVM/GraalVM, LLVM AOT, Wasm, Forge and .NET Native AOT with exact compiler/source SHA, runtime evidence and verified failure classes.

The host-only Wasm `actor-pipe-factory-plan.mjs` checks typed *metadata* and reuses the existing `ActorPipelineSelector`; it cannot spawn, wire, supervise, or prove source-language factory execution. The same is true of the source-free nested plan test in [chapter 15](15-nested-actor-pipelines.md). This feature remains **NOT_VERIFIED on all five backends** until real `.atto` programs execute. See [chapter 11](11-conformance.md).
