# atto-spec

Canonical AttoLang language specification, including syntax, semantics, types, ownership, and concurrency.

## Purpose

Define normative syntax and semantics; document actor isolation, effects, ownership, and portability requirements.

## Repository responsibilities

- Keep interfaces, schemas, and behavior documented in a backend-neutral form where applicable.
- Use test fixtures and reproducible evidence to distinguish proposed behavior from implemented behavior.
- Record breaking changes, migration notes, and dependencies on other AttoLang components.

## Language contracts

- [Structural tilde shorthand v1](language/structural-tilde-v1.md): candidate `~` synonym for `structural`, typed pattern matching and named/positional delimiter safety (**not guest-verified**).
- [Statement match arm delimiters v1](language/match-arm-delimiters-v1.md): per-arm `end` or braces, plus the outer match `end`; source-only structural cases remain unexecuted.
- [Structural sequence matching v1](language/sequence-pattern-matching-v1.md): target semantics for `List.of(..._, ..., _...)`, typed `is` patterns, and explicit `as val` bindings. Its checked-in tests are **host-only**; guest compilation and cross-backend parity are **not verified**.

## Validation

Validation should rely on checked-in tests and exact-commit CI results. When reporting parity, distinguish **passed**, **failed**, **unsupported**, and **not executed**. Avoid inferring guest-runtime support from host-only tests.

## Status and development

This README records the intended role of this repository; it is not a claim of feature completeness. Consult the source tree and workflow files for actual implementation and verified build commands. Contributions should preserve compatibility with the canonical language contract.

## Ecosystem

- [AttoLang](https://github.com/atto-lang)
- [Language specification](https://github.com/atto-lang/atto-spec)
- [Cross-platform conformance](https://github.com/atto-lang/atto-platform-conformance)

## Repository ownership and contribution routing

**Belongs in this repository:** Normative AttoLang grammar, types, effects, ownership/borrowing, actors, concurrency, diagnostics and versioned language-change proposals.

**Belongs elsewhere:** Backend-specific implementations or host shims; implement in `atto-source.*`, share cross-backend fixtures with `atto-platform-conformance`.

**Safety and verification boundary:** Require explicit migration and negative cases for no implicit conversions, no operator overloading, forbidden percent/power operators, no auto-flattening of nested Option/Future, and critical/suspends admission.

Keep canonical AttoLang (.atto) semantics consistent with the language specification, while treating Oreslang-named tooling and .ores as compatibility surfaces.

Changes asserting compiler/runtime support must identify the exact source head, target, toolchain, executed positive and negative guest tests, and failure/unsupported status; an empty CI step list is **not executed**. Documentation records responsibility, **not** a claim of feature completion.

- [Anonymous structural shape types, singleton and union field values (proposed)](language/anonymous-structural-shapes-v1.md)

- [Anonymous structural shapes: source-only 49-case registry](conformance/anonymous-structural-shapes-v1.json) — proposed, not compiler-executed.
