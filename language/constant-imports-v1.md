# Typed constant imports and file/namespace static bindings (v1)

**Status:** User-requested target semantics. This document extends [unified static imports](unified-static-imports-v1.md), [file/module `define const`](file-module-const-v1.md), and [declarative exports](declarative-exports.md). **No compiler/package-linker or cross-backend execution claim follows from this proposal.**

## Syntax

```atto
// std/http.atto (declared namespace std.http)
use namespace std.http;

define pub const int status_valid = 200;
define pub const int status_not_found as 404;
define pub const string status_from_env = std.env.read_env("status_valid");
define const string internal_key = "not-exported";

// app.atto
import const status_valid, status_not_found as missing from "std.http";
import const status_valid as ok from std.http;
import const threshold from "./thresholds.atto";

pub fnc main(): int {
  return ok;
}
```

```ebnf
const_import_decl = "import", "const", const_import_spec, { ",", const_import_spec },
                    "from", [ "pkg" ], string, ";" ;
const_import_spec = export_path, [ "as", identifier ] ;
```

The `const` keyword after `import` is a **declaration-kind filter**, not an initializer or runtime expression. `import const * as ns` is not a valid v1 form: namespace-wide imports continue to use `import * as ns`, with typed member access for each exported symbol. An unqualified `import name from ...` retains the existing general kind-checked import semantics; `import const` explicitly requires a statically declared constant. No brace destructuring or mixed-kind list after a single `import const`.

**V1 compatibility only; for v2, [static imports v2](static-imports-v2.md) is authoritative.** Bare/quoted registered builtins use the same authenticated identity; `pkg` denotes external identity only, mixed groups and direct typed paths remain valid, and namespace aliases use `define alias`. For historical v1 package identity, `from "std.http"` is an unambiguous dotted namespace selector and is equivalent to `from pkg "std.http"` in the same resolver context. A quoted `./name.atto` or `../name.atto` denotes a file source, with existing root and path-traversal checks; `from pkg "+/name"` remains the existing explicit project-rooted package spelling. A bare non-dotted package selector still requires `pkg` (no accidental fallback to cwd/host paths). Classifying a selector must never execute imported code or inspect runtime properties. The `std.http` example is a package/namespace identity, **not** a file called `std.http`.

## File and namespace declaration rules

1. A file or declared namespace can contain unconditional top-level `define const T name = expression;` (or `as expression;`), and `define pub const T name = expression;`. `define pub` is canonical ordering. The normal `pub[pkg]` visibility boundary is preserved where that visibility spelling is admitted.
2. Top-level mutable or runtime-local bindings are forbidden, including top-level `let`, `let mut`, `val`, `val mut`, `var`, and `const mut`. `val` remains valid in local scopes but is not an alternative to a static declaration. Existing top-level callable/type declarations remain valid.
3. A file/namespace `define const` has only the initializer classes already allowed by [file-module-const-v1](file-module-const-v1.md): pure typed constexpr and the explicitly admitted, environment-permission-checked startup-once `std.env.read_env("KEY")` (or legacy `os.read_env("KEY")`) form. Arbitrary effectful initializers, implicit re-evaluation and lazy mutable globals remain prohibited.
4. Constants that expose references must provide a proven immutable/frozen view, not a mutable alias to transitive heap state; `import const` does not bypass borrow checking, actor state sealing, `Sendable`, or permissions. A `const` of a pointer/resource with unproven ownership must fail closed, not be assumed globally shareable.

## Startup environment API boundary (normative)

The two environment APIs **must not be silently unified**:

- `std.env.read_env(KEY)` (and legacy `os.read_env(KEY)`) is a **trusted static initializer form**. Its admission as a static initializer requires a `define [pub] const string` initializer, with a compile-time string key (including a pure constexpr string binding). It is neither a general runtime `std_env.get` call nor a build-time constexpr value. Existing ordinary legacy `os.read_env` calls retain their total runtime contract; this amendment does not introduce or remove ordinary runtime calls to the qualified form. A user-defined function with the same spelling is not trusted.
- The startup accessor is **total** under the existing file/module-constant contract: missing, empty/invalid, denied and unavailable keys produce `""` without throwing or raising; the permission and validity gates must run **before host-value lookup**. A denied key may never be inspected, logged, or inferred from error differences. In particular, this does **not** grant ambient access to the process environment.
- The runtime `std_env.get(KEY)` family has its own Option/Result and permission semantics: absence is distinct from an empty present value, and denial is an **error**, not fallback to absence. Refactoring static initialization through the runtime API must not accidentally change either contract.
- A compiled AOT image contains only the initializer description and constant identity, not the build host's environment values. Runtime deployment supplies an authorized immutable launch snapshot; each declaration initializes once per launch, and imported aliases reuse the value. Each separate launch of the *same binary* must observe its own authorized snapshot.
- A `pub const` is visible to authorized consumers. Exporting an environment-backed value that can contain a secret is a deliberate public-data decision and should be rejected by applicable package/security policy. Never embed the value into diagnostics, debug metadata, object files, or build artifacts.

