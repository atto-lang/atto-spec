# 12 — Open Questions and Compatibility Decisions

**Status: DRAFT; decisions here are not automatically accepted language rules.**

This ledger keeps conflicting historic contracts visible until backed by reviewed grammar, static semantics and actual cross-backend tests.

| ID | Question | Proposed resolution / next proof |
| --- | --- | --- |
| S-01 | Canonical source return/block spelling `-> T ::` vs legacy `: T { }` | Publish a versioned formatter/grammar corpus for all five backends; preserve compatible legacy programs |
| S-02 | Implicit immutable class fields versus older explicit `val` binding grammar | Specify class-field grammar separately from local declaration grammar; compile mutation negatives |
| S-03 | Match exclusivity/exhaustiveness versus ordered first-match arms | Define semantics of `match`, `match first`, `switch`, `over` and typed arm return; prove duplicate/overlap diagnostics |
| S-04 | Whether `trap expr` returns `Option<T>` or `Result<T,E>` | Existing source contract is Option; requested actor-send trap Result must be a distinct typed API or an explicitly versioned change |
| S-05 | `throw` without a catch: raise, supervisor notification or an ordinary terminal throw? | Define exact effect escalation and non-actor root exit; execute unwind/supervision fixtures |
| S-06 | Actor `state {}`, `handle_state(critical-read/write ...)` and `using state...` equivalent spellings | Choose one canonical syntax and compiler-owned intrinsic; forbid direct sealed-state access |
| S-07 | Actor send result/admission type, `ready`, `done`/`get_done()` and output streams | Lock typed API and admission linearization before declaring transport parity |
| S-08 | Per-actor multi-turn READ and MaxActorThreads MEDIUM/HIGH | Default one turn; support parallel reads only after source/continuation proof and runtime lease tests |
| S-09 | Exact initial runtime thread count on JVM/LLVM/.NET | Distinguish explicit bootstrap workers from host-created threads; measure each runtime and define profile-based budgets |
| S-10 | Canonical project root/manifest (`.ores.pkg.toml`) and `ORES_PATHS` migration | Reconcile with `.oreslangc.cfg.toml` / `ORESLANG_PATH`; symlink and dual-extension fail-closed suite |
| S-11 | `define macro` expansion, hygiene, compile-time API, import and capabilities | Static expansion IR with exact source maps; no runtime host reflection dependency |
| S-12 | `#symbol` cross-isolate interning and match equality | Pin identity and serialization rules for std/core versus userland; exact wire tests |
| S-13 | Which borrowing operations may span `await` or `select`? | Define pinned-frame and alias proofs; reject ambiguous critical loans |
| S-14 | `.atto` support on all five backends and `.ores` deprecation horizon | Publish executable positive and negative migration fixtures per immutable head |
| S-15 | Full guest AOT and compiler-generated reflection metadata | Distinguish Native Image interpreter AOT from real guest AOT; verify no interpreter/JIT fallbacks |
| S-16 | GPU blocks, layouts, actor locality and hard-RT profiles | Qualify platform capabilities/latency; prohibit metadata-only claims |
| S-17 | Synchronous convenience API suffix rules vs async-only I/O | Canonical normal I/O is async; any `_blocking` helper suspends guest without parking carrier; certify kernel readiness |
| S-18 | Source permission flags and manifest schema parity | Version the flags-2-env mapping, manifest, enforcement and deny tests across all CLIs |
| S-19 | Hierarchical `define supervisor`: typed spawn intrinsics, async hooks, policy configuration and root failure disposition | Fix exact signatures, static strategy declaration, cancellation/await semantics and runtime-owned generation-fenced CONTROL; execute nested supervision source on all backends; see [chapter 13](13-supervisor-hierarchies.md) |

## Changes requiring special scrutiny

Any change that impacts message admission, transport encoding, exception precedence, actor-state authority, task cancellation, memory dropping, package boundary resolution or reflection must include a security review and a source-level conformance update. A document is not enough to attest protection against hostile guest programs.

## Suggested review order

First settle lexical syntax, bindings and core type checking; then ownership/actors and errors; then async/channel lifetimes and isolation; then backend ABI/full AOT; finally optional optimization profiles. Keep individual feature decisions small enough for reproducible fixtures and isolated pull requests.

## Existing cross-references

- [Java language design](https://github.com/ores-truffle-oreslang/oreslang-source.java/blob/main/docs/LANGUAGE.md)
- [Java sealed actor state contract](https://github.com/ores-truffle-oreslang/oreslang-source.java/blob/main/docs/ACTOR_FAMILIES_SEALED_STATE_V1.md)
- [LLVM exception semantics](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/blob/main/docs/EXCEPTION_SUPERVISION_SEMANTICS.md)
- [LLVM Atto module import migration](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/blob/main/docs/ATTO_MODULE_IMPORT_MIGRATION.md)
- [Conformance Task blocks](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/blob/main/docs/TASK_BLOCKS_V0.md)
