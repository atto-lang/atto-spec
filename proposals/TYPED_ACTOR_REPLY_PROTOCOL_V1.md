# Typed actor request/reply and stream response contract v1

**Status: PROPOSED / NOT EXECUTED.** This is an incremental specification layered on the typed application-message contracts in atto-spec PR #28. It is not a claim of implemented parser, scheduler, backend, or guest-runtime parity. Related existing Java host-only work: oreslang-source.java PR #1769 (staged mailbox reply sidecar) and PR #2937 (generation-fenced request correlation); those are not yet a complete source-language implementation.

## Decision and non-goals

The *nominal static type of the message* selects exactly one response cardinality: no reply, one reply, or zero-to-many replies. Keep one idiomatic target.send(message) expression, preserving mailbox-admission Result semantics. Do not select an overload by expected return type, inspect a dynamic string tag, or reinterpret ActorRef<ActorClass> as ActorRef<MessagePayload>.

The reply path is an authenticated, correlation-bound **application reply sidecar**, separate from both the ordinary inbound application mailbox and the runtime-only priority supervisor CONTROL path. A supervisor may expose a typed application-service actor reference, but its lifecycle/CONTROL channel is never a request target. These constraints apply equally to actor-to-actor, actor-to-supervisor-service and supervisor-service-to-actor traffic.

## Nominal protocol types (proposed library surface)

~~~atto
interface Message {}
interface OneWayMessage extends Message {}
interface UnaryRequest<T> extends Message {}
interface StreamRequest<T> extends Message {}
~~~

The three marker contracts are **mutually exclusive** after nominal inheritance resolution, including transitive interfaces. A message must have one statically provable response mode. Generic T is the full response value type: T may itself be a domain Result, Option, record, sum, or other Sendable value. Do not infer a mode from the presence/absence of a handler return statement. A legacy message without one of these markers retains its existing admission semantics under its explicit compatibility profile; no automatic migration to UnaryRequest<void>, Any, or a dynamic reply mode.

~~~atto
define class GetUser implements UnaryRequest<Result<User, UserNotFound>> as
    const int user_id;
end

define class SubscribeUser implements StreamRequest<UserEvent> as
    const int user_id;
end

define class AuditEvent implements OneWayMessage as
    const string text;
end
~~~

These snippets are **illustrative target source**, not passing fixtures. Exact interface-declaration and constructor spellings follow the baseline type/constructor grammar; this proposal does not create new syntax keywords. The compiler/runtime SHALL reject unbound T, overlapping modes, incompatible generic specializations, and mode erasure through Any or unchecked casts.

## Static send/receive signatures

| Message constraint | target.send(msg) type | after admission ? |
| --- | --- | --- |
| M: OneWayMessage | Result<SendReceipt, SendError> | SendReceipt |
| M: UnaryRequest<T> | Result<UnaryReply<T>, SendError> | UnaryReply<T> |
| M: StreamRequest<T> | Result<ReplyStream<T>, SendError> | ReplyStream<T> |

The above are constraint-selected generic send signatures or an equivalent associated-mode compiler intrinsic, **not three overloads differing only in return type**. The source and compiled metadata both carry the resolved message mode and T. The target ActorRef still checks the message against its existing nominal actor identity, receives payload type, sending actor's sends effect, ownership, transfer rules, and protocol generation.

~~~atto
const pending = directory.send(GetUser(42))?;
const result: Result<User, UserNotFound> = (await pending.receive())?;

const stream = directory.send(SubscribeUser(42))?;
loop
    match (await stream.receive())? over
        on Some(event) -> handle_event(event);
        on None -> break;
    end
end

directory.send(AuditEvent("signed in"))?;
~~~

UnaryReply<T>.receive() is a **consuming operation** with type Future<Result<T, ReplyError>>: the linear handle is used exactly once. It must never deliver a second application value. ReplyStream<T>.receive() is Future<Result<Option<T>, ReplyError>>: Some(value) is an item, None is normal end-of-stream, and Err is terminal failure. Stream handles have one logical consumer unless an explicit library fan-out is requested. No automatic Option or Result flattening occurs.

A separate unary-only convenience operation is permitted:

~~~atto
const result: Result<User, UserNotFound> =
    (await directory.request(GetUser(42)))?;
~~~

