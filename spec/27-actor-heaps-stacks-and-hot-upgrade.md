# 27 — Actor heaps, stacks and hot upgrade

Status: **normative target; partially implemented** (see the status table at the end).
Builds on [chapter 25](25-receive-invocation-stacks.md) (per-invocation stacks) and the
supervisor hot-upgrade contract. This chapter decides what an actor owns in memory,
and what happens to that memory when the actor's code is replaced.

## 1. One private heap per actor incarnation

1. Every actor incarnation owns exactly one **actor heap**. This includes SHARED actors:
   SHARED changes dispatch and shared-domain eligibility, never heap aliasing.
   Supervisors are actors and own heaps too.
2. The heap is addressed by **unsigned 32-bit actor-relative offsets** on every host,
   including 64-bit hosts. An offset:
   - is not a host pointer, a JVM reference or a CLR reference, and grants no authority;
   - is meaningful only inside its own heap;
   - is never serialized, sent in mail, or accepted from another actor.
3. One heap is at most 4 GiB of addressable space. Data larger than that goes into
   sharded or DOP regions (chapter 10), or into explicitly granted external regions,
   never into a wider pointer.
4. The heap is built on **arenas**: bounded slabs or pages, explicitly freed by
   compiler-emitted drops (chapter 4). It is not traced by a garbage collector. Backend
   bookkeeping objects (facades, metadata) may be managed. The heap's payload bytes may
   not be.
5. The heap is charged against the actor policy's `maxHeapBytes` and against the
   runtime's aggregate budget, per slab. An allocation past either limit fails, and
   charges nothing.
6. Only the owning incarnation's own turns may touch the heap. That includes its
   receive invocations, child Task turns and resumed continuations. Any other thread
   or actor is refused, including a foreign actor holding a captured reference.
7. The heap is retired only after **physical quiescence**:
   - no running or suspended turns;
   - no outstanding read loans, FFI or I/O pins, or timers.

   Retirement scrubs the payload before the memory is reused or freed. If an
   outstanding loan blocks retirement, the incarnation is quarantined; pinned memory is
   never freed.

## 2. Stacks

Chapter 25 governs:
- one logical stack per live receive invocation and per child Task;
- a serial actor has exactly one;
- a continuation resumes the **same** stack.

This chapter adds where the frames live and who pays for them.

8. A suspended invocation's frames (locals, operand state, return point and cleanup
   state) are **actor-owned storage**, charged to the actor that owns the invocation.
   The backend chooses where:
   - in the actor heap;
   - in a per-actor frame arena;
   - in host frames whose size is counted against the same quota.

   The frames are released when the invocation completes, fails or is cancelled.
9. A stack is bound to the **code generation** it started under: its frames refer to
   that generation's code and that generation's state layout. A stack is never
   rewritten to new code (see section 3).

## 3. Hot upgrade

A hot upgrade replaces an actor incarnation's code generation `N` with `N+1`. The
incarnation keeps its identity and its `ActorRef`s. A **restart**, by contrast,
creates a new incarnation (see section 4).

### 3.1 What survives, and what does not

| Owned thing | Hot upgrade (same incarnation) | Restart (new incarnation) |
| --- | --- | --- |
| Identity, `ActorRef`s, supervisor, group memberships | kept | new incarnation id; refs to the old incarnation fail; the supervisor re-links |
| Heap | kept, or migrated into a new heap (3.3) | new heap, from durable state if declared; the old heap is scrubbed and retired |
| Running and suspended stacks | **drained on generation N**, never migrated (3.2) | cancelled; defers run (chapter 7) |
| Queued mail | kept; migrated or rejected (3.4) | carried over per restart policy (chapter 18) |
| Code generation leases | released as generation-N invocations end | all released |

### 3.2 Stacks drain, they do not migrate

10. The upgrade first **freezes admission of new invocations on generation N**. Mail
    keeps queueing, up to mailbox capacity.
11. Every invocation that is running or suspended on generation N, including
    continuations awaiting I/O, finishes **on generation N's code**. A continuation
    carries `(incarnation, code generation)` and resumes only with that generation.
12. The drain has a deadline. When it expires, the upgrade policy decides:
    - **cancel:** cancel the remaining generation-N invocations at their next
      safepoint; defers run within the unwind reserve; or
    - **roll back:** abandon the upgrade, keep generation N and resume admission.

    The supervisor chooses the policy. Waiting never blocks a carrier.
13. Generation-N and generation-N+1 invocations never run at the same time on one
    incarnation. This is what makes the heap migration in 3.3 sound: no old frame can
    observe a new layout, and no new frame can observe an old one.

### 3.3 Heap continuity and migration

14. Each code generation declares the **state schema** of its heap: layout, field
    types and offsets of the actor's persistent state.
15. If the schemas are identical, the heap is kept as is. Offsets are actor-relative,
    so no fixups are needed.
