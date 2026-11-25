# 27 — Root Object, Root Actor and Deterministic Lifecycle

**Status: DRAFT / TARGET, 2026-11-14. Not an implementation or parity certificate.** This amendment resolves the *intended* common lifecycle model. The exact guest-facing `Object` introspection names and user class `on_drop()` syntax are **PROPOSED**, not admitted parser features. Java's existing synchronous actor `tear_down()` and LLVM's host-side retirement primitives are partial, distinct implementations. This chapter does not claim they pass the same guest fixtures.

Related requirements: [ownership](04-ownership-and-memory.md), [actors](05-actors-and-state.md), [failure](07-errors-and-failure.md), [runtime/restart](18-runtime-guarantees.md), [concurrent actors](22-concurrency-and-shared-ownership.md), [AOT/no-GC](24-aot-zero-gc-controlled-dynamism.md) and [receive stacks](25-receive-invocation-stacks.md).

## Root type hierarchy and API boundaries

`Object` is the **proposed compiler-known root of nominal *value* classes**. It provides type identity and storage/lifetime semantics, **not** automatic reference counting, an implicit tracer, a public finalizer, structural equality, reflection over arbitrary host internals, or a host pointer. All class values are governed by `rt take`, `rt borrow`, `rt share`, and compiler-generated drops. Ordinary class equality follows the specified identity rules, not implicit user-overridable Java-style `equals()`.

Candidate root surface — **names not frozen**:

| Surface | Intended behavior | Status |
| --- | --- | --- |
| `Object` | Abstract nominal value root, not directly constructed by guest source | PROPOSED |
| `type_id(): TypeId` | Closed-world, build/linker-known type descriptor; no dynamic host reflection | PROPOSED |
| `is<T>(): bool` | Checked nominal type test using finite AOT descriptors | PROPOSED |
| `rt take / borrow / copy / share` | Language operations, **not** overridable `Object` methods | TARGET |
| generated `drop` glue | Exactly-once owned-value cleanup and field recursion | TARGET |
| `on_drop(): void` | Optional, compiler-resolved class-only *non-suspending, non-throwing* cleanup hook | PROPOSED |
| `finalize()`, `gc()`, `clone()`, `equals()` | **Not** default root hooks/methods | Excluded |

A normal class has an explicit `constructor(...)` for synchronous initialization; constructor overload resolution uses the language's ordinary static arity/nominal rules. No hidden Java-style finalizer runs later on a GC worker. The compiler must track initialized fields and unwind only those fields when a constructor fails. A moved field is not dropped by its old owner. If a class-specific `on_drop` is accepted, it must not be virtual, invoked by user code as a substitute for `rt take`, called twice via inheritance, or permitted to resurrect `self`. For inherited classes, statically emitted drop glue performs derived cleanup/derived fields before base cleanup/base fields, with reverse declaration order among fields. Every field and base subobject is retired at most once.

An `Actor` is a **special, compiler-known actor nominal root**, *not* a user-instantiable ordinary `Object` subclass. An actor's persistent state is not available through a class cast. External code holds an opaque, generation-checked `ActorRef<TActor>`; it never owns or receives a raw `Actor` value. Actor declarations have **no constructors**; actor state initialization is runtime-governed. `ActorRef` does not extend an actor's instance receiver and cannot call private lifecycle hooks.

| Root actor/ref surface | Semantics | Classification |
| --- | --- | --- |
| `spawn Worker()` | Admit identity, quota and initialization for a new incarnation | TARGET |
| `ref.id`, `ref.kind` | Read-only identity and actor-kind metadata, subject to capability policy | TARGET |
| `ref.ready` / `await ref.ready` | Ready only after initialization and successful `on_start` | TARGET |
| `ref.send(mail)` | Bounded, linearizable mailbox admission; **not** a processing receipt | TARGET; signature pending |
| `ref.stop()` | Graceful stop request, seals new DATA admission | TARGET |
| `ref.cancel()` | Structured cancellation, not a normal graceful stop | TARGET |
| `ref.get_done()` | Terminal observation after required retirement barriers (or explicit terminal failure) | TARGET |
| `self.handle_state(critical-read/write ...)` | Sealed state loans with checked concurrency and non-escape | TARGET |
| `self.send(value)` | Outbound actor stream/response only where configured; not recursive mailbox send | Backend-specific existing Java surface; parity pending |
| `self.end()` | Nonblocking actor-local graceful termination request | Backend-specific existing Java surface; parity pending |

