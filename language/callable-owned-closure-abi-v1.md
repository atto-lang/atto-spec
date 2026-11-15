# Proposed callable and owned-closure ABI v1 (review draft)

Status: **candidate contract only**. No released compiler backend currently satisfies
this entire contract. In particular, do not reinterpret the existing Rust/browser
guest ABI version 2 as supporting escaped closures. A released ABI revision or an
explicitly negotiated callable feature version is required before emission.

## Language semantics

The canonical type of a unary callback is 'fnc(int) => int'. The fat arrow
is required for callable **type expressions** (parameters, returns, fields,
local type annotations); using 'fnc(int) -> int' is invalid. By contrast,
the thin arrow introduces a **lambda body**, e.g. '|n| : int -> n + offset'.
Parameter types
and result types are invariant and must be checked before generating guest code.
The canonical lambda spelling is '|n| : int -> n + offset'; an explicit result
annotation is optional when the callable signature or body determines it.
Captures are bound at lambda **creation**, not re-resolved on invocation.

~~~atto
fnc make_adder(int offset): fnc(int) => int {
    return |n| : int -> n + offset;
}

fnc apply_twice(fnc(int) => int operation, int value): int {
    return operation(operation(value));
}

pub fnc main(): int {
    val add_one = make_adder(1);
    return apply_twice(add_one, 40); // 42
}
~~~

The runtime must support callable locals, parameters, and results, plus invocation
after the defining stack frame returns. A callback's owned environment is
independent of its creator's stack. The initial profile admits only copyable
immutable scalar captures (int, bool, float) and exact scalar callback
signatures. Strings, borrowed pointers, object captures, actor state, mutable
aliases, asynchronous use and transitive closure captures remain unsupported
until distinct ownership proofs are implemented. They must produce errors
**before** guest Wasm emission, not silently degrade into direct calls.

An Atto function value may be represented by a compiler-private callable, but
cannot be forged from integer, string, pointer, foreign funcref or host message.
Transport between actors/tenants is prohibited. A future separately specified
Sendable closure representation must serialize *values*, not handles, and
instantiate a fresh local table entry in the receiving domain.

### Ownership

A closure value owns its capture environment. Returning it moves ownership
out of the creator, so the creator cannot close the escaped environment.
Invoking it borrows it for the duration of that call. Passing a callback to a
higher-order function may borrow it for that invocation, or explicitly move it
when the declaration requires ownership. Closing the final owner scrubs the
environment, invalidates handles before reuse and is performed exactly once.
Copying a callable's raw handle does **not** copy ownership; compiler lowering
must reject an untracked duplicate. Sharing requires a distinct explicitly
typed shared-ownership contract and is excluded from v1.

Immutable captures snapshot the binding once on creation, even when a same-name
binding is introduced afterward. Borrowed, mutable, actor-state or cross-actor
captures are rejected if their lifetime/region cannot be proven. Closures never
permit borrowed actor state to cross critical sections or suspension.

A class or interface may expose an explicit typed '.call(...)' method. It is
ordinary method dispatch with a receiver, **not** an implicit 'obj(...)'
conversion and not a license to treat class instances as raw callable handles.
Functor adapters must obey the same signature and ownership checks.

## Candidate guest Wasm representation (feature-gated)

The following is a **reference layout**, not a declaration that any backend
already emits it:

| Component | Contract |
| --- | --- |
| Callable value | Opaque two-word 128-bit capability: upper u64 = trusted instance/actor domain, lower u64 = (generation:u32 << 32) OR one-based slot:u32; zero fields invalid |
| Domain | Trusted nonzero and nonreused per-instance/actor execution-domain identity, embedded in the checked handle but never accepted from user serialization |
| Slot table | Bounded, compiler-controlled, per guest-instance table/arena |
| Slot contents | Live state, generation, owner, exact signature ID, compiler-controlled function-table index, checked typed capture layout |
| Invocation | Validate live slot, generation, owner, bounds, signature and capture layout **before** typed Wasm call_indirect |
| Dispatch | call_indirect supplies a module-owned Wasm type index; a mismatched table function must trap |
| Closure environment | Owned immutable scalar words, bounded by compiler-proven capture count and field types |
| Close | Exactly once, wipe captures and metadata; generation increases before slot reuse |
| Exhaustion | Retire slots with exhausted generation; never wrap or alias a stale handle |
| Limits | Initial reference limits: 1,024 slots/domain, 16 scalar capture words/closure |

