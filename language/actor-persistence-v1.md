# Persistent and durable actors v1 (AttoLang)

Status: **accepted design direction; target API only — no backend disk/revival verification** (2026-11-17).

AttoLang has two intentionally distinct actor persistence modes. This specification defines the language-facing interface contract. It does **not** certify that any compiler currently parses the modifiers, that a native actor can be restored, or that any runtime provides crash-safe storage.

## Surface syntax

```atto
define persistent actor UserCart as
    // User/developer supplies the load_state and save_state hooks.
end

define durable actor Counter as
    // The AttoLang runtime provides storage; no application hooks required.
end
```

The canonical modifier is placed between `define [pub]` and `actor`: `define [pub] (persistent | durable) actor Name ... as ... end`. Exactly zero or one persistence modifier is allowed. Modifiers do not apply to classes, structs, traits, or functions. `persistent` and `durable` are reserved words in declaration context, not aliases for one another. Neither modifier changes the actor's ordinary message typing, sealed-state access, supervision, or memory isolation.

- **persistent** = developer-managed storage. The actor MUST implement `ActorPersistence<State>` with `load_state` and `save_state` hooks. Hooks choose SQLite, PostgreSQL, files, remote stores, etc. The runtime invokes them at safe boundaries, but cannot independently guarantee that the developer's storage was actually durable.
- **durable** = runtime-managed disk persistence. The compiler generates serialization metadata/code for persistable actor-owned state, and the runtime owns WAL/checkpoint storage, recovery, and lifecycle. Application persistence hooks are neither necessary nor permitted as an override of the managed guarantee.
- **plain actor** = memory-only unless some separately specified explicit behavior is used.

## Portable interfaces

Canonical proposed source signatures live at `atto-common-source/interfaces/actor_persistence_v1.atto`.

```atto
define trait ActorPersistence<State> as
    susp fnc load_state(ctx: PersistenceContext): Result<Option<ActorStateSnapshot<State>>, PersistenceError>;
    susp fnc save_state(ctx: PersistenceContext, snapshot: ActorStateSnapshot<State>): Result<CheckpointReceipt, PersistenceError>;
end

define interface ActorCheckpointStore<State> as
    susp fnc read_state(ctx: PersistenceContext): Result<Option<ActorStateSnapshot<State>>, PersistenceError>;
    susp fnc commit_state(ctx: PersistenceContext, snapshot: ActorStateSnapshot<State>): Result<CheckpointReceipt, PersistenceError>;
end
```

`ActorPersistence<State>` is implemented by the **persistent actor**; it can delegate to an application-owned `ActorCheckpointStore<State>` such as a SQLite adapter. `ActorCheckpointStore` is a pluggable storage protocol, not proof of correct or durable storage. `Persistable` is a compiler-checked marker for values eligible for portable, versioned serialization. Both actor modes require persistable reachable state. The runtime owns the opaque `ActorStateSnapshot<State>`, `PersistenceContext`, and `CheckpointReceipt` representations; an actor cannot forge snapshots of another actor or obtain direct sealed-state access through these types. No reflection or JIT is required; all codecs must be AOT-generatable.

The `State` parameter refers to the compiler-generated sealed state shape for the actor. The compiler must prove that the hook implementations match the exact signature and effect, and must reject missing, ambiguous, overloaded, incorrectly typed, or inaccessible implementations. A user-defined `durable` actor must not be accepted merely because it implements `ActorPersistence`.

## Safe checkpoint and revival protocol

