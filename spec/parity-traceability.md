# Specification-to-corpus traceability — draft contract

**Edition:** 0.1 | **Updated:** 2026-11-04 | **State:** Draft governance contract; no backend execution claim.

This page defines how [AttoLang's language specification](language.md), [compiler/runtime portability contract](compiler-runtime-contract.md), [conformance catalogue](conformance.md) and the separate [compiler parity corpus](https://github.com/ores-truffle-oreslang/oreslang-compilers-parity-testing) are kept aligned. The specifications remain the semantics authority; a test harness is never allowed to silently define a new language rule.

## Independent target identities

The **six required** targets are `java`, `llvm`, `wasm`, `dotnet`, `forge`, and `cranelift`. A report may choose a display order, but each ID is distinct. The `oreslang-source.net` implementation maps to the parity ID `dotnet`; `forge` and `cranelift` are not interchangeable. The `js` transpiler is an optional seventh target. Missing coverage on a required target is a gap, never a denominator reduction or an implicit skip/pass.

## Fixture and source identity

- **Stable spec ID:** IDs such as `parse.match_forms` and `actor.sealed_state_access` describe proposed acceptance rules, not necessarily checked-in runnable programs.
- **Corpus ID:** Legacy numeric program IDs and named multi-file checks identify actual files in the parity repository. A mapping from a spec ID to a corpus ID is **traceability only**, not proof that the program exercises the full normative acceptance rule.
- **Canonical extension:** All newly authored AttoLang language sources, examples and fixtures use `.atto`. Already-published `.ores` fixtures remain available as an explicit legacy migration profile. They must not be silently renamed in an existing benchmark, receipt, hash or provenance chain.
- **Same-source constraint:** Within a fixture, every required backend receives identical source bytes and the same declared import graph. Backend-specific transpilation of a fixture's input is not an acceptable parity shortcut. A deliberate migration creates a new immutable fixture revision with a new byte hash and independently validates its oracle.
- **Cross-repository provenance:** A validated claim pins the spec edition and full specification commit SHA, parity corpus commit and fixture digest, compiler/runtime commit and tree SHA, profile/target, oracle revision, and executed jobs/artifacts. Branch names, timestamps, PR titles and metadata-only checks cannot stand in for immutable evidence.

## Alignment registry

The compiler parity repository owns `contracts/spec-alignment-v1.json`, a source-only index for navigation and prevention of accidental backend conflation. It MUST declare this edition, all six required target IDs, optional `js`, the canonical/legacy extensions, and only existing corpus references. Entries marked `related_feature_only` mean **a candidate connection for review**, not a complete spec assertion.

A static test of that registry may establish valid JSON, backend-set consistency and case-reference integrity. It does **not** establish successful parsing, compilation, diagnostics, native execution or semantic conformance. A new normative spec rule should be coupled to a separately reviewed positive/negative fixture and a contract-safe oracle, while unsupported targets remain openly visible.

## Evidence promotion and governance

Record `SPEC_PENDING`, `NOT_EXECUTED`, `BLOCKED`, `COMPILE_VERIFIED`, `RUNTIME_VERIFIED`, and `CONFORMANCE_VERIFIED` only for the gate actually satisfied (see [conformance](conformance.md)). `related_feature_only` and `source_only` registry entries cannot promote any of these statuses.

For language changes, land or review the specification rule first, then add versioned fixtures and interpreter/compiler/runtime evidence; merge the corpus update only when case IDs, source bytes, diagnostic taxonomy and intended effects agree. Concurrent PRs that change `manifest.json` or the Rust runner must be reconciled rather than force-overwritten. No CI status, private mirror or code-review approval is by itself cross-backend conformance.