The two-word handle requires an explicit callable feature/ABI revision and
must not be smuggled through the current single-i64 ABI v2. A guest lowering
may pass the two i64 words or store them in a checked opaque value. The
per-domain owner identity is never a substitute for host authorization.

The guest type index is local to a module, not a portable cross-module numeric
identifier. Signature identity derives from exact canonical parameter and
return types, and is mapped to the module-local type section during linking.
The compiler controls every table entry; no host-owned or unverified funcref
can be installed.

Each function-table target must be registered with its exact canonical callable
signature and capture-field type layout **before** any closure environment is
allocated. The target's registration is immutable for the lifetime of its table
entry. Runtime allocation must reject unregistered targets, incompatible target
signatures, capture count/type mismatches, and attempts to reregister a target
with different metadata; comparing only caller-supplied type IDs is insufficient. Each source callback's wrapper receives a checked
environment plus the typed user arguments.

Even a 128-bit handle is **not an authentication token**. Embedding the trusted
runtime-assigned 64-bit execution-domain identity prevents accidental aliasing
between instances with the same slot/generation, but only strict provenance
and nonreuse of domain IDs prevents stale cross-instance aliasing. The runtime
must never deserialize handles from foreign actors/tenants or allow source-level
bitcasts. Every checked call uses the independently trusted owner context. The reference Rust host model rejects
caller-owner mismatches, but this alone is not proof of cross-process
authorization. Host/guest isolation and capability provenance remain
mandatory.

The Wasm runtime must not read unchecked guest linear-memory pointers,
including freed slots, before performing generation, owner, bounds and
alignment validation. An invalid callable must deterministically trap or be
rejected by the type checker with a named diagnostic; it must never dispatch
a different function or return a fabricated default.

## Versioning and release

The Rust compiler currently exports guest ABI v2. Callable ABI v1 here is a
feature-proposal version, **not** a claim that guest ABI v2 implements it.
An implementation must (a) negotiate a new guest feature/ABI marker,
(b) keep existing v2 modules byte-compatible, and (c) fail closed when
the feature is absent. Do not change public playground binary bytes or
SHA pins until exact tree and release receipts are reviewed.

## Required executable acceptance vectors

| Vector | Expected behavior |
| --- | --- |
| Factory capture | make_adder(1)(41) executes to 42 after creator returned |
| Independent instances | make_adder(1) and make_adder(2) retain different environments |
| Higher order | apply_twice((|n| -> n * 2), 10) produces 40 |
| Bad signature | fnc(bool) =>int cannot be called as fnc(int) =>int |
| Forged/zero/out-of-range | Reject without accessing unvalidated memory |
| Stale generation | Closed/recycled handle never selects a new target |
| Owner mismatch | Reject callable use from another actor/tenant |
| Capture escape | Borrowed local or actor state cannot outlive its region |
| Cleanup | Zeroized environment, no duplicate close, generation exhaustion retires |
| Native/Wasm | Native Rust compiler and wasm32-compiled compiler produce identical guest bytes for same source |
| Browser | Actual Chromium Web Worker executes compiled guest, without JS source interpretation |
| CI provenance | Exact source tree/blob SHA and released compiler artifact SHA verified |

Before marking a vector complete, distinguish a **host-side pure reference
test**, a standalone Wasm call_indirect smoke test, an actual .atto
compiler-to-guest execution, and real browser worker execution. Only the
last two establish language execution. Java/GraalVM, LLVM and any independent
Wasm backend must prove equivalent source semantics separately; inspecting
a type algebra, syntax parser or reference model is not parity evidence.

Related tracking: atto-source.rs PR #134; atto-source.wasm issue #12;
atto-lang.github.io PR #125. Keep the playground preview gated until
compiler and release approvals are complete.
