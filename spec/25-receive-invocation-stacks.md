# 25 — Receive-Invocation and Task-Owned Execution Stacks

**Status: DRAFT / TARGET, 2026-11-09.** This is a normative candidate, **not** proof of an executing compiler or cross-backend parity. It refines chapters 04, 05, 06 and 18 without changing actor state ownership or declaring a native thread per message.

## Identities and lifetime

An actor owns one persistent private allocation domain (heap/arena) per incarnation. Every successfully admitted, independently active `receive(message)` invocation MUST have a **distinct logical execution stack** identified by an invocation ID and actor incarnation/generation. Its nested synchronous calls are frames on that invocation's stack. Every independently scheduled child `Task` MUST instead have a distinct task-owned stack and a structured parent/actor identity. The carrier OS thread is **never** the authority for either stack.

A logical stack consists of parameters, locals, operand/evaluation frames, return addresses or PCs, owned temporaries, cleanup/defer state, and suspended continuation roots as required by the target ABI. Mutable frames from different invocations or tasks MUST NOT alias. Frame/stack handles MUST be unforgeable to guest code, generation-fenced, and invalid after retirement. Immutable data may be shared only under proven ownership rules; sharing the actor's heap does not imply sharing its stacks.

A receive invocation begins at **mailbox admission to execution** (not merely DATA enqueue), obtains its own stack identity before running guest frames, and ends only after its frames, continuation roots and physically outstanding loans have safely retired. A paused invocation retains its stack budget; its frames may be lowered to heap-backed explicit continuations. Implementations MAY reuse freed stack storage after verified zeroization/reinitialization and generation change, but MAY NOT reuse an active stack's identity/storage for another live invocation.

## Concurrency, suspension and cancellation

* **Ordinary actors are concurrent by default.** Several admitted DATA receive invocations of the same actor may be live at once, each on its own logical stack, up to a runtime-configured, bounded per-actor live-invocation limit. Concurrency never grants concurrent unsafe actor-state access: sealed `state`, `critical-read` (shared readers) and `critical-write` (exclusive writer) proofs and physical admission remain mandatory.
* **`define serial actor`** admits exactly one live DATA receive invocation at a time, including suspended invocations; later DATA stays queued, and a wake resumes the same invocation rather than creating another receive stack. A serial actor therefore needs only one active receive stack, which implementations MAY reuse across invocations after retirement and generation change.
* A serial actor's independently invoked non-`receive` receiver methods are not gated by its DATA receive permit. They require separate concurrent frames, normal borrow checks and scoped state loans. A synchronous method call within `receive()` remains on that receive invocation's logical stack.
* There is deliberately **no single shared stack per ordinary actor**. Concurrent invocations and invocations suspended across `await` would otherwise either serialize the actor (contradicting the concurrent default) or interleave mutable frames.
* An invocation that spawns or resumes a Task keeps its own stack. The Task gets a distinct stack and cannot retain an unpinned loan into parent stack locals. Cancellation request is not physical task retirement; parent stack reclamation waits for outstanding borrowed/pinned roots and structured child cleanup.
* `await` or `select` suspends the same logical stack and can resume on a different carrier. Runtime bookkeeping MUST validate actor generation, invocation identity, wake ticket, cleanup state, and one-shot continuation ownership. Duplicated/stale wakes MUST fail closed.
* A held `critical-read` / `critical-write` state loan cannot be laundered through suspension, child Task captures, or another invocation. Cross-suspension loans require explicit compiler and runtime proof; default is rejection. Actor heap and sealed state are not writable solely because frames belong to the actor.

## Placement in the actor arena

Logical stacks are owned by the actor incarnation and are allocated from, and charged to, that actor's private allocation domain. Stack segments and heap-lowered continuation frames are addressed by **32-bit actor-relative offsets or handles**, never by raw 64-bit host pointers exposed to guest code, and carry the actor generation for stale-reference detection. Growth is by bounded segments inside the arena. On incarnation retirement, every invocation and task stack of that incarnation is retired together. A physical backend may additionally run frames on a carrier native stack (see the table below), provided no guest-visible frame address escapes and the logical accounting above holds.

## Budgets and failure

Each actor MUST account for **aggregate** live invocation stacks, task stacks, frame depth, and continuation bytes, not just bytes on the currently running carrier. Each invocation also has an independently enforced frame/byte quota; failed admission must not partially publish new frames. Exhaustion of one logical guest stack MUST terminally poison that invocation and enforce the actor's supervised failure policy (default actor-incarnation failure). A swallowed guest exception cannot resume a poisoned actor or process the next DATA message.

