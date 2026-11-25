# Iterator, async iterator, Stream and lazy pipeline contract v1

**Status: candidate normative specification, NOT implemented backend parity.**

Related prior work: atto-common-source/docs/GENERATORS_V1.md defines lazy generator activation and generator cleanup; atto-common-source PR #82 specifies async close. Atto-spec PR #31 defines Iterable, collection slice and spread semantics. Atto-spec PR #45 defines directed continuous pipe/rpipe graphs. This proposal specializes their iterator and stream combinator behavior without superseding any of those rules.

## Four capabilities, never implicitly interchanged

| Type | API | Semantics |
| --- | --- | --- |
| Iterable<T> | iter(): Iterator<T> | A source from which a cursor is obtained; repeatable only when the type promises it |
| Iterator<T> | next(): IteratorResult<T>; close(): void | Linear single-consumer synchronous pull |
| AsyncIterator<T> | next(): Future<IteratorResult<T>>; close(): Future<void> | Linear single-consumer async pull, at most one pending next |
| Stream<T> | async_iter(): AsyncIterator<T> | Checked, typed, demand-driven readable endpoint with bounded transport/adapter |

IteratorResult<T> is a tagged yielded(T) or done. Never encode exhaustion as null, None or Err: all three may be *data*. Normal DONE and failures are sticky, and never re-enter a producer. A failure remains observable on subsequent pulls until explicit close. A closed iterator cannot resume. Generator calls construct a lazy activation, executing nothing before the first pull. async gen* and suspend gen* return AsyncIterator<T>, not Future<AsyncIterator<T>>. A synchronous generator cannot implicitly block on an async source.

Stream<T> is NOT an Iterable<T> collection, rewindable cursor, implicit multicast bus or writable sink. Calling async_iter() acquires one exclusive destructive read lease. To broadcast, a separate explicit tee/multicast adapter MUST specify its subscriber queues, boundedness, ownership and lag policy. Closing a nonowning view cancels its pending receive, not the underlying borrowed Channel<T>. Owned resources close under their owning scope.

## Typed operations: lazy adapters versus terminal consumers

| Operation | Iterator<T> | AsyncIterator<T> | Stream<T> | Evaluation |
| --- | --- | --- | --- | --- |
| map(f: borrow T -> U) | Iterator<U> | AsyncIterator<U> | Stream<U> | Lazy, one callback per received element |
| filter(predicate: borrow T -> bool) | Iterator<T> | AsyncIterator<T> | Stream<T> | Lazy, may pull many values for one accepted value |
| take(n), skip(n) | Iterator<T> | AsyncIterator<T> | Stream<T> | Lazy, nonnegative checked count |
| flat_map(f) | Iterator<U> | AsyncIterator<U> | Stream<U> | Explicit one-layer, ordered, sequential delegation |
| fold(init: U,f) | U | Future<U> | Future<U> | Terminal, sequential left reduction |
| collect(max_items=n) | Result<List<T>,CollectError> | Future<Result<List<T>,CollectError>> | Future<Result<List<T>,CollectError>> | Terminal, bounded materialization |

All adapters construct their stage descriptors without executing callbacks or obtaining source data. Downstream demand controls upstream pulls. The source is evaluated once, callbacks run in order once per item they inspect, and no stage may reorder user effects. A filter scanning many nonmatching elements must honor scheduler cooperation checkpoints without spawning work for every rejection. No default prefetch, detached pump or unbounded cache is permitted. A synchronous map/filter callback producing a Future must be rejected: a separately named map_async/filter_async would be necessary for async callbacks. No implicit flattening by map or await; flat_map removes exactly one declared iterator layer. The generic APIs do not introduce a Monad, dynamic method operator overloading or runtime reflection.

Unknown-length iterators and streams require a nonnegative, checked max_items argument to collect. Known finite collections may provide a proved bound. After exactly max_items retained items, collect may pull ONE extra value to detect overflow, but must destroy that overflow value and every retained unpublished element exactly once, close upstream, and return CollectLimitExceeded rather than a silently truncated success. Use take(n).collect(max_items=n) to request truncation explicitly. fold need not allocate proportional to input size and might not terminate on infinite sources without a deadline or take.

~~~atto
val result = samples.iter()
    .filter(|number| -> number > 0)
    .map(|number| -> number * 2)
    .take(100)
    .collect(max_items=100);

val iterator: AsyncIterator<Event> = events.async_iter();
for await const event of iterator {
    process(event);
}
await iterator.close();
~~~

These are target source examples, not proof that a particular compiler accepts them. A callable with an explicit named nonvoid return still requires return or ^; lambda expression bodies follow their independently established rules. All callable names remain snake_case.

## Ownership-safe elements and cleanup

