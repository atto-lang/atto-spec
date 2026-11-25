# Typed task payloads, `sync` reservation and scoped ownership v1

**Status: normative TARGET proposal, NOT compiler/backend guest certification (2026-11-21).** This adds task-specific typing and spelling rules without weakening `susp`, implicit argument borrowing, ownership, `using` cleanup, or TenantVM isolation. An unimplemented compiler MUST reject before emitting a guest artifact.

## Grammar and type judgment

```ebnf
task_expr         = "task", [ "<", task_payload_type, ">" ], task_body ;
task_body         = "{", { statement }, "}" ;
joined_task_expr  = "await", task_expr ;
inline_task_expr  = "sync", task_expr ;
discard_task_stmt = "do", "task", [ "<", task_payload_type, ">" ], task_body, [ ";" ] ;
discard_inline_stmt = "do", "sync", "task", [ "<", "void", ">" ], task_body, [ ";" ] ;
task_payload_type = type_ref ;  // includes void and Future<U>
```

`sync` is a **reserved whole-word keyword**. It is not a legal identifier, generic parameter, field, method, package alias or user-defined type, and must not match identifier prefixes like `synchronize`. It has **no bare sync-block, host-thread blocking, mutex, or implicit-I/O meaning**. The `task` word may remain contextual outside this grammar for migration compatibility, but any matching `task<...> { ... }` or `task { ... }` must parse as the task construct or fail closed, never silently become comparison expressions.

`task<T> { body }` declares **the payload T**. Its principal expression type is **`TaskFuture<T>`**, which can be ownership-consumingly projected to `Future<T>` for legacy result-only assignments. It is not T and does not auto-flatten nested Futures. `task<Future<T>>` explicitly yields `TaskFuture<Future<T>>`, and one await produces `Future<T>`. An inferred `task { body }` infers T from all reachable return paths; a contextual expected `TaskFuture<T>` or `Future<T>` can supply T without inventing coercions. Control, `get_ready()`, `cancel_task()`, `cooperate()`, owned receipt splitting and migration are specified in [task-future-control-v1.md](task-future-control-v1.md). For an unprovable or contradictory result, reject with `E_TASK_RETURN_INFER` / `E_TASK_RETURN_TYPE`. All non-void body paths must return T. `task<void>` may only return without a value. For a spawned `task<T>`, body `return` exits its independent child task. For `sync task<T>`, body `return` exits only the inline lexical body, runs its local cleanup, yields T to the caller and does **not** return from the enclosing callable.

```atto
pub susp fnc example(): int {
  val TaskFuture<int> pending = task<int> { return 42; };
  val int result = await pending;
  val int also = sync task<int> { return 0; };
  return result + also;
}
```

`await task<T> { body }` spawns an independently scheduled cancellable child and joins it in a `susp` caller. `sync task<T> { body }` runs the body and its cleanup inline on the calling thread and yields T before the next parent statement. It creates no independent TaskId, Future, worker-pool dispatch, or task admission. It can cooperate at checkpoints that resume the inline scope on the same thread. If the result is an existing `Future<U>`, the enclosing `susp` caller may await it after the inline scope returns.

`do task<T> { body }` schedules an independently supervised child whose result is discarded and whose lifetime remains owned by TaskScope. **`do sync task<void> { body }`** instead executes a **void** body inline, without creating a child Future. `do sync task { body }` is equivalent to the inferred-void form; a value-returning body is invalid. An explicit `do sync task<T>` with any `T` other than `void` is **E_TASK_RETURN_TYPE**, even when the result would otherwise be discarded. A body `return expr;` is likewise **E_TASK_RETURN_TYPE**; plain `return;` exits the lexical inline body. To produce a value, use ordinary `sync task<T> { return expr; }` as an expression without `do`. A void inline task in **standalone statement position** MUST use the `do` prefix: `sync task {};` and `sync task<void> {};` are invalid standalone statements (`E_SYNTAX`), while `do sync task {};` and `do sync task<void> {};` are valid. An inline value expression must be used in a value context rather than implicitly discarded. `do sync task` MUST NOT be normalized into `do task`: removing `sync` changes ordering, cancellation ownership, borrowing and scheduling. Both `do` statements have type void, but `do task<T>` alone may discard a nonvoid spawned task's result.

