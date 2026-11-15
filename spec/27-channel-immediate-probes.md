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
val result = try writech ch, rt take message;

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

Here `rt take` invalidates its original source binding when evaluated. The write result becomes the single owner, and pattern matching transfers that owner to the selected arm. On Accepted it has no payload. On Full/Closed the caller can retry, drop, close or move the recovered payload. Static diagnostics must reject use-after-move, discarded move-only result, double-drop, and a borrow escaping through the channel.

For Copy values, a source expression such as `try writech ch, 42` is also valid. Implementations may copy its operand under the ordinary Copy contract. No new permission to transport an actor-private pointer, MutexGuard, borrowed reference, non-Sendable capability or cross-isolate alias is implied by this operation.

## Atomicity and close races

Each probe has a linearization point shared with the channel's existing select arbitration. A probe MUST report exactly one of Accepted, Full or Closed and never a combination. Concurrent close and write may produce Accepted only if the write committed before close; if close wins, return Closed with the original payload. A Full result is permitted if Full was observed before a subsequent close. A concurrent read may create capacity; an unsuccessful probe must still not arm a waiter.

Probe execution MUST evaluate the channel and payload once in documented source order. An immediate attempt must not suspend or trigger guest continuation execution inline on a reactor thread. The operation's result must reflect the outcome of this attempt, not a later callback. Interleaved select writers and ordinary writers use the same arbitration with no double-admission.

Allocation-minimal implementations are desirable, but zero allocation is a performance goal and is not implied by the syntax. An implementation must first establish correctness and resource safety.

## Read-side compatibility

`try readch ch` remains an immediate non-registering probe with result `Option<T>`. It yields `Some(value)` on success and `None` on temporary absence. When a closed channel's already-committed buffer has drained, the existing channel-closed failure is signaled; it is not silently represented as `None`. A separate closed-aware read-result type would require an explicit language decision and is not introduced here.

`nb readch ch` registers and returns a `Future<T>`; `readch ch` suspends the logical task when no value is ready.

## Migration and implementation status

Java/GraalVM guest `try writech` yields the affine
`TryWriteResult<T>` (`Accepted`, `Full(T)`, `Closed(T)`) in draft
[Java PR #3109](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/3109).
The Java host `ChannelRuntime.Channel<T>.tryWrite(T)` Boolean method is a
host-compatibility interface, **not** the guest-language return type.

**Current source-exact Java receipt:** Source commit
`6a4d66ba9a2d946992c7f5baf2919c7b680133b2` passed **73/73**
channel compiler, ownership, guest, and host-runtime tests on private
GraalVM/JDK25 CI:
[run 43675561301](https://github.com/athlet-o/atto-ci/actions/runs/43675561301).
The test mirror's checked-out source `src` tree SHA was
`ca0383ea1872ed38973b610b234279f17b877ddc` and its `docs` tree
SHA was `2a3354c9a025396c082e47e4113a2d4acf85473d`;
both matched the source Git trees. The runner required no cross-org
GITHUB_TOKEN or secrets.

The full Java Maven test suite is **NOT GREEN**: on the preceding source
commit `d72d0a1fd0d0b4d266e77efdbde3d85e8fe0a848`,
[run 43675276951](https://github.com/athlet-o/atto-ci/actions/runs/43675276951)
executed 5,755 tests (46 failures, 20 errors, 2 skipped). These results
must not be represented as a full-suite pass. A separate latest-head full
suite, strict actor-domain suspension/cancellation review, canonical
parser/formatter roundtrips, and Native Image/AOT testing where claimed
are still outstanding.

LLVM, Wasm, Forge, and .NET compiler-backed execution and parity remain
**NOT_EXECUTED**. The separately authored 18-case cross-backend conformance
registry is still `DESIGN_ONLY_NOT_EXECUTED` until cases have their own
authenticated per-backend execution receipts; passing 73 Java tests does
not automatically mark those 18 registry entries as passing. See
[chapter 11](11-conformance.md).
