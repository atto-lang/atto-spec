# Mailman actor delivery: ownership proofs, leases, and graph isolation (v1 candidate)

**Status: candidate specification; NOT a compiler, runtime, or AOT implementation.** Reconcile with draft [Copyable contract PR #39](https://github.com/atto-lang/atto-spec/pull/39), [typed messaging #28](https://github.com/atto-lang/atto-spec/pull/28), and the [Rust borrow-checker ownership-bang oracle #30](https://github.com/ores-truffle-oreslang/atto-borrow-checker.rs/pull/30). This contract is additive, not a replacement for their current proofs.

## Actor isolation invariant

Each reachable mutable allocation in an actor DATA message must be either (1) **exclusively owned** by the receiver, (2) covered by a **tracked, scoped shared-read or exclusive-write lease** for the entire reachable region, or (3) not reachable by that actor. Only transitive immutable/frozen graphs may be shared without a mutation lease. No delivery grants untracked mutable aliases or bypasses sealed actor state.

The compiler's **native same-pass borrow checker** proves authority, nested alias closure, lifetime and Sendable/Sync/DeepCopyable eligibility. The independently running Rust oracle may verify typed MIR, but does not mint authority. A Mailman enforces runtime ticket redemption, admission, safe graph construction, and lease release. Supervisors manage lifecycle and priority CONTROL, never copy DATA payloads in the CONTROL lane.

## Modes and source semantics

| Mode | Required proof | Effect |
| --- | --- | --- |
| TRANSFER | Exclusive reachable Sendable graph, zero outstanding loans/escapes, compatible memory domain | Move ownership without copying bytes where supported; original inaccessible after commit |
| DEEP_COPY | Transitive DeepCopyable + Sendable, concrete AOT graph copier, destination budget | Independently rooted mutable graph; original remains usable |
| READ_LEASE | Region-wide shared borrow, no writers, statically bounded receiver/derivative lifetime | Multiple readers, no writes until last lease finishes |
| WRITE_LEASE | Region-wide exclusive mutable borrow, no readers/writers, bounded lifetime | Only receiver mutates; sender and other readers/writers blocked |
| FROZEN_SHARE | Transitive frozen/immutable + Sendable + Sync authority | Durable shared read-only graph |

Shallow **copy!** never proves actor isolation by itself. **copy!!** / **copy_deep()** require graph independence. **take!** transfers ownership. **share!** publishes verified frozen state; it is not an implicit mutable lease. **borrow!** and **borrow! mut** are checked source loans; the concrete cross-actor lease API is deferred. No compiler may invent the source syntax of a cross-actor lease or silently extend a local borrow lifetime by sending it to an unbounded mailbox. A semantic example, NOT parser syntax, is send_loan_read(actor, value, scope).

### No-future-reference proof and safe copy elision

The compiler need not predict future uses: it proves via whole-function dataflow, exceptional exits, defer/recover, FFI escapes and suspension/capture analysis that the **entire reachable mutable graph** has one owner and every alternate way to observe or access it is absent. It then consumes that authority on commit. A Mailman must NOT infer uniqueness from a raw pointer or reference count.

A requested **copy!!** may be physically elided into TRANSFER only if the original graph is provably dead/unobservable after handoff and observable semantics of fresh identity, custom copy hooks, destruction, finalizers and resource duplication are preserved. A live source remains live after copy!!; never silently consume it. Where proof fails, perform a real deep copy or reject unsupported requested semantics. Fan-out never turns multiple independently mutable copies into shared writable storage.

Physical zero-byte-copy is only available in compatible address-space/actor-memory domains; distinct WASM linear memories, processes, managed heaps, isolates and network transports require a separately proved shared-memory protocol or copy/serialization.

## Proof-bound, runtime-minted envelope (conceptual)

Envelope fields: contract version; type and transitive graph-layout/Sendable witness; source and destination actor ID plus **incarnation**; source and destination memory-domain IDs; selected semantic mode; owner/region capability; scoped read/write rights; copy-plan ID where relevant; bounded bytes/nodes/depth; nonzero send ticket/lease ID and separate nonzero allocation+ticket generation; admission state; compiler/build witness. Bare metadata is **not** an authenticated proof. The compiler/runtime must mint unforgeable capabilities and revalidate at redemption; reject unknown version/mode, forged origin, stale incarnation/generation, wrong domain, lost nested proof, over-budget graphs and resource/FFI escapes. A reused send ticket must never double-deliver.

## Bounded, linearizable delivery protocol

1. Validate destination generation/type, compiler-authenticated proof and transitive graph rights; reserve a bounded DATA mailbox slot and memory/lease budget before copying or committing; CONTROL slots remain separately reserved.
2. **Prepare**: escrow transfer authority and prohibit sender reads/writes while pending; for copies, allocate an unpublished destination-owned graph with a memo table; for leases, reserve all relevant region permits and a verified lifetime extent. No partial copy becomes visible.
3. **Commit once**, linearizably: publish one entire message; consume sender authority for transfers or activate a tracked lease; settle the ticket. For copy!!, original remains accessible unless verified copy-elision legitimately consumes an otherwise dead value.
4. **Abort before commit**: return sender transfer authority, retire unpublished copy allocations, release reservations/permits and publish nothing. **After commit**, receiver crash does not restore sender ownership; supervisor/runtime reclaim or recover receiver-owned objects with generation fencing.
5. **Finish a lease** only after receiver and derivative tasks have quiesced. STOP/cancellation cannot revoke a still-dereferenceable raw pointer; use fencing and deferred reclamation. On every exceptional/suspended path, release permits once, never early or twice.

Backpressure may suspend sending while the source is in escrow, never permitting sender access mid-transaction. Read leases may coexist, but writers wait; exclusive write leases exclude all readers and other writers. A loan cannot be parked across await/select without verified pinned-frame ownership and cleanup. Bounded local borrow scopes do not automatically become safe asynchronous remote loans. Avoid CONTROL/DATA head-of-line blocking and deadlocks involving holding a write lease while awaiting another actor.

## Copy graphs, resources and fan-out

Each DEEP_COPY recipient receives a **distinct mutable object graph**, with internal cycles and repeated reference aliases preserved by memoizing old-to-new identities before descending. Only frozen immutable children may be shared. Compilers synthesize concrete AOT copy plans covering inherited/private fields, type tags and custom hooks. Unsupported sockets, mutexes, raw pointers, FFI allocations, native handles and finalizer/identity-sensitive resources must reject deep copy absent explicit sound duplication rules. Sendable and DeepCopyable are separate obligations.

A Mailman's performance policy only selects among **legal, observationally equivalent** strategies; it cannot relax the requested source operation. Mailbox DATA capacity, copying allocation budget, cloned-graph depth/nodes, lease registry and ticket table must be bounded and failure-atomic.

## Evidence and rollout

The accompanying host-only tests are a **model**, not verified AttoLang codegen, physically isolated memory, authenticated production envelope, guest execution, or backend parity. Production gates: exact typed-MIR proof census; CFG merge and exceptional-path uniqueness; forged envelope/stale epoch/ABA; leases with cancellation and suspended receiver; STOP and crash races; bounded capacity; deep-copy nested aliases/cycles and rollback; mutation after fan-out; cross-domain zero-copy rejection; transactional reuse of pooled buffers; AOT execution per backend.

The existing Rust V0 ActorSendPrepare/Commit/Abort/Move/Copy model is a useful starting point but does not prove graph-wide physical ownership or loaned cross-actor memory. Until backed by native compiler and runtime implementation, do not mark any runtime mode as PASS.
