# Durable typed protocols, schema evolution and transactions v1

**Status: proposed / NOT backend verified (2026-11-21).** This extends [persistent/durable actors](actor-persistence-v1.md), [event sourcing](actor-event-sourcing-v1.md) and [actor hot upgrade](../spec/27-actor-heaps-stacks-and-hot-upgrade.md). It introduces no new actor keyword: **define durable actor** remains runtime-managed disk storage; **define persistent actor** retains developer-provided hooks, whose transaction capabilities must be proved separately.

## Versioned wire and state types — DP01–DP03

Each durable message and persistable state root has a stable compiler-assigned **schema ID**, positive schema version, immutable descriptor fingerprint and stable field/tag IDs. AOT codecs MUST NOT derive wire identity from source file names, memory offsets, host reflection, field order or the display name alone. Retired field IDs cannot be reused with changed meaning. Required-field deletion and incompatible type changes require declared migrations.

A versioned delivery envelope binds trusted tenant and logical actor key, producer identity, message schema ID/version, canonical **original wire** digest, bounded idempotency key, correlation ID and optional expected state version. Caller-provided authority, actor incarnation and physical pointer cannot become persistent identity. The original version/digest is retained through upcasting, replay and retries; dedupe must not use the migrated bytes as a substitute.

Older versions are accepted only along a declared unambiguous path. Unsupported future/removed versions, unknown required fields, malformed descriptors, ambiguous adapters and incompatible tags fail with a typed rejection/quarantine. No partial decode or converted state may become visible.

## Pure migration and upgrade — DP04–DP06

A checked registry defines explicit adjacent version edges for message and state conversions; compiler-generated AOT code must include the full declared compatibility window. Neither downgrades nor rollback paths are assumed. Each journal record and snapshot pins its schema ID, version, descriptor fingerprint, logical actor identity, stream sequence and checksum.

Migrators must be **deterministic and bounded**: no I/O, sends, FFI, wall-clock access, ambient randomness, suspensions, unbounded allocation or escaped state loans. Effects must be statically checked and runtime resource budgets enforced. The upgrade drains generation-N turns, fences provider writer epochs, copies old state to a fresh image, migrates, validates and atomically publishes the new schema/code/state epoch. On any failure the old committed generation remains authoritative. Unsupported queued messages produce durable typed failures/dead letters rather than silently disappearing.

A hot upgrade retains the actor incarnation while changing code generation; a supervisor restart creates a new physical incarnation. Both must reject late receipts, stale outbox claims and old-generation continuations.

## Atomic durable turn — DP07–DP10

Where a backend advertises transactional durable processing, **one fenced transaction in one authoritative local storage domain** atomically commits (1) inbound delivery identity and original canonical digest with idempotency receipt, (2) expected-version CAS and checkpoint/event journal, (3) immutable outbox intents with effect IDs and typed destination envelopes, and (4) a durable command result/reconciliation key.

Authenticate tenant and reject stale provider epochs **before** checking dedupe. The idempotency domain includes tenant, stable actor ID, producer and operation namespace. Same key/same original digest returns the original committed result, without a second state write or outbox row. Same key/different digest rejects. A failed uncommitted attempt cannot be cached as successful work. Dedupe retention is bounded and explicit: after expiry the protocol does not claim perpetual suppression.

The transaction NEVER includes network calls or unrelated databases. User decisions and replay must not perform external effects before commit. An ordinary sealed critical-write guard is NOT a transaction. State must remain unpublished and outbox invisible before provider commit confirmation. Reject providers that only offer separate state and outbox transactions or that cannot enforce epochs. Java host blocking drivers require an approved nonparking isolated async adapter, not blocking actor carriers.

A timeout or lost receipt is **OUTCOME_UNKNOWN**, not a rollback. Reconcile the original operation ID/digest against committed store evidence. On recovery, validate snapshot/checksum/schema/identity, replay contiguous journal entries through pinned codecs, restore pending outbox and only then open ingress. Uncertain or corrupt recovery blocks actor activation and reports to supervisor CONTROL.

## Outbox and honest delivery — DP11–DP13

A bounded privileged relay claims only committed outbox rows, in stable order using provider-epoch- and claim-generation-fenced leases. An acknowledged row cannot be removed by an expired lease holder; retries use the same effect ID. Poison-message quarantine and backpressure require explicit limits and retained audit receipts. The outbox ACK records a verified downstream receipt, not an assumption based on socket write or mailbox admission.

A crash **after downstream effect but before outbox ACK** necessarily permits another delivery. Receivers must have their own persistent inbox/dedupe and compatible idempotency retention. Guarantees are local atomicity and at-least-once **attempts** under declared liveness, not exactly-once network delivery or arbitrary distributed transactions.

Typed outcome vocabulary distinguishes ADMITTED (mailbox only), COMMITTED (local durable store), OUTCOME_UNKNOWN (requires reconciliation), DELIVERED (transport/destination receipt) and APPLIED (verified recipient durable processing). These are semantic outcome states, **not new parser syntax**.

## Capability gates and testing — DP14–DP16

Providers advertise separately: transactional inbox, state/event store, outbox, epoch fencing, durability profile, migration registry, checksum validation, storage permissions, tenant isolation, bounded retention, payload quotas, encryption/key authority and async I/O. Developer-managed persistent hooks do not inherit managed durable guarantees by declaration alone. AOT codecs require no JIT or unrestricted reflection.

Conformance: old-version upcast; unknown future version; missing/ambiguous migration; rollback-on-failure; original-digest same/different key; epoch-before-dedupe; before/after-commit crash; loss of reply; missing journal event; outbox lease ABA; crash after remote effect before ACK; cross-tenant spoofing; provider capability rejection; unsupported queued mail. Real backend evidence requires pinned compiled guest execution, actual durable store transactions and kill/reopen tests. Host-only reference models do not prove fsync, AOT, SQL, crash recovery or parity.

**Staging:** build schema descriptors/codecs and checked migrations; wire a trustworthy provider transaction API into sealed actor turns; add outbox relay; then certify exact-tree Java, Rust, LLVM, .NET, Wasm, Forge and other compiler backends. Prefer completing existing Atto persistence/event-sourcing PR stacks over parallel stores.
