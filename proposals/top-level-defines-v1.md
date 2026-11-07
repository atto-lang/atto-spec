# Proposal: top-level `define` declarations · v1

**Status:** PROPOSED · 2026-11-07 · Requires language-level review. This file is not a claim of five-backend execution parity.

## Goal and canonical syntax

AttoLang must accept these top-level forms: `define class`, `define actor`, `define enum`, `define struct`, `define interface`, `define trait`, and `define fnc`. Public visibility may be written `define pub` or `pub define`; formatters should prefer `define pub`. Traditional top-level `fnc` remains valid. Instance method names are snake_case.

The declaration introducer is **only** valid at top level (or within a module scope once module semantics are specified). The declaration kind, name and members belong to the typed compiler AST and must not be stripped by a JavaScript source preprocessor.

The current Rust browser subset accepts `as ... end` and `{ ... }` for the six type declarations. For `define enum`, variants may be ordinary names (`Ready`) or symbols (`#ready`, `#done`); a `#`-prefixed keyword spelling is distinct from an ordinary identifier. Duplicate declarations, fields and enum variants are errors; a failed compile must not expose a guest artifact.

### Examples

```atto
define class Counter as
  final int count: 0
end

define actor Worker as
  final int id: 9
end

define enum Status as
  #ready,
  #done
end

define pub fnc main() -> int {
  return 42;
}
```

## Do not confuse stages

| Concern | Browser Rust stage-1 implementation | Full language target |
| --- | --- | --- |
| Names and declaration tree | Parsed and checked | Required on all supported backends |
| Fields | `int`/`bool` scalars with literal initializer only | Typed fields and ownership/borrow checking |
| Enum cases | Tagged metadata in Wasm custom section | Values, identity, exhaustive matching and methods |
| Class methods/constructors | **UNSUPPORTED** | Executable, allocation-safe methods and constructors |
| Actor methods / spawning | **UNSUPPORTED** | Worker-backed actor execution, typed mailbox and supervision |
| Actor state | No runtime access | Sealed state; critical-read/critical-write gates |
| Tenant security | **NOT_CERTIFIED** | Backend-appropriate enforced security isolation |

The stage-1 guest ABI is `atto.browser.guest.v1`: a pure `main() -> i64` entry plus restricted stdout imports. The stage-1 browser compiler emits actual typed declaration metadata in a versioned `atto.declarations.v1` **Wasm custom section**. Source containing only declarations produces an inert `main() -> 0`. This is metadata preservation, **not execution** of any class or actor. `new`, `spawn` and unsupported methods must fail closed.

Browser Web Workers in a subsequent stage are execution domains, **not OS-level tenant security boundaries**. An actor must not intercept its own panic; supervisor/control notifications and ownership rules require separate executable conformance tests.

## Semantics that remain mandatory

The canonical language has removed arithmetic operators `%`, `^`, `^^`. The compiler rejects them with a positioned diagnostic and no guest. In conditions, `,` and `|` evaluate **both** operands eagerly, in source order. Declaration support cannot undo this decision. Tests of generated Wasm, not just parser or host code, are required before release.

## Evidence and gaps (exact heads)

- Rust parser/compiler stage-1 plus semantics: [compiler PR #8](https://github.com/atto-lang/atto-source.rs/pull/8), head `c40d7d1fb65e492e1e0083ec21e3de048bd4a93a`, tree `2ece9a9331c5a0e24fe586ebe414e121f05a2e5c`; native, emitted guest-Wasm, browser execution [CI 42403116646](https://github.com/atto-lang/atto-source.rs/actions/runs/42403116646) **PASSED**. Source branches remain unmerged; #8 depends on semantics PR #4 and compiler foundation PR #3.
- Private browser playground candidate [PR #19](https://github.com/atto-lang/atto-playground/pull/19) head `9487cf2cac3530d56a978432f7d3dbee28899d0f`; exact-head push [42403300325](https://github.com/atto-lang/atto-playground/actions/runs/42403300325) and PR [42403305611](https://github.com/atto-lang/atto-playground/actions/runs/42403305611) **PASSED**.
- **NOT_RELEASED**: GitHub Pages branch-publication bypass [P0 #5](https://github.com/atto-lang/atto-lang.github.io/issues/5) must be closed, independent approval obtained and a live HTTPS audit passed before copying the new private compiler to a public repository.
- Java reference grammar `oreslang-source.java/docs/grammar.ebnf` currently has class/actor but no `enum_decl`; Java/LLVM/Forge/.NET and general Wasm guest **enum runtime parity NOT_EXECUTED** in this proposal. The grammar and runtime implementations require separate reviewed PRs.

`contracts/top-level-defines/v1/cases.json` lists **proposed** source cases. Its static JSON tests validate contract shape only; they do not execute Atto guest source. The Rust and Chromium runs above validate the corresponding stage-1 behavior separately. No host-only result should be labeled guest execution.

## Promotion gate

After independent review: land compiler PR #3, then semantics PR #4, then declarations PR #8; rebuild exact SHA-pinned compiler; approve the binary for public disclosure independently; configure GitHub Pages **workflow-only** publishing and environment protection; test allowlisted asset manifest and live browser execution. Only then mark the browser feature released. Class/actor execution needs separate guest tests.
