# 28 — Fatal-fault containment and evidence classes

**Status: TARGET evidence policy, not implemented or certified on any backend by this amendment.** This is an additive admission policy for [runtime guarantees](18-runtime-guarantees.md), [failure effects](07-errors-and-failure.md), [isolation](08-isolation-and-permissions.md), and [execution evidence](11-conformance.md). It does not change `throw`/`raise`/`panic`, automatically promise restarts, or make unsafe host code recoverable.

## Do not conflate language failures with host faults

| Failure class | Examples | Minimum credible containment mechanism | Claim allowed without physical guest evidence? |
| --- | --- | --- | --- |
| `guest-panic` | Explicit `panic`, failed `unwrap()` | Actor incarnation generation fence, supervisor CONTROL path, independent receive stack | No |
| `guest-stack-quota` | Actor recursion exceeding a checked quota, including runtime frames | Guarded native stack or bounded explicit frames plus independent emergency unwind stack | No |
| `guest-memory-bounds` | Checked array/arena bounds trap | Checked lowering or protected linear memory with an actor-local recovery boundary | No |
| `actor-oom` | Actor arena allocation quota exhausted | Charge before allocation; allocation failure as an actor value/control failure; no unbounded fallback allocator | No |
| `native-segv` | Bad FFI pointer or native memory corruption | A separate fault-contained OS process or equivalent hardware-enforced isolation; a same-process signal handler is not proof | No |
| `host-oom` | Global allocator exhaustion or kernel OOM kill | Separate constrained worker process/tenant with enforced memory budget; reserve supervisor resources | No |
| `os-process-kill` | SIGKILL/forced termination of an entire process | Parent supervisor in a *different* live process, with independent credentials and liveness evidence | No |
| `vm-corruption` | Runtime or JIT internal memory corruption | Separate isolated process and externally verified clean replacement; no same-process continuation | No |

A regular actor heap, `Arc`, separate logical stack, Java isolate, or tenant VM is *not automatically* a hardware or kernel fault domain. In-process LLVM, Java, .NET, Forge and Wasm implementations MUST advertise the exact mechanism actually exercised; if an entire host can die, the advertised containment scope is process, not actor.

A failure classified as process-fatal MUST NOT be converted into an actor-level `panic` receipt by catching a signal, host exception or untrusted exception object and resuming the corrupted process. A supervisor may restart a terminated child *process* only after the OS has reaped the old PID, closed inherited capabilities, invalidated all old handles and established a fresh immutable build identity.

## Actor-owned resources and cross-thread receives

An ordinary actor MAY have concurrent live receiver invocations; `serial` constrains receive admission only. The logical stack, outstanding I/O loans and control registration of **every** receive must be accounted to its actor incarnation. Failure/restart linearizes against receive admission, drains or revokes outstanding continuation and I/O authorities, then retires the arena. A surviving sibling's progress proves nothing unless it executes **after** the fault and after the failing incarnation's resources are physically retired.

Process-fatal testing MUST NOT run deliberately malicious SIGSEGV/SIGKILL or global OOM probes inside an unisolated shared CI agent or the control-plane process. Run each probe in a disposable resource-limited child process with an independently monitored supervisor, bounded memory/CPU/time, disabled dangerous capabilities, and a controlled kill/reap path.

## Required stage gates for a containment claim

1. **Static admission:** exact same `.atto` bytes across targets, typed classification, permission and quota checks, rejection of a path that claims a stronger domain than its lowering provides.
2. **Physical guest execution:** exact source/tree/blob and native binary or Wasm artifact identities; executing fault trigger, verified fault reason and expected exit/signal, no source-external simulation substituted for the guest.
3. **Survivor liveness:** a concurrently active healthy sibling completes a *new* task after the fault and after physical cleanup; timer/IO scheduler and supervisor CONTROL remain available.
4. **Incarnation fencing:** stale actor-generation handles, queued sends, pending replies, retry messages and hot-loaded code generations cannot be replayed to a replacement without explicit policy.
5. **Budget containment:** CPU, memory, stack, mailbox, timer and I/O quotas checked at real allocation/admission boundaries; denial does not allocate an unbounded diagnostic or unbounded fallback path.
6. **Host crash isolation:** for native-segv/host-oom/os-process-kill/vm-corruption actor-containment claims, demonstrate the process or hardware boundary under the *actual* target runtime. Same-process exception interception is insufficient.
7. **Independent evidence:** runner/job steps, compiler output, post-fault survivor observation, forced-fault process status, binary artifact hashes and trusted host/reviewer provenance. Zero-step runs and manifest-only tests never certify containment.

