# TaskFuture<T>: owned result receipt, cancellation and cooperative scheduling requests v1

**Status: normative TARGET proposal (2026-11-21), NOT compiled guest support.** This refines [typed-task-payload-sync-v1.md](typed-task-payload-sync-v1.md), whose existing TaskScope, cancellation, actor/TenantVM, ownership, inline `sync task` and full-AOT rules remain in force. Compiler backends MUST fail closed when this API cannot be lowered and verified. No implicit guest interpreter/JIT or host blocking is allowed in full guest AOT profiles.

## Type and result contract

```atto
pub susp fnc main(): int {
  val TaskFuture<int> t = task<int> { return 42; };
  val Future<int> ready = t.get_ready();
  t.cooperate();
  val int result = await ready;
  t.cancel_task();  // harmless if the child has already completed
  return result;
}
```

A regular `task<T> { B }` has **principal type `TaskFuture<T>`**: a move-only, capability-bearing handle for an independently scheduled child within the current `TaskScope`. It is also awaitable as a `Future<T>` via a one-way, **ownership-consuming**, same-payload projection. Old code `val Future<T> f = task<T> { ... };` remains valid because the compiler projects the newly created `TaskFuture<T>` into its result-only `Future<T>` receipt and discards the caller's direct task-control right; TaskScope still supervises the child. This does NOT generate another child, duplicate the result or silently flatten nested future layers. There is no reverse `Future<T>` to `TaskFuture<T>` cast, type-based handle forging, or generic covariance without separate proof.

`task { }` infers `TaskFuture<void>`. `task { return 42; }` infers `TaskFuture<int>`. `task<Future<int>>` produces `TaskFuture<Future<int>>`; one `await` produces `Future<int>`, not `int`. `sync task<T> { ... }` still produces exactly `T` inline, without a `TaskFuture`, independent TaskId or Future allocation. The `do task<T> { ... }` statement registers a supervised child but discards the handle; it has no expression result, and the scope (not an inaccessible fabricated handle) retains lifecycle/cancellation responsibility. `await task<T> { ... }` produces T via the new task's result receipt. `do sync task<void> { ... }` stays inline, void-only.

`TaskFuture<T>` is an **affine owned composite capability**: (1) one task-control right and (2) one result-observation right. Neither can be cloned, forged, promoted to another tenant nor shared across actors without a separately proven transfer protocol. A `val TaskFuture<T>` permits the methods below: they consume/split its affine result capability or submit a control request, not ordinary mutable field access through a readonly binding. `let` is not required just to call them.

## Canonical instance methods

| Method on `TaskFuture<T>` | Static return | Semantics |
| --- | --- | --- |
| `get_ready()` | `Future<T>` | Transfer the unique result-observation right into an awaitable Future. Never wait or park a carrier. |
| `cancel_task()` | `void` | Nonparking, idempotent cancellation request directed at this child and its owned descendants. |
| `cooperate()` | `void` | Nonparking, idempotent/coalescible **request** that this child yield/cooperate at its next **legal** scheduler safe point. |
| `cancel()` | `void` | Deprecated source-compatibility alias of `cancel_task()` on `TaskFuture<T>`, with the same authorization and semantics. |

All methods follow AttoLang snake_case naming. There is no host async Promise, OS-thread handle, raw TaskId exposure, implicit blocking join, permission elevation or unbounded queue insertion. None are compile-time constant-evaluable.

**`get_ready()` transfers one receipt only.** After `val Future<T> r = t.get_ready();`, the original `t` **retains task-control rights**, so `t.cancel_task()` and `t.cooperate()` still work while `r` is pending, but a second `t.get_ready()` or `await t` must fail `E_TASK_RESULT_CONSUMED`. The compiler's affine state/borrow checker must track the split and forbid aliases that would duplicate the result right; any unchecked dynamic ambiguity fails closed, never yields a second T. The owned `Future<T>` receipt is single-observation; concurrent double-await, cloning and `await r; await r;` are forbidden. The handle may still be used for control after terminal success/cancellation, without acquiring a second result. Dropping either half does not detach the child or weaken scope retirement.