For M: UnaryRequest<T>, target.request(M) has type Future<Result<T, RequestError>>, where RequestError has distinct Send(SendError) and Reply(ReplyError) cases. A compiler must preserve the distinction and must not silently convert application Result<T,E> into an outer transport failure. request() must be unavailable for OneWayMessage or StreamRequest<T>. An await, including an already-ready response, obeys the existing susp/suspends effect and cooperative scheduling rules.

## Reply context and capability scope

A received request has a private, runtime-issued reply binding keyed by the current admitted application envelope. The binding is **not** an ordinary field of the request payload, and never becomes a serializable guest value or ordinary ActorRef. Source-level reply_to(req) is a proposed *context-checked accessor*, valid only while req is the authenticated currently handled message; the runtime resolves a private sidecar rather than trusting a message-provided reply address.

- For UnaryRequest<T>, reply_to(req) exposes a linear UnaryReplyTo<T>. Its send(value: T) stages exactly one reply and returns Result<void, ReplyError>. On successful handler-turn completion, the runtime atomically commits it; if the handler throws, raises, panics, cancels, fails state validation, or exits without replying, the pending requester is settled with an appropriate terminal ReplyError. A second send is a compile error when statically visible and a runtime failure otherwise.
- For StreamRequest<T>, reply_to(req) exposes StreamReplyTo<T>, which may be *explicitly transferred to a supported actor-owned continuation* with a bounded lifetime; it is not an unrestricted transferable application message. try_send(value: T) is nonblocking and may report Full. send_async(value: T) returns a future with admission/backpressure result and suspends when necessary. close() sends exactly one normal terminal marker; fail(error) sends one terminal error. Stream items already published cannot be rolled back when a later turn fails. A stream abandoned without close must fail, not hang forever.
- OneWayMessage does not admit reply_to(req); trying to call it is a compiler error.

All reply operations count as outgoing **application data** for an actor's explicit or inferred sends effect. A reply value must be Sendable across actor-owned heaps; remote crossings additionally require Serializable and checked protocol negotiation. Staged replies and stream items must not borrow mutable actor state beyond a protected turn or suspension boundary.

The implementation MAY lower this to a VM-private reply slab/call-binding sidecar as in the existing Java foundation. It must not change the ordinary application message bytes or leak mutable reply slots into untrusted payload graphs. An asynchronous stream continuation requires a separate leased, owner-checked writer, not misuse of a synchronous handler-turn reply token.

For the proposed `define unary http actor` return-value syntax, `ActorMail<M>.respond_with(R)` one-shot sugar, optional `send_back` alias, and mandatory stage-before-commit behavior, see [Unary actor return and reply sugar v1](UNARY_ACTOR_RETURN_AND_REPLY_SUGAR_V1.md). That companion is **PROPOSED / NOT EXECUTED**, and does not confer executable compiler or runtime support.

## Identity, boundedness, race rules

- Each accepted request obtains a caller- and callee-incarnation-fenced correlation key (for example a bounded slot + generation within a VM-issued endpoint incarnation). No globally unique UUID is required for local calls. Cross-host transport must authenticate a transport-bound equivalent.
- Admission of a request and installation of its reply slot are atomic: no successfully admitted request can lose its correlation key; no failed admission leaks a live slot. SendReceipt means **mailbox admission only**, not handler success.
- Pending unary handles, reply slabs, stream buffers and writer leases have explicit finite resource limits and deadlines. Exhaustion is a typed admission failure, not an unbounded allocation or silent drop.
- Cancellation, timeout, actor retirement, supervisor restart and hot-reload generation change settle unresolved replies exactly once; late/duplicate/stale responses are rejected and never resolve a recycled slot (ABA fencing).
- Concurrent requests may complete out of send order. Within a single stream, accepted items preserve that stream's sequence order. The stream has a single terminal state; items after close/fail/cancellation are rejected.
- Runtime-owned completion bookkeeping may wake the caller's scheduling lane, but cannot directly run arbitrary guest code inside a foreign actor turn. Cancellation must not forge supervisor CONTROL messages.
- A producer cannot busy-spin on a full stream; backpressure suspends or returns Full. A consumer that drops its handle cancels the producer lease, subject to deterministic cancellation/close arbitration.
- Self-request followed by await in an actor configured for one non-reentrant message turn is a deadlock hazard. The checker should reject statically provable waiting on an answer that only the same occupied turn can produce; dynamic cases must fail with a bounded deadlock/timeout diagnostic. Awaiting under critical-write or an illegal borrow across suspend is rejected independently.

