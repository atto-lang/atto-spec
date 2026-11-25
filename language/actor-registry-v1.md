# Keyed actor registration and virtual identity v1 (candidate)

**Status:** Proposed normative contract; NOT an assertion of compiler, runtime or cross-backend implementation. Existing actor-generation, sealed-state, mailbox and CONTROL requirements continue to apply.

## Identities

1. **Logical identity** is the typed tuple (namespace, actor_type, application_key). Namespace includes tenant/vhost as applicable. Key equality/hash must be deterministic and bounded; identity may not be inferred from an untrusted string alone.
2. **Physical identity** is (runtime_epoch, actor_id, incarnation) for exactly one actor activation. An ActorRef<A> identifies only this incarnation and MUST reject sends after it retires. It cannot transparently retarget a replacement.
3. **Registration token** is an opaque authority for removing one registration. It includes unique epoch and non-reused generation information: stale cleanup MUST NOT erase a successor. A restarted registry gets a fresh epoch.
4. **Virtual identity** is the logical tuple plus authorization context, exposed through VirtualActorRef<A>. Such a reference may be obtained before activation; it is not proof that an entity exists or that a message has been delivered.

## Candidate standard-library API

These signatures are illustrative, not yet accepted .atto syntax:

- ActorRegistry<K,A>.local(name)
- registry.lookup(key): Option<ActorRef<A>>
- registry.get_or_create(key, factory): Result<ActorRef<A>, RegistryError>
- registry.unregister(key, registration_token): Result<bool, RegistryError>
- ActorDirectory<K,A>.distributed(name)
- directory.ref_for(key): VirtualActorRef<A>
- directory.resolve_existing(key): Result<VirtualActorRef<A>, RegistryError>

The unique local registration operations MUST be linearizable per typed logical key. Concurrent get_or_create calls MUST publish at most one live registration and see the winner. Factory execution MUST NOT hold a global directory mutex. Waiters MUST be woken when a factory fails, with the key available for another attempt. Recursive creation of the same key MUST fail rather than deadlock. Registry implementations MAY shard locks and use a steady-state reference cache.

Unregister MUST compare the exact registration token, including epoch and generation. If absent or stale, it returns false without changing a newer mapping. A generation MUST never roll back within one registry epoch even after an entry is removed. Lookup does not activate an actor and does not guarantee that the target remains alive when the caller subsequently sends; mailbox admission performs the final liveness/generation check.

## Messaging, ownership and lifecycle

- An ActorRef<A> never grants access to sealed state. Typed receives/sends, actor isolation, and take!/copy!! payload semantics apply unchanged.
- A VirtualActorRef<A> may resolve the current activation after prior passivation/restart, but a retry is NOT an exactly-once message guarantee. Explicit correlation IDs, acknowledgement and deduplication are domain protocols.
- A stopped actor invalidates its physical refs, mailbox admissions, registration token, settled-message tokens and resource handles. A successor must have a distinct incarnation; old requests must never run on the new owner via a stale physical reference.
- ActorGroup<A> denotes potentially multiple members and has different semantics from unique keyed registration.
- Distributed placement requires owner fencing, lease/consensus semantics, stale-cache invalidation, partitions and backpressure before production claims. In-memory map uniqueness does not guarantee single-writer queue storage after split brain.

## Broker applications

For a RabbitMQ-compatible clone use key (vhost, queue_name) in namespace/type QueueActor. A broker must first validate declarations, permissions and exchange bindings. Merely constructing ref_for(key) MUST NOT create a queue. resolve_existing(key) MUST reject undeclared/deleted queues, even if a stale directory entry or virtual reference exists. Passivation is not queue deletion.

Queue metadata and durable messages belong to separate storage. The queue leader actor owns a fencing epoch; storage rejects writes from previous epochs. A queue registry is a routing cache, not the durable authority for queue existence. Access control must be enforced at resolution and delivery or by equivalent scoped capabilities; guessable names alone do not authorize use.

## Required conformance evidence

1. 16+ simultaneous same-key callers create one registration; distinct keys progress independently.
2. Factory exceptions wake waiters; same-key recursive factories fail.
3. Delayed cleanup, wrong-epoch registration and stale generation cannot remove a successor.
4. Physical references become stale after retirement, but virtual keys remain stable without implicitly activating anything.
5. Namespace/type boundaries and undeclared queues are enforced.
6. A host-only executable reference model is useful but MUST be labeled HOST_ONLY. Compiler/guest parity, persistence, automatic activation, and distributed fencing require separate execution receipts pinned to source SHA.

See atto-lang/atto-platform-conformance contracts/actor-registry-v1.json for the host-reference conformance proposal.