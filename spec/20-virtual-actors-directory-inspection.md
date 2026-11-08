# 20 — Virtual Actors, Logical Identity, Directory and Inspection

**Status: DRAFT / TARGET.** This chapter defines the language/runtime contract. It does not claim that any backend currently compiles or executes virtual-actor source. Backend status must be recorded separately with exact-head guest execution receipts.

## 1. Virtual actor is a logical actor, not a proxy

A **virtual actor** is a runtime-managed logical actor whose identity exists independently of any one in-memory activation. The runtime may activate it on first use, keep it active, passivate it after an idle period, or recreate it after failure or host loss. At most one authoritative activation may process a given logical identity at a time within its declared consistency domain.

The language distinguishes:

- **Actor declaration/type** — the nominal source type and behavior.
- **Virtual actor identity** — stable logical identity, independent of process, host, carrier, activation, and restart.
- **Activation** — one physical incarnation currently executing that logical actor.
- **Actor reference** — typed, stable capability used to address the logical actor; resolution follows the current valid activation.
- **Activation reference** — optional diagnostic/management handle bound to one activation generation; it must never silently retarget a replacement.
- **Proxy actor** — an ordinary actor that forwards, adapts, filters, batches, observes, or delegates messages to another actor. A proxy has its own identity, mailbox, lifecycle and supervisor. It is not the target's identity, directory entry, activation lock, or supervisor.
- **Supervisor** — lifecycle authority over direct children and their activation attempts; see [chapter 13](13-supervisor-hierarchies.md).

A proxy may hold a virtual actor reference and forward to it, but forwarding does not merge identities or transfer supervision ownership. A virtual actor does not require a proxy actor to be addressable.

## 2. Identity and address types

The stable logical identity is a structured tuple, not a string supplied by a caller:

`VirtualActorId = (RuntimeDomainId, TenantId, NamespaceId, ActorTypeId, Key)`

The key is an opaque, bounded, canonical value whose equality is defined by the declared key type. String keys are normalized to Unicode NFC before identity comparison; invalid UTF-8/UTF-16, control characters, over-limit byte length and ambiguous normalization are rejected. Identity includes the type and namespace so equal keys in different actor types/namespaces cannot collide.

The following concepts must not be conflated:

- `VirtualActorId`: stable logical identity.
- `ActorAddress`: a versioned, transport-neutral locator containing the logical ID and optional routing hints. Routing hints are advisory and can expire.
- `ActivationId`: runtime-minted physical activation identity.
- `ActivationGeneration`: monotonically increasing, non-reused fencing generation for the logical ID.
- `HostId` / `NodeId`: placement metadata, never identity.
- `SupervisorId`: logical supervision identity, distinct from actor identity.

Addresses are versioned and opaque to guest code. A serialized address is not itself authority: each operation revalidates tenant, namespace, actor type, capability, generation and current directory ownership. Address parsing must reject malformed, oversized, unknown-version and cross-tenant forms before lookup. Do not expose raw pointers, heap offsets, carrier IDs, scheduler handles, credentials or directory lease secrets in addresses.

## 3. Declaration and reference acquisition

Illustrative target syntax (not yet executable backend parity):

```atto
define virtual actor Cart as
  state {
    let int item_count: 0
  }

  receive(AddItem message) -> void ::
    self.handle_state(critical-write |s| -> {
      s.item_count = s.item_count + message.count
    })
  end

  get_count() -> int ::
    return self.handle_state(critical-read |s| -> s.item_count)
  end
end

val cart = VirtualActor.get<Cart>(namespace: "shop", key: "cart-42")
val count = await cart.get_count()
```

`VirtualActor.get<T>` returns a typed logical reference; it MUST NOT create or activate the actor merely because the reference was obtained. The first admitted invocation may request activation. Exact constructor, key and result types remain subject to parser/type/effect conformance review. The parser must reject a virtual actor declaration until the backend has implemented its complete identity, activation, state and supervisor contract; recognizing the keyword alone is not support.

A typed virtual actor reference is a restricted capability. It supports only the source methods explicitly exported for remote/logical invocation, plus safe metadata inspection. It does not expose a mutable activation, state pointer, mailbox internals, supervisor CONTROL handle or arbitrary host object. Functions, closures and lexical environments are never transported as invocation arguments.

## 4. Directory and activation protocol

