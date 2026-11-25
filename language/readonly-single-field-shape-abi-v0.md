# Readonly single-field structural call ABI — bounded v0

**Status: executable Rust/Wasm subset; Java/LLVM/.NET host witness only; NOT full backend compiler parity.** Companion original structural semantics: `anonymous-structural-shapes-v1.md`.

## Admitted source type / call contract

```atto
define class Dog as pub int foo = 41; end
define class Cat as pub int age = 5; pub int foo = 42; end
fnc inspect(p: {foo: int}): int { return p.foo; }
pub fnc main(): int {
    val dog = new Dog();
    val cat = new Cat();
    return inspect(dog) + inspect(cat); // 83
}
```

For this v0 slice, anonymous one-field `{foo: int}`, `~{foo: int}` and `structural {foo: int}` are equivalent **formal types**. The Rust/Wasm compiler accepts direct, synchronous calls using an owned **named class local** and a single actual argument. `fnc`, `routine` and inline class methods share the same rule. Extra public fields are permitted; class nominal identity and physical field offset may differ.

The caller proves the source field name, exact scalar type, public accessibility, plain class field layout, address bounds and a live owner. For each call it computes the exact source-class byte offset; the hidden one-field formal is read-only and accesses offset 0 relative to that field address. **Never** reinterpret a differently laid-out class pointer as the formal's nominal class. The field address is borrowed only during the synchronous call and must not be stored, returned, moved, captured, or used as a nominal object.

No dynamic getter/property invocation, reflection, hidden private/protected member, sealed actor state, proxy, actor communication, or mutable write is admitted. A borrowed owner remains available after the call. The callee cannot obtain the address as an ordinary value. The operand must be evaluated exactly once in source order.

## Fail-closed boundaries

Until a separately verified descriptor ABI exists, reject: multiple shape fields; union, singleton-literal, nested/recursive, optional-type shapes; named `~Point` shape projection; multiple arguments requiring loan scheduling; dynamic `Map<string,string>` (key presence not guaranteed); records/structs lacking verified layout; callback effects or async/suspend/actor crossings; mutable structural views; returned/stored/forwarded shape addresses. Do not pretend `{foo:"dog"}` follows from a field typed `string` merely because its initializer happens to be "dog".

An ordinary `on {foo: 42}` is a value pattern; `on is {foo: int}` is a structural **type** test. Neither changes the callable ABI admission rules.

## Cross-backend evidence boundary (2026-11-16)

- **Rust/Wasm**: [PR #227](https://github.com/atto-lang/atto-source.rs/pull/227), source `09a7534dcae2ca958949942b53429c928bd0d248`, [full exact 619-blob guest run](https://github.com/cliptown/cliptown-e2e/actions/runs/43930674001): 529 conformance passes, 482 native/browser byte comparisons, 21 positive and 27 negative structural guest oracles, Chromium E2E.
- **Java**: [PR #21](https://github.com/atto-lang/atto-source.java/pull/21), exact-source typed field witness, 13 JVM checks. Does **not** compile the Atto source fixture.
- **LLVM**: [PR #18](https://github.com/atto-lang/atto-source.llvm/pull/18), exact-source native C++ field witness with ASan/UBSan. Does **not** compile the Atto source fixture.
- **.NET**: [PR #4](https://github.com/atto-lang/atto-source.net/pull/4), exact-source `ReadOnlySpan<byte>` / byref-like field witness (12 checks) executed in CoreCLR and Linux NativeAOT. The Atto frontend/CIL compiler is not yet present.

Host-only [green witness run](https://github.com/cliptown/cliptown-e2e/actions/runs/43932064706) verifies eight source files, **not** the complete Java/LLVM/.NET source trees. No Java/LLVM/.NET Atto compiled-guest parity is claimed.

## Next executable parity gates

Each native backend must parse exactly these formal types, preserve structural identity, build public-field shape witnesses in typed IR, lower a non-escaping borrowed field address without unsafe nominal casting, and compile **the same Atto .atto positive and negative fixtures** to real executable guests. Then require exact Git-tree provenance, positive/negative runtime/compiler observations, NativeAOT where applicable, ownership escape tests, and clean sanitizer/toolchain evidence. Keep this contract draft until those gates are met.
