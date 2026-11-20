# AttoLang Live Runtime DevTools / MCP v1 (proposed)

Status: **proposed**, November 2026. This document defines a normative *target* contract;
it is not evidence that an AttoLang compiler, any runtime backend, or hot migration
already implements it. Existing repository names may retain the legacy Oreslang spelling.

## Architecture and ownership

MCP is an optional development/control-plane *adapter*, not an executor, scheduler,
supervisor, actor state accessor, or new language keyword. AttoLang's Actors, Tasks,
Thread/Task/ActorLocal storage, `async/await`, channels, sealed state, ownership and
supervisor CONTROL semantics remain authoritative. The runtime owns the actual
inspection, safepoint, upgrade and resource-budget operations. An MCP client cannot
be given a raw actor handle or a mutable borrow.

The first implementation MUST be read-only and explicitly opt-in by a trusted
host/embedder. No guest code may enable the listener or mint devtools credentials.
The API MUST be usable from a local CLI independently of the MCP wire transport.
No capability is inferred from mere connection to an HTTP socket.

## Transport profile

- Version: MCP `2026-07-28` over **stateless Streamable HTTP**; no
  `initialize` handshake, GET event stream or `Mcp-Session-Id` state.
- Exact endpoint: `POST /mcp`; application/json responses are sufficient for
  immediate request/response operations. Every modern request MUST have
  `Mcp-Protocol-Version`, `Mcp-Method` and, where applicable, `Mcp-Name`.
  Reject header/body disagreement and unsupported versions. Every request
  carries `params._meta` with `io.modelcontextprotocol/protocolVersion` and
  `io.modelcontextprotocol/clientCapabilities`; 2026 responses use
  `resultType: complete` and server identity in result `_meta`.
- `server/discover`, `tools/list` and `tools/call` are mandatory for v1.
  Tools are deterministic and read-only in this phase. Response `ttlMs=0` and
  `cacheScope=private` prevent stale/sharable runtime state.
- All HTTP requests carry an authenticated principal. First rollout uses a
  host-injected, high-entropy, short-lived bearer credential **only on loopback**.
  Bearer credentials are never accepted in URLs or logged. Remote deployment
  requires TLS, OAuth resource indicators/audience checks, authorization-server
  discovery and a separate security review. Loopback mode MUST NOT claim OAuth
  compatibility.
- Bind only `127.0.0.1` (or a host-authorized local socket), never `0.0.0.0`.
  Enforce Host and Origin allowlists against DNS rebinding. No CORS wildcard.
  Every request has bounded bytes, parsing depth, concurrent handlers and time.
  Any invalid/missing authorization fails closed, including on discovery.
- Default is disabled. Never start under an untrusted actor, guest-provided
  process flag or without a distinct host authorization path.

MCP v1 tools, allowed on read-only role `runtime.inspect`:

