# Tuple destructuring bindings, element mutability and root aliases — v1

**Status:** accepted **target syntax** for AttoLang, 2026-11-18. This document is normative for new implementations but is NOT a claim that any compiler currently parses or executes these forms. Compiled-guest conformance and ownership verification remain required.

## Recommended spelling

```atto
let (a, r, mut j) = fixtures();
let (a, val r, val mut j) = fixtures();
let (a, const r, mut j) = constexpr_tuple();
(let a, val r, let mut j) = fixtures();
let (a, r, mut j) as foo = fixtures();          // foo inherits let
let (a, r, mut j) as val foo = fixtures();      // runtime, non-rebindable root
let (a, r, mut j) as const foo = (1, 2, 3);  // constexpr root
```

Prefer the **outer binding kind with element-specific overrides**. The fully explicit parenthesized declaration is accepted as an alternative but is not the formatter default. The binding pattern is distinct from the tuple **expression** `(x, y, z)` and from sequence expressions `seq(x,y,z)` and `(> x,y,z)`; commas are separators, never implicit sequencing.

## Grammar (v1 flat patterns)

```ebnf
tuple_bind_stmt  = binding_kind, tuple_binders, [root_alias], "=", expression, terminator
                 | tuple_binders_explicit, [root_alias], "=", expression, terminator ;
binding_kind     = "let" | "val" | "const" ;
tuple_binders    = "(", [tuple_item, {",", tuple_item}, [","]], ")" ;
tuple_binders_explicit = "(", explicit_item, {",", explicit_item}, [","], ")" ;
tuple_item       = "_" | [binding_kind], ["mut"], binder ;
explicit_item    = "_" | binding_kind, ["mut"], binder ;
binder           = IDENT, [":", type_ref] ;
root_alias       = "as", [binding_kind], IDENT ;
```

A modifier omitted on an element inherits the outer binding kind. `mut` alone inherits the outer kind, e.g. `let (mut j)` means `let mut j`, while `val (mut j)` means `val mut j`. An explicit element modifier overrides *only* the inherited binding kind. `mut` is an independent request for referent-write authority. `(let a, val r, let mut j) = e` is legal without an outer kind; `(a, r, mut j) = e` is not a declaration. A binder may have a `name: Type` annotation; the syntax does not implicitly create a type-first shorthand in tuple patterns.

Use `(x,)` for a one-element tuple and `()` for zero elements. A single binding written as `let (x) = e` or `(let x) = e` is invalid: a singleton tuple pattern requires the trailing comma, exactly like a singleton tuple expression. For v1, tuple binding patterns are flat: nested patterns, rest spread and pattern-matching guards require separate proposals. `_` discards exactly one element. `as foo`, `as let foo`, `as val foo` or `as const foo` follows the closing parenthesis and precedes `=`; `let (...) = e as foo` has **no** tuple alias meaning.

## Binding semantics

- Evaluate the initializer **exactly once** in source order, typecheck the tuple shape, and check **exact arity** (including singleton and empty tuples) before introducing any bindings. Each successful binder receives its corresponding element in position order. Never evaluate `fixtures()` separately for each element.
- `let` permits reassignment of its local name; `val` prohibits it. Neither grants referent writes unless `mut` is specified. `let mut` and `val mut` grant requested writable-referent access only when ownership, loans, visibility, final fields, and actor isolation permit it.
- `const` is non-rebindable and requires a compile-time-constant initializer. In v1, **the entire destructured tuple initializer must be proven constexpr** before any element is admitted as `const`; a runtime call returning a stable tuple is *not* constexpr. The file/module-only `define const os.read_env` exception does not extend to local destructuring.
- `const mut` is legal only when a constexpr initializer permits safe separate materialization of a writable, non-scalar referent with no mutable alias back to the constant. `const mut` on `int`, `bool`, `string` and other scalar values fails with `E_CONST_MUT_TARGET`. A compiler that cannot prove materialization must reject, not silently downgrade to `val mut`.
- A bare `mut` on a scalar element may be parsed but grants no extra scalar mutation power; its local name's rebindability comes from `let` or `val`. `val mut int j` still cannot be rebound.
- Without `as foo`, destructuring an **owned** tuple moves non-Copy elements to independent local bindings and copies Copy elements under normal language rules. A borrowed tuple cannot be split into owners by destructuring; checked loans or an explicit supported `copy!`/`copy!!` operation are required. No implicit deep copy or cross-actor sharing occurs.
- Duplicate binding names, including a root alias conflicting with an element, are errors. A failed pattern match or typing/provenance check introduces **none** of the names. Names follow ordinary lexical scope and shadowing rules.

