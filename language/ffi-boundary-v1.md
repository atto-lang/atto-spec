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

## M0 executed implementation evidence — strictly narrower than v1

[AttoLang LLVM draft PR #22](https://github.com/atto-lang/atto-source.llvm/pull/22) compiled a narrow opt-in static `i64(i64,i64)` bridge and executed five actual native C downcalls in release and ASan/UBSan profiles. The exact **72-file** source tree `2072e788498ee1388211eb4ca8512781444d53b1` was verified on a private token-free carrier; [stepful Actions #43960288920](https://github.com/anticaptrad/atto-ci/actions/runs/43960288920) succeeded. The LLVM compiler binary SHA-256 was `c19cd1216da71ab475ad2ef4c5286884d19e638620e091c30451690af5d1a1ab`. Twelve malformed/ungranted source cases rejected without LLVM IR, and link without the fixed C shim failed.

**M0 is not an implementation of this v1 contract.** It only permits decimal inputs 0..255 with sum <=255, a single statically linked symbol, and fixed output. The opt-in `--ffi-grant=atto.math.i64.v1` is an experimental compiler flag **not** a trusted supervisor capability. Its static `NativeMath.add_i64` syntax is a test-only bridge probe, not approved public actor-call syntax. No actor is spawned and no suspension occurs. Missing: authenticated artifact identity, actor ownership/lifetime leases, general i64 domain, checked native error mapping, actual `Result` adapter, 32-bit native proof, callbacks, real foreign cancellation, JVM/Graal/.NET NativeAOT parity.

Likewise, Rust/Wasm [JSPI integration PR #244](https://github.com/atto-lang/atto-source.rs/pull/244) passed full source-compiled Chromium guest execution in [focused run #43957723001](https://github.com/anticaptrad/atto-ci/actions/runs/43957723001) and [full compiler run #43957722875](https://github.com/anticaptrad/atto-ci/actions/runs/43957722875). This establishes a versioned **channel guest import** boundary, not native library FFI.

## Promotion gate for ABI v1

Before any backend reports v1 foreign-call support it MUST execute from normal, supported AttoLang source (not only a special proof grammar): an actor-supervisor authorized FFI call; identity-checked immutable artifact binding to target + ABI + symbol signature; true `i64` range, `bool` canonicalization and `f64` edge values; checked error conversion without cross-frame unwinding; cancellation and exactly-once generation-scoped lifetime cleanup; invalid pointer/borrow/alias, missing permission and tampered signature negatives with no artifact. AOT native targets must prove actual executable and sanitizer gates; compiler-only, source-free, host-only and zero-step workflow evidence must remain **NOT_EXECUTED**.

Version negotiation must happen **before** executable foreign code is loaded or guest Wasm is instantiated. Unknown capability/ABI profile combinations must fail closed, and no unreviewed `extern` declaration may become a C symbol or host import by naming convention alone.

## M1 normal-compiler foreign declaration proof — narrower than FFI actors

Atto LLVM [draft #23](https://github.com/atto-lang/atto-source.llvm/pull/23), stacked on the earlier M0 proof, introduces an **actual normal-parser** approved declaration and ordinary call:

```atto
extern fnc atto_add_i64(int a, int b): int using ffi;
pub fnc main(): int using ffi {
  return atto_add_i64(20, 22);
}
```

The compiler routes this through normal AST resolution, scalar argument checking, ownership admission and LLVM function lowering, rather than the special M0 proof parser. Only one immutable linker symbol and two value-`int` arguments are admitted. An explicit provisional host `--ffi-grant=atto.math.i64.v1` gate is required; without it, or with a missing declared caller effect, compilation fails **with zero LLVM IR**. The first caller is a zero-parameter native main directly returning that call with literal i64 arguments. Parser-level checked arithmetic rejects literal signed 64-bit overflows/underflows before the C shim can execute undefined signed arithmetic. Real Clang C linking and native executables are tested under ASan/UBSan with wide i64 operands.

**M1 must not be labeled ABI v1 complete.** The CLI grant is not flags-2-env production permissions, not a signed supervisor capability, and not authenticated artifact admission; no FFI actor is spawned and no scheduler-owned suspend, mailbox unary response, Result/FfiError, cancellation, generation-lease callback or CONTROL notice is yet implemented. The target actor contract below remains pending and cannot be inferred from success of a synchronous C call.

### Required next runtime actor gate (proposal, NOT implemented)

An FFI actor is a supervised special actor; its inbound `receives` contract types the admitted call messages, and `sends` types permitted downstream application messages. Supervisor CONTROL signaling is separate, and an actor may have many downstream typed destinations but only its designated supervisor. Unary calls return a checked `Result<T,FfiError>` through one scheduler-owned reply ticket; `respond_with`/`send_back` are at-most-once and must be consumed, cancelled or failed exactly once. A non-unary actor may handle unary message variants using the same one-shot ticket, without automatically making every stream message unary.

The runtime, **not the source or CLI flag alone**, must mint a binding capability containing actor owner/generation, target, immutable artifact digest, permitted symbol/signature, call effects, rights and bounded quota. A call must check this tuple before dispatch and again when settling the foreign result. Revoking admission on actor stop/hot reload may not allow an old callback to enter the new generation; outstanding accepted completion leases delay arena reclamation but never grant guest memory access. Foreign failures must convert into checked FfiError and, for terminal actor failure, a priority supervisor CONTROL notice. They must not unwind C++/Java/.NET exceptions across foreign frames.

Production CLI permission parsing must use the canonical [flags-2-env](https://github.com/flags-2-env/flags-2-env) project and `.cli-flags.toml` contract, with precedence CLI > environment > declared defaults; a compiler flag for a *test-only static symbol* is not authorization to dynamically load a shared library. Full native AOT, no uncontrolled GC, and explicit host/guest isolation remain mandatory.

Any CI receipt for M1 proves **only** its executable source-compiled i64 static C ABI case. The five-backend ABI v1 matrix remains NOT_EXECUTED until the real actor/runtime and error/lifetime checks are executed by each backend.

## Compile-time reflection, generated serializers and explicit layouts (separate candidate)

The [AOT compile-time reflection and C layout candidate](compile-time-reflection-ffi-layout-v1.md) specifies finite type metadata, derived **static** serializer code, explicit target-specific `@repr(C)` / `@align` contract candidates and safe foreign-handle/borrow/effect boundaries. It does **not** expand this v1 scalar-only foreign-call ABI to aggregates or callbacks, and its source-free JS layout model does **not** certify any compiler, C header or guest AOT artifact. The [record/struct layout proposal #72](https://github.com/atto-lang/atto-spec/pull/72) governs nominal versus structural storage; [serialization proposal #73](https://github.com/atto-lang/atto-spec/pull/73) owns wire encoding. All must be reconciled before aggregate FFI can be enabled.