The directory maps one logical identity to its current activation authority and fencing generation. It is a control-plane service, not an ordinary user actor and not a proxy.

A local in-process registry may implement the same interface for a single-node profile. A clustered/distributed profile requires a linearizable or equivalently fenced authority protocol; an eventually consistent cache alone is insufficient to authorize activation or writes.

Activation is a staged protocol:

1. **Resolve** the canonical logical ID and authorize the caller. Lookup does not activate.
2. **Reserve** a fresh, monotonically increasing generation and an exclusive activation lease/claim using an atomic compare-and-set or consensus-backed equivalent.
3. **Initialize** a candidate activation in private, unpublished memory. Allocate its quotas, actor heap/region, stack/continuation resources, mailbox accounting, supervisor receipt capacity and durable-state view.
4. **Restore** committed state and schema version under explicit migration rules. A candidate must not serve calls while restoration is incomplete.
5. **Publish** only if the exact reservation token, generation, lease and supervisor authorization remain current. Publication is the activation linearization point.
6. **Admit** invocations only through the published current generation; all ingress rechecks the fencing token at the boundary.
7. **Retire** by fencing new work, settling in-flight calls and receipts, persisting the last committed state, releasing resources, and revoking the activation lease.

If initialization, restore, publication or supervisor admission fails, abort the candidate, release reservations, burn (never reuse) its generation, and leave no partially visible activation. A failed candidate must not overwrite the currently committed state.

### Fencing and split-brain

Every state commit, mailbox admission, response completion, deactivation and directory mutation is checked against the activation generation and current lease/fencing token. A stale activation may finish local cleanup but cannot publish state, send as the current actor, or complete a new caller's request. Lease expiry alone does not prove the old activation has stopped; a replacement requires a fencing mechanism that makes stale writes and side effects rejectable.

An activation must renew its lease within bounded timing rules. Loss of directory authority transitions it to a non-serving/quarantined state. It must not continue serving from a stale cache. A network partition may reduce availability; the runtime must prefer single-authority safety over two concurrent writers.

## 5. Calls, mailboxes, state and persistence

Virtual invocation uses the same typed message ownership, bounded mailbox, DATA/CONTROL separation, turn serialization, cancellation and structured-concurrency rules as ordinary actors. Remote transport does not weaken those rules. Each request has a bounded correlation identity, caller authority, deadline, cancellation state and target generation fence.

A successful enqueue means **admitted**, not processed. A successful method result means the target turn committed its state and outbound messages according to the transaction boundary in [chapter 18](18-runtime-guarantees.md). A caller disconnect or timeout does not imply the operation did not commit; mutation APIs that need retry safety must accept an idempotency key and deduplicate it within a declared retention bound. The language does not promise exactly-once delivery across arbitrary network failures.

Persistent state belongs to the logical identity, not to the transient activation heap. The activation receives a bounded, ownership-checked view. An actor restart or relocation restores the latest committed state. Schema evolution is explicit, versioned and atomic; incompatible state must fail activation or use an approved migration, never be silently reinterpreted. In-memory tenant-local and durable cross-process tiers retain their separate failure guarantees from chapter 18.

Queued messages may be retained only according to an explicit delivery/replay policy. The runtime must distinguish not-started, in-flight, committed and abandoned operations. It must never replay an in-flight non-idempotent operation as though it were known not to have run. Side effects outside the transaction boundary require application-level idempotency/outbox protocols.

## 6. Supervisor integration

A virtual actor has one stable logical owning supervisor identity and one current activation generation. The supervisor owns activation attempts, restart budgets, child receipts, health transitions and permanent termination. An activation restart does not create a new logical child or transfer it to a different supervisor.

The supervisor registry should key child ownership by logical actor ID, then track the active activation generation separately. The parent receives terminal failure CONTROL for the exact failed generation. Duplicate, delayed, stale and out-of-order notices are idempotently rejected or reconciled; a stale notice must not restart or stop a newer activation.

The supervisor can:
- inspect logical identity and current lifecycle/health metadata;
- inspect the current activation generation and placement metadata subject to authorization;
- request a restart, graceful passivation or terminal stop through explicit management capabilities;
- enumerate only its direct children (with bounded pagination);
- receive activation and directory lifecycle events on its reserved CONTROL lane.

