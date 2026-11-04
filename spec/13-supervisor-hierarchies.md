# 13 — Hierarchical Supervisors and Child Lifecycle

**Status: DRAFT / TARGET.** This chapter is a proposed normative language contract, **not proof of guest compiler execution**. The Java source admission and STOP-only drafts and LLVM/.NET/Wasm/Forge gates must not be confused with executable five-backend supervision.

## Nominal declaration and authority

`define supervisor Name as ... end` introduces a distinct nominal supervisor type, separate from `define actor` and `define class`. A supervisor has a runtime-minted `SupervisorId`, a private CONTROL executor/turn lane, a bounded child registry and an immutable parent relationship. It is neither an Actor nor a host ControlHandle; it has no ordinary actor DATA inbox and cannot be cast to/from an `ActorRef`. Supervisors do **not** gain authority through `extends`, `implements`, `impl`, `conforms`, `is` or trait `with`. Explicit inheritance/composition remains rejected until a separate audited nominal/effect contract exists.

Supervisor definitions are declared at module scope, not nested inside actors, classes or other supervisor declarations. **Instances** of a supervisor may be children of other supervisor instances. Source-defined child relations must be established by a compiler-recognized, runtime-authorized spawn operation, not by lexical nesting, a writable `parent_id` field or a guest-supplied numeric ID.

The single reserved declaration keyword is `supervisor` (including the existing `define` grammar); supervision operations are **methods/intrinsics** rather than introducing a second set of effect keywords. Canonical exported spelling is `define pub supervisor`, subject to parser/formatter conformance. Runtime-minted `SupervisorRef<S>` is an opaque, generation-bound management reference, never interchangeable with `ActorRef<A>`. Only the owning supervisor or explicit trusted root authority may operate on its direct children.

### Illustrative proposed source (not yet executable parity)

