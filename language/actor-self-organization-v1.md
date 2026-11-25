# Actor self-organization, topology authority, and telemetry sidecars v1

**Status: normative design candidate; NOT compiler-admitted or end-to-end implemented.**
This contract extends [keyed actor registration](actor-registry-v1.md). It does not
make the host `ActorRegistry`, supervisor CONTROL lane, or arbitrary
`ActorGroup` controls guest-accessible. AttoLang backends MUST fail closed
rather than interpret the examples as supported syntax without guest evidence.

## Goal and boundaries

An actor may describe its intended **purpose** and ask an authorized
topology service to (a) find an existing upstream/downstream neighbor,
(b) find or create a named neighbor, (c) ensure an exact number of
supervised children, or (d) attach a telemetry sidecar. It may NOT
self-grant permission to spawn arbitrary actor types, inspect sealed
state, choose another tenant's actor, or seize another supervisor's child.

The runtime/supervisor owns a **TopologyAuthority**. A guest holds a
narrow, immutable `TopologyCapability` issued by its supervisor, bound to
(tenant, graph ID, caller actor ID and generation, supervising identity,
allowed operations, allowed actor types/purposes, limits, expiry/revocation
epoch). A purpose or logical name is a selector, **never a credential**.

All control-plane operations are async/suspending and return typed
`Result<..., TopologyError>`. They run on a dedicated bounded
management lane, not inline inside an actor critical section, on a
scheduler/control carrier, or under a registry/global topology lock.
These are *application orchestration requests*, never supervisor
panic/STOP/RESTART CONTROL messages.

## Candidate actor-facing API (illustrative .atto, not currently executable)

```atto
// topology is a supervisor-granted typed capability, not a global singleton.
pub suspends fnc configure(
    Topology<Readings> topology
): Result<void, TopologyError> {
    // Discovery is nonactivating. A missing upstream is a normal None.
    val upstream = await topology.find_upstream<Readings>(
        purpose=#sensor_source
    );

    // A stable key selects one logical target, not a random live actor.
    val sink = (await topology.find_or_create_neighbor<Readings>(
        direction=#downstream,
        purpose=#aggregate,
        key="readings/aggregator",
        actor_type=Aggregator
    ))?;

    // Supervisor validates port types, quotas, generations, and graph version.
    (await topology.connect_to(sink, port=#readings))?;

    // Exactly 2 logically named children under this actor's owning supervisor.
    val children = (await topology.ensure_children<ParserWorker>(
        purpose=#parse,
        count=2
    ))?;

    return Ok();
}
```

The specific method spelling and overload resolution are proposed, not reserved
parser keywords. Existing `spawn A() pipe spawn B()`, typed `ActorRef<T>`,
`PipeSource`/`PipeSink`, and `ActorGroup` remain distinct surfaces.
Avoid silently promoting an ordinary actor to a pipe stage.

## Identities, selection, and authorization

- The logical service key is **(tenant, graph scope, actor type, purpose,
  stable application key)**. All components are normalized, bounded, and
  unambiguous; a lookup does not create anything. A physical handle includes
  its runtime and nonreused incarnation. No name or numeric ID alone grants
  send, read, graph-edit, spawn, or lifecycle authority.
- `find_upstream`/`find_downstream` filter only *published, live, authorized*
  edges in the caller's current graph generation. Absence and more-than-one
  candidate are explicit outcomes; selection MUST be deterministic or demand
  an explicit selector. No cross-tenant fallback or unspecified first match.
- Discovering a candidate does not imply a writable endpoint. Separately
  minted, nominally typed inbound/outbound port capabilities authorize DATA
  sends. The final mailbox admission rechecks actor lifetime and revocation.
- The supervisor exclusively owns child lifecycle. A graph neighbor, group
  membership, or telemetry sidecar **does not** acquire stop/cancel rights.
  Cross-supervisor links require explicit grants from both authorities.
- Creator types and factories are allowlisted under a trusted supervisor.
  Guest-supplied code, class names, effectful callbacks or arbitrary import
  strings cannot be used as privileged host factories. Quotas cover actors,
  per-parent children, graph edges, pending reservations, timeouts, retries
  and telemetry subscriptions. No implicit unbounded retry or remote scan.

## Atomic acquisition and graph transactions

`find_or_create_neighbor` is single-flight for one logical key, including
concurrent callers and restarts, consistent with actor-registry-v1.
`ensure_children(purpose, count)` is a *reconcile-to-exact-count* operation,
not `spawn count more` every time. Child slot keys are stable
`(parent logical identity, parent incarnation, purpose, slot index)`.
The supervisor never re-parents an already owned actor without an explicit
supported transfer protocol.

A batch follows **reserve → validate → initialize → publish or rollback**:

1. Validate caller grant and expected graph/supervisor generation, exact
   requested cardinality, types, and all budgets. Reserve all missing
   logical keys and edge/child resources before running any factory.