The existing lexical `block { ... }` is NOT redefined to spawn work by this v1 change. Its prior proposal to alias `do task` conflicts with a current sequential block grammar and requires an explicit, separately reviewed migration. Ordinary `{ ... }` remains a lexical sequential block.

## Inline execution and logical TaskId (normative 2026-11-20)

A regular `task<T>` creates an independently scheduled child returning `TaskFuture<T>`; it MAY run on the caller's OS worker and does not imply allocating a new OS thread. `await task<T>` joins such a child. In contrast, `sync task<T>` enters a nested **lexical** scope on the caller's **existing logical TaskId**. The inline body starts before the next parent statement, cannot execute independently in parallel with its caller and returns T only after its local cleanup has completed. It does not allocate a child TaskId, Future, separate cancellation handle or scheduler admission ticket. The body can have a distinct local call/cleanup frame without being an independently schedulable task.

**Thread semantics** keep the caller's current carrier for entry, execution, cleanup and return from `sync task`. `rt cooperate` may give other work a turn and resume this inline scope on the calling thread. An `await` or other effect that lacks a same-thread continuation proof receives `E_SYNC_TASK_SUSPEND`, even inside a `susp` callable. The compiler must not park a carrier to simulate this guarantee. A scheduled child can suspend cooperatively and resume on an available worker. A later suspension in the surrounding callable may also change its carrier.

Prove that the inline body's transitive effects and cleanup preserve its thread. Inline bodies may use ordinary scoped read and mutable loans from the caller with normal exclusivity and lifetime checking. Apply the existing safe-point loan rules even when `rt cooperate` retains the thread. Under a synchronous `MutexLease`, `RwLock` or actor critical-state guard, require proof that calls and cleanup cannot suspend, yield, escape or spawn an unsafe guard capture.

**Cancellation/cleanup:** The inline scope inherits its caller's cancellation token, TenantVM, actor, capability budget and ownership domain; it does not introduce a separate `Future.cancel()` target. Cancellation/throw/raise/timeout unwinds its nested `using` and `defer` obligations exactly once, LIFO, before its caller can finish. Any independent `task<U>` spawned **within** the inline scope remains a real supervised child that must physically retire before the relevant TaskScope storage can be reclaimed. Cancelling an inline scope is the caller's cancellation, not a forged child cancellation capability.

**Required MIR distinction:** `task` / `await task` / `do task` use `TaskSpawn` with join or discard; `sync task` / `do sync task` use `InlineTaskEnter` / `InlineTaskExit` plus local cleanup, without `TaskSpawn`, `TaskJoin` of a fabricated child or Future allocation. Every supported backend must preserve that identity, ordering, no-dispatch, borrowing and cancellation semantics; absent actual typed lowering, reject `E_UNSUPPORTED` before guest artifact emission.

## Task frames, shared storage and suspension

**Normative decision: distinct logical task frames, shared lexical TaskScope, optional proven physical stack coallocation.** A child `task<T>` is a separately schedulable computation, not a nested call running on the parent's raw stack by definition. It has its own program counter, task-local variables, return slot, cancellation state, and suspension/exception cleanup state. It shares the parent's **structured task scope**, not unrestricted read/write access to its activation record. A `TaskFuture<T>` owns separate affine task-control and result-observation rights; its projected `Future<T>` result receipt is **not** a pointer to a parent's stack slot.

The specification MUST NOT require a fresh native thread or dedicated stack allocation per task. A backend MAY use stackless coroutine frames, segmented stacks, guarded stacks, arenas, or stack allocation/coallocation of an independent task frame **as a nonobservable optimization**, if compiler and runtime jointly prove all of the following:

