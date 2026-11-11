# 23 — Pull/Push Collections, Lazy Fusion, and Bounded Reactive Admission

**Status: TARGET amendment / NOT BACKEND CERTIFIED (2026-11-10).** This is an interoperability and conformance target, not evidence of shipped APIs. Additive to [ownership](04-ownership-and-memory.md), [async/channels](06-async-and-scheduling.md), [conformance](11-conformance.md), and [shared ownership](22-concurrency-and-shared-ownership.md). Preserve the exact shared Java/LLVM `contracts/v1/observable-stream-channel.md` terminal wire contract. Illustrative API shapes are not claims that they currently compile.

## Cardinality and control

| Type | Producer/consumer contract | Bounds and ownership |
| --- | --- | --- |
| `Iterator<T>` | Synchronous pull; `next()` produces on request | No work ahead of demand, no hidden intermediate collection |
| `AsyncIterator<T>` / `ReadableStream<T>` | Asynchronous pull; one exclusive reader lease | Finite pending reads, retained bytes and native loans |
| `Observable<T>` | Push; cold/hot semantics explicitly defined | Bounded RELIABLE/LATEST/LOSSY strategy, owned subscription |
| `Flow<T>` / `Subscription<T>` | Push with `request(n)` demand credits | No NEXT without credit; finite outstanding credits and in-flight budget |
| `Channel<T>` | Typed unicast transfer; `readch`/`writech` | Capacity 0 rendezvous, or finite FIFO buffer and waiter quota |
| `Future<T>`, `Task<T>`, `TaskStep<T>` | One result, eager structured task, lazy single-use task | Distinct from streaming and one another |

`Flow` is a proposed library interface name, not a new keyword or a certified runtime type. Functional `|>` and actor `pipe` retain separate meanings. Methods use `snake_case` (`try_send`, `from_ch`, `map_err`) and must allow full AOT without JIT-only dynamic dispatch.

Multiple readers of one channel are work-sharing, never implicit broadcast. `Observable.from_ch(ch)` must not silently create independent subscriber cursors: prefer one exclusive subscription; explicit competing-consumer mode may enable work-sharing. Broadcast requires per-subscriber bounded buffers/credits/slow-consumer policies. `stdio.in.stream()` obeys the same reader-lease and cancellation rules.

## Required invariants

1. **Linear ownership admission.** Successful `try_send` transfers exactly one owned `T`. Failed full/closed/quota/cancel-before-commit/stale-generation admission returns the same owned `T` inside a typed failure, with no implicit copy/drop. Once admitted, cancellation cannot revoke a committed envelope. Admission ACK is not handler completion, I/O flush, remote receipt or physical retirement.
2. **Borrow and capability safety.** `rt take` moves; `rt copy` requires Copy; `rt share` requires validated shared/frozen rights. Stack loans, actor-state loans, callbacks and `rt borrow mut` cannot escape lazy closures, suspension, isolated actors or lifetimes without proven pinning/alias safety. `Sendable` does not imply `Serializable`. Reject unsupported effects before emitting IR.
3. **Whole-graph bounded memory.** Account slots, bytes, checked-out/unacknowledged payloads, in-flight continuations, producer/consumer/select waiters, serialization/copy buffers, callback queues and multicast fanout. Before pulling upstream or retaining a producer waiter, reserve downstream capacity. A bounded queue with unbounded pending Tasks is not bounded memory.
4. **Finite demand.** `request(n)` rejects zero/negative/fractional/overflow/over-quota requests without changing state. NEXT consumes exactly one credit; terminal signals do not. Credits are per subscription and distinct from the actor's DATA/CONTROL reservations. Zero-capacity channel means a committed rendezvous, not a hidden capacity-one queue.
5. **Terminal and cancellation order.** Preserve the four-way consumer signal `Result<Option<T>, Option<E>>`: `Ok(Some(value))` NEXT, `Ok(None)` COMPLETE, `Err(None)` CANCELLED, `Err(Some(error))` ERROR. Nested Option/Result payloads remain ordinary data. Graceful close drains committed FIFO values; ERROR/CANCELLED settle undelivered queued values exactly once. Physical loans stay charged until acknowledged/retired; no double refund or stale-generation resurrection. Terminal publication is a one-winner linearization: once COMPLETE is committed, later cancellation MUST NOT turn it into CANCELLED or discard its committed FIFO payloads; once CANCELLED wins, later COMPLETE MUST NOT resurrect the stream. A terminal producer decision is distinct from consumer acknowledgement, so existing checked-out payload loans remain charged until physical ACK.
6. **Scheduling and supervision.** Atomic readiness-registration vs slot release, finite waiter cohorts, deterministic FAIR select, no guest callback under locks or on reactor threads, cooperative scheduling budgets, serial actor self-send deadlock denial, CONTROL headroom, generation-fenced restart and teardown.
7. **Lazy fusion and drop behavior.** Pure `map`/`filter`/`take` can fuse without allocating intermediate arrays and must drop discarded owned values exactly once. `collect`, sorting, windows, replay, concurrency, multicast and stateful transforms need explicit finite memory strategy. "No intermediate collection" does not imply zero allocation/GC on managed backends; native zero-tracing-GC requires allocator and sanitizer evidence.

## Conformance gates

- **Parser/formatter/borrow checking:** same-source positive and negative `.atto` cases for iterator types, `|>` vs actor `pipe`, loan escape, use-after-take, illegal `rt copy/share`, missing effects, sealed actor state.
- **Pull/lazy:** 0/1/N/infinite lazy sources, early exit, nested Option/Result and typed `collect` memory/drop behavior.
- **Channels:** capacity 0/1/N, FIFO, waiting producers, bounded slots/bytes, max waiters, atomic select winner/loser, failed sends retaining ownership and close races.
- **Push/demand:** zero/invalid/overflow requests, no unsolicited NEXT, hot/cold semantics, finite overflow policy, exclusive single reader, explicit work-sharing and broadcast, slow-subscriber isolation.
- **Cancellation/supervision:** before/after commit, callback self-cancel, late completion, exactly-once drops, quiescence and generation tickets, reserved actor CONTROL delivery.
- **Security and allocation:** forged or wrong-domain handles, mutable shared pointer, oversized payload graph, cancellation of native I/O, measured fusion/no-GC claims.
- **Evidence:** identical `.atto` fixture blob SHA, precise diagnostics and real guest execution for Java/GraalVM, LLVM native AOT, Wasm, Forge and .NET Native AOT; native sanitizer traces and source/runner attestations. Host/reference model tests alone never satisfy guest parity.

The [bounded source-free reference model](https://github.com/atto-lang/atto-rx-channels/pull/3) demonstrates a narrow single-threaded admission protocol, with 10 locally executed Node tests; it is not an AttoLang compiler, scheduler, production mailbox, real borrow checker or AOT proof. Backends without the relevant runtime intrinsics must reject unsupported constructs rather than silently approximate them.
