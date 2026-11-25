# Typed actor job envelopes and acknowledgements v1 (candidate)

**Status:** Proposed normative contract. NOT an implemented Atto compiler feature, portable wire ABI, durable queue or cross-backend certification. Complements [keyed ActorRegistry v1](actor-registry-v1.md). Existing sealed-state, actor supervision, typed message ownership and permission rules are unchanged.

## Goals and distinct APIs

A keyed `ActorRegistry` resolves a pre-existing `ActorRef<A>`; an `ActorGroup<A>` selects **one** currently authorized live member for a job. **Neither resolution nor job dispatch implicitly activates an actor or declares a broker entity.** A separate explicit activation API may be invoked by a trusted supervisor. Pub/sub fan-out MUST remain a distinct API, never an alias for one-job assignment.

Application code may produce a typed immutable job message. The following **conceptual** types/signatures are **NOT** guaranteed to parse in any compiler today:

```text
Job<T> {
  job_id: JobId,                  // immutable, stable across retries
  attempt: u64,                   // monotonically increasing retry attempt
  payload: T,                     // Sendable, ownership-checked
  correlation_id: CorrelationId,
  deadline: Option<MonotonicDeadline>
}
JobReceipt {
  job_id: JobId,
  attempt: u64,
  actor_incarnation: Incarnation,
  receipt_token: OpaqueReceiptToken,
  status: JobStatus
}
ActorRegistry.dispatch_existing<T>(key, job: Job<T>) -> Result<AdmissionReceipt, DispatchError>
ActorGroup.dispatch_one<T>(key, job: Job<T>) -> Result<AdmissionReceipt, DispatchError>
```

No new language keyword is proposed. Public operation names use `snake_case`. A typed `ActorRef<Job<T>>` accepts only a compiler-checked message type; target actor type, tenant/domain, and payload type MUST all match. `ActorGroup` dispatch returns the chosen exact physical incarnation, not a virtual reference and not a broadcast count.

## Identities, authority and format

1. Logical job identity is **(tenant/namespace, job_id)**. Job IDs remain stable through retries; attempt numbers increase but are not part of deduplication identity. Exact bytes/codepoints distinguish IDs (no implicit NFC, case folding, or separators); reject ill-formed strings, empty IDs and budgets above **4,096 UTF-8 bytes** for namespace plus job ID. Use unambiguous length-prefixed/binary encoding, never delimiter concatenation.
2. A target is a typed actor key `(namespace, actor_type, application_key)` or group key `(namespace, actor_type, group_name)`. The target and typed payload identity are bound to the job ID at first reservation. Reuse of that ID with a different payload or target is a conflict.
3. An admission receipt is an **opaque host-generated capability**, bound to registry epoch, tenant, job ID, attempt, physical actor incarnation and admission number. Guessable job IDs, a forged `ActorRef`, or an arbitrary raw integer slot grant no dispatch or settlement authority. Host verifies tenant permissions at target resolution **and at actual mailbox admission**; revocation between the two must fail closed.
4. The actor handler receives the **complete typed Job<T> envelope**, including job ID and attempt. The sender MUST NOT infer this from a local JS map. The existing browser `actor_send(i32,i64)` ABI does **not** transport the job ID, so it cannot implement this contract. The eventual ABI needs versioned bounded frames, checked offset/length if using Wasm linear memory, deterministic encoding, copy/take/share ownership checks, and rejection before ownership transfer on invalid frames. Pointer addresses must not cross actor/isolate boundaries.
5. Physical references do not retarget after death or hot reload. A restarted actor gets a distinct incarnation/registry epoch. Delayed cleanup, ACKs and timeouts for the previous incarnation cannot remove or settle the successor's work without explicit durable recovery ownership.

## State transitions and linearization points

The ledger is the authoritative source of job receipt state. `lookup` is a non-activating snapshot and **not** the send/admission linearization point.

| State | Meaning | Permitted next event |
| --- | --- | --- |
| `absent` | No reservation | `reserved` after key/type/authority/quota validation |
| `reserved` | Exclusive job ID reservation, no promised send | `admitted`, `rejected`, `indeterminate` |
| `admitted` | Exactly one physical mailbox accepted the envelope | `started`, `failed` or `indeterminate` upon uncertain loss |
| `started` | Exact actor incarnation acknowledged execution start | `completed`, `failed`, `indeterminate` |
| `completed` | Validated completion receipt committed to the chosen ledger | Terminal, idempotent duplicate receipts only |
| `failed` | Validated terminal failure committed for this attempt | Terminal attempt; retry requires a new attempt under explicit policy |
| `rejected` | Pre-admission rejection proved no transfer | Terminal attempt; safe retry only with fresh validation |
| `indeterminate` | Could have been admitted or executed; outcome unknown | Reconciliation, not blind resend |

