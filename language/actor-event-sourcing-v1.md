# Event-sourced durable actors v1 — AttoLang target contract

Status: **proposal / structural reference only** (2026-11-17). This is an additive policy to the `persistent` / `durable` actor modes; it does not implement a compiler, guest actor, event journal or cross-backend runtime.

This contract draws on the existing AttoLang actor/event-sourcing architecture working drafts. A separate shared ChatGPT page was supplied as design context but could not be retrieved; **this document does not assert that it reproduces that page**.

## Latest AttoLang language decision and syntax

AttoLang's more recent accepted decision distinguishes:

- `define persistent actor`: developer-owned `load_state` and `save_state` storage hooks. SQLite, PostgreSQL and other stores may be selected by application code.
- `define durable actor`: AttoLang-managed on-disk persistence. No user `load_state`/`save_state` override.
- `define actor`: ordinary volatile actor.

**Event sourcing is a storage policy, not another actor keyword.** A `durable actor` may select `#event_sourced`; an ordinary `durable actor` with `#snapshot` is NOT automatically event sourced. `#batched_sidecar` is a transport/scheduling choice, never a durability level. Unlike the older 10 November design draft, the 17 November decision **does allow** `persistent` and `durable` modifiers; do not rewrite them away.

The following is the **recognized actor declaration / scalar-state syntax** from the current Rust/browser parser feature branch. A host policy registry, not invented guest syntax, selects event sourcing:

```atto
// Target parse fixture; browser compilation intentionally fails closed
// until automatic persistence is implemented.
define durable actor BankAccount as
    state balance: int = 0;

    receive(ActorMail<int> mail): void {
        // Compiler/runtime-controlled event append is not implemented here.
    }
end

pub fnc main(): int {
    return 0;
}
```

Canonical lexical rules: `define [pub] durable actor Name as ... end`, `state field: Type = value;`, `fnc` for declared functions, `receive(ActorMail<T> mail): void {...}` for typed inbound mail, `snake_case` callable names, `|x| -> expression` for lambdas, and `#symbol` for policy identities. `eq`/`neq` are value comparisons; `==`/`!=` are identity comparisons. Maintain sealed `handle_state(critical-read |s| -> ...)` / `critical-write` access; never use unguarded direct actor state mutation in an event-sourced handler.

The current Rust/browser compiler **does not yet parse or emit** generic `EventSourcedActor<State, Command, Event>` methods, policy configuration values or event-sourced guest actors. Keep typed interfaces as **target-only**, never as claimed executable fixtures. In particular, do not substitute an inline annotation or invent an `event actor` keyword.

## Trusted runtime policy (not source syntax)

These are typed `Symbol` values, not string labels or an additional `durable` declaration modifier.

| Selector | Meaning |
|---|---|
| `#none` | no automatic persisted state |
| `#snapshot` | stored logical actor state; no authoritative domain-event log |
| `#event_sourced` | immutable ordered domain-event stream is authoritative; state is a projection |
| `#batched_sidecar` | batching/transport only, requires a separate underlying persistence policy |

A trusted runtime configuration chooses exactly one underlying state policy. `#batched_sidecar` may wrap `#event_sourced` or `#snapshot`, but never creates a durability guarantee by itself. Storage identity is `(tenant, namespace, actor_type, actor_key, state_slot)`; `ActorRef` and user-supplied path/epoch cannot impersonate this authority.

## Typed event-sourcing contract (TARGET API, NOT PARSER VERIFIED)

The proposed typed contract is `EventSourced<State, Command, Event>` with two domain-pure operations: `decide(state: State, command: Command) -> Result<Array<Event>, Error>` and `apply_event(state: State, event: Event) -> State`. They are snake_case and must have no I/O, mailbox sends, timestamps, ambient randomness, storage access, or shared mutable state. The compiler must prove purity/effects before admitting an executable actor. If these generic signatures are not accepted by a particular frontend, that frontend MUST reject them; do not downgrade types or effects to make them compile.

The trusted runtime alone owns the storage operation (`persist_async`), commit receipt, replay cursor, actor epoch, and publication of sealed authoritative state. The user-supplied `decide` and `apply_event` implementations never obtain a provider credential or write a sealed field directly.

