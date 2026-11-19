# Proxy actor acknowledgments, ask, and durable delivery v1

**Status: PROPOSED / NOT EXECUTED as compiled Atto guest code.** This is an extension of [typed actor replies](TYPED_ACTOR_REPLY_PROTOCOL_V1.md), [unary reply sugar](UNARY_ACTOR_RETURN_AND_REPLY_SUGAR_V1.md), and the existing ActorRef/mailbox-admission contract. It does **not** claim that Atto proxy actors, remote actors, virtual activation, or any backend currently implement these operations. Compiler-generated class interception proxies in atto-spec#83 are a **different feature** and must not be conflated with routing proxy actors.

## Intent and exact guarantees

A proxy actor is a typed, authorized routing endpoint for a destination actor (local, virtual, remote or behind an ActorGroup). Its own ingress and forwarding queue are **not** the destination's mailbox. A proxy may return a positive destination-admission acknowledgment only upon a runtime-verified destination admission receipt; it may never forge receipt, execution, commit or durable outcome merely because its own forward operation succeeded.

| Observable stage | Meaning | Required authority |
| --- | --- | --- |
| Dispatched | Sender submitted work to a proxy/transport | Local sender/proxy bookkeeping; **not** a recipient ACK |
| Admitted | Final destination's bounded application mailbox atomically accepted the message | Destination mailbox, verified target incarnation |
| Started | Destination acquired a receive turn for this exact message/attempt | Destination scheduler/turn lease |
| Processed | Handler turn completed successfully and effects were committed under the actor's declared contract | Destination runtime commit decision; application errors remain typed values |
| Durable | A configured durable provider committed the specified inbox/event/outbox transaction and deduplication record | Provider-confirmed durable commit; not RAM or a forwarded packet |

**Durable and Processed are not a universal total order**: a durable inbox admission can precede handler execution, while a durable *processing-result* commit follows it. The selected durability scope is part of the declared contract. It is invalid to infer Processed from Durable(inbox) or Durable(result) from an in-memory Processed acknowledgment.

## Proposed library surface, without new language keywords

- `actor.send(msg)` preserves existing `Result<..., SendError>` destination **mailbox-admission** meaning for local/known-synchronous routes. A proxy cannot return `Ok` merely for its own queue or socket write. For remote/deferred routes requiring a round trip, use `send_async` or a receipt-bearing operation; a target whose profile cannot prove destination admission must reject rather than report false success. Existing nominal `OneWayMessage`, `UnaryRequest<T>` and `StreamRequest<T>` mode-selected results remain authoritative.
- `actor.send_ack(msg)` proposes a bounded pending handle whose `await` settles on **destination Admitted**, or typed failure/indeterminate. For already-admitted local sends the handle may already be ready. This is a transport receipt and does not grant reply authority to the guest message.
- `actor.send_received(msg)` similarly awaits a destination **Started** receipt. This is neither processing completion nor a guarantee that the handler will ever finish.
- `actor.send_result(msg)` awaits **Processed** plus its typed outcome. For nominal `UnaryRequest<R>`, use the existing `request(msg)` / `UnaryReply<R>` correlation and stage-before-commit semantics; never allocate a second competing reply slot. A OneWayMessage cannot silently become a UnaryRequest: use an explicit app-level ProcessAck message or a separately negotiated runtime completion receipt.
- `actor.send_durable(msg)` is valid only when a durable inbox or durable processing/outbox capability and *durability scope* are explicitly advertised. Acknowledge only after the actual provider commit (including dedupe/outbox atomically when required); unsupported providers return an explicit error. A durable success does **not** promise exactly-once execution or universal external side effects.
- `actor.ask(request)` may be a library alias of existing unary-only `actor.request(request)`, returning `Future<Result<R, RequestError>>`. Never assign Akka's `?` request operator: Atto reserves `?` for Result/Option early-exit. A request/reply is an application response, not a supervisor CONTROL notice.
- `actor.get_done()` remains an actor-lifecycle join, not any message's acknowledgment.

All new forms above are **proposed**, not assumed parser-valid. Prefer library methods with snake_case names and keep the established send result's typed response-mode selection. If the language cannot express a particular operation on the chosen type/profile, reject at compile time or with `Unsupported`, rather than emulating stronger guarantees in a proxy.

## Authenticated correlation and backpressure