Each stage owns its cursor capability. Normal nonprimitive callback parameters are readonly loans by default under implicit-argument-borrow-v1. Neither a map nor filter callback may leak that loan, move an owned item through a borrowed parameter, or synthesize Shareable/Sendable authority. Move-only transformations require a separately statically proven consuming-callback mode. Unsupported owned callbacks must be rejected; never implicitly clone, share or leak a graph. Existing take!, copy!, copy!!, share!, drop!, freeze! and critical-region checks continue to apply. A borrowed slice iterator cannot outlive its backing store, cross a suspension boundary without a proven lifetime or escape an actor critical-read/write region.

A value handoff is committed only after a successful receiving slot or buffer admission. An uncommitted producer retains the item until it is accepted or released once on cancellation. A committed ownership move cannot be rolled back by cancellation. Failure, overflow, early break, cancellation, delegated-iterator failure, and normal exhaustion run finally/defer/delegate close and release staged elements/borrow loans exactly once. Panic remains supervisor CONTROL, not a recoverable ordinary item error. Option.None and Result.Err elements do not signal stream end.

At most ONE async next() may be outstanding. Overlapping calls fail deterministically as E_CONCURRENT_PULL; they must never queue a second producer task or duplicate demand. Calling AsyncIterator.close() returns promptly with a memoized Future<void> and must not park a scheduler/actor worker. It cancels a pending pull, retires the physical producer frame, runs its delegated/finally/defer cleanup once, and settles only after that cleanup. Structured for await early exit performs the equivalent awaited close. Repeated close calls share that same cleanup and never amplify work. A terminal producer error remains sticky until close; close cleanup failures are observable and cannot be suppressed.

## Backpressure, allocation and scheduling

A Stream backed by a channel/sink declares an integer capacity >=0; zero means rendezvous. Each admitted item consumes exactly one credit/slot or matches a waiting reader; a full queue backpressures the writer. Pending write registrations have a finite separate quota. Shutdown, cancellation, failure and actor-generation invalidation wake waiters and refund *uncommitted* credits. Reentrant callbacks, retries and duplicated pulls must not mint extra credits, bypass queue bounds or deliver an item twice. Blocking source syntax means cooperative suspension, not a parked OS worker. A reactor or Future completion callback never runs arbitrary guest logic.

For a chain of pure synchronous map/filter stages, the target is O(stage_count) metadata and O(1) transient values per stage, with optional allocation-free fusion ONLY when preserving effect/loan/order semantics. Stream buffers take O(capacity) storage. collect takes O(n) for at most n accepted items; callback-allocated memory remains an explicit user effect. The compiler should record allocation effects and reject unsupported profiles, never silently exceed a hard resource quota.

Functional |> is single-value function application. Directed actor/transport pipe and rpipe create continuous graphs with checked PipeHandle ownership/completion, and are NOT synonyms for map/filter or |>; << and >> remain narrowly typed one-operation I/O / integer shifts as specified elsewhere. Observable.from_ch is a separate explicitly admitted subscription adapter, not an automatic Stream-to-multicast conversion.

## Diagnostics and adoption gates

Canonical categories: E_CONCURRENT_PULL, E_ITERATOR_CLOSED, E_ITERATOR_BORROW_ESCAPE, E_ITERATOR_OWNERSHIP, E_STREAM_ISOLATION, E_STREAM_CALLBACK_EFFECT, E_STREAM_UNBOUNDED_COLLECT, E_COLLECT_LIMIT, E_STREAM_CREDIT, E_STREAM_QUOTA and E_UNSUPPORTED. A backend without complete typed lowering must fail closed with a specific diagnostic; accepting syntax does not prove execution.

Positive and negative conformance needs: laziness and callback order, fold/collect boundedness and overflow resource release, Option/Result as data, sticky error identity, concurrent pull denial, repeated async close and physical quiescence, close versus pending read, 0/1/N capacity FIFO backpressure, write registration quota, cancellation before/after commit, borrowed-view escape rejection, move-only item transfer and actor restart/generation fencing. Record exact source HEAD/tree, compiler/runtime version, compiled guest artifact, real executed test steps, observed output/errors, high-water buffers, and owner/release counters per backend. Zero-step CI, model-only Node tests, skipped jobs and parser-only acceptance are **not_executed**, not parity evidence.

Initial implementation order:
1. Ratify this contract and align it with existing generator v1, collection PR #31 and pipe PR #45; preserve their canonical grammar.
2. Add typed map/filter/fold/collect stage admission and explicit unsupported errors to each parser/type checker, then real generator/iterator frames.
3. Implement bounded Stream<T> and channel adapters on structured task continuations with cancellation and ownership-safe buffers.
4. Run real guest cases on Java/GraalVM JDK25 + Native Image, LLVM with sanitizers, .NET Native AOT, Rust/Wasm, Forge, and declare JS/Cranelift/HDL profile status accurately.

Reference implementation and test registry in this branch are **host-side models only**; they cannot certify cross-backend source execution.
