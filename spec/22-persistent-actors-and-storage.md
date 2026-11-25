# 22 — Persistent actors, mutable state and storage adapters (v1)

**Language decision: TARGET.** The new declaration is `define persistent actor Name as ... state {} ... end`. It is an **actor** modifier, not a separate actor species, superclass requirement, alternate heap model, or permission to bypass ownership checks. This chapter fixes semantics; it does not claim cross-backend executable support. As of 2026-11-10 Java draft PR [#2769](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/2769) parses this syntax to a distinct protected AST node and adds a real host-side SQLite store. The parser intentionally refuses compiled guest lowering; seven focused SQLite integration tests passed on [private JDK21 carrier run #42904280840](https://github.com/scintilla-run/scintilla-e2e/actions/runs/42904280840).

## Canonical surface

```atto
define persistent actor Counter as
  state {
    let int count: 0;
  }

  increment(int delta) -> int ::
    return self.handle_state(critical-write |s| -> {
      s.count = s.count + delta;
      return s.count;
    });
  end
end
```

An empty `state {}` is valid; a persistent actor still requires **one** state container. `state {}` is actor-private, **mutable** storage and survives durable deactivation by serialization of its values. It is not an immutable/persistent data collection. Fields are restored **before** normal message handlers run; initializers run only on first provisioning, not on every recovery. The compiler must guarantee no direct references to state escape `critical-read` or `critical-write` loans. Ordinary actors retain their existing non-durable behavior.

The `persistent` modifier is contextual in declaration position. It must not reserve the identifier for unrelated value expressions. The canonical modifier order is `define [pub] persistent actor`. Actor methods remain `snake_case`. No general persistence statement or second actor ownership keyword is introduced.

## Runtime architecture and standard adapter interface

The runtime, not guest code, selects a `PersistenceStore` for an actor through supervisor/deployment configuration or an unforgeable typed capability. The guest cannot choose an arbitrary SQLite file path or issue raw SQL as a persistence side effect. A storage provider may implement SQLite, PostgreSQL, an embedded key-value store, or a remote durable service, but all providers obey the same contract.

Logical key: `(tenant_id, workflow_id, run_id, actor_id)`. A physical process ID, actor arena pointer and activation incarnation do not define the persistent identity. A `StorageKey` is not an authorization capability; the runtime must bind it to the authenticated tenant and controlling supervisor.

```text
PersistenceStore
    bootstrap(key, initial_state)          -> Result<Created, PersistenceError>
    activate(key)                          -> Result<Activation, PersistenceError>
    enqueue(key, delivery)                 -> Result<Admitted, PersistenceError>
    commit_turn(key, epoch, expected_version,
                delivery_id, next_snapshot,
                outbox_intents)             -> Result<CommittedVersion, PersistenceError>
    hibernate(key, epoch)                  -> Result<void, PersistenceError>
    acknowledge(key, epoch, intent_id,
                receipt_id)                -> Result<Receipt, PersistenceError>
```

These names are the **AttoLang snake_case contract**. Existing Java host methods use the equivalent camel-case SPI in `DurableActorStore`. A provider also advertises capabilities (transactions, durable inbox, outbox, snapshot sizes, optional event logs and timers), not guest-authorized mutable connection objects. A provider that cannot implement the mandatory atomic turn transaction cannot advertise support for a persistent actor. A simple `save_snapshot` function is insufficient.

## Mandatory transaction invariant

For each command handled by a persistent actor, the single writer executes:

1. Acquire/verify the actor-wide execution lease, logical identity, active storage fencing epoch and expected committed state version.
2. Load a private mutable state view and compute the next state and **intent-only** external outputs. No irrevocable external effect may run during a speculative turn.
3. In **one atomic durable transaction**, consume the inbox delivery ID, advance exactly one state version, save the next snapshot, and insert uniquely keyed outbox intents. (For event-sourced mode, append events and update timers in the *same* transaction.)
4. Only **after** the transaction returns confirmed success may the actor publish the new state or reply with **durable success**. A failed/unknown commit must not be acknowledged. For an unknown outcome, reconcile by delivery/operation ID against committed storage.
5. Dispatch intents outside the transaction, retry with stable idempotency keys, and persist receipts separately. Delivery can be at-least-once: exactly-once external effects are **not** implied.

Unsuccessful speculative mutation is discarded or rolled back before another command enters; a poisoned actor cannot continue with a locally advanced state that is absent from storage. Durable actors preserve supervision/CONTROL and mailbox fairness; a failed storage adapter is a typed supervision event, not a panic that silently loses a message.

## Crash, recovery and lifecycle

`ABSENT -> PROVISIONED -> ACTIVATING -> ACTIVE -> QUIESCING -> DORMANT`, with `FAILED`/`QUARANTINED` paths. On activation, storage atomically increments an epoch; every stale writer, stale hibernate and stale receipt must be rejected, including after supervisor crashes or a supervisor-of-supervisor takes over. Repeated ingestion of a delivery ID may not replay a committed transition.

Recovery: acquire a new fenced epoch -> verify snapshot checksum, state schema and code generation -> decode into fresh actor-owned arena -> (optional) replay committed post-snapshot events -> reconcile pending outbox/timers -> publish ready -> admit commands. No host pointer, socket, active lock, live stack, borrow, file descriptor, or raw capability is serialized. Restore capabilities using current supervisor authorization, not bytes saved in `state {}`.

Default durability mode: **commit-before-successful-reply per actor turn**. Batching/group commits are allowed if each acknowledgment waits for its own committed record. Checkpoint-only or event-sourced modes require explicit policy and different conformance claims. Snapshot digests detect accidental corruption; authenticity, encryption, backups, migrations and multi-process access policies belong to the storage deployment.

## Schema, codec and migration

The compiler derives a stable, versioned schema for `state {}` (or requires an explicit schema declaration if reflection-free derivation is unavailable). Serializable data must have deterministic wire encoding and bounded depth/size. Live `Channel<T>`, open OS resources, `Pointer<T>`, borrowed references and mutable references into another actor's heap are disallowed. Symbol identity must use a portable stable symbol representation; userland process-local symbol identities cannot silently become shared across recoveries.

Schema or code changes are not automatically accepted. Runtime requires a reviewed migration from a specific source schema version to a target schema version, validates the result, and commits migration under an exclusive active epoch. Unknown schema, invalid digest, missing key, unsupported driver capability, or failed migration => quarantine; never deserialize optimistically and continue.

## SQLite adapter (first implementation)

A SQLite provider uses a file selected by the trusted host, WAL, `synchronous=FULL` where power-loss durability is required, parameterized SQL, transactional compare-and-swap of `state_version` and `activation_epoch`, unique per-actor inbox delivery IDs and outbox idempotency keys. A single SQLite writer can be a throughput bottleneck: multiple actors can batch safe transactions through an owner/router, but the per-actor linearization and commit-before-reply invariants remain intact.

The Java `SqliteDurableActorStore` in PR #2769 provides the host-side v0 transaction port, but does not yet supply guest snapshot codecs, event-log append, timer support, scheduler integration, compiled lowering, or native AOT integration.

## Conformance gates for every supported backend

- Parse a persistent actor with empty and typed mutable `state {}`, reject missing/duplicate containers and duplicate state fields.
- Reject all unguarded external state accesses, state loans across illegal suspension/serialization, and direct guest SQL/file capability spoofing.
- First-provision initialization, recover without re-initializing, and reject incompatible schema/code versions.
- Crash before commit leaves delivery pending and state unchanged; crash after commit leaves state advanced exactly once and outbox retryable.
- Duplicate delivery, out-of-order delivery, duplicate outbox keys, unknown commit outcome, stale epoch, stale supervisor and two-writer races must never double-transition.
- Corrupt snapshot, wrong tenant, invalid serialization and exhausted resource quotas fail closed.
- Run actual compiled guest actor tests plus host storage tests under Java/GraalVM, LLVM, .NET, WASM and Forge; no backend can claim parity based solely on host DTO tests.
