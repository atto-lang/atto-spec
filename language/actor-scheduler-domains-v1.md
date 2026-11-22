# Actor scheduling, supervisor reactors and TenantVM domains v1

**Status: proposed normative AttoLang contract, not backend implementation or guest parity evidence.**
Applies to hosted actor runtimes. Freestanding targets may explicitly reject OS scheduling.

## Three execution classes

| Class | Pool authority | Lifecycle | Boundary |
| --- | --- | --- | --- |
| `shared` | One bounded VM-wide trusted shared pool | Small baseline, multiplex many actors | Actor-owned mutable arenas; **not** a hostile-code sandbox |
| `isolated` | **Distinct private pool per isolated actor** | Workers created lazily on first admitted work; aggregate global cap | Dedicated scheduling domain, not by itself a memory/security domain |
| `untrusted` | **Distinct pool and TenantVM per account/tenant generation** | Workers created only after verified sandbox admission | Enforced process/isolate sandbox, quotas and independent termination |

Actors in the same untrusted tenant may share the tenant pool; separate tenants may **never** share its threads or pointers. An actor changes class only by a quiescent, authorized transition with a new incarnation. A suspended actor resumes only on an authorized carrier in its original execution domain. Actor DATA receives are concurrent by default, with separately authenticated per-invocation identity, stack ownership and state-loan arbitration; only `define serial actor` retains a one-live-receive gate. Effective physical parallelism and affinity obey [Actor scheduling policy v1](actor-scheduling-policy-v1.md).

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

## Network-only I/O and per-socket tenant authority

**Normative target / NOT guest-executed.** An untrusted TenantVM has **no ambient OS I/O**, including filesystem, terminal/stdin/stdout/stderr, device, environment, process creation, raw FFI, kernel syscall, Unix-domain socket, raw socket, or arbitrary descriptor access. Network I/O itself is **default deny** until the trusted host independently grants capabilities. Host-only compilation, artifact loading, DNS, logging and supervision do not create guest authority. A narrow clock/randomness/telemetry API requires a separately specified brokered service, never a general OS escape.

POSIX threads sharing a PID ordinarily share their file descriptor table. OS FDs, socket pointers, `epoll` and `io_uring` rings MUST NOT enter guest-visible memory or registers as authority. Execution confinement MUST prevent direct guest kernel entry and uncontrolled host FFI; per-thread scheduling, heap arenas, seccomp/cgroups/eBPF or process-wide socket restrictions alone cannot enforce per-tenant ownership within one process.

A **trusted SocketBroker** holds physical descriptors and admits operations only using the runtime-attested tenant identity plus generation, socket identity plus generation, explicit operation right (`read`, `write`, `connect`, `listen`, `accept`, `close`), protocol, approved local/remote endpoint and per-tenant/per-socket quotas. Guest-provided tenant strings, permission bits, auth flags, raw descriptor numbers and target-verification booleans carry no authority. Guest handles are opaque, unforgeable within the confined guest model, non-serializable across tenants and generation-fenced; stale, guessed and recycled handles fail closed. A validated manifest declares *requested* privileges, which the host may reduce or deny; a signature/manifest is not itself permission.

The host validates requested and actual resolved addresses before creating or adopting a socket; numeric address and connected peer checks must remain bound to the granted endpoint. Deny loopback, link-local, cloud metadata and private network targets by default unless deliberately allowed; check DNS rebinding, redirected/proxied destinations, IPv4/IPv6 normalization and port/protocol restrictions. Accepting sockets transfers only explicitly configured listener rights. Cross-tenant socket ownership transfer requires trusted regrant after fencing outstanding I/O; raw descriptor handoff and shared mutable guest buffer aliases are forbidden. Socket operations use validated bounded guest-memory copies or reviewed safe transfer, nonblocking host reactors, byte/connection/request budgets, backpressure and fair scheduling. No host callbacks invoke guest code under the broker's process-wide locks.

Revocation linearizes with broker admission; reject new operations and fence stale completions, cancel pending work where supported, physically unregister/close when quiescent, and account for descriptors while I/O remains outstanding. Already-transmitted bytes cannot be retracted by revocation. Kernel sandbox controls are complementary host/process-level defense-in-depth, not a substitute for per-TenantVM authorization. For unsupported untrusted in-process execution, return `UNSUPPORTED`/`DENIED` or use an explicitly sandboxed process; **never** fall back to native unrestricted execution.

**Required independent proof:** compile and execute two hostile `.atto` tenants concurrently in the *same measured PID*, grant A a read-only socket X and B a write-only socket Y, and verify allowed operations work while all foreign read/write/close, rights escalation, guessed and stale handles, FD reuse, direct syscalls/filesystem I/O, unauthorized connect/listen, DNS rebinding, quota overflow and racing cancellation fail closed. Tenant B continues after tenant A traps and restarts. Record exact compiler/runtime SHA, artifact hash and actual executed guest receipts. Host-only broker tests are useful but **not** this proof.

## Correctness and retirement