A backend MUST NOT promise recovery from arbitrary host/OS native stack overflow, JNI/FFI corruption or VM-wide OOM. For untrusted actors, use sufficiently strong process/tenant/VM boundaries and prove containment of runtime-called-near-limit stacks. Reserve space for failure handling and authenticated supervisor CONTROL delivery. Enforce bounded recursion/stack capacity for hard real-time profiles; unbounded segmented growth is not a hard real-time guarantee.


## Unwinding: throw, raise, panic and stack exhaustion

Every terminal effect unwinds **the logical stack it was raised on**, and only that stack. `defer` cleanups and compiler-owned guards run exactly once, in reverse registration order, on the owning invocation or Task's execution context, for **every** effect below. That includes `raise` and `panic`. Forced termination, unsafe host failure or exhaustion of the bounded unwind reserve may prevent individual guest cleanups; runtime-owned retirement remains independently required (see `atto-spec` `language/defer-recover-unwind-v1.md`, which this table restates for stacks).

| Effect | `catch` | `trap` | `recover` | `defer` | Ends at |
| --- | --- | --- | --- | --- | --- |
| `throw` | nearest match in the caller chain | ordinary escaping throw becomes `Err(Error)`; see chapter 07 | only if still unhandled at a recovery boundary | runs | invocation/Task boundary, then supervisor |
| `raise` | bypassed | bypassed | nearest eligible | runs | parent Task or supervisor CONTROL |
| `panic` | bypassed | bypassed | never | runs | supervisor CONTROL |
| logical stack exhaustion | bypassed | bypassed | never | runs, within a bounded unwind reserve | supervisor CONTROL; default actor restart |
| cancellation | bypassed | bypassed | never | runs where safe | scheduler |
| host fatal (VM OOM, host native overflow, FFI corruption) | bypassed | bypassed | never | not promised | host policy |

- **Stack exhaustion is panic-class.** No guest construct consumes it. The poisoned invocation unwinds and then fails under the actor's supervision policy. It never resumes, and it never processes the next DATA message.
- **Unwind reserve.** When a logical stack overflows, its cleanups need frames to run. The runtime MUST grant a small, fixed reserve of extra frames or bytes to a poisoned stack while it unwinds. A cleanup that exhausts the reserve fails too. That failure is recorded as bounded suppressed metadata on the original overflow. Further guest cleanups may run only if their remaining reserve and safety are established; otherwise skip them, report incomplete cleanup and proceed to runtime-owned retirement or quarantine. Never replenish the reserve without a bound. The reserve MUST be bounded and counted against the actor's aggregate budget. It cannot grow into another invocation's stack.
- **Recover callbacks** run on the failing invocation's own stack, after that scope's defers, and are charged to its quota. They never run on a foreign mailman, I/O or control thread. A recover callback that overflows is itself panic-class.
- **Precedence** is fatal/cancel > panic (including stack exhaustion) > raise > throw > success. A cleanup failure never hides a stronger pending cause.
- An unwinding invocation affects no other stack. Sibling invocations of the same actor keep their frames. Whether they continue depends on the actor's failure policy, which by default stops the incarnation after the failing invocation unwinds.

## Execution contexts, continuations and callbacks

* An **execution context** is the identity of one logical stack: a receive invocation or a Task. It owns that stack's quota, unwind chain (defers and recovers) and trace lineage. Carrier threads are never execution contexts.
* A **continuation** is a resume point of an existing logical stack. `await`, `select` and `rt cooperate` do not create a new stack. The suspended frames become heap-held continuation state, charged to the same invocation, and resume under the same execution context, possibly on another carrier. A continuation cannot be resumed twice (one-shot wake ticket).
* A **new** execution context, and therefore a new logical stack, is created only for: an admitted receive invocation, a spawned or `task { }` child Task, and a supervisor-owned `on_panic` / CONTROL handler. A completion callback registered by guest code (for example a `Future` continuation lambda) runs either as a continuation of its registering context, when it is part of that invocation's control flow, or as a child Task. It never runs on an anonymous stack.
* Defers and recovers registered before a suspension stay attached to the suspended stack. They run when that stack unwinds, even if the unwind happens on a different carrier after resumption.

## Carriers, pools and affinity