The **mailbox's linearizable successful send** is the local admission event. A successful enqueue does not imply actor execution. A worker can crash after admission, after effects but before ACK, or after ACK but before durable commit. Exception messages, including one claiming `EMPTY` or `FULL`, MUST NOT be parsed to prove no admission: only a structured pre-send result can permit resubmission without reconciliation.

The **ledger commit** is the receipt-settlement event. A task result receipt, pipe admission receipt and job settlement receipt have separate identities and authority; no generic Future or pipe acknowledgement conveys job settlement rights. Accept terminal updates only from the authenticated actor/supervisor/control path carrying the exact job/attempt/incarnation/receipt token. Duplicate identical terminal receipts are idempotent; conflicting, stale or cross-tenant receipts are errors and cannot mutate another job. Repeated actor start/complete callbacks must be bound to source execution, not ambient guest permissions.

A volatile registry may retain admitted IDs until a finite quota is reached and fail closed; after process restart, that volatile map provides **no deduplication guarantee**. Implementations must clearly distinguish volatile `admitted`, durable `admitted`, durable `completed`, and exactly-once effect claims. An untrusted guest must not gain a host directory or ledger capability by importing a function name.

## Group placement, backpressure and crashes

- An ActorGroup has a bounded membership set. Select exactly one live, authorized, type-compatible member for each **new** job by a documented policy (e.g. rendezvous hash over job identity and physical incarnation, or bounded load-aware selection). An existing job's admitted/indeterminate placement must not change because membership changes.
- Selection must reject a missing/unhealthy group without activation. A saturated mailbox returns backpressure; never fan out or silently try a different member if send admission may have occurred. A known pre-send rejection may be retried only under policy and quotas.
- A retiring actor must stop mailbox admission before reclaiming memory. Supervisor CONTROL notices carry exact actor incarnation, job attempt and failure cause. No new owner can execute unresolved work until a recovery/lease fencing decision is committed by the durable owner.
- Cancellation/deadline are conditional lifecycle transitions, not permission to erase accepted data. Acknowledged cancellation must prove the actor will no longer execute the attempt. If that proof is unavailable, outcome remains indeterminate and requires reconciliation.
- For crash-durable work, persistent dedup keys, WAL/transactional queue state, leases/fencing epochs and explicitly bounded retry budgets are required. Redelivery may provide **at-least-once execution attempts**, not exactly-once effects; external side effects require an application-specific idempotency/transaction protocol.

## Conformance acceptance cases

An independent implementation MUST prove, with source-compiled guest traffic rather than a host-only simulator:

1. 1,000 same-ID requests / 32 contenders yield one admission or coherent duplicate receipts; unrelated keys progress independently.
2. One existing actor and one ActorGroup select one mailbox per new job; no implicit spawn, no pub/sub broadcast, no ghost registration.
3. Handler receives the same `job_id`, `attempt`, typed payload and correlation identity that were submitted; malformed/oversize/wrong-type frames fail before admission.
4. Same-ID/same-target/payload is idempotent; conflicting payload/target, cross-tenant key, forged/cloned reference and revoked authority fail closed.
5. Mailbox-full, after-send exception, host close during send, actor crash between `admitted` and `started`, crash after execution before ACK, and ACK after restart never generate unsound second admissions.
6. Stale terminal receipts, changed incarnation/registration, duplicate receipts, late cancellation, and membership churn cannot settle a different attempt.
7. Saturation, quota, deadlines, shutdown, CONTROL priority, ownership and resource reclamation are bounded and non-parking where required.

Evidence for each backend must include exact source/compiler SHA, nonzero-step execution counts, actual trace events, and an explicit PASS / FAIL / NOT_EXECUTED / UNSUPPORTED classification. Standalone host Node/Rust tests can validate a reference model but **do not** certify compiled Atto guest support. Refer to [atto-platform-conformance#95](https://github.com/atto-lang/atto-platform-conformance/issues/95).

## Current delivery boundary

[atto-playground#74](https://github.com/atto-lang/atto-playground/pull/74) implements **host-only volatile** `(namespace, job_id)` deduplication and existing-actor or one-group-member i64 mailbox admission. It does not yet transport job IDs to guest handlers, expose a compiled `Job<T>` type, report handler completion, persist receipts, redeliver work, or provide cross-process fencing. The pending keyed compiler activation [atto-source.rs#310](https://github.com/atto-lang/atto-source.rs/pull/310) likewise does not implement job-envelope transport. Neither should claim v1 job protocol conformance until all gates above are met.
