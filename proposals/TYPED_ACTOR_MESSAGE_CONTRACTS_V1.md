# Typed actor message contracts v1 (proposal)

**Status:** PROPOSED. Java reference compiler stage 1 is in a separate draft: typed `receives` is checked against the existing handler, while explicit `sends` remains fail-closed pending transitive effect checking. Other backends and runtime conformance are not established.

**Scope:** AttoLang actor declarations and message send/receive semantics. Legacy Oreslang source compatibility is a separate migration gate.

## Decision

An actor has **one designated supervising parent at a time** and may communicate with **zero, one, or arbitrarily many** downstream or peer actors. A supervisor relationship is a lifecycle/control relationship, **not** an outbound application-message port.

- `receives T` declares the actor's admitted **application** message type (possibly a sum/union).
- `sends U` declares an upper bound on **application** payload types emitted by this actor, across all destinations. It does **not** specify the number, identity, or topology of recipients.
- `ActorRef<T>` is a typed, capability-carrying send handle. A call `target.send(value)` is legal only if the compiler proves `value` is assignable to `T` **and** permitted by the sending actor's declared/inferred outbound effect.
- Supervision notices and exit/control events are delivered on the dedicated **priority CONTROL** path and do not count as ordinary `sends` or `receives` messages.

This is a protocol type/effect proposal, not a guarantee obtainable from Erlang Dialyzer alone.

## Candidate declaration syntax

```atto
// Illustrative proposed syntax; not a currently passing compiler fixture.
// Message definitions use the language's established nominal/sum-type facilities.

define actor Parser
  receives ParseRequest | CancelRequest
  sends ParseResult | ParseWarning
as
  // Downstream handles may be constructor parameters, stored fields,
  // subscriber collections, or temporarily borrowed capabilities.
  // results: ActorRef<ParseResult>
  // diagnostics: List<ActorRef<ParseWarning>>

  // The actor may fan out to 100 results receivers and 20 warning receivers.
  // All send sites are checked against their individual target handles.
end
```

The `receives` and `sends` clauses each accept a type expression. `|` denotes the same nominal sum/union semantics used by the language's type system; it must not introduce stringly-typed message tags. The canonical ordering, formatter layout, and any optional parenthesization need parser/formatter fixtures.

An actor may omit `sends`; its outbound application-message effect is then **inferred**, not assumed to be `Any`. A declaration `sends never` expresses no outbound application messages. Legacy untyped actor declarations require an explicit, documented migration mode; omitting `receives` in new strict-mode code must not silently turn the mailbox into an unrestricted `Any` mailbox.

## Multiple downstream recipients

- A sender may possess any number of `ActorRef<T>` handles.
- Receivers of the same `T` may be collected into an array/list and broadcast to.
- Different downstream actors may admit disjoint types; each send is checked against the **specific destination**.
- Receiving an `ActorRef<Reply>` inside a request permits typed replies to dynamically chosen callers, subject to the sender's `sends` effect.
- A `sends ParseResult | ParseWarning` clause does not authorize sending a `ParseResult` to an `ActorRef<ParseWarning>`.
- Having an `ActorRef<T>` does not grant access to the target's state, supervisor relationship, or CONTROL mailbox.

**Compatibility:** The Java reference compiler already represents references as `ActorRef<ActorClass>` and derives the mailbox message type from `receive(ActorMail<T>)`. V1 implementation MUST retain this spelling, allow a `receives T` header only when it is equivalent to the existing handler's payload type, and reject mismatches. A prospective `ActorRef<MessageType>` spelling is a separate, potentially ambiguous migration that requires explicit versioning and cannot be silently reinterpreted in existing code. The actor type parameter on legacy refs is a nominal actor identity, not the same as the payload type parameter of a message-typed reference.

No globally declared graph edges, fixed child count, or named ports are needed for ordinary messaging. Named output ports can be library abstractions built from typed actor refs, without a new core keyword.

## Type-checking contract

For `sender.send_to(target, message)`, or the existing idiomatic `target.send(message)`:

