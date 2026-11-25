# 24 — AOT, Zero-GC and Controlled Dynamism

**Status: TARGET / DRAFT; no backend is certified by this chapter.** This amendment refines [ownership and memory](04-ownership-and-memory.md), [modules and AOT](09-modules-and-aot.md), and [conformance](11-conformance.md). It does not retroactively change existing runtime modes or claim that any hosted backend has achieved strict full guest AOT or process-level zero GC.

## Definitions and profiles

- **Full guest AOT:** all guest executable code required by the selected deployment is compiled before execution. A GraalVM Native Image containing a guest interpreter or a .NET NativeAOT host is **host AOT**, not proof of **guest AOT**.
- **Sealed / closed-world full AOT:** every reachable implementation, method target, instantiation, class descriptor, dispatch edge, macro expansion, reflection entry and permitted proxy shape is known to the linker at build time. No runtime source/bytecode evaluation, runtime method generation, unregistered class loading or interpreter/JIT fallback.
- **Governed precompiled-module AOT:** an explicitly separate deployment mode may admit **already-AOT-compiled** modules at runtime under signed/validated manifest, versioned ABI, finite import surface, capability checks, generation fencing, quiescence and rollback. It is *not* sealed closed-world AOT and must never invoke a runtime compiler. Specify target/platform loader limits explicitly.
- **Guest zero tracing-GC:** all **AttoLang guest-owned** allocations have compiler-checked ownership or an explicitly governed reclamation strategy; no guest tracing collector is required for admitted code. This is not zero heap allocation, constant-time deallocation, or guaranteed absence of leaks.
- **Process zero-GC:** the complete runtime, including host wrappers, dependencies and FFI, performs no GC. This stronger claim needs separate proof; managed Java/.NET and JavaScript/browser hosts may have GC even when guest arenas are deterministically reclaimed.

JIT/interpreter/hybrid profiles remain valid where explicitly selected; never advertise them as full guest AOT. A strict build MUST reject unsupported features *before executable output* rather than silently falling back. Arbitrary values, dynamic allocation sizes and runtime virtual dispatch do not by themselves violate AOT.

## Dynamic language feature admission

| Feature | Strict sealed-AOT admission rule | Memory/lifetime obligation |
| --- | --- | --- |
| `eval`, runtime source compilation, runtime AST-to-code, emitting executable machine code | **Reject** | N/A |
| Runtime class definition, monkey-patching prototypes/methods, unbounded method lookup | **Reject**; use macros/code generation at build time | Static method metadata and immutable dispatch contracts |
| Reflection/introspection | Compiler-generated, finite, visibility/capability-filtered metadata; no implicit reachability or host reflection escape | Reflected handles are generation- and owner-checked |
| `Proxy<T>` / interception | Compiler generates a *finite* wrapper/forwarder for a statically resolved target or constrained interface; no arbitrary late-discovered class or method | Preserve receiver, effects, privacy, borrowing, reentrancy and drop behavior; static methods use an explicit class-level facade |
| Inheritance, interfaces, virtual dispatch, typeclasses | Allowed with linker-known class hierarchy/implementations or explicit finite registration; retain all reachable dispatch edges during tree shaking | Receiver and vtable/descriptor handles cannot outlive their instance or module generation |
| Generics, AST macros, monomorphization | Build-time expansion/specialization or static dictionaries only; resource-bounded and hygienic | Specialized code obeys the same ownership rules |
| Closures and higher-order functions | Statically compiled closure code and explicit environment layout; no guest closure transported via channels/pub-sub | Capture by move/copy/borrow/share with checked lifetimes, especially after `await` |
| Async, actors, channels, iterators | Compile state machines/continuations AOT; no runtime guest-code generator | Owned frames, explicit cancellation and retirement, quota enforcement, actor generation fencing |
| Hot upgrade / plugin loading | Sealed mode: only prelinked choices. Separately governed AOT-module mode: precompiled ABI-compatible modules and transactional fencing | Old generations stay alive until all references, tasks, timers, I/O loans and frames retire |

A manually written subclass is permitted, but it is not a substitute for compiler-generated proxy forwarding when the public contract requires exhaustive method interception. Never synthesize access to private methods, mutate foreign prototypes or reify static methods as instance methods without explicit language support.

## Mandatory memory invariants