Linearize DATA admission with STOP. Shutdown closes new DATA, fences generations, drains or cancels accepted messages with explicit outcomes, revokes capabilities, physically unregisters I/O and callbacks, waits for host-owned loans, releases actor arenas, and joins retired carriers **without joining the current carrier**. No worker may dereference a tenant after retirement. Failure to spawn a carrier must not strand accepted tasks. Domain exhaustion and delayed generation-replayed callbacks are negative tests.

Hard/soft real-time targets must explicitly declare their scheduling and allocation guarantees. Cooperative reduction/time budgets prevent *trusted* actor starvation; a noncooperative *untrusted* actor additionally requires enforceable process/isolate termination.

## Verification gate and existing audit

Record exact backend head/tree and toolchain, real guest compile/run, positive and negative isolation outcomes, Atto-owned and process-wide startup/peak thread counts, pool-owner/queue logs, supervisor CONTROL priority and fairness, reactor wake behavior, tenant kill and stale-generation tests, plus LLVM ASan/UBSan and deterministic heap retirement. Report per-backend `passed`, `failed`, `unsupported`, or `not_executed`; source-free models and zero-executed-step CI runs are **not** guest proof.

On 2026-11-16 the existing Oreslang runtime showed these migration gaps: Java `OresScheduler` still has an eager `prestartAllCoreThreads()` constructor and `TenantIsolateManager` explicitly supports only trusted Context-based tenancy; LLVM `OresIsolateVM.hpp` is not a production actor scheduler or hostile native sandbox; .NET `ActorDispatchDomains.cs` has lazy but **runtime-global** Shared/Private/Untrusted pools rather than per-account untrusted pools. The current Atto Java/LLVM/.NET default branches contain repository initialization READMEs only; implementing this contract and obtaining real guest results remain outstanding.

## Stackless continuation ABI and tenant-confined scheduling

**Default execution model:** suspending Atto callables lower to typed, stackless
continuation frames in the owning actor's tenant-private memory. The runtime
may use bounded native worker threads and M:N scheduling, but an actor cannot
assume a stable native thread. Optional stackful fibers are non-default and
require independently verified in-cage stacks, guard/bounds enforcement,
context-switch validation, and tenant-specific lifecycle accounting.

- A frame belongs to one immutable tuple
  `(tenant_id, tenant_generation, actor_id, actor_incarnation, frame_slot, frame_generation)`.
  Identifiers supplied by a guest are *requests*, never scheduling authority.
  The trusted host authenticates the tuple, checks actor/continuation dispatch admission and any applicable serial receive gate,
  the current capability epoch and resource budget, and rejects stale,
  foreign, forged or already-consumed resumes *before* any guest state access.
- A continuation's data, program counter and stack-like spill slots MUST live
  within the verified guest cage or a separately validated host structure
  containing **no guest-writable host pointers or executable callbacks**.
  Generations must fence slot reuse, timer wakeups, reactor completions,
  cancellation and late mailbox delivery. Never capture an unchecked native
  stack pointer across suspension.
- Worker reuse and work stealing are permitted **inside** the authorized
  domain only. No cross-TenantVM stealing, implicit shared executor fallback,
  actor frame sharing, or continuation migration to a different tenant.
  A trusted reactor may deliver a bounded authenticated wake *receipt* to
  the owning domain, but cannot directly run a guest callback.
- A suspend/await/select boundary releases host locks and checks all live
  ownership loans. Guest mutable references surviving a suspend require
  compiler-verified lifetimes and enforceable memory confinement; host
  descriptor, broker and guest-memory pins remain charged until cancellation,
  I/O completion or quiescent retirement.
- Apply both per-actor reduction accounting and per-tenant CPU/fuel/time
  budgets. Cooperative yields alone do not stop arbitrary hostile infinite
  loops. Untrusted execution requires independently enforceable interruption
  or termination without unwinding a corrupted host process.
- Closing a TenantVM fences new dispatch first, revokes broker capabilities,
  cancels queued work, quiesces outstanding frames and I/O, emits exactly one
  authenticated supervisor CONTROL fault where required, and only then
  reclaims private memory. Never use a signal-handler SIGSEGV recovery trick
  as evidence of native hostile-guest isolation.

**Admission invariant:** until the backend proves actual, enforceable
same-process hostile-code confinement, attempting to schedule any untrusted
guest on a native worker MUST return `UNSUPPORTED` or `DENIED`.
A sandboxed child process is a separately labeled fallback, not same-PID
TenantVM proof. A thread pool, `pthread`, `io_uring`, `epoll`, private heap,
or C++ host-side dispatch gate alone cannot cross this admission boundary.

**Adversarial evidence:** compiled .atto hostile guests must attempt forged
resume tickets, foreign/cross-generation continuations, stale slot reuse,
cross-tenant work stealing, borrowed-memory escape across await, timer/FD
completion replay, queued CONTROL starvation, CPU-fuel exhaustion and
noncooperative loops. Pin compiler/runtime/artifact hashes and demonstrate
that another active tenant survives expected guest traps in the same
measured process. Host-only tests must be reported separately.
