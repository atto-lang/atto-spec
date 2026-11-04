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
| NOT_VERIFIED (backend list) | Explicit statement that no authenticated guest execution exists for the named backends; never weaker than the absence of IMPLEMENTED |

All chapters in v0.1 remain DRAFT; no chapter grants an unconditional IMPLEMENTED or VERIFIED PARITY claim. A feature matrix belongs in [conformance](11-conformance.md), not in marketing prose.

## Normative keywords and precedence

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY and OPTIONAL are interpreted as described in BCP 14 ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119), [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)) when they appear in capitals. Draft v0.1 prose also uses lowercase "must"/"must not" for requirements; until the editorial pass tracked as S-41 capitalizes them, a lowercase "must" in a rule sentence is a requirement, not a suggestion. All keywords bind the **draft target**, not current backend parity.

When sources inside this specification disagree:

1. Normative prose governs code examples. An example that contradicts a rule is an editorial defect; implementations follow the rule and the example is corrected by amendment.
2. A more specific chapter governs a general summary of the same feature (for example, [chapter 14](14-actor-pipeline-factories.md) governs the pipeline summary in chapter 03).
3. Two normative rules of equal specificity that conflict are a defect. The conflict MUST be recorded in [open questions](12-open-questions.md), and implementations MUST reject the affected construct until it is resolved rather than pick one reading.

## Source compatibility

New AttoLang source is `.atto`. `.ores` is legacy-compatible until explicit versioned removal. The preferred `atto` CLI and existing `oreslang` CLI are migration concerns; renaming source extensions or display names **MUST NOT** change wire formats, ABIs, persistent storage keys, package coordinates, or permissions. A backend can advertise `.atto` support only after real compile-and-run tests, not a README rename.

Reserved implementation names (OresVM, OresForge and similar engines) remain distinct technical identifiers. Function and method names use `snake_case`. Compound keywords with an ASCII hyphen (e.g. `critical-read` and `nb-select`) must be enumerated by grammar, not used to allow hyphens in arbitrary identifiers.

## Semantic strength

A **language guarantee** must be implementable without assumptions about the host scheduler or garbage collector. A **profile guarantee** (hard real-time, isolated guest, full AOT, no tracing GC) is conditional on a validated target/profile. Optimization goals are not universal semantics. Fatal host faults and OS termination may bypass guest cleanup.

## Specification process

A decision requires: canonical source example; static semantics; failure conditions; transport and ownership consequences; runtime effect; supported targets; negative tests; executable cross-backend evidence. Record contradictions in [open questions](12-open-questions.md), rather than selecting a silently incompatible interpretation.