1. **Independent continuation and reentrancy:** any child that can suspend, be rescheduled, or run in parallel must retain its own live locals/PC and cannot reuse an active parent's mutable activation slots. Parent suspension, reentrant calls, nested tasks and recursion must not clobber child state. If a child can move between carriers, all live state and synchronization must remain valid across migration.
2. **Lifetime and escape:** physical stack placement is permitted only while the complete descendant lifetime is bounded by the storage's lifetime. The storage cannot be popped, overwritten, unmapped, or recycled before **physical** child retirement, including cancellation/throw/raise/panic races. If escape/suspension proof fails, allocate an independent continuation in the same tenant's checked arena (or reject before producing a guest artifact). A bare `Future<T>` or `TaskFuture<T>` return does not silently extend a parent's stack lifetime. Any explicit future escape or scope transfer needs a separate, proven ownership and supervision contract.
3. **Capture and aliasing:** the child can only see explicitly or compiler-verified captured values with independent ownership, safe copies, or certified scope-bounded loans. No raw parent-frame aliases are implied. A shared readonly loan requires the appropriate cross-carrier thread-safety/immutability proof (e.g. `Sync` when tasks may run on multiple carriers); concurrent writers or parent writes under a child loan are rejected. An exclusively borrowed capture needs a separately certified exclusive-loan profile and cannot be inferred from `sync`.
4. **Effects:** `await task<T>` uses an independent child `TaskSpawn` followed by `TaskJoin`. `sync task<T>` uses inline `InlineTaskEnter` / `InlineTaskExit` on the **same logical TaskId** and cannot independently run in parallel with the parent. `do task<T>` spawns; `do sync task<void>` is a void-only inline statement. A live pure inline task may use ordinary verified lexical borrows from its parent, whereas independently scheduled tasks must satisfy cross-carrier capture/Send proofs. Potentially suspending inline bodies must satisfy the caller's suspension-safe borrow/stack rules and cannot run under a synchronous critical lease. Neither form guarantees an OS-thread assignment or pinning after an actual suspension.
5. **Retirement and quotas:** the TaskScope owns admitted children until terminal acknowledgment/quiescence. Scope exit on normal return, cancellation or error must not release borrowed frame storage until descendants have physically stopped; it must remain non-parking for scheduler carriers. All task frames, retained stacks/segments and nested scopes are tenant-accounted and bounded by quotas, stack/recursion limits and admission control. Exhaustion fails in a specified, rollback-safe way; stack overflow must not corrupt an adjacent tenant's memory. Cooperative cancellation alone is not proof of retirement.

An optimizer MAY eliminate a child frame or inline execution only when it proves equivalence in externally observable effects: scheduling/cooperation requirements, cancellation, supervision/error reporting, ownership, ordering and TaskScope retirement still hold. **Shared physical storage is an optimization, never a language-visible promise.** A backend with no safe continuation/scope-lifetime implementation MUST reject task execution instead of borrowing a live parent stack unsafely.

Example (conceptual physical layouts, both must produce the same guest behavior):

```text
parent TaskScope
  parent frame (locals, return state)
    + child A logical frame -> Future<int>
    + child B logical frame -> Future<int>

allowed: separate checked coroutine frames in a tenant arena
allowed: compiler-proven coallocated frames with valid lifetime and no slot overlap
invalid: both tasks executing through one mutable parent stack frame
invalid: popping parent frame while a borrowed child still runs
```

## Mandatory cancellation semantics (target v1)

**Every admitted Atto task is cancellable**, including tasks whose `TaskFuture<T>` handle is discarded by `do task`. Cancellation is a structured, tenant-bounded control operation, **not** a `Future<T>` payload, a Go-style detached goroutine, a forced OS-thread kill, or permission to reclaim live frame storage early. Unimplemented backends MUST reject guest admission rather than silently ignoring cancellation.

### Surface API and outcome

