# Proposal: periodic cooperation, hard-fuel accounting and cancellation v1

**Status: PROPOSED (2026-11-08).** Backend-neutral acceptance contract, **not an implemented feature or certified compiler/runtime**. The machine-readable traces are in `contracts/cooperation/checkpoints.v1.json`; a source-free oracle is `tests/cooperation-contract.test.mjs`. Neither compiles nor executes a `.atto` guest.

## Two clocks with different safety roles

**Soft scheduling/fairness.** After every committed, compiler-verified bounded loop backedge or equivalent unit, advance a cheap counter. A slow clock/scheduler poll may occur every **128, 256 or 512** units even after the **512-unit soft fairness threshold**. A deferrable yield does **not** change ticks 513–639 into repeated expensive polls. With 128 units, peer progress can be deferred by 127 additional bounded work units, not a bounded wall time. Never yield an active actor turn with live mutable borrows, `critical` sections, uncaptured host frames, partial effects, or unsafe cleanup.

**Hard UNTRUSTED security.** Task/tenant hard fuel and cancellation must be checked or irrevocably reserved **before every admitted untrusted work unit**, independent of sampled fairness. `await`, restart, migration, carrier change, physical redispatch and actor supervision cannot mint new fuel. If a cancellation arrives between bounded units, deny admission of the next untrusted unit or prove an equally strong independent host revocation bound. A foreign call or unbounded loop *body* needs a separate revocation/isolation proof; sampling cannot preempt inside one unbounded work unit.

Traces distinguish `CANCELLED_AT_SOFT_POLL` for trusted cooperative fairness (potentially delayed) and `CANCELLED_AT_HARD_BOUNDARY` for untrusted work (must be promptly enforced). Hard-fuel terminal state is sticky, and a 512-unit fairness target **is not tenant fuel**. Failure containment requires real actor-owned continuations and verified cleanup; this contract alone does not establish those features.

## Compiler and runtime acceptance (mandatory before declaring completion)

1. Instrument all reachable **post-optimization** unbounded loop cycles, recursive/mutually recursive/indirect call cycles, and optimized tail-call cycles. An SCC containing one checkpoint is inadequate: there must be no reachable path that cycles around hard metering. Unknown indirect targets must fail closed.
2. Compile and execute genuine `.atto` guests under O0 and optimized builds in all supported backends; verify tight loops, recursion, cancellation just after 512, repeated 127-unit resumed segments, critical deferral, shared-carrier sibling progress, and a deliberately removed-last-checkpoint negative mutation.
3. Verify actor-local heap/stack/continuation identity and generation on suspension, cancellation, cleanup and supervision. No second actor turn may begin while the first is suspended or canceling; no carrier may be blocked for cooperative handoff.
4. Exercise unbounded FFI and long-running loop bodies independently; if the runtime has no enforceable revoker, reject unsafe untrusted source rather than certify it from a counter.
5. Publish exact source HEAD and tree, compiler build/target, nonempty executed CI steps, actual compiled guest receipts, negative diagnostics and sibling-actor results. Host-only tests, zero-step workflows, and source-free model green checks do **not** count as backend parity.

## Ownership / non-duplication

The existing conformance #589, Java/GraalVM #2655/#2657 and .NET #402/#404 own their implementation surfaces. This proposal changes only `atto-lang/atto-spec` new paths, without rebasing, modifying or merging those PR branches. Normative adoption and cross-backend execution follow independent review.