A supervisor MUST NOT mutate activation internals or bypass state commit/ownership rules. Cross-supervisor inspection requires an explicitly delegated, read-only capability or root authority. Reparenting is prohibited by default; any future transfer requires a separate atomic ownership-transfer protocol that fences both old and new parents.

## 7. Inspection and lookup APIs

The runtime must make an actor inspectable by logical ID, canonical address or a typed reference without requiring a caller to know the host or current activation. Inspection is a query and MUST NOT activate, passivate, restart, or otherwise mutate the target.

Illustrative target API:

```atto
val ref = VirtualActor.get<Cart>(namespace: "shop", key: "cart-42")
val info = await supervisor.inspect(ref)
val by_id = await supervisor.inspect_id(cart_id)
val by_address = await supervisor.inspect_address(address)
```

The exact API name/signature remains open, but the semantic split is mandatory:

- `resolve(address)` validates and returns a logical reference; no activation side effect.
- `inspect(id|address|ref)` returns a snapshot of metadata and status; no activation side effect.
- `locate(id)` returns a time-bounded placement hint; it does not authorize traffic.
- `ensure_active(ref)` is an explicit lifecycle request, authorized and budgeted by the supervisor.
- `restart(ref)`, `passivate(ref)`, `stop(ref)` are separate privileged management actions, never aliases for lookup.
- `invoke(ref, method, args)` is subject to type, capability, quota, deadline and activation-fence checks.

Inspection snapshots are immutable, bounded and timestamped/versioned. A snapshot may be stale immediately after return; include the directory revision and observed generation so callers can detect staleness. Do not return mutable live runtime objects or claim that an inspected activation remains current. A public health endpoint should reveal only the minimum configured metadata; tenant IDs, key values, topology, stack traces and failure details may be sensitive and require scoped authorization/redaction.

Suggested fields include: logical ID (redacted or opaque as policy requires), actor type, namespace, lifecycle state, activation generation, placement hint, supervisor identity, created/last-activated/last-invoked times, last successful commit revision, mailbox count/bytes, in-flight count, restart count/budget status, lease health, schema version and a bounded sanitized last-failure summary. Never include secret lease material, host pointers, raw exceptions, actor state contents or message payloads in a generic inspect response.

Supervisor enumeration is paginated with a maximum page size, stable cursor bound to supervisor generation and directory revision, per-tenant quotas and cancellation. No unbounded list-all API. An expired cursor or changed supervisor generation returns an explicit stale-cursor result.

## 8. Security, isolation and quotas

All directory operations are tenant- and namespace-scoped. A guessed ID or address must not permit cross-tenant enumeration, activation, invocation or management. Normalize and authenticate before cache lookup to avoid leaking existence via timing or detailed errors. Use non-enumerable IDs where the threat model requires it.

Enforce bounded limits for key bytes, namespaces, directory entries, pending activation attempts, concurrent activations, idle retention, invocation bytes, outstanding calls, mailbox bytes, query pages, lease renewals, state size, migration work, restart attempts and diagnostic data. Admission is atomic across coupled resources. Exhaustion returns a typed result and must not leave a ghost directory entry or orphan activation.

Do not run user code while holding a directory/registry lock. Directory locks protect only bounded metadata transitions. Activation initialization, guest hooks, I/O, supervisor code and message delivery execute outside registry critical sections. No task parks a carrier thread while waiting for a directory lease, mailbox capacity, remote node, or activation.

Directory metadata and activation authority are distinct from actor-owned heaps, actor regions, carrier stacks, TLS, Task-LS and ALS. A directory entry does not prove heap isolation or OS sandboxing. Host/tenant isolation guarantees remain those of the selected validated runtime profile.

## 9. Deactivation, placement and cluster membership

Idle passivation is a policy decision with a bounded race-safe admission fence. If an invocation races passivation, exactly one wins: the request is admitted to the current generation or receives a retryable typed result and is routed after a new activation is published. It is never processed by two activations.

Placement is a runtime concern. Actors may be pinned, region-affine or movable according to declared policy, but placement hints are not authority. Node departure, rolling upgrades and relocation use the same generation-fencing protocol. A new node restores committed state before publication; the old node is fenced before the new one serves. Hot code upgrade also binds activation generation to the code/schema generation and refuses incompatible state restoration.