A delivery/correlation identity is scoped at least by: tenant/account, caller identity/incarnation, target logical actor ID, target incarnation/generation, protocol version, message ID, delivery attempt, and a non-replayable runtime-issued receipt/permit. The raw message ID or serialized ActorRef **is not a capability**. An ACK is accepted only from the intended destination/runtime or authorized durable provider through an authenticated, versioned sidecar. It is not an ordinary `ActorMail` payload and never enters or impersonates the reserved supervisor CONTROL lane.

- Every proxy hop propagates the same end-to-end request identity with a distinct authenticated forwarding-hop identity; intermediate acceptance is never terminal destination acceptance.
- Accept only an exact, nonexpired, generation-matched receipt. Reject forged, wrong-tenant, wrong-target, wrong-attempt, wrong-protocol, stale-after-restart and recycled-slot (ABA) responses.
- Bounded mailboxes, pending receipts, retransmission state, correlation slots, deduplication windows, and timeout wheels must have explicit limits. Saturation returns `Full`/backpressure without losing a successfully admitted message or starving CONTROL.
- Deliver each stage to a waiting sender **at most once**; an exact duplicate ACK is idempotent. Reject conflicting terminal results, stage regression and publication before the underlying action. A late ACK cannot mutate a settled/recycled slot.
- Successful destination admission and allocation of a necessary correlation slot must be atomic. Closing/draining an actor is linearizable against admission; cancellation releases resources exactly once.
- A handler may return an application `Result.Err` as a **successful typed reply**. A panic/raise/uncaught throw instead produces a terminal processing error and the independent supervisor notice. A staged response is not Processed until successful turn commit.
- Cross-actor payloads require `Sendable`; cross-isolate/network payloads additionally require `Serializable`, protocol compatibility, transport authentication, tenant capability and quota checks.
- Blocking network round trips must not park an OS carrier, run guest code from a transport callback, or hold actor-state `critical-write` across suspension. Use cooperative suspension with deadlines and cancellation.

## Failure semantics, retry, and exactly-once boundaries

The sender must distinguish `Rejected` (definitive no admission), `Failed` (known negative processing/commit outcome), `Timeout`, `Cancelled`, and `Indeterminate` (e.g. connection lost after possibly admitted send or persisted commit before ACK). A timeout does not prove non-delivery. Retrying an indeterminate request creates a fresh **attempt** under the same logical message ID. An application wanting effect-level idempotence must supply a durable deduplication key and atomic inbox/handler/outbox policy; proxy-side RAM dedupe is insufficient after crash.

A virtual actor may be inactive or move between placements. A proxy must bind each receipt to the *actual activation incarnation*; a router redirect or successful lookup is not delivery. ActorGroup fan-out or one-member selection must be explicit and unauthorized groups must fail closed. Forwarding to a child/upstream/downstream actor never implicitly replies to the parent or supervisor.

## Illustrative target usage (not executable conformance evidence)

~~~atto
// ProcessWork implements UnaryRequest<Result<Done, WorkError>>.
const pending = proxy.send_ack(ProcessWork(42));
const admission = await pending;          // destination mailbox acceptance only

const completed = await proxy.request(ProcessWork(43));
// typed reply or explicit RequestError, independently of admission

// Requires negotiated durable result-commit policy.
const durable = await durable_proxy.send_durable(PersistJob(44));
~~~

## Required conformance before claiming parity

The companion atto-platform-conformance draft #40 carries a Rust **host reference model**, not compiled Atto guest proof. Target guest cases: proxy-only enqueue must not ACK destination, remote confirmed admission, started-not-processed, stage-then-panic, durable inbox vs durable result, no-provider rejection, crossed/corrupted/duplicated ACK, replay after activation change, uncertain send/timeout/retry, quota/backpressure, cancellation/restart races, typed ask versus unary request, supervisor CONTROL isolation, cross-tenant denial and cross-backend wire-version mismatch.

For **each** Java, LLVM, Wasm, .NET, Forge, Rust/Cranelift and JS backend, record independent compiler-accepted/compile-rejected .atto fixtures, a real guest execution trace (including actual sender and recipient), compiled AOT evidence where promised, and exact-head CI logs. Do not label host-only tests as guest/compiler parity. Keep existing overlapping PRs #28, #40, #83, #113 and source.rs #250/#254 in the integration review.
