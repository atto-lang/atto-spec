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

### Static select: expression versus procedural statement (TARGET)

The static form arbitrates one set of channel/Future operations. The following
target reconciles the Java static-select contract with the language-level
statement/expression distinction. It is not a certification of any backend.

| Form | Result and control boundary |
| --- | --- |
| `select { ... }` / `select over ... end` | Value expression of a common arm type T; arm return supplies the result, not a callable return |
| `do select { ... }` / `do select over ... end` | Procedural statement; return exits the enclosing callable, break/continue target its lexical loop |
| `nb select { ... }` / `nb select over ... end` | Tracked Future<T> settled only after the selected arm and its cleanup finish |
| `try select` | Immediate probe; no pending registration on a miss; static result/return shape needs a separate decision |
| `do nb select` | Legacy detached Java statement only; target migration is an observed Future<void>, not silent result discard |
| `do try select` | Not admitted in the current Java grammar |

The canonical target uses the space-separated `nb select` spelling. Any
hyphenated legacy spelling requires explicit migration evidence. The previous
`do select<T>` example contradicted procedural return semantics: a typed result
belongs to the expression form. Explicit `select<T>` is a separately gated
syntax proposal; do not infer support. The following examples use the current
Java arm spelling, with result assignment shown as target syntax:

```atto
do select over
  when readch updates: int value -> {
    if value < 0 then
      return -1;
    fi
    process(value);
  }
  default: -> {}
end

val int result = select over
  when readch updates: int value -> { return value; }
  default: -> { return 0; }
end;
```

Only the enclosing select specifies its wait mode and policy; do not perform
independent eager read/write operations to form an arm. Both delimiters preserve
identical control and arbitration semantics. A static selection has at least
one arm and at most one default, last; executable arm arrows are slim
`->`, never `=>` or repeated arrows. `among` is not part of the current
Java delimiter contract. Legacy arrowless arms and `case` are compatibility
syntax, not new semantics.

Dynamic `select from cases` returns a selected outcome (or a corresponding
Future/probe outcome). Reject `do select from cases` and `do nb select from
cases`: silently discarding the outcome could discard an admitted message.

Select operands evaluate once in source order; only one arm commits, losing
read/write arms have no channel effect, and only the winning arm runs.
Observation of an already-started Future does not undo its producer's effects.
Cancellation before commit detaches all waiters; cancellation after commit
must not roll back transferred ownership. Deferred guest code must run on its
own authorized scheduler lane, not inline on an I/O completion thread.
Actor stop/restart fences late continuations by generation and must settle
tracked results exactly once. Cleanup and non-escaping ownership remain
mandatory through suspension, return, failure and cancellation. Default
dispatch must not register a waiter; explicit priority/random and default fair
selection require backend-specific conformance tests.

Current Java main preserves bare statement and detached nonblocking forms for
compatibility. The value-expression and tracked completion integrations
([Java #696](https://github.com/atto-lang/atto-source.java/pull/696),
[Java #973](https://github.com/atto-lang/atto-source.java/pull/973)) remain
separately gated; do not merge historical parser/runtime files wholesale.
Require exact-head guest execution, negative parser/type/ownership fixtures,
return/defer and actor STOP races, native AOT and formatter round-trip proof.
Backends without checked lowering must reject unsupported forms before code
emission. Host runtime tests alone do not establish source parity.

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
