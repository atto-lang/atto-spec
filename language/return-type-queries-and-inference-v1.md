# Return-type inference and `typeof` binding queries (v1 target)

**Status: TARGET / design contract (2026-11-16), not a compiler implementation.** No guest tests or backend parity are asserted by this document.

## Existing `typeof` semantics and migration

This proposal extends the merged Java RFC [oreslang-source.java #450](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/450) (merge commit `9d189677471398c98eb0995e15b711e1d08966ac`), and prior Java [#4](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/4).
Previously proposed `type Alias = typeof foo` means the **static type of the value** `foo`; the earlier `typeof fnc(...) => T` means a **callable signature type**. Do not change either meaning. Java #1175 explicitly distinguishes `typeof cb` from callable-signature syntax; Java #1176/#1178 keep `typeof` in type position and reject runtime `typeof v == int` tests. `infer` is currently not reserved by the older Java keyword inventory and occurs in another separate proposed grammar `infer<T> struct`. Keep it **contextual**.

## Target signatures

```atto
pub fnc first(): infer {
    val tbr: int = 5;
    return tbr;
}
pub fnc second(): typeof(tbr) {
    val tbr: int = 5;
    return tbr;
}
pub fnc third(int x): typeof(x) { return x; }

fnc stringify(int v): string { return "ok"; }
type Stringifier = typeof stringify; // previous simple-name query proposal
// type Sig = typeof fnc(int) => string; // previous callable type grammar
```

- `: infer` and `-> infer` infer the callable's return type from all reachable result sites. They are allowed for `fnc`, `routine`, inline methods and out-of-line `mtd` only where the callable's existing body grammar and backend are admitted. This does **not** change the default for an omitted result annotation.
- `: typeof(tbr)` and `-> typeof(tbr)` specify the static type of a uniquely resolved **value binding**. They do not compute the value, check identity, manufacture a singleton/dependent value type, invoke runtime reflection, or execute its initializer.
- Preserve `typeof stringify` in type positions for the previously proposed bare simple-name query. Parenthesized `typeof(stringify)` is an equivalent target spelling. `typeof fnc(...)` remains a distinct callable-type production.
- `type<tbr>` is **not** a value-type query and is invalid when `tbr` is a runtime variable. Generic type arguments are types. `typeof(call())`, `typeof(a.b)`, `typeof(x+1)`, `typeof(void)` and runtime `typeof(v) == int` are not introduced.
- `infer` must remain contextual in return annotations. Do not reserve it globally or change existing `infer<T> struct` parsing.

### Grammar (TARGET; not evidence of current parser support)

```ebnf
return_spec       = (":" | "->"), return_annotation ;
return_annotation = type_ref | "infer" | type_query ;
type_query        = "typeof", "(", identifier, ")" ;
(* Historical simple-name type query: "typeof", identifier. *)
(* Pre-existing callable type syntax: "typeof", "fnc", ... . *)
```

The parser selects this production strictly in **type position**. A malformed type annotation must not be reinterpreted as a generic specialization, expression, lambda or runtime type test. Preserve existing `: T`/`-> T` and C-brace/`::`/comma-`end` body rules without adding implicit semicolons or changing terminal-expression semantics.

## Resolution and forward-body queries

1. Resolve a query against an accessible unambiguous parameter or value binding in its lexical scope, including a fully resolved callable value; reject ambiguous overload sets and unspecialized generic callable values.
2. Additionally permit a **declaration-only forward query** of a single `val` or `const` declared **directly in the same callable's outer body block**. It must have a unique binding name. A branch-, match-, loop- or lambda-local variable, a shadowed or duplicate declaration, and a forward `let` are not admitted in v1. No forward reference to that variable's **value** becomes legal.
3. A directly declared type qualifies. An initializer-inferred forward `val` is allowed only when the initializer's type can be checked from already-resolved symbols without requiring the enclosing callable's own result, or evaluating source code. Example: `val tbr = 5;` has static type `int`. Never infer via runtime execution or host reflection.
4. Build an explicit dependency graph across signature queries, local declaration types, inferred return types and callable references. Reject all direct/indirect cycles, including `fnc f(): infer { return f(); }` and `fnc f(): typeof(tbr) { val tbr = f(); return tbr; }`. Do not resolve uncertainty to `any`, `unknown` or `void`.
5. The final static return type must be resolved **before** interfaces, exported ABI publication, overload admission, type instantiation, tree shaking, hot-load version identity, IR lowering and native/AOT codegen. A bodyless declaration cannot use `infer` without an independent externally supplied return contract.
6. A query preserves full nominal/structural type arguments, callable effects, ownership qualifiers, borrows and tenant/actor confinement. Borrowed locals may not escape even if `typeof` resolved successfully. It does not guarantee returning the particular `tbr` instance.

## Inference semantics

Every reachable explicit `return e`, supported `^ e` early return, and terminal expression of a comma/`end` function body contributes its **static type**. A reachable expression-value path must be type-compatible with every other result path under the language's ordinary checked compatibility rules. No invented union, numeric widening, `Option`/`Result` wrapping, generalized `any`, or overload-choice based on a guessed return type. A `never` path contributes no return value. If no reachable value is returned, `infer` yields `void` only if **all** reachable completions are valid void paths. Mixing bare returns, value returns, missing-return fallthrough, or incompatible types is a compile error. Static contexts do not execute effects while inferring.

For `typeof(tbr)`, every reachable return must be statically assignable to the resolved type of `tbr`. An unrelated `int` is acceptable when `tbr` is `int`; the annotation is not a proof of value identity or freshly allocated object. Public API inference requires the same deterministic result on every target and cannot depend on backend host type names.

## Error categories and required tests

Use existing diagnostic registries to map proposed categories:
`E_RETURN_INFER_AMBIGUOUS`, `E_RETURN_INFER_CYCLE`, `E_TYPE_QUERY_UNBOUND`, `E_TYPE_QUERY_SCOPE`, `E_TYPE_QUERY_AMBIGUOUS`, `E_TYPE_QUERY_UNSUPPORTED`, `E_RETURN_TYPE_MISMATCH`, `E_RETURN_PATH`.

Conformance cases must cover positive scalar, generic, parameter, callable and forward-body queries; mixed returns, early returns, void/fallthrough, local scope and shadowing, cycles and recursion, generic-vs-value arguments, `typeof fnc` compatibility, and AOT ownership/effect preservation.

**Evidence policy:** host-only source fixtures, Node/Python reference tests and parser-only acceptance do not establish actual executable support. Every Java, LLVM, .NET, Rust/Wasm and Forge status must identify a pinned commit/tree SHA, positive and negative guest compilation/execution, toolchain, nonzero test steps and PASS/FAIL/UNSUPPORTED/NOT_EXECUTED. Token-free exact-tree private carrier mirroring is acceptable for unavailable source-org GitHub Actions, with blob verification.