# Compile-time constants: typed evaluation contract

Status: **Normative design with a partially verified Rust/browser subset** (2026-11-14).
This specification extends [local-binding-mutability-v1.md](local-binding-mutability-v1.md).
File/module declarations and their explicit environment boundary are specified separately in [file-module-const-v1.md](file-module-const-v1.md).

## Distinct concepts

- **Local** `const`: its initializer **must evaluate deterministically at compile time**, and the named binding cannot be reassigned. **File/module** `define const` admits an additional narrow `os.read_env` runtime-once static-initializer form; see [file-module-const-v1.md](file-module-const-v1.md).
- `val`: a runtime immutable binding; the initializer **may** have effects (subject to the function's effect rules), and the referent is read-only unless `mut` is present.
- `let`: a runtime rebindable local, with referent write access controlled separately by `mut`.
- `const mut`: compile-time-required initializer plus independent writable runtime referent **when legally materialized**. `mut` must not mutate the compiler's constant object, allow aliasing, or override actor ownership rules.
- Unqualified type-first `int x = 5` is exactly `const int x = 5`, not `val int x = 5`. A runtime initializer in that shorthand must be rejected rather than silently demoted to runtime const.

## Typed evaluation

Check name resolution and expression types before evaluating. Const evaluation uses the typed operator semantics that runtime code would use, including promotion, equality, and overflow. Emit an immediate literal/static value instead of a residual runtime computation wherever supported. For a scalar constant reference, use its proven stored value, never merely the fact that its binding name is immutable.

Required behavior for the first scalar profile:

- Signed 64-bit integer `+`, `-`, `*`, unary negation and comparisons: deterministic, checked. Overflow fails compilation with a stable diagnostic such as `E_CONST_OVERFLOW`, including negating `i64::MIN`.
- Boolean literals, negation, comparisons, and the language's supported boolean operators.
- IEEE-754 binary64 operators and the same int-to-float promotions admitted by the typed checker.
- Immutable UTF-8 strings, content equality, concatenation, and comparisons using the runtime's documented string ordering; if the runtime follows Java `String.compareTo`, compare UTF-16 code units.
- Nominal enum discriminants only when resolved to a known variant. No permission to inspect runtime actor/class fields.
- Conditional expressions evaluate their condition then the selected branch; both branches must still type-check and be free of disallowed runtime effects.

In a **local `const`** initializer and in a **constexpr initializer** of a file/module `define const`, a compiler must reject calls, allocation, I/O, actor-state reads, mutable borrows, nondeterministic operations, and references to runtime-only `val`/`let` bindings. The direct file/module `os.read_env("KEY")` exception is runtime-once, is **not constexpr**, and must never be evaluated by the compiler. If type checking is incomplete or the evaluator cannot prove the expression, fail closed. Const provenance is keyed by lexical binding identity, not by shadowed source names.

## Ownership and effect restrictions

Compile-time evaluation is not an escape hatch for sealed actor state or runtime ownership rules. An actor's heap is not a compile-time constant. Mutable reference aliases, state reads during `critical-read`, and nested writes must be validated by independent borrow/effect analysis. Parse-time admission of a `mtd` or `handle_state` callback **does not** prove runtime execution safety.

## Cross-backend conformance

Shared executable fixture registries:

- `atto-lang/atto-platform-conformance:contracts/local-binding-mutability-v1.json`
- `atto-lang/atto-platform-conformance:contracts/local-const-evaluation-v1.json`

A backend passes a case only after executing its own compiled guest artifact or returning the required compile-time diagnostic, pinned to source commit and verified Git tree/blob SHAs. For native AOT, a runnable compiled guest image is required; host-only tests and the Rust browser subset cannot establish Java/LLVM/.NET/independent Wasm/Forge parity.

**Verified Rust/browser subset only:** `atto-lang/atto-source.rs` draft PR #102 implemented typed folding for supported scalar/string/enum expressions, integer overflow rejection and static-value emission. Exact-source CI `athlet-o/athleto-e2e` run `43649998559`: 349 compiler/guest cases, 313 native-versus-Wasm comparisons, browser E2E and actor syntax checks passed. This does **not** prove complete cross-module constexpr, deep-frozen runtime object materialization, or whole-program full-AOT guarantees.