The pool topology is chapter 06's: a control and main path, the reactor, `ores-scheduler`, and lazily populated shared, isolated/private and untrusted actor pools. Logical stacks never cross pools: an invocation runs, suspends and resumes only on carriers of its actor's pool.

* Several carriers MAY run invocations of one ordinary actor at the same time, each on its own stack. A `define serial actor` has at most one running or suspended DATA receive invocation; independent non-receive method frames are not counted against that receive permit.
* **Soft affinity** (chapter 10) is the default. Each actor has a home lane in its pool. Its invocations and resumed continuations are queued there first, so the actor's arena, mailbox and recently used stack segments stay warm in that carrier's caches. A carrier that becomes free takes its own lane's work first, which in an otherwise equal choice means revisiting actors it has already run. It spills to, or steals from, other lanes only under bounded congestion, preferring lanes in the same LLC or NUMA domain.
* Affinity is a placement preference and never an identity. Stack identity, quotas and generation checks MUST NOT depend on which carrier runs a frame, and spill or steal MUST NOT change observable results.
* Stack segments freed by a retired invocation SHOULD be reused, after zeroization and a generation change, by the next invocation on the same lane, which keeps them cache-warm.

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

1. Two live receives of one ordinary (concurrent-by-default) actor have disjoint mutable stack frames and different invocation IDs, even on the same carrier.
2. A `define serial actor` retains exactly one suspended invocation; DATA B cannot overtake A's suspended receive merely because A is awaiting I/O. An ordinary (concurrent) actor admits B on a distinct stack while A is suspended, and neither can observe or mutate the other's frames.
3. Nested calls and stack-local values survive suspend/resume, including migration between carriers, without a new stack identity.
4. Child Task owns its own stack and cannot retain an escaping parent-stack mutable borrow; cancellation and physical retirement are separately observed.
5. A quota/overflow or swallowed stack-budget exception fails A without corrupting independent B; stale generations, duplicate wakes, recycled IDs and forged frame tickets are rejected.
6. Verify bounded actor-wide stack accounting, overflow in runtime calls, cleanup exactly once, supervisor CONTROL progress, and zeroization before reuse.
7. For every backend, attach exact source/tree/head SHA, actual nonzero-step compiler/guest execution and negative diagnostic receipts. Host-only model tests remain labeled **SOURCE_FREE_MODEL_ONLY**. Missing steps/runner admission count as **NOT_EXECUTED**.
8. Overflow unwinding runs every live frame's `defer` exactly once using only the bounded unwind reserve. Guest `catch`, `trap` and `recover` cannot consume stack exhaustion. Trusted host code that swallows it still fails the incarnation.
9. `raise` and `panic` both run defers before escalating; `panic` never reaches a local `recover`.
10. A continuation resumed on another carrier keeps its execution context, quota and pending defers. No guest callback runs without an execution context.

See actor stack-overflow conformance draft #609, logical borrow critical draft #617 and Task capture draft #624 in `oreslang-platform-conformance`. Their existing coverage complements but does not replace live per-invocation identity, suspension and task-stack proofs.

## Backend status (audit, 2026-11-16)

This section records state, not normative text.

| Backend | Logical stack per invocation | Contained stack exhaustion | Notes |
| --- | --- | --- | --- |
| Java/GraalVM | Yes for synchronous frames: a per-receive segment with a 1024-frame quota, plus a per-carrier ceiling sized from the real thread stack | Yes: actor fails, carrier and siblings continue (oreslang-source.java, `LogicalStackQuota`) | Mailbox is still processed serially per actor. Task steps use the carrier's root segment. Runtime panics run defers innermost-first and bypass `catch` (verified). Source `throw`/`raise`/`panic`/`recover` statements are not yet admitted by the parser |
| LLVM | Runtime substrate only (`NativeActorLogicalFramesV1`: up to 64 live turns, `max_turns = 1` for serial actors), not used by compiled code | No on `main`: compiled guest failures call `abort()`. The tenant-VM chain (llvm #1343 → #1565 → #1566) adds guarded carriers, a per-turn byte quota and restart | Landing the tenant-VM chain is the parity path |
| .NET Native AOT | No: one `ActorFrameStack` per serial actor | No: a CLR stack overflow ends the process. Untrusted tenants run as Wasm on the native core | Needs a per-invocation frame stack plus a frame quota |
| Wasm (Wasmtime) | Per Store | Traps at the Store level; actor-level restart not built | |
