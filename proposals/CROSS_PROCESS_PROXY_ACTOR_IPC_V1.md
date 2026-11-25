# Cross-process proxy actors, IPC and async I/O v1

**Status: DESIGN / NOT COMPILED-GUEST IMPLEMENTED.** Builds on [proxy acknowledgment v1](PROXY_ACTOR_ACK_AND_DELIVERY_V1.md), [typed actor reply protocol](TYPED_ACTOR_REPLY_PROTOCOL_V1.md), ActorRegistry, ActorGroup, and the existing supervisor CONTROL contract. This is the **message-routing proxy actor** use of "proxy"; it is separate from compiler-generated class interception in atto-spec#83.

## Goal: typed virtual references to real actors in other OS processes

An `ActorRef<A>` or typed `ProxyActor<A>` obtained in OS process A may address an authorized **real actor instance in OS process B**. Messages are serialized, framed, authenticated and routed through a host-owned IPC gateway to B's actual bounded mailbox and scheduler. A proxy actor is not an alias for a raw socket, a serialized pointer, a fresh actor instance, or a permission to execute guest code in B. Remote placement does not change actor message types or application reply cardinality.

```text
process A                                      process B
Atto actor -> typed ProxyActor<A>             Host IPC gateway -> real ActorRegistry
                     |                        |    | tenant ACL, version, capabilities
                     v                        |    v
             shared async reactor ===== UDS / TLS-TCP =====> bounded target mailbox
                   |                                      -> actor-owned receive turn
                   +<==== destination admission / started / committed reply
```

**Do not allocate an OS process, OS thread, connection, V8 isolate, or event loop per actor.** Connection pools are per authorized peer endpoint/security domain; logical actors multiplex bounded streams over a shared reactor, and routing does not bypass per-actor mailboxes. Separate untrusted tenant gateways and authorized socket capabilities from scheduler CONTROL.

## Reference lessons and deliberate Atto choices

- **Akka Typed discovery:** a receptionist/service-key style `register_service<A>` / `resolve_service<A>` / `watch_service<A>` finds actor refs by nominal type and scoped name; resolution provides **candidates**, not delivery proof. Entries are leases/tombstones with incarnation fencing; convergence can lag.
- **Akka cluster sharding:** address a logical actor identity independently of physical process/host; use a home-directory/placement epoch, redirects only after a fresh authenticated resolve, and activation through an explicit capability. No implicit `get_or_create` on an arbitrary connect.
- **Akka remoting/reliable delivery:** model remote association as a finite state machine (Disconnected -> Connecting -> Authenticated -> Ready -> Draining/Unavailable); distinguish remote suspect/unreachable from confirmed actor termination; use bounded unconfirmed-delivery tracking, idempotent ACKs, optional durable producer queue and explicit at-least-once retry semantics. Never promise effect-level exactly once without a durable application contract.
- **Vert.x event bus:** distinguish `send` to **one** selected handler, `request` to one typed responder, and `publish` to subscribers; never silently turn ActorGroup routing into broadcast. Subscribers, routing keys and registration propagation have observable readiness.
- **Vert.x service proxies:** compile nominal `ActorRef<A>` and contract metadata to AOT client/server stubs, serializers and admission checks, with zero unrestricted reflection or arbitrary inbound method dispatch.
- **Vert.x nonblocking core and TCP bridge:** use length-prefixed bounded frames, event-loop reactor, async deadlines, backpressure and connection-level write queue bounds; avoid one blocking carrier per connected socket.
- **Security improvement beyond bare bridges:** never trust a `reply_address`, arbitrary string address, user-provided actor ID or network hop receipt as authorization. Bind every operation to a verified capability, authenticated connection principal, tenant and target incarnation.