1. Resolve the receiver capability `target: ActorRef<R>`.
2. Prove `type(message) <: R` under the language's established nominal type rules and explicit generic constraints.
3. Prove `type(message) <: S` where `S` is the sender's explicit `sends` upper bound, if present. When absent, infer the effect over all reachable application send sites, including helper calls that perform sends.
4. Enforce ownership/borrow and `Sendable` transfer rules. `Serializable` for network transfer is a separate requirement.
5. Preserve the existing `send` admission/ack `Result` contract; typing alone does not imply delivery, processing, or successful completion.
6. Reject invalid casts, unsafe variance, or dynamic `Any` erasure that could widen a typed `ActorRef<R>` silently. Default to invariant handles until variance is formally established. Any dynamic gateway must be capability-gated and validated before mailbox admission.

For `receives R`, every application message presented to the actor's `receive` hook must be within `R`. Exhaustiveness analysis of finite variants should reject non-exhaustive handling in strict mode, while retaining explicitly checked wildcard/default semantics where the language requires them.

A polymorphic actor or helper may send `T` to `ActorRef<T>` if both the handle type and sender effect constraints are statically satisfied. At actor boundaries, type identities must remain valid through hot reload, source generations, and serialization.

## Supervision and safety boundary

- At most one designated supervisor owns the child lifecycle at a time; group membership, subscriptions and ordinary sends do not change that parent.
- `panic` is non-interceptable by its originating actor and emits an authenticated priority CONTROL notice to the supervising runtime. `raise` and `throw` keep their separately specified handling/escalation rules.
- CONTROL notices carry source actor identity, parent/supervisor identity and event kind; the runtime must prevent forging them with ordinary application payloads.
- Supervisor shutdown/restart/control coordination remains possible even if a child declares `sends never` or `receives never`, and even if its ordinary mailbox is full.
- A supervisor that also accepts **application** messages may expose its own `ActorRef<AppMessage>`. That is a separate, explicitly typed capability, not the CONTROL channel.

## Runtime and compatibility requirements

- Locally compiled typed actor sends should not pay a mandatory dynamic tag check where type safety has already been proven and the target protocol generation is stable.
- Cross-isolate, FFI, network, and hot-reload boundaries must independently verify message envelope identity, protocol generation, payload size, transfer permissions, and decoder result **before** application-mailbox admission; mismatches fail closed.
- The sending actor's allowed outbound types cannot be bypassed by forwarding `ActorRef` handles to an untyped host shim or by reclassifying a message as CONTROL.
- Existing actor code is migrated under a documented compatibility profile rather than falsely promoted to strict typed admission.

## Required conformance cases (proposed, NOT_EXECUTED)

| ID | Case | Required result |
| --- | --- | --- |
| ACTOR-TYPED-01 | Single `receives Work`, send `Work` | Compile and admit |
| ACTOR-TYPED-02 | Send a `String` to `ActorRef<Work>` | Compile rejection |
| ACTOR-TYPED-03 | One actor sends distinct messages to two differently typed peers | Compile and admit |
| ACTOR-TYPED-04 | Broadcast one accepted type to many typed refs | Compile and admit |
| ACTOR-TYPED-05 | Declared `sends Result`, attempt to send `Warning` | Compile rejection |
| ACTOR-TYPED-06 | `sends` omitted; infer bounded outbound type effect | Compile and admit |
| ACTOR-TYPED-07 | Request contains `ActorRef<Reply>`, reply via ref | Compile and admit |
| ACTOR-TYPED-08 | Sender owns `ActorRef<Warning>`, sends `Result` despite union `sends Result | Warning` | Compile rejection |
| ACTOR-TYPED-09 | Child declares `sends never`, panics | Supervisor receives CONTROL notice |
| ACTOR-TYPED-10 | App message attempts forged supervisor CONTROL event | Reject/deny admission |
| ACTOR-TYPED-11 | Full ordinary mailbox, authentic supervisor termination | CONTROL remains reachable |
| ACTOR-TYPED-12 | Cross-isolate message with wrong protocol generation | Reject before application admission |
| ACTOR-TYPED-13 | Ownership-invalid send or non-`Sendable` message | Compile rejection |
| ACTOR-TYPED-14 | Untyped/cast actor reference masquerades as `ActorRef<Work>` | Fail closed |
| ACTOR-TYPED-15 | Strict-mode non-exhaustive finite `receives` handling | Compile rejection |

## Promotion gates