16. If the schemas differ, a compiler-checked **migration function** `migrate(N -> N+1)`
    runs as one CONTROL turn, after the drain:
    - it reads the old heap and writes a **new** heap;
    - it is total and bounded, and performs no I/O and no `await`;
    - it translates offsets explicitly; there are no raw pointers to rewrite.
17. The switch is atomic. Under one publication, the runtime installs:
    - the new code generation;
    - the new heap;
    - the new epoch.

    Ingress then resumes. The old heap is retired under the section 1 rules, after
    every generation-N lease has gone.
18. If migration fails or overruns its budget, the upgrade rolls back:
    - the old heap and generation N stay installed;
    - the new heap is scrubbed and retired;
    - the actor's state is unchanged.

    Copy-then-switch is what makes rollback possible.

### 3.4 Mail across an upgrade

19. Mail queued under generation N is delivered to generation N+1 only if its message
    type is unchanged, or a declared message migration converts it. Mail that cannot
    be converted is rejected to its sender as a typed failure. It is never dropped
    silently, and never delivered against the wrong type.

## 4. Restart

20. A restart creates a new incarnation. It gets:
    - a new heap, initialized from declared durable state or from `on_start`;
    - new stacks;
    - a new incarnation id, which fences all old refs, tickets and continuations.

    The old incarnation's stacks are cancelled (defers run). Its heap is retired after
    quiescence, as in section 1.

## 5. Backend mapping

| Backend | Heap | Frames | Upgrade substrate |
| --- | --- | --- | --- |
| Java / GraalVM | `ActorNativeArena`: direct-buffer slabs, u32 actor-relative offsets; `ActorLinearMemory` pages over it. Facades and metadata are JVM-managed (minimum GC, not zero GC). | Truffle frames, bounded by `LogicalStackQuota`; arena `TaskFrame` for persistent task state | `ActorRef.upgrade(ActorUpgrade)`: freeze, drain, rebind or migrate copy-then-switch, rollback, queued-mail filter (host Behaviors; compiled source actors fail closed until the compiler emits state schemas) |
| LLVM / native | Compiled source actors own an `ActorOwnedI64Heap` (scalar i64 slots, 64-bit slot handles). `ActorArena` + `ActorRegionV1` provide the u32-offset arena (`OresActorOffset32`; hardened for 32-bit hosts in #1872; 8-byte natural alignment for 64-bit fields, the i386 `alignof(int64_t) == 4` trap) but only as a host ABI, not yet behind source actors | Per-actor logical frame arenas (#1537, open) | Native supervisor lifecycle FSM (#864, open) |
| .NET | `ActorArena`, one per actor of every kind, opened at spawn and bound to the incarnation: `NativeMemory` persistent and scratch regions outside the CLR GC, int32 offsets, at most 64 MiB, turn-scoped (`ActorArenaTurn`) | `ActorExecutionStack`, one per actor (`ActorStackBytes`); per-invocation stacks are pending | None yet |
| Wasm / rs | Per-actor linear memory, which is natively 32-bit | Call-depth quota (atto-source.rs #261) | Re-instantiation per incarnation (planned) |

## 6. Conformance

1. Two actors of every kind write different values at the same heap offset and each
   reads back its own. SHARED is included.
2. Heap access from another actor's turn, or from a non-carrier thread, fails closed.
3. An allocation past `maxHeapBytes` fails, without a partial charge.
4. Retirement refunds the budget exactly once and closes the heap. An outstanding read
   loan blocks retirement and quarantines the incarnation.
5. During an upgrade, a generation-N continuation resumes on generation N's code, and
   no generation-N+1 invocation starts until the drain completes.
6. A schema-changing upgrade reads the result of `migrate` from the new heap. A failing
   `migrate` leaves generation N and its unchanged heap installed.
7. Mail of a removed message type is rejected to its sender after the upgrade.
8. A restart's new incarnation cannot be reached through old refs, tickets or
   continuations.

## 7. Status (2026-11-17)

| Item | Java | LLVM | .NET | Wasm |
| --- | --- | --- | --- | --- |
| One heap per incarnation, all kinds | **yes**: oreslang-source.java #3164 | yes, but a scalar i64 heap | **yes** (`ActorArena` at spawn) | per-actor memory, host only |
| u32 offsets | yes | arena/region ABI only; source actors use 64-bit slot handles | yes (int32, at most 64 MiB) | yes (native) |
| Turn-scoped access | yes | yes (owner/turn fences) | yes | host only |
| Frames charged to the actor | quota only | #1537 (open) | per serial actor | depth quota |
| Hot upgrade drain + migrate | **yes** for host Behaviors (oreslang-source.java, `ActorHotUpgradeTest`); compiled source actors fail closed | no | no | no |
| Restart = new incarnation + new heap | **yes** (`SupervisorStrategy`, #3174) | no | no | no |
| Drain deadline policy (rule 12) | **yes**: ROLL_BACK, and CANCEL (cancels owned Futures; cleanup runs on N; rolls back after a second deadline) | no | no | no |
| Rejected queued mail (rule 19) | handed with its sender to the plan's `onRejected` sink and counted; the typed reply is the plan's job | no | no | no |
