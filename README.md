# atto-spec

Canonical AttoLang language specification, including syntax, semantics, types, ownership, and concurrency.

## Canonical naming and documentation migration

[AttoLang](https://github.com/atto-lang) is the sole canonical project name; configure repository remotes as `https://github.com/atto-lang/atto-spec.git` and refer to `.atto` in new examples. [atto-spec](https://github.com/atto-lang/atto-spec) owns normative grammar, ownership, lifetime, effects and actor contracts; [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance) tracks executed verification. Distinguish design proposals from tested compiler support and do not advertise zero-step CI as guest conformance.

## Purpose

Define normative syntax and semantics; document actor isolation, effects, ownership, and portability requirements.

## Repository responsibilities

- Keep interfaces, schemas, and behavior documented in a backend-neutral form where applicable.
- Use test fixtures and reproducible evidence to distinguish proposed behavior from implemented behavior.
- Record breaking changes, migration notes, and dependencies on other AttoLang components.

## Language contracts

- [Bitwise operators and directional streams v1](language/bitwise-and-stream-operators-v1.md): int-only `& | ^ ~`, `<<< >>> ashr`, compound updates, and typed-I/O `<< >>`, with context-sensitive caret/structural-tilde parsing; target semantics, not backend parity.

- [Trap-to-Result v1](language/trap-result-v1.md): caller-side `trap` preserves returned `Result`/`Option` layers and catches ordinary `throw` as `Err(original Error)`; unverified backends must fail closed rather than emit legacy Option results.

- [File/module `define const` v1](language/file-module-const-v1.md): unconditional static immutable bindings using `=` or `as`; constexpr folds at compile time, direct `os.read_env("KEY")` is evaluated exactly once at runtime initialization. **Proposal; backend guest execution not yet verified.**

- [Structural sequence matching v1](language/sequence-pattern-matching-v1.md): target semantics for `List.of(..._, ..., _...)`, typed `is` patterns, and explicit `as val` bindings. Its checked-in tests are **host-only**; guest compilation and cross-backend parity are **not verified**.
- [Suspension effect alias v1](language/susp-effect-shorthand-v1.md): `susp` is canonical for `suspends`; both have identical suspension effects, including on lambda and callable type syntax. Runtime and multi-backend parity require separate evidence.
- [Shared ownership and explicit guards v1](language/shared-ownership-and-guards-v1.md): TARGET semantics for `share!`/`rt share` (frozen sharing) and separately synchronized `RwLock<T>` mutation; **not compiler certified**.

- [Class field binding defaults v2 proposal](language/class-field-binding-defaults-v2.md): reconcile visibility v1's immutable-by-default choice; unqualified class fields are proposed to mean `val`. Breaking migration and executed guest checks required before adoption.
- [Class field binding defaults v1 (historical)](language/class-field-binding-defaults-v1.md): accepted earlier `let` default. Retained for compatibility and explicit supersession tracking; conflicts with proposed v2.

- [Implicit argument borrowing v1](language/implicit-argument-borrow-v1.md): target non-owning default for nonprimitive call arguments, checked mutable loans, explicit ambiguous cases and breaking ownership migration (not yet compiler-certified).

- [Struct field equals initializer v1](language/struct-field-equals-v1.md): restricted `StructName(field=value)` with checked name resolution, ordinary-call rejection, and source-order safety (TARGET / NOT EXECUTED).

- [Class-field visibility v1](language/class-field-visibility-v1.md): canonical `pub[pkg]`, explicit and implicit `private`, and immutable-by-default class fields; cross-package linker tests and multi-backend guest validation remain pending.

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

This repository is the normative AttoLang (`.atto`) specification; migration-era syntax is not automatically part of current supported semantics.

Changes asserting compiler/runtime support must identify the exact source head, target, toolchain, executed positive and negative guest tests, and failure/unsupported status; an empty CI step list is **not executed**. Documentation records responsibility, **not** a claim of feature completion.
