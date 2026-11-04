# 14 — Nested Actor Pipeline Builders and Scoped Supervision

**Status: DRAFT / TARGET (PROPOSED API signatures).** This is a design contract, not a claim that a backend already executes these calls. In particular, no source-free model test is evidence of AttoLang guest execution.

## Motivation and canonical source

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

A comma separates the inner builder from `Writer()`. The variable above has the proposed type `Result<ActorGraph<In, Out>, PipelineStartError>`, **not** an already-unwrapped graph. Within a callable whose return permits propagation, use `.start()?` to bind an actual `ActorGraph`. The exact start error carrier and effect syntax remain subject to backend signature ratification.

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

- `Actor.pipe(stage1, stage2, ...)` is a compiler-recognized standard-library factory. It returns an **unstarted**, linear `ActorPipelineBuilder<In, Out>` descriptor. At least one stage is required; in the initial contract, a single-stage segment is valid as a reusable identity segment with that actor's ports.
- A stage is either a compiler-recognized *unspawned actor construction descriptor*, a statically registered zero-argument actor type, or another **unstarted** pipeline builder. `Reader(args...)` in a pipeline position records a constructor and its captured owned arguments; it does not run actor initialization, effects, privileged I/O or spawn during builder evaluation. Runtime invocation happens at `start()` under authorized context.
- Overload `Actor.pipe(Reader, Transformer, Writer)` may use actor types only if the AOT constructor registry proves each type has a legal zero-argument constructor; ordinary runtime type objects/reflection are insufficient.
- A builder is **consumed exactly once**, either by enclosing `Actor.pipe(...)` or by `start()`. A consumed builder or actor construction descriptor cannot be aliased, inserted twice, mutated, started twice or concurrently started. A live `ActorGraph` / `ActorRef` is not a stage descriptor; use separately authorized `Actor.connect` for *already-running* actors, without stealing their supervisors.
- An inner `.start()` produces a running graph/result and is **not** accepted as a child of `Actor.pipe`; composition must happen before a single outer start. An empty pipeline, uncontrolled recursion, shared descriptor, incompatible shape, non-sendable constructor capture or unsupported stage kind fails before unsafe IR.
- The `pipe` keyword remains the immediate-spawn source spelling. It MUST share observable startup, admission, rollback and dataflow semantics with a corresponding explicit builder's `.start()` after accounting for the separate expression/result carrier. Functional `|>` remains unrelated.
- Nested factory expressions are source syntax targeting compiler intrinsics, not runtime variadic reflection or construction by string class names. Constructors and ports have static AOT registries for Java/GraalVM, LLVM, Wasm, Forge and .NET Native AOT.

## Port typing and topology

For each actor stage define `PipelineStage<In, Out>` with at most one declared pipeline DATA ingress and one declared pipeline DATA egress. A source may have no public ingress; a sink may have no public egress; their enclosing `ActorGraph` exposes only ports that actually exist.

For sequential composition `P = Actor.pipe(A, B, C)`, require `A.Out` assignable to `B.In` and `B.Out` assignable to `C.In`, including ownership, wire-serialization, sendability, trust domain and effect checks. The nested segment's external ports are its first valid input and last valid output. No implicit adapter/conversion or mutable alias is inserted. Data edges cross segment boundaries without entering a supervisor CONTROL lane.

When a subsegment has no ingress, it can occur only in an admissible overall source position; when it has no egress, it can occur only in an admissible overall sink position. Any stage requiring multiple inputs/outputs, merge, feedback, branching, cycle, broadcast or dynamic graph editing needs a separately specified explicit graph combinator. Do not reinterpret a nested `pipe` as fan-out.

## Scoped configuration and capacities

