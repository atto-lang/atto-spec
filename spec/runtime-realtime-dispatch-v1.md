# Proposed runtime dispatch and real-time contract (v1)

**Status:** DRAFT / normative proposal only. Nothing here is a claim of executable `.atto` support or a hard-real-time certification.

This is the shared contract for the NIO/native reactor, bounded carrier/thread scheduler, supervisor control loop and actor mailman. Implementations MUST reject an unsupported guarantee rather than claim parity on the basis of host-only tests. Actor state remains sealed and single-writer; none of these runtime operations grant direct state access.

## 1. Real-time target profiles

1. **General**: functional semantics, finite configuration limits, no deterministic tail-latency claim.
2. **Soft RT**: fixed resource budgets, admission control, bounded per-turn work and measured p50/p95/p99/p99.9/p99.99 under stated load/toolchain/host conditions. The reported worst observation is **not** WCET.
3. **Hard RT candidate**: native/embedded/RTOS-specific. Activation requires bounded allocations, bounded critical sections, analyzable scheduling and interrupts, a finite workload/FFI model, a supported preemption mechanism, a WCET/schedulability argument and measurements on the actual deployment target. A Java/JVM, browser worker, ordinary desktop OS or unqualified Native Image run MUST NOT be labelled hard RT.

Each target advertises a machine-readable capability set and rejects hard-RT mode if any required property is not established. A promise of soft RT is conditional on configured capacities and the tested load envelope; oversubscription MUST be reported as admission refusal or missed deadline, not suppressed.

## 2. Lifecycle and shared invariants

An actor transitions `NEW -> RUNNABLE -> RUNNING -> QUIESCING -> STOPPED`, or `RUNNING -> FAILED -> QUIESCING -> STOPPED`. No restart reuses an old generation. A handle is `(actor_id, generation)`; all wakeups, readiness registrations, timer tickets, mailbox admissions, and forwarded deliveries validate both elements.

- Exactly one carrier may hold an actor's execution lease. A transition from RUNNABLE to RUNNING is linearizable. Completion or explicit yielding returns the lease once.
- A successful send commits exactly one mail item and its capacity/byte charges together; refusal commits nothing. A staged send cancelled before commit releases its reservation.
- `accepted = completed + failed + abandoned + queued + in_flight` is an invariant at each consistent snapshot. Each admitted item reaches exactly one terminal disposition. In-flight work is not hidden from accounting.
- Closing and draining are single-owner transitions. Concurrent `close`, `cancel`, reactor wakeup and sender racing with close are idempotent/fail-closed. No memory access after retirement or arena release.
- No operation waits, parks, makes arbitrary foreign calls, blocks for reactor readiness, invokes user callbacks or allocates managed objects while holding the mailbox, scheduler, reactor or supervisor critical lock. No unbounded spin on full queues.
- When a configured budget is exhausted, the runtime emits a typed quota/fault result. Dropping acknowledged messages, silent backlog expansion and automatic busy-spin are forbidden.

## 3. NIO / native reactor

A reactor has exactly one owner for a selector/epoll/kqueue/io_uring completion domain. Selection is distinct from guest actor execution. Readiness handlers MUST NOT execute arbitrary guest code on the reactor thread.

- A fixed-size registration table and bounded cross-thread command queue control descriptor admissions. Registration and cancellation are idempotent and generation-checked. Exhaustion returns an explicit `ReactorCapacity` or `WouldBlock` result.
- A command enqueue and wakeup are ordered so that no wakeup is lost between draining commands and entering `select`. Wakeups are coalesced; a full command queue cannot pretend a command was accepted.
- Each poll tick has a maximum of `max_ready_per_tick` readiness records and `max_commands_per_tick` maintenance commands. Unprocessed ready descriptors remain eligible for subsequent ticks; a noisy descriptor cannot monopolize dispatch.
- Level-triggered readiness must be rearmed or interest-masked correctly. Edge-triggered implementations must drain only up to the budget and explicitly requeue continuation; they cannot assume a second edge.
- Read/write byte counts per descriptor and per tick are capped. If downstream mailbox credits are absent, pause interest (or retain a bounded pending ticket), rather than reading unbounded data or dropping a committed delivery.
- Close/deregister fences late completion events by generation, including file-descriptor number reuse. Reactor shutdown first stops new registration, then cancels interests, drains/cancels queued completions and releases owned OS handles exactly once.
- Zero-ready `select` returns, interruption, selector rebuild/spurious wakeups and repeated ready-but-no-progress events have explicit bounded retry/backoff/diagnostic policy. They cannot become an infinite tight loop.
- Reactor work is measured separately from actor work: select-to-dispatch latency, descriptor wait age, wakeup latency, command occupancy, pause/rearm counts and readiness budget overruns.

