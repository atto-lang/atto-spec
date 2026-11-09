# AttoLang Language Specification

> **Draft v0.1 — design and conformance target, not an implementation certification.**
> AttoLang was formerly called Oreslang. New sources and examples use `.atto`; legacy `.ores` is retained under the [versioned branding compatibility contract](https://github.com/ores-truffle-oreslang/oreslang-common-source/blob/main/contracts/v1/attolang-brand-compat-v1.json).

AttoLang is an **actor-first, statically typed systems language** designed for ownership-safe concurrency, bounded asynchronous execution, data-oriented memory layouts, capability-restricted programs, and ahead-of-time compilation. An actor is a special kind of class with confined state and supervised lifecycle; an ordinary class is not an actor.

This repository is the **language-level specification**, not the proof that a particular backend already implements a feature. The five primary backends have the same target observable semantics: Java/GraalVM, native LLVM, WebAssembly, Forge, and .NET Native AOT.

## Read the specification

| Chapter | Subject |
| --- | --- |
| [00 — Scope and terminology](spec/00-scope-and-status.md) | Normative language, compatibility, maturity labels |
| [01 — Source and grammar](spec/01-source-and-syntax.md) | Files, declarations, bindings, control flow, expressions |
| [02 — Types and patterns](spec/02-types-and-patterns.md) | Nominal/structural typing, ADTs, generics, Option/Result |
| [03 — Functions and effects](spec/03-functions-and-effects.md) | Calls, effects, critical functions, pipelines |
| [04 — Ownership and memory](spec/04-ownership-and-memory.md) | Borrowing, moves, arenas, transport |
| [05 — Actors and state](spec/05-actors-and-state.md) | Actor identity, sealed state, mailbox, supervision |
| [06 — Async and scheduling](spec/06-async-and-scheduling.md) | Tasks, channels, select, dispatchers, I/O |
| [07 — Errors and failure](spec/07-errors-and-failure.md) | throw, raise, panic, trap, cancellation |
| [08 — Isolation and permissions](spec/08-isolation-and-permissions.md) | Trust domains, permissions and security boundaries |
| [09 — Modules and AOT](spec/09-modules-and-aot.md) | Packages, import resolution, builds, reflection and reload |
| [10 — DOP and real time](spec/10-dop-and-realtime.md) | Data layouts, affinity, GPU, real-time profiles |
| [11 — Conformance](spec/11-conformance.md) | Required backend gates and evidence |
| [12 — Open questions](spec/12-open-questions.md) | Unsettled decisions and compatibility risks |
| [13 — Hierarchical supervisors](spec/13-supervisor-hierarchies.md) | Nested supervisors, restart boundaries, identity and CONTROL fences |
| [14 — Actor pipeline factories](spec/14-actor-pipeline-factories.md) | `Actor.pipe(...)` and `Actor.connect(...)`, typed ports, authority and graph admission |
| [15 — Nested actor pipeline builders](spec/15-nested-actor-pipelines.md) | Recursive pipeline segments, capacity and supervisor scopes, move-only builders and restart fencing |
| [16 — Lexical and grammar reference](spec/16-lexical-and-grammar-reference.md) | Keywords, literals, operators and the spellings compilers accept today |
| [17 — Primitives and core types](spec/17-primitives-and-core-types.md) | Scalars, integer rules, aggregates, Option/Result and concurrency primitives |
| [18 — Runtime guarantees](spec/18-runtime-guarantees.md) | Failure domains, stacks, actor restart, pipeline failure, and what is and is not guaranteed |
| [22 — Receive-invocation stacks](spec/22-receive-invocation-stacks.md) | Per-receive logical stacks, independent task stacks, quotas, suspension and ownership |
| [19 — Observed status, 2026-11-03](spec/19-observed-status-2026-11-03.md) | Dated local test results for Java and LLVM. Not conformance evidence |

## Specification interpretation

A chapter labelled **DRAFT** describes the intended language contract. **TARGET** means a required eventual behavior, not necessarily shipped. **IMPLEMENTED** must always be qualified by a named backend, immutable commit, fixture, and actual execution evidence. **PROPOSED** denotes a design that needs a decision. `MUST` and `SHOULD` have their ordinary normative RFC meaning **inside the draft target**, not as a claim of current parity.

Examples are **illustrative** until associated with independently executed exact-head conformance fixtures. Unsupported syntax must fail closed: accepting a token, parser AST, host-only unit test, or CI job with zero executed steps is not guest execution.

This first edition deliberately separates **semantic guarantees** from **implementation strategies**. A no-GC target, a two-thread bootstrap goal, or an actor arena does not itself prove memory isolation, OS sandboxing, worst-case execution time, or five-backend equivalence.

## Source of truth and contributions

The existing implementation/contracts are reference material to reconcile, not automatically incorporated into this draft:

- [Java/GraalVM language design](https://github.com/ores-truffle-oreslang/oreslang-source.java/blob/main/docs/LANGUAGE.md) and [runtime model](https://github.com/ores-truffle-oreslang/oreslang-source.java/blob/main/docs/RUNTIME.md)
- [LLVM backend](https://github.com/ores-truffle-oreslang/oreslang-source.llvm) and [native exception/supervision contract](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/blob/main/docs/EXCEPTION_SUPERVISION_SEMANTICS.md)
- [Cross-backend conformance](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance) and its [execution evidence requirements](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/blob/main/docs/FIVE_BACKEND_EXECUTION_EVIDENCE.md)

Change semantic rules through reviewed amendments, with corresponding positive, negative, ownership and backend execution tests. Keep all new source fixtures in `.atto`; accept `.ores` only through explicit migration compatibility.
