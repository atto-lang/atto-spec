# Deterministic actor scheduling, replay and concurrency testing v1

**Status: PROPOSED. Source-free reference scheduler and tests are implemented; compiled AttoLang guest execution and all backend scheduler integrations remain NOT_EXECUTED.**

## Design goal

Atto Theater's actor execution should be testable under a deterministic, test-only schedule controller. Unlike the production Atto Runtime scheduler, this controller can choose runnable actor turns, mailbox deliveries, cancellation, supervisor CONTROL notices, task resumptions and virtual clock advancement. Observed failures must be saved as reproducible schedules. Controlled execution must preserve real ownership, isolation, mailbox, restart and cleanup semantics rather than replacing them with convenient test-only approximations.

The accompanying JavaScript model in scripts/deterministic-actor-model.mjs is a **source-free execution oracle**, not an actor-runtime implementation or evidence that any .atto program compiled. It exercises seeded interleavings, exact state-and-enabled-set replay, virtual time, cancellation-versus-delivery races, generation fences, quiescent hot upgrades and single-owner transfers. Its Node tests are host-only.

## Versioned trace contract

The proposed artifact format is **atto.actor-schedule.v1**. The model emits:
- schema, explicit evidence class, 32-bit PRNG seed and scenario SHA-256 digest;
- status (completed or failed) and any first failing property or invalid operation;
- each sequence-numbered decision: virtual timestamp, sorted enabled choices, selected choice and SHA-256 before/after state digests;
- terminal state, terminal digest, mailbox consumption/cancellation/fencing counters.

**A random seed alone is insufficient for exact guest replay.** The ordered schedule decisions and external event inputs are essential. Replaying a trace reinitializes the same scenario and checks every runnable set, choice, time and state digest, rejecting mismatch instead of silently diverging. Failing assertions must retain a replayable trace, not just a seed or a stack trace. State serialization in the source-free oracle is deliberately not a trusted runtime recording protocol.

A production trace also needs exact compiler/runtime/build/fixture fingerprints, actor ID and incarnation, message ID and admission point, isolated memory scope, turn/continuation identity, virtual time, cancellation commitment, ownership-generation changes, coverage counters and a host-attested terminal receipt. Use opaque IDs and content hashes; never include secrets, raw pointers, private messages or unbounded guest-writable data. Guest stdout, untrusted JSON or a source-free model cannot certify complete runtime instrumentation.

## Required scheduler-control edges

1. **Actor scheduling:** select among runnable DATA turns, Task continuations, compiler-proven cooperative checkpoints, supervisor notices and CONTROL wakes. Do not suspend unsafe mutable loans, partially committed transactions, critical write sections or foreign operations merely to introduce an interleaving.
2. **Mailbox delivery:** instrument send acceptance, queue admission, dispatch, completion, close/drain/discard, selective receive and CONTROL priority. Cancellation before an accepted transfer may revoke it; cancellation after the exact commit cannot undo it.
3. **Virtual clock:** redirect controlled timer, timeout and clock operations to a monotonic synthetic clock. Advance deliberately, or to the next pending timer when no runnable work exists. External wall time, network I/O, files, randomness, FFI, GPU and host callbacks must be captured with bounded adapters or declared nondeterministic and refused for exact replay.
4. **Restarts and upgrades:** fence message and task identities to actor incarnation. Stale messages, timer wakeups, reactor callbacks and ownership leases cannot cross a supervisor restart. Hot upgrade is admitted only at a proven safe point with a recorded old/new code and state-schema fingerprint; safe migration semantics remain independently testable.
5. **Ownership:** every take!, share!, borrow! boundary follows normal language checking. A moved resource has exactly one owner at the transfer linearization point; a scheduler decision cannot manufacture a second owner or extend a borrow through a forbidden suspension.
6. **Fairness:** preserve queue admission, supervisor CONTROL reservation, bounded service and cancellation assumptions. Randomized finite testing does not prove fairness, absence of races or hard-real-time guarantees.

## Testing modes and user-facing CLI (proposed, not implemented)

- Random seed mode: atto test --schedule=random --seed 12345 --schedule-steps 10000
- Bounded systematic mode: atto test --schedule=explore --max-schedules 1000
- Input-and-schedule fuzzing: atto test --schedule=fuzz --fuzz-time 30s --seed-corpus tests/schedules
- Exact recorded replay: atto test --replay artifacts/failure.actor-schedule.json
- Failure-preserving reduction: atto test --minimize artifacts/failure.actor-schedule.json

