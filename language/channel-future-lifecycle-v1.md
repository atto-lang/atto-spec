# Channel read Future ownership and lifecycle (v1 draft)

**Status:** normative *candidate* for AttoLang; execution evidence exists for
the Rust/Wasm browser subset only. Java, LLVM and .NET parity is **not yet
established**. This contract does not make general `Channel<T>` transport
or `pipe` connections executable.

## Admitted typed operations

```atto
val opened: Result<Channel<int>, IoError> = Channel<int>.bounded(0);
match opened over
    on Err(error) -> { return -1; }
    on Ok(channel) -> {
        val pending: Future<Result<Option<int>,IoError>> = nb readch channel;
        // A single consumer is allowed. await may suspend; it never
        // parks the Worker or scheduler execution thread.
        val outcome: Result<Option<int>,IoError> = await pending;
    }
end
```

The v1 browser subset admits `Channel<int>` with literal capacity 0..1024.
Zero capacity means rendezvous. The typed `Future` is **one-shot/linear**:
one consumer can claim it, and a second await or use of a consumed local
must fail, not silently request another read. All operations are Worker-local
in this subset. `nb readch` requires a suspending function and cannot
cross active critical-state/borrow scopes.

The outcomes stay distinct:
- `Ok(Some(value))`: exactly one signed i64 message was admitted.
- `Ok(None)`: EOF after buffered values are drained.
- `Err(IoError)`: cancelled, quota, invalid handle or other checked error.

There is no implicit `Option`/`Result` flattening or scalar EOF sentinel.

## Ownership state machine

A ticket begins in `Pending(unclaimed)`, and can then be:

- **Claimed by await:** `Pending(claimed)`. Only the original consumer
  can receive its eventual result. A duplicate claim fails.
- **Committed by send/close/cancel:** `Settled(outcome)`. Send commits
  `Some(i64)`, close commits `None` when there are no queued messages,
  and a winning cancellation commits `Err(Cancelled)`.
- **Retired by await:** the claimed or settled ticket is consumed, cannot
  be reused, and no longer consumes ticket quota.
- **Abandoned:** an unclaimed ticket is consumed without awaiting.
  A pending registration is unlinked immediately. If `Some(value)`
  was *already committed*, its value is reassigned to the oldest pending
  reader or requeued at the **front** of the channel (including
  capacity-zero/closed channels), preserving FIFO and exactly-once delivery.
  Abandoning an already-claimed read fails with `Busy`.

These two source methods have deliberately distinct ownership effects:

```atto
val cancelled: Result<void,IoError> = pending.cancel();  // non-consuming
val discarded: Result<void,IoError> = pending.abandon(); // consumes Future
```

`cancel()` succeeds only for a pending ticket, settling it to
`Err(Cancelled)` so the owner may later `await pending`. If a send/EOF
committed first, cancellation returns `Err(AlreadySettled)` and does
not revoke the message. `abandon()` frees the unclaimed ticket
immediately; subsequent use of the named Future fails `E_MOVED`.
Implementations must not confuse "cancel requested" with "ticket retired".

`channel.close()` prohibits new sends, while preserving buffered FIFO
messages and eventual EOF. `channel.release()` succeeds only when the
channel is closed, its buffer is drained, and every owned read ticket is
retired. Premature release returns `NotClosed` or `Busy`. Handles and
ticket IDs must never be reused within the same Worker lifecycle.

## Teardown and failure isolation

A Worker runtime is owned by one compiled guest run. On **every** exit,
including successful return, guest throw/panic and host exception, it must
finalize the channel runtime: resolve pending claimed awaits exactly once
as `Err(Cancelled)`, retire all unclaimed registrations, then revoke all
local handles and clear buffers. Cleanup must not depend on GC or the guest
reaching a lexical `defer` after a panic.

This run-level finalizer is **not** a substitute for a long-lived guest's
lexical ownership: it must explicitly await or abandon pending futures when
it needs early quota release. General compiler-inserted destructors across
all exit/control paths remain a separate conformance milestone.

No unhandled ordinary I/O error may be silently upgraded to actor panic;
`throw`/`raise`/`panic` and supervisor CONTROL routing obey the separate
error/effect contracts.

## Versioned Wasm encoding (Rust/Wasm slice)

An admitted guest module carries `atto.channel_int` version byte 1 and
`atto.async` version byte 2, and can import these functions from `atto`:

| Import | Signature |
| --- | --- |
| `channel_int_open_v1` | `(i32 capacity, i32 out) -> i32 status` |
| `channel_int_send_v1` | `(i32 handle, i64 value) -> i32 status` |
| `channel_int_nb_read_v1` | `(i32 handle, i32 out) -> i32 status` |
| `channel_int_await_read_v1` | `(i32 ticket, i32 out) -> i32 status` |
| `channel_int_cancel_v1` | `(i32 ticket) -> i32 status` |
| `channel_int_abandon_v1` | `(i32 ticket) -> i32 status` |
| `channel_int_close_v1` | `(i32 handle) -> i32 status` |
| `channel_int_release_v1` | `(i32 handle) -> i32 status` |

The await output is one aligned 16-byte tagged guest-memory slot:
`i32 tag@0` (0=Some, 1=None, 2=Error), `i32 error@4`, and
`i64 signed value@8` (meaningful only for Some). Pointers must be
bounded and alignment checked before admission, and rechecked after
a JSPI suspension. No untrusted Wasm can fabricate an import, marker,
cross-Worker ticket, or raw host pointer.

## Verification matrix

| Target | Native/compiler | Real guest and lifecycle | Status |
| --- | --- | --- | --- |
| Rust/Wasm | Rust unit tests and native/Wasm conformance | Chromium JSPI; compiled Some, EOF, Full, cancellation races and abandon/requeue | **Passed** at exact source commit below |
| Java/GraalVM | Not executed for this lifecycle revision | Not executed | **Unverified** |
| LLVM/native | Not executed for this lifecycle revision | Not executed | **Unverified** |
| .NET NativeAOT | Not executed for this lifecycle revision | Not executed | **Unverified** |

Rust/Wasm proof: source `atto-lang/atto-source.rs` commit
`c3f7237d3469fe1f2e4a8501ee020948b1a7f111`,
Git tree `84563023199c66072fbe8feac09a278fb6e89379`,
[token-free exact-tree alternate Actions run #43953965476](https://github.com/anticaptrad/atto-ci/actions/runs/43953965476).
The run passed full Rust tests, 486 conformance checks
(including 438 native/Wasm comparisons), and compiled-guest
Chromium tests for explicit abandon, cancellation, EOF and backpressure.

**Remaining parity gates:** shared traces for cancel-vs-send and
close-vs-send linearization, abandoned committed i64 preservation,
multiple readers, starvation/fairness, stale tickets, quota recovery,
Worker teardown, and actor ownership/borrowing for Java/LLVM/.NET.
