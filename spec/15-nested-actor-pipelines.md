# 15 — Nested Actor Pipeline Builders and Scoped Supervision

**Status: DRAFT / TARGET (PROPOSED API signatures).** This is a design contract, not a claim that a backend already executes these calls. In particular, no source-free model test is evidence of AttoLang guest execution.

## Motivation and canonical source

This chapter is an extension to the existing [actor factory and `Actor.connect` contract](14-actor-pipeline-factories.md). It proposes changing the factory's immediate-result expression into a deferred builder; it does **not** change `Actor.connect` semantics or the immediate-spawn infix `pipe` keyword. The precise `.start()` signature, with async initialization, requires independent review.

An actor pipeline may contain another unstarted pipeline. Composition is **sequential**: the inner pipeline behaves like a typed segment with one input and one output, while retaining a logical boundary for configuration, diagnostics and optional supervisor scopes. It is not automatically fan-out, fan-in or a concurrently duplicated stage.

~~~atto
val graph_result = Actor.pipe(
  Reader(),
  Actor.pipe(
    Transformer1(),
    Transformer2()
  ),
  Writer()
)
  .with_capacity(1024)
  .with_supervision(#one_for_all)
  .start()
~~~

A comma separates the inner builder from `Writer()`. The variable above is a **start result**, not an already-unwrapped live graph. An eventual API may use `Result<ActorGraph<In, Out>, PipelineStartError>`, or a suspendable/Future carrier where asynchronous `on_start()` hooks require it; the exact effect and return signature remain **PROPOSED**, not standardized. A caller must check or propagate failure before using a live graph. Source and sink endpoints are statically absent when the first stage has no ingress or the last has no egress.

The same dataflow can be written:

~~~atto
val graph_result = Actor.pipe(
  Reader(),
  Transformer1(),
  Transformer2(),
  Writer()
).with_capacity(1024).with_supervision(#one_for_all).start()
~~~

Both produce four actor nodes and three DATA edges. **Nesting alone never creates a supervisor or a DATA actor.** Compiler lowering retains the segment path, e.g. `0/1/0`, for source diagnostics and scoped configuration.

## Builder and stage contract

- `Actor.pipe(stage1, stage2, ...)` is a compiler-recognized standard-library factory. It returns an **unstarted**, linear `ActorPipelineBuilder<In, Out>` descriptor. A nested builder segment may hold one stage, but a **started graph requires at least two actor stages**. A single-stage descriptor is composable but cannot be started alone.
- A stage is either a compiler-recognized *unspawned actor construction descriptor*, a statically registered zero-argument actor type, or another **unstarted** pipeline builder. `Reader(args...)` in a pipeline position records a constructor and captured owned arguments, not a live actor. Constructor *arguments* are evaluated exactly once, left-to-right, at builder expression evaluation (including their declared effects, failures, and permission checks); actor initialization, `on_start()`, and spawn are deferred to `start()`. An argument effect is never silently replayed on restart. Any effectful construction expression rejected by the declared effect/ownership context must fail before unsafe lowering; no compiler may defer, duplicate, or reorder its observable argument evaluation.
- Overload `Actor.pipe(Reader, Transformer, Writer)` may use actor types only if the AOT constructor registry proves each type has a legal zero-argument constructor; ordinary runtime type objects/reflection are insufficient.
- A builder is **consumed exactly once**, either by enclosing `Actor.pipe(...)` or by `start()`. Every `.with_capacity(...)` / `.with_supervision(...)` configuration method **takes/moves `self`** and returns its new owner; 'immutable-on-write' means immutable configuration metadata, **not** an implicitly cloneable descriptor. Builder copies, stale aliases, reusing a moved descriptor, double-start and concurrent-start are compile errors, with an atomic runtime admission fence if a descriptor crosses an admitted FFI boundary. Constructor captures belong to the one consuming builder and are dropped exactly once on destruction, cancellation or startup failure. A live `ActorGraph` / `ActorRef` is not a stage descriptor; use separately authorized `Actor.connect` for *already-running* actors, without stealing their supervisors.
- An inner `.start()` produces a running graph/result and is **not** accepted as a child of `Actor.pipe`; composition must happen before a single outer start. An empty pipeline, uncontrolled recursion, shared descriptor, incompatible shape, non-sendable constructor capture or unsupported stage kind fails before unsafe IR.
- The `pipe` keyword remains the immediate-spawn source spelling. It MUST share observable startup, admission, rollback and dataflow semantics with a corresponding explicit builder's `.start()` after accounting for the separate expression/result carrier. Functional `|>` remains unrelated.
- Nested factory expressions are source syntax targeting compiler intrinsics, not runtime variadic reflection or construction by string class names. Constructors and ports have static AOT registries for Java/GraalVM, LLVM, Wasm, Forge and .NET Native AOT.

## Port typing and topology

The base [factory contract](14-actor-pipeline-factories.md) also permits declared **correlation-bound reverse DATA replies** via `self.backward(value)`. Recursive nesting MUST preserve typed backward ports, ticket/correlation scope, finite reverse-channel credits, ordering/closure and actor-generation fences at **every** inner and outer boundary. A backward reply is not a supervisor CONTROL message, an unbounded generic cycle or an implicit ownership transfer. The reference model included here checks **forward sequential topology only**; it cannot certify backward reply routing, mailbox delivery or guest behavior. Real cross-backend fixtures must exercise forward **and** backward paths.

For each actor stage define `PipelineStage<In, Out>` with at most one declared pipeline DATA ingress and one declared pipeline DATA egress. A source may have no public ingress; a sink may have no public egress; their enclosing `ActorGraph` exposes only ports that actually exist.

For sequential composition `P = Actor.pipe(A, B, C)`, require `A.Out` assignable to `B.In` and `B.Out` assignable to `C.In`, including ownership, wire-serialization, sendability, trust domain and effect checks. The nested segment's external ports are its first valid input and last valid output. No implicit adapter/conversion or mutable alias is inserted. Data edges cross segment boundaries without entering a supervisor CONTROL lane.

When a subsegment has no ingress, it can occur only in an admissible overall source position; when it has no egress, it can occur only in an admissible overall sink position. Any stage requiring multiple inputs/outputs, merge, feedback, branching, cycle, broadcast or dynamic graph editing needs a separately specified explicit graph combinator. Do not reinterpret a nested `pipe` as fan-out.

## Scoped configuration and capacities

- `.with_capacity(n)` sets a default **per-DATA-edge message-count cap** in that builder's subtree, unless a more local segment explicitly overrides it. `n` must be a positive, representable, profile-authorized bounded integer. Message bytes, actor inbox and aggregate graph quotas remain **separate**, mandatory bounds; a count cap of 1024 does not grant 1024 *unbounded-size* messages.
- A child segment's explicit `.with_capacity(16)` applies to **its internal edges**, not the parent-owned incoming/outgoing boundary edges. The parent owns cross-segment boundary edges. Otherwise the nearest explicitly set ancestor capacity applies; absent that, use a finite, profile-specified default, not an unbounded channel.
- Configuration is immutable-on-write **and move-only**; applying an outer option creates an updated descriptor without duplicating constructor captures or mutating any already-started graph. A nested segment cannot be reused elsewhere after move into its parent. An invalid capacity or quota is rejected before publication; any startup reservation failure rolls back.
- `.with_supervision(strategy)` defines the **supervision strategy of this builder's scope**. Valid target strategies are `#one_for_one`, `#one_for_all`, `#rest_for_one`. A single scope may only have one effective policy; conflicting/duplicate declarations are rejected, not last-write-wins.
- **No explicit inner supervision:** nesting is logical only. If the outer builder calls `.with_supervision(#one_for_all)`, that explicitly requests one new child pipeline supervisor for all otherwise-unsupervised stages; the child supervisor belongs to the caller's authorized enclosing supervisor, never replaces the runtime root. **Without any explicit `.with_supervision`, graph construction does not mint a supervisor**: the new actors inherit the caller's authorized controlling supervisor and its actual policy (which cannot be guessed from a local builder).
- **Explicit inner supervision:** if an inner segment has `.with_supervision(#one_for_one)`, it becomes one *child supervisor* of the outer pipeline supervisor. Inner actors belong only to that supervisor; outer `#one_for_all` treats the nested supervisor as **one direct child**. Failure escalation follows the immediate-parent CONTROL path in chapter 13; outer restarts fence and recreate the child subtree. Outer policy is not directly applied to grandchildren.
- Restart budgets, backoff and generation fences remain bounded and independent for **explicitly created** supervisor instances; an unsupervised graph inherits the enclosing supervisor's budget and policy rather than inventing a default. A data segment grouping alone does not create a new supervision/CONTROL or scheduling boundary. Neither scope may bypass caller permissions, isolate grants or the runtime-owned supervisor tree.

For example:

~~~atto
val result = Actor.pipe(
  Reader(),
  Actor.pipe(Transformer1(), Transformer2())
    .with_capacity(16)
    .with_supervision(#one_for_one),
  Writer()
)
  .with_capacity(1024)
  .with_supervision(#one_for_all)
  .start()
~~~

Here `Reader→Transformer1` and `Transformer2→Writer` are parent-owned edges capped at 1024 messages; `Transformer1→Transformer2` is the inner edge capped at 16. The two transformers are direct children of an inner `#one_for_one` supervisor; the parent supervises Reader, the inner supervisor as one direct child, and Writer. `#rest_for_one` registration order follows left-to-right depth-first stage expansion; a supervised inner subgraph occupies **one** parent sibling slot, while a plain nested group adds no sibling. It cannot reparent a grandchild or change sibling ordering at restart.

## Atomic start, failures and cancellation

`start()` performs capability checks and reserves graph budgets (nodes, edges, slots/bytes, CONTROL receipts, supervisor child slots, actor arenas), validates the full static descriptor, prepares authorized supervisor hierarchy, constructs actor generations, binds typed DATA channels, and publishes the graph **only after full successful admission**. Constructor evaluation and lifecycle hooks may fail, so a reservation is not itself a public graph.

All failed starts close uncommitted DATA admissions, cancel/quiesce initialized descendants in reverse dependency order, retire memory and resources, and return a typed `PipelineStartError` without leaking a partially usable graph. A cleanup timeout or ambiguous physical retirement must remain fenced/quarantined and be reported, never called successful rollback. A start interrupted by cancellation follows the same cleanup discipline; no child can observe a half-published graph.

Each DATA edge has linearizable bounded send/close admission and backpressure; no drop-as-success and no blocked OS carrier implied by full queues. A failed actor reports on its own immediate supervisor's authenticated, bounded CONTROL lane; graph connections never deliver CONTROL. Restart and `get_done()` are generation-aware; old actor refs, edge tickets and completion handles are fenced after restart. `stop()` fences all downstream admissions and settles in-flight ownership and child completion in safe reverse order.

The public result/graph lifecycle API is a **PROPOSED** signature family:

~~~text
Actor.pipe(...) -> ActorPipelineBuilder<In, Out>
builder.with_capacity(int) -> ActorPipelineBuilder<In, Out>     // consumes builder
builder.with_supervision(Symbol) -> ActorPipelineBuilder<In, Out> // consumes builder
builder.start() -> Result<ActorGraph<In, Out>, PipelineStartError> // proposed, may suspend / require Future
graph.stop() -> Result<..., ...>      // exact async/error carrier unsettled
graph.get_done() -> ...               // exact completion carrier unsettled
~~~

## Audit hardening: admission, limits and restart wiring

**Static source admission:** A pipeline factory and all nested stages MUST be identified by the compiler's sealed descriptor type, not by structural fields such as `kind`, strings naming actor types, user-overridden `Actor.pipe`/method definitions, runtime reflection or a fabricated `ActorRef`. Arity/type/ownership/effect checks run before unsafe IR or spawning. The literal syntax `Reader()` in a pipeline position is interpreted as a constructor descriptor **only in compiler-recognized contexts**; a running actor, arbitrary class, callback, untrusted object, user-defined overload or result of an inner `.start()` cannot be mistaken for a stage.

**Finite resource planning:** A started graph requires **two or more** flattened actor stages; a one-stage nested segment is valid only as an unstarted descriptor. Before committing any stage, runtime and compiler MUST enforce independent bounded budgets for nested depth, stage count, edge count, supervisor depth/count, DATA slot count, per-edge DATA bytes, aggregate outstanding DATA bytes, pinned actor memory, outstanding I/O, initialization resources and CONTROL receipts. Count sums and multiplications with checked wide arithmetic; reject integer overflow, negative/zero capacity and multiplication wraparound rather than under-reserving. `with_capacity(1024)` is *per edge*, not a promise that the complete graph has only 1024 pending messages. The source-free reference model exercises depth/stage/edge/scope/slot limits but **does not model bytes, allocator/OS admission or reservation races**. Runtimes must maintain those additional limits.

**Direct-child supervisor order:** Register direct children in deterministic source order. A logically nested but unsupervised builder contributes actors to its actual authorized enclosing supervisor; a source-free model may use a virtual root grouping for analysis, but must not assert that a real new supervisor exists. Expanding a plain nested segment registers its contained actors as direct siblings; an explicitly supervised nested segment registers **one child supervisor** at its segment position. `#one_for_all` and `#rest_for_one` apply to direct children, not grandchild actor IDs. Order must be identical after lowering, AOT metadata emission and restart, even if initialization tasks run concurrently. An actor may belong to multiple groups but has one immutable controlling supervisor for its current generation.

**DATA edges across restart:** A nested supervisor can restart without gaining a parent DATA inbox. Every crossing DATA connection is still a typed, bounded edge and must be generation-fenced on stop/restart; the graph reconnects the new producer/consumer incarnations *only after both ends and quota reservations are admitted*. Sends through stale edge/actor tickets fail explicitly. A successfully admitted message is not necessarily processed or durably committed: if cancellation/restart abandons it, the runtime settles ownership exactly once and signals delivery/processing failure to any caller awaiting such a guarantee. Mere mailbox admission ACK must not be retroactively mislabeled as processing success; no implicit exactly-once delivery/replay guarantee. Cross-segment messages cannot be copied or replayed across isolates without an explicit ownership/serialization contract. A parent `#one_for_all` restart also fences every relevant outer and inner edge until all selected sibling/subtree incarnations are ready.

**Transactional publication:** Runtime reservations and immutable compile-time plans precede actor publication, including a bounded CONTROL path for every new direct child. Initializer hooks may run in a staged environment but must not publish externally addressable actor/graph handles or admit outside DATA until the whole graph is ready; effects that cannot be rolled back require an explicit capability and documented failure disposition. On failure, cancel admission, revoke tickets, settle pending sends, retire initialized children and resources in reverse dependency order, and return a typed error. A timed-out or ambiguous physical retirement is **quarantined** and not reported as completed rollback. On stop, parent and child startup races, hook cancellation and stale/duplicate CONTROL notices follow the same generation/authorization fences as [chapter 13](13-supervisor-hierarchies.md).

**AOT/parity:** The compiler emits a static pipeline topology, constructor bindings, per-edge capacity/transport traits, owner/supervisor registration order and permission/ownership checks; a backend MUST NOT implement recursive nesting with runtime reflection, host-only "shape" interpretation, implicit supervisor reparenting, or a flattened topology that loses explicit inner scope. Unsupported source is rejected rather than silently simulated or downgraded.

## Static and executable conformance gates

Positive fixture: the canonical nested `.atto` example builds four actors, three forward DATA edges and any role-declared bounded reverse reply channels, produces identical byte/order/exit outcomes to a flat equivalent, propagates real forward/backward backpressure and observes a clean graph completion. A second fixture sets distinct inner capacity/policy and observes only correct internal edge caps and one nested supervisor instance.

Negative fixtures: missing comma/parser errors; zero stages; type mismatch at both segment boundaries; source/sink misplacement; forged descriptor/actor reference instead of descriptor; duplicate/moved builder; child `.start()` inside outer pipeline; effectful constructor argument reordering or replay; illegal constructor capture; negative/zero/overflow capacity, aggregate quota overrun and excessive nested depth; duplicate/conflicting strategies; attempted duplicate supervisor ownership or direct-parent violation; privilege/tenant/isolate mismatch; failure during nested initialization; cancellation during start; DATA-full while CONTROL delivers panic; stale inter-segment edge generation, double replay, duplicate/drop settlement and repeated restart notices. The source-free model must additionally exercise flat/nested equivalence, three-strategy deterministic direct-child selection and fail-closed malformed descriptors.

Each backend MUST compile and **execute** the same `.atto` fixtures at an exact SHA, with typed result, queue bounds, supervisor tree, rollback receipts and exit observable. Host-side reference-model tests only exercise abstract **forward** composition, optional explicit supervisor scopes, and bounded metadata; they neither start actors nor implement real send/reply, constructor effects, linear type checking or AOT execution. Until then, the API is **TARGET / NOT_VERIFIED** on all five backends. See [chapter 11](11-conformance.md) and [supervisor hierarchy](13-supervisor-hierarchies.md).
