# AttoLang foreign boundary / ABI v1 — candidate contract

**Status: PROPOSAL; not released.** This is a target for independent review, not evidence that any backend implements foreign calls. Rust/Wasm `atto` guest imports, the owned-callable proposal, and Java's `ffi actor` draft are distinct feature gates.

## Boundary separation

1. **Language-to-guest ABI:** compiler-emitted entry points and negotiated, typed `atto` imports. Before guest instantiation, the host validates exact import module, name, parameters, results, ABI version and module memory contract; a matching name with a different signature is invalid.
2. **Guest-to-foreign ABI:** an authenticated, capability-gated adapter to an approved native library or service. Guest source cannot select a DLL/soname, pathname, raw symbol address, calling convention or function pointer. A supervisor-supplied immutable binding resolves the source declaration.
3. **Actor transport:** application messages use typed copy/move/serialization. A pointer, `Channel<T>` or actor reference does not automatically become foreign authority. Supervisor CONTROL notices remain isolated.
4. **Managed host edges:** Java/JNI/Panama, .NET/PInvoke/NativeAOT and native LLVM have separate calling conventions. They implement common *semantic* rules, not byte-identical Wasm/C layouts.

No layer silently upgrades `Pointer<T>`, borrowed views, callback closures, actor references or channels to `void*`. The stack-only `Pointer<int>` AOT milestone is not FFI permission.

## Candidate declaration and supported types

The existing Java draft recognizes `extern suspends fnc name(...): T;` only within an `ffi actor`. Keep this as a **candidate**, not a second language-wide keyword or an implemented foreign linker. An `ffi actor` requires explicit supervisor FFI authority and an authenticated `ActorArtifact`. An untrusted actor cannot load foreign code.

V1 allows **only** signed `int` (i64), `bool` (canonical 0/1), `float` (IEEE-754 binary64) parameters and scalar-or-`void` results. Reject `str`, slices, structs/records, callbacks, generics, actor/channel references, pointers, borrow parameters and direct `Result` ABI lowering until separately versioned. A checked source wrapper may return `Result<T,FfiError>`; this does not define a native C `Result` struct.

## Representation and negotiation

- `int` is signed 64-bit on both 32- and 64-bit machines; never infer C `int`, `long` or pointer width. Adapt through a verified fixed-width host type, rejecting truncation.
- `bool` is strictly 0 or 1. Canonical **interchange** is one byte. Wasm `i32`, JNI `jboolean`, C `_Bool` and .NET `bool` use explicit boundary adapters; no truthiness conversion.
- `float` is binary64; canonical interchange uses little-endian bits, preserving signed zero and normalizing NaN to `0x7ff8000000000000`. Infinity is representable. Each host ABI uses its own correct register/stack convention.
- Interchange bytes are **not** a packed `extern "C"` struct or native calling convention. No implicit alignment, padding, `size_t`, `long double`, varargs or pointer-shaped integer conversion.
- Each approved foreign symbol binds target triple, calling convention, full signature, ABI revision, immutable capability identity and artifact SHA-256. Unknown revision/flags, changed type, duplicate binding, changed artifact digest, or target mismatch reject **before** load/guest execution; there is no unchecked fallback.
- No C++/Rust panic/Java/.NET exception unwinds across foreign frames. The adapter returns checked foreign status and the actor layer maps it to `FfiError` or a terminal supervisor notice. A foreign fault must never appear as a successful scalar return.

## Authority, generation and lifetime

Opaque supervisor-owned handle authority contains logical fields `(domain, actor generation, slot, slot generation, type ID, rights)`. This is **not** a guest-visible packed integer ABI. The broker mints/validates it; slots and generations never wrap into a previously valid identity. Neither `take!`, `copy!` nor `share!` implicitly transfers the capability.

Call admission and resumed completion check exact owner/actor generation, type, rights, target, ABI fingerprint, capabilities, and bounded quotas. An accepted foreign completion retains an **external lifetime lease** only; it does not grant access to actor memory. Each outstanding call gets a distinct completion ticket: double completion of one ticket cannot consume another call's lease.

Actor stop, trust downgrade, artifact unload, callback cancellation and hot-reload generation changes revoke new admissions. Physical arena reclamation waits for outstanding accepted leases. A late callback cannot resurrect retired authority. Native buffer access in v1 is **copy-only** unless a later ABI separately proves pin/borrow lifetimes; 32-bit guest offsets cannot be treated as host pointers.

**Callbacks and synchronous foreign reentrancy are unsupported in v1.** A later feature must use scheduler/actor-mailbox entry, exact generation checks, cancellation and critical-lock discipline. Never execute arbitrary foreign code inside the actor's critical section.

## Mandatory negative and executable checks

Reject raw-pointer/borrow/string/callback parameters, explicit library paths or alias symbols, bad `bool` bytes, version/target/signature mismatch, missing FFI rights, untrusted foreign actors, stale/cross-domain/type/rights-mismatched handles, duplicate completion, callback after actor retirement, unwinding across foreign boundaries, reentrant critical sections and 32-bit pointer truncation. Compile-time rejection must leave **no generated guest artifact**. Runtime failure must preserve source ownership and release lifetime leases once.

The [29-case candidate FFI conformance matrix](https://github.com/atto-lang/atto-platform-conformance/blob/main/contracts/ffi-boundary-v1.json) records Rust/Wasm, Java/GraalVM, LLVM/ASan+UBSan, .NET NativeAOT and Forge as **NOT_EXECUTED** until exact-source guest receipts exist. Each target requires compiled source, real approved foreign downcall, malformed input rejection, errors/teardown, no-artifact negatives, 32/64-bit conversion, independent review and exact-run logs. Host-only reference tests and Actions runs with zero executed steps are **not** guest evidence.

## Existing work — non-overriding

- [Rust/Wasm Channel JSPI guest #235](https://github.com/atto-lang/atto-source.rs/pull/235): channel import, not generic FFI.
- [Owned-callable ABI proposal #20](https://github.com/atto-lang/atto-spec/pull/20): callable handles, not foreign callback admission.
- [LLVM `Pointer<int>` native AOT #14](https://github.com/atto-lang/atto-source.llvm/pull/14): intentionally denies FFI.
- [Java external actor draft #1350](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/1350): authenticated artifact foundation, not executable native linking.
