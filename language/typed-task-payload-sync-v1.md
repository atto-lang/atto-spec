# Typed task payloads, `sync` reservation and scoped ownership v1

**Status: normative TARGET proposal, NOT compiler/backend guest certification (2026-11-19).** This adds task-specific typing and spelling rules without weakening `susp`, implicit argument borrowing, ownership, `using` cleanup, or TenantVM isolation. An unimplemented compiler MUST reject before emitting a guest artifact.

## Grammar and type judgment

```ebnf
task_expr         = "task", [ "<", task_payload_type, ">" ], task_body ;
task_body         = "{", { statement }, "}" ;
joined_task_expr  = ( "await" | "sync" ), task_expr ;
discard_task_stmt = "do", [ "sync" ], task_expr, [ ";" ] ;
task_payload_type = type_ref ;  // includes void and Future<U>
```

`sync` is a **reserved whole-word keyword**. It is not a legal identifier, generic parameter, field, method, package alias or user-defined type, and must not match identifier prefixes like `synchronize`. It has **no bare sync-block, host-thread blocking, mutex, or implicit-I/O meaning**. The `task` word may remain contextual outside this grammar for migration compatibility, but any matching `task<...> { ... }` or `task { ... }` must parse as the task construct or fail closed, never silently become comparison expressions.

`task<T> { body }` declares **the payload T**. Its expression type is **`Future<T>`**, not T and not `Future<Future<T>>`. `task<Future<T>>` explicitly yields `Future<Future<T>>`: no auto-flattening. An inferred `task { body }` infers T from all reachable return paths; a contextual expected `Future<T>` can supply T without inventing coercions. For an unprovable or contradictory result, reject with `E_TASK_RETURN_INFER` / `E_TASK_RETURN_TYPE`. All non-void body paths must return T. `task<void>` may only return without a value. Task-body `return` exits its child task, not the parent callable.

```atto
pub susp fnc example(): int {
  val Future<int> pending = task<int> { return 42; };
  val int result = await pending;
  val int also = sync task<int> { return 0; };
  return result + also;
}
```

`await task<T> { body }` and `sync task<T> { body }` must lower to the **same typed join operation**, producing T. Both require an enclosing `susp` callable and are suspension sites, including if the result is already ready for effect checking. They MUST NOT block a scheduler/actor carrier or manufacture additional privileges. Whether an already-ready await forces a physical yield is a separate, versioned scheduler fairness policy; the two spellings must not diverge.

`do task<T> { body }` schedules a **supervised** child whose result is intentionally discarded by the parent expression; the statement itself has type void. `do sync task<T> { body }` is a contextual alias of exactly this form, **not** an await-and-discard: in a `do` task statement the optional `sync` is syntactic sugar removed before effect checking. Without the `do`, `sync task` always joins. A discarded Future does not detach from TaskScope or lose its exception/cancellation/physical-retirement obligations. A value-returning discarded task is permitted, but its result is not readable through that statement; diagnostics/lints may flag likely accidental discards.

The existing lexical `block { ... }` is NOT redefined to spawn work by this v1 change. Its prior proposal to alias `do task` conflicts with a current sequential block grammar and requires an explicit, separately reviewed migration. Ordinary `{ ... }` remains a lexical sequential block.

## Task frames, shared storage and suspension

**Normative decision: distinct logical task frames, shared lexical TaskScope, optional proven physical stack coallocation.** A child `task<T>` is a separately schedulable computation, not a nested call running on the parent's raw stack by definition. It has its own program counter, task-local variables, return slot, cancellation state, and suspension/exception cleanup state. It shares the parent's **structured task scope**, not unrestricted read/write access to its activation record. A `Future<T>` is an owned handle to the child result, **not** a pointer to a parent's stack slot.

The specification MUST NOT require a fresh native thread or dedicated stack allocation per task. A backend MAY use stackless coroutine frames, segmented stacks, guarded stacks, arenas, or stack allocation/coallocation of an independent task frame **as a nonobservable optimization**, if compiler and runtime jointly prove all of the following:

