# ActorGroup and typed pub/sub v1

**Status: TARGET / NOT_BACKEND_VERIFIED (2026-11-21).** This amendment defines the intended AttoLang source and runtime contract. The [portable conformance proposal](https://github.com/atto-lang/atto-platform-conformance/pull/280) is a source-free oracle, not executed compiler parity. The QoS and group-monitor proposals are [#451](https://github.com/atto-lang/atto-platform-conformance/pull/451) and [#452](https://github.com/atto-lang/atto-platform-conformance/pull/452). Do not claim that those PRs or this contract certify a backend.

## Three independent concepts

- **ActorRef<T>** addresses one bounded actor DATA mailbox and its exact incarnation. A direct send is not a publication.
- **ActorGroup** is a scoped, multi-membership cooperation and routing registry. An actor can join more than one group, and joining alone causes **no subscription or publication**. Group membership is not parenthood, supervision, state access or CONTROL authority.
- **Topic<T>** is a typed event identity. **Subscription<T>** is an independently revocable affine delivery edge. Publishing does not require subscribing; subscribing does not confer publication authority.

A typed group-scoped topic's identity is (broker instance, group identity, case-sensitive name, payload type). Names are ASCII, 1–128 bytes, matching `^[A-Za-z][A-Za-z0-9._/-]{0,127}$`. Defining one scoped topic with a different `T` fails `TopicTypeMismatch`. A separate group may define the same name without aliasing or sharing delivery policy. The first implementation is **in-memory, runtime-local**, without automatic persistence, replay or network federation. Redis/NATS/etc. require an explicit adapter with separately stated semantics.

## Illustrative source surface

The following is a **source contract target**, not a claim that all parsers or backends currently compile it. Publication happens in an **authorized group member actor turn**, not in anonymous root code. The spelling follows the existing Java compiler guest proposal; `try_publish` is the portable nonblocking admission target. The producer and subscriber startup handshake must be completed before triggering the first publication.

```atto
define actor AuditWorker as
  suspends receive(ActorMail<String> mail) -> void ::
    val topic = actor.group("payments").topic<String>("payment.completed")
    val subscription = topic.subscribe() // exact Result/Subscription API still requires guest proof
    // Send readiness to the coordinator before waiting for the first event.
    val event = await subscription.next()
    process_event(event)
    subscription.unsubscribe()
    await subscription.get_done()
  end
end

define actor PaymentPublisher as
  // Actor-local callable: its Result return type permits checked postfix ?.
  publish_once(topic: Topic<String>, event: String)
      -> Result<PublishReceipt, PublishError> ::
    val receipt = topic.try_publish(share! event)?
    return Ok(receipt)
  end

  suspends receive(ActorMail<String> mail) -> void ::
    val topic = actor.group("payments").topic<String>("payment.completed")
    val outcome = publish_once(topic, "p-1")
    // Explicitly handle Err/Ok here; a void receive handler cannot use ?
    // to propagate an Err. A successful receipt confirms admission only.
  end
end

pub suspends fnc main() -> void ::
  val group = actor.group("payments")
  val topic = group.topic<String>("payment.completed", "reliable", 32)
  val audit = spawn AuditWorker()
  val publisher = spawn PaymentPublisher()
  await audit.get_ready()
  await publisher.get_ready()
  val audit_membership = group.join(audit)?
  val publisher_membership = group.join(publisher)?
  audit.send("start")?
  // Wait for audit's explicit subscription-ready signal, then:
  publisher.send("publish")?
  // Revoke both memberships only after delivery/handler quiescence.
end
```

**Canonical ownership spelling:** the pub/sub publication form is `val receipt = topic.try_publish(share! event)?`. As specified by [the ownership-bang syntax PR](https://github.com/atto-lang/atto-spec/pull/185), `share!` is the preferred source spelling; `rt share` remains a compatibility alias, and [the formatter PR](https://github.com/atto-lang/atto-format/pull/70) should normalize it to `share!`. Both forms must lower through the **same** ownership/share proof, not two independent capability paths. `share!` must not fabricate sharing of borrowed, move-only, callable, mutable, actor-state, runtime-handle or otherwise non-Share values. The operand is evaluated exactly once. Failed admission must not leak or silently transfer ownership; any use-after-freeze/move must be statically rejected. A syntactically accepted `share!` is **not evidence** of `Topic<T>.try_publish` lowering.\n\n**The `?` example is deliberately in `publish_once` returning `Result<PublishReceipt, PublishError>`. A `void` actor `receive` cannot propagate `Err` using postfix `?`; the handler must explicitly handle its result.** This also avoids inventing a `subscribe()?` return signature before the subscription ABI is proven. The source is illustrative, not compiler-backed.

**Postfix `?` is a separate integration dependency:** [Java draft #735](https://github.com/atto-lang/atto-source.java/pull/735) already implements an experimental typed Option/Result propagation slice, but explicitly restricts actor/`suspends` contexts pending cleanup, lifetime and unwinding proofs. The current [Java pub/sub branch #1458](https://github.com/atto-lang/atto-source.java/pull/1458) has `share!` parser integration and deliberately rejects unlowered `try_publish`; it does **not** yet implement postfix Result `?`. The documented `try_publish(share! event)?` form must not be claimed executable until the typed receipt/error ABI and actor-safe propagation are integrated and guest-tested together. Ordinary ternary `?:`, optional cast `as?`, and type-level `T?` must keep their distinct parsing rules.\n\nThe authenticated actor turn and explicit delegated group authority are runtime capabilities, **not strings** or caller-supplied actor IDs. `group.join` requires join authority; `topic.subscribe` inside an actor binds the executing actor incarnation, and externally registering an actor or subscribing an entire group requires separate, validated scope authority. Do not expose a host method accepting a forged actor identity as the caller. Exact Result/ownership signatures and blocking vs suspended convenience wrappers require compiler+stdlib admission.

## Membership and subscriptions

1. Joining an existing membership is idempotent and **must not mint a second** affine `GroupMembership` token. Leaving or retiring invalidates that exact grant. A later rejoin gets a **new** grant/epoch; a stale grant can never act on the new membership. Joining two groups is independent.
2. Each live (topic, subscription target, kind) edge has one registration. Repeated subscribe with identical capacity reuses it, without a second quota charge or a second delivery. Different capacity fails `SubscriptionConflict` until the old edge is explicitly revoked and a new one admitted.
3. Actor-target subscription: deliver only to its one current actor incarnation, authorized for the topic's group. Group-target subscription: one delivery to each current live member of **that** group at publication admission. Membership changes alter future recipients, not already-started handlers.
4. Distinct edges are **not deduplicated**. If one actor subscribes independently through overlapping group-target edges, it may receive multiple envelopes. Neither membership nor any group reference alone grants permission to read or publish.
5. A subscription has a bounded, independent queue and revocation generation. `unsubscribe()` closes admission and future starts and **cancels queued-but-not-started** deliveries. Running handlers finish normally; `get_done()` is a quiescence barrier. In contrast, `Channel<T>.close()` drains already-admitted channel values: these are not equivalent operations.
6. Actor stop/panic/restart revokes old-generation memberships and direct subscription edges, cancels its unstarted group deliveries and fences late callbacks. Leaving group A must not revoke subscriptions or deliveries for independent group B. Closing a group closes all subscriptions scoped to its topics without killing unrelated members.

## Publication and delivery

**Portable core = `RELIABLE` only.** Publication validates live publisher authority for the topic's group, `Sendable` immutable shared payload ownership, target generations, broker/group state and all bounded per-recipient quota (queued + in flight). It atomically reserves **every** eligible recipient before assigning the next monotonic per-topic unsigned 64-bit sequence. If **any** recipient is full or the operation is busy/unauthorized, it fails **without** a partial enqueue, leaked credit, sequence increment, consumed payload or handler callback. A publication with zero recipients succeeds and consumes a topic sequence without retention.

Subscription events are read from a **dedicated bounded subscription queue** through `subscription.next()` / `try_read()`; publication does **not** implicitly inject a message into the actor's ordinary `receive(Message)` DATA inbox and never invokes actor code inline. An adapter may explicitly forward subscription events into DATA, subject to independent mailbox admission and error handling. This reconciles the current Java guest API with the portable model; the older conformance document describes direct `receive(Message)` routing and must be amended before declaring parity.

A successful `PublishReceipt` reports topic sequence and recipient *admission attempts*, **not** processing, delivery completion or durable acknowledgement. One successful publication produces at most one attempt **per eligible subscription-recipient edge**. Recipient queues start events in increasing topic-sequence order; concurrent publishers admit at one linearization order per topic. No total order is required **between topics**. No automatic retry, deduplication or exactly-once application effects.

`LOSSY` (drop saturated recipients) and `LATEST` (coalesce only unread values, never interrupt in-flight handlers) are **versioned optional policies**, not a silent fallback for RELIABLE. A backend that cannot implement the selected policy must reject it explicitly before executable output. `Topic<T>`, `Subscription<T>` and group/capability handles are not `Sendable` DATA payloads. A supervisor panic/raise notice uses the separate authenticated CONTROL path, never DATA pub/sub, and a publisher cannot invoke a subscriber guest callback inline while holding coordination locks.

## Group membership monitoring is a different channel

An optional Erlang-`pg.monitor`-style group monitor observes join/leave **metadata**, not topic events or supervisor failures. It requires the exact current membership grant, issues an atomic initial snapshot plus revision, then bounded immutable deltas. On overflow or revision gap the monitor reports an explicit error and requires authorized resynchronization. Monitors are revocable on leave, stop, group close and broker close. Production revision counters require epoch/rollover fencing; the source-free BigInt oracle is not a backend ABI guarantee.

## Mandatory acceptance

See [the machine-readable target/fixtures](../contracts/actor-pubsub-v1/contract.json) and [the source-free test](../tests/actor-pubsub-contract.test.mjs). Before marking any backend implemented: same-source typed positive and negative `.atto` fixtures, including `try_publish(share! event)?`, legacy-alias AST equivalence, unsafe share refusal, evaluation-once and full-queue ownership rollback; exact compiler+runtime head/fixture blobs; real nonzero-step runner receipts and guest output; RELIABLE contention/full atomicity; group overlap, late join, leave/rejoin, subscription cancellation, `get_done()`, actor restart and stale-token rejection; Sendable/ownership proof; sanitizer/native AOT where applicable. Track **all eleven `atto-source.*` repositories** independently: Java, LLVM, .NET, Wasm, Forge, Cranelift, Rust, JavaScript, HDL, self-hosted Atto, and real-time. The last two remain bootstrap-only candidates; unsupported hardware profiles require explicit compile-time denial, not fabricated guest passes. The 28-case all-backend acceptance gate lives in [atto-platform-conformance #551](https://github.com/atto-lang/atto-platform-conformance/pull/551). Unsupported syntax MUST fail closed before backend artifact emission. Host-only reference-model tests cannot certify guest parity.
