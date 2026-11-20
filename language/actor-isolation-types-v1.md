# Actor isolation types and checked message boundaries — AttoLang candidate v1

**Status: PROPOSED / NOT ACCEPTED / NOT CROSS-BACKEND VERIFIED (2026-11-19).** This document defines a compiler and runtime *target*, not a claim that any Atto compiler accepts the examples or enforces the rules. It complements the existing owned/shared-handles, typed `receives`/`sends`, Mailman delivery, actor-state and scheduler-domain drafts; it does not create another actor type hierarchy.

## Three independent questions at every boundary

1. **Type and ownership:** Is the full reachable value graph permitted to leave the sender? `Sendable<T>` is a compiler-controlled witness of safe *local actor* transfer, not an end-user assertion, a serializer, a method name, or a source-definable `implements` escape hatch. An owned mutable graph may be moved once if uniquely owned and free of live escaping aliases. `Shareable<T>` permits only verified, transitively immutable graph references; it never authorizes mutation. Borrowed views, actor-private state leases, unapproved foreign pointers and host capabilities are neither merely because they are structurally type-compatible.
2. **Route authority:** Is this *specific* sender, recipient, TenantVM, generation and message effect authorized? `receives M` and `sends M` constrain application DATA types but do not grant route authority. `ActorRef<A>` is a revocable, generation-fenced messaging capability (not access to A's state). A same-tenant ActorRef may be explicitly delegated only after authenticating the delegation and attenuating its rights. A source-supplied tenant ID, raw integer handle, serialized ref or manually implemented marker is not authority. `sends never` closes application DATA while leaving authenticated supervisor CONTROL separate.
3. **Transport:** A same-TenantVM local actor send may use `take!` and a verified immutable `share!` without mandatory serialization. Crossing a TenantVM boundary (including within one OS process) is **not** an ordinary Sendable move or Arc alias. It requires a separately authorized brokered, length-bounded `Serializable<T,Format>` schema/codec, validated envelope and quotas, plus a fresh recipient-owned decode graph. `Serializable` does not imply `Sendable`, nor does it serialize authority; a source codec may not resurrect leases, raw pointers, live ActorRefs or host sockets. For unsupported routes, fail closed.

The source actor execution modifiers `define shared actor`, `define isolated actor`, and `define untrusted actor` describe deployment/scheduling classes, not data-type casting privileges. An `isolated` actor's private carrier pool is **not** a TenantVM security sandbox. The authenticated host principal may impose a stricter untrusted floor than any source annotation, and no backend may silently downgrade it to shared execution.

## Compiler-generated isolation witnesses (no new syntax required)

- **Actor-owned region:** Every mutable allocation has a unique owner or a proven exclusive transfer plan, with typed MIR region, actor incarnation and TenantVM generation. This metadata cannot be forged or upgraded with `unsafe`/FFI. Source-level `Box<T>` and `Arc<T>` remain candidate library/runtime carriers; their presence does not independently establish an isolation witness.
- **`Sendable<T>`:** A *transitive, path-sensitive* proof for a particular transfer mode and destination. Primitives and permitted immutable value products may qualify; `Option<T>`, `Result<T,E>`, tuples, records, lists and user products qualify only if **every reachable payload variant/field**, including generic arguments and cycle edges, qualifies. A unique mutable object may qualify for an exclusive `take!` move, but not for `share!`. A `Serializable<T,Format>` implementation cannot override a forbidden child.
- **`Shareable<T>`:** Requires an actual trusted deep-freeze graph proof or an immutable value representation plus a backend-safe shared allocation domain. `val` on a binding is not deep freeze; `borrow!` is a scoped loan, not a share. `share!` permanently invalidates the source's writable access when converting an exclusive owner to frozen sharing. No backend may publish an `Arc<T>` to another actor when it cannot enforce immutable storage, generation fencing and memory reclamation. An immutable graph shared between actors in one TenantVM may *not* be physically shared across TenantVMs.
- **`Serializable<T,Format>`:** Independently checked, versioned wire schema. The decoder reconstructs only approved data, not a runtime identity/capability. A type may be serializable but not sendable (e.g. an opaque, codec-only value); likewise a unique in-process owned object may be sendable without any wire schema. Recursive/nested types require bounded traversal and explicit cycle/alias semantics.
- **`ActorRef<A>`:** A non-forgeable scoped send capability with tenant ID, actor ID, incarnation/placement generation, permitted message types and delegated rights. Copying or decoding its bytes must not mint a usable capability. Stale, revoked, wrong-tenant or wrong-target refs fail admission regardless of nominal type. Remote/proxy actor refs are a *different broker-minted handle class* requiring explicit grant; never treat an untrusted integer as a local `ActorRef`.

Canonical source operators remain `borrow!`, `borrow! mut`, `take!`, `share!`, `copy!` (shallow) and `copy!!` (deep); ordinary nonprimitive call arguments borrow by default. A normal `send(payload)` must not silently convert an implicit loan to a move, freeze, clone or wire encoding. A send intent for owned data must be explicit and proven. Whether a failed `send(take! payload)` returns `Err(payload)` or restores the original binding is an existing unresolved API decision; **either implementation must guarantee exactly one recoverable owner** and no early destruction, duplication or accidental consumption. Bounded mailbox admission is linearizable; sender invalidation commits only upon accepted admission. Concurrent send/cancel/close/restart races must be generation-fenced.

## Boundary decision table (target behavior)

| Value and operation | Same-TenantVM actor DATA | Cross-TenantVM DATA |
| --- | --- | --- |
| Copyable scalar / value product | Allowed with typed recipient and route | Broker + approved wire schema + fresh decode |
| Unique owner `take! box` with no live loans | Allowed as atomic ownership transfer | Never raw move; brokered safe data copy only if serializable |
| Deep-frozen `share!` graph | Shareable reference only in a verified shared allocation domain | Never shared address; brokered independent decoded copy |
| Borrowed view, critical-state binder, `Pointer<T>`, FFI pointer | Reject | Reject |
| Host socket, process handle or raw OS I/O capability | Reject (requires independent explicit brokered operation) | Reject |
| `ActorRef<A>` | Delegation requires authenticated, attenuated, current-generation rights | Raw ref rejected; broker must mint a distinct authorized proxy |
| Any `Option`, `Result`, collection or record containing a forbidden child | Reject transitively | Reject transitively |
| Codec-only object without local send proof | Reject direct actor move | Allowed only when approved wire schema, auth and data-only decode are proven |

## Typed source sketches (PREVIEW ONLY)

```atto
// Same-tenant candidate: compiler must prove the entire Parcel graph uniquely owned,
// that no live borrow aliases remain, and that the target receives Parcel.
val parcel = new Parcel(42);
val admitted = worker.send(take! parcel);
// admitted is mailbox admission, not handler execution completion.

// A frozen snapshot is shareable only after a trusted transitive freeze proof.
val snapshot = share! owned_snapshot;
val admitted2 = observer.send(share! snapshot);

// INVALID: not Sendable even with a custom serializer.
// observer.send(borrow! parcel);
// observer.send(raw_pointer);
// observer.send(self.handle_state(critical-read |s| -> s));
```

These are targets, **not** accepted standalone fixture programs. A full implementation must type-check `ActorMail<M>`, `ActorRef<A>`, `receives`/`sends`, aliases, capability provenance and effects *before* guest emission; reject unsupported profiles with stable codes (`E_ACTOR_SEND_NOT_SENDABLE`, `E_ACTOR_SHARE_NOT_SHAREABLE`, `E_ACTOR_BORROW_ESCAPE`, `E_ACTOR_CAPABILITY_ESCAPE`, `E_ACTOR_STALE_REF`, `E_TENANT_MESSAGE_DENIED`, or backend-specific `E_UNSUPPORTED`) and **no artifact**. Exact public naming of type witnesses is still subject to spec review; code should not allow a user-provided trait implementation to mint the proof.

### Reference-ticket admission hardening (v1 security audit)

A nominal `ActorRef<A>` type, serialized bits, `Serializable` implementation, or
a Boolean `grant=true`/`generation_current=true` check is never proof that the
speaker holds destination authority. A trusted broker must independently derive
the requesting principal and check the ref's holder, TenantVM/actor/incarnation/
placement, grant generation, message rights, revocation and attenuated rights
at admission. A delegated ref cannot grant broader DATA types, CONTROL, state
access or recursive delegation than its parent. Local refs cannot cross tenants;
only a separate broker-minted proxy may represent a remote target. Retry after
suspension, cancellation or restart requires revalidation.

The source-only conformance oracle changed permissive nominal-`actor_ref`
delegation cases AI-015/AI-035 to reject. A separate adversarial broker model
exercises narrow delegation and two-phase mailbox ownership. It takes
hypothetical authenticated inputs, not a production host principal proof;
therefore neither its positive cases nor passing Rust tests certify TenantVM
security or compiled Atto guests.

## Threats and mandatory verification

- Traverse every reachable nested field/variant and generic instantiation; do not trust a top-level declared trait, descriptor cache, unreachable-at-runtime branch or codec. Reject unknown, open-world dynamic, erased, foreign or reflective shapes without an authenticated bound.
- Separate supervisor CONTROL from application DATA and ensure no source actor can forge a priority CONTROL message or intercept its own panic.
- No shared mutable memory, carrier threads, guest arena addresses, socket descriptors or dynamic host handles may cross untrusted TenantVMs. Restrict I/O to explicit brokered network authority under the per-tenant/per-socket host policy; source annotations or `unsafe` cannot grant OS permissions.
- Authenticate the sender/recipient tenant + incarnation + generation and route grant at the admission linearization point, including after awaits, retries, restart and cancellation. Deny stale generation and cross-tenant aliases; never infer authority from a payload type or stale `ActorRef`.
- On failed/full/closed/revoked admission, retain exactly one recoverable owner. Accepted messages have exactly one receiver owner or an accountable teardown/drop after mailbox closure; no double receive and no suppressed CONTROL escalation.
- Compiler checks must include accepted scalar/unique/frozen cases; rejection of nested borrowed/capability/pointer/lease/unknown types; compositional `Option/Result/Record/Array` negatives; generic witness spoofing; stale/mutated ActorRef; copy-vs-move and share-vs-borrow; missing grants; cross-tenant raw aliases; cancellation/close/restart races; bounded wire decode and worker-silo exit.
- Collect **compiled `.atto` guest execution** and negative no-artifact receipts independently per eligible backend: Java/GraalVM, native LLVM, Forge, .NET NativeAOT, Rust/Wasm and other actual source frontends. Distinguish `PASS`, `FAIL`, `UNSUPPORTED`, `NOT_EXECUTED`. Source-only Rust models and Node syntax checks are not backend proof. Record exact source and fixture blob SHA, toolchain, run/job with executed steps, and observed artifact/exit trace.

## Integration and overlap disposition

- [atto-spec #27](https://github.com/atto-lang/atto-spec/pull/27) remains the candidate ownership/Box/Arc/suspension authority. This document narrows its previously open Sendable witness decision, but does **not** settle Box/Arc constructor syntax or failed-send payload ABI.
- [atto-spec #28](https://github.com/atto-lang/atto-spec/pull/28) owns `receives`/`sends` effects; [#49](https://github.com/atto-lang/atto-spec/pull/49) owns execution-pool classes; [#64](https://github.com/atto-lang/atto-spec/pull/64) owns Mailman escrow/copy-elision; [#90](https://github.com/atto-lang/atto-spec/pull/90) owns share/freeze/locks; [#127](https://github.com/atto-lang/atto-spec/pull/127) owns sealed actor state. Keep these *independent* and do not introduce conflicting syntax or a second receipt protocol.
- [atto-source.rs #406](https://github.com/atto-lang/atto-source.rs/pull/406) has bounded typed receives/sends and explicit runtime-domain rejection but **does not** prove general Sendable/Shareable checks or untrusted TenantVM memory isolation. Its `E_UNSUPPORTED_TYPE` fail-closed string route must remain until its compiler/guest bridge passes independently executed tests.
- The companion [atto-platform-conformance #33](https://github.com/atto-lang/atto-platform-conformance/pull/33) stages source-only Rust isolation-model cases separately from compiled guest certification. Migrated Oreslang references remain design precedents only.