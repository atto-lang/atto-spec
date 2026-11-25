# 27 — Immediate channel probes and recoverable ownership

**Status: TARGET / NOT FIVE-BACKEND VERIFIED (2026-11-14).** This chapter fixes the approved observable API; it does not certify that a compiler accepts the examples. The accompanying `contracts/channel-immediate-probes-v1.json` describes design-only conformance gates.

## Three write forms

| Source | Return type | Semantics |
| --- | --- | --- |
| `writech ch, value` | `void` | Cooperatively suspend the owning logical task until one write commits, or a documented failure occurs; never park an actor carrier |
| `nb writech ch, value` | `Future<void>` | Register exactly one pending write, return immediately, complete/fail/cancel under the normal Future ownership lifecycle |
| `try writech ch, value` | `TryWriteResult<T>` | Perform exactly one immediate atomic probe, without suspending, parking or registering any waiter |

A channel of capacity zero uses rendezvous semantics: the immediate probe succeeds only with a compatible already-waiting reader. A positive-capacity channel can succeed by buffering or rendezvous.

## Typed write result

The canonical proposed sum type is:

```atto
// Algebraic shape; not a claim that the declaration grammar is implemented.
TryWriteResult<T> =
    Accepted
  | Full(T)
  | Closed(T)
```

`Accepted` means the channel committed exactly one admission, transferring a move-only payload into the channel. `Full(original)` means insufficient capacity or an unmatched rendezvous; no write occurred, and the caller owns the original payload returned in the variant. `Closed(original)` means the channel was already closed at the atomic admission point; no write occurred, and the returned variant owns the original payload. Neither Full nor Closed may schedule a delayed send.

The payload of Full/Closed MUST be the same owned value, not an implicit deep copy, discarded resource, stale alias, or independently destructible duplicate. The sender does not retain a second owner through the original binding. The runtime may use an optimized unboxed representation as long as these semantics hold.

```atto
val result = try writech ch, take! message;

match result over
  on Accepted -> {
    // message now belongs to the channel/recipient.
  }
  on Full(message) -> {
    // The returned message is owned here and can be retried.
  }
  on Closed(message) -> {
    // The returned message is owned here and can be handled/closed.
  }
end
```

Here `take!` invalidates its original source binding when evaluated. The write result becomes the single owner, and pattern matching transfers that owner to the selected arm. On Accepted it has no payload. On Full/Closed the caller can retry, drop, close or move the recovered payload. Static diagnostics must reject use-after-move, discarded move-only result, double-drop, and a borrow escaping through the channel.

For Copy values, a source expression such as `try writech ch, 42` is also valid. Implementations may copy its operand under the ordinary Copy contract. No new permission to transport an actor-private pointer, MutexGuard, borrowed reference, non-Sendable capability or cross-isolate alias is implied by this operation.

## Atomicity and close races

Each probe has a linearization point shared with the channel's existing select arbitration. A probe MUST report exactly one of Accepted, Full or Closed and never a combination. Concurrent close and write may produce Accepted only if the write committed before close; if close wins, return Closed with the original payload. A Full result is permitted if Full was observed before a subsequent close. A concurrent read may create capacity; an unsuccessful probe must still not arm a waiter.

Probe execution MUST evaluate the channel and payload once in documented source order. An immediate attempt must not suspend or trigger guest continuation execution inline on a reactor thread. The operation's result must reflect the outcome of this attempt, not a later callback. Interleaved select writers and ordinary writers use the same arbitration with no double-admission.

Allocation-minimal implementations are desirable, but zero allocation is a performance goal and is not implied by the syntax. An implementation must first establish correctness and resource safety.

## Read-side compatibility

`try readch ch` remains an immediate non-registering probe with result `Option<T>`. It yields `Some(value)` on success and `None` on temporary absence. When a closed channel's already-committed buffer has drained, the existing channel-closed failure is signaled; it is not silently represented as `None`. A separate closed-aware read-result type would require an explicit language decision and is not introduced here.

`nb readch ch` registers and returns a `Future<T>`; `readch ch` suspends the logical task when no value is ready.

## Migration and implementation status

Java/GraalVM guest `try writech` yields affine `TryWriteResult<T>`
(`Accepted`, `Full(T)`, `Closed(T)`) in draft
[Java PR #3109](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/3109).
Java host `ChannelRuntime.Channel<T>.tryWrite(T)` remains Boolean as
an explicit *host compatibility method*, not the guest result type.

**Latest source-exact Java focused receipt:** source SHA
`4ac6f06ced0132ee6281c03f0ab81bc44275fec9` passed **74/74**
compiler-backed guest and host runtime/channel tests with zero
failures/errors/skips:
[private GraalVM/JDK25 run 43682284035](https://github.com/athlet-o/atto-ci/actions/runs/43682284035).
The private runner verified source Git trees
`src=f5ec41b9c9848c1d7c6c5f7dcc6e8e39c098a561`,
`docs=2a3354c9a025396c082e47e4113a2d4acf85473d`, and
`scripts=07f5074549bba8c3931d602ba533e0cbbf2b3f7a`.
The 128-writer test and Native Image version self-test were exercised,
without cross-organization checkout credentials.

**Matched full Java suite (earlier source head `6a4d66b` versus
main base `a88353e`):** the same runner, JDK, Maven command and source-
matched `src`/`docs`/`.github` trees executed 5,755 PR tests and
5,733 base tests respectively. Both full suites were **RED**:
PR 47 failures/20 errors/2 skips; main base 48 failures/19 errors/2
skips. Of the 67 distinct failing methods in each, 63 were common.
Four differed per side. Three isolation repetitions of 68 relevant
actor/runtime tests on each revision showed intermittent failures
in both revisions, including a base repetition with zero failures.
The evidence supports nondeterminism but does **not** certify zero
regressions or a full-suite pass.
[Base full](https://github.com/athlet-o/atto-ci/actions/runs/43681442020),
[PR full](https://github.com/athlet-o/atto-ci/actions/runs/43681323532),
[base isolation](https://github.com/athlet-o/atto-ci/actions/runs/43681786879),
[PR isolation](https://github.com/athlet-o/atto-ci/actions/runs/43681777925).

**Native Image:** The original version admission compared
`native-image 25.0.4.1` (JDK patch) to GraalVM/Truffle 25.3.4.1,
and incorrectly rejected matching Oracle GraalVM. The Java PR now checks
the GraalVM Runtime and Substrate VM release lines separately, requiring
both to match the Maven pin; positive/negative self-tests passed.
Actual Native AOT compilation and guest fixtures remain
**NOT_VERIFIED** until execution evidence is available.

LLVM, Wasm, Forge and .NET Native AOT compiler-backed conformance remain
**NOT_EXECUTED**. The separate 18-case cross-backend registry stays
`DESIGN_ONLY_NOT_EXECUTED` until each case obtains a validated
per-backend receipt. Focused Java tests cannot automatically promote
these case statuses. See [chapter 11](11-conformance.md).