1. Every guest allocation has a provenance, owner (actor/task/region/value), bounded admission, destructor/drop path and explicit failure behavior; shared ownership requires a documented cycle strategy. Merely calling a region an "arena" proves nothing.
2. The compiler rejects use-after-`rt take`, double drop, escaping loans, conflicting mutable aliases and stale-generation handles before native IR/code emission. Existing `rt borrow`, `rt share`, `rt take` and `rt copy` rules remain authoritative; no unchecked pointer syntax.
3. Strong cycles are prohibited, made weak at appropriate edges, or reclaimed as a proven whole-region lifetime. Unrestricted strong-reference cycles cannot be combined with a leak-free, solely reference-counted reclamation claim.
4. A long-lived actor MUST have a safe way to release temporary/retired allocations while remaining alive. Actor termination arena teardown alone is insufficient. Scratch/task regions, explicit drops, bounded pools or provably safe reclamation are valid mechanisms.
5. Suspended continuations own or pin their frames and captures. Cancellation, exceptions, task completion, restart, supervisor shutdown and normal return must each release exactly once. Cleanup cannot race with in-flight I/O or generation fences.
6. Across actor/channel/pub-sub boundaries, only validated Sendable payloads cross, using `take`, `copy` or authorized immutable `share`. Do not transfer lexical closures, methods, raw pointers, borrowed actor state or hidden host capabilities.
7. The allocator must check quotas, arithmetic overflow, handle generations, bounds and alignment. Out-of-memory is a defined fail-closed outcome; no silent ownership bypass or unbounded queue growth.
8. Preserve existing language constraints: no implicit conversions, no operator overloading, no reintroduction of the `%` or single `^` operators (`^^` is the boolean XOR operator; see chapter 16), and no implicit flattening of nested `Option`/`Future`. Compiler-generated wrappers may not bypass these restrictions.
9. **No GC does not imply hard real time:** cascaded reference drops, finalizers, allocator operations, arena retirement and cancellation can be unbounded without a separately measured and enforced latency policy.

## Backend-specific claim boundary

- **LLVM native / Forge / Cranelift:** prove native guest code and non-tracing guest reclamation via real compiled execution, sanitizer/allocator instrumentation and scoped-lifetime tests. An optional JIT does not qualify in sealed full-AOT mode.
- **Java/GraalVM:** Native Image proves host AOT only until each guest function is lowered and runs without interpreter fallback. Off-heap actor arenas may attain guest zero tracing-GC while Truffle/Java wrappers remain managed; never claim process zero-GC without complete proof.
- **.NET NativeAOT:** NativeAOT does not remove the managed GC; distinguish host compilation, guest native execution, guest arenas, and process memory. A reflection/trimming workaround that uses runtime code emission is forbidden in strict mode.
- **Wasm:** AOT-produced modules may manage linear memory without guest tracing GC, but JS runtimes, browser Workers and host bindings can still collect. Worker isolation is not an ownership proof.
- **JavaScript transpiler:** generation of ESM at build time may be a valid transpilation path; the JavaScript engine still executes with its own GC and may JIT. Mark full native guest AOT and process zero-GC **NOT APPLICABLE / UNPROVEN**, not supported.
- **Rust bootstrap and HDL:** static source lowering and hardware synthesis have profile-specific limits. Do not extrapolate scalar simulation or a Rust host test to full AttoLang guest AOT, actor semantics, or process zero-GC.

## Conformance gate for every newly dynamic feature

Require all of the following before changing status from TARGET to backend-verified:

1. A compile-time feature/dispatch manifest, reachable-method metadata, generated-proxy/code listing, and bounded build behavior. Build the same *canonical* `.atto` fixture.
2. Positive compiled guest tests for virtual method dispatch, valid static proxy wrapper, ownership-safe closure captures, explicit moves/copies/shares and actor/frame cleanup.
3. **Negative source-admission tests (reject before executable IR):** forbidden `eval`/runtime code generation; runtime class injection; unregistered reflection; unknown proxy target; private-method proxy escalation; statically provable escaping borrow across `await`; statically provable ungoverned strong-reference cycle; function/closure transport in a channel; and unsupported dynamic module loading in the selected sealed profile. Each rejected fixture must match the *intended* diagnostic and must not emit an executable artifact.
4. **Lowering and artifact integrity tests:** for valid accepted source, inspect generated IR, reachable-method/dispatch manifests and target binaries to prove every required dispatch edge and cleanup edge is preserved, with no unexpected interpreter/JIT entry or runtime-codegen dependency. Missing edges are compiler defects caught by IR/artifact checks, not necessarily source syntax errors. Record negative mutations of the generated evidence or lowering where feasible.
5. **Runtime negative and stress tests:** exercise stale-generation actor references, invalid capability/module admission, long-lived actor churn under quotas, cancellation and supervisor restart during outstanding I/O, concurrent publish/unsubscribe/close, module-generation retirement, allocator failures, and no double release/use-after-free. Runtime-only failures must be demonstrated by executed guest artifacts, not relabeled as compile-time source rejection.
6. Exact source head/tree/fixture blob/compiler SHA, actual compiler output, independent stepful execution, target binary/module hash, and evidence of **no interpreter/JIT fallback**. Distinguish parse/typecheck, host-model, lowering/artifact checks, guest execution, AOT output and GC instrumentation. `steps=[]` or `steps=null` means runner-admission failure / **NOT_EXECUTED**, not a passing or failing guest test.

A feature PR MUST state its chosen execution profile, dynamic reachability strategy, ownership/drop obligations, whether reclamation is guest-only or process-wide, and the precise negative fixtures. Unsupported profile combinations must be diagnosed—not silently rewritten into host code or a different memory model.

## Scope

This is a **target specification**. Implementation and enforcement require separate reviewed compiler/runtime changes and executed conformance in each backend. The chapter does not authorize unsafe source export, weakening protected branches, bypassing independent review, or a Python toolchain; existing repository security and Rust-only tooling policies continue to apply.