1. **Independent continuation and reentrancy:** any child that can suspend, be rescheduled, or run in parallel must retain its own live locals/PC and cannot reuse an active parent's mutable activation slots. Parent suspension, reentrant calls, nested tasks and recursion must not clobber child state. If a child can move between carriers, all live state and synchronization must remain valid across migration.
2. **Lifetime and escape:** physical stack placement is permitted only while the complete descendant lifetime is bounded by the storage's lifetime. The storage cannot be popped, overwritten, unmapped, or recycled before **physical** child retirement, including cancellation/throw/raise/panic races. If escape/suspension proof fails, allocate an independent continuation in the same tenant's checked arena (or reject before producing a guest artifact). A bare `Future<T>` return does not silently extend a parent's stack lifetime. Any explicit future escape or scope transfer needs a separate, proven ownership and supervision contract.
3. **Capture and aliasing:** the child can only see explicitly or compiler-verified captured values with independent ownership, safe copies, or certified scope-bounded loans. No raw parent-frame aliases are implied. A shared readonly loan requires the appropriate cross-carrier thread-safety/immutability proof (e.g. `Sync` when tasks may run on multiple carriers); concurrent writers or parent writes under a child loan are rejected. An exclusively borrowed capture needs a separately certified exclusive-loan profile and cannot be inferred from `sync`.
4. **Effects:** `await task<T>` and `sync task<T>` are identical suspension and typed-join operations. Neither spelling guarantees synchronous execution, a shared physical stack, blocking an OS carrier, or an optimization. `do task<T>` / `do sync task<T>` submit independent supervised children; they cannot alias parent stack slots merely because their handles are discarded.
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

**Every admitted Atto task is cancellable**, including tasks whose `Future<T>` handle is discarded by `do task`. Cancellation is a structured, tenant-bounded control operation, **not** a `Future<T>` payload, a Go-style detached goroutine, a forced OS-thread kill, or permission to reclaim live frame storage early. Unimplemented backends MUST reject guest admission rather than silently ignoring cancellation.

### Surface API and outcome

* An owned `Future<T>` exposes `cancel(): void`. This nonblocking, idempotent operation **requests** cancellation of its task and descendants, without consuming the single-use Future result. Calling it on a previously requested or already terminal task is harmless; it does **not** imply the child has stopped. There is no implicit `await`, return of `T`, or privilege elevation.
* `await future` joins the task and yields its `T` **only on success**. A cancelled task instead delivers the distinct built-in `TaskCancelled` terminal control outcome. It never fabricates a `T`, silently converts cancellation into `Ok(T)`, or calls an unhandled cancellation an actor `panic`. An awaiter may explicitly handle cancellation; otherwise the cancellation propagates as a cancellation outcome through its task's scope, not as a successful return. `sync task<T>` and `await task<T>` use the same rules. Task failure remains distinct from cancellation.
* `TaskCancelled` is an `Error`-compatible typed cancellation outcome for explicit handling, but **its propagation is not equivalent to an arbitrary user `throw`/unhandled `raise` escalating to actor panic**. The runtime preserves the separate terminal cause. A cancelled parent cannot clear its own cancellation merely by catching or trapping an awaited child outcome. Explicit cancellation shielding/reparenting is **not** in this v1 contract.
* A `Future<T>` is **not** a detached execution permit. Dropping it or saying `do task` does not remove its child from TaskScope, stop error supervision, or disable scope cancellation. Only an authorized owner of the Future or owning TaskScope may request cancellation; a guest cannot forge handles or cancel another tenant's task.
* `cancel()` may be called from a non-`susp` context because it never joins or parks a carrier. Waiting for retirement via `await` requires a suspension-capable context. Calling `cancel()` is **not** evidence of successful cleanup.
* Calling `.cancel()` on a non-`Future<T>` receiver is `E_TASK_CANCEL_TARGET`; using the `void` result of `Future<T>.cancel()` as a value is `E_TASK_CANCEL_TYPE`. These failures produce no guest artifact. Neither a matching method name on an arbitrary object nor a host Promise callback may silently substitute for the task cancellation capability.

