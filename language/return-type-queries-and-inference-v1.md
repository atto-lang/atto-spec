# Return-type inference and `typeof` binding queries (v1 target)

**Status: TARGET / design contract (2026-11-16), not a compiler implementation.** No guest tests or backend parity are asserted by this document.

## Existing `typeof` semantics and migration

This proposal extends the merged Java RFC [oreslang-source.java #450](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/450) (merge commit `9d189677471398c98eb0995e15b711e1d08966ac`), and prior Java [#4](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/4).
The canonical spelling for a static binding type query is **`typeof name`**. The parenthesized spelling **`typeof(name)`** is equivalent compatibility input; formatters MUST produce `typeof name` for either. The marker spelling **`typeof! name`** is NOT a type query, is not an ownership operation, and MUST be rejected as such. This does not introduce an expression-level `typeof` operator or runtime type reflection. Do not reinterpret `typeof !T` as a binding query or erase existing type-complement meaning. Both admitted spellings must resolve to one typed `TypeQuery` AST, not a runtime call or a synthesized nominal type.

Previously proposed `type Alias = typeof foo` means the **static type of the value** `foo`; the earlier `typeof fnc(...) => T` means a **callable signature type**. Do not change either meaning. Java #1175 explicitly distinguishes `typeof cb` from callable-signature syntax; Java #1176/#1178 keep `typeof` in type position and reject runtime `typeof v == int` tests. `infer` is currently not reserved by the older Java keyword inventory and occurs in another separate proposed grammar `infer<T> struct`. Keep it **contextual**.

## Target signatures

```atto
pub fnc first(): infer {
    val tbr: int = 5;
    return tbr;
}
pub fnc second(): typeof tbr {
    val tbr: int = 5;
    return tbr;
}
pub fnc third(int x): typeof x { return x; }
// Parentheses are accepted for compatibility and format to `typeof x`.
pub fnc third_legacy(int x): typeof(x) { return x; }

fnc stringify(int v): string { return "ok"; }
type Stringifier = typeof stringify; // previous simple-name query proposal
// type Sig = typeof fnc(int) => string; // previous callable type grammar
```

- `: infer` and `-> infer` infer the callable's return type from all reachable result sites. They are allowed for `fnc`, `routine`, inline methods and out-of-line `mtd` only where the callable's existing body grammar and backend are admitted. This does **not** change the default for an omitted result annotation.
- `: typeof tbr` and `-> typeof tbr` are canonical; `: typeof(tbr)` and `-> typeof(tbr)` are equivalent compatibility input. Both specify the static type of a uniquely resolved **value binding**. They do not compute the value, check identity, manufacture a singleton/dependent value type, invoke runtime reflection, or execute its initializer.
- Preserve `typeof stringify` in type positions for the previously proposed bare simple-name query. Parenthesized `typeof(stringify)` is an equivalent target spelling, canonically formatted without grouping parentheses. `typeof fnc(...)` remains a distinct callable-type production.
- `type<tbr>` is **not** a value-type query and is invalid when `tbr` is a runtime variable. Generic type arguments are types. `typeof(call())`, `typeof(a.b)`, `typeof(x+1)`, `typeof(void)` and runtime `typeof(v) == int` are not introduced.
- `infer` must remain contextual in return annotations. Do not reserve it globally or change existing `infer<T> struct` parsing.

### Grammar (TARGET; not evidence of current parser support)

```ebnf
return_spec       = (":" | "->"), return_annotation ;
return_annotation = type_ref | "infer" | type_query ;
type_query        = "typeof", (identifier | "(", identifier, ")") ;
(* Canonical output is "typeof", space, identifier; parens are compatibility input. *)
(* "typeof!" must not be recognized as a query or as an ownership marker. *)
(* Pre-existing callable type syntax: "typeof", "fnc", ... . *)
```

The parser selects this production strictly in **type position**. The `typeof` / `fnc` path is separately reserved for callable signature types (`typeof fnc(...) => T`) and MUST NOT be interpreted as a query of a binding called `fnc`. `typeof!foo`, `typeof !foo`, `typeof()`, `typeof(a, b)` and `typeof(x + 1)` are rejected; `typeof(x)` has exactly one bare binding identifier. A malformed type annotation must not be reinterpreted as a generic specialization, expression, lambda or runtime type test. Preserve existing `: T`/`-> T` and C-brace/`::`/comma-`end` body rules without adding implicit semicolons or changing terminal-expression semantics.

## Resolution and forward-body queries

1. Resolve a query against an accessible unambiguous parameter or value binding in its lexical scope, including a fully resolved callable value; reject ambiguous overload sets and unspecialized generic callable values.
2. Additionally permit a **declaration-only forward query** of a single `val` or `const` declared **directly in the same callable's outer body block**. It must have a unique binding name. A branch-, match-, loop- or lambda-local variable, a shadowed or duplicate declaration, and a forward `let` are not admitted in v1. No forward reference to that variable's **value** becomes legal.
3. A directly declared type qualifies. An initializer-inferred forward `val` is allowed only when the initializer's type can be checked from already-resolved symbols without requiring the enclosing callable's own result, or evaluating source code. Example: `val tbr = 5;` has static type `int`. Never infer via runtime execution or host reflection.
4. Build an explicit dependency graph across signature queries, local declaration types, inferred return types and callable references. Reject all direct/indirect cycles, including `fnc f(): infer { return f(); }` and `fnc f(): typeof(tbr) { val tbr = f(); return tbr; }`. Do not resolve uncertainty to `any`, `unknown` or `void`.
5. The final static return type must be resolved **before** interfaces, exported ABI publication, overload admission, type instantiation, tree shaking, hot-load version identity, IR lowering and native/AOT codegen. A bodyless declaration cannot use `infer` without an independent externally supplied return contract.
6. A query preserves full nominal/structural type arguments, callable effects, ownership qualifiers, borrows and tenant/actor confinement. Borrowed locals may not escape even if `typeof` resolved successfully. It does not guarantee returning the particular `tbr` instance.

## Bounded, bidirectional inference engine (v1 target)

AttoLang SHOULD infer **within a lexical scope** and from **already resolved expected types**. It MUST NOT perform an unconstrained global Hindley–Milner search, speculate on overloads, run initializers, or repeatedly re-typecheck bodies until a guess succeeds. This is a language-level target, not a claim that a current backend implements it.

**Admission tiers:**

1. **Local synthesis:** `val x = expr`, `let x = expr` and `const x = expr` synthesize the initializer type once, left to right, with existing lexical binding scopes. `const` still requires compile-time-evaluable initialization; inference cannot relax that requirement. Later rebinding of a `let` cannot change its initially inferred type. For `val x: T = expr` (or type-first `val T x = expr`), propagate `T` down as an expected type and verify the checked result. No implicit `any`.
2. **Contextual checking:** known parameter/field/return types flow downward into lambdas, empty collections, `None`, `Some`, `Ok`, `Err`, and record literals; inferred expression results flow upward. A `|x| -> expression` lambda may infer `x` from a known callable parameter type, but must reject `|x| -> x` without that context. A compiler may gate individual collection constructors or generic shapes as unsupported until their normal typed lowering exists; inference MUST NOT silently accept them by erasing types.
3. **Explicit callable inference:** `: infer` (or `-> infer`) is the **opt-in** return annotation. An omitted return annotation keeps its existing meaning. Parse the body only once, gather the reachable return sites, and resolve their types using the already declared parameter and callable signatures. `infer` is not a nominal type, a runtime value, a wildcard, or permission to change effects.
4. **Boundary stability:** parameter types of named callable declarations, overloaded-call identities, imported APIs, actor messages, FFI functions and serialized/public signatures require independent type contracts where needed. Inferred public return types are allowed only after a uniquely resolved static result is frozen into the exported typed signature; changing that result changes the API/ABI. Cross-module consumers never re-infer a dependency from its implementation body.

**Deterministic constraints, not global guessing:**

- A type position with insufficient information fails at that expression. For example, `val x = None;` and `val xs = [];` have no payload/element type; `val x: Option<int> = None;` and `val xs: Array<int> = [];` are valid **target examples** when those constructors are available. `val xs: Array<Record> = [{job: 1}, {car: "str"}];` uses an explicit element supertype; inference does not invent a heterogeneous union to make an unannotated array compile.
- Numeric literals have fixed source types unless an existing explicit, checked contextual conversion applies. Return inference MUST NOT choose an overload by its hoped-for result, widen mismatched branch results, or silently wrap `T` as `Option<T>` / `Result<T,E>`. Overload resolution remains based on the language's declared arity/nominal distinctions; backtracking across return types is forbidden.
- For a lambda or generic call, use expected argument/return constraints from the known callee signature. A generic substitution must be uniquely determined by declared arguments and available expected types; unresolved, contradictory or cyclic substitutions are errors. Avoid unrestricted let-polymorphism, higher-rank inference and polymorphic recursion in v1. Cache each permitted generic specialization by canonical declaration plus concrete type arguments, and apply independent depth/count limits.
- Type resolution must preserve nominal and structural identities, mutability, ownership, region/lifetime constraints, exceptional effects and `Sendable` versus `Serializable` requirements. It must never infer a capability, extend a borrow across `await` or `select`, or turn an actor-local reference into a sendable message.
- Nonrecursive local bindings resolve in declaration order. For `: infer` signatures and forward `typeof` queries, construct **only the reachable signature-dependency subgraph**. Visit each node/edge once with memoization and a three-color DFS (or SCC detection); reject recursion involving unresolved inferred returns, including mutual recursion. Ordinary recursion with an explicit return type remains legal if otherwise well typed.
- A compiler must have deterministic, source-relative budgets for AST depth, local bindings, constraint edges, dependency depth and generic instantiations. A budget breach produces a bounded compile-time diagnostic (`E_INFER_BUDGET` or a mapped existing source-limit code), **never** a guessed type, unbounded recursion, host stack exhaustion or a partial guest artifact. The intended common-case work is proportional to the visited AST and dependency edges; no promise is made of linear cost for arbitrary generic instantiation.
- `infer` stays a **contextual** token in a callable return annotation. Locals already infer without writing `infer`; v1 does not add a mandatory `val infer x` or `val x: infer` spelling. Future local sugar can be standardized separately without changing this algorithm.

**Control-flow check:** each reachable `return e`, `^ e`, and already-defined implicit terminal value contributes to one common result type. `return;`, fallthrough and unreachable/`never` paths are differentiated; a missing value path cannot be masked by an explicit value return elsewhere. `trap` and `?` retain their existing Result/Option semantics and are not implicit type-coercion steps. Inference does not suppress borrow-check or effect-check diagnostics.

**Minimal cross-backend acceptance suite (TARGET):** local fixed-type rebinding; annotated empty `Array<T>` / `Option<T>`; unannotated empty rejection; contextual lambda and contextless lambda rejection; direct/mutual inferred recursion rejection; explicitly typed recursion acceptance; conflicting return arms; missing return path; heterogeneous record array requiring an explicit element type; `Option<Result<T,E>>` versus `Result<Option<T>,E>` preserving distinct identities; actor message escape rejection; deterministic budget rejection; same public signature after cold and incremental builds.

## Inference semantics

Every reachable explicit `return e`, supported `^ e` early return, and terminal expression of a comma/`end` function body contributes its **static type**. A reachable expression-value path must be type-compatible with every other result path under the language's ordinary checked compatibility rules. No invented union, numeric widening, `Option`/`Result` wrapping, generalized `any`, or overload-choice based on a guessed return type. A `never` path contributes no return value. If no reachable value is returned, `infer` yields `void` only if **all** reachable completions are valid void paths. Mixing bare returns, value returns, missing-return fallthrough, or incompatible types is a compile error. Static contexts do not execute effects while inferring.

For `typeof(tbr)`, every reachable return must be statically assignable to the resolved type of `tbr`. An unrelated `int` is acceptable when `tbr` is `int`; the annotation is not a proof of value identity or freshly allocated object. Public API inference requires the same deterministic result on every target and cannot depend on backend host type names.

## Error categories and required tests

Use existing diagnostic registries to map proposed categories:
`E_TYPE_INFER_AMBIGUOUS`, `E_INFER_CONTEXT`, `E_INFER_BUDGET`, `E_RETURN_INFER_AMBIGUOUS`, `E_RETURN_INFER_CYCLE`, `E_TYPE_QUERY_UNBOUND`, `E_TYPE_QUERY_SCOPE`, `E_TYPE_QUERY_AMBIGUOUS`, `E_TYPE_QUERY_UNSUPPORTED`, `E_RETURN_TYPE_MISMATCH`, `E_RETURN_PATH`.

Conformance cases must cover `typeof x` / `typeof(x)` AST equivalence and formatter idempotence, `typeof fnc` preservation, `typeof! x` and invalid expression operands as parser negatives, positive scalar, generic, parameter, callable and forward-body queries; mixed returns, early returns, void/fallthrough, local scope and shadowing, cycles and recursion, generic-vs-value arguments, `typeof fnc` compatibility, and AOT ownership/effect preservation.

**Evidence policy:** host-only source fixtures, Node/Python reference tests and parser-only acceptance do not establish actual executable support. Every Java, LLVM, .NET, Rust/Wasm and Forge status must identify a pinned commit/tree SHA, positive and negative guest compilation/execution, toolchain, nonzero test steps and PASS/FAIL/UNSUPPORTED/NOT_EXECUTED. Token-free exact-tree private carrier mirroring is acceptable for unavailable source-org GitHub Actions, with blob verification.