- `.with_capacity(n)` sets a default **per-DATA-edge message-count cap** in that builder's subtree, unless a more local segment explicitly overrides it. `n` must be a positive, representable, profile-authorized bounded integer. Message bytes, actor inbox and aggregate graph quotas remain **separate**, mandatory bounds; a count cap of 1024 does not grant 1024 *unbounded-size* messages.
- A child segment's explicit `.with_capacity(16)` applies to **its internal edges**, not the parent-owned incoming/outgoing boundary edges. The parent owns cross-segment boundary edges. Otherwise the nearest explicitly set ancestor capacity applies; absent that, use a finite, profile-specified default, not an unbounded channel.
- Configuration is immutable-on-write and builder-local; applying an outer option does not mutate a reusable child or alter an already-started graph. An invalid capacity or quota is rejected before publication; any startup reservation failure rolls back.
- `.with_supervision(strategy)` defines the **supervision strategy of this builder's scope**. Valid target strategies are `#one_for_one`, `#one_for_all`, `#rest_for_one`. A single scope may only have one effective policy; conflicting/duplicate declarations are rejected, not last-write-wins.
- **No explicit inner supervision:** nesting is logical only; all actor stages become direct children of the one new pipeline supervisor created on outer `start()`, governed by the outer `#one_for_all` policy. The pipeline supervisor itself is a child of the caller's authorized enclosing supervisor; it does not mint or replace the runtime root.
- **Explicit inner supervision:** if an inner segment has `.with_supervision(#one_for_one)`, it becomes one *child supervisor* of the outer pipeline supervisor. Inner actors belong only to that supervisor; outer `#one_for_all` treats the nested supervisor as **one direct child**. Failure escalation follows the immediate-parent CONTROL path in chapter 13; outer restarts fence and recreate the child subtree. Outer policy is not directly applied to grandchildren.
- Restart budgets, backoff and generation fences remain bounded and independent for real supervisor instances. A data segment grouping alone does not create a new supervision/CONTROL or scheduling boundary. Neither scope may bypass caller permissions, isolate grants or the runtime-owned supervisor tree.

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

Here `Reader→Transformer1` and `Transformer2→Writer` are parent-owned edges capped at 1024 messages; `Transformer1→Transformer2` is the inner edge capped at 16. The two transformers are direct children of an inner `#one_for_one` supervisor; the parent supervises Reader, the inner supervisor as one direct child, and Writer.

## Atomic start, failures and cancellation

`start()` performs capability checks and reserves graph budgets (nodes, edges, slots/bytes, CONTROL receipts, supervisor child slots, actor arenas), validates the full static descriptor, prepares authorized supervisor hierarchy, constructs actor generations, binds typed DATA channels, and publishes the graph **only after full successful admission**. Constructor evaluation and lifecycle hooks may fail, so a reservation is not itself a public graph.

All failed starts close uncommitted DATA admissions, cancel/quiesce initialized descendants in reverse dependency order, retire memory and resources, and return a typed `PipelineStartError` without leaking a partially usable graph. A cleanup timeout or ambiguous physical retirement must remain fenced/quarantined and be reported, never called successful rollback. A start interrupted by cancellation follows the same cleanup discipline; no child can observe a half-published graph.

Each DATA edge has linearizable bounded send/close admission and backpressure; no drop-as-success and no blocked OS carrier implied by full queues. A failed actor reports on its own immediate supervisor's authenticated, bounded CONTROL lane; graph connections never deliver CONTROL. Restart and `get_done()` are generation-aware; old actor refs, edge tickets and completion handles are fenced after restart. `stop()` fences all downstream admissions and settles in-flight ownership and child completion in safe reverse order.

The public result/graph lifecycle API is a **PROPOSED** signature family:

~~~text
Actor.pipe(...) -> ActorPipelineBuilder<In, Out>
builder.with_capacity(int) -> ActorPipelineBuilder<In, Out>
builder.with_supervision(Symbol) -> ActorPipelineBuilder<In, Out>
builder.start() -> Result<ActorGraph<In, Out>, PipelineStartError>
graph.stop() -> Result<..., ...>      // exact async/error carrier unsettled
graph.get_done() -> ...               // exact completion carrier unsettled
~~~

## Static and executable conformance gates

Positive fixture: the canonical nested `.atto` example builds four actors, three DATA edges, produces identical byte/order/exit outcomes to a flat equivalent, propagates real backpressure and observes a clean graph completion. A second fixture sets distinct inner capacity/policy and observes only correct internal edge caps and one nested supervisor instance.

Negative fixtures: missing comma/parser errors; zero stages; type mismatch at both segment boundaries; source/sink misplacement; actor reference instead of descriptor; duplicate/moved builder; child `.start()` inside outer pipeline; illegal constructor capture; negative/zero/overflow capacity; duplicate/conflicting strategies; attempted duplicate supervisor ownership; privilege/tenant/isolate mismatch; failure during nested initialization; cancellation during start; DATA-full while CONTROL delivers panic; stale generation and repeated restart notices.

Each backend MUST compile and **execute** the same `.atto` fixtures at an exact SHA, with typed result, queue bounds, supervisor tree, rollback receipts and exit observable. Host-side reference-model tests only exercise abstract composition and cannot prove parser, runtime or AOT support. Until then, the API is **TARGET / NOT_VERIFIED** on all five backends. See [chapter 11](11-conformance.md) and [supervisor hierarchy](13-supervisor-hierarchies.md).
