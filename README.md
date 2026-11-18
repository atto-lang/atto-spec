# atto-spec

Canonical AttoLang language specification, including syntax, semantics, types, ownership, and concurrency.

## Purpose

Define normative syntax and semantics; document actor isolation, effects, ownership, and portability requirements.

## Repository responsibilities

- Keep interfaces, schemas, and behavior documented in a backend-neutral form where applicable.
- Use test fixtures and reproducible evidence to distinguish proposed behavior from implemented behavior.
- Record breaking changes, migration notes, and dependencies on other AttoLang components.

## Language contracts

- [Trap-to-Result v1](language/trap-result-v1.md): caller-side `trap` preserves returned `Result`/`Option` layers and catches ordinary `throw` as `Err(original Error)`; unverified backends must fail closed rather than emit legacy Option results.

- [File/module `define const` v1](language/file-module-const-v1.md): unconditional static immutable bindings using `=` or `as`; constexpr folds at compile time, direct `os.read_env("KEY")` is evaluated exactly once at runtime initialization. **Proposal; backend guest execution not yet verified.**

- [Structural sequence matching v1](language/sequence-pattern-matching-v1.md): target semantics for `List.of(..._, ..., _...)`, typed `is` patterns, and explicit `as val` bindings. Its checked-in tests are **host-only**; guest compilation and cross-backend parity are **not verified**.
- [Suspension effect alias v1](language/susp-effect-shorthand-v1.md): `susp` is canonical for `suspends`; both have identical suspension effects, including on lambda and callable type syntax. Runtime and multi-backend parity require separate evidence.
- [Shared ownership and explicit guards v1](language/shared-ownership-and-guards-v1.md): TARGET semantics for `share!`/`rt share` (frozen sharing) and separately synchronized `RwLock<T>` mutation; **not compiler certified**.

- [Implicit argument borrowing v1](language/implicit-argument-borrow-v1.md): target non-owning default for nonprimitive call arguments, checked mutable loans, explicit ambiguous cases and breaking ownership migration (not yet compiler-certified).

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
