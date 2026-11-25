# 00 — Scope, Normative Vocabulary and Maturity

**Status: DRAFT v0.1.**

## Goals

AttoLang defines one observable language across Java/GraalVM, LLVM, Wasm, Forge and .NET Native AOT. Its design priorities are actor ownership, safe concurrency, predictable failure, low-allocation data-oriented programming, and reproducible compilation. Backend-specific acceleration is permitted only when it preserves language semantics or is explicitly gated by a target capability.

An implementation **MUST NOT** silently reinterpret unsupported syntax as a different language feature. Diagnostic rejection is preferable to unsafe partial lowering.

## Vocabulary

- **Actor:** nominally declared special class with identity, bounded inbox, lifecycle and supervisor.
- **Actor turn:** one admitted guest execution segment processing a message, lifecycle hook or continuation.
- **Task:** scheduler-owned lightweight computation without its own implicit actor inbox or actor-state authority.
- **Isolate:** a runtime/security boundary; its strength depends on the backend and deployment. An actor is not automatically an OS process or sandbox.
- **Persistent actor arena:** memory owned over multiple turns; **scratch arena:** memory reclaimable at a proven scope boundary.
- **Owned/borrowed/shared:** statically governed value rights, distinct from physical host object layout.
- **CONTROL lane:** privileged supervisor/lifecycle notification path separate from ordinary user DATA.
- **Full AOT:** application guest code is compiled before launch, without a runtime guest source interpreter/JIT fallback.
- **Conformance receipt:** exact source/compiler commit, actually executed fixture, environment, result and artifact provenance.

## Status categories

| Label | Meaning |
| --- | --- |
| DRAFT | This document can change through review |
| TARGET | Proposed normative semantics, may not be implemented |
| PROPOSED | Unsettled design/API; do not count as language support |
| IMPLEMENTED (backend + SHA) | Supported by compiler and actual guest tests at the stated revision |
| VERIFIED PARITY | Same source and results executed on every required backend with independently checked evidence |

All chapters in v0.1 remain DRAFT; no chapter grants an unconditional IMPLEMENTED or VERIFIED PARITY claim. A feature matrix belongs in [conformance](11-conformance.md), not in marketing prose.

## Source compatibility

New AttoLang source is `.atto`. `.ores` is legacy-compatible until explicit versioned removal. The preferred `atto` CLI and existing `oreslang` CLI are migration concerns; renaming source extensions or display names **MUST NOT** change wire formats, ABIs, persistent storage keys, package coordinates, or permissions. A backend can advertise `.atto` support only after real compile-and-run tests, not a README rename.

Reserved implementation names (OresVM, OresForge and similar engines) remain distinct technical identifiers. Function and method names use `snake_case`. Compound keywords with an ASCII hyphen (e.g. `critical-read` and `nb-select`) must be enumerated by grammar, not used to allow hyphens in arbitrary identifiers.

## Semantic strength

A **language guarantee** must be implementable without assumptions about the host scheduler or garbage collector. A **profile guarantee** (hard real-time, isolated guest, full AOT, no tracing GC) is conditional on a validated target/profile. Optimization goals are not universal semantics. Fatal host faults and OS termination may bypass guest cleanup.

## Temporary behavioral reference

Use atto-source.java as the temporary reference implementation for unsettled semantic disagreements, with exact revision and profile identified. Explicit language-owner decisions and verified full guest AOT and zero guest tracing-GC requirements constrain that reference: incidental Java host behavior, interpreter fallback, managed allocation, and legacy syntax are not portable normative requirements. Record divergences rather than silently importing them. See [reference baseline](../language/java-reference-baseline-v1.md).

## Specification process

A decision requires: canonical source example; static semantics; failure conditions; transport and ownership consequences; runtime effect; supported targets; negative tests; executable cross-backend evidence. Record contradictions in [open questions](12-open-questions.md), rather than selecting a silently incompatible interpretation.
