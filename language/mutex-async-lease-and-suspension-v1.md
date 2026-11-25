# Mutex acquisition, scoped leases and suspension v1

**Status: normative TARGET contract — no cross-backend compiler/runtime certification (2026-11-19).**

This contract refines [scoped `using`](scoped-resource-timeout-v1.md), [susp/suspends](susp-effect-shorthand-v1.md), [implicit argument borrowing](implicit-argument-borrow-v1.md), and [shared ownership / guarded mutation](shared-ownership-and-guards-v1.md). It does not supersede their borrow, cleanup, or actor-isolation requirements. Implementations MUST fail closed on unsupported syntax or effects rather than silently emulate successful guest compilation.

## Source contracts

Both of the following are accepted **target** spellings. `susp` is the formatter's canonical alias for `suspends`; both are valid source.

```atto
suspends fnc increment(Mutex<int> counter): int {
  using counter.lock_async() as lock_lease {
    lock_lease.value += 1;
    return lock_lease.value;
  }
}

pub suspends fnc main(): int {
  val counter = new Mutex<int>(0);
  stdio.println(await increment(counter));
  return 0;
}
```

The explicit-acquisition spelling is also valid and preferred for clarity:

```atto
susp fnc increment_explicit(Mutex<int> counter): int {
  using await counter.lock_async() as lock_lease {
    lock_lease.value += 1;
    return lock_lease.value;
  }
}
```

The unadorned `using counter.lock_async()` syntax is **contextual syntax sugar**, restricted to a statically resolved, trusted asynchronous resource-acquisition contract. It lowers to `using await counter.lock_async()` and counts as an await effect at the `using` initializer. It is NOT a general implicit await for arbitrary `Task<T>`, `Future<T>`, methods named `lock_async`, or other `using` resources. The parser/typechecker must recognize it through typed intrinsic/resource metadata, not a string match on the method name. An implementation that does not yet support this explicit contextual lowering must reject the example; it must never acquire a lock by blocking a carrier thread.

## Effect and task semantics

1. `susp`/`suspends` permits suspension; it does not force a scheduler yield. A direct call of a suspending function produces a **lazy, effect-bearing task** with a statically known result. Creating that task evaluates call arguments exactly once but does **not** execute the callable body or acquire the mutex. Execution begins when its result is driven by `await` (or by an independently authorized, explicitly scheduled operation). Dropping an unstarted task does not run its body.
2. `await increment(counter)` is the caller's syntactic suspension point. If the task completes immediately, no carrier parking or context switch is required. If the mutex is contended, the task parks its *logical continuation*, not an OS or scheduler-carrier thread. `await` can resume with an answer without ever yielding physically.
3. Inside `increment`, the contextual `using counter.lock_async()` is a second (nested) syntactic suspension site via its defined implicit-await lowering. The explicit `using await ...` form has identical effects. Neither grammar form hides suspension from the typed HIR/MIR effect graph or from diagnostics.
4. An ordinary `increment(counter)` without `await` returns the task and does not perform the increment; it must never implicitly return an `int` or run on a carrier. The caller cannot erase `susp` from a callable type; a non-suspending context cannot drive or await that task.
5. In the explicitly selected borrow-default profile, a nonprimitive `Mutex<T>` argument is an ordinary checked **non-owning handle loan** unless explicitly transferred by a separate legal ownership operation. Legacy ownership profiles are not silently reinterpreted. Suspending while it is borrowed requires a proven pinned/stable handle, sufficient owner lifetime, and unchanged TenantVM/actor execution domain. If those proofs are absent, reject before emitting a guest. `await` does not implicitly `share!` or move an owner.

### Resource class construction versus value-struct construction

**Normative decision:** `Mutex<T>` is an **opaque sealed nominal resource class**, not a value struct. Its identity, owner domain, wait queue, lease epoch, and protected state are not value-copyable and may never be derived from a user-supplied struct with equivalent fields. `MutexLease<T>` is an affine scoped resource; it cannot be cloned, serialized, copied, transferred across actor/TenantVM boundaries, or stored for later access.

