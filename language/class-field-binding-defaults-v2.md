# Class-field binding defaults v2 — implicit `val`

**Status: accepted semantic replacement of v1 (2026-11-18); Rust/browser subset verified on an exact-source mirror. Other backends and cross-package linking remain unverified.** This amendment reconciles the user-approved [class-field visibility v1](class-field-visibility-v1.md) with the older [class-field binding defaults v1](class-field-binding-defaults-v1.md). V1 chose implicit `let`; the current class-visibility contract and associated implementation work require implicit `val`. Do not silently claim v1 and v2 describe identical behavior.

## Normative v2 rule

An **ordinary class field** with an omitted binding modifier is **`val`**, irrespective of its type. An explicit `let` is required for rebinding, and `mut` controls referent mutation separately. Neither visibility nor the chosen initializer separator (`=` or a legacy supported `:` spelling) changes this default.

```atto
define pub class Counter as
    private int id = 1;             // private val int id = 1
    pub[pkg] int package_id = 2;     // pub[pkg] val int package_id = 2
    pub int stable = 3;             // pub val int stable = 3
    pub let int counter = 0;        // explicitly rebindable
    pub let mut Foo manager = new Foo();
    pub val mut Foo anchored = new Foo();  // binding fixed; referent mut requested
    pub final int generation = 1;   // single-assignment lifecycle
    pub const int max_size = 42;    // constexpr
end
```

| Class field | Binding reassignable? | Referent-write request | Initialization |
| --- | --- | --- | --- |
| `T field = e` | No (`val`) | No | Normal supported initializer |
| `val T field = e` | No | No | Normal supported initializer |
| `let T field = e` | Yes, with appropriate receiver/loan | No | Normal supported initializer |
| `let mut T field = e` | Yes, with appropriate receiver/loan | Yes, separately checked | Normal supported initializer |
| `val mut T field = e` | No | Yes, separately checked | Normal supported initializer |
| `final T field = e` | No after exactly one assignment | No by default | Exactly-once; deferred init only with proof |
| `const T field = e` | No | No by default | Compile-time-evaluable; no runtime effects |

**Not changed:** type-first *local* declarations remain compile-time `const` under the local-binding contract; file/module `define const ... = os.read_env(...)` has its own tightly scoped runtime-once exception. Named historical `name: T = e` class fields preserve their separate fixed-slot semantics until a migration is proven equivalent. No actor state, struct, record, or module default is changed.

The existing Rust browser compiler's `FieldMode::Final` is a coarse storage rule; preserve `FieldBinding::Val`, `FieldBinding::Final` and `FieldBinding::Const` separately in the AST and typed checker. Matching storage does **not** establish identical target semantics. In this subset, runtime class field initializers remain restricted to statically admitted expressions and class-valued fields are not fully executable. A backend unable to prove deferred final initialization must reject it, not change `final` to `val`.

## Migration and compatibility

1. **Breaking default:** bare `T x = e` previously permitted checked constructor reassignment under v1. In v2 that reassignment is rejected. Code that intentionally reassigns must write `let T x = e` explicitly. Do not globally rewrite fields or strip `mut`.
2. Preserve the byte-for-byte ABI and field layout. Generic instantiation cannot select a different default depending on whether `T` is primitive, nominal, or layout-specialized.
3. Apply checks to both read and write access, including `pub[pkg]`, inherited `use Parent.field as alias`, imported names, and borrowing. Visibility must not widen during lowering, and `val` cannot be changed through a mutable borrow.
4. Keep parser and formatter round trips for `val`, `let`, `final`, `const`, `mut`; the formatter can omit explicit `val` only after proving the v2 target is selected, not for a historical language-version build.
5. Cross-package enforcement requires authenticated package identities. Single-file browser compilation cannot claim multi-package security. Similarly, a passing host-only Rust test cannot claim actual compiled-Wasm or other backend runtime conformance.

## Required proof

- Parse/AST regression for primitive `int`, `string` and nominal `Foo` fields; verify omitted spelling equals explicit `val`, not `let`.
- Positive compiled guest execution for a `pub[pkg]` read and explicit `let` constructor reassignment.
- Compile-time `E_IMMUTABLE` for implicit `val`, explicit `val` and `final` reassignment; `E_CONST` for non-constexpr class `const`.
- Deny mutation of a `val` field through `borrow! mut`, and deny class-private access from other classes, even in the same package.
- Cross-package cases must be run only in an authenticated multi-package compiler; unsupported cases fail closed. Require exact tree/blob SHAs, source commit, test step execution, and guest result/diagnostic receipts.

**Migration gate:** Do not merge the compiler switch solely on parser tests; run the complete Rust test suite, audit existing constructor fixtures, and exercise the compiled guest Wasm harness. Mark CI runs with zero executed steps as NOT EXECUTED.

## Initial Rust verification receipt

The exact-source Rust/browser subset in [atto-source.rs PR #358](https://github.com/atto-lang/atto-source.rs/pull/358) passed **422 Rust tests, 0 failures** on all 659 SHA-verified source/test blobs (source commit `5a0c0a7f9da42bcfae2b39a413a5b3a6ef678409`) in [private CI run 44440471287](https://github.com/gha-indie-worker/gha-indie-worker-docs/actions/runs/44440471287). A separate [focused compiled Wasm run 44440471318](https://github.com/gha-indie-worker/gha-indie-worker-docs/actions/runs/44440471318) returned 42 and enforced `E_IMMUTABLE`, `E_PRIVATE`, and `E_CONST` with no output artifacts on invalid code. Cross-package linker enforcement and independent Java/LLVM/.NET/Forge backends remain **NOT VERIFIED**. The repository's baseline strict Rustfmt/Clippy checks are not green; this receipt certifies functional tests, not lint or whole-ecosystem parity.
