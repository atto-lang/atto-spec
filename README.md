> **AI agent instructions (organization-wide):** Before working on code, issues, or pull requests, read and follow the [organization `AGENTS.md`](https://github.com/atto-lang/.github/blob/main/AGENTS.md), including its **merge-first stealth-development policy**. Honor any repository-local `AGENTS.md`, explicit holds, and GitHub-enforced rules.

# atto-spec

Canonical AttoLang language specification, including syntax, semantics, types, ownership, and concurrency.

## Canonical naming and documentation migration

[AttoLang](https://github.com/atto-lang) is the sole canonical project name; configure repository remotes as `https://github.com/atto-lang/atto-spec.git` and refer to `.atto` in new examples. [atto-spec](https://github.com/atto-lang/atto-spec) owns normative grammar, ownership, lifetime, effects and actor contracts; [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance) tracks executed verification. Distinguish design proposals from tested compiler support and do not advertise zero-step CI as guest conformance.

## Atto Theater application-platform architecture

The adopted platform names are **Atto Theater** (OTP-style application platform), **Atto Director** (supervision), **Atto Ensemble** (actor groups, typed topics and subscriptions), and **Atto Runtime** (execution engine). These are architectural names, not new language keywords or claims of completed guest support.

- [Atto Theater v1 — canonical naming, layering, safety boundaries and conformance plan](architecture/atto-theater-v1.md)

## Purpose

Define normative syntax and semantics; document actor isolation, effects, ownership, and portability requirements.

## Repository responsibilities

- Keep interfaces, schemas, and behavior documented in a backend-neutral form where applicable.
- Use test fixtures and reproducible evidence to distinguish proposed behavior from implemented behavior.
- Record breaking changes, migration notes, and dependencies on other AttoLang components.

## Initialization contracts

- [27 — Type-first implicit const and explicit const mut](spec/27-implicit-const-and-const-mut.md)
- [28 — Explicit initialization and no implicit default values](spec/28-explicit-initialization-no-implicit-defaults.md)

## Language contracts

- [Immediate channel probes](spec/27-channel-immediate-probes.md): recoverable `Accepted`/`Full(T)`/`Closed(T)`, no waiter registration and affine ownership; host reference only.

- [Effects and lifetimes](spec/23-effects-and-lifetimes.md): typed CFG loans, latent effects, actor-domain retirement and proof gates; canonical bang ownership syntax and host-only contract evidence.

- [Structural tilde shorthand v1](language/structural-tilde-v1.md): candidate `~` synonym for `structural`, typed pattern matching and named/positional delimiter safety (**not guest-verified**).

- [Structural member witness matrix](language/structural-member-witness-v1.md): proposed interface, trait, class, struct, Record, Tuple and Map contracts; [43 host-only cases](conformance/structural-member-witness-v1.json) (not backend-executed).

- [Statement match arm delimiters v1](language/match-arm-delimiters-v1.md): per-arm `end` or braces, plus the outer match `end`; source-only structural cases remain unexecuted.

- [Anonymous structural shape types, singleton and union field values (proposed)](language/anonymous-structural-shapes-v1.md)

- [Anonymous structural shapes: source-only 50-case registry](conformance/anonymous-structural-shapes-v1.json) — proposed, not compiler-executed.

- [Atomics and receive-only serialization](spec/27-atomics-and-receive-only-serialization.md): `Atomic<T>`, memory order, concurrent receiver methods and serial receive admission; target only.

- [Typed enum patterns and aliases](spec/27-typed-enum-pattern-aliases.md): canonical target `on Run { ... } as r`, scoped type narrowing and borrows; no guest proof claimed.

- [AOT overloads, nested and binary patterns](spec/27-aot-overloads-nested-and-binary-patterns.md): static callable/class constructor selection, head/tail and byte/bit/packet matching; target contract, not guest parity.

- [Root Object and Actor lifecycle](spec/27-root-object-actor-lifecycle.md): target root APIs, deterministic cleanup, shutdown quiescence and no-GC limitations; host contract only.

- [Actor creation effect `spawns` v1](language/actor-spawns-effect-v1.md): explicit spawn-capable callable effects, nested actor parentage, tenant-scoped authorization, quotas, lifecycle fencing and 26 proposed conformance cases (19 source / 7 runtime). **Target proposal; no compiler or guest parity certified.**

- [Actor self-organization and telemetry sidecars v1](language/actor-self-organization-v1.md): proposed capability-scoped discovery, atomic child reconciliation, graph transactions and isolated observability sidecars. Bounded Node model tests are **HOST_ONLY**; compiler and runtime guest support remains unverified.

- [Implicit receiver and qualified calls v1](language/implicit-receiver-qualified-calls-v1.md): desired method-family precedence and distinct `self.`, `pkg::` and `imports::` lookup, including sealed-actor intrinsic protection. Its [26-case conformance matrix](conformance/implicit-receiver-qualified-calls-v1.json) and Node tests are **host-only**; real compiler/runtime/AOT parity is **not verified**.

- [Functors and nested ADTs](spec/23-functors-and-nested-adts.md): target exact mapped return types, nested Result/Option, transpose/flatten, ownership, and AOT proof gates. Host reference tests are not guest execution evidence.

- [Generic callable signatures v1](language/generic-callables-v1.md): target contract for `fnc foo<T>(...) : T { ... }`, `fnc foo<T>(...) -> T ... end`, bounded inference, named/defaulted type arguments, and full-AOT specialization. Its case registry is **NOT_EXECUTED**; compiler support remains independently gated.

- [Mailman actor delivery v1](language/mailman-actor-delivery-v1.md): candidate proof-gated ownership transfer, checked cross-actor leases, immutable sharing and deep-copy/copy-elision contract. [Host-only model fixtures](conformance/mailman-actor-delivery-v1.json) and [tests](tests/mailman-actor-delivery-v1.test.mjs); no compiler/runtime execution or backend parity claimed.

- [Single-threaded runtime mode v1](language/runtime-threading-mode-v1.md): canonical `--single-threaded` / `--max-threads-per-space=1` and `--mode=single-threaded` request at most one guest-executing OS thread per shared memory space. **PROPOSED:** SOURCE_FREE CLI reference tests are not guest-runtime execution or backend parity evidence.

- [Return-type `infer` / `typeof(binding)` v1](language/return-type-queries-and-inference-v1.md): TARGET contract for explicit return inference and compile-time binding-derived return types, preserving historical `typeof fnc` and `typeof value`. Host-only checks are not guest execution.

- [Compiler-generated proxy virtual interception candidate](language/class-proxy-virtual-interception-v1.md): typed virtual dispatch, one-shot continuation, ownership and effect-safety obligations; **not implemented or guest-verified**. Planned [58-case conformance matrix](conformance/class-proxy-interception-v1.json) is host-validated only.

- [Affine proxy proceed protocol](language/class-proxy-affine-proceed-v1.md): continuation state machine, typed short-circuit and failure-control obligations; **design only, not executable**.

- [ActorGroup typed pub/sub v1](language/actor-pubsub-v1.md): group membership is distinct from topic subscriptions; bounded RELIABLE atomic fan-out, affine cancellation and incarnation fencing are TARGET, not yet backend-verified.

- [Primitive, aggregate and object storage v1 — Java/LLVM](language/primitive-object-storage-java-llvm-v1.md): **draft target** for inline scalars, nominal Struct/structural Record, identity classes, actor-private heap handles and verified implicit borrowing. [30 target cases](conformance/primitive-object-storage-java-llvm-v1.json) are **NOT_EXECUTED** on Java and LLVM.

- [Control-loop and actor unmanaged memory v1](language/control-and-actor-unmanaged-memory-v1.md): **draft target** for separate control/actor Ref32 memory domains, versioned offset-vs-slot ABIs, unmanaged JVM/.NET guest payloads and measured zero-managed-allocation hot paths; no backend certification.

- [Hybrid actor memory v1 — 32/64/128-bit extensibility](language/hybrid-actor-memory-v1.md): **draft target** preserving the Ref32 offset8+1 layout while permitting explicitly versioned extended heaps, native pointers, SIMD and capability profiles; guest parity unverified.

- [Fresh return types v1](language/fresh-return-types-v1.md): candidate `new T` and `new unique T` provenance and ownership rules, including stronger Copyable return contracts. Host-only oracle; no Java/LLVM/.NET compiler support claimed.

- [Copyable / DeepCopyable shallow-and-deep v2](language/copyable-ownership-v1.md): candidate Object and interface contracts for shallow `copy!` / `.copy()` and graph-deep `copy!!` / `.copy_deep()`, array/collection copying, per-recipient actor isolation, AOT-generated inherited/private-field copy plans, share-permission checks, override hooks and fail-closed diagnostics. Its checked-in tests are **host-only**; backend guest execution is **not verified**.

- [Maybe/else with lexical defer v1](language/maybe-else-defer-v1.md): contextual `do maybe` / `return maybe`, exhaustive value-failure `else`, and body cleanup before handler; **design proposal, not compiler certified**.

- [Persistent immutable collections v1](language/persistent-immutable-collections-v1.md): constexpr Vector, nonmutating updates, distinct collection identities and explicit ownership proof; backend registry remains NOT_EXECUTED.

- [Static imports v2](language/static-imports-v2.md): namespace-first syntax, scoped identities, alias graphs and offline AOT target; existing v1 profiles are migration-gated.

- [TenantVM terminology](spec/tenant-vm-terminology.md): canonical per-tenant execution boundary and historical identifier compatibility; target terminology, not sandbox certification.

- [Ownership vocabulary v1](language/ownership-vocabulary-v1.md): canonical `borrow!`, `take!`, `share!`, `copy!`/`copy!!`; legacy `rt` ownership aliases and independent checked-handle admission.

- [Exceptional bang spellings v1](language/exception-control-bang-spellings-v1.md): canonical `trap!` / `throw!` / `raise!` / `panic!` target spellings with bare migration aliases; no compiler certification.

- [Cross-backend semantics reconciliation v1](language/cross-backend-semantics-reconciliation-v1.md): November 23 target decisions and independent backend admission boundaries.

- [Canonical Boolean operators v1](docs/CANONICAL_BOOLEAN_OPERATORS_V1.md): strict bool `&&`, `||`, and `Xor(bool,bool)`; historical spellings require explicit migration.

- [Checked int.parse Result v1](language/int-parse-result-v1.md): signed-i64 parsing to Result<int,Error> with deterministic bounded ASCII admission; target-only until compiled-guest evidence.

- [Keyword roles and syntax highlighting taxonomy](spec/23-keyword-taxonomy-and-highlighting.md) records proposed editor metadata and links the documented lexer inventory.

- [Bitwise operators and directional streams v1](language/bitwise-and-stream-operators-v1.md): int-only `& | ^^ ~`, statement-return `^`, checked triple shifts `<<< >>> ashr`, and typed I/O `<< >>`; target semantics, not backend parity.

- [Trap-to-Result v1](language/trap-result-v1.md): caller-side `trap` preserves returned `Result`/`Option` layers and catches ordinary `throw` as `Err(original Error)`; unverified backends must fail closed rather than emit legacy Option results.

- [File/module `define const` v1](language/file-module-const-v1.md): unconditional static immutable bindings using `=` or `as`; constexpr folds at compile time, direct `os.read_env("KEY")` is evaluated exactly once at runtime initialization. **Proposal; backend guest execution not yet verified.**

- [Tuple destructuring, mutability and aliasing v1](language/tuple-destructuring-v1.md): accepted target syntax for mixed per-element `let`/`val`/`const`/`mut` bindings, explicit binder lists and `as foo` root aliases; compiler/guest support not yet verified.
- [Typed std.pattern fragments v1](language/typed-pattern-fragments-v1.md): additive compile-time-only pattern.of<T> proposal, safe literal grammar, contextual typing, borrowed rest captures and separate runtime parse design; host-only reference checks, compiled guest and backend parity NOT_VERIFIED.
- [Structural sequence matching v2](language/sequence-pattern-matching-v2.md): proposed canonical bare `...` rests, counted `...(3 of int, 3 of bool)` segments, type/value tests and anchored bindings. Its checked-in tests are **host-only**; guest compilation and cross-backend parity are **not verified**.
- [Historical sequence matching v1](language/sequence-pattern-matching-v1.md): retains the superseded `..._` / `_...` convention and old reference tests for migration review.
- [AOT compile-time reflection, C layout and safe FFI v1 candidate](language/compile-time-reflection-ffi-layout-v1.md): bounded compile-time-only descriptors, static serializer generation, target-specific C ABI layout checks, explicit FFI ownership/effects and callback prohibition in v1. **Proposal / source-free tests only; no compiler or guest-AOT verification.**

- [Visibility, foreign linkage and final fields v1](language/visibility-linkage-and-final-v1.md): distinguish internal, external, protected and final; includes fail-closed browser frontend matrix. Native link parity remains unverified.
- [Namespaced and module exports v1](language/namespaced-exports-v1.md): explicit `export pub module`, qualified member access, source namespace identity, package gates and negative cross-file cases. This is a target contract; linker and native guest parity are **not verified**.
- [Duration, timers and sleep v1](language/timers-and-sleep-v1.md): target `Duration`, `await sleep(...)`, `sleep_blocking(...)`, monotonic deadlines, cancellation and fiber-admission. Host-only reference tests; no compiler or guest execution claim.

- [Suspension effect alias v1](language/susp-effect-shorthand-v1.md): `susp` is canonical for `suspends`; both have identical suspension effects, including on lambda and callable type syntax. Runtime and multi-backend parity require separate evidence.
- [Shared ownership and explicit guards v1](language/shared-ownership-and-guards-v1.md): TARGET semantics for canonical `share!` (legacy `rt share` is compatibility-only; frozen sharing) and separately synchronized `RwLock<T>` mutation; **not compiler certified**.

- [Class field binding defaults v2](language/class-field-binding-defaults-v2.md): canonical implicit `val` for ordinary class fields, explicit `let` for writable bindings; replaces historical v1 implicit-`let` rule. Focused Rust/browser guest execution verified; cross-backend and package-linker parity remain pending.
- [Class field binding defaults v1 (historical)](language/class-field-binding-defaults-v1.md): previously adopted `let` default, retained for migration and explicit supersession tracking.

- [Implicit argument borrowing v1](language/implicit-argument-borrow-v1.md): target non-owning default for nonprimitive call arguments, checked mutable loans, explicit ambiguous cases and breaking ownership migration (not yet compiler-certified).

- [Struct field equals initializer v1](language/struct-field-equals-v1.md): restricted `StructName(field=value)` with checked name resolution, ordinary-call rejection, and source-order safety (TARGET / NOT EXECUTED).
- [Out-of-line receivers, constructors and protected class state v1](language/out-of-line-receivers-constructors-and-state-v1.md): TARGET declaration/linkage semantics for class and struct receiver methods, typed constructors, and guarded per-instance class state. Accompanying source-only cases are **not compiler/guest execution evidence**.

- [Class-field visibility v1](language/class-field-visibility-v1.md): canonical `pub[pkg]`, explicit and implicit `private`, and immutable-by-default class fields; cross-package linker tests and multi-backend guest validation remain pending.

- [Explicit callable return types v1](language/explicit-callable-return-types-v1.md): every named callable declares a concrete result (including `void`) or explicitly opts into `infer`; omissions are errors. Target contract; backend parity unverified.

- [Return-first and begin/end callable syntax v1](language/return-first-and-begin-callables-v1.md): accept `fnc int <- name(args)` and bare `int <- name(args)` plus brace, `begin`/`end`, and statement/`end` bodies (target; backend parity pending).

- [Freestanding core / alloc / std v1](language/freestanding-library-layers-v1.md): proposed three-layer dependency and bare-metal link contract; **not compiled-guest verified**.

- [Identity-free value classes v1](language/value-classes-v1.md): **proposed** nominal value types, immutable construction, equality/copying, AOT and fail-closed gates. No backend guest conformance is verified. See [conformance PR #57](https://github.com/atto-lang/atto-platform-conformance/pull/57).

- [Failure capabilities v1](language/failure-capability-interfaces-v1.md): proposed `Throwable`, `Raisable`, and `Panicable` nominal contracts for `throw` / `raise` / `panic`; no executable-backend parity claim.

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

## Repository capability inventory v1 (advisory)

This repository defines [the repository-capabilities contract](contracts/repository-capabilities-v1.schema.json) so ecosystem discovery tools can distinguish implemented code from README-only scaffolds without fabricating build or guest-execution claims.

Each participating repository can publish a root-level `atto-capabilities.json` containing its exact `atto-lang/<name>` identity, role, `scaffold` or `implementation` source state, per-feature status and any evidence metadata. A **scaffold must report every feature as `not_executed` with no evidence**. All manifests are `NOT_CERTIFIED`; even a syntactically accepted evidence record is not independently verified.

The offline validator and test suite require only Node.js:

```sh
node scripts/validate-capabilities.mjs atto-capabilities.json --repo atto-lang/atto-spec
node --test tests/repository-capabilities.test.mjs
```

Actual compiler, actor isolation, AOT and multi-backend parity claims require separate exact-commit executed guest receipts and independent review; this inventory never replaces those gates.

- [Opaque newtypes, bounded values and const generics v1](language/opaque-newtypes-bounds-const-generics-v1.md): TARGET nominal scalar identities, checked ranges and compile-time shape/layout arguments, with [machine-readable vectors](contracts/opaque-newtypes-bounds-const-generics-v1.json) and **host-only** proof tests. No compiler/backend guest parity claimed.

- [Checked owned Dyn interface erasure v1](language/checked-owned-dyn-erasure-v1.md): defines constructor, checked `(take! owner) as Dyn<I>`, and contextual `take!` equivalence; Rust/browser implementation draft remains unexecuted on current head, all other backends unverified.

## Rule registry and cross-toolchain conformance

- [Specification framework](language/specification-framework-v1.md): rule identity, edition/profile authority, governance and formatter safety laws (proposed protocol; NOT a backend proof).
- [Machine-readable rule index](contracts/specification-rules-v1.json): stable rule IDs and formatter target vectors linking existing language clauses to conformance; **not yet executable guest certification**.
- [Formal refinement obligations](formal/specification-refinement-obligations-v1.md): parse, type/ownership, actor, formatter and compilation proof targets.
- [Host-only registry tests](tests/specification-framework-v1.test.mjs): checks traceability and negative vectors; does not execute compilers or formatters.

`atto-format` and historical `oreslang-format` are independent consumers of this specification and must separately report parser/semantic round-trip evidence. Runtime/guest results belong in `atto-platform-conformance`, with exact SHA provenance. Do not infer parity from file presence or source-only CI.