The **canonical and required** constructor is `new Mutex<T>(value)`, e.g., `val counter = new Mutex<int>(0);`. The `new` keyword specifies nominal class construction, **not a mandatory OS heap allocation**; backend representation may use a private arena, stack-allocated owner object, or another provably stable allocation consistent with ownership/lifetimes. Initialization evaluates `value` exactly once, establishes a fresh class identity in the current actor/task domain, and grants no ambient sharing. The legacy bare call `Mutex<int>(0)` is invalid: diagnostic **`E_NEW_REQUIRED`**, and no executable artifact. It must not be silently treated as a struct constructor, a `static fnc` factory, or a class-construction alias.

**Ordinary `struct` types** may use their specified value-constructor spelling without `new`, e.g. `Point(x: 1, y: 2)` if that struct defines positional/named construction. That policy must not determine how an identity-bearing resource such as `Mutex<T>` is created. Copying a struct containing a `Mutex<T>` owner is ill-formed unless the program explicitly moves its unique owner; a shared alias requires a distinct capability-checked `SharedMutex<T>` contract, not copying the mutex's bytes.

`new Mutex<T>` is subject to the Deno-like host permission and resource quotas where relevant; it does not authorize OS sockets, guest/native interop, cross-tenant transfers, or import new ambient host capabilities. A local mutex handle passed to `increment(Mutex<T> counter)` is a verified borrow, with owner lifetime and pinning checks across potential suspension. Generic `new` typing and runtime admission must be consistent across parsers, formatters, typed IR, guest code generation and every backend.



### Constructor conformance matrix

| Source form | Required result |
|---|---|
| `new Mutex<int>(0)` | Valid construction if the backend has implemented and verified `Mutex<int>`; otherwise a typed unsupported-feature diagnostic |
| `Mutex<int>(0)` | `E_NEW_REQUIRED`, no emitted guest |
| `val a = new Mutex<int>(0); val b = a;` | No implicit copy of the owned class resource; only an explicitly checked borrow/move may be admitted |
| `struct Mutex<T>` user declaration | Cannot redefine or spoof the reserved runtime `Mutex<T>` identity/capability |
| `new Mutex<int>(0)` from an unauthorized guest domain | Deny without creating an object or leaking a handle |
| `Point(x: 1, y: 2)` for a declared value struct | Follows ordinary struct constructor rules, no mandatory `new` |

The formatter must **preserve `new`**, never rewrite `Mutex<T>(...)` to `new Mutex<T>(...)` without a parser/typechecker decision, and never canonicalize the two constructor forms as equivalent. Compiler/frontend errors must be evaluated before any guest executable emission.

## Await readiness, scheduler fairness and versioned ABI migration

**Proposed normative decision:** an `await` establishes a *possible* suspension point, never a compulsory scheduler yield. Awaiting an already-completed admitted `Awaitable<T>` produces its value with **zero suspension events**. The merged [general Awaitable protocol](../rfcs/general-awaitable-poll-protocol.md) requires statically resolved nominal admission, single polling and physical retirement. Legacy experimental scalar `await 42` is not automatically admitted in this target; any scalar-to-ready adapter must be independently specified. The runtime may still process separately authorized safety/fuel checkpoints; such checks do not imply an unconditional task redispatch. Awaiting a pending operation saves exactly one continuation and returns control to the scheduler without blocking a carrier.

An explicit cooperation primitive may request a voluntary handoff, subject to the independent [cooperation/fuel contract](../proposals/cooperation-checkpoints-v1.md). Soft fairness checkpoints and mandatory hard-fuel enforcement **remain separate**; skipping an unnecessary yield does not exempt hostile tenants from fuel accounting or cancellation admission. Scheduling control under a live mutable guard is still illegal: a compiler must reject a syntactic `await` or a transitively suspending operation *even if* that particular await operand would be ready at runtime.