## Whole-tuple alias: `as foo` / `as val foo` / `as const foo`

```atto
let (a, r, mut j) as foo = fixtures();           // foo is let
let (a, r, mut j) as let foo = fixtures();       // same, explicit
let (a, r, mut j) as val foo = fixtures();       // runtime immutable binding
let (a, r, mut j) as const foo = (1, 2, 3);    // compile-time immutable binding
```

An unqualified `as foo` **inherits the outer tuple binding kind** (e.g. `let (...) as foo` means `as let foo`; `val (...) as foo` means `as val foo`). A qualified root alias explicitly overrides the outer binding kind. When the tuple binder list uses the fully explicit parenthesized form without an outer kind, the alias must also be qualified (`(let a, val b) as val foo = e`); an unqualified `as foo` in that form is rejected as ambiguous. `as const foo` requires the **entire initializer tuple** to be proven compile-time evaluable, even if individual element binders are `let`/`val`. Thus `let (a,r,mut j) as const foo = fixtures()` fails when `fixtures()` is an ordinary runtime call; prefer `as val foo` for a runtime non-rebindable alias. The file/module `define const os.read_env` exception does not apply here.

The alias always serves as a **single owned root anchor**, not a copy, snapshot, or duplicate ownership of the tuple. For a `let` root, reassignment is permitted only when the borrow checker proves no live component loan or other incompatible use; rebinding terminates the original root's lifetime and never retargets existing loans. `val` and `const` roots cannot be rebound. The RHS is evaluated once into `foo` and the component names are checked projections of this single root. Copy-valued projections may become independent local copies; non-Copy projections are **loans rooted in `foo`**, rather than duplicate owners. A `mut` projection requests an exclusive loan for that element; the borrow checker enforces disjointness and non-lexical last-use lifetimes. Moving or reading the entire `foo` while an incompatible exclusive element loan is live must fail; disjoint element reads are permitted only where the compiler proves non-overlap. Taking an element requires a checked partial move and invalidates incompatible whole-tuple access.

Rebinding a `let` component changes that local variable, **not** the corresponding element inside `foo`; the previous loan ends according to checked lifetime rules. Mutating a referent through `mut j`, when proven safe, updates the same object retained under the owning tuple. The alias never bypasses actor isolation, sealed state, const guarantees, or borrow rules. If a backend cannot represent the anchored loans and partial-move checks safely, it MUST report `E_UNSUPPORTED` rather than clone objects, create mutable aliases or emit guest code.

## Required diagnostics and tests

Positive target cases: ordinary `let` tuple; mixed `let`/`val`/`mut`; `val mut` object referent; fully explicit spelling; singleton/empty tuple; discard; tuple alias with single RHS evaluation; constexpr tuple with `const` member; non-overlapping loans. Negative cases: runtime `const` member; scalar `const mut`; wrong arity; duplicate and alias-colliding binders; bare unqualified parenthesized binder; attempted rebind of `val`/`const` root alias; attempted rebind of `let` root while an element loan remains live; runtime `as const` root; immutable referent write; moved-owner use; mutable alias overlap; use of whole `foo` during an active exclusive element loan; unsupported nested/rest syntax; attempted implicit deep copy.

Compiler/parser admission, source formatter round-trips, typed ownership checks, actual native/Wasm guest execution, and independent Java/LLVM/.NET/Forge/other backend parity must be reported separately with exact source SHA, tree, runtime/toolchain and pass/fail/unsupported/not-executed evidence. A host registry check is **not** compiled-guest evidence.