* An owned `TaskFuture<T>` exposes canonical `cancel_task(): void` (with deprecated `.cancel()` on the same task-control capability). This nonblocking, idempotent operation **requests** cancellation of its task and descendants, without consuming its single-use result receipt. The task-origin `Future<T>.cancel()` spelling remains a statically provenance-checked compatibility alias as specified in [task-future-control-v1.md](task-future-control-v1.md), not a universal method on unrelated futures. Calling it on a previously requested or already terminal task is harmless; it does **not** imply the child has stopped. There is no implicit `await`, return of `T`, or privilege elevation.
* `await future` joins the task and yields its `T` **only on success**. A cancelled task instead delivers the distinct built-in `TaskCancelled` terminal control outcome. It never fabricates a `T`, silently converts cancellation into `Ok(T)`, or calls an unhandled cancellation an actor `panic`. An awaiter may explicitly handle cancellation; otherwise the cancellation propagates as a cancellation outcome through its task's scope, not as a successful return. `sync task<T>` instead executes on the calling logical task without a Future, observes its caller cancellation state, unwinds its lexical resources, and cannot be cancelled with a separate child handle. Task failure remains distinct from cancellation.
* `TaskCancelled` is an `Error`-compatible typed cancellation outcome for explicit handling, but **its propagation is not equivalent to an arbitrary user `throw`/unhandled `raise` escalating to actor panic**. The runtime preserves the separate terminal cause. A cancelled parent cannot clear its own cancellation merely by catching or trapping an awaited child outcome. Explicit cancellation shielding/reparenting is **not** in this v1 contract.
* A `TaskFuture<T>` (or projected `Future<T>` result receipt) is **not** a detached execution permit. Dropping it or saying `do task` does not remove its child from TaskScope, stop error supervision, or disable scope cancellation. Only an authorized owner of the Future or owning TaskScope may request cancellation; a guest cannot forge handles or cancel another tenant's task.
* `cancel_task()` (or the proven legacy `cancel()` alias) may be called from a non-`susp` context because it never joins or parks a carrier. Waiting for retirement via `await` requires a suspension-capable context. Calling `cancel()` is **not** evidence of successful cleanup.
* **Scope-exit effect gate:** if a callable may exit with unfinished child tasks, the implicit cancellation-and-retirement join is a suspension effect. Its enclosing callable MUST be `susp` (or prove all descendants already physically retired on every path); a non-`susp` callable must reject a potentially live child with `E_EFFECT`, not park a scheduler thread while leaving scope. A cancellation request alone does not satisfy this proof.
* Calling legacy `.cancel()` on a receiver without statically proven task-cancellation authority is `E_TASK_CANCEL_TARGET`; using its `void` result as a value is `E_TASK_CANCEL_TYPE`. Calling `.cancel_task()` or `.cooperate()` without `TaskFuture<T>` control authority is `E_TASK_CONTROL_TARGET`, and using either `void` result as a value is `E_TASK_CONTROL_TYPE`. These failures produce no guest artifact. Neither a matching method name on an arbitrary object nor a host Promise callback may silently substitute for the task cancellation capability.

```atto
pub susp fnc main(): int {
  val TaskFuture<int> worker = task<int> { return 42; };
  worker.cancel_task();        // nonblocking request, does not consume worker
  // await worker: either int 42 if completion won, or TaskCancelled if cancel won
  return 0;               // scope must still retire the child safely
}
```

### State machine, race ordering and physical retirement

1. Task admission is fenced against parent-scope cancellation. A child admitted before cancellation is registered exactly once in TaskScope; otherwise admission fails and owned captures are rolled back without executing the child. No child may be admitted after that scope enters cancelling.
2. The logical states include `pending`, `running`, `cancel_requested`, `cancelling`, and **terminal** `succeeded` / `failed` / `cancelled`. The first atomic terminal claim wins. An already committed successful result remains successful even if `cancel()` arrives later; a cancellation accepted before terminal commitment must prevent any later user-level successful commit once its cancellation safe-point/control handoff has won. Repeated cancellation requests do not duplicate completion, callbacks or cleanup.
3. Cancellation is **transitive and downward** across nested TaskScopes, including `do task` children. On ordinary lexical scope exit, any unfinished child is first cancelled and physically joined before parent return can finish; explicit awaits remain the way to obtain successful child values. Cancelling one child does not automatically cancel healthy siblings or the parent; failure/supervisor policy is separately specified. A parent may not report physical retirement until its descendants and their registered cleanup/notifications have physically retired.
4. Compiler/runtime cancellation safe points MUST cover task start, every suspension (`await`, any potentially suspending operation **inside** `sync task`, channel/select/timer and cancellable I/O), cooperative loop/backedge budgets and bounded blocking host operations. Pending timers, I/O and channel waits must have a wake/revoke path that cannot strand a cancelled task indefinitely; callback/admission races need generation or one-shot fencing. Runtime must check cancellation before committing an admitted operation if required by its protocol.
5. Once cancellation is observed, the task unwinds through `defer`, `using`, lock/lease releases and other cleanup **exactly once**, under a bounded, non-privilege-escalating cleanup policy. Cancellation must not cause cleanup to be skipped or permit a synchronous critical lease to straddle suspension. A cleanup failure is recorded and can withhold safe-retirement certification; cancellation must not masquerade as successful cleanup.
6. **Request, logical completion and physical quiescence are distinct.** A scheduler must not recycle a child continuation, scoped loan, shared physical stack storage, actor lease, host handle or tenant memory until no executing code/callback/registered finalizer can still access it, with terminal publication correctly ordered after the applicable retirement barrier. A timeout or unresponsive task is **not** successful cancellation; keep ownership fenced/retained, escalate through supervisor/tenant quarantine or terminate a genuinely isolated execution domain. Never unsafely kill a native OS thread or free shared memory used by a running task.
7. Untrusted guest code needs compiler-inserted cooperation/fuel checks, bounded loop admission, watchdogs and quotas. A backend unable to enforce reliable cancellation of untrusted loops or host operations in its advertised profile MUST reject that profile or isolate it in a genuinely revocable domain; it cannot claim guaranteed bounded cancellation merely because a boolean flag exists. Runtime cancellation cannot confer ambient I/O or cross-tenant access.
8. Cancellation, success and failure must be distinguishable in typed MIR, runtime ABI, tracing/receipts and conformance checks. `TaskSpawn`, `TaskCancelRequest`, `TaskJoin`, `TaskScopeCancel` and `TaskPhysicalRetire` need verified ownership and state transitions; `cancel()` cannot be optimized away or turned into unconditional success.