## Static binding and linking

- Build the owning file/namespace export table first and bind an imported constant by its **declaration identity**, type, visibility and initialized-value provenance; do not synthesize a mutable variable, run a getter on each access, or dynamically read object properties.
- `import const x as y` introduces a **read-only local alias** `y` for the exported constant `x`. Assignment (`y = ...`, `y += ...`, mutable borrow, or a write through an unsafe alias) is rejected. Aliases do not re-export the constant and never change its owning package identity.
- A target must be a declared constant. A function/class/module/actor named `x` is rejected by `import const x` with `E_IMPORT_KIND`; an absent symbol with `E_UNBOUND`; inaccessible visibility with `E_PRIVATE`; colliding/duplicate local aliases with `E_DUPLICATE`.
- Compile-time constants are folded by the typed evaluator and may be referenced by dependent constexpr declarations across files/packages, preserving checked arithmetic/overflow, cycles and visibility. A runtime-once constant is *not* constexpr merely because the binding is immutable; using it in a constexpr-required expression fails.
- A startup-once environment-backed constant is initialized once per declared constant per program instance/isolated deployment unit in dependency order, before reads and actor dispatch. Importing it twice never duplicates initialization. Importing does not grant `std.env.read_env` or `os.read_env` capabilities to a denied module. No constant is baked from the build host environment into an AOT binary. The `std.env` path is resolved to the reserved standard namespace identity; user-defined lookalike functions do not gain static-initializer permission. A public environment-backed const is visible to authorized importers, so secrets should normally remain private.
- Reject dependency/initializer cycles (`E_CONST_CYCLE`) and unresolved selectors; keep any import side-effect accounting explicit for tree shaking. The package resolver may share already-initialized immutable values between authorized imports but must not expose mutable storage or leak secrets via diagnostics.
- The filename/namespace header rule remains: a `use namespace ...;` header, if present, precedes every `import`, including `import const`, and all other top-level declarations. Imports must precede ordinary declarations in v1.

A declarative `export pub const x;` or inferred `export pub x;` may expose an existing local constant **only when** the declarative-export resolver supports constant symbol kinds, with the same duplicate/visibility checks. It must not create a new mutable or runtime binding. `define pub const` is the simple direct form.

## Required positive and negative checks

| Source situation | Expected |
| --- | --- |
| `define pub const int status_valid = 200;` imported from `"std.http"` | Bind `status_valid` as immutable `int`; guest returns 200 |
| Two selected constants, aliasing, and builtin `from std.http` | Same static target identities and values |
| `import const limit from "./limits.atto";` | Resolve public file-scoped constant |
| Import a private constant in another package | `E_PRIVATE` |
| Import public `fnc` or class with `import const` | `E_IMPORT_KIND` |
| Import unknown constant name | `E_UNBOUND` |
| Two imports with same local name or collision with local const/fnc/type | `E_DUPLICATE` |
| Assign, compound-assign, or mut-borrow imported alias | Rejected before code generation |
| File/namespace top-level `let`, `val`, `var` or `const mut` | Rejected |
| `import const * as ns`, empty list, trailing comma or missing `from` | `E_SYNTAX` |
| Two-import startup-once env const, in multiple actors | Exactly one authorized runtime snapshot per program instance |
| Cross-file constexpr dependence, type mismatch, overflow, or cycle | Correct fold or deterministic compile error |
| Fully-qualified `std.env.read_env("status_valid")` in a namespace file, imported elsewhere | One startup snapshot; immutable exported string |
| Same artifact launched under different environments | Independent startup snapshots, no build-time value baked into executable |
| Denied/missing env access | Same total empty-string behavior as legacy `os.read_env`; no value leak |
| Runtime-derived key, wrong initializer return type or lookalike user function | `E_CONST` / `E_CONST_TYPE`; no implicit runtime call |
| Imported constant points to mutable or unproven shared storage | Ownership/type admission rejection |

**Evidence boundary:** A parser-only acceptance test is not a linked package or guest result. Backend implementations must separately demonstrate exact-SHA, executed positive and negative compiled-guest tests (native and browser as applicable), preserving the `passed/failed/unsupported/not executed` distinction. Implementations are independently owned by their `atto-source.*` repos; shared public semantics do not require identical library sources.
