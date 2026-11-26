# 06 — Asynchrony, Structured Tasks, Channels and Scheduling

**Status: DRAFT.** These are source and runtime semantics; a specific thread topology is a separately verified deployment property.

## Future, Task and await

A `Future<T>` is an asynchronously settling value/observation; a `Task<T>` is a lightweight structured computation with cancellation, ownership and a result. They are not interchangeable by implicit flattening. `await` suspends the current logical computation; it is **not** permission to block one OS worker per pending operation.

```atto
val response = await client.get_text(url)
val parsed = parse_response(response)?
```

The intended `nb` Task block form (pending source-to-execution admission) is:

```atto
let Task<int> work = nb {
  return compute()
}

val result = await work
```

`do nb { ... }` explicitly discards a Task handle but not its supervision obligation. A Task has a structured parent, may be cancelled, and must not capture mutable actor state or escaping stack borrows. `await task` joins its result; a Task is not an actor and has no default mailbox.

## TaskFuture and inline task target

The [typed task contract](../language/typed-task-payload-sync-v1.md) and [TaskFuture control contract](../language/task-future-control-v1.md) refine historical task spellings: independently scheduled `task<T>` produces `TaskFuture<T>`, with one ownership-consuming result projection to `Future<T>`; `sync task<T>` produces T inline on the caller thread, with no fabricated child. The historical `nb` task spelling above is separately versioned migration syntax. A potentially migrating inline continuation must reject; never park a carrier to implement same-thread execution. All retirement and ownership gates remain mandatory. This is a target, not portable guest evidence.

## Channels, select and backpressure

### Channel wait modes and result discard

**Target contract; backend evidence is required before declaring parity.** A
channel operation has one of three wait modes, independent of whether its result
is used. A "blocking" source operation means **cooperative suspension of the
logical task**, never blocking the underlying actor/scheduler worker.

| Syntax | Return type | When not immediately ready |
| --- | --- | --- |
| `readch ch` | `T` | Suspend the calling continuation until read commits |
| `writech ch, value` | `void` | Suspend until write/rendezvous admission commits |
| `nb readch ch` | `Future<T>` | Atomically register a pending read and return immediately |
| `nb writech ch, value` | `Future<void>` | Atomically register a pending write and return immediately |
| `try readch ch` | `Option<T>` | Return `None`, **without registering** |
| `try writech ch, value` | `TryWriteResult<T>` | Return `Accepted`, `Full(original)` or `Closed(original)` **without registering** |
| `do readch ch` | `void` statement | Exactly `readch`, but discard the received value |
| `do writech ch, value` | `void` statement | Exactly `writech`, but discard the unit result |

The `do` qualifier is **result discard, not a detach or nonblocking
modifier**. `do nb readch/writech` is rejected: silently throwing away an
unsettled Future loses error observation, cancellation ownership and possibly a
bounded channel registration. To perform a concurrent operation, explicitly
retain and `await` its Future within a structured task scope. `try` and `nb`
are not synonyms. Parenthesized intrinsic forms, when supported, preserve the
same semantics.

Channel operations must type-check their channel capability and payload, and
evaluate their operands once in source order. No competing `select` arm may
consume a value after another arm has won. For bounded channels, full and empty
states imply backpressure; capacity zero requires a rendezvous, not buffering.
Cancelling a waiting task must detach its pending registration exactly once,
refund its uncommitted admission quota, and leave the channel contents
unchanged when the cancellation wins before commit. Committed ownership
transfers must not be rolled back. Closing a channel must settle/fail its
pending operations without leaving suspended continuations or losing committed
buffered data. `nb` does not make admission quotas unbounded.

A pending operation saves typed locals, continuation position, cleanup/defer
state, ownership/borrow state and actor generation; completion re-enqueues the
continuation on the proper scheduler lane. It must **never** run guest code in
the producer, reactor or Future completion callback. Do not carry live
`critical-write` loans, mutex guards or otherwise unproven mutable borrows
across a channel suspension. Callers must have a checked suspension effect or
a verified resumable task path; a legacy direct evaluator that cannot resume
must fail closed rather than park an actor worker.

### Directional channel shorthand (target)

The historical Java numeric double-angle shift and existing-local assignment forms are migration-only observations. The current [directional I/O contract](../language/io-direction-shorthand-v1.md) governs: source >> val item and val item << source bind one checked read, and sink << value performs one checked write. Integer shifts use the separately specified triple-angle operators. Keep read/write checked outcomes, capability, suspension and ownership checks; do not infer a continuous pipe or unchecked reassignment. See [prefix/postfix read contracts](../language/postfix-channel-read-expression-v1.md). Backend-specific lowering still needs compiled evidence.