~~~atto
define supervisor ApiSupervisor as
  async on_start() -> void ::
    await self.spawn_actor(HttpActor(), restart=#permanent)
    await self.spawn_actor(AuthActor(), restart=#transient)
  end

  async on_panic(f: Failure) -> void ::
    await self.restart(f.child)
  end
end

define supervisor DataSupervisor as
  async on_start() -> void ::
    await self.spawn_supervisor(CacheSupervisor(), restart=#permanent)
    await self.spawn_actor(DbActor(), restart=#permanent)
  end

  async on_panic(f: Failure) -> void ::
    await self.escalate(f)
  end
end

define supervisor RootSupervisor as
  async on_start() -> void ::
    await self.spawn_supervisor(ApiSupervisor(), restart=#permanent)
    await self.spawn_supervisor(DataSupervisor(), restart=#permanent)
  end

  async on_panic(f: Failure) -> void ::
    await self.restart(f.child)
  end
end
~~~

The `self.spawn_actor`, `self.spawn_supervisor`, `self.restart` and `self.escalate` forms above are **proposed intrinsics**, not shipped library methods. Their admission/results, hook suspension and strategy configuration require typed compiler lowering; current restricted STOP-only Java lowering must continue to reject unsupported forms. A failed spawn/restart is never silently accepted; it fails the hook/operation and follows the enclosing supervisor's policy. Ordinary actor `spawn Worker()` inherits the authorized supervisor; it does not mint a new supervisor or let an actor designate a foreign parent.

## Tree and membership invariants

1. A live runtime/tenant has exactly one **runtime-minted root supervisor** for each independently governed supervision domain. The root has no parent. A hosted application may install a declared root policy under this runtime root, but source code cannot replace or forge the runtime root.
2. Each non-root supervisor instance has **exactly one** immediate supervisor parent. Each managed actor incarnation has exactly one **owning supervisor**, even if it belongs to multiple ActorGroups or service groups. An actor's spawning actor is not automatically its supervising parent.
3. The control-ownership graph is an **acyclic tree**; cycles, multiple parents, unattached nodes, self-parenting, cross-runtime/tenant adoption and unapproved reparenting are rejected **before publication**. Child registration is atomic with authorization and reserved failure-notice capacity.
4. No assumed infinite resources: runtimes MUST enforce bounded depth, total children, bytes, restart credits, event volume and per-supervisor CONTROL capacity. Resource exhaustion is a typed admission failure, never a partial tree edge or silently lost failure.
5. Every logical child (actor **or supervisor**) has a stable, runtime-minted logical identity and a monotonic incarnation/generation. Restart creates a **new** physical incarnation; stale refs, permits, callbacks, failure notices and completions cannot target it.
6. A `SupervisorRef` and CONTROL authority are not transferable through DATA, serialization, foreign isolates or arbitrary classes. An application-service actor is not a supervisor and cannot call privileged supervisor intrinsics merely by receiving an ID.

## Failure propagation and restart policy

A failed actor completes its terminal cleanup/physical-done barrier, then publishes an authenticated, immutable `Failure` on **its immediate supervisor's** reserved CONTROL lane. It never executes supervisor guest hooks on the failed actor's carrier. Ordinary handled throws and recovered raises do not generate terminal panic notices. Unhandled throw/raise becomes terminal panic with preserved origin. Cancellation is tracked distinctly from panic.

Only the direct supervising parent may act on a child failure. A supervisor can resolve it through STOP, RESTART, or ESCALATE. **Escalation is not forwarding an unverified raw grandchild notice**: the local supervisor fences its subtree and publishes one parent-facing terminal/escalation receipt for its *own* exact generation, with bounded sanitized cause/origin. The parent's policy treats that supervisor as one logical child. A grandparent cannot manipulate a living grandchild by forging or reinterpreting a descendant ID.

The policy options are `#one_for_one` (one failed direct child), `#one_for_all` (all applicable direct children), and `#rest_for_one` (the failed direct child and later registered siblings). A nested supervisor is a single child for span selection; restarting it entails stopping its entire old subtree and admitting a new instance with its own new descendants. Sibling order is an explicit immutable registration order, not hash iteration order. An admitted `#permanent` child restarts on normal or abnormal terminal exit; `#transient` only on abnormal exit; `#temporary` never automatically restarts. A deliberate shutdown never triggers automatic restart, regardless of child policy.

A supervisor's restart-intensity budget is **local** and bounded by an explicit rolling duration and attempt count. Failed/stale/duplicate terminal notices do not charge restart budget twice. Once its budget is exceeded, the supervisor transitions into escalation/shutdown rather than retrying forever; the parent applies **its own** budget to its failed supervisor child. Backoff must use overflow-safe monotonic elapsed time, not a signed absolute deadline. The root has an explicit terminal failure/exit policy; it cannot escalate to an imaginary parent.

## STOP, RESTART, shutdown and CONTROL correctness

- Spawn publishes a child edge only after permission checks, quota reservation, terminal CONTROL receipt reservation and scheduler ownership are established. Failed construction rolls back all publications without reusing burned identity.
- STOP and RESTART are generation-fenced, single-winner decisions. A STOP acknowledgment means the relevant physical child and resources are **actually retired**, not merely queued for cancellation. Failed or ambiguous host acknowledgments remain quarantined for reconciliation; never claim cleanup success.
- Restarting a supervisor fences new descendant admissions and ordinary messages, quiesces **all** old descendants, settles their pending operations and clears ownership before a new supervisor incarnation can be made visible. Partial subtree restart is not reported as success.
- Graceful subtree shutdown first fences **the whole subtree** against new admissions. It then retires children in **reverse registration order**, descendants before ancestors; parent `tear_down` follows child retirement. Asynchronous cleanup/await callbacks must be checked against their exact supervisor/child generation. Deadline expiry escalates rather than fabricating DONE.
- Every admitted child reserves a durable terminal receipt for its immediate supervisor and a root/emergency fallback where needed. Full DATA queues, bounded CONTROL bursts and a failed supervisor turn cannot silently discard a terminal identity. CONTROL scheduling is fair, single-flight per policy context and cannot starve DATA indefinitely.
- One failed supervisor instance may not cause duplicate parent notices; its parent-facing terminal receipt is durable until an authoritative acknowledgement. A child failure while its supervisor is stopping is observed and reconciled, not restarted behind the admission fence.
- A root/domain shutdown physically quiesces descendants before announcing complete. Unknown in-process native corruption, VM corruption and OS termination are **outside** recoverable supervision guarantees.

## Type, effect and security denial requirements

Reject at parse/type/effect admission, before unsafe IR:
- Explicit `extends` / interface or trait composition of a source supervisor, attempts to define it as an actor, shadow reserved runtime identities or nest `define supervisor` inside an actor/supervisor body.
- Guest-created parent, child, supervisor or incarnation IDs; cross-tenant references; duplicate ownership; cycles; spawning/restarting a supervisor from an actor; CONTROL calls outside a supervisor lifecycle capability.
- Mutating or structurally spoofing a `Failure`, trying to `catch` a panic locally, using actor `on_throw` / `on_raise` as supervisor CONTROL hooks, duplicate or unknown supervisor hooks, or retaining a mutable capability across an unchecked `await`.
- Treating a normal `send` / DATA `pipe` as a CONTROL escalation path; ordinary user messages cannot contain privileged supervisor tokens.

The trusted runtime authenticates source and destination supervisor IDs, direct-parent relation, tenant/runtime, logical child ID, incarnation, notice type and one-use decision ticket. Host policy actions and guest hook outcomes are observationally separate. A compiler may expose an opaque inspect-only failure value but must not serialize raw host objects or forge a writable `Failure.child`.

## Conformance and implementation status

Required evidence: positive nested A → B → C actor/supervisor source compilation and execution; actor-on-actor spawn inheritance; child-of-child panic localization; supervisor-budget exhaustion and one-step escalation; root failure policy; `#one_for_all` and `#rest_for_one` exact subtree restart; stale-generation and duplicate receipt rejection; full DATA/CONTROL queues; shutdown/restart races; cancellation, hook suspension and physical cleanup; privilege/cycle/cross-tenant negatives; five-backend full-AOT execution receipts.

The checked-in `tests/supervisor-hierarchy-model.test.mjs` is a **source-free reference-model smoke test**, not a parser, real scheduler, guest compiler or actor execution result. It only exercises deterministic topology, policy-span and shutdown-order invariants. All five backends remain `NOT_VERIFIED` for executable source hierarchies until separately authenticated exact-head guest runs exist. Unsupported compilers MUST reject the new intrinsics instead of silently substituting host-side supervision.

## Still PROPOSED / open for grammar review

The exact typed `spawn_*` signature/Result and Future effects; how immutable supervisor strategy/intensity is configured (manifest vs declaration annotation vs static hook); on_start/on_panic async suspension ABI; hook availability and default action (the [runtime guarantees chapter](18-runtime-guarantees.md) decides that a failed actor restarts by default, and proposes the rest); public versus module-local supervisor reference visibility; default root exit status; and depth/resource default limits. These require compiler-owner review and separate conformance decisions; **do not silently freeze them from this illustrative syntax**.
