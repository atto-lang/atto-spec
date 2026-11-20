> **AI agent instructions (organization-wide):** Before working on code, issues, or pull requests, read and follow the [organization `AGENTS.md`](https://github.com/ores-truffle-oreslang/.github/blob/main/AGENTS.md), including its **merge-first stealth-development policy**. Honor any repository-local `AGENTS.md`, explicit holds, and GitHub-enforced rules.

# AttoLang (Oreslang) Language Specification

## Oreslang to AttoLang migration (2026-11-18)

**AttoLang** (formerly **Oreslang**) is the current public language identity. This `ores-truffle-oreslang/oreslang-language-specs.md` checkout retains old naming. Its AttoLang counterpart for new contributions is [atto-lang/atto-spec](https://github.com/atto-lang/atto-spec); this link **does not imply an in-place transfer, identical history, migrated issues/PRs or feature parity**. **This legacy specification is historical**; propose and review all normative syntax and semantics in atto-spec.

**[atto-lang/atto-spec](https://github.com/atto-lang/atto-spec)** is the canonical language specification. The portable library source belongs in [atto-common-source](https://github.com/atto-lang/atto-common-source), shared positive/negative guest tests in [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance), and compiler-specific implementations in `atto-source.*`. The language's current proposed direction includes canonical `.atto`, `snake_case`, `borrow!`/`take!`/`share!`/`copy!`/`copy!!`, [implicit borrow defaults](https://github.com/atto-lang/atto-spec/blob/main/language/implicit-argument-borrow-v1.md), [`define const` including permitted `os.read_env`](https://github.com/atto-lang/atto-spec/blob/main/language/file-module-const-v1.md), and [`<<<`/`>>>`/`ashr` shifts vs. `<<`/`>>` streams](https://github.com/atto-lang/atto-spec/blob/main/language/bitwise-and-stream-operators-v1.md). Check individual spec admission status; **a design target is not proof of execution**.

Keep legacy `.ores` fixtures, CLI/package/ABI names, and version-pinned commands where they document code still in this tree. Avoid Python in new AttoLang tooling/tests/CI; Rust support tools are preferred. Only claim cross-backend support with exact SHA/tree, target/toolchain, real executed positive and negative guest tests; report failed, unsupported and not-executed explicitly. Empty-step/host-only CI is not guest conformance.

**Status:** Editor's Draft (updated 2026-11-04)  
**Scope:** Language semantics and cross-toolchain portability.  
**Implementation status:** This repository defines contracts to be implemented and tested; publication here is **not** proof that any backend implements them.

AttoLang (formerly Oreslang) is an actor-first systems language intended to combine checked ownership and borrowing, explicit failure propagation, typed functional composition, and portable concurrency with native and managed execution.

## Specification documents

1. [Core language](spec/language.md) — syntax, declarations, types, ownership, actors and ActorGroups, errors, matching, modules, and effects.
2. [Compiler and runtime contract](spec/compiler-runtime-contract.md) — HIR/MIR, LLVM and Truffle/GraalVM, lowering rules, runtime ABI, memory models, hot loading, and portable backends.
3. [Conformance and parity](spec/conformance.md) — shared fixtures, negative tests, optimization-equivalence checks, execution evidence, and CI gates.
4. [State containers and virtual actors](spec/state-containers-and-virtual-actors.md) — proposed contextual declaration grammar, protected mutable state, stable logical actor identity, activation, ownership, and backend admission gates.

5. [AttoLang Live Runtime DevTools / MCP v1](spec/atto-live-runtime-devtools-mcp-v1.md) — proposed opt-in, read-only runtime inspection, authorization boundaries, and future transactional hot-upgrade gates. No backend implementation claims.
6. [Specification-to-corpus traceability](spec/parity-traceability.md) — stable fixture IDs, independent backend identities, canonical `.atto` sources, and non-evidentiary mapping to the parity corpus.

## Interpretation

- **Established design decision**: previously chosen Oreslang surface or semantic direction; remains subject to implementation and conformance.
- **Proposed normative contract**: precise rule proposed for ratification; **MUST / MUST NOT / SHOULD** are binding only once accepted.
- **Open question**: intentionally unresolved; no implementation should silently fill the gap with backend-specific behavior.
- **Illustrative syntax**: examples demonstrate intent but do not certify parser support.

This is a versioned **draft**, not a claim of six-backend feature parity. Backend status must be recorded only with attributable compiler/runtime evidence.

## Portability doctrine

**One language semantics, one versioned semantic IR contract, independent execution engines, shared behavioral conformance.**

LLVM IR is not the Oreslang specification. The Java implementation of Truffle nodes is not the Oreslang specification. Each implementation must preserve the same observable language behavior, while retaining freedom to optimize storage, scheduling, JIT/AOT compilation, and memory management.

Targeted implementations:

- Java/GraalVM (Truffle)
- LLVM native
- WebAssembly
- Forge (independent engine)
- Cranelift (independent compiler)
- .NET Native AOT

Names of the backends denote targets, not a claim that each target currently passes the contract.

## Contribution and evolution

Proposals must identify affected syntax, type/effect rules, error behavior, actor lifecycle, memory safety, and backend portability; add shared positive and negative examples; and state compatibility impact. A grammar change without a cross-backend diagnostic and behavior plan is incomplete.

Normative changes should be accompanied by a conformance fixture ID. Do not mark a behavior as verified based on source inspection alone, a pending test, or a workflow that did not execute any steps.
