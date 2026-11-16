# Actor scheduling, supervisor reactors and TenantVM domains v1

**Status: proposed normative AttoLang contract, not backend implementation or guest parity evidence.**
Applies to hosted actor runtimes. Freestanding targets may explicitly reject OS scheduling.

## Three execution classes

| Class | Pool authority | Lifecycle | Boundary |
| --- | --- | --- | --- |
| `shared` | One bounded VM-wide trusted shared pool | Small baseline, multiplex many actors | Actor-owned mutable arenas; **not** a hostile-code sandbox |
| `isolated` | **Distinct private pool per isolated actor** | Workers created lazily on first admitted work; aggregate global cap | Dedicated scheduling domain, not by itself a memory/security domain |
| `untrusted` | **Distinct pool and TenantVM per account/tenant generation** | Workers created only after verified sandbox admission | Enforced process/isolate sandbox, quotas and independent termination |

Actors in the same untrusted tenant may share the tenant pool; separate tenants may **never** share its threads or pointers. An actor changes class only by a quiescent, authorized transition with a new incarnation. A suspended actor resumes only on an authorized carrier in its original execution domain. Every actor retains a nonreentrant DATA turn gate irrespective of domain parallelism.

A global worker budget covers all three pool classes; ready queues are bounded. Failure to start a worker, exhausted global capacity or saturated queues rejects admission atomically. No automatic promotion or fallback of private/tenant work onto the shared pool. Do not allocate one thread per supervisor, socket, mailbox or actor by default.

**Startup goal:** on a multicore host, two Atto-owned shared carriers plus the calling startup thread (three total); on one CPU, one carrier plus the caller (two total). Lazy private/tenant carriers do not count until activated. This counts **Atto-controlled** threads only, not JVM/CLR GC, JIT, foreign services or OS infrastructure; do not claim the entire JVM or .NET process has only two or three threads. Embeddings may override the baseline explicitly.

## Supervisors, CONTROL and I/O

A supervisor has a logical CONTROL loop and mini-reactor, **not a dedicated OS thread**. Its control work is dispatched on an authorized pool, and trusted host supervisors of untrusted tenants run outside that tenant behind a privileged broker. Runtime-authenticated panic/failure/child-shutdown CONTROL messages are distinct from ordinary DATA and cannot be forged or consumed as DATA by the actor that panicked. Default four reserved CONTROL slots (or equivalent preallocated failure receipts) remain available despite DATA saturation.

CONTROL outranks DATA/WAKE subject to bounded dispatch budgets and per-supervisor fairness. Coalesce duplicate incarnation failure notices. On CONTROL overflow, escalate to a fail-closed supervisor/tenant policy; never silently drop a panic or allocate unbounded emergency threads.

NIO/epoll/kqueue/IOCP reactor ownership is a temporary **role on an existing worker**, not a required dedicated thread. Lease at most one poll owner per reactor; use sticky nonthrowing wakeups, bounded waits and a carrier-integrated timer wheel. Do not block in poll while ready CONTROL or guest work is queued. The reactor must enqueue authenticated continuations, never execute guest code directly or cross an execution-domain boundary.

## TenantVM and GC constraints

One *active* TenantVM per account/tenant generation is minted by the trusted host, not guest-supplied strings. Fence tenant generations and actor incarnations; enforce per-tenant limits on CPU/time, memory, threads, FD/IO, mailboxes, stack and capabilities. Cross-tenant communication is exclusively broker-authorized, bounded serialization/copy; raw pointers and shared mutable guest graphs are forbidden. Retire old generations before reuse.

- **LLVM:** no tracing GC for native Atto guest heaps. Actor-owned arenas, ownership transfers and deterministic reclamation must account for all loans, callbacks, continuations and I/O pins. A bounded C++ `TenantVM` object or virtual address region alone is *not* hostile native-code confinement. Until reviewed native sandboxing is verified, require a separately sandboxed OS process per untrusted tenant (or reject its admission). A noncooperative tenant can then be killed without killing neighbors.
- **Java/GraalVM:** JVM/Truffle `Context` and class loaders alone do not provide an independently proven physical memory sandbox. GraalVM Native Image isolates are not interchangeable with normal JVM contexts. Use a verified isolate or sandboxed tenant process and capability-limited imports. Host JVM GC may remain; native arenas or Epsilon smoke tests are not zero-GC proof.
- **.NET:** NativeAOT still has managed GC. An `AssemblyLoadContext` or a runtime-wide `Untrusted` thread pool is not tenant security isolation. Require a sandboxed process or verified equivalent for each hostile tenant. Explicit unmanaged actor arenas can reduce managed allocation but do not disable CLR GC.

## Correctness and retirement

Linearize DATA admission with STOP. Shutdown closes new DATA, fences generations, drains or cancels accepted messages with explicit outcomes, revokes capabilities, physically unregisters I/O and callbacks, waits for host-owned loans, releases actor arenas, and joins retired carriers **without joining the current carrier**. No worker may dereference a tenant after retirement. Failure to spawn a carrier must not strand accepted tasks. Domain exhaustion and delayed generation-replayed callbacks are negative tests.

Hard/soft real-time targets must explicitly declare their scheduling and allocation guarantees. Cooperative reduction/time budgets prevent *trusted* actor starvation; a noncooperative *untrusted* actor additionally requires enforceable process/isolate termination.

## Verification gate and existing audit

Record exact backend head/tree and toolchain, real guest compile/run, positive and negative isolation outcomes, Atto-owned and process-wide startup/peak thread counts, pool-owner/queue logs, supervisor CONTROL priority and fairness, reactor wake behavior, tenant kill and stale-generation tests, plus LLVM ASan/UBSan and deterministic heap retirement. Report per-backend `passed`, `failed`, `unsupported`, or `not_executed`; source-free models and zero-executed-step CI runs are **not** guest proof.

On 2026-11-16 the existing Oreslang runtime showed these migration gaps: Java `OresScheduler` still has an eager `prestartAllCoreThreads()` constructor and `TenantIsolateManager` explicitly supports only trusted Context-based tenancy; LLVM `OresIsolateVM.hpp` is not a production actor scheduler or hostile native sandbox; .NET `ActorDispatchDomains.cs` has lazy but **runtime-global** Shared/Private/Untrusted pools rather than per-account untrusted pools. The current Atto Java/LLVM/.NET default branches contain repository initialization READMEs only; implementing this contract and obtaining real guest results remain outstanding.