## 4. Carrier/thread scheduler

A runtime chooses a finite number of carriers and bounded per-priority runnable queues. It MUST NOT create an unbounded dedicated OS thread per actor. Threads are resources admitted against an explicit target budget.

- A runnable transition uses one generation-checked enqueue token per actor; duplicate wakeups coalesce. Running actors cannot be enqueued concurrently for parallel execution unless a separate, proven reentrancy contract exists.
- Each turn has **both** a reduction/fuel limit and an elapsed-time target. Fuel is decremented before/at operations; check the time target at bounded safe points, e.g. loop backedges, calls and message boundaries. The worst time between safe points must be explicitly bounded for a hard-RT candidate.
- Yielding moves the actor to the tail of its eligible class, preserving its pending mail. A worker must never sleep while an eligible actor is runnable. Wake notifications and sleep transitions use an atomic predicate protocol.
- Actor run queue occupancy is bounded. On exhaustion, the scheduler either backpressures admission or returns a typed error; it cannot silently lose an already admitted actor.
- Priority donation/ceiling, bounded lock-hold durations and reactor-vs-carrier CPU reservation are target policies. Ordinary unfair mutexes are not a hard-RT proof.
- Fairness requires an explicit finite service bound for runnable normal actors within the certified load envelope. Priority classes must have quantified reservations, not an infinite series of CONTROL turns with no other eligible service.

## 5. Supervisor CONTROL loop and select semantics

Supervisor events (actor panic, unrecovered raise, worker crash, child termination, deadline escalation, shutdown) are delivered through a **separate bounded CONTROL lane**, not the actor's ordinary mail. Failed actors cannot intercept or consume their own panic notices.

- A CONTROL notice includes actor ID/generation, supervisor ID, failure kind, monotonic sequence, and an immutable minimal reason token. Capture expensive stack traces outside the priority critical path.
- Panic/fatal delivery needs reserved CONTROL capacity independently of user-data mailbox saturation. If a CONTROL lane is full, the runtime enters a specified parent escalation/terminal fail-closed path; it MUST NOT silently discard the failure.
- The internal supervisor `select` polls CONTROL readiness before ordinary mail when both are ready. The readiness check and dequeue are atomic with respect to wakeups, and close/cancel is also selectable; **no lost wakeups**. A caller-visible language `select` retains its own specified source/guard semantics; this priority rule is for the supervisor's internal CONTROL loop and MUST NOT silently rewrite user `select` behavior.
- Handle at most `max_control_batch` notices before checking shutdown/deadline tasks and configured non-CONTROL service reservations. A flood of failing children cannot starve escalation timers, another parent, or all normal actors.
- No arbitrary actor code or synchronous child restart executes while holding the supervisor gate. Restart is bounded by an explicit backoff, intensity/window limit, generation refresh and child supervision policy; repeated rapid failures escalate.
- A supervisor can be supervised in turn. A failed supervisor CONTROL path is reported to the ancestor or an external watchdog; a process-local infinite rescue loop is disallowed.

## 6. Mailmen, mailbox and transport

A mailman performs routing/serialization/cross-domain transfer using the same generation-checked admission semantics. Mailmen are independently budgeted actors/workers, not implicit unbounded queues.