No backend obtains a blanket `fault_isolated` capability merely by passing the `guest-panic` gate. Per-failure-class, per-backend, per-execution-mode evidence must remain independently versioned. A source-free model can reject inconsistent declarations but MUST always report certification false.

## Draft conformance tuple

The common tuple is `(backend, execution_mode, failure_class, claimed_scope, isolation_mechanism)`. Scope is one of `actor`, `tenant`, `process`; the mechanism must be independently shown, not inferred from a name. A fatal host fault claiming actor survival with only `same-process` is a hard denial. A `not_executed` claim is valid bookkeeping, never a pass.

Recommended paired programs: an actor that triggers each supported failure, a healthy sibling that confirms a fresh post-fault round-trip, and negative programs that attempt stale-generation access, CONTROL forgery, double-retire, exhausted allocator fallback, or process-wide signal recovery. Keep test-only high-risk fault triggers isolated from production entrypoints.

**Interim limitation:** Each backend's documented current observations in chapter 18 take precedence over this target contract. Changes require reviewed per-backend guest execution and resource-safety evidence, not merely a parser, host model or nominal `panic` handler.

## Resource exhaustion and bounded emergency recovery (additive target)

- Checked arithmetic and other ordinary guest throws follow chapter 07: `trap! (7 / 0)` yields the typed division-by-zero error; a handled throw does not generate a terminal notice or restart. A poisoned logical stack is panic-class and cannot be intercepted by `trap!`, `catch` or `recover`. A checked fallible allocation API may return a typed failure only before any partial allocation/publication; other allocation failure follows its documented effect.
- Admission reserves a bounded terminal receipt and independent emergency execution capacity before admitting an incarnation. Emergency reporting, retirement bookkeeping and fallback escalation must not allocate on the failed actor's arena or exhausted logical stack, require guest GC, or depend on DATA capacity. Fixed-size sanitized records identify the actor instance, generation, supervisor, category and cleanup state. Detailed diagnostics are optional and deferred. Unavailable emergency capacity rejects new admissions; a compromised CONTROL domain escalates to its independent parent, never fabricates success.
- Charge every receive/task stack, suspended continuation and reserved unwind budget to aggregate incarnation limits. Check frame sizes and resource arithmetic before mutation, including nested runtime calls. Never reset a quota on migration or suspension. No unbounded fallback allocator or stack growth is permitted.
- Separate a fault-detected event from the authenticated terminal/physical-DONE receipt. Fence further admission, cancel/drain outstanding invocations and I/O, settle replies once, release runtime-owned capabilities, and retire storage only after all physical users are quiescent. A stuck or unsafe cleanup is quarantined or escalated; no DONE or restart is published while retirement is ambiguous. The immediate supervisor receives the terminal notice as defined in chapter 13, not on the failing carrier.
- Preserve the original failure if a bounded cleanup fails. Forced/unsafe termination and depleted unwind reserve do not promise arbitrary guest defer execution; record incomplete cleanup without suppressing the primary fault. Reclaim actor-exclusive memory separately from shared/transferred objects and externally owned handles.
- Restart policy remains in chapter 18 and Atto Director. Stable logical actor references may resolve to a fresh generation; stale incarnation-bound callbacks, handles and replies must fail. Queued never-started DATA may transfer only under the chapter 18 policy; failed in-flight work and external side effects are never implicitly replayed. No restart before retirement and a fresh resource reservation.
- Evidence must distinguish ordinary checked error recovery, logical stack/arena quota exhaustion, actual physical containment, and global host faults. Test exact-fit/one-over admission, exhausted arena plus saturated DATA, nested runtime stack exhaustion, concurrent suspended receives, failed cleanup, stale completions, restart-budget exhaustion, and sibling progress after retirement. Run these in bounded disposable test environments. Report separate guest AOT and guest tracing-GC measurements; no host model or zero-step CI is sufficient.
