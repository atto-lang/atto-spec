# Actor execution classes and host confinement v1

**Status:** proposed normative AttoLang syntax/semantics. This is NOT evidence of parser, compiler, sandbox, formatter, or guest execution support.

**Dependencies and overlap:** [actor scheduler/TenantVM contract](actor-scheduler-domains-v1.md), proposed persistent/durable modes (atto-spec #63), checked `implements` semantics (#105), typed `receives`/`sends` (#28), actor ownership and mailbox contracts (atto-common-source #1), and the common spec rule registry (#115). This document adds declaration and static/dynamic admission rules; it MUST NOT replace the security and resource requirements of those contracts.

## Candidate declaration grammar and canonical form

```ebnf
ActorDef          = "define", ["pub"], [ActorDomain], [ActorStorage],
                    [ActorConcurrency], [ActorTransport], "actor", Identifier,
                    [ActorTypeEffects], [ActorInheritance], "as", ActorBody, "end";
ActorDomain       = "shared" | "isolated" | "untrusted";
ActorStorage      = "persistent" | "durable";
ActorConcurrency  = "serial";
ActorTransport    = "http" | "tcp" | "ws";
```

This target EBNF defines the modifier portion of an actor header only; the rest follows the canonical grammar in atto-spec. The default domain is `shared`, and `define shared actor` is a valid redundant spelling. The canonical formatter MAY remove only redundant `shared` after proving parse-equivalence and identical compiler artifact behavior; until then it MUST preserve it. Ordering is `pub`, domain, storage, concurrency, transport; duplicate, contradictory and out-of-order modifiers fail at parse, with no best-effort recovery. `persistent` and `durable` are exclusive *storage* policies, not execution domains. `serial` limits request/message concurrency; it does not confer confinement. `http`/`tcp`/`ws` are behaviors, not ambient socket grants.

```atto
define actor DefaultShared receives int as
  susp receive(ActorMail<int> mail): void { }
end

define shared actor ExplicitShared receives int as
  susp receive(ActorMail<int> mail): void { }
end

define isolated actor LocalPrivate receives int as
  susp receive(ActorMail<int> mail): void { }
end

define untrusted actor Guest receives int as
  susp receive(ActorMail<int> mail): void { }
end

define pub isolated durable actor CheckpointWorker receives int as
  susp receive(ActorMail<int> mail): void { }
end

define untrusted serial http actor GuestHttp receives Request as
  susp receive(ActorMail<Request> mail): void { }
end
```

Examples are TARGET syntax, not a currently verified compiler subset. A `durable` untrusted actor additionally needs a separately approved brokered persistence capability; it NEVER inherits filesystem privileges from the durability modifier. Similarly, HTTP actors require network grants from the trusted host.

## Static type and compiler rules

1. Every actor has exactly one declared `ActorDomain`: default `shared` or explicit `shared`/`isolated`/`untrusted`. The parser records a semantic enum `SHARED|ISOLATED|UNTRUSTED` and retains `explicit_shared` for safe formatting. No inferred class from names or inheritance.
2. The compiler synthesizes sealed read-only domain markers `SharedActor`, `IsolatedActor` or `UntrustedActor` as metadata. Their names are reserved; user implementations, redefinitions, casts or `extends` may not mint them or change domain. Public actor interfaces remain `Actor` and typed `Receives<T>`/`Sends<T>` effects; domain markers are NOT authority-bearing capability objects.
3. A declared subtype cannot weaken or change an inherited actor security obligation. `implements` for ordinary behavioral traits is allowed only after full checking of required methods/effects; a trait must not grant carrier access, tenant identity or I/O authority.
4. Actor state remains sealed for all domains; `handle_state(critical-read ...)` and `handle_state(critical-write ...)` remain required. A shared *scheduler* never implies shared mutable actor state. Ordinary actors allow multiple independently authenticated DATA turns on separate invocation stacks, subject to bounded physical parallelism and checked state-loan arbitration. `define serial actor` retains its one-live-DATA-receive gate and one-running-carrier ceiling per [actor scheduling policy v1](actor-scheduling-policy-v1.md).
5. `Sendable` is not automatically `Serializable`. Same-tenant messaging applies checked exclusive move (`take!`), frozen sharing (`share!`) or safe copy according to the ownership model; atomic mailbox rejection must roll back pending transfer.
6. Cross-tenant delivery is trusted-broker-only with bounded, versioned wire representations. `Serializable` alone does NOT make a value cross-tenant safe. `TenantWire`, if introduced, MUST be compiler-verified/derived for a closed safe payload graph, not an unchecked user-implemented escape hatch. Reject native pointers, mutable graph aliases, borrowed references, file/socket handles and executable callbacks.
7. Frontends lower domain modifiers into signed/validated artifact metadata. A forged or edited artifact must not be able to turn `UNTRUSTED` into `SHARED`; deployment authority always comes from authenticated host admission, not an actor-supplied marker or annotation.

## Host-enforced effective trust and admission

The declared class is a *request* for scheduling/confinement, not proof of a trusted origin. Let `principal_floor` be the host-authenticated execution security level. A hostile principal cannot escape its TenantVM by declaring `shared`, `isolated`, implementing a trait, casting an ActorRef, spawning children, or changing artifact metadata. The runtime MUST reject any attempted escape, or schedule it *inside the already authorized TenantVM* with the floor intact. In this context `shared` is at most tenant-local shared scheduling, never the trusted host shared pool; `isolated` can request a tenant-local private pool subject to quota. There is no silent change of security principal.

The `untrusted` declaration imposes a mandatory sandbox requirement even when trusted host code instantiates it. A trusted host mints `TenantAdmission` with opaque tenant ID, monotonically fenced generation, bounded grants and execution budgets after verifying the sealed artifact. Guest-supplied tenant IDs/names, serialized handles and `ActorRef` casts do not confer tenant authority. Guest child actors remain under the parent TenantVM and host policy; host creation of a new security principal is a distinct authorized operation.

- `shared` trusted: bounded VM-wide carrier pool, actor-private mutable state; no hostile sandbox guarantee.
- `isolated` trusted: lazily created private pool per actor instance under a global cap; scheduling separation, not by itself hostile memory confinement.
- `untrusted`: independently enforced TenantVM per mutually untrusted principal/generation, tenant-scoped workers, private guest memory/control flow and host-import capabilities. Actors of the *same* trusted security principal may share that tenant pool, but mutually hostile actors require distinct TenantVMs even under one customer account.
- If the verified sandbox is unavailable, return `UNSUPPORTED`/`DENIED`, or select an explicitly approved sandboxed-process fallback. Never execute untrusted work natively on the shared/private trusted pool or silently downgrade.
- Suspension frames and resumes are bound to tenant ID/generation, actor ID/incarnation, slot/generation and capability epoch; no foreign resumption or tenant-crossing work stealing.
- Spawning may fail due to global worker budgets, quotas, unsupported runtime, or host policy. Existing `spawn` lowering MUST define a typed failure path; `trap spawn` exposes a `Result`-compatible error outcome without claiming a concrete `SpawnError` ABI until specified.
- Supervisor CONTROL is authenticated, reserved, priority-bounded and outside untrusted guest control. Untrusted runtime panics may not be intercepted by the guest and must not forge supervisor notices.
- Untrusted guests have no direct OS I/O, FFI, syscalls, environment or filesystem access. Socket access is default-deny and brokered using host-authenticated, generation-scoped, per-socket rights (see actor-scheduler-domains-v1.md).

## Examples of compile/host admission failure

```atto
// PARSE ERROR: contradictory domain modifiers
define isolated untrusted actor Invalid as end

// PARSE ERROR: storage modifiers cannot co-occur
define persistent durable actor InvalidStore as end

// PARSE ERROR: canonical ordering required
define durable isolated actor BadOrder as end

// TYPE ERROR: domain markers cannot be user-implemented
define actor Fake implements UntrustedActor as end
```

A sandboxed guest that declares `define actor Escape` is **not** considered a trusted shared actor. ActorRefs, capability tokens and serialized objects cannot override this effective trust floor.

## Required conformance and evidence

Provide parse positives/negatives (modifier order, duplicates, storage orthogonality, transport, visibility), type negatives (marker forging, privileged inheritance, state/loan escape), and runtime positives/negatives (shared/private pool routing, per-tenant pool/admission, quota failure, stale generation, CONTROL priority, socket broker denials, hostile infinite loop, independent tenant survival). All backend statuses remain `not_executed` until compiled `.atto` guest evidence exists. A host-only model or malformed/zero-step GitHub Actions run is NOT guest parity. Pin exact compiler SHA/tree and guest artifact digest; distinguish same-PID in-process sandbox proof from an OS-process fallback.

Formatting must preserve syntax and semantics across parse → format → parse, be idempotent, leave comments/strings untouched, and only remove explicit `shared` when the real compiler confirms identical validated guest output and actor-domain metadata. No formatter pass may rewrite `isolated` or `untrusted` into `shared`.