A useful interoperability invariant is **cancel request != cancelled terminal outcome != proof of physical retirement**. This remains true when two tasks are coallocated in a shared physical stack segment.

## Cancellation and scoped lock/lease cleanup — mandatory ordering

A task that is canceled MUST attempt to release **every lock and scoped resource that it actually acquired**, regardless of whether the request came from `Future.cancel()`, TaskScope exit, timeout, actor shutdown, or a parent cancellation. This includes `MutexLease<T>`, `RwLock` read/write leases, actor critical-state guards, channel registration tickets, timer/I/O waits, `using` resources and `defer` cleanup. Exact once means one cleanup per successful acquisition, not one cleanup per cancellation request. A failed or never-granted acquisition has **no live guard** to drop; it must cancel its waiter instead.

Lock state has three distinct checkpoints: **queued waiter**, **granted but not yet entered**, and **active critical lease**. Requesting cancellation removes a queued waiter or revokes an unclaimed grant atomically with any handoff, without producing a guard. An active critical lease **MUST NOT** be forcibly unlocked or handed to a successor while the holder can still access protected memory. Instead mark cancellation requested, make the running task observe a bounded safe point, then unwind its lexical `using` / `defer` stack, release each active lease **in reverse acquisition order**, and only then admit a lock successor. Repeated `cancel()` requests must not repeat release or wake a stale waiter.

A task blocked waiting for a lock must be woken by cancellation without parking an OS/scheduler carrier. A task executing inside a synchronous critical lease cannot `await`, `select`, yield, reenter an unknown-effect callable, or run an unbounded uncooperative loop. A cancellation request does **not** force it to suspend inside the lease; the compiler/runtime must insert bounded cooperation at legal checkpoints or use a genuinely isolated revocable domain for untrusted code. If the holder is uncooperative or a cleanup fails, retain the lock/tenant resource fenced and report `CLEANUP_FAILED` / `NOT_PHYSICALLY_RETIRED`; never claim successful cancellation or grant another task unsafe access.

On parent TaskScope exit, first request cancellation of unfinished descendants and abort their pending waits; unwind the parent's local guards **before any join that could depend on those guards**, then nonparkingly wait for physical child retirement. Retain captured owners and TaskScope storage until that join completes. On child termination, cleanup releases its own guards before it publishes its physically-retired terminal outcome. A parent waiting with a live guard is rejected at compile time, including any hidden `sync task` or implicit await.

A cleanup failure must not skip the remaining independent cleanup obligations or erase the original cancellation/failure cause. The runtime must retain both error identities, quarantine any unreleased permit/handle, and prevent new grants on that resource until a privileged supervisor proves safe recovery. Hard isolate termination requires host-owned finalization and cannot promise execution of guest `defer`; teardown still must fence handles, invalidate generations, cancel waiters and avoid reopening a protected resource while untrusted code might still be running.

**Proof gates:** typed MIR must represent `TaskCancelRequest`, `TaskCancelObserved`, `LockGrant`, `LockEnter`, `GuardRelease`, `TaskScopeChildRetired` and `TaskPhysicalRetire` as distinguishable effects with independently enumerated normal/throw/raise/panic/cancel/timeout exit paths. The compiler must reject missing, duplicate, reordered, aliased, escaped or suspension-crossing guard releases before generating a guest artifact. Source-only path verifiers and host waiter models are useful regression oracles, **not** evidence of guest runtime lifecycle safety. Link the scoped-lock contract in atto-spec #125 and the mutex host model in atto-source.rs #416; do not relabel their source-only tests as compiled task support.

