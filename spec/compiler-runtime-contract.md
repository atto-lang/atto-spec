# Compiler, IR and Runtime Portability Contract — Editor's Draft

**Edition:** 0.1 | **Updated:** 2026-11-04 | **Status:** Proposed normative backend contract

This specification supplements [the core language](language.md) and is verified through [conformance](conformance.md).

## 1. One semantic language, independent execution engines

Oreslang's semantic definition is **not** LLVM IR, the Truffle interpreter's Java implementation, a Wasm execution model, CIL, nor a Cranelift-specific convention.

All backends must preserve observable behavior as established in the language specification, even if they differ in layout, allocation, scheduling, code generation, and optimization.

Target implementers:

| Backend | Lowering model | Intended execution |
| --- | --- | --- |
| Java/GraalVM | Language nodes or Truffle bytecode, specialized through Graal | JVM JIT and GraalVM Native Image |
| LLVM | Verified MIR to LLVM IR, linking against native runtime | Native AOT and optional LLVM JIT |
| Wasm | Verified MIR to Wasm and host runtime imports | Browser/Node workers and appropriate Wasm hosts |
| Forge | Independent Forge compiler/runtime and its reviewed native lowering | Native interpreter/JIT/AOT profiles only when evidenced |
| Cranelift | Independent Cranelift compiler and runtime, with its own verifiable lowering | Native JIT and/or AOT profiles only when evidenced |
| .NET | Verified MIR to CIL and portable runtime | Native AOT on supported targets |

These describe **six separate required backend identities**, not verification results. Forge and Cranelift MUST NOT borrow one another's compile, runtime, or source-coverage evidence. JavaScript transpilation is optional and cannot substitute for a required backend. See [spec-to-corpus traceability](parity-traceability.md).

## 2. Compilation stages

Recommended common phase structure:

~~~text
.atto source (legacy .ores accepted only by explicitly declared compatibility profiles)
  -> tokens / parsed AST with source ranges
  -> resolved typed HIR (names, effects, generics, traits)
  -> ownership and borrow validation
  -> explicit control-flow MIR
  -> MIR verifier and portable lowering contract
  -> target-specific lowering
  -> optimization
  -> executable / runtime artifacts
~~~

A second independent Java or C++ frontend may exist, but it must produce semantically equivalent validated IR. A shared **versioned schema**, validator, and fixture corpus is preferred to brittle direct sharing of backend compiler internals.

### 2.1 HIR minimum information

HIR must preserve:

- stable source spans, expansion/formatter provenance, and package/module identities;
- resolved nominal and structural types, generic substitutions, symbol identities, and overload selections;
- purity, throws/raises/panics, permission/capability effects, and suspension effects;
- ownership classification, borrow provenance, alias regions and actor domain of each relevant value;
- capture lists and escape classifications for closures and actor state callbacks;
- exhaustive-pattern and duplicate-arm analysis results.

No backend may defer semantic validity to host-language incidental behavior.

### 2.2 MIR minimum operations

MIR must make side effects and control-flow boundaries explicit, including at least:

| Family | Representative MIR operations | Invariants |
| --- | --- | --- |
| Values | const, convert, compare, phi/block_argument | Explicit signedness, widths, numeric equivalence |
| Arithmetic | checked_add/sub/mul, divide, shift | Defined overflow and exceptional edges |
| Memory | allocate, load, store, drop | Proven type, alignment and ownership state |
| Ownership | borrow, borrow_mut, take, copy, share, end_borrow | No conflicting alias or use-after-take |
| Calls | call, return, indirect_call | Typed signatures and effect compatibility |
| Errors | throw, raise, panic, recover_region | Same escalation semantics |
| Actors | spawn, send_admit, mailbox_close, control_notice | Typed envelopes, linearizable admission |
| State | critical_read, critical_write | No unproven state reference escape |
| Async | await, select_register, select_commit, cancel | Explicit suspension and cleanup |
| Resource | channel_send/receive/close, permission_check | Portable success/failure classification |
| Lifecycle | reload_dispatch, retire_version | No dangling code/state during hot reload |

Names in this table are semantic op families, not a commitment to a concrete serialized opcode spelling.

### 2.3 Verification gate before lowering

The MIR verifier must reject unknown opcodes, invalid CFG edges, uninitialized reads, incompatible types, forbidden effects, ownership/lifetime violations, malformed actor transitions, and unsupported target capabilities with distinct diagnostics.

A target may reject an unsupported feature *before running*; it may not silently reinterpret the feature.

**Open:** Ratify canonical MIR serialization, schema versioning, required verifier proofs, generic monomorphization strategy and the common source-mapping format.

## 3. Numeric and memory correctness on LLVM

### 3.1 Never conflate LLVM optimization assumptions with Oreslang semantics

LLVM poison, undef, unreachable and undefined behavior are **not** valid substitutes for defined language errors.

