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

### Static select: Future by default (TARGET, 2026-11-26)

This supersedes the blocking-by-default expression contract. Constructing a
selection must not suspend the caller; awaiting its Future may suspend.

| Form | Result and effect |
| --- | --- |
| `select { ... }` / `select over ... end` | Future<T>, where T is the common arm result |
| `await select ...` | T, ordinary Future await in a checked suspends context |
| `nb select ...` | Deprecated tracked-expression alias, equivalent to select |
| `do select ...` | Existing procedural control form; migration unresolved, not silently reinterpreted |
| `try select ...` | Immediate probe; result shape separately gated |

```atto
const Future selection = select {
    when readch incoming: int value -> { return value; }
};
const int result = await selection;
```

Typed Future<T> uses angle brackets. Explicit select<T> and counted select
are tracked separately in #254; this correction does not certify those
extensions. Reject implicit unwrapping into T. A selected arm's return
settles its Future, not the enclosing callable. No silent discard of an
unsettled operation. Legacy detached nb statements and procedural/dynamic
select require explicit migration, not blind token replacement.

Evaluate operands once in source order; exactly one case commits.
Losing reads/writes must not consume or publish; observing an independent
Future does not undo its producer effects. Cancellation before commit
detaches waiters; after commit it cannot roll back transferred ownership.
Default must not leave registrations. Guest arms and cleanup execute only
on their authorized scheduler lane, with generation fencing and bounded
admission. No carrier parking, no implicit task/thread creation merely
to implement awaiting. Future result settles after the selected arm and
eligible cleanup. Eager versus lazy registration and repeat-await for
affine results remain open; do not silently choose incompatible policies.

### Callable await, channels and actor boundaries (TARGET)

```atto
const int v = await || -> 33;
const fnc work = await ch.receive();
const fnc other = << ch;
const fnc third << ch;
```

Awaiting a zero-argument callable invokes it once and yields its result;
receiving a callable does not invoke it. These three receive spellings
denote the same operation (independent reads if all are executed).
Require equivalent types, checked outcomes, suspension effects,
cancellation and ownership. A plain integer is not made awaitable by
this rule; callable argument binding and returned-Future flattening need
explicit type rules.

Ordinary channels may carry transfer-safe callable values; discourage
with a suppressible lint, not a blanket prohibition. Reject unsafe
captures. Actor mailbox channels and any cross-actor channel transport
must reject callable payloads transitively, including erased, boxed,
nested and bound method values. Ownership transfer cannot waive this
restriction. Runtime boundary checks must fail closed when static
information is unavailable.

### Spawn and suspension effects (TARGET)

Bare spawn may suspend during allocation/admission. Awaited spawn must
provide complete actor readiness information; the proposed readiness
fence includes successful init, identity, mailbox, generation and
supervisor association, without exposing private state. Failure,
cancellation and restart races need explicit terminal semantics.

Track suspension transitively through calls, channel operations and
cleanup, rather than scanning for await tokens. Preserve checked
suspends contexts, loan fences, actor scheduling policy and AOT lowering.
Critical acquisition, generator yield, rt cooperate and scope-exit
cleanup have distinct effects; unresolved policy must not be treated as
confirmed syntax changes. Existing readch/writech are not deprecated by
this correction.

### Required evidence

Compile and execute the same positive/negative source fixtures across
Java, LLVM, .NET, Wasm, JS, Rust, Forge, Cranelift and applicable
self-hosted/realtime/HDL profiles. Unsupported features must reject before
artifact publication. Include ready/pending select, one winner and losing
data, cancel/commit races, actor restart, callable invocation once,
receive-only callable, nested/erased mailbox rejection, unsafe capture,
spawn init failure, suspend-across-loan negatives and AOT. Record exact
head/root tree, executed build/test steps and guest output. Host-only
oracles are supplementary. Zero-step CI is not evidence.

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