## Ownership, borrows and scoped lifetime

Independent `task<T>` / `await task<T>` / `do task<T>` lower to typed `TaskSpawn` with join/discard as appropriate. Inline `sync task<T>` / `do sync task<void>` instead lower to `InlineTaskEnter` / `InlineTaskExit` and local cleanup; they MUST NOT allocate a Future or independently scheduled TaskId. The numbered child-capture rules below apply to *spawned* task forms; inline lexical scopes instead use normal lexical borrowing, with suspension-safe lifetime proof whenever the body can suspend:
1. Evaluate task capture expressions exactly once at submission, in source order. A child task has its own logical continuation frame (physical frame storage may be safely coallocated as specified above) and a verified task scope. A captured independent owned value requires explicit `take!` and a transitive, compiler-proven `Send` witness; a value copied into the child requires `Copy + Send` and a distinct valid owned child slot. No implicit move, clone, sharing, or capability grant is inferred from task syntax.
2. `borrow!` or implicit argument borrowing never becomes an owned `Send` task capture. A scoped, immutable borrowed capture may be admitted ONLY with an exact compiler-bound TaskScope region and runtime-guaranteed physical descendant quiescence before the lender can be moved/dropped; lacking that proof, reject `E_TASK_BORROW_ESCAPE`. Mutable task captures, overlapping exclusive loans and returning a borrowed captured object beyond the owner lifetime are rejected unless a separately certified exclusivity/lifetime profile proves them.
3. At `await` or **at a suspension inside** `sync task`, live ordinary loans must have a proven suspension-safe continuation lifetime and pinning/layout policy or be rejected with `E_SUSPEND_WITH_LIVE_LOAN`; synchronous critical lock/state leases may not span suspension. `do task` does not evade these checks for its child and does not retain unsupervised stack references.
4. A `TaskFuture<T>` handle has separately tracked affine task-control and result-observation rights as defined by the runtime contract; `get_ready()` moves the one result right into `Future<T>`, while `cancel_task()` and `cooperate()` remain available on the task-control half. Observing the result may not implicitly transfer T twice. Awaiting exactly one future layer preserves an inner Future. Discard cannot bypass supervisor error reporting.
5. Parent scope return, throw, raise, cancellation, timeout, actor teardown and TenantVM termination must cancel/join or otherwise physically retire all task descendants before recycling borrowed storage. Failed admission must roll back ownership transfer, without losing an owner or double-dropping it. Cleanup is exactly once where the termination model permits it.
6. Actor-owned tasks remain in their own tenant's authorized scheduler/TenantVM. No ambient I/O/socket, actor-heap alias, cross-tenant capability or supervisor CONTROL queue access is obtained by task creation or `sync`. An untrusted guest cannot forge an owned Future, continuation, runtime schedule ticket or proof marker. Fail closed on unknown IR facts, non-Send graphs, pin-domain uncertainty, FFI, missing tenant grants, or unknown lifecycle fences.

## TaskFuture control interface (2026-11-21 refinement)

The normative [TaskFuture control and cooperation contract](task-future-control-v1.md) refines the original result-only Future typing in this document: ordinary `task<T>` now has principal type `TaskFuture<T>`, `get_ready()` exposes a single-owned `Future<T>` result receipt, `cancel_task()` requests cancellation, and `cooperate()` requests a future legal scheduler yield by the target child. `await t` consumes the owned result right of `TaskFuture<T>` just as `await t.get_ready()` does; the two forms are alternatives, not two independent results. The existing `Future<T>` assignment and provably task-origin `.cancel()` calls remain versioned compatibility paths. This target change does not certify any compiler's implementation.

## Formatter rules

The formatter MUST preserve `sync task<T> { B }` and `do sync task<void> { B }` (or omitted type parameter for inferred void) as inline execution constructs. It must not silently retype `do sync task<int>` into void, which is a syntax/type error. It MUST NOT rewrite `do sync task` to `do task`, `sync task` to `await task`, or erase `sync`. It MUST NOT rewrite `block` into `do task`, change the generic payload, drop `await`, or alter source maps, comments and effects. Canonical formatting must remain idempotent and parse/effect equivalent. Release-level equivalence requires compiled guest comparison.

