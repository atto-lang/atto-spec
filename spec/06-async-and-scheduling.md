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
| `try writech ch, value` | `bool` | Return `false`, **without registering** |
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

### Channel shift-operator shorthand (TARGET, NOT IMPLEMENTED)

`<<` and `>>` are **already integer shift operators** in the Java source
compiler. Channel overloading must therefore be type-directed, never an
unconditional parser rewrite or an accidental bitwise fallback.

Proposed contextually typed statement aliases (pending separate compiler
implementation and executable conformance fixtures):

```atto
output << payload;       // writech output, payload; may suspend
input >> mutable_slot;   // readch input, then assign into a writable lvalue
```

Only a statically known `Channel<T>` (or a specifically admitted directional
channel capability) on the left qualifies. `<<` requires a `T`-compatible
payload. `>>` requires an addressable, mutable, `T`-compatible lvalue on the
right; do not evaluate it as an arbitrary value expression or mutate it before
the read commits. Numeric operands retain ordinary integer-shift semantics.
Invalid or ambiguous operand combinations must fail at compile time. Both
channel aliases inherit the same suspension, closure, cleanup and ownership
rules as plain `writech`/`readch`, not `nb` or `try`. Until this lowering
is verified, use the explicit channel keywords.

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
  preserve integer `<<`/`>>` until type-directed channel lowering is proven
- Record backend-specific fixture and CI run links; parser-only acceptance
  never counts as runtime parity

**Observed Java baseline (2026-11-17):** `oreslang-source.java` has
`SourceChannelCooperativeBackpressureTest` exercising pending read and write
resumptions and `ChannelLanguageCombinationTest` exercising `nb` Futures.
A new draft branch adds `do readch/writech` parser lowering and targeted
tests; neither this branch nor channel `<<`/`>>` is claimed as merged or
five-backend verified.

Channels are typed and capacity-bounded. `readch` and `writech` operations obey ownership transfer, closure, cancellation and fairness. `select` observes readiness and chooses one admitted case, without silently losing a message. `nb-select` (or admitted compatibility `nb select`) does not block the underlying worker. Typed `select<T>` must produce a `T`-compatible result from each value arm; a `do select` with `return` exits the enclosing callable where admitted.

```atto
do select<int> over
  readch updates as value -> value
  after timeout -> 0
end
```

This is proposed syntax; exact arm grammar and timeout handling need compiler fixtures. Blocking `readch` is not allowed inside a nonblocking select arm unless an explicit typed adapter exists.

`process.stdout` / `stderr` / `stdin` and `stdio.out` / `err` / `in` are channel-style standard streams by design; `stdio.in.stream()` and `Observable.from_ch(stdio.in)` are target adapters. Network stream framing and backpressure are part of the contract, not consequences of merely using a Channel type.

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
