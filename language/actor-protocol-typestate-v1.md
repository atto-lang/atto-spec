# AttoLang actor protocols and affine typestate — v1 proposal

**Status: TARGET / NOT_VERIFIED by any guest compiler.** This is a source-free executable reference contract, not a claim that actors or this proposed syntax compile. Protocols refine the existing actor kind; they do not create `state_machine_actor` or a new scheduler, isolation domain or state storage mechanism.

## Goal and spelling (candidate syntax, not yet admitted)

```atto
define protocol ConnectionProtocol as
  initial Disconnected
  state Disconnected as
    on Connect(Config) -> Connected replies ConnectedAck
    on Close -> Closed replies ClosedAck
  end
  state Connected as
    on Query(Sql) -> Connected replies QueryReply
    on Subscribe(Topic) -> Connected streams DataEvent
    on Close -> Closed replies ClosedAck
  end
  terminal state Closed
end

define actor Connection implements ConnectionProtocol as
  state {
    let Socket? socket: none
  }
  // receive handlers and sealed handle_state(critical-read|write) remain actor APIs.
end
```

This proposal is **additive** to [typed `receives`/`sends` (#28)](https://github.com/atto-lang/atto-spec/pull/28) and [unary/stream reply contracts (#40)](https://github.com/atto-lang/atto-spec/pull/40): `ActorRef<ActorClass>`, `OneWayMessage`, `UnaryRequest<T>`, `StreamRequest<T>`, `UnaryReply<T>` and `ReplyStream<T>` retain their independently specified transport and reply semantics. A protocol adds legal control-state/message pairs and checked successor authority. Streaming is **not** implemented as repeated unary calls or repeated protocol transitions. Any final API spellings must be reconciled with those drafts.

`define protocol` is a **type-level contract**, not an actor declaration. Its grammar, parser, formatter and actor `implements` binding require explicit acceptance in every backend. Do not infer runtime support from the reference model. The protocol state (`Connected`) is a proof index, distinct from the actor's sealed data (`socket`). The actor implementation MUST establish a correspondence between the declared control state and the sealed storage invariants without exposing raw state pointers.

## Static handle and call rules

Conceptual type: `ProtocolHandle<Connection, ConnectionProtocol, Connected>` is an **affine, incarnation-bound, nonforgeable authority** minted by `spawn` or an authenticated handoff, not an ordinary copyable `ActorRef<Connection>`. A state-changing call **consumes** the old handle; only a successful, correlated, reply-bearing transition returns the next typed handle. Normal actor references and group subscriptions convey no typestate proof.

```atto
// Illustrative typing only; actual API spelling is not accepted yet.
val disconnected = await spawn Connection()
val pending = disconnected.call(Connect(config))
val (ack, connected) = await pending?
val query_pending = connected.call(Query(sql))
val (rows, still_connected) = await query_pending?
val close_pending = still_connected.call(Close())
val (_, closed) = await close_pending?
closed.complete_protocol()
```

Required static judgement: `send(P, S, M)` is legal iff **every** state in the compiler's possible state set `S` admits message `M`, all possible branches agree on the nominal response cardinality (`UnaryRequest<T>` versus `StreamRequest<T>`) and response payload type `T`, and every declared successor is tracked. `Disconnected | Connected` can `Close` (both reply `ClosedAck` and enter `Closed`); it cannot `Query`. A raw `ActorRef`, dynamic state, unproved union, mutable alias, borrowed handle crossing a suspension, or a concurrent second sender has **no static state guarantee** and must use an explicitly runtime-checked admission path or be rejected. Do not simply cast a shared ref to a typed handle.

Unary call progression is `prepare → admit → commit → correlated reply`: `(Handle<S>, M) -> PendingCall<Reply, NextStates>` consumes the handle before admission; a matching successful completion yields `(Reply, Handle<NextStates>)`. Streaming progression is `prepare → admit → commit → zero-or-more bounded chunks → EOF observed and drained → successor`, and an error/cancellation never yields the next typed handle. Queued, unprocessed or timed-out messages do **not** mint the successor. A single handle cannot have two overlapping state-changing calls. No implicit copy, `share!`, fork, or clone is permitted. All functions/methods follow snake_case; surface spellings such as `complete_protocol()` and `call()` are proposed, not committed API.

## Response cardinality: one-way, unary and streaming (v1 refinement)

This proposal **does not make every actor message unary**. As specified by
[typed actor replies #40](https://github.com/atto-lang/atto-spec/pull/40):

- **`OneWayMessage`:** ordinary application-mailbox admission and a receipt,
  not processing success. There is no application reply channel. In v1, a
  state-changing protocol transition cannot obtain a new static typestate
  proof from a one-way send. A one-way event may be allowed on a separate
  non-state-changing actor API, subject to effects/capabilities and runtime
  generation checks; it cannot forge an affine `ProtocolHandle`.
- **`UnaryRequest<T>`:** one correlated response or terminal error.
  Source `on M(...) -> Next replies R` requires `M` to resolve to
  `UnaryRequest<R>`. Commit-before-reply returns the next affine authority
  exactly once.
- **`StreamRequest<T>`:** zero or more ordered `T` items, followed by one
  terminal `None` (normal EOF) or `Err` (terminal failure). Proposed
  `on M(...) -> Next streams T` is **candidate source syntax**, requiring
  parser/formatter review, and requires a nominal `StreamRequest<T>` message
  declaration. This is an ordinary actor type, not a new actor kind.

Illustrative source (not yet executable `.atto`):

```atto
define class Subscribe implements StreamRequest<DataEvent> as
  val Topic topic
end

// Conceptual state-indexed send; exact transport wrapper spelling remains under review:
val stream = connected.send(Subscribe(topic))?
loop
  match (await stream.receive())? over
    on Some(event) -> handle_event(event)
    on None -> break
  end
end
// EOF consumed; finish consumes the stream lease and may release the successor.
val connected_after_stream = await stream.finish_async()?
```

The underlying application data stream must use the already-proposed
`ReplyStream<T>` semantics from #40. A state-indexed transport may wrap it
as a **single affine stream lease** carrying an internal, runtime-authenticated
`NextStates` obligation. Calling `receive()` on any chunk yields only a
data item; **no chunk**, mailbox admission, producer-side close, or partial
receive mints a successor `ProtocolHandle`. Only after the actor committed
the checked transition, the producer sent normal EOF, all earlier buffered
items were delivered, the consumer observed EOF, and the stream lease retired
without unresolved obligations may one successor authority be released.
Reaching EOF is not proof that the actor itself terminated (`get_done()`).

Stream writes use `StreamReplyTo<T>` / the actor-owned continuation lease
from #40. Demand/backpressure must be bounded and cannot hold `critical-write`
or an unproven mutable borrow across suspension. `try_send` may report Full,
`send_async` may suspend; accepted items preserve per-stream sequence order,
and the stream has exactly one logical consumer unless a separately authorized
fan-out layer is introduced. Item values must be `Sendable` and, across a
network/tenant transport, `Serializable` under explicit capability checks.
In v1 the reference model permits at most eight outstanding demand credits
and eight buffered items as **model limits, not production defaults**.

If a stream errors, is dropped, times out, is cancelled, loses its producer,
or is fenced by stop/restart/hot upgrade, it **must not mint the next typed
state capability**. Previously observed items remain observed (no rollback);
buffered accepted items may drain in order before a terminal error when the
transport can still deliver them. A normal EOF and a terminal error are
exclusive, and a duplicate terminal marker or late item is rejected. Streams
cannot silently degrade into `UnaryReply<T>`, and a union containing
incompatible response modes or item types is rejected without narrowing.
A closed stream does not bypass supervisor CONTROL or actor DATA isolation.

Compiler and runtime **must not infer a stream from an arbitrary handler's
return values**: the nominal message marker determines cardinality. A
state-changing `StreamRequest<T>` remains exclusively in-flight on its
affine protocol handle; unrelated ordinary actor messages may coexist only
if they cannot violate that state proof, or if they revoke it before a
conflicting transition. No implicit duplicating, auto-sharing or cloning
the state-indexed stream capability is permitted.

## Continuous inbound, duplex and actor-pipeline streams (design boundary)

**Streaming replies are not the only kind of streaming actor messaging.**
There are also continuous **inbound** streams (many input items followed by
one aggregate result), **full-duplex** conversations (concurrent inbound and
outbound streams), and persistent **actor-to-actor pipelines**. These are
different from repeating `UnaryRequest<T>` in a loop.

The current v1 source-free model verifies **server-side response streaming**
from a single admitted `StreamRequest<T>`. It **does not** certify client
streaming, duplex sessions, or continuous actor-pipe execution. Future
state-indexed sessions must separately type each directional stream endpoint
(`Source<T>`, `Sink<U>` or equivalent compiler-resolved roles) and define
half-close, per-direction credit/buffer limits, end-to-end cancellation,
reply correlation, backpressure, terminal failure and ownership handoff. A
duplex conversation cannot release a successor state proof while either
direction still has an unresolved lifecycle obligation; both legs must
quiesce or be fenced with an explicit failure outcome.

This layer MUST compose with the existing
[directional `pipe` / `rpipe` contract (#45)](https://github.com/atto-lang/atto-spec/pull/45)
and the [authenticated `ActorStream` endpoint work](https://github.com/atto-lang/atto-source.java/pull/1217).
It must not rebrand a continuous directed graph as a unary RPC, conflate
application DATA with supervisor CONTROL, or silently cast a channel/ordinary
`ActorStream<T>` into an affine protocol capability. Ordinary pipeline
connections may be long-lived and have independent `get_done()` obligations.

## Replies, effects, failure and closure

- Each declared `call` transition specifies exactly one required successful reply **type**. An admitted synchronous request must eventually resolve to that reply **or an explicit terminal error** (cancellation, timeout, shutdown, panic, stale generation, etc.). Static checking does not promise scheduling fairness or successful delivery. The runtime must enforce one-shot correlation, reject duplicates, and never turn mailbox admission `Ack` into processing success.
- If admission fails **before** publication and the original token is provably intact, an explicitly typed rejected-admission result MAY return that token. Once delivery is possible, timeout/cancel/disconnection is uncertain: conservatively consume the old token, return no next-state proof, and require authenticated resynchronization, fencing or shutdown. Do not assume the actor stayed in its former state.
- Protocol completion is a **logical** terminal-state proof plus no outstanding transition/reply obligations and no remaining live linear handle. It is **not** physical retirement. `get_done()` continues to wait for runtime termination/finalizers and supervisor obligations. Reaching a terminal state is not a proof that the actor terminated.
- `Closed` is terminal and accepts no new DATA protocol events. No reply is silently dropped on close. CONTROL notices, panic escalation, `on_raise`, cancellation, state clean-up and the supervisor remain independent of protocol DATA admission.
- Mutable internal timers, lifecycle hooks, hot-loading or other senders cannot invalidate a live static handle invisibly. They must either preserve its witnessed state, revoke/version-fence the handle before changing protocol state, or operate through an explicit dynamic checked state transition. Cross-tenant and cross-incarnation reuse is invalid. Hot upgrade requires a versioned migration proof or invalidates every old handle.

### Commit-before-reply, mailbox admission and lost acknowledgements (v1 hardening)

The bounded reference trace distinguishes **prepared** (the caller consumed its
linear handle), **admitted** (the runtime committed bounded mailbox admission),
**committed** (the actor checked its previous control state and revision and
atomically committed the declared transition), and **replied** (a matching
one-shot reply may mint the next typed capability). In particular, neither
preparation nor admission alone permits a successful reply. Repeated,
out-of-order or mismatched commit attempts are rejected; reply completion
must match the committed actor generation and revision.

An `AdmissionRejected` result applies **only before mailbox publication**;
cancellation, timeout, or disconnection after admission, including after a
committed transition but before reply delivery, destroys the old capability
and gives **no successor proof**. Reconciliation requires an authenticated
runtime resynchronization or generation-fenced restart, not a cast or an
assumption that the message never executed. After restart the reference model
marks the actor control state unknown because durable state may be restored.
No typed handle is reminted without a trusted handshake.

The model's `admit_call` and `commit_transition` events are **symbolic oracle
observations**, not authenticated runtime proofs. A real guest implementation
MUST derive them from runtime-owned mailbox, actor-state and reply authority.
A caller-provided event, numeric generation, display name or host test passing
cannot mint a guest protocol capability.

## Full guest-AOT descriptor and runtime authority contract (target)

A compiler must lower a successfully checked protocol declaration into a
**closed-world, immutable protocol descriptor**, rooted as a reachable AOT
artifact. Its identity contains the resolved nominal module identity, protocol
version, canonical checked transition/reply/effect table and a deterministic
descriptor digest. The linker must retain every reachable transition handler,
reply codec, failure edge and version-admitted migration. User-provided
name strings or shape-compatible records cannot spoof that identity. No
runtime guest source evaluation, host reflection fallback, code emitter or
JIT-only generic specialization is permitted in a sealed full-guest-AOT build.

A runtime-issued protocol authority is an **opaque, affine capability** that
binds actor instance identity, incarnation/generation, descriptor digest,
authority revision/epoch and a single-use anti-replay nonce. The holder sees
only a compiler-indexed handle; mutable authority metadata remains
runtime-owned. This does not widen the actor-local Ref32 representation or
serialize a native pointer. It may be moved only through an authorized handoff;
ordinary actor DATA mail, pub/sub, tenant boundary crossing, copying,
borrowing, sharing, reflection, FFI or JSON/MessagePack serialization must
not mint or duplicate it. A plain ActorRef still cannot claim a protocol
state.

The actual transition must be checked against **runtime-owned state** while
holding the actor's authorized exclusive state-commit boundary; check the
expected generation, descriptor, state and revision, then commit protocol
state and the corresponding sealed actor data consistently. The state
revision advances once. Do not suspend or execute arbitrary user callbacks
while holding a critical-write loan. The success reply is emitted only
after the commit, through the correlated, one-shot reply path. If durable
state is involved, the durable transaction/outbox contract must establish
its own atomicity; an in-memory state write is not proof of durable commit.
No message-admission Ack constitutes a state-commit Ack.

An externally retained protocol proof must be invalidated before any
supervisor action, timer, hot upgrade, state-enter action, concurrent actor
turn or alternate sender can change its state without consuming that
proof. Concurrent DATA receive turns may exist for the actor, but **protocol
commit admission is serialized** at the capability/revision boundary.
Mismatches cause typed failure and revocation, never silent fallback to a
dynamic call. Stop, restart, uncertain delivery and hot upgrade retire
pending tickets and revoke old authority; upgrade may reissue authority
only through an authenticated, version-checked migration handshake.
Terminal logical completion remains distinct from physical get_done().

**Static and runtime proof obligations are separate:** the compiler proves
state-set legality, affine use, effects and source-level ownership before
native IR; the runtime authenticates real actor identities and commit/reply
events. Neither source-free model events nor passing JavaScript tests can
substitute for the runtime's authority checks.

## Runtime mapping to Erlang/OTP gen_statem (29.1.1, stdlib 8.1)

The runtime may implement a protocol using state-function or handle-event dispatch, transition actions, state-enter callbacks, postponed events and state timeouts, following [Erlang `gen_statem` documentation](https://www.erlang.org/docs/29/apps/stdlib/gen_statem.html). These are **runtime mechanisms**, not compile-time guarantees.

- Event type plus control-state dispatch maps to `(state, message)` transitions; reply actions settle the pending typed reply obligation.
- `postpone` does not change protocol state and cannot satisfy a pending call, fake a reply, or postpone a terminal obligation forever without a declared failure/cancellation path.
- `state_timeout`, `next_event` and state-enter callbacks may change state asynchronously. Any transition that invalidates externally held typestate must revoke/fence the proof; v1 rejects declaring these as untracked spontaneous transitions.
- Transition processing must serialize the protocol-state commit with the sealed actor state mutation, mailbox admission/reply correlation and generation checks. Concurrent actor turns cannot use a stale state proof after another committed transition.
- Actor stop or crash does not bypass authenticated supervisor CONTROL, sealed-state `critical-read`/`critical-write`, bounded mailboxes, ownership transfer or the one-shot reply contract.

## Static proof checks and admitted scope

Finite protocol declarations are bounded to **64 states, 256 transitions and 512 reference trace steps**. Duplicate `(state, message)` rules, unknown states, terminal outgoing transitions, reply-less calls, unreachable declared states, and states with no *graph path* to a terminal state are rejected. Graph reachability is only a structural sanity check and MUST NOT be reported as a proof of termination/liveness: a Query loop may run forever.

The reference checker provides `validateProtocol`, `checkSend` and `checkTrace` in `scripts/actor-protocol-typestate-model.mjs`. It models unique handle consumption, unary and stream cardinality, bounded stream demand (eight outstanding credits in the reference model), FIFO sequences, single EOF/error terminal, begin/commit/settle/fail, generation invalidation and logical completion. It does not parse AttoLang, type-check real source, run an actor, perform network I/O, ensure isolation or provide compiler parity.

### Required compiler / formatter / runtime work

1. **Spec grammar and AST:** accept `protocol` declarations and actor binding without redefining actor kinds. Preserve source spelling in `atto-format`, generate stable protocol descriptors with version and deterministic hash. Ensure unknown protocol syntax never compiles as ordinary calls.
2. **Type system:** actor protocol binding, unique affine handle, flow-sensitive union-state lattice, exhaustive per-state message permission, agreed reply type, consumption and borrow/await rules, typestate across explicit branches/match, conservative unknown-state rejection.
3. **Runtime / lowering:** atomic transition and sealed-state verification; one-shot reply matching; mailbox rejection vs processing completion; generation and authority fencing; cancellation and timeout; spontaneous transition invalidation; stopped actor and hot-reload behavior.
4. **Conformance:** compile-positive/compile-negative source fixtures for disconnected Query, union state, missing reply, duplicate sender, alias, stale handle and completion; actual guest execution on each target with exact source/head SHA, runtime evidence and no zero-step CI passing claims.

Diagnostic families should include `PROTOCOL_ILLEGAL_MESSAGE_STATE`, `PROTOCOL_UNPROVEN_STATE`, `PROTOCOL_REPLY_REQUIRED`, `PROTOCOL_AFFINE_HANDLE`, `PROTOCOL_STALE_GENERATION`, `PROTOCOL_TERMINAL_INCOMPLETE`, and `PROTOCOL_IMPLEMENTATION_MISMATCH`. Only promote a backend from `NOT_VERIFIED` after its parser, static checker and runtime tests really execute.

Fixture: `tests/actor-protocol-typestate-v1.json`; reference negative tests: `tests/actor-protocol-typestate-model.test.mjs`. Existing actor state and supervised lifecycle rules remain in [`spec/05-actors-and-state.md`](../spec/05-actors-and-state.md).
