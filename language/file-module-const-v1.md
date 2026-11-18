# File and module compile-time constants v1

Status: **Normative design proposal; no backend implementation or executable parity is claimed.** 
Extends [compile-time-constants-v1.md](compile-time-constants-v1.md) without weakening its typed, deterministic evaluator.

## Grammar and scope

```ebnf
top_const_decl = "define", ["pub"], "const", type_ref, IDENT, ("=" | "as"), const_expr, ";" ;
```

A `top_const_decl` is permitted as an **unconditional direct member of a source file or module**, not inside a function, actor handler, loop, conditional, callback, or runtime-created block. `define pub const` exports a constant through ordinary module visibility; the default is private. Keep `pub define` compatibility handling separate from the accepted canonical `define pub` spelling.

Both initializer separators mean exactly the same thing. A formatter may canonicalize `as` to `=` at this specific declaration position; `as` in class/module bodies and casts has no implication for constant evaluation.

```atto
define const int foo = 5;
define const int bar as 5;
define const int total = foo + bar;
define pub const string language_name as "AttoLang";
```

A compiler must reject duplicate declarations or collisions with other symbols in the same namespace, resolve imported/exported references with module visibility, and diagnose missing or cyclic constant dependencies. Constant references must resolve by binding identity, not by textual name replacement; local shadowing cannot change what a top-level initializer means. Allow forward references only after successfully resolving the dependency graph and detecting cycles; otherwise reject instead of substituting zero, null, or an uninitialized value.

## Compile-time/static semantics

1. Type-check every initializer against its declared type **before** accepting the constant. No implicit string-to-int conversions, implicit narrowing, or runtime coercion.
2. Evaluate with the typed, bounded compile-time evaluator described in the existing constants contract. Fold into a compiler constant pool or immediate value. A source declaration does **not** allocate a mutable process global, run a module constructor, or initialize per actor/request.
3. Permit literals, references to already proven compile-time constants, and supported deterministic constexpr operators. Operators obey AttoLang checked arithmetic, overflow, equality and string semantics; value and type errors reject compilation.
4. No function calls unless a separately specified and verified `comptime`-safe function capability exists. Runtime APIs, clock, randomness, I/O, network, filesystem, environment, actors, dynamic allocation, unsafe/foreign calls, mutable borrows, and runtime-only `val`/`let` references are **not** constexpr.
5. A top-level constant cannot be conditionally declared or assigned. A *pure, statically decidable conditional expression* may be folded only if all branches type-check, none contains disallowed effects, and the existing typed const contract permits the operator. Runtime-dependent conditions are forbidden.
6. The name and value are non-rebindable, and a top-level `const` cannot be a loophole for shared mutable state. Mutable object graphs need a separately proven deep-frozen constant representation; otherwise reject them.
7. Compile-time errors are fail-closed: unknown syntax/evaluation support yields a diagnostic and **no executable artifact**, not a runtime fallback. Suggested stable errors include `E_CONST` for non-static/effectful values, `E_CONST_TYPE`, `E_CONST_CYCLE`, `E_DUPLICATE`, and the existing `E_CONST_OVERFLOW`.

## Environment-variable boundary

```atto
define const int foo as os.read_env("foo_bar"); // ERROR: not compile-time evaluable
```

`os.read_env` observes the **running process** environment. Reading it at run time is not compile-time evaluation even if the resulting binding is immutable afterward. An environment lookup also yields text or an absent/error result; it cannot implicitly satisfy `int`.

Runtime-once module configuration could be expressed through a distinct, future **module-scope immutable runtime binding** (e.g. `define val Option<string> raw_foo = os.read_env("foo_bar");`) after module initialization order, effects, permissions, actor isolation and error handling are specified. **That syntax/API is not made executable by this proposal.** For portable programs, an explicit startup function/actor may read and parse configuration and pass an immutable configuration value to dependents.

A future **explicit build-time input** facility (e.g. `build.env_int("FOO_BAR")`) may produce a real compile-time value only with opt-in build permissions, declared and validated inputs, reproducibility/provenance records, and safeguards against embedding secrets in compiled artifacts. Ordinary `os.read_env` must never silently become such a build-time capability.

## Cross-backend acceptance

Required positive fixtures: both `=` and `as`; typed integer/string/bool constants; cross-reference; private and exported module constants; deterministic compile-time arithmetic; no runtime global/initializer. Required negative fixtures: `os.read_env`; runtime function call; runtime condition; type mismatch; duplicate symbol; unknown symbol; cycle; checked overflow; invalid conditional/nested declaration; forbidden mutable aggregate; shadowing/cross-module visibility violations.

Each backend must report its **own** source SHA, compiler/host toolchain, compiled guest artifact or compiler diagnostic, and executed guest results. Host-only parser tests or previous local-`const` evidence do **not** establish file/module constant support or native-AOT/backends parity. The initial cross-backend registry lives in `atto-lang/atto-platform-conformance`; unsupported backend cases remain NOT_EXECUTED/NOT_VERIFIED until tested.
