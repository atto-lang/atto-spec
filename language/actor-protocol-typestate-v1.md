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

Required static judgement: `send(P, S, M)` is legal iff **every** state in the compiler's possible state set `S` admits message `M`, all possible branches agree on the reply type, and every declared successor is tracked. `Disconnected | Connected` can `Close` (both reply `ClosedAck` and enter `Closed`); it cannot `Query`. A raw `ActorRef`, dynamic state, unproved union, mutable alias, borrowed handle crossing a suspension, or a concurrent second sender has **no static state guarantee** and must use an explicitly runtime-checked admission path or be rejected. Do not simply cast a shared ref to a typed handle.

Call progression is two phase: `(Handle<S>, M) -> PendingCall<Reply, NextStates>` consumes the handle before admission; a matching successful completion yields `(Reply, Handle<NextStates>)`. Queued, unprocessed or timed-out messages do **not** mint the successor. A single handle cannot have two overlapping state-changing calls. No implicit copy, `share!`, fork, or clone is permitted. All functions/methods follow snake_case; surface spellings such as `complete_protocol()` and `call()` are proposed, not committed API.

## Replies, effects, failure and closure

- Each declared `call` transition specifies exactly one required successful reply **type**. An admitted synchronous request must eventually resolve to that reply **or an explicit terminal error** (cancellation, timeout, shutdown, panic, stale generation, etc.). Static checking does not promise scheduling fairness or successful delivery. The runtime must enforce one-shot correlation, reject duplicates, and never turn mailbox admission `Ack` into processing success.
- If admission fails **before** publication and the original token is provably intact, an explicitly typed rejected-admission result MAY return that token. Once delivery is possible, timeout/cancel/disconnection is uncertain: conservatively consume the old token, return no next-state proof, and require authenticated resynchronization, fencing or shutdown. Do not assume the actor stayed in its former state.
- Protocol completion is a **logical** terminal-state proof plus no outstanding transition/reply obligations and no remaining live linear handle. It is **not** physical retirement. `get_done()` continues to wait for runtime termination/finalizers and supervisor obligations. Reaching a terminal state is not a proof that the actor terminated.
- `Closed` is terminal and accepts no new DATA protocol events. No reply is silently dropped on close. CONTROL notices, panic escalation, `on_raise`, cancellation, state clean-up and the supervisor remain independent of protocol DATA admission.
- Mutable internal timers, lifecycle hooks, hot-loading or other senders cannot invalidate a live static handle invisibly. They must either preserve its witnessed state, revoke/version-fence the handle before changing protocol state, or operate through an explicit dynamic checked state transition. Cross-tenant and cross-incarnation reuse is invalid. Hot upgrade requires a versioned migration proof or invalidates every old handle.

## Runtime mapping to Erlang/OTP gen_statem (29.1.1, stdlib 8.1)

The runtime may implement a protocol using state-function or handle-event dispatch, transition actions, state-enter callbacks, postponed events and state timeouts, following [Erlang `gen_statem` documentation](https://www.erlang.org/docs/29/apps/stdlib/gen_statem.html). These are **runtime mechanisms**, not compile-time guarantees.

- Event type plus control-state dispatch maps to `(state, message)` transitions; reply actions settle the pending typed reply obligation.
- `postpone` does not change protocol state and cannot satisfy a pending call, fake a reply, or postpone a terminal obligation forever without a declared failure/cancellation path.
- `state_timeout`, `next_event` and state-enter callbacks may change state asynchronously. Any transition that invalidates externally held typestate must revoke/fence the proof; v1 rejects declaring these as untracked spontaneous transitions.
- Transition processing must serialize the protocol-state commit with the sealed actor state mutation, mailbox admission/reply correlation and generation checks. Concurrent actor turns cannot use a stale state proof after another committed transition.
- Actor stop or crash does not bypass authenticated supervisor CONTROL, sealed-state `critical-read`/`critical-write`, bounded mailboxes, ownership transfer or the one-shot reply contract.

## Static proof checks and admitted scope

Finite protocol declarations are bounded to **64 states, 256 transitions and 512 reference trace steps**. Duplicate `(state, message)` rules, unknown states, terminal outgoing transitions, reply-less calls, unreachable declared states, and states with no *graph path* to a terminal state are rejected. Graph reachability is only a structural sanity check and MUST NOT be reported as a proof of termination/liveness: a Query loop may run forever.

The reference checker provides `validateProtocol`, `checkSend` and `checkTrace` in `scripts/actor-protocol-typestate-model.mjs`. It models unique handle consumption, begin/resolve/fail, strict reply types, generation invalidation and logical completion. It does not parse AttoLang, type-check real source, run an actor, perform network I/O, ensure isolation or provide compiler parity.

### Required compiler / formatter / runtime work

1. **Spec grammar and AST:** accept `protocol` declarations and actor binding without redefining actor kinds. Preserve source spelling in `atto-format`, generate stable protocol descriptors with version and deterministic hash. Ensure unknown protocol syntax never compiles as ordinary calls.
2. **Type system:** actor protocol binding, unique affine handle, flow-sensitive union-state lattice, exhaustive per-state message permission, agreed reply type, consumption and borrow/await rules, typestate across explicit branches/match, conservative unknown-state rejection.
3. **Runtime / lowering:** atomic transition and sealed-state verification; one-shot reply matching; mailbox rejection vs processing completion; generation and authority fencing; cancellation and timeout; spontaneous transition invalidation; stopped actor and hot-reload behavior.
4. **Conformance:** compile-positive/compile-negative source fixtures for disconnected Query, union state, missing reply, duplicate sender, alias, stale handle and completion; actual guest execution on each target with exact source/head SHA, runtime evidence and no zero-step CI passing claims.

Diagnostic families should include `PROTOCOL_ILLEGAL_MESSAGE_STATE`, `PROTOCOL_UNPROVEN_STATE`, `PROTOCOL_REPLY_REQUIRED`, `PROTOCOL_AFFINE_HANDLE`, `PROTOCOL_STALE_GENERATION`, `PROTOCOL_TERMINAL_INCOMPLETE`, and `PROTOCOL_IMPLEMENTATION_MISMATCH`. Only promote a backend from `NOT_VERIFIED` after its parser, static checker and runtime tests really execute.

Fixture: `tests/actor-protocol-typestate-v1.json`; reference negative tests: `tests/actor-protocol-typestate-model.test.mjs`. Existing actor state and supervised lifecycle rules remain in [`spec/05-actors-and-state.md`](../spec/05-actors-and-state.md).