| Name | Input | Result | Semantics |
| --- | --- | --- | --- |
| `atto.runtime_info` | empty object | typed, bounded runtime summary | Actual per-runtime actor count and backend identity, not fabricated actors |
| `atto.list_actors` | optional limit (1–64) | detached actor descriptors | **PROPOSED** (Java prototype: oreslang-source.java#2454, unmerged draft): supervisor-authorized weakly consistent metadata; no actor-private state |
| `atto.inspect_actor` | actor UUID | one detached actor descriptor | **PROPOSED** (Java prototype: oreslang-source.java#2454, unmerged draft): no hidden state or raw pointer access |
| `atto.list_tasks` | optional limit (1–64) | logical Task ID, lifecycle | **PROPOSED** (Java prototype: oreslang-source.java#2454, unmerged draft): advertised only when AsyncRuntime attached; excludes TaskLocal and OS carrier identities |
| `atto.snapshot_actor` | actor ID, generation, field allowlist (future) | redacted immutable state snapshot | **NOT_IMPLEMENTED** until consistency/authorization proof exists |
| `atto.trace_actor` | actor ID, bounded window (future) | redacted trace | **NOT_IMPLEMENTED** until per-actor authorization is implemented |

An unsupported or not-yet-implemented capability MUST NOT be advertised as a tool.
No introspection result may be interpreted as an independent heap or zero-GC claim.

## Typed observation and snapshot contract (future milestone)

Snapshots MUST be produced by runtime-maintained safe points or the existing
sealed-state critical-read gate, never by unsynchronized reflection or raw memory
mapping. Each snapshot must include actor logical ID, incarnation, code generation,
snapshot epoch, schema fingerprint, field-level redaction policy, truncation
indicator and byte budget. All represented values are detached/copy-safe and
serialized with a portable, deterministic bounded encoding. Private, secret,
user-defined sensitive and foreign-actor state remains redacted without a specific
host-granted scope; inspection never transfers ownership.

An actor may migrate between OS carriers without changing its logical identity.
The control plane MUST distinguish actor identity, Task identity, OS Thread
identity, actor arena and physical heap/isolate placement. Quiescence on one
carrier MUST NOT be mistaken for safe actor or task quiescence. Disabled/
unavailable snapshots return an explicit error.

## Hot upgrade (not in read-only MCP v1)

All upgrade mutation operations MUST remain unadvertised until the runtime itself
provides a trusted API with these conditions:

1. Compile/type/effect/capability and ABI check of a proposed `.atto` unit;
   record content-addressed source+IR hash and compiler version.
2. Stage a bounded code generation without starting it. No guest-supplied
   privileges or increased heap/mailbox budgets.
3. Ensure all live tasks, borrows, pinned continuations, FFI leases and actors
   satisfy code/state epoch barriers. Running frames can finish under their old
   version or use a verified relocation contract; never execute retired code.
4. Migrate state only under an explicit schema-versioned transaction, with
   atomic cutover or failure leaving the original generation active.
5. Separate `hotload_plan`, `hotload_stage`, `hotload_commit` and
   `hotload_rollback` capabilities. Use server-issued, single-use,
   short-lived transaction handles scoped to principal + target + generation.
   Check authorization *again* at commit and require expected-head/epoch CAS.
6. Production mutations require independent human/host approval; AI text cannot
   grant capabilities. Maintain append-only audit receipts and migration status.
7. Rollback is conditional: previously emitted external I/O cannot be reversed
   automatically. Explicitly report irreversible boundaries and prohibit
   misleading rollback-success claims.

Backend-specific strategy: Java/Truffle deoptimizes/invalidate Assumptions;
LLVM/native uses versioned dispatch and retirement after quiescence;
Wasm, .NET Native AOT and Forge provide independently tested safe mechanisms or
report `UNSUPPORTED` before attempting an upgrade. AOT support is a per-profile
capability, never assumed by the presence of a compiler.

## Threat model and checks

Denied: unauthenticated requests; misbound DNS/Host/Origin; non-loopback
listeners; oversized or deeply nested JSON; method/header smuggling;
credential logging; unbounded memory dumps; cross-actor secret extraction;
arbitrary pointer dereference; guest-enabled debugger; prompt-injection
requests for new privileges; stale generation commit; double commit; rollback
after irreversible side effects; absent runtime safepoint admission; incorrect
backend/AOT parity promotion.

Observe and instrument: listener enablement, authenticated principal ID
(not bearer), operation, latency, redacted target identity, result class,
budget consumption. Audit records must not expose captured actor state.

## Evidence gates

Evidence states: `SPEC_ONLY`, `HOST_PROTOCOL_TESTED`,
`REAL_RUNTIME_EXECUTED`, `BACKEND_PARITY_VERIFIED`, or `NOT_EXECUTED`.
A mock provider or standalone HTTP test proves only wire and authorization
behavior. A JVM service wrapping an actual `ActorRuntime` instance can
establish real-Java observation for the functions it truly exposes, but does
not establish compiler guest-code, state snapshots or hot-upgrade correctness.
All such claims require exact source SHA, test command, target, execution
receipt and cross-backend independently verified results.

P0: run localhost authenticated MCP discovery, runtime_info, bounded
actor descriptors, and optional Task descriptors against the actual Java
runtime. Host protocol tests, mock tool views, and official SDK tests
alone do NOT prove real ActorRuntime or AsyncRuntime execution; only a
full live runtime integration run with traceable evidence can do that.
P1: attach checked supervisor-only actor registry snapshots and lifecycle.
P2: stage/retire stateless code generations using existing hot loader.
P3: prove actor-state migration and safe rollback in cross-backend fixtures.

Reference protocol: https://modelcontextprotocol.io/specification/2026-07-28