Implement parser/formatter acceptance, typed HIR/MIR, flow-sensitive effect checking, actor reference capability typing, mailbox admission, and supervisor CONTROL separation independently in the Java, LLVM, .NET, Wasm and Forge backends (plus other supported compilers). Maintain shared positive/negative `.atto` fixtures; retain `.ores` compatibility checks where supported. Use Rust-based test infrastructure where tests are newly introduced; do not use Python. A backend can be marked supported only with exact HEAD/commit provenance, observed compiler execution, positive/negative guest fixtures, and runtime tests for CONTROL isolation. Untested and unsupported are **not** passed.

## Compiler data-flow hardening requirement

The explicit `sends never` effect must be a distinct sum-case in the
syntax/typed representation (`Never`), **never** an alias for the `void`
return type. The typed checker must reject a forged
`Payload(void)` AST even when a parser would not produce one.

For each actor, audit every reachable **application DATA** send in:
its receive handler, all actor methods, transitive statically resolved
helpers and all actor field initializer expressions **and helper calls from
those initializers**. A cycle in the static call graph must terminate the
audit without granting new authority; an unresolved or erased call target
cannot silently become an allowed effect. The runtime's authenticated
supervisor CONTROL channel remains outside this application send graph.
Source-level omission of `sends` is an independent inference mode: it
must not be implemented as `Never` or unrestricted `Any`.

The Rust/Wasm and LLVM-repository Rust frontends carry a byte-identical,
pure Rust reference effect-graph implementation (Git blob
`16b475542987066097e4ce66a06e18603d16f796`) and compiler-scope
regression tests in draft PRs
[atto-source.rs#406](https://github.com/atto-lang/atto-source.rs/pull/406)
and [atto-source.llvm#46](https://github.com/atto-lang/atto-source.llvm/pull/46).
The source is not yet promoted as tested compiler support: external
runner attempts in three independent private organizations had **zero
executed steps**. See
[atto-platform-conformance#33](https://github.com/atto-lang/atto-platform-conformance/pull/33)
for SHA-pinned `NOT_EXECUTED` evidence. The LLVM-repository Rust frontend
emits Wasm, not independent native LLVM/C++ actor code.

## Bounded v1 header semantics and diagnostic alignment

For all conforming compiler frontends, `sends never` denotes an empty
application-DATA send effect: the actor may not perform any application
`target.send(value)` operation, including via statically reachable helper
calls. It **does not** suppress authenticated runtime supervisor CONTROL.
`sends void` is invalid: `void` is a return type, **not** the spelling of
an empty message effect. An absent `sends` clause remains inferred; it does
not implicitly grant the `Any` effect.

The following diagnostic codes are canonical for the **bounded actor-header
subset**, including legacy `ActorMail<T>` handler compatibility:

| Code | Invalid program |
| --- | --- |
| `E_ACTOR_RECEIVES` | Declared `receives T` disagrees with the attached `receive(ActorMail<U>)` payload, or that required handler is missing |
| `E_ACTOR_SEND_CONTRACT` | Invalid `sends void` or an application-send effect outside the declared `sends` bound |
| `E_ACTOR_CONTRACT` | Duplicate or out-of-order `receives` / `sends` header clause |

Implementations MUST preserve their existing strict unsupported-feature
diagnostics for constructs they do not lower; an unsupported string wire
error is not proof that a compiler implements string actor messaging.
`receives never` and actor lifecycle-only support remain separately gated
by the authenticated CONTROL contract.

One shared source target is
[`actor-bool-never-parity-v1.atto`](https://github.com/atto-lang/atto-platform-conformance/blob/feat/typed-actor-receives-sends-v1/fixtures/typed-actor-bool-v1/actor-bool-never-parity-v1.atto)
(Git blob `a103999dd9b047e24ae79fedd88398374bc10590`).
This target uses `receives bool sends never`, an actual
`receive(ActorMail<bool>)` handler, and a no-outbound actor body. Backends
must compile it without treating `sends` as a count. The JavaScript
bounded backend has an executable generated-JS test; native LLVM and
Rust/Wasm independent compiler acceptance remain conditional on executed
exact-head build/test receipts.

## Open implementation details

- Exact grammar for sum types and whether an explicitly declared `sends` effect can be parameterized.
- Whether an explicit `receives never` actor is allowed for timer-only/CONTROL-only actors (recommended: yes).
- Non-header error taxonomy and the canonical `send` return/admission type.
- Whether inferred effects become part of public actor interface metadata (recommended: yes, with deterministic generation IDs).
