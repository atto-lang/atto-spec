# Unary actor return and ActorMail reply sugar v1

**Status: proposed contract / NOT EXECUTED.** This companion extends TYPED_ACTOR_REPLY_PROTOCOL_V1.md (draft PR #40), typed receives/sends (draft #28), and pipe receives/emits/sends (draft #41). It does not establish parser, code generation, scheduler, ABI, or backend parity.

## Cardinality, actor kind and ingress

Message response mode is a NOMINAL property of the accepted application message:
- OneWayMessage: zero replies; only an admission receipt.
- UnaryRequest<R>: at most one successful R and exactly one terminal settlement (R or ReplyError).
- StreamRequest<T>: zero or more ordered T values, then exactly one terminal close or failure.

An ordinary actor may handle all three modes. A proposed **unary** actor modifier requires *every* admitted message to have nominal UnaryRequest<R> mode. It does not change scheduler concurrency, actor ownership, message ordering, supervisor structure, or any message's own protocol. Unary does not mean serial. Response-mode dispatch must never be selected by expected return type or by checking a dynamic string.

The proposed modifier order is **define unary http actor Foo** or **define unary actor Foo**; existing **define http actor Foo** remains an ordinary actor. The semantic signature is a normal sealed **receive(ActorMail<M> m): R** where M implements UnaryRequest<R>. An HTTP adapter may define HTTPRequest as UnaryRequest<HTTPResponse> in compiler-visible versioned metadata. Such a binding must be explicit and validated; arbitrary HTTP-shaped classes do not automatically gain reply authority.

~~~atto
// Illustrative target syntax; not a passing compiled-guest fixture.
define unary http actor Foo receives HTTPRequest sends HTTPResponse as
    susp receive(ActorMail<HTTPRequest> m): HTTPResponse {
        const payload = await xyz(m.value);
        return new HTTPResponse(200, payload);
    }
end
~~~

Returning R stages R in the SAME runtime-private, correlation-bound one-shot reply slot exposed by reply_to(m).send(R). On successful turn completion the runtime commits it atomically. A thrown, raised or panicked error, actor cancellation, state-validation failure, timeout, or retirement before commit must discard the staged reply and settle a terminal ReplyError exactly once. Supervisor CONTROL notices remain authenticated and independent; reply completion is not a CONTROL message. A missing response must fail the caller rather than hang. A unary actor with a nonvoid receive return must reject any additional respond_with or reply_to(m).send inside that handler.

A unary HTTP response is one HTTPResponse envelope, potentially with an independently managed streaming HTTP body. Such a body does not make the application message StreamRequest<T>. Truly correlated item-by-item stream replies require StreamRequest<T>.

The request handler's return value MUST be a statically validated R. Mixed message unions with distinct response types require explicit typed narrowing into appropriate handlers; a single erased receive(ActorMail<any>): R is not proof. Neither any nor unchecked casting can create reply authority.

## Explicit replies in ordinary actors

An ordinary actor may use receive(ActorMail<M> m): void for M: UnaryRequest<R>. The proposed **m.respond_with(value)** is a compiler intrinsic sugar spelling for reply_to(m).send(value), with exactly the same private reply slot and linear capability. It returns Result<void, ReplyError> for a valid R. Calling it stages one reply; it does NOT perform an ordinary ActorRef.send, emit on the pipe, serialize a reply address, or publish immediately.

~~~atto
// GetUser must be a nominal UnaryRequest<User>.
define actor Directory receives GetUser sends User as
    susp receive(ActorMail<GetUser> m): void {
        const user = await lookup(m.value.user_id);
        const staged: Result<void, ReplyError> = m.respond_with(user);
        // Handle Err explicitly when the reply is already terminal.
    }
end
~~~

For the SAME admitted envelope, a statically visible second respond_with call or mix of respond_with and reply_to(m).send is a linearity/type error. A dynamically racing or late second call fails with ReplyError (already settled, cancelled or stale generation) and must NEVER overwrite a previously successful response. Only the current authentic handler context may obtain the reply capability; it cannot be cloned, forged, serialized, leaked to another actor, or borrowed over forbidden suspension boundaries.

The candidate **m.send_back(value)** should NOT be a second builtin. It ambiguously implies sending an ordinary message to an actor sender. If a migration profile accepts send_back, it MUST be only an exact alias of respond_with: same one-shot slot, typing, result and failure behavior. An argument-free respond_with() may only be admitted for a well-typed unit/void unary response; it must not synthesize HTTPResponse, ACK a one-way message, or imply a stream close.

A void handler can receive a typed union of OneWayMessage, UnaryRequest<T>, and StreamRequest<T> values, but reply operations are authorized only after flow-sensitive narrowing of the *authenticated ActorMail envelope* to the request's nominal type. Narrowing m.value alone must preserve its association to the original envelope; a cast of ActorMail<any> may not claim an arbitrary reply mode or type. Every normal terminal path for a unary request must stage a reply or explicitly fail; on undecidable paths, runtime settles MissingReply as a terminal ReplyError. A plain return; is not a successful nonunit unary response.

## Stream reply: separate from emits

For StreamRequest<T>, a proposed **m.reply_stream()** obtains a bounded, correlated StreamReplyTo<T> lease. The writer can publish zero-to-many items via try_send(T) or send_async(T), preserving order and respecting backpressure; then exactly one close() or fail(error). After termination, cancellation, deadline, retirement or generation change, sending items or a second terminal fails. For an asynchronously continued producer, transfer the writer only through an explicitly checked, bounded actor-owned continuation; a turn-local mail reference may not escape.

Neither respond_with(T) nor send_back(T) is a stream-item method. A UnaryRequest cannot obtain reply_stream. A OneWayMessage cannot obtain either reply kind. Declared **emits E** and emit(E) provide a continuous *pipeline* output, not a unary response and not a correlated reply stream. **sends U** is the independent outbound application effect and includes reply payload R or stream item T. The ordinary application mailbox, reply sidecar, pipe output and supervisor CONTROL are four distinct channels.

## Atomicity and resource safety

- Request admission and bounded correlation-slot allocation occur atomically. Failed mailbox admission cannot leave a live slot.
- Unary results are staged until successful handler completion; raise/throw/panic/cancel after staging produce one terminal error, never a success plus error.
- Replies bind caller and callee generations/incarnations; ABA reuse, restarted actors, stale continuations and cross-isolate forgery must be rejected.
- Concurrent unary calls have independent slots and may complete out of order, independent of whether the actor is also serial.
- Reply-to-self awaits that cannot make progress under a nonreentrant actor are rejected when statically provable and otherwise bounded with deadlock/timeout failure.
- No suspension under a critical state lease and no borrowed actor state crossing a reply send or actor-ownership transfer.
- Cross-heap reply payloads require Sendable; remote replies also require Serializable and negotiated protocol versions.
- Normal Result.Err application responses do not become supervisor failure notices. Uncaught raise/throw/panic follow existing actor failure escalation rules.

## Additional conformance targets: all NOT_EXECUTED

| ID | Required behavior |
| --- | --- |
| ACTOR-REPLY-19 | Unary HTTP handler returns typed HTTPResponse and commits one correlated reply |
| ACTOR-REPLY-20 | Return-value reply and explicit respond_with/reply_to.send cannot coexist in unary receive |
| ACTOR-REPLY-21 | Unary actor rejects OneWayMessage, StreamRequest, erased any and wrong R |
| ACTOR-REPLY-22 | Ordinary actor serves nominal UnaryRequest<R> with typed respond_with(R) |
| ACTOR-REPLY-23 | Double respond_with, mixed alias use, cloned reply capability are rejected |
| ACTOR-REPLY-24 | Stage then panic/raise/cancel discards staged success and settles terminal error |
| ACTOR-REPLY-25 | Handler exit without required reply returns terminal MissingReply, never hangs |
| ACTOR-REPLY-26 | ActorMail<any> or detached payload narrowing cannot forge a reply type |
| ACTOR-REPLY-27 | Stream sends N ordered values then one close/fail; post-terminal operations fail |
| ACTOR-REPLY-28 | emit, ordinary send, respond_with and reply_stream remain independent |
| ACTOR-REPLY-29 | send_back compatibility alias, if enabled, is the SAME linear permission |
| ACTOR-REPLY-30 | HTTPResponse with streamed body stays one unary HTTP envelope |
| ACTOR-REPLY-31 | Concurrent unary requests have separate correlation slots across generations |
| ACTOR-REPLY-32 | Zero-argument respond_with allowed only for unit unary responses |

All examples are design source, not evidence of executable compiler support. Promote Java, LLVM, .NET, Rust/Wasm and other backends independently only with exact-head compiled guest positive/negative fixtures, runtime correlation traces, and authenticated supervisor CONTROL isolation.

## Supervisor application-service requests (distinct from CONTROL)

Every actor still has exactly one lifecycle supervisor. The supervisor's
runtime-authenticated priority CONTROL ingress is never an application reply
target, cannot be forged from ActorMail, and is not counted in receives, sends
or emits. A supervisor may also expose an explicitly authorized, typed
application-service ActorRef. That is an ordinary DATA mailbox plus a private
correlated reply sidecar, **not** a capability to manufacture control notices.

~~~atto
// Illustrative target source; no compiled-guest support claimed.
// FetchPolicy implements UnaryRequest<Policy>.
define actor SupervisorApi receives FetchPolicy sends Policy as
    susp receive(ActorMail<FetchPolicy> m): void {
        const result: Result<void, ReplyError> =
            m.respond_with(current_policy());
        // Handle a failed staging result explicitly.
    }
end

// A worker is granted an ActorRef<SupervisorApi> application capability.
// This does not expose the lifecycle supervisor's CONTROL ingress.
const policy = await supervisor_app_ref.request(FetchPolicy());
~~~

A supervisor-directed DATA request follows the same nominal message mode,
receives/sends effect, bounded mailbox admission, correlation slot, timeout,
ownership, caller and callee incarnation fences, and Sendable/Serializable
rules as any peer actor request. Its reply cannot travel through the priority
CONTROL lane, even if the caller or callee is a supervisor. Backpressure on
the DATA mailbox must not prevent authenticated actor panic/termination
notices from reaching the supervisor's reserved CONTROL path.

Normal application Result.Err responses remain DATA successes carrying an
error-valued payload. Uncaught handler throw/raise/panic produces a terminal
ReplyError for the caller and the existing independent supervisor failure
notice. A supervisor restart or child hot-swap invalidates stale reply
capabilities but must not allow a late reply to resolve a recycled slot.

Additional guest conformance IDs, all NOT_EXECUTED:

| ID | Requirement |
| --- | --- |
| ACTOR-REPLY-33 | Authorized actor-to-supervisor-service unary DATA request and typed response |
| ACTOR-REPLY-34 | Forged CONTROL notice via ActorMail, respond_with, send or emits rejected |
| ACTOR-REPLY-35 | Saturated application/reply mailbox cannot starve priority CONTROL failure notice |
| ACTOR-REPLY-36 | Panic produces distinct caller reply error and supervisor CONTROL notice with fenced generation |