## What self.send means

self.send(x) means send to the current actor's **own application mailbox** if the actor exposes that capability; it does **not** mean send to its supervisor. Send a typed application request to a supervisor through a separately obtained, explicitly authorized service ActorRef. There remains only one designated supervisor in the lifecycle graph; a supervisor reference does not grant CONTROL authority. The programmer must not be allowed to cast an application send/reply handle into CONTROL.

## Static ambiguity and rejection rules

- If msg has a union type with different response modes or different response payload T, target.send(msg) is rejected without explicit match/narrowing. No silent AnyReply union or dynamic fallback.
- Generic helpers may accept M constrained to UnaryRequest<T>, StreamRequest<T> or OneWayMessage, and must preserve the corresponding T and mode across type inference and full AOT monomorphization.
- The sends effect for send(msg) includes the emitted message type. The sends effect for reply_to(req).send(item) / send_async(item) includes the reply item type, not the original request type.
- A mismatch between actor receives contract and message type, a missing sends effect, unsupported reply mode, wrong T, multiple response modes, stale incarnation, forged reply source, or CONTROL payload attempted through the application path is a hard failure, not an unchecked warning.
- A compiler lacking actual typed reply-lowering and suspension support must reject the program with an explicit unsupported diagnostic and emit no false runnable artifact.

## Conformance targets (all NOT_EXECUTED until verified)

| ID | Target |
| --- | --- |
| ACTOR-REPLY-01 | OneWay send: receipt only; receive() compile-rejected |
| ACTOR-REPLY-02 | Unary send: inferred UnaryReply<T>; successful reply exactly once |
| ACTOR-REPLY-03 | Unary second receive rejected (linear usage) |
| ACTOR-REPLY-04 | Multiple in-flight unary requests respond out of order, correctly correlated |
| ACTOR-REPLY-05 | Domain Result<T,E> preserved inside outer transport Result |
| ACTOR-REPLY-06 | Stream emits multiple Some items in order then None |
| ACTOR-REPLY-07 | Stream backpressure/Full and bounded cancellation |
| ACTOR-REPLY-08 | Handler exits or panics without unary reply: terminal failure |
| ACTOR-REPLY-09 | Duplicate, late, stale-generation and forged replies rejected |
| ACTOR-REPLY-10 | Actor -> supervisor application service unary; CONTROL remains independent |
| ACTOR-REPLY-11 | send effect checks outgoing reply payload T |
| ACTOR-REPLY-12 | Unsupported mixed-mode union without match rejected |
| ACTOR-REPLY-13 | Await on provably self-dependent non-reentrant reply rejected |
| ACTOR-REPLY-14 | Await across critical-write / forbidden borrow rejected |
| ACTOR-REPLY-15 | request() only accepts unary messages; Send vs Reply errors distinct |
| ACTOR-REPLY-16 | Cross-isolate protocol generation and Serializable rejection before admission |
| ACTOR-REPLY-17 | AOT generic specialization preserves reply mode and T |
| ACTOR-REPLY-18 | Slot exhaustion and slot reuse have bounded failure/ABA protection |

Tests are not executable guest proofs merely because a reference-model fixture or syntax example exists. Promote each backend independently only with exact-head source/toolchain identity, executed positive/negative compiled guest cases, runtime reply traces, and authenticated CONTROL isolation. Include Java, LLVM, .NET, Wasm, Forge and any additional supported source backends in the matrix. Old ActorRef<ActorClass> spelling and .ores compatibility must not be silently broken.

## Migration and next implementation slices

1. Type resolution: sealed response mode and T on message HIR and actor method resolution; compiler rejection of conflicting/unknown modes.
2. Source grammar/formatter: unchanged send syntax, proposed reply_to(req) contextual accessor, request() convenience, match/Option stream-consumption examples.
3. Runtime: build on the existing bounded generation-fenced caller registry, VM-private call-binding sidecar and caller-lane completion; prove atomic admission and settlement.
4. Streaming: independent bounded writer lease, sequence/terminal discipline, backpressure and cancellation; do not pretend one-shot infrastructure alone implements streaming.
5. Cross-backend fixture execution and independent source/AOT/host verification before marking any backend supported.
