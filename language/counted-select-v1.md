# Counted select and streaming selection — v1 proposal

**Status: implementation target; host oracle is not compiler parity.**

A static value select without a count returns Future<T>. A parenthesized
count changes cardinality, not wait mode:
`select(n)`, `select<T>(n)` and their deprecated nb aliases return
Future<Array<T>>; ordinary await returns Array<T>. Counted and scalar forms
are distinct even for n=1. Both braces and over/end are equivalent. Grammar
(target): [nb] select ["<" type_ref ">"] ["(" expression ")"] [policy] body.
Count is evaluated exactly once in caller context before selection admission.
No implicit await or implicit flattening.

```atto
val Future<Array<int>> pending = select<int>(3) over
    when readch left: int value -> { return value * 2; }
    when readch right: int value -> { return value * 2; }
end;
val Array[int] results = await pending;
```

## Bounded finite batch

- n must be int, nonnegative and within the configured element/byte budget.
  Reject static invalid counts; dynamic invalid counts fail before registration
  or consumption. Zero produces an empty completed array without evaluating
  source operands or running arms. Admission must reserve count/storage and
  bound dynamic payload bytes; no invisible unlimited array, waiter or task.
- Evaluate source capabilities once in source order, then repeat atomic
  one-winner arbitration. One round in flight; run winning arm on its
  authorized scheduler lane, including cleanup, before admitting next round.
  Output is winner-commit order, not source order, timestamp sort, or race
  completion order. FAIR cursor advances across rounds; FIRST/RANDOM opt-in.
- Reusable channel read cases can win repeatedly. A one-shot Future source
  is retired when it commits, including aliases of that same Future.
  Losing observations detach without cancelling independent producers.
- Initial implementation admits read and Future cases only; reject default
  (not an event), repeated writes (until per-round owned payload production
  is specified), immediate try-count, and procedural do-count explicitly.
  The ordinary scalar forms retain their existing contracts.
- A successful array contains exactly n results. EOF/exhaustion before n
  fails with typed SelectExhausted, never silent partial success or endless
  wait. Option/Result payloads are ordinary values. A failure after a prefix
  has committed cannot undo channel consumption; release unreturned retained
  values exactly once. Explicit partial collection may be a separate API.
- Cancellation before a round commit removes pending registration; after a
  commit it never rolls back transferred ownership. Stop further rounds,
  fence stale generation/round callbacks, and settle only after in-flight
  retirement and cleanup. A successful terminal result cannot be overwritten.
  No live mutable loans across deferred arms; no guest callbacks in the
  arbiter or I/O completion thread. Physical retirement and budget refund
  must be proved separately from logical completion.

## Continuous delivery (separate optional API)

Proposed lazy `select_stream<T> over ... end` constructs Stream<T> with
exclusive async pull, no registration until demand, at most one outstanding
next, and bounded memory. It uses the same one-winner arbitration, with
backpressure between rounds and awaited close on cancellation/early break.

```atto
val Stream<int> events = select_stream<int> over
    when readch incoming: int value -> { return value * 2; }
end;
for await const event of events.async_iter() {
    process(event);
}
```

The stream spelling is exploratory, not an accepted keyword. An explicit
Stream-to-Observable adapter should use the bounded demand/terminal protocol
in spec/23-pull-push-and-lazy-collections.md; no implicit broadcast, no
unbounded push queue. Prefer a stream for continuous/unbounded input,
select(n) for exact finite collection. Existing Stream.take(n).collect
has its own at-most/typed collection contract, not implicit exact-n semantics.

## Evidence

The host-only sequential oracle models round identity, source retirement,
cardinality, quota, fairness, cancellation, exhaustion and cleanup.
It does NOT implement a real Future, Channel, actor lane, compiler, AOT,
physical resource retirement or concurrency proof. Require exact-source
guest and negative no-artifact evidence across every atto-source target.