### Conformance gates

- Exact parse/typecheck/guest execution of plain, `nb`, `try` and `do`
  forms for ready, empty, full and capacity-zero channels; both command and
  parenthesized intrinsic forms
- Prove suspension releases scheduler carriers and resumes under the original
  execution context; nested `suspends` frames and actor-owned continuations
- Concurrent writers/readers, select arbitration, strict one-commit semantics,
  payload ownership transfer and no phantom delivery on failure
- Cancellation versus admission, closing/teardown versus resume, quota
  exhaustion and fairness under adversarial schedules
- Reject `do nb` silent Future discard and suspend-across-critical-loan;
  preserve legacy integer-shift behavior only in its explicitly selected migration profile
- Record backend-specific fixture and CI run links; parser-only acceptance
  never counts as runtime parity

**Verified Java/JVM baseline (2026-11-17):** `oreslang-source.java`
PR [#3170](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/3170)
at exact head `9ba62afe639e1e431ab4f6d3e34a18c4cb137a8d` admits
`do readch/writech` via the existing cooperative SourceTask channel path.
An alternate private token-free CI mirror verified all 315 production-source
blob SHAs and three relevant test files (319 pinned paths including `pom.xml`).
[Run #44201622299](https://github.com/quaestor-ledger-test/atto-ci/actions/runs/44201622299)
passed 14 JVM guest/channel tests (6 new, 8 existing) with zero
failures, errors or skips. The production compiler change is **in review,
not merged**; the run was focused rather than full-repository, Native Image
AOT or multi-backend conformance. Channel `<<`/`>>` remains
**TARGET / NOT IMPLEMENTED**, tracked by
[issue #3171](https://github.com/ores-truffle-oreslang/oreslang-source.java/issues/3171).

### Static select: Future by default (TARGET, 2026-11-25)

The approved static expression form is nonblocking by default.
This supersedes the older blocking-by-default value expression and the
canonical `nb select` spelling. No backend is certified by this change.

| Form | Result and control boundary |
| --- | --- |
| `select { ... }` / `select over ... end` | Future<T>; infer the common arm result type T |
| `select<T> { ... }` / `select<T> over ... end` | Future<T>; check every reachable arm against T |
| `await select ...` / `await select<T> ...` | T; ordinary await of the same Future, cooperatively suspending the caller |
| `nb select ...` / `nb select<T> ...` | Deprecated alias for select; identical type, effects and runtime behavior |
| `do select ...` | Existing explicit procedural statement: caller-local return/break/continue and cooperative wait; not a detached Future discard |
| `try select ...` | Immediate probe, no pending registration on a miss; static result shape remains separately gated |
| `do nb select ...` | Legacy detached Java statement only; migrate to tracked Future<void> |
| `do try select ...` | Not admitted in current Java grammar |

The generic argument is the arm result, not a channel payload or Future
wrapper. Exactly one angle-bracket type argument is allowed. Nested types
use ordinary generic parsing; no select-specific square-bracket generic
syntax. Explicit T, inferred arm type and expected Future<T> must agree.
No implicit await, implicit Future flattening, or value coercion merely
because the surrounding binding expects T. An expression return supplies
the Future result, never the surrounding callable's return, including when
the expression is immediately awaited.

```atto
val Future[int] pending = select over
    when readch incoming: int value -> {
        return value * 2;
    }
end;

val int result = await select<int> over
    when readch incoming: int value -> {
        return value * 2;
    }
end;
```

The examples are independent operations; do not evaluate both against one
single-use message unless two reads are intended. `await` is legal only in
an admitted `suspends` context. Explicit generic result typing also works
with braced syntax and policy modifiers after the type argument. Void arms
can yield a tracked Future<void>; success, failure and cancellation remain
observable. A selected guest arm must not execute inline during registration,
even if default or a ready source wins immediately. Future completion waits
for the winning arm and eligible cleanup. No orphaned operation on dropped
Future; require structured ownership or an explicit approved supervision path.

The existing explicit procedural `do select` remains separate from the
expression change pending any further decision about its spelling.
Do not silently reinterpret historical bare blocking select statements.
Migrate them to the explicit procedural form after checking return scopes,
or use await of a Future when the arm returns a value. Legacy detached nb
statements need explicit lifecycle migration, not token deletion.
The deprecated alias applies to tracked expressions, not historical
detached behavior. The dynamic select-from migration follows the proposed
contract below; existing calls require an explicit migration, not silent
type changes.

### Dynamic selection plans (TARGET, proposed hardening)

| Form | Proposed result and control boundary |
| --- | --- |
| `select [policy] from plan` | Future<R>; returns without logically suspending the caller |
| `await select [policy] from plan` | R; ordinary cooperative await |
| `nb select [policy] from plan` | Deprecated tracked alias for the same Future<R> |
| `try select [policy] from plan` | Option<R>; immediate probe; no pending waiters on a miss |

R is the selection result, not the payload of an arbitrarily chosen
channel. Preserve the existing ordinal result for immutable plans; a
keyed dynamic plan needs a typed result with stable key, ordinal within
the captured snapshot and structural version. Exact public type names
and generic arguments for heterogeneous payloads remain a separate
decision. Do not silently unwrap or flatten Option or Future values
when migrating old source; reject incompatible bindings. The target
table is not a claim of backend implementation. Empty-plan, all-closed
and default-only outcomes must receive common explicit diagnostics or
result contracts before cross-backend promotion; never spin on an
impossible selection.

**Plan vs invocation.** A reusable plan owns inert case descriptors,
not live registrations, a winner, a continuation or a cancellation
token. Evaluate and validate operands once per construction or mutation.
Snapshot ordered keys and descriptors at selection invocation; replacing
or deleting a key cannot retarget a pending selection. Copy input
containers without retaining mutable aliases; retained keys must have
stable immutable value identity. Validate ownership, domain and
capability constraints before any effectful arm commits, including
after a channel changes capability. Failed mutations cannot change
keys, descriptors, version or cursor. A successful structural mutation
publishes one new version without wraparound. Bound plan size and
pending registrations independently, including retained snapshots.

**Arbitration.** All cases compete for one commit in the authoritative
channel/Future coordinator. A successful read or write is irrevocable;
losers must not consume, enqueue or transfer ownership. Duplicate
channel/Future cases cannot create multiple commits. FAIR credit is
generation-local and advances only on committed non-default winners;
an immediate miss, failure before commit, default or cancellation
before commit does not advance it. Same-generation concurrent
selections observe authoritative FAIR state at arbitration, not a
private stale creation-time cursor. A late old-generation winner
cannot overwrite the newer generation's cursor. FIRST preserves
captured order, RANDOM uses the backend's admitted random policy.

**Lifetime and effects.** Registration and cleanup are bounded by the
owning task/actor/tenant. Stop, cancellation and generation retirement
revoke losing waiters exactly once, release all quotas and prevent
stale guest callbacks. Cancellation after commit cannot roll back
the committed channel operation. Retained descriptors cannot capture
lexical borrows or unrepeatable move-only write payloads; no implicit
cross-domain transfer of a plan or captured capability. Do not cancel
a shared Future producer merely because its select listener lost.
An unawaited Future requires tracked ownership; no detached discard.
Whether ordinary select starts registration eagerly or on first await,
and repeated-await semantics, must be specified explicitly before
promotion; neither choice may change the invocation snapshot or allow
double commitment. No OS-thread parking or guest execution on
producer/reactor threads.

**Optimization.** Reuse immutable versioned descriptors and proven
loop-invariant expressions; never reuse live waiters or completion
authority across invocations. Measure allocations, retained bytes,
registration latency and fairness on actual guest runs. Layout choices
(AoS, SoA, slabs) are not observable language ABI. Cache invalidation
must respect actor/tenant generation and hot reload.

A cache may own one descriptor reference for the current generation and
share that immutable descriptor block across arbitrarily many independently
admitted invocations. Structural mutation invalidates the cache, not any
in-flight reference; retired generations retain independent FAIR state.
Release the generation and descriptor storage only after its final owner
retires. No recycled storage address is a valid completion identity: retain
an invocation-specific non-reusable token or checked generation until late
callbacks cannot observe recycled state. Quota accounting counts pending
invocations even when they share one descriptor block. Admission failure
must not consume data, increment pending accounting or change FAIR credit.
A normal winner, cancellation, timeout, actor STOP and failed registration
must converge on one retirement transition. Cancellation and commit compete
at the same linearization boundary; only the winning transition may release
its resources. Benchmark cache hits separately from mutation, and measure
whole-runtime task/Future/result allocations separately from descriptor
allocation. A zero-copy descriptor path is not a zero-allocation runtime
claim.

**Promotion gate.** Require compiled guest positive and negative
fixtures for list/map construction, stable keys under replace/remove,
same/old-generation overlapping FAIR operations, duplicate cases,
rendezvous, cancellation before/after commit, close/drain, dropped
Future, stale actor generation, quota rollback, capability changes
and no implicit await. Check exact source head/tree, actual executed
compiler and guest steps, native AOT where applicable, and independent
review. Unsupported variants fail closed before code emission; a
host-only model or zero-step CI does not certify guest behavior.

Only the enclosing select specifies wait mode and policy. Both delimiters
have identical semantics. Require at least one arm, at most one default
(last), one slim arrow rather than fat/repeated arrows. Reject per-arm nb/try
read/write, and do select from cases. Evaluate case operands once in source
order, commit one winner, preserve losing data and detach losing waiters.
An already-started Future's producer effects are not rolled back. Cancellation
before commit detaches registrations; after commit never rolls back ownership.
Generation-fenced guest continuation, cleanup, quota and cancellation must
hold even across STOP/restart. No carrier parking and no eager guest callback
on producer/reactor threads. FAIR is default; FIRST/RANDOM remain opt-in.

The existing Java value/void Future integrations (#696/#973) need forward
porting under this contract, not whole-file transplant. Require exact-source
compiler and guest tests for typed/inferred/alias/await forms, wrong result
type, missing result, illegal await, no silent discard, lifetime and STOP
races, plus formatter round-trip and native AOT across the compiler targets.
Unsupported forms must fail closed before emitting code. Existing parser
compatibility and runtime tests do not establish this new feature.

Counted selection and optional continuous selection are defined as a target in [counted select v1](../language/counted-select-v1.md). Counted forms return Future<Array<T>>, with explicit await for collection.

`process.stdout` / `stderr` / `stdin` and `stdio.out` / `err` / `in` are channel-style standard streams by design; `stdio.in.stream()` and `Observable.from_ch(stdio.in)` are target adapters. Network stream framing and backpressure are part of the contract, not consequences of merely using a Channel type.

The [immediate channel probe target](27-channel-immediate-probes.md) replaces the historical Boolean guest-write probe with a typed recoverable ownership result; `try readch` remains `Option<T>` with closed/drained failure. This is a target, not cross-backend proof.

## Scheduling guarantees

- Actor DATA turns and Task continuations use bounded scheduling, cancellation fencing, and **cooperative reductions/time budgets**.
- `rt cooperate` is a fairness checkpoint; compiler-inserted checkpoints for loops and expensive operations are desirable. A watchdog may detect noncooperation, but cannot guarantee safe preemption in arbitrary native code.
- Ordinary actors permit concurrent guest turns subject to verified state loans and bounded scheduler capacity. Conflicting access to the same region is excluded by `critical-read`/`critical-write`; `define serial actor` additionally permits at most one active guest turn. See [chapter 22](22-concurrency-and-shared-ownership.md).
- CONTROL wakeups must have reserved scheduling capacity without starving ordinary DATA.
- Actor logical affinity is not equivalent to OS CPU pinning. Affinity spill and work stealing must preserve safety and progress.
- `await` of I/O must not execute guest code inside a reactor or completion callback.

## Worker pools and boot topology

The runtime **design goal** is a minimal bootstrap of approximately two explicit service threads, one reactor/event loop and one supervisor/main control path, with shared, isolated/private and untrusted actor worker pools **populated lazily** on first eligible actor creation. Creating an actor in an empty pool should arrange at least one worker in that domain when needed.

This is **not a portable guarantee of exactly two process threads**: JVM, CLR, GC, JIT, host embedders and OS runtimes can create internal threads. Task capacity, actor count and worker count are independent. Pool sizes must respect detected processor/cgroup budgets where feasible and use bounded admission rather than spawning one OS thread per actor. Real-time profiles may require preallocation instead of lazy workers.

## Asynchronous-only I/O

Normal hosted I/O returns `Future<T>` or another explicit asynchronous result and is driven by kernel readiness/completion rather than blocking an actor worker. Canonical async operations need not carry an `_async` suffix. If a *source-level blocking convenience* exists, its name must end in `_blocking` and it still suspends the logical task instead of parking an actor carrier. An `_async` suffix is optional for ordinary async API names. Native syscall semantics must be verified separately; moving a blocking syscall to a worker thread is not equivalent to genuine nonblocking I/O.

## Failure and cancellation

Cancellation is a structured control effect, not a normal `throw` to be swallowed by `catch`. It must release owned message slots, wake waiters, settle or fence Futures and Tasks exactly once, run eligible cleanup, and delay resource reclamation until native operations physically retire. This includes timer, socket, channel and actor shutdown races.


## Pull/push reactive admission target

[Reactive admission](23-pull-push-and-lazy-collections.md) separates synchronous pull, demand-controlled push, one-shot Future receipts and graph pipes. Terminal choices are irrevocable and physical ACK debt remains charged after logical termination.


## Browser carrier mapping

A [browser tenant Worker](23-browser-compiler-profile.md) can host multiple actors but must keep separate actor memories and bounded continuations. TaskFuture and inline task contracts remain independently gated.