- For checked signed arithmetic, use explicit overflow detection (for example, llvm.sadd.with.overflow) and branch to a language-defined error path.
- Do not attach nsw/nuw flags unless the compiler proves overflow cannot occur under the language contract. Unproven use can introduce poison and invalid optimizations.
- Shifts, division by zero, signed minimum divided by -1, float comparisons, truncating casts and pointer arithmetic require explicit language semantics before lowering.
- Do not assume Java overflow or Java floating-point library behavior is a portable oracle.
- Select signed or unsigned LLVM comparisons explicitly; numeric literals must have predictable inference and conversion outcomes.
- Optimization under -O0/-O2/-O3 must preserve observable results.

The default Oreslang overflow policy for operators without an explicit checked form remains **open**. Backends must not use implicit native wrap, Java wrapping or LLVM poison as a surrogate decision.

### 3.2 Target data layout and pointers

- Use current LLVM opaque pointers, with pointee type information maintained in Oreslang's verified IR.
- Use the target DataLayout for size and alignment, not pointer-width or field-padding guesses.
- Keep high-level type identity distinct from native object layout.
- Stable on-wire messages and persistent encodings must define their own endianness, field widths, version and length limits.
- Uninitialized native bytes must never become observable Oreslang values.
- Bounds, nullability, provenance and lifetime checks must not be optimized away unless proven redundant.

LLVM volatile operations are not synchronization. Data races must be prevented using the appropriate synchronization/atomic model, and memory ordering must be justified with a happens-before proof.

### 3.3 LLVM verification and sanitizers

Required native gates should include LLVM IR verifier, O0/O2 optimization equivalence, generated-target ABI checks, ASan/UBSan, and focused concurrency race/stress tests. Sanitizer execution is evidence for tested workloads, not a substitute for proof of absence of races.

On x64 and ARM64, with GCC/Clang used where appropriate for native runtime builds, record target triples, optimization level, runtime allocator mode, and exact source tree identity.

## 4. Truffle/GraalVM execution discipline

Truffle is a guest-language execution and specialization framework. Graal partially evaluates hot language constructs; the Java implementation must therefore preserve source semantics when specialized or deoptimized.

- Use Truffle DSL specializations for common arithmetic and data representations; do not let specialization change overflow or error semantics.
- Treat @CompilationFinal and Assumption as proof obligations: invalidate assumptions when mutable language state or reloaded definitions change.
- Preserve exact exceptions/errors when crossing @TruffleBoundary and other runtime boundaries.
- Do not hide effectful operations in ostensibly pure cached nodes.
- Audit node sharing, source sections, materialized frames, escape and ownership metadata.
- Test interpreted execution, warmed JIT execution and Native Image independently.
- Avoid using JVM GC reachability as proof that exclusive mutable borrows or actor handoff are safe.

A warmup/deoptimization event is not an Oreslang-visible state transition except to the extent the language explicitly exposes profiling APIs. Backend-internal bailout must not change user-visible errors or actor message admission.

**Open:** Canonical Native Image support profile, retained metadata/reflection policy, and stable hot-loading behavior in fully AOT mode.

## 5. Ownership and allocation across managed and native runtimes

### 5.1 Uniform ownership proof

The borrow checker must validate the same aliasing and lifetime conditions on **stack values and heap referents**, and produce consistent diagnostic categories independent of target.

| Semantic capability | Native implementation option | Managed implementation option |
| --- | --- | --- |
| Exclusive object | Owned allocation / actor arena | Runtime object with checked exclusive capability |
| Shared immutable | Shared handle/refcount | Shared object plus immutable views |
| Shared mutable | Explicit synchronized wrapper | Lock/atomics or runtime-safe mutable wrapper |
| Vector | Native resizable allocation | Specialized array/buffer |
| Actor transfer | Transfer ownership capability | Revoke sender capability, transfer receiver authority |
| Borrow across suspend | Pinned/proven lifetime | Retained frame with same lifetime proof |

GC, arena allocation, refcounting and moving objects are implementation details. The semantic guarantee is that illegal aliases and use-after-transfer cannot be observed by valid programs.

### 5.2 Actor arenas and real-time profiles

The Java/GraalVM runtime may use near-zero-GC actor arenas; the LLVM native runtime targets zero-GC actor-owned heaps. Neither guarantee follows merely from the compiler backend name.

An RT profile must explicitly state where allocation, blocking, safepoints, watchdog intervention, callback execution and destruction may occur, with measurable upper bounds. A general JVM/Truffle runtime should not be labeled hard-real-time solely because it uses LLVM-like value representations.

For native code, region teardown, mailbox erasure and in-flight ownership transfers must prove no dangling references or double frees. For managed code, logically invalid sender capabilities must remain unusable even when the host object still exists.

## 6. Actor mailbox, supervisor and channel ABI

Define a **language-neutral protocol**, not a Java class or C++ struct layout, for:

- actor and parent/supervisor identity, lifecycle incarnation and capability;
- payload type ID and transport form (in-process handle vs serialized value);
- actor message admission result and linearization point;
- mailbox capacity/closure and accepted-in-flight policies;
- supervisor CONTROL notices, priority semantics, panic escalation and bounded failure payloads;
- shutdown, cancellation and destructor/finalizer effects.

A Result from send confirms the selected **admission** outcome. It does not certify handling, durable transport or consumer acknowledgement.

For ordering, require a stable per-sender/per-recipient policy where specified, but do not require that independent schedulers produce identical wall-clock interleavings. Conformance must compare legal partial orders, not a single trace string.

For high-priority CONTROL traffic, specify capacity reservation, wake behavior and overload handling separately from ordinary mailbox traffic. The contract cannot depend on a backend queue class name.

## 7. Error and effect lowering

The Oreslang throw → raise → panic escalation policy must be represented explicitly in typed MIR and backed by cleanup paths.

- Java Throwable and ArithmeticException are **host** events until converted.
- LLVM landing pads/personality functions are **backend** implementation details.
- Wasm traps and .NET exceptions are not automatically language-level panic.
- Native cleanup and managed finally/defer must release borrows, capabilities and critical regions in a semantically equivalent order.
- A panic inside an actor must notify the supervisor over the CONTROL protocol; no actor-local catch may swallow it.
- Errors may carry stable numeric/string classification, payload schema and optional explicit trace capture, but native stack addresses are not portable.

Main-thread uncaught error reporting/exit mapping remains an **open question**.

## 8. Hot loading and code lifetime

A replaceable function/actor implementation must have a versioned dispatch identity and stable caller-visible signature/effect contract.

- **Truffle:** invalidate applicable Assumptions; stale compiled call sites must deopt/recompile as necessary.
- **LLVM native:** use safe indirection or versioned callable tables, keep old code and related state alive while live frames still reference them, and retire only after quiescence.
- **Other backends:** provide equivalent version admission and safe retirement or report the feature unavailable before execution.

Do not promise hot loading for AOT profiles lacking a safe implementation. Actor state migration must be explicit, versioned and failure-atomic where the language promises it.

**Open:** Whether active frames complete under their original code version, migration capabilities, version visibility and inter-actor reload barriers.

## 9. Stable runtime ABI versus in-memory layout

The runtime ABI should be versioned independently of compiler-specific structures:

1. Calling conventions and error/outcome representation.
2. Type identities, symbol handles and generic instantiation naming.
3. Actor ID, mailbox and subscription handle operations.
4. Ownership transfer, retain/release and lifetime invalidation.
5. Channel/stream cancellation and backpressure.
6. Permission checks and host-call mediation.
7. Wire formats for Result/Option and user messages.
8. Hot-load dispatch epochs and safe retirement.

A wire-format golden fixture (including byte order, tag bytes, length bounds and error cases) must be validated across all five targets. A specific encoding may be fixed only by an accepted wire-format specification, not inferred from a host serializer.

## 10. Portability profiles and FFI isolation

Portable source should not need to test whether it runs under JVM, LLVM, Cranelift, Wasm or .NET to preserve core semantics.

Target-specific code is permitted only behind explicit capability/target-profile interfaces. Prohibit accidental host-library imports through package-resolution loopholes. Runtime-specific optimizations should be unobservable except through explicitly supported performance/introspection interfaces.

- Wasm worker/MessagePack isolation cannot assume shared raw native pointers.
- .NET Native AOT must not require runtime code generation/reflection that deployment removes.
- Java Native Image cannot depend on JVM dynamic loading capabilities without explicit configuration.
- LLVM and Cranelift must not promise managed-runtime GC or stack-unwinding behavior unless implemented.
- Any unsupported feature must fail with a stable diagnostic, never silently change actor safety or error propagation.

## 11. Verification provenance and release rules

For every backend conformance result record:

~~~yaml
spec_edition: "0.1"
fixture_id: "arithmetic.signed_add_overflow_64"
backend: "llvm"
source_commit: "<full source commit SHA>"
source_tree: "<full source tree SHA>"
conformance_commit: "<full test commit SHA>"
target_triple: "<actual target>"
compiler_version: "<actual version>"
runtime_version: "<actual version>"
optimization: "O2"
execution: "EXECUTED"
result: "PASS"
artifact_digest: "<actual digest>"
~~~

The angle-bracket fields here are deliberately placeholders, not verification evidence.

Valid statuses include NOT_IMPLEMENTED, SOURCE_REVIEWED, COMPILE_VERIFIED, RUNTIME_VERIFIED, CONFORMANCE_VERIFIED and NOT_EXECUTED/BLOCKED. A zero-step CI run cannot establish compiler or runtime behavior. A passing source-only lint cannot establish native ABI or cross-backend parity.

When the source organization cannot admit an Actions job, an independent runner may test a **private, token-free mirror** on a temporary branch, but only after exact tree/blob identity is checked and the target run's isolation and permissions are documented. The mirror result must not be misreported as having run on the original repository's CI.

---

**Next:** [Conformance and parity](conformance.md).
