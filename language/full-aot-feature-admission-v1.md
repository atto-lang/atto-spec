# Full-AOT feature admission and survey inventory v1

Status: **non-normative audit proposal / NO BACKEND CERTIFIED** (2026-11-16).

AttoLang's feature survey is a set of candidate language and runtime capabilities, **not** a claim that every feature below exists today. The [machine-readable candidate inventory](../conformance/full-aot-feature-inventory-v1.tsv) covers 61 design topics. The referenced public ChatGPT share could not be read programmatically during this audit; therefore this inventory is not represented as a complete extraction of that conversation. Reconcile it with the original text before treating it as an exhaustive checklist. It deliberately tracks existing AttoLang directions without prematurely freezing new syntax.

## Non-negotiable invariant

A program admitted for a **full-AOT target** must compile, link and execute with **no AttoLang source interpreter, runtime code generation, runtime source evaluation, JIT dependency or fallback to an uncompiled feature**. Every reachable semantic operation must be either statically lowered to the target or rejected during compilation with a deterministic diagnostic **before emitting any runnable artifact**. An optimization profiler, tracing hint or optional secondary JIT must never be necessary for correctness.

"Full AOT" is **target-specific**, not synonymous with zero GC:
- **LLVM / Forge / .NET Native AOT:** emitted native executables or libraries with no target runtime JIT; .NET may retain a managed memory collector unless separately constrained.
- **Java:** GraalVM **Native Image** is the full-native-AOT profile; ordinary JVM bytecode execution is a distinct non-native-AOT profile. An Epsilon collector avoids collections but does not prove bounded memory or reclamation.
- **Rust-to-Wasm:** source-to-Wasm code generation is ahead of time, but browsers may internally JIT Wasm machine code. Native precompiled Wasm engines require a separate precompiled-AOT profile and evidence; do not falsely advertise browser engine internals as "no JIT".
- **JavaScript output:** statically emitting JavaScript does not establish no-JIT native execution when run inside a JIT engine. This is an explicit separate deployment profile, not proof of native AOT.
- **Optional LLVM tracing, speculative AoS/SoA selection and profile-guided specialization:** may optimize an AOT binary, but the complete semantic baseline must remain available with tracing disabled.

## Feature-admission policies

- `static`: monomorphization, closed-world type witnesses, direct calls, tagged ADTs, static FFI, static type tables, or compiled decision trees. Reachable unknown types or effects fail closed.
- `compile_time`: macros, type inference, annotations, constexpr and optional optimization hints must finish during compilation and leave no evaluator/interpreter in the guest.
- `bounded_runtime`: actors, tasks, streams, bounded dynamic values, capability tables and precompiled module loading are allowed **only** when their machine code, value layouts, call sites/ABI contracts and permissible operations were compiled ahead of time. Runtime state transitions are not runtime compilation.
- `reject`: unrestricted source evaluation, unrestricted code loading and unbounded reflection are **not** added to the full-AOT language profile. They may require an explicit alternative non-AOT target, never silent fallback.

A precompiled hot-loaded module may have a runtime-selected *precompiled* target only after verifying its compiler-built symbol/ABI version, signature, ownership/effects contract, and unload safety. No new source compilation occurs inside the guest.

## Non-implicit language decisions

The inventory does **not** introduce syntax or override existing decisions: `#symbol` identity, `?` for `Option<T>` versus omittable formal parameters, `copy!`/`take!`/`share!`, snake_case callables, actor `receives` contracts, sealed actor state and `critical-read`/`critical-write`, channel suspension effect rules, and explicit error propagation remain governed by their own specifications. Do not adopt `←` or `<-` assignment merely because another language supports it. No implicit numeric conversion or operator overloading may be inferred from a survey.

## Mandatory promotion steps (per feature, per backend)

1. **Design:** link the canonical syntax, typing/effects and ownership rules; settle lexing/grammar ambiguities. Document compile-time constants and required diagnostics.
2. **Frontend:** prove typed parsing and rejection of malformed/unsupported source. Unrecognized constructs must not become permissive placeholders.
3. **AOT lowering:** show generated target IR, static metadata, symbol/ABI resolution and deterministic artifacts; no interpreter, speculative JIT fallback or hidden runtime compiler. If the backend cannot lower it, compilation returns a stable error with **no output artifact**.
4. **Execution:** compile and run a real guest (and an adversarial negative guest), including checked output/exit/side effects. Attach exact source head, Git tree, fixture blob, toolchain, artifact SHA256, executed steps and runtime/JIT/GC mode. A zero-step workflow is **not executed**.
5. **Parity:** compare observable results, failure effects, resource cleanup, messages and suspension semantics against a second independently compiled backend; memory/GC requirements remain a separate acceptance gate.
6. **Review:** independently verify the evidence and update a separate certified receipt. The inventory itself always remains a **plan**, not an attestation.

The initial registry marks **every backend/feature cell `not_executed`**. This is an evidence statement, not an assertion that every compiler lacks the feature: implementation PRs, parser previews, native guest smokes and existing tests must be audited at exact SHAs to promote individual cells.

## Scope and boundaries

- Target profiles in this first registry: Rust/Wasm compiler, Java Native Image, LLVM native, .NET Native AOT, Forge native, and precompiled native Wasm. Additional backends such as Cranelift/JS/HDL require distinct capability and evidence profiles instead of being conflated with native AOT.
- The Rust host-only verifier in `tests/full_aot_feature_inventory.rs` protects the **registry's provenance boundary**: it rejects malformed rows, invalid AOT strategies, implicit pass claims, duplicate entries and missing mandatory features. It does **not** run an AttoLang compiler and does **not** prove feature support.
- Existing integration work remains in `atto-source.*`, `atto-common-source` and `atto-platform-conformance`. This file should not supersede active implementation PRs or invent new guest capabilities.

Related work: `language/compile-time-constants-v1.md`, `language/sequence-pattern-matching-v1.md` and `atto-platform-conformance/contracts/aot-gc-tenant-evidence-v1.json`.
