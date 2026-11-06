# 12 — Open Questions and Compatibility Decisions

**Status: DRAFT; decisions here are not automatically accepted language rules.**

This ledger keeps conflicting historic contracts visible until backed by reviewed grammar, static semantics and actual cross-backend tests.

| ID | Question | Proposed resolution / next proof |
| --- | --- | --- |
| S-01 | Function forms | **Decided 2026-11-03:** `: T` and `-> T` are both valid, and `::` is optional. `::` is optional before both brace and `end` bodies. Open: confirm the [proposed parsing and formatter rules](16-lexical-and-grammar-reference.md#function-forms), then publish a versioned grammar corpus for all five backends |
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
| S-20 | `Actor.pipe(...)` versus `Actor.connect(...)`: constructor descriptor grammar, graph admission `Result`, typed endpoint handles and connection capabilities | Proposed initial API uses contextual unspawned actor constructors for `pipe` and live `ActorRef` operands for `connect`; reconcile syntax/variadics and test atomic publication on five backends; see [chapter 14](14-actor-pipeline-factories.md) |
| S-21 | Recursive `Actor.pipe` builder composition, deferred `.start()` ABI and explicit nested supervisor scopes | Draft reconciliation changes the initial immediate-return factory proposal to an unstarted, move-only descriptor; require review of compatibility, async start result, reverse DATA replies, bounded quotas and exact-head guest test parity; see [chapter 15](15-nested-actor-pipelines.md) |
| S-22 | Which Unicode letters identifiers may use | The Java lexer accepts any Unicode letter. Compare the LLVM parser, then pick one rule and test it on every backend |
| S-23 | `String` versus `string`, and template literal interpolation | Java accepts both type spellings. Choose one canonical spelling and specify templates; see [chapter 17](17-primitives-and-core-types.md) |
| S-24 | Integer overflow details | **Decided 2026-11-03:** overflow panics the actor, and wrapping needs explicitly named operations. Open: operation names, `bigint`, division by zero and the Java and LLVM changes; see [chapter 17](17-primitives-and-core-types.md) |
| S-25 | Whether `int / int` gives `float` or an integer | Java gives `float`, and LLVM rejects it. Decide, then add a shared test |
| S-26 | Mutable borrow spelling: `rt borrow mut`, `rt mut borrow` or `&mut` | Chapter 04, the Java diagnostic and the v0.6 grammar each differ. Pick one and update all three |
| S-27 | Stored state for heap-backed actors | Fixed-size state is simple to commit, while arena memory can be half-written at a crash. Choose persistent structures, a per-turn scratch arena or another design, and check it against the zero-GC goal; see [chapter 18](18-runtime-guarantees.md) |
| S-28 | What a reference from `spawn` means across a restart | **Decided 2026-11-05:** it addresses the actor instance and survives restarts, and it fails as `TERMINATED` once the instance has ended; see [chapter 18](18-runtime-guarantees.md) |
| S-41 | Lowercase "must" in v0.1 prose versus BCP 14 capitals | Editorial pass converting every lowercase requirement to MUST/SHOULD; until then lowercase "must" in rule sentences is normative ([chapter 00](00-scope-and-status.md)) |
| S-42 | Which line breaks end a statement | Examples omit every semicolon, while chapter 16 records that compilers need them except before `}`, `fi` and `end`. Pick one testable rule covering lines that start with `\|>`, `.`, `-`, `+`, `(` and `[`; publish a lexer/formatter corpus with negatives |
| S-43 | Reserved words as member names (`Actor.pipe` while chapter 01 calls `pipe` a keyword) | TARGET: permitted only directly after `.`; never as free identifiers or declaration names |
| S-44 | `if e as const name` uses `const` for a runtime binding, unlike statement `const` | Documented contextual meaning (immutable runtime binding); decide whether to respell as `as val` with a formatter migration |
| S-45 | Four meanings of `?` (optional type, omittable parameter, propagation, ternary) | TARGET disambiguation in chapter 01, parenthesized ternary inside argument lists; decide whether to keep the ternary |
| S-46 | Typed local annotation order: `let Task<int> work` (chapter 06) versus `val box: Box<...>` (chapter 02, and what compilers accept today) | Pick one canonical order for locals; parameters are type-first in every chapter |
| S-47 | Implicit constructors (`Point(...)`, `Increment(1)`) versus "constructors use an explicit `constructor(...)`" | Decide whether classes/records get a field-order constructor; until then reject calls that match no declared constructor |
| S-48 | Shadowing of `val`/`let`/`const` in inner scopes | Same-scope redeclaration is an error; decide inner-scope shadowing with move/borrow interaction tests |
| S-49 | Symbol literals containing spaces (`#with spaces` was lexically unterminated) | Unquoted symbols are identifier-shaped; settle the delimited form `#"with spaces"` (also recorded in chapter 16) and its interning identity |
| S-50 | Value-parameter default syntax and the `_` / `omit` call-site markers | No chapter defines them; specify grammar, evaluation timing (declaration versus call site) and effect rules for default expressions |
| S-51 | Failure disposition of detached `do nb { }` Tasks | TARGET in [chapter 06](06-async-and-scheduling.md): parent scope waits; unhandled failure becomes parent-scope failure; execute race fixtures |
| S-52 | `recover` for `raise`: syntax, scope, effect typing and interaction with `defer` | Undefined; compilers reject `recover` until a contract exists |
| S-53 | Unqualified import found in both a project root and an environmental root | TARGET in [chapter 09](09-modules-and-aot.md): ambiguous unless pinned by the manifest; same-tier collisions are already diagnosed |
| S-54 | Infix `spawn A() pipe spawn B()`: staged-descriptor versus immediate-spawn interpretation | UNRESOLVED. Preserve existing chapter 14–15 deferred `Actor.pipe(...).start()` semantics; reject ambiguous infix forms pending separate ratification and executed compiler fixtures |
| S-55 | Dropping an unstopped `ActorGraph` | Proposed: drop requests graceful stop and the owning scope awaits completion; must-use diagnostic for a discarded admission `Result` |
| S-56 | Equality operators `==` versus `eq` | Chapter 16 records `eq` as canonical and `==` as an alias; confirm, and define numeric (`1` versus `1.0`) behaviour |
| S-57 | Synchronous calls to actor methods through an `ActorRef` | TARGET in [chapter 05](05-actors-and-state.md): rejected; only `send`/request messages cross the actor boundary; decide the typed request/reply API |

**Observed on 2026-11-03** ([chapter 19](19-observed-status-2026-11-03.md)): for S-01, both Java and LLVM accept only `: T { }` and `-> T { }` on free functions. For S-14, the Java launcher refuses `.atto` files.

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