The guest may override **none** of the control-plane operations above. The compiler, scheduler and supervisor own admission, fencing, generation IDs, state storage, and readiness/completion publication. `ActorRef` surviving a restarted incarnation follows chapter 18's stable-instance semantics; incarnation-bound memory capabilities never survive a restart.

## Lifecycle hooks and events

| Receiver | Event / hook | Timing, authority and guarantee |
| --- | --- | --- |
| Class | `constructor(...)` | After storage reservation, before publishing an initialized value; no async suspension by default |
| Class | optional `on_drop()` (**PROPOSED**) | Synchronous compiler-inserted cleanup on owned-value retirement; no throw/raise/panic/await, blocking I/O or access after move |
| Actor | `on_start(): void` | At most once **per incarnation**, after owned state initialization but before READY or any user DATA receive |
| Actor | `receive(Message)` | One invocation per started mailbox envelope, with distinct stack/continuation; concurrent by default, single-live-invocation for `serial actor` |
| Actor | `on_throw(UncaughtThrow<Error>)` | **TARGET, not source-parity proven**; one nonrecursive local error disposition after an uncaught throw, never resumes failed instruction |
| Actor | `on_raise(UnrecoveredRaise<Error>)` | **TARGET, not source-parity proven**; similarly handles uncaught raise after recover scopes |
| Actor | `tear_down(): void` | At most once on allowed graceful shutdown, after all admitted receive invocations and conflicting loans quiesce, before resource retirement; Java sync subset exists |
| Actor (future) | `async tear_down(ctx: TeardownContext)` | **PROPOSED**, only after bounded deadline, nonblocking CONTROL reentry and native-loan fencing are actually lowered |
| Supervisor | `on_child_throw`, `on_child_raise`, `on_child_panic` | Parent-owned authenticated CONTROL handlers, *not* callbacks on the failing child |
| Actor | `on_panic` | **Forbidden**: PANIC bypasses guest catch/recover/local hooks and guest teardown |

These are **reserved optional hooks**, not ordinary callable methods: direct `self.tear_down()`, inherited reentrant invocation and reflective hook calls must be rejected. Lifecycle hooks must be statically known and reachable under sealed full guest AOT. `on_throw`/`on_raise` require an explicit `FailureAction` (handled subsequent mail, stop, escalate); returning void may not silently swallow a fault. Inherited hooks are resolved once into a compile-time lifecycle table, and superclass/subclass override and duplicate-signature checks are mandatory. An ordinary `Object` does not inherit actor hooks.

Illustrative **target** source (not claimed executable across backends):

```atto
define class FileLease as
  constructor() {
    // Initialize every owned field or unwind only initialized fields.
  }
  // Proposed hook name; compiler-generated resource drop still mandatory.
  on_drop(): void {
    // Local, noexcept, non-suspending release only.
  }
end

define actor Worker as
  on_start(): void { return; }
  receive(ActorMail<int> mail): void {
    self.handle_state(critical-write |s| -> { s.count = s.count + mail.value; });
  }
  tear_down(): void {
    // Bounded graceful cleanup; no await until async teardown is admitted.
  }
end

val worker = spawn Worker();
await worker.ready;
worker.send(1);              // Acknowledge admission, NOT processing.
worker.stop();
await worker.get_done();
```

Class `on_drop` is not a replacement for an explicit graceful `close_async()` API when network draining or I/O suspension is necessary. No destructor may block a carrier, run arbitrary guest reentry, or hide an unacknowledged OS/FFI lifetime.

## Ordering and concurrent-actor shutdown

```text
NEW → INITIALIZING → STARTING → READY → QUIESCING → TEARING_DOWN → RETIRING → TERMINATED
                              ↘ failure/cancel/panic → RETIRING → TERMINATED
```

Transitions are monotonic **per incarnation**; errors are terminal causes, not permission to jump back to READY. The runtime must linearize a stop request against send/admission, then seal DATA. Every admitted but unstarted envelope is either executed under the applicable graceful drain policy or explicitly abandoned/requeued according to chapter 18's **different restart** semantics; it must never be silently lost or double-dropped.

For ordinary **concurrent-by-default actors**, multiple `receive` invocations can be active or suspended at once, each with a distinct logical stack. A lifecycle `on_start`, terminal failure hook or `tear_down` runs on a **reserved single-flight lifecycle lane**. It cannot overlap any receive, continuations, state-loan writers or unsafe FFI pin. A graceful stop waits for admitted turns to complete (or cooperatively cancel at a bounded deadline) and then runs teardown. A `serial actor` already prevents overlapping receive invocations but still needs the same fences for child tasks, callbacks and loans. No hook runs while scheduler locks are held.