## Awaiting inline results and runtime binding forms (2026-11-21 hardening)

`await` is **type-directed**: it requires its operand's **static type** to be `Future<U>` and consumes exactly one Future layer. It does not inspect the source spelling and does not add an implicit join to a value. Thus `await task<T> { B }` is valid and yields T after independently spawning a child, whereas `await sync task<int> { return 42; }` is **E_AWAIT_TYPE** (the inline expression already has type `int`, not `Future<int>`). Treating the latter as a redundant, silently ignored `await` would mask incorrect typing and effect checks. The compiler must reject it before guest code generation.

**Exception (not redundant):** `await sync task<Future<int>> { return task<int> { return 42; }; }` is valid in a `susp` caller, and yields `int`: the inline body returns a **real spawned child Future**; the outer `await` joins that Future. No implicit flattening occurs. `sync task<Future<int>>` alone yields `Future<int>`, not `int`. If an inline body's transitive operations suspend, it suspends its caller and requires `susp`, regardless of whether the result type is Future.

The local declaration qualifier is orthogonal. Under `local-binding-mutability-v1.md` and `compile-time-constants-v1.md`, a local `const` initializer MUST be evaluable at compile time. Creating an asynchronous `task<T>`, awaiting it, or executing `sync task<T>` is a runtime computation and cannot satisfy `const` even when the body simply returns a literal. Use runtime-immutable `val Future<T>` / `val T` (or `let` when rebinding is intended). Neither the literal-returning scalar backend subset nor whole-program full AOT makes a runtime task a constexpr initializer. Compilers must reject `const Future<int> x = task<int> { return 42; };` and `const int x = sync task<int> { return 42; };` as non-constexpr initializers, without silently changing `const` into `val`.

An unannotated `task {}` whose body has no value-returning paths infers the `void` payload and yields `TaskFuture<void>`; `task { return 42; }` instead infers `TaskFuture<int>`. The same inference applies to supervised `do task {}` (discarded `TaskFuture<void>`), but not to `do sync task` with a non-void return, which remains prohibited. Contextual expected types cannot make a missing non-void return valid. An empty `task<int> {}` or `sync task<int> {}` cannot return an `int` and is **E_TASK_RETURN_TYPE** on the missing non-void return path. Empty `task<void> {}`, `do task<void> {}`, `sync task<void> {}` in a void value context, and `do sync task<void> {}` are void bodies. In **standalone statement position**, the void inline form still needs `do`. The `do task<void>` statement has no observable Future result, but **still spawns a structured, supervised child**, and scope-exit cancellation/physical retirement remain mandatory; an unsupported backend may not implement it as a no-op.

The compiler must retain the distinct typed MIR shapes: `TaskSpawn` (+ `TaskJoin` for `await`, discard registration for `do`) versus `InlineTaskEnter/Exit` (no child). For an `await sync task<Future<T>>`, MIR contains inline entry/exit, then `TaskJoin` of the **returned** Future, never an invented Future for the inline body. Missing async runtime or effect/ownership proof must fail closed.

## Positive and negative matrix (target)

