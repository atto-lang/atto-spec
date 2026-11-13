# AttoLang bounded memory pools and transferable buffer leases (v1 proposal)

**Status:** proposed; not compiler- or guest-executed. Normative contracts are expressed here without inventing unvalidated `.atto` grammar.

## Scope and vocabulary

- **Actor arena:** actor-owned allocation domain, with checked 32-bit guest offsets, generation fences and deterministic retirement. Private arena pointers are NOT transferable.
- **FixedBufferPool:** fully preallocates a bounded number of equally sized byte slots and bookkeeping before admission. `try_acquire` never grows the pool.
- **BufferLease:** linear/affine ownership receipt for one slot. Must be returned exactly once, either by explicit release or enforced destruction. An unconsumed lease remains the owner's resource.
- **Transfer:** atomic mailbox-admission move of a lease from sender to receiver. Transfer does not copy payload bytes. Failed admission returns the same lease to the sender.
- **Frozen/shared buffer:** separate deeply immutable, runtime-pinned object. Shared read-only loans cannot permit mutable aliasing. Not implicitly equivalent to transferring an actor-private ref32.

## Required guarantees

1. Slot capacities, class sizes and permitted actor/tenant domains are established before the real-time hot path. Oversized/zero/overflow capacities are rejected at creation.
2. The fixed-capacity fast path performs **zero dynamic allocations after initialization**; exhaustion is an explicit result and MUST NOT allocate as fallback.
3. Moves and mailbox reservation/commit/abort are linearizable. Between reservation and settlement the sender cannot access its payload. On commit the sender loses access; on abort it regains the same buffer.
4. An active read loan forbids mutating, recycling or freeing its allocation. An active mutable loan forbids all overlapping reads and writes.
5. A recycled slot carries a fresh monotonically increasing generation. Generation overflow permanently disables the slot; it must never wrap into a stale receipt.
6. Retirement blocks new acquisitions. Backing storage survives until all in-flight loans, I/O pins and leases quiesce. Actor shutdown must reconcile every outstanding lease.
7. Reuse clears sensitive bytes before a slot becomes available to another actor/tenant. Pool membership alone conveys no permission; authenticated actor/tenant identity is mandatory.
8. A `try_acquire` error must preserve pool counters and all live lease states. Repeated release is rejected; never double-frees.
9. Access to pooled network payloads never performs blocking I/O inside an actor-critical region. An async I/O submission requires a separately tracked lifetime pin extending to completion/cancellation.
10. No backend may silently claim full zero-copy across the NIC/kernel boundary from a mere user-space buffer move.
11. Owner identity includes a trusted tenant identifier, actor identifier, and actor-incarnation generation (all nonzero). The identity tuple is NOT an authority token; only the trusted scheduler/actor registry may attest it.
12. v1 transferable leases deny cross-tenant transfers by default. Cross-tenant sharing requires an explicit future capability and separate isolation proof.
13. Mailbox occupancy counts queued, delivered, and checked-out leases until the receiver explicitly acknowledges physical release. A dequeue is not a credit refund; dropped unacknowledged delivery fails closed.
14. The host-only C++ callback currently exposes a raw span under a pool mutex; it must not escape the callback or reenter the pool, and is NOT an async-I/O pin or guest-safe loan. A properly pinned loan facility is required before source guest bindings.

## API families (semantic signatures, not endorsed parser syntax)

- `std/memory`: `Arena`, `Region`, `ObjectPool<T>`, `SlabPool<T>`.
- `std/buffer`: `BufferPool`, `BufferLease`, immutable shared buffer, exclusive write loan.
- `std/actor`: owned buffer move, mailbox reservation/commit/abort, cancellation-safe release.
- `std/net`: nonblocking pooled receive/send with explicit pinned I/O completion.

Names are provisional until exact backend parser/typechecker acceptance is demonstrated. New guest sources MUST use `.atto`; legacy `.ores` remains only for explicit migration tests. Function names use `snake_case`.

## Acceptance evidence

Run the same compiled `.atto` fixture with Java/Graal, LLVM and .NET Native AOT; pin source/compiler and binary hashes, instrument real guest allocation bytes and GC, and run 100,000 operations after warmup. Assert zero hot-path dynamic allocations, stable backing-buffer identity on eligible transfer, explicitly bounded RSS, correct exhaustion/backpressure, no cross-actor writes, no stale generations, and correct teardown under cancellation and panic. A native C++/Rust unit test is **host-only** and MUST NOT be reported as compiler/guest parity.

Java managed-AOT may be low-GC rather than zero-GC. Strict non-GC and no-allocation guarantees require explicit target profile admission.