References (primary upstream documentation):
- https://doc.akka.io/libraries/akka-core/current/typed/actor-discovery.html
- https://doc.akka.io/libraries/akka-core/current/typed/cluster-sharding.html
- https://doc.akka.io/libraries/akka-core/current/typed/reliable-delivery.html
- https://doc.akka.io/libraries/akka-core/current/remoting-artery.html
- https://vertx.io/docs/vertx-core/java/
- https://vertx.io/docs/vertx-tcp-eventbus-bridge/java/
- https://vertx.io/docs/vertx-service-proxy/java/

## Legacy migration and canonical source syntax

**Do not invent a second proxy-actor grammar or an incompatible wire protocol.** The legacy Java repository already has a source-level candidate in [oreslang-source.java#543](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/543), with native grammar, contract checking, fail-closed spawn, service leases, session and stream handles, independent forward/reverse credit accounting and Rust model tests. Its grammar is the migration starting point, not proof Atto has an executing remote proxy:

~~~atto
// Proposed Atto migration of the existing Oreslang declaration, NOT compiled in Atto.
define proxy actor TransformProxy
    conforms to Transformer
    discover "workers.transform.v1"
    transport ipc
as
end

const proxy = spawn TransformProxy();
// await proxy.ready means authenticated discovery + association,
// NOT that a remote request was processed.
~~~

The existing grammar includes `transport auto|ipc|tcp|http2` (subject to compatible Atto frontend/formatter validation), with `discover` a bounded service key, not an arbitrary URL. `transport auto` must still select only explicitly authorized secure transports. A local proxy is a genuine locally scheduled/supervised actor, distinct from the remotely executing actor and from its connection. Local proxy `get_done()` and remote actor lifecycle observation are separate. `ActorRegistry.connect_async<A>(endpoint,capability)` is an optional **library path**, not a competing mandatory syntax or a substitution for the first-class proxy declaration. Do not silently turn `spawn Proxy()` into remote source execution; legacy #543 rightly rejects it while the actual remote bridge is absent.

Other legacy IPC foundations to audit and migrate *semantically*, never by blind copy:
- [Java #1350/#1352/#1354/#1356/#1366](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/1366): actor IPC boundary/admission, physically separate DATA/CONTROL lanes, session HKDF/HMAC, strict replay/sequence/tag/contract-hash rejection; importantly, no real socket/process in the earlier protocol model.
- [Java #1581](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/1581): real `ActorRuntime` -> host I/O -> authenticated socket -> terminal completion -> actor mailbox handoff, actor-carrier blocking guard and physical connection lifetime ownership. Its older exact-tree executed receipts do not certify its current head.
- [Common-source IPC delivery issue #79](https://github.com/ores-truffle-oreslang/oreslang-common-source/issues/79) and Atto [source.rs#254](https://github.com/atto-lang/atto-source.rs/pull/254): distinguish remote accepted vs handler committed, preserve terminal reply/CONTROL separation, and avoid a second correlation ledger.

Atto production wire format must be **one deliberately versioned, independently verified contract** coordinated with these foundations. The 58-byte scalar Rust frame in `proxy_actor_ipc_two_process_v1.rs` is a **test-only host envelope** and MUST NOT become the production ABI by accidental adoption. Do not assume the legacy Java `ORES` v3 framing or HMAC keying is compatible with Atto without schema review, threat-model review and cross-runtime serialization fixtures.

## Transport profiles, including other processes

| Profile | Real endpoint | Trust / deployment rule |
| --- | --- | --- |
| In-process | VM-local bounded mailbox | no serialization or network hop; preserve ownership checks |
| Same-machine Unix | Unix domain socket (UDS) | OS filesystem permissions and peer credentials where supported, plus explicit actor capability and tenant policy; no untrusted path guessing or symlink following |
| Same-machine Windows | named pipe | restricted security descriptor + authenticated peer identity + actor capability; reject world-open pipes |
| Cross-machine / containers | TCP + mutual TLS 1.3 | mandatory peer authentication, authenticated route policy and bounded frame/stream limits, including loopback production traffic when trust domains differ |
| Optional later | QUIC + mutually authenticated identity | independently versioned, negotiated and conformance-tested; no fallback from secure to plaintext |
| Browser / Wasm guest | approved host bridge/WebSocket/Worker route | browser guest has no raw UDS or Node socket authority; explicitly bound typed capability and host checks |

All transports share one logical protocol and stage semantics. **No implicit fallback** from UDS to TCP, or TLS to plaintext. A local Rust host reference test over loopback TCP/UDS is not proof of production TLS authentication, sandbox isolation or browser support.

## Canonical proposed API (illustrative, not parser-proven)

Keep method names in `snake_case`; use existing generic and `susp` conventions, not new language keywords. Exact signatures and URI lexical rules must be independently accepted by frontend/formatter before promotion.

~~~atto
// Typed registry access, *not* a freely forged ActorRef.
const endpoint = ActorEndpoint.unix("/run/atto/payment-gateway.sock");
const proxy: ProxyActor<PaymentWorker> =
    (await ActorRegistry.connect_async<PaymentWorker>(endpoint, payment_capability))?;

// The real PaymentWorker is in another OS process.
// This asks the *destination mailbox* to admit the request, not the proxy queue.
const admitted = await proxy.send_ack(CreatePayment(42));

// Typed request/reply uses existing unary correlation sidecar and Result errors.
const outcome = await proxy.request(GetPaymentStatus(42));

// Explicit service discovery/reconnection policy may use stable logical identity.
const worker = (await ActorRegistry.resolve_async<PaymentWorker>("payments", "primary"))?;
~~~

- `connect_async` resolves and validates an actual remote association; success means **authenticated connected and route authorized**, not mailbox admission. Never advertise TCP/Uds capability by constructing an unchecked string.
- A typed proxy can `send_async`, `send_ack`, `send_received`, `request`/`ask`, explicitly `publish` via a topic-capable interface, or `send_durable` only when negotiated durable scope is supported. Normal local `send` never changes its proven mailbox-admission meaning. `get_done()` observes actor termination, not request completion.
- `watch` emits `Connected`, `SuspectedUnreachable`, `Reconnected`, `Terminated`, `Retired` and `Revoked` under explicitly specified observation semantics. A lost socket is not proof of actor death.
- Outbound child/upstream/downstream `ActorRef` discovery follows least-privilege service-key and ActorGroup membership capabilities. Proxies may be re-resolved after placement changes; a stale ref never silently acquires authority to another tenant's actor.
- Receive handlers, actor-state callbacks and actual IPC work stay separated: reactor/host completion queues wake scheduled actor turns; no guest callback is run reentrantly under network poll, no actor-state lease is held across `await`, and actor ownership/Sendable/Serializable checks remain mandatory.

## Wire/association contract

A versioned, length-prefixed envelope has a fixed maximum before allocation, canonical byte order, bounded nested serialization and negotiated compatible schema IDs. Reject unknown *mandatory* extensions, illegal discriminants, oversized or truncated frames and mismatched codec hashes; never execute an untrusted deserializer in an actor's privileged memory.

Handshake must bind **protocol major/minor, node/runtime identity, authenticated peer/tenant, actor service/namespace, supported message schema IDs, tenant/account boundary, transport security policy, offered limits and allowed acknowledgment scopes**. Resolve/route additionally binds logical target ID, placement epoch, physical target incarnation/generation and a capability narrowed to message type and direction. Connection identity and actor incarnation are **different identifiers**; OS PID is diagnostic only and cannot authenticate an actor or survive restart.

Each request includes a runtime-owned correlation ID, origin caller incarnation, destination incarnation, message ID and attempt, monotonic per-association sequence, deadline and trace context. ACK/Reply frames return matching fields and an authenticated destination-issued receipt; reject cross-tenant replay, guessed IDs, reflected/tampered ACKs and stale callbacks. Correlation slots, IO buffers, admission windows, pending sends and retransmission queues are finite; avoid globally synchronized serialization locks.

**Ordering:** preserve per-(sender,target,association incarnation) message sequence while connected and accepted; do not promise total order across clients or after re-placement. A reconnect cannot infer ordering or delivery of unacknowledged requests. ACK-based retry needs idempotent processing or deduplication. A receiver may reject stale sequence, report duplicate accepted ID, or request resynchronization under a negotiated policy.

**Completion:** an intermediary can acknowledge only its own *hop*, never destination `Admitted`, `Started`, `Processed` or `Durable`. Destination `Admitted` must follow an atomic target mailbox enqueue. `Processed` follows successful handler-turn completion, including staged reply commit, and is not implied by a prior durable inbox commit. A durable result requires an authenticated persistence provider commit. Intermediate hop success is a transport metric, not an application ACK.

**Unknown outcome:** after network reset or deadline, return `Indeterminate` when remote admission may have occurred. Do not automatically replay non-idempotent requests. If durable producer queue and consumer deduplication are configured, retry same logical ID with a distinct attempt; require replay window and tombstones to survive relevant process restarts.

## IPC and I/O safety/performance

1. Inbound listener/acceptor is a host-controlled, explicitly enabled capability. Untrusted tenant guest code is never given a raw fd, other tenant socket, file handle or arbitrary network destination. On UDS, validate socket ownership and peer credentials; on remote connections, enforce mTLS and per-actor route authorization. Any operation contrary to runtime `allow-net`/socket policy fails before connect/admission.
2. Reactor owns nonblocking socket lifetime. Scheduler pools remain independent; per-connection reader/writer and bounded parse buffers do not become OS threads. Use vectored I/O where sensible, bounded write batching, explicit high/low-water marks and fair per-tenant/per-actor quotas; reserved CONTROL always has priority in its separate authenticated path.
3. Outbound network I/O from an actor is either an authorized network capability or a typed I/O proxy/sidecar; no implicit filesystem/process/env access follows from having an ActorRef. All async I/O is suspension-safe; any `_blocking` compatibility API must not park a scheduler carrier.
4. Lifecycle is deterministic: connection/actor close drains within a deadline, fails unresolved receipts exactly once, fences old incarnations and retires buffers. Reconnect uses capped exponential backoff with jitter, avoids thundering herds, honors revocation immediately and never downgrades security.
5. Observability is per hop and end-to-end: queue occupancy, send/ACK latency, retry rate, receiver processing latency, TLS/UDS authentication failures, false-stage prevention, trace/span propagation and route incarnation; never log sensitive capabilities, raw credentials or payloads without authorization.

## Required staged verification

- **Stage A (host-only):** spawn **two real OS processes**, connect actual UDS and loopback TCP endpoints, exchange bounded typed frames, demonstrate authenticated-in-test target/tenant/version fencing, distinct admitted/processed receipts, explicit `Indeterminate` on ambiguous close, and reject malformed, wrong-target and wrong-version inputs. This is **not** cryptographic, compiler or runtime-integrated proof.
- **Stage B (real backend):** wire `ActorRegistry`/proxy `ActorRef`, actual mailboxes, scheduler + OS nonblocking reactor, and private DATA reply sidecar to compiled `.atto` guests. Test that the remote actor's source `receive` executes in the second process, not in a JavaScript or Rust host imitation.
- **Stage C (secure production):** demonstrate real UDS credential checks, TLS 1.3 mutual certificate validation, rotate/revoke credentials, prevent ACL confusion and hijacked socket access, verify malformed binary frames with fuzzing, and test process kill/restart, out-of-order/duplicate/stale/forged ACK, backpressure and runtime watchdog behavior.
- **Stage D (parity):** independent exact source tree/SHA CI evidence for Java/GraalVM, LLVM, Wasm, Forge, .NET, Rust/Cranelift and JS targets. Record unsupported cases explicitly; do not promote host-model runs to guest or NativeAOT proof.

Related Atto work: atto-spec#28/#40/#76/#113; atto-platform-conformance#40/#96; atto-source.rs#250/#254/#310; atto-playground#74. Avoid feature forks or unreviewed merge of overlapping drafts.