| Source form | Expected |
| --- | --- |
| `val TaskFuture<int> t = task<int> { return 42; };` | task handle with control and unique result receipt |
| `val int result = await t.get_ready();` | int after one join; unique receipt consumed |
| `t.cooperate();` | void bounded scheduler hint to child; not forced preemption |
| `t.cancel_task();` | void cancellation request; not proof of terminal cancellation |
| `val Future<int> r = t.get_ready(); t.cooperate(); val int x = await r;` | valid, result split and task control retained |
| `val int x = t.get_ready();` | E_TASK_RETURN_TYPE; get_ready returns Future<int> |
| `await t.cooperate();` | E_AWAIT_TYPE; cooperation returns void |
| `t.get_ready(); t.get_ready();` | E_TASK_RESULT_CONSUMED; no duplicated result rights |
| `val int x = await sync task<int> { return 42; };` | E_AWAIT_TYPE; awaited operand is int, no guest artifact |
| `val int x = await sync task<Future<int>> { return task<int> { return 42; }; };` | int, join returned Future only, susp caller |
| `const Future<int> x = task<int> { return 42; };` | E_CONST (non-constexpr runtime initializer), no guest artifact |
| `const int x = sync task<int> { return 42; };` | E_CONST (non-constexpr runtime initializer), no guest artifact |
| `val Future<int> x = task<int> {};` | E_TASK_RETURN_TYPE, missing non-void return, no artifact |
| `val int x = sync task<int> {};` | E_TASK_RETURN_TYPE, missing non-void return, no artifact |
| `do task<void> {};` | void statement; structured child spawn with TaskScope lifecycle |
| `val TaskFuture<void> f = task {}; await f;` | TaskFuture<void> inferred from empty body; explicit await yields void |
| `val TaskFuture<int> f = task { return 42; };` | TaskFuture<int> inferred from valued return |
| `do task {};` | inferred void; independently scheduled supervised child with scope ownership |
| `val TaskFuture<int> x = task<int> { return 42; };` | TaskFuture<int>, independently scheduled child control + result rights |
| `val int x = await task<int> { return 42; };` | int, susp context |
| `val int x = sync task<int> { return 42; };` | int, inline; no independent spawn; pure body can run in non-susp caller |
| `do task<int> { return 42; };` | supervised spawn, void statement |
| `do sync task<void> { return; };` | inline void execution; no child TaskId or Future |
| `do sync task { };` | inferred void inline execution |
| `sync task {};` as standalone statement | E_SYNTAX; use `do sync task {};` for void task statements |
| `do sync task<int> { return 42; };` | E_TASK_RETURN_TYPE; do-inline must be void; no artifact |
| `do sync task { return 42; };` | E_TASK_RETURN_TYPE; cannot infer nonvoid in do-inline; no artifact |
| `val Future<Future<int>> x = task<Future<int>> { return task<int> { return 42; }; };` | nested Future preserved |
| `val int x = task<int> { return 42; };` | E_TASK_RETURN_TYPE |
| `val Future<int> x = await task<int> { return 42; };` | E_TASK_RETURN_TYPE |
| `task<int> { return "wrong"; }` | E_TASK_RETURN_TYPE |
| `task<int> { return; }` | E_TASK_RETURN_TYPE |
| non-suspending `sync task<int> { return 42; }` in non-susp fnc | valid inline T (if profile implemented) |
| `val sync = 1;` | E_RESERVED |
| child moves borrowed parent owner or holds ordinary loan across await | E_BORROW_CONFLICT / E_TASK_BORROW_ESCAPE / E_SUSPEND_WITH_LIVE_LOAN |
| child crosses tenant boundary without an authorized channel/capability | E_TENANT_BOUNDARY |
| `pending.cancel(); await pending;` | cancel request then success **or** `TaskCancelled` according to terminal race; never speculative `T` |
| `pending.cancel(); pending.cancel();` | idempotent; one cancellation request state, no double cleanup |
| cancellation before child admission | no child execution; capture rollback and no escaped loan |
| cancellation of parent with live `do task` and nested task | transitive cancellation and physical descendant quiescence before scope retirement |
| plain `Future<T>.cancel()` on an unsupported backend | E_UNSUPPORTED / no guest artifact; never a silent no-op |
| `val int x = pending.cancel();` | E_TASK_CANCEL_TYPE / no guest artifact |
| `val int x = 1; x.cancel();` | E_TASK_CANCEL_TARGET / no guest artifact |
| non-`susp` parent exits with potentially live `do task` | E_EFFECT / no guest artifact; cannot park to retire |


Verification: check tokens, parser AST equivalence, effects, typed MIR, ownership path, formatter round-trip and negative no-artifact diagnostics. Then run actual .atto guest fixtures on each backend, with exact source SHA/tree, toolchain and meaningful successful steps. Host-only Rust/Node model tests do not certify a compiler. Status for every backend begins NOT_EXECUTED until independent evidence proves otherwise.

## Dependencies / compatibility

This contract refines `susp-effect-shorthand-v1`, `implicit-argument-borrow-v1`, `ownership-vocabulary-v1`, `scoped-resource-timeout-v1` and the explicit nested Future rule. Inspect the existing Rust async source integration, Java Task implementation and candidate Mutex #125 before claiming readiness. Do not merge divergent TaskScope/capture implementations without ownership and effect reconciliation.
