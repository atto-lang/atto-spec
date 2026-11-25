# Atto Theater v1 — platform naming and component boundaries

**Decision:** Accepted architecture naming (2026-11-21).  
**Implementation status:** Design/organization contract only. No compiler or guest-runtime support is certified by this document.

AttoLang uses the **Atto Theater** identity for its actor application platform, analogous in *role* to Erlang/OTP, without assuming identical implementation or semantics.

## Canonical names

| Responsibility | Canonical name | Boundary |
| --- | --- | --- |
| OTP-style actor application platform | **Atto Theater** | Umbrella for higher-level fault-tolerant actor services and applications |
| Supervision framework | **Atto Director** | Child specifications, restart strategies, lifecycle policy, escalation and hot-upgrade coordination |
| Actor groups and message subscriptions | **Atto Ensemble** | ActorGroup membership, scoped registries, typed topics, subscriptions and pub/sub fanout |
| Underlying execution engine | **Atto Runtime** | Actor execution, scheduling, bounded mailboxes, isolation, capabilities, CONTROL/DATA delivery, memory and I/O primitives |

**Director**, **Ensemble**, and **Runtime** are subsystem/product names, not mandatory new keywords. Preserve established AttoLang-facing technical concepts such as `Supervisor`, `ActorGroup`, `Topic<T>`, `Subscription<T>`, `ActorRef`, and `ServerActor<Msg, Reply>`. In particular, do not rename `Supervisor` to `Director` in source language grammar.

### Ownership and layering

```text
Atto Theater (application platform / public composition)
  ├── Atto Director  (supervision and lifecycle policies)
  └── Atto Ensemble  (actor groups, registries, pub/sub, subscriptions)
           │
           ▼
      Atto Runtime   (engine: actors, mailboxes, scheduler, isolation)
```

- Theater is a cohesive product/documentation umbrella. Do **not** create an additional scheduler or duplicate the runtime simply to implement Theater.
- Director is policy built on authenticated runtime supervisor primitives. Application-level components may implement reusable policies in `.atto`; the runtime owns capabilities and CONTROL-lane admission.
- Ensemble is a policy/service layer using runtime actor messaging and membership primitives. Its broker and subscriptions are not privileged to forge supervisor messages.
- Shared reusable abstractions should be backend-neutral and defined in portable `.atto` where practical, with minimal capability-checked host/target primitives.
- Avoid dependency cycles: runtime never imports Theater/Director/Ensemble framework code. Director and Ensemble may coordinate through explicit public lifecycle hooks without reentering registry locks.

## Stable technical distinctions

### Atto Director

- Owns supervisor trees, typed child specs, `one_for_one`, `one_for_all`, `rest_for_one`, restart intensity, termination ordering, escalation, and application lifecycle policy.
- Actor `panic` remains supervisor-directed and **not interceptable by the panicking actor**. Supervisor CONTROL delivery remains separately authenticated from ordinary DATA messages.
- Hot-code upgrade and child replacement must preserve generation/epoch fencing, bounded cleanup, and ownership/capability safety. No claims of hot-upgrade completeness are implied here.
- Existing `Supervisor`, `ApplicationSpec`, typed server and state-machine APIs remain the technical public interface. `Director` is the named framework that houses them.

### Atto Ensemble

- **Membership is not subscription:** joining an `ActorGroup` only grants/discovers scoped membership; it does **not** silently subscribe an actor to topics or cause broadcast delivery. Topic subscription is separate and explicit.
- A single actor may belong to multiple groups where authorized. Membership, subscriptions and topic publishing must respect group/tenant scopes and capability ownership.
- Subscriptions are revocable and lifecycle-bound; stale actor incarnations, revoked handles and retired group generations must fail closed. Cleanup should be idempotent and must not trigger callbacks while holding group/registry/topic locks.
- Published DATA messages cannot be confused with supervisor CONTROL notices. Type restrictions, sendability/serializability, bounded queues and backpressure must be enforced at the proper boundary.
- Distinguish local atomic delivery contracts from any future remote/partitioned semantics. Distributed ordering, durability, replay, delivery guarantees and broker storage are **not** implicitly promised by the name Ensemble.
- Preserve existing public `ActorGroup`, `Topic<T>`, and `Subscription<T>` names; introduce no special compiler syntax solely for branding.

### Atto Runtime

- Continues to own the actor scheduler, work budgeting, isolated memory, actor incarnation identity, mailbox admission, transport-safe envelopes, timers/I/O primitives, and authenticated priority CONTROL paths.
- Provides stable capability-checked interfaces to Director/Ensemble rather than embedding high-level restart policy or pub/sub subscription logic in every compiler backend.
- Backend-specific engines may differ internally, but observable guest semantics require independent conformance evidence.

## Public layout and naming guidance

Suggested conceptual package/module tree, **not a requirement to rename existing modules**:

```text
atto-theater/             # optional umbrella/meta package
  director/               # Supervisor and application-lifecycle policy
  ensemble/               # ActorGroup, topic, subscription and registry policy
atto-runtime/             # host/backend runtime engines (independent)
```

Existing repositories and modules remain authoritative until a separate audited migration explicitly moves them. Do not assume `atto-theater`, `atto-director`, `atto-ensemble` or `atto-runtime` repositories already exist. Prefer preserving in-flight actor/OTP and pub/sub implementation work rather than starting competing implementations. All callable names remain `snake_case`.

## Implementation and proof requirements

1. Inventory and integrate existing portable OTP-style actor-library work in [atto-common-source#74](https://github.com/atto-lang/atto-common-source/issues/74), including typed servers/state machines, Supervisor policies, timers and application lifecycle.
2. Make Director's supervisor primitives coherent with [Java runtime supervision tracking](https://github.com/atto-lang/atto-source.java/issues/114). Test bounded restarts, nested failures, supervisor-only panic, generation safety and shutdown order.
3. Make Ensemble's ActorGroup/pubsub separation explicit. Cover membership without subscription, authorization failures, cross-group isolation, duplicate join/leave, cancellation, unsubscription, stale incarnation and group retirement. Include lock/callback reentrancy regression coverage from [Java group cleanup audit](https://github.com/atto-lang/atto-source.java/issues/438).
4. Register executed positive and negative **guest** conformance cases in [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance), and run against all supported `atto-source.*` backends. Record exact commit/tree, target, toolchain, number of executed steps, and outcomes `passed`, `failed`, `unsupported`, or `not executed`. Host-model-only, parser-only, and zero-step CI are not guest pass evidence.
5. Introduce public docs and examples using Theater/Director/Ensemble branding **without** breaking preexisting source/API names or conflating ActorGroup discovery with pub/sub delivery.

**Out of scope for this decision:** changing AttoLang grammar; inventing new actor keywords; claiming OTP-equivalent maturity; introducing automatic group subscriptions; rewriting existing runtime/backends; or releasing a new framework package before runnable conformance evidence exists.