`await t.get_ready()` is syntactic sugar for receiving the projected result `Future<T>` and joining it; it yields T on success and `TaskCancelled` (or the child's failure) on the respective terminal path. **`await t` is also accepted** with an implicit single result projection, so existing `await task<T> {...}` works. Only the result right is consumed: task control may remain available after the await. A plain `t.get_ready()` without await does not imply the task is already complete. `get_ready()` is a future receipt accessor, **not** a readiness poll and **not** a join. A future returned by `sync task<Future<T>>` can still be awaited, but ordinary `await sync task<int>` remains `E_AWAIT_TYPE`.

**Legacy source migration.** Existing exact-source fixtures use `val Future<T> p = task<T> { ... };` followed by `p.cancel()`. During this compatibility version, `Future<T>.cancel()` is accepted **only when the compiler can statically prove** that `p` retains task cancellation authority/provenance (e.g. a directly projected task-created Future), and it aliases `cancel_task()` with the same control checks; otherwise report `E_TASK_CANCEL_TARGET`. A result Future produced by an unrelated API is not arbitrarily cancellable. A direct task Future projection may preserve one explicit cancellation capability for this legacy alias, but it must not permit reverse casting, extra result receipts or a new privilege. New source should retain `TaskFuture<T>` and call `cancel_task()`; `Future<T>` is the general result-facing interface. A later removal of the compatibility alias needs separate versioned migration and conformance, not silent reinterpretation.

## Cooperative scheduling request: what `cooperate()` guarantees

`t.cooperate()` asks **the target child** to cooperate at its next scheduler-controlled opportunity. It does **not** perform `rt cooperate` on the calling task, forcibly deschedule a native thread, abort a locked critical section or override TaskScope cancellation. The method returns `void` immediately after an authorized, bounded, coalescible hint (or terminal no-op); it is not an acknowledgement of actual yield. Pending/running/blocked tasks may observe the request differently:

1. **Pending/ready-to-run:** scheduler records at most one pending hint and may put the child at the back of a fair run queue on its next dispatch; it never creates duplicate tickets or workers.
2. **Running:** compiler/runtime polls cooperation at inserted loop backedges, reductions/time-budget checks and other legal safe points. On observing it, the child cooperatively yields and is rescheduled in its own tenant's scheduler, preserving task-local continuation state.
3. **Waiting/suspended:** a hint may remain coalesced until the child becomes runnable. It does not bypass channel, timer, I/O, mutex or permission conditions, and should not invent an early completion/wakeup.
4. **Cancelled/terminal:** cancellation/supervision has priority. A task that has reached a terminal state makes `cooperate()` a harmless no-op. A cancellation-in-progress must not be masked or postponed by cooperation.
5. **Inside a synchronous critical guard:** never yield while the guard is live; defer observation until a legal safe point after release. No guard or actor sealed-state access may be invalidated by the hint.

No protocol may promise a bounded **wall-clock** response for an uncooperative native FFI call or a host blocking operation. In an advertised fair/untrusted profile, compiler-inserted bounded cooperation at loops and scheduler checkpoints remains mandatory, whether or not another task calls `cooperate()`. A backend lacking those checkpoints must fail its certified fairness profile, not pretend this method can forcibly preempt. A stronger `cooperate_ack()`, manual priority boost or hard realtime deadline protocol is **not** introduced here.

`cancel_task()` follows the canonical nonparking cancellation state machine: request is not completed cancellation, nor proof of physical retirement; a terminal success already committed stays successful, cancellation observed before commitment can yield `TaskCancelled`, descendants and cleanup retire safely within TaskScope. Neither control method consumes `get_ready()`'s receipt. Unauthorized foreign tenant/actor control, stale generation, forged handle, lack of ownership, or invalid effect/lease proof MUST fail closed without touching another task. Never implicitly copy TaskId or a raw pointer to control another task.

## Required typed IR, AOT and verification

Compiler type/effect passes distinguish `TaskFuture<T>`, `Future<T>`, and bare `T`, as well as the unique result-observation right and the independent control capability. The runtime ABI uses sealed tenant+task-incarnation+generation+rights validation. Required typed operations:

- `TaskSpawn` returns the owned `TaskFuture<T>` capability.
- `TaskGetReady` moves **one** awaitable result right and leaves only the control part in the original owner; `TaskJoin` consumes that result right at `await`.
- `TaskCancelRequest` and `TaskCooperateRequest` are distinct nonparking control effects; the latter is a bounded/coalesced scheduler hint, not `TaskYield` executed on behalf of the target.
- `TaskScopeCancel`, `TaskPhysicalRetire`, cancellation/throw/raise failure and guard-unwind events remain distinct. `sync task` uses `InlineTaskEnter/Exit` and MUST NOT synthesize control handles.

Lowering for full guest AOT must statically link the reachable handle, scheduler and result-join implementations. No guest JIT, interpreter, dynamic codegen, host Promise fallback, dangling pointer to the caller stack, unchecked cancellation, or bypass of effect/borrow checks is permitted.

Diagnostics and negative no-artifact requirements:

| Invalid use | Diagnostic |
| --- | --- |
| `val TaskFuture<int> t = sync task<int> { return 42; };` | `E_TASK_RETURN_TYPE` |
| `val TaskFuture<int> t = task<void> {};` | `E_TASK_RETURN_TYPE` |
| `const TaskFuture<int> t = task<int> { return 42; };` | `E_CONST` |
| `await t.cooperate()` or `await t.cancel_task()` | `E_AWAIT_TYPE` |
| `val int x = t.cancel_task();` or `val int x = t.cooperate();` | `E_TASK_CONTROL_TYPE` |
| `t.get_ready(); t.get_ready();` or `await t; await t;` | `E_TASK_RESULT_CONSUMED` |
| `val Future<int> f = other_future(); f.cooperate();` | `E_TASK_CONTROL_TARGET` |
| `val Future<int> f = other_future(); f.cancel_task();` | `E_TASK_CONTROL_TARGET` |
| `val Future<int> f = other_future(); f.get_ready();` | `E_TASK_CONTROL_TARGET` |
| `val int x = t.get_ready();` | `E_TASK_RETURN_TYPE` |
| full `task` control on an unsupported backend | `E_UNSUPPORTED`, **no guest artifact** |

Conformance must include success after `get_ready()`, cancellation while a separate receipt is pending, single-use proofs, task-origin Future compatibility, no cross-tenant control, scheduler cooperation request followed by actual safe-point yield, cancellation-before-yield priority, bounded hint coalescing, guard/critical-state non-yield and exact cleanup/physical retirement. Merely checking source strings or successful host models does not count as compiler/guest proof. Preserve explicit `NOT_EXECUTED` backend statuses until actual source- and binary-SHA-pinned stepful guest runs demonstrate each capability.
