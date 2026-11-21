# Actor spawn, READY/DONE observers, and pipeline admission (v1 target)

**Status:** proposed normative semantics; not a claim of executable compiler/backend parity. Complements the existing [directional pipe contract](https://github.com/atto-lang/atto-spec/pull/45) and [contextual bang aliases](https://github.com/atto-lang/atto-spec/pull/148).

## Lifecycle API and result boundaries

- `spawn Actor(args)` admits a new actor and returns an opaque, generation-checked `ActorRef<Actor>` **after** its mailbox, typed ports, supervisor owner, TenantVM membership, and lifecycle observer slots are registered. It does not wait for `on_start` or finish running the actor's startup hook. Rejected spawn admission returns a checked error and publishes no actor reference.
- `actor.get_ready()` is a zero-argument method returning a shareable, non-actor-cancelling `Future<void>`. Success means `on_start` / initialization has completed and the actor can receive ordinary DATA. A startup failure settles the observer with its typed failure, not a successful READY.
- `actor.get_done()` is a zero-argument method returning a shareable, non-actor-cancelling `Future<void>`. It succeeds only after accepted messages, logical turns, pinned suspensions, descendants owned by the scope, in-flight loans, `tear_down`, native/worker exits, and resource retirement are complete. Failure must be observable with its original cause. `get_done()` MUST NOT silently turn a failed startup, panic, or forced cancellation into success.
- `await spawn Actor(args)` is an explicit shorthand that yields the initialized `ActorRef<Actor>` or propagates startup failure. Unlike plain `spawn`, it passes through the READY barrier; it must **not** wait for DONE.
- Both `get_ready()` and `get_done()` support multiple awaits and late subscribers, with one immutable terminal result per actor incarnation. Cancelling a *waiter* does not cancel the actor. The runtime must preserve the observer identity across restart, and reject stale ActorRefs by incarnation.
- `.ready` and `.done` properties are not lifecycle API aliases. `Future.all(producer.ready, consumer.ready)` is not the portable source contract.

## Atomic directed pipe admission does not await READY

Given two successful plain spawns, the runtime MUST allow checked pipeline attachment **before either actor has reached READY**:

```atto
val producer = spawn Producer();
val consumer = spawn Consumer();
val link = (producer pipe! consumer)?;
```

`producer pipe! consumer` and `consumer rpipe! producer` mean the same DATA direction (producer to consumer), but are *alternative* constructions, not two halves of one duplex connection. A second unicast attachment without explicit fan-out capacity must fail with a checked duplicate/occupied-port result; no partial graph and no second delivery.

Pipe admission MUST check port roles (`emits T` source, `receives T` sink), exact payload type, bounded capacity, actor generations, owner/loan state, TenantVM capabilities and supervisor policy. It reserves all ports/credits before atomic publication, and rolls back on any failure. No DATA or supervisor CONTROL messages are emitted by admission itself.

A newly admitted graph is active even while its actors are STARTING. Application DATA may be queued **only within the already-authorized bounded credits**, but must not enter an actor's ordinary `receive` until the receiver is READY. Backpressure suspends on the actor scheduler, not a blocked OS carrier. No implicit unbounded buffering, spin wait, busy retry, message loss, or host-side bypass is allowed.

If an actor fails to start, every affected graph must report the startup failure through its checked completion path and finish cleanup without leaking credits or delivering DATA to a failed actor. Pipeline connection must not synchronously wait for READY (which can deadlock when startup logic needs a connection). Implementations must define or reject circular startup dependencies rather than fake READY.

## Graceful STOP vs completion

`stop! actor` is a contextual alias of already-admitted graceful `stop actor`, not a force kill. The lifecycle operation fences new DATA admissions, allows previously admitted DATA to drain under the scope's policy, requests `tear_down` and preserves typed failure. It does not resolve `get_done()` until physical quiescence. STOP delivered while STARTING must settle READY correctly (failure/cancellation, never a fabricated READY) and settle DONE only after cleanup.

`stop! actor` is **not** a request to generate producer output. Calling it immediately after a pipe is attached can stop a producer before it emits anything. To prove output was delivered, the program must await the producer's work or a pipeline completion receipt and then stop according to the intended end-of-stream policy.

An owned `PipeHandle` has separate, checked setup and completion. Candidate API:

```atto
pub susp fnc main(): Result<int, Error> {
  val producer = spawn Producer();
  val consumer = spawn Consumer();

  val link = (producer pipe! consumer)?;
  // Application runs until its work has finished; do not stop immediately.
  // Then request an orderly shutdown under its structured scope.
  stop! producer;
  (await link.get_done())?;
  await producer.get_done();
  await consumer.get_done();
  return Ok(0);
}
```

This illustrates lifecycle ordering only: the precise result/effect conversion and consumer shutdown policy depend on the enclosing scope. The code is **not** yet a portable executable test.

A `PipeHandle.get_done()` reports successful drain/cleanup or a checked pipeline error after physical quiescence; an actor `get_done()` reports the actor's own full retirement. These are different barriers. A parent `main()` returning `0` by itself is not proof that a detached graph delivered messages.

## Compiler and runtime conformance

Every `atto-source.*` backend MUST either:

1. Compile and run real guest sources proving the same actor incarnation, READY initialization, checked pipe admission, DATA gating, graceful STOP, observer settlement and quiescent DONE; **or**
2. Fail closed with a stable explicit unsupported diagnostic *before* emitting guest artifacts for missing operations.

Required positive checks: attach immediately after `spawn`; await `get_ready()` separately; `await spawn`; forward/reverse equivalent edges; ordered bounded delivery; READY before first DATA receive; STOP drains accepted messages and DONE waits for all loans; shared/late READY and DONE observers.

Required negative checks: invalid `.ready/.done` shorthand; duplicate direction/occupied ports; wrong types; cross-tenant direct pipes; stale generation; startup failure; stop during startup; send/attach after STOP; cancellation with pinned loans; premature DONE; and host-only model erroneously advertised as compiled guest parity.

For synthesizable, hard-real-time or bootstrap-only targets without the necessary actor runtime, explicit `E_UNSUPPORTED_ACTOR_LIFECYCLE` (or a documented stable equivalent) is correct until actual execution exists. Unsupported code MUST NOT compile as a successful no-op.

**Release evidence:** exact backend head/tree SHA, source/fixture Git blob IDs, toolchain and runner identity, nonzero executed CI steps, actual emitted guest binary identity, positive guest output and negative no-artifact proof. Parser snapshots, host reference models and source integrity are insufficient.

Related [lifecycle conformance candidate](https://github.com/atto-lang/atto-platform-conformance/pull/237), [Rust actor lifecycle PR #25](https://github.com/atto-lang/atto-source.rs/pull/25), and [LLVM lifecycle issue #91](https://github.com/atto-lang/atto-source.llvm/issues/91).