For a concurrent actor whose turn throws/raises, a "handled" decision is allowed only after the coordinator prevents conflicting commits, quiesces other in-flight work, and proves the sealed state/transaction and ownership invariants. Otherwise escalate/fail-stop. A handled hook never resumes a partially executed turn, silently retries mail, or commits its outbound effects. PANIC bypasses all actor guest hooks, sends a bounded authenticated supervisor CONTROL notice and triggers trusted retirement. An actor whose code or state is corrupted cannot be asked to run guest cleanup.

On restart, the old incarnation's stacks, arenas, I/O operations, frame captures and generation-tagged references must become unobservable before a new incarnation can publish READY. Per chapter 18, the stored state and **unstarted queued mail** survive if the configured restart policy permits; the message that was executing is *not* replayed automatically. A new incarnation runs its own `on_start`; no implied `on_restart` hook is introduced.

## No separate guest GC worker: deallocation contract

**Guest no-tracing-GC** means cleanup is compiler/scheduler-directed rather than requiring a separate tracing collector thread. It does **not** mean no allocations, no pauses, no allocator locks, no host GC or no threads used by schedulers/I/O.

1. **Short-lived owned class values:** compiler-generated, statically linked drop glue runs on last-owner scope/CFG exit, including error, return, cancellation and partial construction. Scratch regions are retired at provable turn/task boundaries; long-lived actors cannot leak per-message temporaries until final actor exit.
2. **Persistent actor graphs:** one actor/incarnation owns each persistent arena; cycles may use non-owning, generation-checked intra-arena handles. No unrestricted strong cycles with reference counting alone. At retirement, deterministically run eligible owned resource drops, then bulk release the whole arena.
3. **Shared/frozen values:** separate explicit ownership domain, counted/fenced lifetime and a proven cycle policy. Cross-actor `share` never creates a hidden writable alias; a dead actor cannot free another owner's shared backing.
4. **I/O and FFI:** revoke new operations; cancel/deregister timers, channels, sockets and callbacks; await or safely fence completion and borrowed/pinned buffers; release registered resources in reverse acquisition order. A timeout invalidates logical use, **not** proof that physical DMA, FFI or OS operations have stopped.
5. **Concurrency:** physical free requires active_invocations = active_tasks = live_loans = pending_io_pins = pending_native_callbacks = 0 (or a backend-proven equivalent safe fence). Generation changes protect guest handles; they do not make stale *raw host pointers* safe.
6. **Scheduling:** an admitted drop or cleanup cannot rely on a different tracing GC thread. Nonblocking guest teardown may yield at bounded safepoints; cleanup deadlines and bounded work budgets must prevent a single actor's destructor storm from starving the scheduler. Hard-real-time profiles require prebudgeted storage/reclamation costs.
7. **Host distinction:** LLVM/native can prove no guest tracer on admitted paths; Java/Graal and .NET can deterministically free explicit native guest arenas but their managed control-plane heaps remain collectible by host GC. Wasm/JS hosts likewise retain their own collectors. Forge must independently demonstrate its selected allocation profile. Never certify *process* zero-GC from guest drop tests.

`get_done()` must not report physical native retirement while a pin is active. If a backend cannot safely retire a timed-out native resource, it must quarantine/fence it and publish an explicit constrained terminal outcome rather than claim the allocation was freed. No source hook can guarantee cleanup after process kill or host-fatal corruption.

## Required conformance gates — no implied passes

The machine-readable authoring inventory is [`contracts/object-actor-lifecycle-v1.json`](../contracts/object-actor-lifecycle-v1.json). It enumerates class construction/drop, actor start/stop, concurrent receiver quiescence, failures, resource pins, restart, AOT and cross-backend evidence. Every new guest fixture uses `.atto`. Each **compiler** gate needs a targeted diagnostic or real emitted artifact; each **runtime** gate needs a compiled guest execution with nonzero observed steps and lifecycle/allocator instrumentation. Host-only models and source-only inventories are *not* runtime proof. Report per-backend status against an immutable head SHA and a verifiable fixture blob; runner admission failures are **NOT_EXECUTED**, not PASS.

Before implementation, reconcile the older Java source `on_throw/on_raise/on_panic` **parent-supervision** naming conflict with actor-local error hooks. No automated rename may accidentally let a child catch its own panic. The existing LLVM scalar actor/serial host substrate must not be advertised as concurrent-actor or full class-lifetime lowering. Source + runtime + native AOT + race/ASan/UBSan + exact-tree runner receipts are separate evidence gates.
