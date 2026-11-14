# atto-spec

Canonical AttoLang language specification, including syntax, semantics, types, ownership, and concurrency.

## Purpose

Define normative syntax and semantics; document actor isolation, effects, ownership, and portability requirements.

## Repository responsibilities

- Keep interfaces, schemas, and behavior documented in a backend-neutral form where applicable.
- Use test fixtures and reproducible evidence to distinguish proposed behavior from implemented behavior.
- Record breaking changes, migration notes, and dependencies on other AttoLang components.

## Validation

Validation should rely on checked-in tests and exact-commit CI results. When reporting parity, distinguish **passed**, **failed**, **unsupported**, and **not executed**. Avoid inferring guest-runtime support from host-only tests.

## Status and development

This README records the intended role of this repository; it is not a claim of feature completeness. Consult the source tree and workflow files for actual implementation and verified build commands. Contributions should preserve compatibility with the canonical language contract.

## Ecosystem

- [AttoLang](https://github.com/atto-lang)
- [Language specification](https://github.com/atto-lang/atto-spec)
- [Cross-platform conformance](https://github.com/atto-lang/atto-platform-conformance)


## Repository capability inventory v1 (advisory)

This repository defines [the repository-capabilities contract](contracts/repository-capabilities-v1.schema.json) so ecosystem discovery tools can distinguish implemented code from README-only scaffolds without fabricating build or guest-execution claims.

Each participating repository can publish a root-level `atto-capabilities.json` containing its exact `atto-lang/<name>` identity, role, `scaffold` or `implementation` source state, per-feature status and any evidence metadata. A **scaffold must report every feature as `not_executed` with no evidence**. All manifests are `NOT_CERTIFIED`; even a syntactically accepted evidence record is not independently verified.

The offline validator and test suite require only Node.js:

```sh
node scripts/validate-capabilities.mjs atto-capabilities.json --repo atto-lang/atto-spec
node --test tests/repository-capabilities.test.mjs
```

Actual compiler, actor isolation, AOT and multi-backend parity claims require separate exact-commit executed guest receipts and independent review; this inventory never replaces those gates.