## Command transaction and recovery

A single in-flight mutating command per actor state slot is the v1 baseline:

1. Authenticate ingress, derive tenant and actor identity, validate mailbox budget and operation ID. Resolve a typed command to its intended actor.
2. Read only **committed** actor state via an authorized critical-read scope; generate an immutable **owned** event batch with `decide`. No user-visible write and no loan may survive suspension.
3. Release all critical locks/borrows. Stage serialized events and outbox entries through the trusted bounded persistence sidecar.
4. The provider atomically checks **epoch first**, then operation-ID/payload-digest deduplication, then expected head version. It appends the batch, dedupe receipt and co-located outbox in the same declared transaction scope.
5. On authoritative committed receipt, run `apply_event` deterministically and publish new sealed state, then reply `#committed`. A mere `#admitted` receipt NEVER represents durable success.
6. On ambiguous timeout/reply loss, enter `OUTCOME_UNKNOWN` and reconcile the exact `operation_id` and payload digest before retry or state advancement. A conflicting reuse is an error.
7. On crash, a supervisor obtains a fresh fenced incarnation, validates snapshot identity/schema and journal offsets, replays contiguous events into fresh actor-owned state, and only then admits new commands. Never replay external side effects directly.

**Important consistency boundary:** a state snapshot and the companion SQLite checkpoint PR do not implement a domain-event journal. Event sourcing additionally requires atomic event+dedupe+outbox storage and provider-fenced stream heads. No compiled guest survival, exactly-once external effects, or distributed transactions can be claimed from the current host-side tests.

## Required safety and liveness rules

- **ES01 — Fenced single writer:** old epoch fails **before** any idempotency lookup; a local mutex is not a distributed fence.
- **ES02 — Contiguous version:** committed event versions increase by one; batch compare-and-swap against expected version.
- **ES03 — Commit-before-publish/ack:** no uncommitted state or `#committed` success is observable.
- **ES04 — Atomic batch:** all events, operation receipt and colocated outbox entries either commit together or none does.
- **ES05 — Dedupe:** same operation ID and payload digest returns the original outcome; a different digest rejects even if the old operation succeeded.
- **ES06 — Unknown outcome:** a timeout cannot be treated as rollback; the actor must reconcile.
- **ES07 — Pure replay:** deterministic, side-effect-free `apply_event` with pinned schema/migration logic.
- **ES08 — Sealed-state/ownership:** no mutable cross-actor alias, raw pointer, socket, active critical loan, or coroutine frame is serialized.
- **ES09 — Fail-closed recovery:** missing/corrupt/out-of-order journal entries or unsupported migrations prevent activation.
- **ES10 — Outbox only after commit:** external effects require committed events, outbox and idempotent receivers.
- **ES11 — Honest delivery:** at-least-once downstream delivery unless a separately proven stronger transaction exists.
- **ES12 — Tenant isolation and budget:** identity/capability derived from trusted context; bounded per-actor and per-shard pending work.

These rules apply independently to the requested full-AOT targets. A source parser acceptance, a structural host model, an SQLite state-checkpoint test, and an executed compiled actor are different evidence tiers. Each backend remains **NOT_EXECUTED** until the exact-head compiler and guest recovery tests are observed.

## Example acceptance sequence for a future real backend

For a bank-account actor, submit a command with `operation_id=o1`, `expected_version=0`, and a canonical payload digest; receive committed version 1. Kill the process **after append but before replying**. A new incarnation must replay to the same state; retrying `o1` with the same digest returns the original durable receipt with no second event, and retrying with a different digest rejects. Submit `o2` at the expected version and prove the next contiguous event. Inject a stale epoch, missing event, forged tenant and ambiguous receipt; each must fail closed.

## Related draft work

Base contract: `atto-spec#63`. Interfaces: `atto-common-source#24`. Conformance: `atto-platform-conformance#62`. Compiler syntax/codec: `atto-source.rs#263`. Native SQLite state checkpointing (not an event journal): `atto-source.rs#266`.

This document MUST NOT be interpreted as approval to merge or advertise five-backend feature parity.