**Existing implementation conflict (must resolve before promotion):** the open browser-JSPI compiler branches [atto-source.rs #50](https://github.com/atto-lang/atto-source.rs/pull/50), [#77](https://github.com/atto-lang/atto-source.rs/pull/77) and [#186](https://github.com/atto-lang/atto-source.rs/pull/186) deliberately implement mandatory `atto.cooperate()` at **every** await site, including ready scalars. They have independent narrow guest-execution evidence under their experimental `atto.async/2` ABI; that evidence is real but tests a **different scheduling contract** from this proposal. Do not relabel it as ready-fast-path conformance. The overlapping [v2 async draft #262](https://github.com/atto-lang/atto-source.rs/pull/262) and scoped-mainline forward port [#397](https://github.com/atto-lang/atto-source.rs/pull/397) also require a semantic overlap review.

Migration must: (1) introduce a **new versioned async guest/host ABI** for ready-conditional `await`, without silently reinterpreting `atto.async/2`; (2) update the compiler's typed `Await` lowering, JSPI host contract, optimized and unoptimized paths, and readiness/yield telemetry together; (3) require host rejection of unknown/older ABI versions, not legacy-cooperation fallback; (4) run native Rust/wasm32 compiler builds, actual compiled guest Wasm + Chromium Worker tests, ready vs pending wait oracles, cancellation and actor admission; (5) reconcile or supersede the older open PRs under repository governance before merging. A new ABI number must be allocated through the common ABI registry, not invented by this document.

**Laziness boundary:** a normal call `increment(counter)` constructs a lazy continuation without running its body. By contrast, an explicitly scheduled `task { ... }` may begin before its first `await` in a structured child scope. The two operations are distinct and their order, supervision, cancellation and ownership must be preserved on every backend. If a backend's host `Promise` is eager by default, the compiler must wrap it in a lazy guest task rather than letting host eager execution define Atto semantics.

## Locks and leases

- `counter.lock_async()` returns a statically typed awaitable acquisition of `MutexLease<T>`. An uncontended fast path grants the lease without yielding; a contended path registers a **bounded, cancellable, scheduler-integrated waiter**, with no host-thread waiting, busy-spin, or one-thread-per-waiter model. A waiter receives a linear grant or a typed failure, never both. Logical cancellation does not certify physical retirement. Retain owner storage and registration until acknowledged retirement, and do not consume a losing select arm. Hand-off and cancellation must be race-safe.
- `counter.lock()` returns a lease **only when immediately available**; otherwise it raises/reports a typed would-block failure rather than parking a carrier. `try_lock()` returns an `Option<MutexLease<T>>` without suspending. These are separate from the asynchronous waiting operation.
- A `MutexLease<T>` is an opaque, affine, noncopyable, nonserializable capability. Its `value` is a compiler-tracked *exclusive place projection*, valid only while the lease is live; it is NOT a raw pointer or independently shareable mutable alias. For a mutable `Mutex<T>`, guarded `value += 1` is permitted even through a readonly loan of the synchronization handle, but is never permitted through an ordinary frozen `T` alias.
- The holder is a **runtime-issued logical continuation/segment token** plus a tenant, actor/run-domain, mutex generation and acquisition epoch, not a reusable OS thread ID or stable actor ID alone. Recursion, stale lease reuse, cross-segment release, double-release, a revoked generation and wrong-domain use are errors.
- The lease begins **only after** successful acquisition and is registered for `using` cleanup exactly once. `using` releases it on fallthrough, `return`, `throw`, `raise`, handled panic/unwind where supported, and cooperative timeout/cancellation, including early-return expressions. Cancellation during the acquisition queue must remove the waiter without ever creating a guard; cancellation racing a granted lease must transfer it to the scoped guard or dispose of the grant exactly once.
- The lease cannot escape as a return value, captured closure, actor message, field, collection element, heap-stored reference, FFI handle, deferred callback or task. A detached primitive copied out of the lease is fine.
- **No `await`, `select`, `readch`, `yield`, or transitive suspending/unknown-effect call while a lease is live**, regardless of whether acquisition was via `lock()` or `lock_async()`. The word `async` describes waiting *before* guard entry, not permission to suspend *inside* the guarded region. This restriction agrees with the existing shared-ownership guard contract; any future suspend-safe guard is a different, explicitly reviewed type/feature.
- A fast, synchronous lexical critical section still requires bounded resource accounting, scheduler cooperative fairness at entry/exit and anti-starvation design. Lock ordering, poison/recovery and fairness policy must be documented in the library/backend and covered by contention tests; deadlock freedom is not implied.

## Cancellation of active leases and structured task teardown

Cancellation of a task which **already entered** a guarded critical section MUST NOT unlock it by merely invalidating a logical ticket. That would let a successor mutate protected storage while the original holder is still executing. Acquisition has distinct `waiting`, `granted-unclaimed`, `active-claimed`, `cancel-requested-active`, and `released` phases. A queued waiter or never-claimed grant can be revoked atomically with handoff. An active claimed lease must retain exclusive access until safe-point lexical cleanup releases it.

A `using` guard has no suspension points: a cancellation request is deferred while its holder finishes a bounded synchronous critical region, then executes lexical unwind. Guards release on normal return, throw, raise, cancellation, timeout and actor teardown. Nested active guards unwind in reverse acquisition order; no parent child-join may run under a held synchronous lease. A cancellation request and even shutdown are NOT proof that an active holder physically retired. Shutdown rejects new waiters, cancels pending ones and keeps the active lease fenced until release/isolated retirement.

Cancellation/grant/release must linearize through one trusted arbiter. A resumed waiter validates generation, continuation and TenantVM credentials before entering the guard. Double-release, replay, reentrant claims, stale wakes and foreign-domain attempts fail closed. A cleanup error must not silently grant another task the lock: preserve its failure cause, fence/quarantine the resource and keep attempting independent cleanup obligations.

A TaskScope must request cancellation of unfinished children, dispose of its own locks before any child join that might need them, then nonparkingly await **physical** descendant retirement before reclaiming borrowed storage. Hard guest termination cannot guarantee in-guest finalizers; privileged host teardown must fence resources and wait for the relevant isolated execution domain to cease before reclaiming protected memory.

Reference: [typed-task-payload-sync-v1.md](typed-task-payload-sync-v1.md) is the target task cancellation contract. The existing single-arbiter Rust reference model in atto-source.rs #416 has a claimed-lease cancellation hardening patch, but **is not an installed guest scheduler or compiled mutex implementation**.

## TenantVM and actor boundary

`Mutex<T>` remains confined to its creating authorized actor/task execution domain. Its handle, value and lease cannot transit a different actor, heap, TenantVM, isolate, worker or OS process merely by sharing a variable. Use a separately reviewed `SharedMutex<T>` capability for expressly authorized same-process shared-memory scenarios, with recursive `SharedSafe` checks and policy-based admission on every use; not every target supports that capability. **No untrusted cross-tenant sharing is admitted** by either spelling without an independent isolation-safe broker/capability design. `Sendable` and `Serializable` are distinct; lock state and raw guard pointers are never implicitly serialized. Unsupported backends must reject before artifact emission.

A normal exceptional unwind can guarantee scope cleanup. A hard native process abort, compromised hostile guest, or forcibly destroyed Wasm instance cannot guarantee in-guest finalizers; a privileged host supervisor must own revocation/reclamation of outstanding permits and pending waiter accounting. Never claim `using` alone guarantees cleanup across forced termination.

### Deterministic contention oracle — no illicit yield inside a guard

A test with **one cooperative scheduler carrier** cannot put task A in an unsuspendable critical section and then schedule task B on the *same* carrier to contend before A exits: that would require an illegal yield, preemption or a second carrier. The nonparking test therefore uses **two controlled carriers** (or equivalent independently controlled owner and waiting-carrier dispatch):

1. Carrier A grants the lease and deliberately holds it in a bounded, synchronous critical region; no await/select or unbounded spin inside the region.
2. Carrier B tries `lock_async()`, records `PENDING` in an observable event ledger, and relinquishes **only its logical continuation**.
3. Another runnable task C on carrier B must complete and record progress **before** A releases the lease.
4. A releases; exactly one grant to B is recorded; B resumes with the right logical continuation and scoped cleanup.
5. Repeat at queued-waiter cancellation/grant boundary, and with a stale wake and revoked tenant incarnation; deny replay, wrong owner or duplicate cleanup.

Host-side simulation alone is insufficient. To claim compiled-guest parity, compile the exact `.atto` source into a guest with a bound, authenticated scheduler trace and demonstrate the ordering under a real runtime. Do not insert a special `await` within A's guard merely to manufacture contention.

## Required typed lowering and diagnostics

Resolve `Mutex<T>`, the exact acquisition overload, `using` resource trait and `susp` effect before MIR. Lower contextual syntax to the same typed operation as the explicit `using await` spelling, with one acquisition evaluation and one cleanup edge. Emit an auditable suspension-site ID, owner origin, tenant/actor/continuation tokens, acquisition/cleanup state machine and exceptional/cancellation CFG edges. Verify every exit edge releases at most one acquired permit and no retained mutable alias survives cleanup. Do not fall back to a host `synchronized` block or unverified JavaScript interpreter.

Required stable diagnostic families (specific display text is backend-dependent):

| Family | Invalid condition |
| --- | --- |
| `E_AWAIT_EFFECT` | Driving asynchronous acquisition in a nonsuspending context |
| `E_GUARD_SUSPEND` | Any direct or transitive suspension inside a live guard |
| `E_GUARD_ESCAPE` | Returning/storing/capturing/transporting the lease or `value` reference |
| `E_GUARD_REENTRANT` | Recursive acquisition by same active logical continuation |
| `E_LOCK_DOMAIN` | Foreign actor/TenantVM/isolate or revoked handle |
| `E_LOCK_WOULD_BLOCK` | Contended synchronous `lock()` when not represented as a typed return |
| `E_LOCK_CANCELLED` | Canceled acquisition or deadline with no duplicate grant |
| `E_LOCK_UNSUPPORTED` | Missing verified compiler/stdlib/runtime lowering, shared-memory support, or unavailable waiter semantics |

## Proven closed-world uncontended lock elision

An optimizing compiler MAY eliminate a physical lock/unlock pair only when an auditable, sound whole-program/guest-domain proof establishes all of the following: the mutex owner is freshly constructed in the current task domain; no alias, actor, FFI, user-defined method, detached task, reentrant host callback or future suspension can access it during the guard; acquisition is definitely ready; protected mutation is checked and cannot throw or trap before cleanup; and the lease is nonescaping and disposed at every normal return. The compiler must still generate the actual protected scalar computation and preserve observable values and effect ordering. Merely seeing a method named `lock_async`, optimizing away an `await`, or assuming no contention because a test is single-threaded is NOT sufficient.

A narrowly admitted scalar profile (`Mutex<int>` with constant checked initializer and update, one private increment callable, one `main` and only statically bounded sequential awaits (currently one or two)) can be reported as **single-task uncontended fast-path execution** only after real guest compilation/execution receipts. It is **not** general `Mutex<T>`, async queue, shared-memory, structured task, or TenantVM isolation support. Unsupported source shapes must still produce diagnostics without an executable guest artifact. The full portable conformance contract remains unsatisfied until independently scheduled contention and cancellation are executed.

## Portability and conformance

Authoritative fixture registry: `atto-platform-conformance/contracts/mutex-async-lease-v1.json`, with both source spellings, ready and contended acquisitions, lazy-task nonexecution, prompt nonparking failure, return/unwind/cancellation exactly-once cleanup, guard escape/suspension negatives, stale/cross-tenant tokens, nested task ownership and unsupported-target diagnostics. No backend is certified merely because this spec or a source fixture exists.

Required executable proof per independently maintained `atto-source.*` backend: (a) parse/typed HIR/MIR guard and suspension site identity, (b) compile real .atto guest with correct stdout/exit, (c) demonstrate that a waiting scheduler carrier continues independently runnable work while a different carrier or controlled external owner holds the guard, (d) forced throw/cancellation race and single-release, (e) negative diagnostics with **no guest artifact**, (f) tenant/actor isolation adversarial cases, and (g) exact source/compiler Git SHA and nonzero-step CI. Hard-target embedded/HDL backends may report **UNSUPPORTED** until they implement an equivalent scheduler; they must not claim parity by accepting syntax alone.

**Rollout:** spec + source-only conformance first, borrow/effects checker and formatter, then runtime+stdlib implementations and real backend guest tests; promote backend status only from executed evidence. Legacy Oreslang Java mutex PRs #19, #56, #1351, #1923 and #1938 are design/integration leads, not automatically migrated or certified Atto code.