2. Run trusted factories outside topology/registry monitors. Workers remain
   **not DATA-admissible** until the whole transaction is ready. Concurrent
   overlapping reservations join the same transaction or receive a
   retryable conflict; two independent callers may not publish duplicate
   live children for one slot.
3. On success, atomically publish all new children and port connections in
   one graph revision, then lift readiness barriers. Previously published
   children may be reused only with exact owner/type/tenant/port checks.
4. On failure/revocation/timeout, publish **none** of the new batch; stop
   newly allocated, privately held children and await physical completion
   before reclaiming keys/arenas. Existing children are untouched.
   If rollback cannot prove physical completion, quarantine the reservation
   instead of allowing an overlapping replacement.
5. A logical idempotency key plus request epoch prevents duplicate creation
   after a lost response. A successful commit acknowledges *topology
   publication*, not eventual message processing or durable delivery.

Connecting/disconnecting edges is a separate version-checked transaction
requiring an exact nominal message schema, valid direction, endpoint
generation, bounded channel credits, and zero mutable loan crossing.
Generic graph edits reject cycles by default. Feedback cycles require an
explicit typed delay/buffer policy and cycle-aware deadlock proof.
Reject partial fan-out publication and duplicate edges. Revocation,
retirement, supervisor restart, or code hot-upgrade invalidates old
topology/port capabilities and removes or fences stale edges before reuse.
Existing in-flight DATA follows a documented drain/drop policy; the CONTROL
path always remains independent and prioritized.

## Sidecar actors: observability and telemetry

A telemetry sidecar is an **independently supervised consumer** of
runtime-produced *immutable, sanitized* observation events. It is not the
observed actor's child by default, a pipeline DATA stage, or an object
with access to the observed actor's heap. A sidecar may be scoped to one
actor, actor family, graph, ActorGroup, or tenant. Policy determines whether
one sidecar is shared or one is provisioned per actor/graph.

Runtime probes emit optional events such as:
`actor.started`, `actor.terminated`, `mailbox.admitted`,
`mailbox.backpressure`, `graph.edge_committed`,
`graph.edge_retired`, `span.started`, `span.ended`, and
`supervisor.failure_notice`. CONTROL remains the exclusive path for
supervision, not a general telemetry export queue. Event receipts carry
authenticated (tenant, actor ID + incarnation, graph revision, sequence,
trace/span context, monotonic timestamp) metadata, without actor-owned
mutable memory or raw error payloads.

The observer subscription is **read-only**, capability-scoped and revocable.
All telemetry export runs asynchronously in its own execution and failure
domain, through bounded queues with an explicit LOSSY/LATEST/RELIABLE policy.
For the default LOSSY path, when full, *drop with an aggregate loss counter*
rather than block or panic the observed actor. RELIABLE may backpressure its
own dedicated observation producer, but MUST NOT park a user actor's
critical section or compromise priority CONTROL. Sampling/switch changes
are authenticated runtime policy updates and cannot retroactively
instrument code sites that were not compiled with a probe.

The sidecar cannot mutate the graph, stop another actor, forge supervisor
events, or implicitly access span attributes containing sensitive values.
Sidecar crash/restart does not crash or pause the observed actor; supervisor
restart policy can restore the sidecar with a fresh generation and subscription.
Snapshots and replay must respect incarnation, retention, tenant and privacy
bounds. For strict audit obligations, use a *separate durable audit sink with
explicit admission semantics*, not falsely label lossy telemetry as durable.

## Required failures and proof matrix

Backends must provide source-level guest proof for each supported operation,
not only host models or compiler parsing:

1. N same-key callers → one incarnation; different keys make progress; factory
   failure, recursion, timeout and cancellation release or quarantine slots.
2. Two concurrent `ensure_children(2)` requests → exactly two published
   children, not four; partial factory failure publishes zero new children.
3. Revocation during creation; owner stop; parent restart; stale graph
   revision; stale ActorRef and ABA reuse; physical teardown delays.
4. Typed upstream/downstream selection, ambiguous selector rejection, wrong
   nominal port type, cross-tenant lookup, unauthorized actor type, forged
   grant, cross-supervisor control request and quota exhaustion.
5. Mid-transaction graph failure, mismatched endpoints, cycle rejection,
   explicit feedback policy, data backpressure and CONTROL non-starvation.
6. Sidecar attachment/detachment; bounded queue loss accounting; sidecar
   failure independence; telemetry privacy; no sealed-state access; span
   propagation across suspension and code-generation changes.
7. Exact-SHA compiler + runtime execution on every claimed backend;
   differential message/supervisor trace comparison; native sanitizers and
   true worker/process fault isolation where applicable.

**Currently verified prerequisite, not end-to-end proof:** the legacy Java
host `ActorRegistry` supports keyed host get-or-create but deliberately
rejects guest actor calls; legacy `ActorPipelineContract` validates
static nominal roles; legacy `ScopedTelemetryProbe` is a local scope
primitive with no exporter. Existing stacked Java guest graph PRs and
AttoLang typed sends/pipe PRs must be reconciled before source lowering.
Do not merge by treating this design or a host-only model as parity evidence.