Follow Go's useful first-class fuzzing precedent: seed corpora run as ordinary regression tests, failing cases are persisted, and minimization attempts preserve the failing property. For AttoLang, fuzz both guest inputs **and** schedule choices, with separate PRNG streams and coverage feedback. Persist reproducible artifacts atomically with size and event-count limits. Minimization must preserve failure class, necessary happens-before edges and ownership decisions, and must succeed on repeated exact replay before entering the corpus.

Start with prefix-based schedule branching. Add dynamic partial-order reduction only when actor identities, memory/region footprints, mailbox dependencies and effects make independence provable. Unknown FFI or shared state is dependent by default; do not prune potentially failing schedules.

## Executable oracle and validation

The bounded oracle supports runnable scripted tasks, serial actor deliveries, message cancellation, virtual sleep/timers, supervised generation restarts, quiescent version upgrades, owned-token handoff and shared-counter operations. It captures first failures, accepts recorded choices and explores alternate enabled decisions. An invocation with the same seed and scenario must reproduce identical events; a full saved trace must replay even after a failing property. It is **not** an AttoLang parser, compiler, scheduler, resource-safe implementation or trusted attestation.

Run host tests: node --test tests/deterministic-actor-model.test.mjs

Required negative checks include changed scenario, wrong seed, mutated runnable sets, impossible selected actions, post-state tampering, stale timers after restart, duplicate ownership handoff and bounded step/resource failures. Future runtime tests must add send-vs-close, restart-vs-late-I/O, concurrent mutable borrows, supervisor storms, hot upgrade during receiver execution, mailbox and CONTROL starvation, and failing-property corpus minimization.

## Integration plan and evidence gates

- **atto-spec:** this normative proposed contract and host-only executable oracle.
- **atto-platform-conformance:** versioned portable .atto source fixtures, negative cases, event schemas and honest per-backend status receipts.
- **atto-test.cli:** extend the existing Rust fuzz, offline race and model runners; avoid duplicate Python/JS shipping CLI implementations. Require authenticated runtime capture for any live race-freedom claim. Exit 2 remains inconclusive when runtime instrumentation is absent or incomplete.
- **atto-common-source and atto-source.*:** embed test-scheduler hooks into actual execution engines, not the production hot path by default. Account for reservations, cancellations, DATA and CONTROL lanes, actor incarnation, native I/O retirement, virtual-clock adapters and scheduling effects.
- **backend verification:** run identical compiled .atto guests on JVM/GraalVM, LLVM native, Wasm, .NET Native AOT, Forge and additional Rust/Cranelift/JS/real-time targets where supported. Record exact heads, source trees, fixture blob SHA, compiler/runtime versions, actual stepful runner/job IDs, executed guest traces and whether sandbox/FFI inputs were controlled. Source-only tests and zero-step GitHub Actions are NOT_EXECUTED.

**No cross-backend parity or production scheduler implementation is claimed by this proposal.** It deliberately builds on existing race-evidence and actor-trace contracts, and avoids bypassing the current open test CLI fuzz hardening work.

## Java reference alignment and sealed guest AOT

The temporary behavioral reference is atto-source.java main at [e8f31a6fe759](https://github.com/atto-lang/atto-source.java/commit/e8f31a6fe7595e5f7ab30c6b40188bc6f9e56848). Its OresSchedulerStateModelTest distinguishes logical Future completion from physical EXIT, notification drain and admission release. The bounded serial oracle in this proposal must not be extrapolated to ordinary concurrent receivers or to complete runtime coverage. Require explicit physical lease retirement, generation fencing and exactly-once cleanup in subsequent backend integration. ActorSerialCarrierSafetyV2Test is a JVM host test, not guest AOT evidence.

A test schedule controller must be selected at compile/link time for a sealed full guest AOT artifact; it must not introduce a runtime interpreter, dynamic guest code generation or reflective dispatch. Bound trace buffers, virtual time, exploration and failure reporting independently; use an admitted fixed-capacity or owned region with deterministic reclamation for a zero-guest-GC profile. Host JVM GC and process-wide GC are separate measurement dimensions. Exhaustion is an explicit failure, not an unbounded allocation or fallback. Require actual program-specific guest code generation, execution and allocator/GC evidence before claiming those profiles. See the pinned Java docs/AOT_ZERO_GC_DYNAMISM.md and docs/ATTO_STRICT_AOT_FRONTEND_V1.md.
