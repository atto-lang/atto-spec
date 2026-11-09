# 22 — Receive-Invocation and Task-Owned Execution Stacks

**Status: DRAFT / TARGET, 2026-11-09.** This is a normative candidate, **not** proof of an executing compiler or cross-backend parity. It refines chapters 04, 05, 06 and 18 without changing actor state ownership or declaring a native thread per message.

## Identities and lifetime

An actor owns one persistent private allocation domain (heap/arena) per incarnation. Every successfully admitted, independently active `receive(message)` invocation MUST have a **distinct logical execution stack** identified by an invocation ID and actor incarnation/generation. Its nested synchronous calls are frames on that invocation's stack. Every independently scheduled child `Task` MUST instead have a distinct task-owned stack and a structured parent/actor identity. The carrier OS thread is **never** the authority for either stack.

A logical stack consists of parameters, locals, operand/evaluation frames, return addresses or PCs, owned temporaries, cleanup/defer state, and suspended continuation roots as required by the target ABI. Mutable frames from different invocations or tasks MUST NOT alias. Frame/stack handles MUST be unforgeable to guest code, generation-fenced, and invalid after retirement. Immutable data may be shared only under proven ownership rules; sharing the actor's heap does not imply sharing its stacks.

A receive invocation begins at **mailbox admission to execution** (not merely DATA enqueue), obtains its own stack identity before running guest frames, and ends only after its frames, continuation roots and physically outstanding loans have safely retired. A paused invocation retains its stack budget; its frames may be lowered to heap-backed explicit continuations. Implementations MAY reuse freed stack storage after verified zeroization/reinitialization and generation change, but MAY NOT reuse an active stack's identity/storage for another live invocation.

## Concurrency, suspension and cancellation

* Default `messageConcurrency = 1`: one admitted live DATA receive invocation, including suspended invocations; later DATA remains queued. A wake resumes the same invocation rather than creating another receive stack. This preserves nonreentrancy by default.
* With explicit `messageConcurrency = N`, up to N distinct receive invocations may be live, each with its own stack. This is an **opt-in** target and MUST NOT imply concurrent unsafe actor-state access; sealed state, reader/writer proofs and physical admission remain mandatory.
* An invocation that spawns or resumes a Task keeps its own stack. The Task gets a distinct stack and cannot retain an unpinned loan into parent stack locals. Cancellation request is not physical task retirement; parent stack reclamation waits for outstanding borrowed/pinned roots and structured child cleanup.
* `await` or `select` suspends the same logical stack and can resume on a different carrier. Runtime bookkeeping MUST validate actor generation, invocation identity, wake ticket, cleanup state, and one-shot continuation ownership. Duplicated/stale wakes MUST fail closed.
* A held `critical-read` / `critical-write` state loan cannot be laundered through suspension, child Task captures, or another invocation. Cross-suspension loans require explicit compiler and runtime proof; default is rejection. Actor heap and sealed state are not writable solely because frames belong to the actor.

## Budgets and failure

Each actor MUST account for **aggregate** live invocation stacks, task stacks, frame depth, and continuation bytes, not just bytes on the currently running carrier. Each invocation also has an independently enforced frame/byte quota; failed admission must not partially publish new frames. Exhaustion of one logical guest stack MUST terminally poison that invocation and enforce the actor's supervised failure policy (default actor-incarnation failure). A swallowed guest exception cannot resume a poisoned actor or process the next DATA message.

A backend MUST NOT promise recovery from arbitrary host/OS native stack overflow, JNI/FFI corruption or VM-wide OOM. For untrusted actors, use sufficiently strong process/tenant/VM boundaries and prove containment of runtime-called-near-limit stacks. Reserve space for failure handling and authenticated supervisor CONTROL delivery. Enforce bounded recursion/stack capacity for hard real-time profiles; unbounded segmented growth is not a hard real-time guarantee.

## Physical implementation latitude

| Backend | Permitted implementation strategy; proof required |
| --- | --- |
| Java/GraalVM | Explicit, actor-owned typed frame arenas and resumable continuations; GC-managed host helpers allowed; no per-actor OS thread required |
| LLVM | Bounded/segmented native-safe or explicit heap-backed frames; actor-owned arenas, generation checks, sanitizers and actual compiled guest tests |
| Wasm | Per-actor instance/linear-memory domain where required, bounded explicit guest frames; host Worker stack alone is not actor stack ownership |
| Forge | Actor-owned bounded frame stores and scheduler-backed call chains; compiler-generated use must be tested |
| .NET Native AOT | Actor-owned frame storage and compiler-issued resume/retirement operations; CLR thread stacks do not establish actor isolation |

There is no general promise of one physically allocated native stack per message. Portability requires **one logical stack per live receive invocation**, independent task stacks, and semantically equivalent ownership, limits, suspension, cancellation and failure behavior.

## Required conformance evidence

1. Two live receives of one opt-in multi-message actor have disjoint mutable stack frames and different invocation IDs, even on the same carrier.
2. Default-serial actor retains exactly one suspended invocation; DATA B cannot overtake A's suspended receive merely because A is awaiting I/O.
3. Nested calls and stack-local values survive suspend/resume, including migration between carriers, without a new stack identity.
4. Child Task owns its own stack and cannot retain an escaping parent-stack mutable borrow; cancellation and physical retirement are separately observed.
5. A quota/overflow or swallowed stack-budget exception fails A without corrupting independent B; stale generations, duplicate wakes, recycled IDs and forged frame tickets are rejected.
6. Verify bounded actor-wide stack accounting, overflow in runtime calls, cleanup exactly once, supervisor CONTROL progress, and zeroization before reuse.
7. For every backend, attach exact source/tree/head SHA, actual nonzero-step compiler/guest execution and negative diagnostic receipts. Host-only model tests remain labeled **SOURCE_FREE_MODEL_ONLY**. Missing steps/runner admission count as **NOT_EXECUTED**.

See actor stack-overflow conformance draft #609, logical borrow critical draft #617 and Task capture draft #624 in `oreslang-platform-conformance`. Their existing coverage complements but does not replace live per-invocation identity, suspension and task-stack proofs.
