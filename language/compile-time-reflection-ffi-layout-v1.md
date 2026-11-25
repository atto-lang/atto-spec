# Compile-time reflection, explicit C layout and AOT-safe FFI — v1 candidate

**Status: TARGET / NOT COMPILER-VERIFIED.** This extends [foreign boundary v1](ffi-boundary-v1.md), [closed-world AOT](../spec/24-aot-zero-gc-controlled-dynamism.md), [ownership vocabulary](ownership-vocabulary-v1.md), [nominal Struct versus Record proposal #72](https://github.com/atto-lang/atto-spec/pull/72) and [typed serialization proposal #73](https://github.com/atto-lang/atto-spec/pull/73). It does NOT expand the v1 foreign *call* ABI beyond its existing i64/bool/f64 scalars, admit callbacks in v1, or certify any backend.

## 1. AOT boundary and phases

All reflection/derive operations in this proposal are **compile-time typed queries**, after import, visibility and nominal type resolution but before closed-world reachability, specialization and native/Wasm code emission. The compiler may emit bounded immutable data tables for explicitly registered runtime inspection, but never a runtime type evaluator, runtime serialization compiler, dynamic generic instantiator, host reflection escape, JIT or guest interpreter fallback. A `full-guest-aot` build MUST fail before creating an executable artifact if resolution, generation, layout, registration or target linking remains unknown. A host interpreter packaged as Native Image is not guest AOT.

Pipeline: resolve types and private access -> evaluate bounded compile-time queries -> validate ownership/effects -> generate typed serializer/adapter AST/IR -> monomorphize with finite registrations -> validate target C headers and ABI fingerprints -> lower native/Wasm guest code -> reachability/tree-shake retaining all registered entries -> link and audit artifact. Deterministic generated symbols, normalized inputs and content-derived cache keys are required. Time, memory, recursion and output-size budgets are mandatory; exhaustion is a compile error, never a runtime fallback.

## 2. Compile-time type metadata

Candidate notation (syntax *illustrative*, pending parser/formatter approval):

```atto
// Only during a typed compile-time evaluation, NOT a runtime expression:
const fields = comptime type_info(Packet).fields;
const codec = comptime derive_serializer<Packet>(schema_version=3);
```

Typed descriptors may expose finite fields/variants, declared order, resolved field types, mutability, visibility and nominal type ID. No unrestricted list of loaded classes, arbitrary field get/set by string, private-field revelation, actor instance state, live object address, unsafe pointer or runtime callable invocation. Descriptor identities are compiler/linker identities, never stable wire IDs or guest pointers. Public metadata omits inaccessible members; an explicitly authorized derive within the declaring module may use private fields *only for generated code constrained by that module's visibility*, never by exporting unrestricted accessors. Type metadata has no implicit Sendable authority.

`size_of<T>()`, `align_of<T>()`, and `offset_of<T>(field)` require a statically resolved, target-specific, complete ABI-approved type; otherwise reject. They are **target layout facts**, not natural properties of structural Records. A regular nominal Struct is free to be internally optimized until explicitly ABI-declared; an unannotated Record layout and a serialization wire layout are not C ABI.

## 3. Explicit C layout (separate feature gate)

Proposed layout attribute spelling `@repr(C)` with optional `@align(N)` on a nominal `define struct` (grammar not yet approved). Only a target-owned nominal Struct with fixed-width, by-value, recursively ABI-admitted fields may opt in. No actor/class instance, open Record, flexible array, generic with unresolved instantiation, unsized field, implicit pointers, raw handle or closure crosses this boundary.

* Exact target triple, data model, endian, C compiler/toolchain revision, calling convention, struct size/align, per-field offsets, padding and layout fingerprint are compile-time contract inputs. Do not project the host's layout onto another target.
* Default layout is **ordinary C-compatible** in declaration order with field-natural alignment and tail padding. In v1, reject packed fields/structs, bitfields, unions, C enums with unspecified representation, flexible array members and over-alignment unless separately target-verified. `@align(N)` requires power-of-two, at least natural alignment, target ABI support, and independent C-side validation; never infer this from a single host model.
* Signed/unsigned exact-width integer and IEEE float storage are only admitted when matching the named C header's fixed-width types. Native C `int`, `long`, `size_t`, `_Bool`, pointers, char signedness and platform-native handles require explicit separately versioned types/adapters; an Atto `int` is signed i64, not C `int`.
* Layout and calling convention are **different**: a passing `sizeof`/`offsetof` check does not prove register passing, return-by-memory, ABI classification, variadics, exception policy or calling-convention equivalence.
* An FFI binding must compile a C11 header witness with `_Static_assert(sizeof(...))`, `_Alignof` and `offsetof` for *each admitted target*, against the actual declared header and target compiler. No silently guessed offsets. Misalignment/overflow/unsupported targets reject before guest artifact emission.
* Every size/offset computation uses checked arithmetic. Padding is never read as a serialized value or exposed as initialized data; generated FFI adapters initialize permitted outgoing bytes and perform field-wise conversions when required.

## 4. Serializer derivation is separate from memory layout

`derive_serializer<T>` generates statically typed encoder/decoder functions during compilation; serialization follows the versioned schema/wire contract in #73, **not** in-memory struct bytes. It needs a finite, fully resolved field/variant graph; compile-time typeclass witnesses may be used only through coherent static dispatch (#27). Private field access requires authorized declaration-module generation. Derivation never emits runtime code generation or unbounded dispatch, and never serializes raw pointers, actor capabilities, foreign handles, transient borrows, private secrets or unapproved dynamically typed values.

Generated decoders enforce depth/byte/element quotas, schema version and required/unknown field policy, overflow checks and transactional construction. Failure leaves no partially published object or outstanding borrow. Recursive types require explicit depth bounds and a checked allocation budget. Opaque foreign handles can only be serialized via a separately authenticated, explicitly versioned broker protocol, never their memory addresses.

## 5. Foreign ownership and effects

The existing **v1** native foreign-call surface remains scalar-only; aggregate `@repr(C)` layouts are a *candidate later stage*, not implicit permission to pass structs by value. Every approved binding is resolved from a trusted immutable manifest covering library digest, target triple, symbol, ABI version, C signature, error status, ownership mode, declared effects and callback policy.

* The source declaration and every transitive caller must admit `ffi` and any `blocking`/`suspends`/I/O effects as appropriate, with permissions checked independently against the immutable artifact ceiling and runtime authority. Compiler flags or a source `unsafe` block do **not** mint FFI authority.
* `borrow!` or implicit nonprimitive arguments are call-scoped readonly loans, never silently passed as owned C pointers. `mut` requests an exclusive loan. `take!` requires an explicit consuming foreign-ownership adapter and a verified foreign destructor/allocator pair; otherwise reject. `pin!` alone proves physical stability, not allocator authority, no-escape, cancellation or foreign lifetime.
* Foreign allocations use opaque, typed, nonforgeable `ForeignHandle<T>` capabilities, with domain, generation, rights, validated destructor and exactly-once release. They are not `Pointer<T>`, `Ref32` offsets, C `void*` exposed to guest source, scalars, nor implicitly Sendable.
* For a later bounded pinned-buffer ABI, require explicit length, bounds/overflow, alignment, provenance, alias mode, address-space lifetime, cross-suspension policy, failure cleanup and no use after actor stop/cancellation. Do not treat an actor arena offset as a native address.
* No foreign C++ exception, Rust panic, Java/.NET exception or Atto `throw!`/`raise!` may unwind across the C ABI. Translate to a checked `FfiError` or supervisor failure notice at the adapter boundary; forbid fake success.

## 6. Threads, callbacks and cancellation

**V1 callbacks and foreign reentrancy are forbidden.** A subsequent `callbacks-v2` contract must explicitly specify registering/unregistering an AOT-compiled callback trampoline (finite generated code set), foreign thread attachment, scheduler handoff, callback actor/domain, generation fencing, reentrancy restrictions, effects, buffer ownership, cancellation races and exactly-once detach/drop. A callback never directly enters a sealed actor's critical state or captures a lexical borrow that can expire. Unknown callback thread or unbounded callback lifetime rejects. Foreign completion tickets are distinct from lifetime leases; double completion cannot consume another lease.

## 7. Explicit failure diagnostics

Suggested stable families: `E_COMPTIME_REFLECTION_DYNAMIC`, `E_COMPTIME_PRIVATE`, `E_COMPTIME_BUDGET`, `E_ABI_TARGET_UNKNOWN`, `E_ABI_LAYOUT_MISMATCH`, `E_ABI_UNSUPPORTED_FIELD`, `E_ABI_ALIGNMENT`, `E_FFI_OWNERSHIP`, `E_FFI_EFFECT`, `E_FFI_CALLBACK`, `E_AOT_RUNTIME_REFLECTION`. These are targets, not claims of existing parser diagnostics. Failures must occur **before executable artifact emission** when statically knowable.

## 8. Verification and milestone gates

* **Stage C0, source-free model**: finite descriptor/layout/binding manifest and mutation tests verify internal consistency only. A successful JS/Python validator is NOT compiler execution.
* **Stage C1, compiler admission**: compile positive/negative canonical `.atto` sources with real parser, type/effect/borrow checkers; negative cases must emit the targeted diagnostic and no executable IR/artifact.
* **Stage C2, ABI/layout proof**: generate target layout tables and C11 header witnesses; compile C static assertions using each target's ABI/toolchain, inspect generated IR/symbol reachability and reject mutated ABI manifests. A host C witness does not certify another target.
* **Stage C3, full guest AOT**: link and run independently compiled guest/native/Wasm artifacts with generated serializer and approved FFI adapter, runtime fault/ownership/cancellation tests and a check for **no guest interpreter, JIT, runtime reflection or runtime code generation**. Test Java/GraalVM, LLVM, .NET NativeAOT, Forge, Wasm, Cranelift and relevant embedded profiles separately; unsupported targets reject.
* Receipts must record exact source head and tree SHA, per-file/blob integrity, compiler/toolchain target, C header digest, generated layout fingerprint, executable/module hash, actual test commands, **executed** steps and observed results. Zero-step GitHub Actions, reference models and host Native Image alone are NOT_EXECUTED for guest parity.

**Overlap disposition:** The existing scalar/actor foreign boundary stays governed by [atto-spec #54](https://github.com/atto-lang/atto-spec/pull/54) and [29-case conformance #49](https://github.com/atto-lang/atto-platform-conformance/pull/49). Struct/Record semantics remain in #72, wire serialization in #73, static typeclass witnesses in #27, and scoped unsafe rules in #126. This proposal extends those without declaring their as-yet-unverified features shipped.
