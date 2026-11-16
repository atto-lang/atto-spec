# AttoLang full-AOT feature and syntax coverage contract (candidate v1)

> **Status: CANDIDATE AUDIT, not merged language syntax or compiler parity.**
> This maps the [25 features and 25 syntax patterns in the shared language comparison](https://chatgpt.com/share/6afb6c39-5f90-83e8-931b-694d78c7577f) into AOT-constrained engineering targets. It does not make all 50 programming languages interchangeable, nor introduce every foreign syntax.

## Mandatory AOT invariant

All accepted source programs must be eligible for a **closed-world, fully ahead-of-time** build, with no runtime Atto source compiler, machine-code JIT, generated implementation of generic parameters, macro expander, or new executable code generation. Dynamic *data*, typed dispatch, interpreted configuration, channels, actors, plugin loading, and metadata queries do not violate this by themselves.

Required native targets: **Java via GraalVM Native Image**, **LLVM native object/executable**, **.NET NativeAOT**. Rust/Wasm must support precompiled Wasm guests, with native `.cwasm` precompilation where that packaging mode applies. A successfully compiled scalar example must never be presented as whole-language or all-target proof.

For polymorphism choose either (a) monomorphized static call edges or (b) compile-time-materialized finite witness/vtable layouts. Generic instantiations used across exported/AOT plugin ABI boundaries must be declared or explicitly registered at build time. Dynamic symbol discovery must not silently create new methods/types. Reflection is limited to generated, finite, explicitly retained metadata; no dynamic code emission.

Compile-time evaluation and macros must have deterministic inputs, bounded resources, typed stages, expansion provenance, sandboxing, no host filesystem/network side effects without explicit build permissions, and no runtime expansion fallback. General dependent types are a longer-term research target; first admit only compiler-decidable refinements, without changing accepted runtime behavior.

Hot loading means a **separately AOT-compiled, ABI-compatible artifact** validated at load time. Require signed/trusted provenance policy, versioned type and message layouts, generation fencing, permissions, actor quiescence or explicit migration, and rollback. Loading an arbitrary binary from the network is not automatically safe or permitted. Browser Wasm and no-dynamic-loading targets may explicitly reject hot loading while preserving base AOT compilation.

Never redefine Atto syntax by analogy: preserve `pipe` for actor/stream piping, `|>` for functional flow, `#symbol`, `susp` / `suspends`, `X?` vs omittable `x?`, snake_case callable names, and compiler-owned actor state. Non-adopted operators such as `←` and tilde collection constructors are **not** reintroduced by this audit.

## 25 feature acceptance targets

| ID | Feature | Priority | AOT implementation constraint |
|---|---|---|---|
| F01 | Algebraic data types | P0 | closed tagged sums/products; precomputed ABI layouts |
| F02 | Pattern matching | P0 | exhaustiveness and guard ordering compiled to finite decision trees |
| F03 | Type inference | P0 | static local/bidirectional inference; no runtime inference engine |
| F04 | Zero-cost abstractions | P1 | specialize or devirtualize where proven; no blanket zero-overhead claim |
| F05 | Memory safety without GC | P0 | ownership/borrowing plus bounded actor arenas and deterministic release |
| F06 | Immutability by default | P0 | val/let and mut separated; compile-time const distinct |
| F07 | Lightweight concurrency | P0 | AOT task/frame layouts and bounded scheduling |
| F08 | Actor model | P0 | typed mailbox/CONTROL ABI and actor isolation without dynamic compilation |
| F09 | Structured concurrency | P0 | lexical child lifetimes, cancellation, joins, fault propagation |
| F10 | Async/await | P0 | compile state machines and suspension effects ahead of time |
| F11 | Traits/typeclasses | P1 | closed-world witness tables or static specialization; no runtime instance synthesis |
| F12 | Extension methods | P1 | resolve at compile time under explicit import and ambiguity rules |
| F13 | Generics | P0 | monomorphization or precompiled dictionary dispatch with bounded specialization closure |
| F14 | Higher-order functions | P1 | AOT function pointers and typed callable ABI |
| F15 | Closures | P0 | compile environment layouts and ownership/capture plans |
| F16 | Iterators | P1 | finite typed iterator/adaptor pipelines and lifetime checks |
| F17 | Lazy evaluation | P2 | AOT thunk/iterator state and bounded memoization lifetime |
| F18 | Destructuring | P1 | static shape/variant binding plans; exact evaluation order |
| F19 | Null safety | P0 | Option<T> and explicit omittable argument separation; no implicit null |
| F20 | Result/Either errors | P0 | typed Result/Option and ? early exit with ownership/effect checks |
| F21 | Compile-time metaprogramming | P1 | sandboxed deterministic, bounded compiler-time evaluation; emitted IR frozen |
| F22 | Macros | P2 | hygienic, bounded compile-time expansion with diagnostics/source maps |
| F23 | Refinement/dependent types | P2 | compile-time decidable constraints first; undecidable/general proofs research only |
| F24 | Hot code reloading | P2 | load separately AOT-built artifacts, version ABI and generation-fence actor state |
| F25 | Built-in concurrency primitives | P0 | typed channels, select, supervision and cooperative cancellation |

## 25 syntax / ergonomic patterns: Atto direction, not syntax admission

| ID | Borrowed idea | AttoLang mapping or design target |
|---|---|---|
| S01 | Rust: exhaustive tagged-match | match/on with exhaustive arms, compile checked |
| S02 | Scala: match as expression | match<T> expression with return/effect inference |
| S03 | Haskell: algebraic sum declarations | nominal tagged enums/ADTs with static payload layouts |
| S04 | Swift: enum associated values | typed enum variant payloads |
| S05 | Elixir: pattern arguments | pattern dispatch resolved with first-match and arity gates |
| S06 | Kotlin: trailing lambdas | lambda literals with unambiguous call grammar; optional sugar deferred |
| S07 | Ruby: block iteration | typed callable blocks and iterators |
| S08 | Clojure: functional composition | |> forward functional pipeline |
| S09 | Haskell: function composition | |> pipeline and named composition helper; do not conflate actor pipe |
| S10 | Scala: for comprehensions | typed iterator/query combinators; syntax proposal separate |
| S11 | Rust: traits | nominal interfaces/traits with static witness requirements |
| S12 | Haskell: typeclasses | closed witness resolution at compile time |
| S13 | TypeScript: structural shapes | statically checked structural shape projection |
| S14 | Kotlin: sealed hierarchy | sealed class/interface exhaustiveness |
| S15 | Go: implicit interfaces | structural satisfaction only when statically provable; ambiguity fails closed |
| S16 | Go: channels | Channel<T>, readch/writech, << and >> typed IO |
| S17 | Erlang: message passing | receives/emits-or-sends typed contracts; supervisor CONTROL separate |
| S18 | Elixir: spawn processes | spawn Actor() with statically known actor type |
| S19 | Kotlin: structured concurrency | task scopes, joins and cancellation at suspension boundaries |
| S20 | Rust: async/await | susp/suspends and await with compiled continuation frames |
| S21 | Rust: ownership/borrowing | copy!/take!/share!/borrow! with static loan discipline |
| S22 | Zig: explicit allocator | actor arena/allocator capability; no universal GC dependency |
| S23 | C++: RAII | deterministic cleanup and drop on all control-flow exits |
| S24 | Swift: defer | defer/recover ordering and completion/exception safety |
| S25 | Rust: Result ? | Result<T,E>, Option<T>, ? typed early exit |

Some mappings are existing syntax proposals, not merged/verified implementations. Pattern identifiers are identifiers for tests, **not grammatical tokens**. New syntax requires its own grammar/formatter/migration review; map conceptual features to established AttoLang syntax whenever possible.

## Acceptance and testing matrix

The machine-readable file `conformance/full-aot-feature-coverage-v1.json` starts **all** backend cells as `NOT_EXECUTED`, intentionally. A parser accepting a word, a host-only model, a Wasm-only guest, an incomplete native slice, or a green workflow without guest execution does not elevate any other backend.

For **each feature** and for **each native backend**, promote to `PASS` only after:

1. Fix the exact Atto source tree SHA/commit and compiler tree SHA, compiler/runtime/toolchain versions, target triple and build flags; verify private-carrier mirrors by source Git tree and individual blob identity when needed.
2. Compile positive *real .atto guest* cases all the way to native executable; execute with checked output, exit status, effects, ownership and runtime resource semantics.
3. Compile negative guests and prove deterministic diagnostics, **no artifact** on rejection, no dynamic compilation, no unsafe cross-actor pointer escape, no untracked suspension, and no silent feature fallback.
4. Diff relevant native Java/LLVM/.NET outcomes and diagnostic classifications. Include Wasm for portable target surfaces. Report each status distinctly: `PASS`, `FAIL`, `UNSUPPORTED`, `NOT_EXECUTED`.
5. For concurrency, execute cancellation, actor supervision CONTROL notices, mailboxes, bounded scheduling, in-flight await/borrow, stable serialization, backpressure and resource reclamation under sanitizers or platform-equivalent checks.
6. For metaprogramming and hot loading, prove all generated code exists **before runtime**; reject novel runtime generic instantiation, malformed metadata, ABI mismatch, stale generations and untrusted plugins without executing them.

Backends may reject platform-inapplicable features (such as actual dynamic loading on a static microcontroller), but cannot claim successful compilation of an unsupported feature. No source repo should claim *full parity* while any required cell remains `NOT_EXECUTED` or `UNSUPPORTED`.

## Existing cross-reference, not completion claims

- [Atto compiler parity audit tracker](https://github.com/atto-lang/atto-compilers-parity-testing/issues/10) coordinates related work.
- [Rust/Wasm compiler](https://github.com/atto-lang/atto-source.rs), [Java/Graal](https://github.com/atto-lang/atto-source.java), [LLVM native](https://github.com/atto-lang/atto-source.llvm), [.NET NativeAOT](https://github.com/atto-lang/atto-source.net).
- [AOT Wasm precompile PR](https://github.com/atto-lang/atto-source.rs/pull/182) proves a **bounded path**, not every language feature.
- [AOT typeclass witness proposal](https://github.com/atto-lang/atto-spec/pull/4), [annotation registry proposal](https://github.com/atto-lang/atto-common-source/pull/4), [hot-load reference](https://github.com/atto-lang/atto-hot-loading-tests/pull/2).
- [Conformance fixtures](https://github.com/atto-lang/atto-platform-conformance) should own promoted execution evidence.

## Critical separation of layers

**Feature definition** (normative design) ≠ **grammar accepted** ≠ **typed HIR/MIR validated** ≠ **native code emitted** ≠ **native guest executed** ≠ **multi-backend parity**.

This is a coverage ledger and release gate, not an unsupported promise to implement 50 languages or dynamic execution in a native AOT runtime.