```atto
pub susp fnc main(): int {
  val Future<int> worker = task<int> { return 42; };
  worker.cancel();        // nonblocking request, does not consume worker
  // await worker: either int 42 if completion won, or TaskCancelled if cancel won
  return 0;               // scope must still retire the child safely
}
```

### State machine, race ordering and physical retirement

1. Task admission is fenced against parent-scope cancellation. A child admitted before cancellation is registered exactly once in TaskScope; otherwise admission fails and owned captures are rolled back without executing the child. No child may be admitted after that scope enters cancelling.
2. The logical states include `pending`, `running`, `cancel_requested`, `cancelling`, and **terminal** `succeeded` / `failed` / `cancelled`. The first atomic terminal claim wins. An already committed successful result remains successful even if `cancel()` arrives later; a cancellation accepted before terminal commitment must prevent any later user-level successful commit once its cancellation safe-point/control handoff has won. Repeated cancellation requests do not duplicate completion, callbacks or cleanup.
3. Cancellation is **transitive and downward** across nested TaskScopes, including `do task` children. On ordinary lexical scope exit, any unfinished child is first cancelled and physically joined before parent return can finish; explicit awaits remain the way to obtain successful child values. Cancelling one child does not automatically cancel healthy siblings or the parent; failure/supervisor policy is separately specified. A parent may not report physical retirement until its descendants and their registered cleanup/notifications have physically retired.
4. Compiler/runtime cancellation safe points MUST cover task start, every suspension (`await`, `sync task`, channel/select/timer and cancellable I/O), cooperative loop/backedge budgets and bounded blocking host operations. Pending timers, I/O and channel waits must have a wake/revoke path that cannot strand a cancelled task indefinitely; callback/admission races need generation or one-shot fencing. Runtime must check cancellation before committing an admitted operation if required by its protocol.
5. Once cancellation is observed, the task unwinds through `defer`, `using`, lock/lease releases and other cleanup **exactly once**, under a bounded, non-privilege-escalating cleanup policy. Cancellation must not cause cleanup to be skipped or permit a synchronous critical lease to straddle suspension. A cleanup failure is recorded and can withhold safe-retirement certification; cancellation must not masquerade as successful cleanup.
6. **Request, logical completion and physical quiescence are distinct.** A scheduler must not recycle a child continuation, scoped loan, shared physical stack storage, actor lease, host handle or tenant memory until no executing code/callback/registered finalizer can still access it, with terminal publication correctly ordered after the applicable retirement barrier. A timeout or unresponsive task is **not** successful cancellation; keep ownership fenced/retained, escalate through supervisor/tenant quarantine or terminate a genuinely isolated execution domain. Never unsafely kill a native OS thread or free shared memory used by a running task.
7. Untrusted guest code needs compiler-inserted cooperation/fuel checks, bounded loop admission, watchdogs and quotas. A backend unable to enforce reliable cancellation of untrusted loops or host operations in its advertised profile MUST reject that profile or isolate it in a genuinely revocable domain; it cannot claim guaranteed bounded cancellation merely because a boolean flag exists. Runtime cancellation cannot confer ambient I/O or cross-tenant access.
8. Cancellation, success and failure must be distinguishable in typed MIR, runtime ABI, tracing/receipts and conformance checks. `TaskSpawn`, `TaskCancelRequest`, `TaskJoin`, `TaskScopeCancel` and `TaskPhysicalRetire` need verified ownership and state transitions; `cancel()` cannot be optimized away or turned into unconditional success.

A useful interoperability invariant is **cancel request != cancelled terminal outcome != proof of physical retirement**. This remains true when two tasks are coallocated in a shared physical stack segment.

## Ownership, borrows and scoped lifetime

Every spelling maps to one canonical typed TaskSpawn + optional TaskJoin/TaskDiscard MIR path with identical borrow facts:

1. Evaluate task capture expressions exactly once at submission, in source order. A child task has its own logical continuation frame (physical frame storage may be safely coallocated as specified above) and a verified task scope. A captured independent owned value requires explicit `take!` and a transitive, compiler-proven `Send` witness; a value copied into the child requires `Copy + Send` and a distinct valid owned child slot. No implicit move, clone, sharing, or capability grant is inferred from task syntax.
2. `borrow!` or implicit argument borrowing never becomes an owned `Send` task capture. A scoped, immutable borrowed capture may be admitted ONLY with an exact compiler-bound TaskScope region and runtime-guaranteed physical descendant quiescence before the lender can be moved/dropped; lacking that proof, reject `E_TASK_BORROW_ESCAPE`. Mutable task captures, overlapping exclusive loans and returning a borrowed captured object beyond the owner lifetime are rejected unless a separately certified exclusivity/lifetime profile proves them.
3. At `await` / `sync task`, live ordinary loans must have a proven suspension-safe continuation lifetime and pinning/layout policy or be rejected with `E_SUSPEND_WITH_LIVE_LOAN`; synchronous critical lock/state leases may not span suspension. `do task` does not evade these checks for its child and does not retain unsupervised stack references.
4. A `Future<T>` handle has linear/affine ownership and verified result-observation semantics as defined by the runtime contract; observing it may not implicitly transfer T twice. Awaiting exactly one future layer preserves an inner Future. Discard cannot bypass supervisor error reporting.
5. Parent scope return, throw, raise, cancellation, timeout, actor teardown and TenantVM termination must cancel/join or otherwise physically retire all task descendants before recycling borrowed storage. Failed admission must roll back ownership transfer, without losing an owner or double-dropping it. Cleanup is exactly once where the termination model permits it.
6. Actor-owned tasks remain in their own tenant's authorized scheduler/TenantVM. No ambient I/O/socket, actor-heap alias, cross-tenant capability or supervisor CONTROL queue access is obtained by task creation or `sync`. An untrusted guest cannot forge an owned Future, continuation, runtime schedule ticket or proof marker. Fail closed on unknown IR facts, non-Send graphs, pin-domain uncertainty, FFI, missing tenant grants, or unknown lifecycle fences.

## Formatter rules

The formatter MAY normalize `do sync task<T> { B }` to `do task<T> { B }` only when the matched syntax is proven, preserving comments, literals, nested generics, task body and source maps. It MUST NOT rewrite stand-alone `sync task` to `do task`, change `task<T>` into `task<Future<T>>`, rewrite `block` into `do task`, or drop an `await`. Normalization must be idempotent and parse-/effect-equivalent; release-level equivalence additionally needs real compiler guest comparisons.

## Positive and negative matrix (target)

| Source form | Expected |
| --- | --- |
| `val Future<int> x = task<int> { return 42; };` | Future<int> |
| `val int x = await task<int> { return 42; };` | int, susp context |
| `val int x = sync task<int> { return 42; };` | same as await, susp context |
| `do task<int> { return 42; };` | supervised spawn, void statement |
| `do sync task<int> { return 42; };` | identical supervised spawn and supervision |
| `val Future<Future<int>> x = task<Future<int>> { return task<int> { return 42; }; };` | nested Future preserved |
| `val int x = task<int> { return 42; };` | E_TASK_RETURN_TYPE |
| `val Future<int> x = await task<int> { return 42; };` | E_TASK_RETURN_TYPE |
| `task<int> { return "wrong"; }` | E_TASK_RETURN_TYPE |
| `task<int> { return; }` | E_TASK_RETURN_TYPE |
| `sync task<int> { return 42; }` in non-susp fnc | E_EFFECT |
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


Verification: check tokens, parser AST equivalence, effects, typed MIR, ownership path, formatter round-trip and negative no-artifact diagnostics. Then run actual .atto guest fixtures on each backend, with exact source SHA/tree, toolchain and meaningful successful steps. Host-only Rust/Node model tests do not certify a compiler. Status for every backend begins NOT_EXECUTED until independent evidence proves otherwise.

## Dependencies / compatibility

This contract refines `susp-effect-shorthand-v1`, `implicit-argument-borrow-v1`, `ownership-vocabulary-v1`, `scoped-resource-timeout-v1` and the explicit nested Future rule. Inspect the existing Rust async source integration, Java Task implementation and candidate Mutex #125 before claiming readiness. Do not merge divergent TaskScope/capture implementations without ownership and effect reconciliation.