- Separate bounded CONTROL and normal channels; fixed capacity and byte quotas per destination and globally. Explicit priorities, but with documented non-CONTROL service quota.
- Send result distinguishes `Accepted`, `MailboxFull`, `Closed`, `StaleGeneration`, `QuotaExceeded` and `Cancelled`. After `Accepted`, the runtime guarantees disposition accounting, not necessarily application processing success.
- Mailman route decisions and peer credit updates cannot race with actor replacement to deliver to a successor generation accidentally. Duplicate retry tokens require explicit deduplication semantics; never assume exactly-once network transport delivery.
- Buffer ownership is affine: commit transfers the owned lease once; failure returns it intact. Pinned I/O buffers remain alive through OS completion or certified cancellation acknowledgement. No reuse while OS access may be active.
- Mailbox pressure propagates toward reactor interest masking and remote flow-control credits. An outbound mailman must not exceed the configured outstanding-byte window, even if the peer never consumes.
- Stop protocol: refuse new commits -> quiesce producers -> drain or explicitly abandon accepted work -> publish terminal counters -> free memory. Drained and abandoned counts must reconcile at every level.

## 7. Required falsification / conformance scenarios

Test each backend's claimed profile on real emitted guest artifacts where available. A separate host reference probe may validate mechanics but is explicitly `HOST_ONLY`, not `GUEST_PASSED`.

| ID | Scenario | Mandatory observation |
| --- | --- | --- |
| RT-01 | Simultaneous send and close | One linearized admit/refuse result; no use-after-free |
| RT-02 | Two concurrent closes and snapshot after close | Idempotent retirement; immutable final accounting |
| RT-03 | Send while worker owns an in-flight turn | Invariant includes in-flight turn |
| RT-04 | Full mailbox and full byte quota | No unbounded allocation, no silent admission |
| RT-05 | Reactor wakeup between queue drain and select | No missed registration/cancellation |
| RT-06 | Descriptor close and immediate numeric descriptor reuse | Late readiness cannot target new generation |
| RT-07 | Edge-ready descriptor exceeds per-tick budget | Eventual progress without busy spin or lost bytes |
| RT-08 | Downstream mailbox full during socket readiness | Interest paused/rearmed without lossy accepted delivery |
| RT-09 | Fault while ordinary mailbox saturated | Supervisor CONTROL delivery or explicit escalation |
| RT-10 | CONTROL flood and healthy neighboring actor | Defined latency/service bound for neighbor and shutdown |
| RT-11 | Two carriers race to schedule same actor | Single execution lease, duplicate wakeup coalesced |
| RT-12 | Long-running loop and deep recursive call | Fuel/time checkpoints or explicit unsupported rejection |
| RT-13 | Stale timer/ticket/mailman route after actor restart | Generation-fenced refusal |
| RT-14 | Cancel during in-flight I/O buffer lease | No early release, reuse or double completion |
| RT-15 | Fault before dequeue while idle | No fabricated failed admitted turn |
| RT-16 | Supervisor restart storm | Bounded retries, parent escalation, no infinite CONTROL loop |
| RT-17 | Shutdown under heavy I/O and mail traffic | No leaked descriptors, queued bytes or completion tickets |
| RT-18 | Host CPU starvation / configured overload | Admission or deadline miss reported, never claimed as RT success |

For each test report: source SHA, source tree hash, artifact digest, test fixture digest, compiler/runtime version, host kernel/OS, CPU/clock governor, target, capacities, load, sample count, per-stage histograms, maximum observed latency, and `PASSED / FAILED / UNSUPPORTED / NOT_EXECUTED`. A check with zero executed steps is `NOT_EXECUTED`. A host-only Java/LLVM ABI test is not proof that a compiled `.atto` guest uses the same path.

**Release gates:** Soft RT may be claimed only for a specified workload envelope with repeatable executed measurements and validated safety/fairness properties. Hard RT remains `NOT_CERTIFIED` without target-specific WCET, interrupt and resource bounds, schedulability evidence, and an enforceable foreign-code/termination boundary.