1. Admit a message under existing mailbox rules. Never expose an uncommitted state snapshot to another actor.
2. Finish its handler and reach a safe, quiescent actor-state boundary. There must be no active `critical-read`/`critical-write` loan or unsafely suspended frame crossing the boundary.
3. Make an immutable, owner-scoped state snapshot. Logical graph identity and cycles are represented by stable object IDs, not raw native pointers.
4. For `persistent`, invoke the user `save_state` hook and validate the returned receipt. For `durable`, append/commit through the runtime's configured on-disk journal and checkpoint engine. Only after the configured commit barrier can a durable acknowledgement be issued.
5. On revival, acquire a fresh incarnation/epoch under the same stable logical actor ID, fence older writers, verify the snapshot schema/checksum, restore state, and reconstruct transient runtime resources. Run an explicit recovery lifecycle hook rather than repeating constructor side effects.
6. Reconstruct or replay only messages with a proven durable-admission/commit protocol. A state snapshot alone is NOT a durable mailbox and does not allow claims of exactly-once message processing.

The v1 boundary is **between messages**, not an arbitrary program-counter/stack continuation. Suspended tasks, file descriptors, sockets, locks, borrowed pointers, foreign handles, and native stack frames are not automatically serialized. They must be transient/reconstructed or rejected. A mutable alias to another actor's heap is always disallowed, even with a user codec.

## Identity, versioning and failures

`PersistenceContext` must provide at least stable logical actor ID, current incarnation/epoch, expected checkpoint sequence, and schema ID/version. A receipt must attest to the exact actor ID, epoch and sequence requested. Durable storage MUST atomically fence stale epochs/writers; stale receipts, out-of-order commits and replayed checkpoint records are rejected. A plain path or serialized `ActorRef` is never an authorization capability.

On `persistent` hook failure, stop acknowledging the affected message and send the failure to normal supervisor control; a hook returning success cannot give the runtime evidence of actual SQLite/remote fsync. On `durable` storage error, corruption, quota exhaustion, or missing storage capability, **fail closed**; never silently downgrade to in-memory actors. Fresh actors may start with their defined initial state only when the store confirms there is no prior checkpoint, not when read/decode fails.

`durable` means on-disk recovery on the same storage authority. Cross-machine revival requires shared/replicated storage and fenced leases as a separate feature. External side effects (payments, network calls) still need idempotency or a transactional outbox; checkpoints do not make them exactly-once.

Versioned schema IDs, field IDs and explicit migration are mandatory before incompatible state changes. Secrets require platform storage permissions, encryption/key management where configured, limits and secure cleanup. OS disk and SQLite are examples, not mandatory engine choices.

## Required compiler diagnostics

| Diagnostic | Required rejection |
|---|---|
| `E_ACTOR_PERSISTENCE_MODIFIER` | both modifiers, wrong declaration kind, or duplicate modifier |
| `E_PERSIST_HOOKS` | persistent actor missing either mandatory hook |
| `E_PERSIST_SIGNATURE` | wrong hook argument, return type, effect, visibility or duplicate overload |
| `E_DURABLE_HOOK_OVERRIDE` | durable actor attempting to replace managed persistence with custom hooks |
| `E_NON_PERSISTABLE_STATE` | raw pointers, sockets, active loans or unsupported graph state in either mode |
| `E_CHECKPOINT_BOUNDARY` | snapshot/restore attempted inside a critical or suspended unsafe boundary |
| `E_STALE_ACTOR_EPOCH` | stale incarnation attempting to commit a newer actor's checkpoint |
| `E_PERSISTENCE_IO` | failed commit, corrupt checkpoint, quota/permission error, or missing storage authority |

## Conformance and implementation stages

Shared registry: `atto-lang/atto-platform-conformance/contracts/actor-persistence-v1.json`. Interface/ABI manifest: `atto-lang/atto-common-source/contracts/actor-persistence-interfaces-v1.json`.

Test acceptance requires separate proof of lexer/parser, semantic checks, generated AOT codecs, native/guest execution, forced-kill-after-commit vs before-commit recovery, snapshot migration, failure and replay, plus independence of actor-owned heaps. Tests of contract structure or a host reference model are **NOT_EXECUTED_BY_BACKEND**, never evidence of automatic disk persistence. No source organization or alternate Actions runner is assumed to have tested a backend until an actual populated job is inspected.
