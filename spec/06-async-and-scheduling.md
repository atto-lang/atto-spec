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

Inside an `nb { }` block, `return` completes **the Task**, not the enclosing callable, and postfix `?` likewise exits the Task body ([chapter 02](02-types-and-patterns.md)).

`do nb { ... }` explicitly discards a Task handle but not its supervision obligation. A Task has a structured parent, may be cancelled, and must not capture mutable actor state or escaping stack borrows. `await task` joins its result and consumes the handle ([chapter 04](04-ownership-and-memory.md)); a Task is not an actor and has no default mailbox.

For a detached `do nb` Task (TARGET, S-51): its parent scope MUST NOT complete (and an actor turn's owned resources MUST NOT retire) until the detached Task has settled or been cancelled and fenced. An unhandled throw, raise or panic in a detached Task is delivered to the parent scope as that scope's own failure, under the same precedence as [chapter 07](07-errors-and-failure.md). It is never silently dropped, and it is never turned into success because nobody kept the handle.

## Channels, select and backpressure

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
- An actor normally runs at most one *conflicting* physical guest turn at once. A reader-sharing extension requires verified state loans and an explicit per-actor capacity contract.
- CONTROL wakeups must have reserved scheduling capacity without starving ordinary DATA.
- Actor logical affinity is not equivalent to OS CPU pinning. Affinity spill and work stealing must preserve safety and progress.
- `await` of I/O must not execute guest code inside a reactor or completion callback.

## Worker pools and boot topology

The runtime **design goal** is a minimal bootstrap of approximately two explicit service threads, one reactor/event loop and one supervisor/main control path, with shared, isolated/private and untrusted actor worker pools **populated lazily** on first eligible actor creation. Creating an actor in an empty pool should arrange at least one worker in that domain when needed.

This is **not a portable guarantee of exactly two process threads**: JVM, CLR, GC, JIT, host embedders and OS runtimes can create internal threads. Task capacity, actor count and worker count are independent. Pool sizes must respect detected processor/cgroup budgets where feasible and use bounded admission rather than spawning one OS thread per actor. Real-time profiles may require preallocation instead of lazy workers.

## Asynchronous-only I/O

Normal hosted I/O returns `Future<T>` or another explicit asynchronous result and is driven by kernel readiness/completion rather than blocking an actor worker. Canonical standard-library async operations carry **no** `_async` suffix. An `_async`-suffixed name MAY exist only as a compatibility alias that denotes exactly the same operation and type as its unsuffixed name; two different operations MUST NOT differ only by that suffix. If a *source-level blocking convenience* exists, its name must end in `_blocking` and it still suspends the logical task instead of parking an actor carrier. Native syscall semantics must be verified separately; moving a blocking syscall to a worker thread is not equivalent to genuine nonblocking I/O.

## Failure and cancellation

Cancellation is a structured control effect, not a normal `throw` to be swallowed by `catch`. It must release owned message slots, wake waiters, settle or fence Futures and Tasks exactly once, run eligible cleanup, and delay resource reclamation until native operations physically retire. This includes timer, socket, channel and actor shutdown races.
