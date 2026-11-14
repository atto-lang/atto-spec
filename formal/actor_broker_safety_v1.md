# Formal safety obligations for AttoLang actors and broker integrations (candidate v1)

Status: **normative design candidate, not implemented-backend certification**. AttoLang source files are .atto; Java, LLVM, .NET NativeAOT, Wasm, Rust/Cranelift and Forge must independently refine the same observable semantics. Full AOT and zero/minimal GC remain design targets, not conclusions from reference models.

## Actor safety state

An actor has an immutable actor ID, a monotonically increasing incarnation/generation, an actor-owned heap/arena and a set of independently scheduled logical receiver stacks. Non-serial actors may execute multiple methods concurrently on separate stacks. Serial actors have at most one concurrently executing receive handler.

- **Heap isolation:** a mutable value has exactly one live actor owner or is temporarily in a linear transfer envelope. A sender cannot dereference, mutate or transfer again after successful take; cross-actor raw pointers and borrowed views cannot escape ownership domains. Deeply immutable shareable data is a separate capability.
- **Actor-relative handles:** a handle includes a domain/actor identity and generation; the same arena-relative offset is never sufficient authority. Every dereference checks domain and lifetime. Untrusted actor isolation and physical memory protection are distinct obligations.
- **Sealed state:** all state reads/writes require a validated critical-read/critical-write scope; direct field access is rejected. Two concurrent readers are permitted; writes exclude all other readers and writers, including across distinct receiver lanes of the same actor.
- **Suspension:** a borrow, critical scope, or stack pointer cannot cross await/select or scheduling boundaries unless compiler-verified pinned lifetime and safe resume rules apply. Race-free code must not depend on carrier thread identity.
- **Terminal transition:** a panic reports via supervisor CONTROL, fences further mailbox admissions and invalidates prior capabilities. Heap/stack reclamation MUST occur only after quiescence, cancellation acknowledgement or OS-enforced isolation: an atomic abstract stop is not permission to free in-use memory.
- **Restart:** incarnation changes monotonically; stale generation-1 ActorRefs, envelopes, stack handles and settlement tokens cannot operate on generation-2 state, even when offsets, thread IDs or message IDs are reused.

## Messaging and failure safety

- A successful send has a defined linearization point. Its accepted envelope is in exactly one state: queued, dispatched/leased, completed, deliberately dropped or cancelled. Rejections never become accepted work.
- A separate CONTROL path must not be starved by a saturated DATA mailbox. CONTROL priority is a scheduling contract requiring trace-based refinement, not merely a queue structure.
- Message ownership transfer is atomic with admission. Rejection or cancellation before admission returns ownership to the sender, rather than orphaning the payload.
- A broker ACK identifies the exact message, subscription/channel incarnation, delivery generation and tag. Duplicate and stale ACKs cannot settle another lease. Crash recovery requeues unsettled work without silently duplicating or losing accepted identities; publisher confirms require documented durability/commit semantics.
- At-least-once redelivery and at-most-once logical settlement do NOT imply exactly-once side effects at consumers. Any exactly-once claim needs a specific durable deduplication and transaction protocol.

## Formal refinement and acceptance levels

1. **Specification:** publish state variables, actions, invariants, fairness assumptions and bounded domains. Record which semantics are undefined or backend-dependent.
2. **Bounded exploration:** enumerate reachable states; require positive reachability witnesses; inject named unsafe mutations and require a shortest counterexample for each. A passing finite model cannot claim unbounded correctness.
3. **Code-model correspondence:** instrument precise observable events at runtime and compile the same .atto fixtures with each independent backend. Reject histories not permitted by the spec; do not confuse a host-side simulator with guest execution.
4. **Concurrency stress:** use scheduler adversaries, preemption, cancellation, crash/restart, reordering, fault injection, ASan/UBSan and bounded memory tests. Record JDK/Graal/LLVM/.NET toolchains where relevant.
5. **Evidence:** every claimed backend pass needs SHA-pinned source+compiler, actual executed CI steps, nonzero test counts, logs/traces, and explicit PASS/FAIL/UNSUPPORTED/NOT_EXECUTED status. If the canonical source org has no available Actions minutes, an exact Git-tree mirror in a permitted alternate private runner can execute tests, with verified blob SHAs and no secret cross-org checkout.

## Initial executable reference obligations

- atto-lang/atto-platform-conformance and ores-truffle-oreslang/oreslang-platform-conformance: bounded critical-read/critical-write, generation and logical-stack exploration (2 lanes, 2 generations, 4 negative mutations).
- attomq/atto.mq and atto-poc/atto-rmq-clone.atto: bounded delivery lease, ACK, restart and stale replay exploration (2 messages, 2 generations, 4 negative mutations).
- Existing Oreslang TLA+ models and bounded supervisor CONTROL/worker proofs remain independently scoped; do not count the new reference check as a replacement for or endorsement of their refinement claims.

## Next independent formalizations

Add a TLA+/PlusCal specification for supervisor CONTROL vs DATA and restart; an SMT/borrow-lifetime checker for actor-owned arena pointers; a linearizability oracle for mailbox admit/close and ACK settlements; crash-durable Raft/WAL models; and automated real compiled-backend trace refinement. Treat these as separate future gates until tests and counterexamples exist.

No formal method can promise a single in-process actor survives arbitrary memory corruption or global OOM without appropriate memory/OS isolation and resource controls.