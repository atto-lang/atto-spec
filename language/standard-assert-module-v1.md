# Standard assertion module API v1 (candidate)

**Status:** Draft AttoLang standard-library contract, 2026-11-19. It is **not** evidence that any compiler or backend currently executes these calls. The intended public API is a statically imported module namespace.

## Canonical source form

```atto
import * as assert from pkg "std.assert";

pub fnc test_mailbox(): void {
    assert.true(1 eq 1);
    assert.false(1 eq 2);
    assert.equal(42, 42);
    assert.not_equal(42, 43);
}
```

The canonical assertion interface is **`assert.<method>(...)`**, not a global `assert(condition)` function, statement, keyword, or compiler magic. `assert` is an ordinary statically bound module import alias. There is no automatic prelude injection of a global `assert`; an independently declared user function named `assert` is governed by normal language naming/scope rules, but must not be mistaken for the standard module. A formatter must retain module qualification and must never rewrite `assert.true(x)` to bare `assert(x)`.

`std.assert` is a normal audited package/module, not a runtime mutable class instance or a reflection-backed object. Its public exports are resolved at compile/link time and can be tree-shaken according to ordinary reachability and effect rules. No host-only builtin import or arbitrary FFI is implied. Import names and module symbols must respect the static import contract in `language/unified-static-imports-v1.md`.

## Required public API (v1)

| Member | Signature intent | Success | Failure |
| --- | --- | --- | --- |
| `assert.true(condition)` | `bool -> void` | returns normally when **exactly** `true` | typed `AssertionError` |
| `assert.false(condition)` | `bool -> void` | returns normally when exactly `false` | typed `AssertionError` |
| `assert.equal(expected, actual)` | `<T: Eq>(T, T) -> void` | equal under the type's verified equality semantics | typed `AssertionError` |
| `assert.not_equal(expected, actual)` | `<T: Eq>(T, T) -> void` | not equal under that same semantics | typed `AssertionError` |

The first argument of `equal` and `not_equal` is **expected**, then **actual**. No truthiness, numeric narrowing, string coercion, pointer-address comparison, dynamic fallback or unchecked structural equality is permitted. Type errors and unsupported equality implementations fail at compile time, before guest execution; do not silently compare serialized strings or addresses. Type-specific equality support must be explicit and proved separately by each backend.

Failed assertions use a normal, typed `AssertionError extends Error` through AttoLang's checked error/effect model, **never a native `abort`, SIGTRAP, process crash, actor panic, implicit `raise`, or supervisor CONTROL notice**. The calling test runner may catch and report the error. If the function's effect signature requires explicit error propagation/handling, the compiler must enforce that; this document does not create a hidden exception escape. A failed assertion must not terminate unrelated actors or tenants. Compilers must not strip assertion calls in release, AOT, `NDEBUG`-like, or optimization builds. These are runtime test expectations rather than compiler-controlled debug assertions.

Error reports should identify expected versus actual when safe and supported; diagnostic construction must be bounded, not expose secrets or invoke untrusted formatting/equality hooks with unchecked authority. Error output is a testing concern; it must not grant direct I/O or host handles to an untrusted guest.

## Reserved words after dot

The exact spelling `assert.true(...)` requires special **grammar admission**, because `true` and `false` are reserved boolean literal tokens. They are permitted as *qualified member/export names only*, never as bare variable names or bare function identifiers. The parser, export table, formatter and static linker must agree on this distinction. This exception does **not** make arbitrary keywords valid as members: `assert.if(...)`, `assert.return(...)`, and similarly malformed paths remain rejected.

Implementation may represent the public `true`/`false` exports through a declaration-level qualified-member rule or a statically validated exported alias; the compiler must resolve the actual `std.assert` module identity rather than special-casing every expression whose base variable happens to be named `assert`. User-provided modules can use permitted member names under the same static resolution policy, without new global keywords.

## Mandatory validation and compatibility

1. **Syntax and binding:** parse `import * as assert from pkg "std.assert";` and each dotted call; reject unbound modules/members, invalid arity, reserved bare `true` identifiers, and attempts to call a mutable runtime object as the `std.assert` namespace. Reject `assert.true` as a bare value if it is not a first-class callable export in that backend.
2. **Type/effect checks:** boolean-only predicates, homogeneous generic `Eq` comparisons, independent expected/actual evaluation **exactly once in left-to-right order**, and compile-time failure on unsupported equality. Assert failure is typed `AssertionError`, not panic.
3. **Execution:** invoke compiled `.atto` code in both success and failure cases; verify failure does not stop unrelated actors. Repeat under optimizations and Native AOT; verify assertions are not erased.
4. **Negative controls:** false conditions fail; unequal values fail; mixed numeric types cannot silently coerce; forbidden keyword members fail; an unimported `assert` must not be invented.
5. **Parity:** Rust, Java, LLVM, Wasm, .NET, Forge and other backends publish separate exact-head compile/link/run receipts. A parser acceptance test or host-language test cannot count as a compiled Atto guest pass. Unimplemented cases remain `not_executed`.
6. **Migration:** audit `.atto` sources, fixtures and docs for implicit/bare `assert(...)`; migrate intended standard assertions to the imported qualified module. **Do not** mechanically replace Rust's `assert!`/`assert_eq!`, C/C++ host invariants, or tests in other source languages—those are distinct ecosystems. In production native actor scheduler code, side-effecting calls may never live only inside C `assert(...)` macros, which disappear under `-DNDEBUG`.

Related contract: `language/unified-static-imports-v1.md`. This module does not alter actor-pool concurrency behavior or TenantVM isolation.