No cluster-wide availability or exactly-once claim is made without a specified membership, quorum, lease-clock and durable-state protocol. Single-process virtual actors and distributed virtual actors share the API contract but must advertise different validated profiles.

## 10. Proxy actor contrast

| Concern | Virtual actor | Proxy actor |
| --- | --- | --- |
| Identity | Stable logical identity survives activations | Own ordinary actor identity |
| Mailbox | Runtime-owned logical endpoint | Its own mailbox |
| Lifecycle | Activation may be created/passivated/recreated | Explicitly spawned/stopped/supervised actor |
| Addressing | Directory resolves identity to current activation | Direct actor reference or its own published address |
| State | Stored with logical identity across activation changes | Own actor state unless separately persisted |
| Supervision | Stable logical child ownership across activations | Supervised as an ordinary actor |
| Forwarding | Not inherently a forwarding layer | Core behavior may forward/delegate |
| Main purpose | Identity, lifecycle virtualization and transparent location/activation | Composition, interception, adaptation, routing or isolation |

A proxy may itself be a virtual actor only if explicitly declared with both semantics and both lifecycles; do not infer that from forwarding.

## 11. Required adversarial conformance

The shared fixture suite must cover at least:

1. Two concurrent first lookups race to activate one logical key: exactly one published activation.
2. Failed initialization aborts and burns its generation; next activation gets a higher generation.
3. Stale activation tries to commit after lease transfer: write rejected.
4. Network partition produces competing candidates: only fenced owner can serve/commit.
5. Passivation races invocation: one linearization winner, no duplicate processing.
6. Restart with queued-but-not-started messages preserves documented ordering and committed state.
7. In-flight non-idempotent request times out after commit: retry does not claim non-execution; idempotency-key behavior is bounded and tested.
8. Delayed/duplicate supervisor failure receipt cannot affect a newer activation.
9. Proxy forwards to a virtual actor without changing either identity or ownership.
10. Ordinary proxy restart does not restart its virtual target; target restart does not silently replace proxy identity.
11. Inspect by ID/address/ref does not cause activation or reveal cross-tenant existence.
12. Inspect snapshot becomes stale after restart and exposes a changed generation/revision.
13. Enumeration cannot escape direct-child scope, bypass pagination or exceed quotas.
14. Stale address, bad version, malformed Unicode, oversized key and cross-tenant address are rejected.
15. Directory shutdown with outstanding activation tickets and admitted invocations settles each ticket exactly once.
16. State schema mismatch/migration failure does not publish the candidate or overwrite committed state.
17. Full DATA queue does not block CONTROL terminal receipts or supervisor inspection.
18. Supervisor restart budget exhaustion terminates/reconciles the logical child exactly once.
19. Unauthorized caller cannot force activation, passivation, restart, stop, reparent or inspect diagnostics.
20. Registry close/deactivation races leave no published-but-unowned activation or leaked capacity.

Every positive and negative fixture must compile and execute against each supported backend, and differential outputs must agree. Host-only registry tests validate registry code only; they do not prove scheduler integration, guest source lowering, durable state, cluster consensus or remote transport.

## 12. Implementation gates

1. **Java reference:** connect the existing `VirtualActorActivationRegistry` to the actual actor runtime, stable logical `ActorRef`, supervision, state store and message invocation. The current registry is only a local admission primitive and deliberately does not deliver messages or issue CONTROL notices.
2. **Guest source:** add typed AST/HIR/ownership/effect representation and compile/runtime lowering for `define virtual actor`, typed references, resolve/inspect/invoke and lifecycle management. Until complete, reject guest declarations explicitly.
3. **Local executable slice:** one-process activation with concurrent first-use, generation fencing, bounded mailbox, stored state and supervisor receipts; execute source-level fixtures.
4. **Cross-backend contract:** publish versioned identity/address/activation/inspection fixtures and port semantics to LLVM, .NET, Wasm and Forge/Cranelift.
5. **Distributed profile:** only after local semantics are sound, specify membership/lease/quorum, state replication, handoff and node-failure receipts. Do not claim Orleans-like cluster transparency from a local map or address type.

Each gate needs exact source SHA/tree, nonzero executed steps, test command, test count, native guest artifact/receipt where applicable, negative mutation evidence, and independent review. Empty/null workflow steps mean runner admission failure, not a virtual-actor test failure or pass.
