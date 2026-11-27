# 27 — Optional Types, Omittable Parameters and Named Arguments

**Status: TARGET / NOT_VERIFIED.** This is a normative language contract, not proof of Java, LLVM, .NET, Wasm or Forge guest execution. See [chapter 03](03-functions-and-effects.md) for named-call dispatch and [chapter 11](11-conformance.md) for evidence standards.


## V2 proposed migration: independent None and omission defaults (2026-11-27)

**Status: TARGET / NOT_VERIFIED.** Language-owner decisions recorded here; integration rules below are proposed and require independent review. The remainder of this chapter is the V1 contract, retained for legacy modules. V2 supersedes V1 default syntax and provenance only after an explicit profile/ABI migration. Do not reinterpret old compiled signatures.

| Type-first | Name-first | Meaning |
| --- | --- | --- |
| `int? x` | `x: int?` | Required Option<int> |
| `int? x?` | `x?: int?` | Omittable Option<int>, implicit omitted value None |
| `int x? ??= 10` | `x?: int ??= 10` | Omittable scalar |
| `int? x ?= 3` | `x: int? ?= 3` | Required Option with None fallback (`??` alias) |
| `int? x? ?= 3 ??= 4` | `x?: int? ?= 3 ??= 4` | Independent None and omission defaults |

`T?` is exactly `Option<T>`; formal-name `?` marks omittability. Both declaration orders are canonical and mixed order is legal. `?=` is the preferred formal-default spelling for explicitly supplied outer None; `??` remains a semantically identical alias in formal clauses. `??=` handles absent/omitted input. These are not assignments. Match contiguous operators; never split `?=`, `??` or `??=` across whitespace/comments. A mixed `?=` and `??` clause is a duplicate None fallback, not two distinct defaults. Preserve type-position `T?`, formal-name `x?`, postfix expression propagation `value?`, optional member access `?.`, optional checked cast `as?` and ternary `? :`. Standalone `?=` is a proposed nonmutating expression alias and requires its own grammar/effect qualification; this formal-clause change does not enable it. In V2 formal declarations, require explicit name-level omission marker for `??=` (proposed integration rule); reject bare `=` as a default delimiter, duplicate clauses, reverse clause order, non-Option None fallback and scalar omittable declarations without an omission default. Legacy `Option[T]` is a compiler warning with a suggested `Option<T>` fix, not a distinct type. Contextual payload-to-Some lifting in a default clause is proposed only when the expected Option type is unambiguous; no implicit lifting at call boundaries, no recursive/nested coercion. Explicit Some/None defaults remain legal. Parenthesize nested top-level fallback expressions to avoid delimiter ambiguity.

```atto
define fnc Option<int> • foo(x?: int? ?= 3 ??= 4) {
    if x is omitted do
        stdio.out.write("omitted");
    fi
    return x;
}
```

| Input | Bound value | x is omitted |
| --- | --- | --- |
| omitted, omit, _ | Some(4) | true |
| supplied None | Some(3) | false |
| supplied Some(0) | Some(0) | false |
| supplied Some(4) | Some(4) | false |

Exactly one branch is selected from the ORIGINAL input. If the omission default yields None, it does not trigger the None fallback. An omitted Option with no omission clause binds None, without invoking the None fallback. Only outer None triggers the None default. `Some(None)`, zero, false and empty values are not None. Preserve syntactic absence versus explicit hole in checked call metadata. `x is omitted` is a boolean predicate on original formal binding provenance, even after default resolution; proposed V2 boundary: permit on omittable formals, reject on unrelated locals/fields or out-of-scope bindings. No extra Option variant, no mutation, no undeclared-variable fallback. Forwarding resolved x normally supplies its value; omission does not silently propagate. Explicit capture/forwarding of provenance requires separate proof.

Standalone `const x = y ?? Some(3) ??= Some(4);` uses the same independent branches where y has proven presence information; ordinary Option alone cannot represent omission. Reject omission fallback on an ordinary value without presence information, and reject undeclared y. General presence-bearing values and provenance escape are separate implementation gates.

### Overload resolution

Normalize source spelling and types before duplicate signature checking. Same owner/name/type vector (and existing generic signature identity) cannot be distinguished by labels, defaults, omittability, return type alone or declaration spelling. Keep receiver separate from caller-visible arity. First determine compatible candidates using checked slot binding and actual supplied types, ignoring default values; no implicit Some. A unique type-compatible complete-arity candidate wins over omission-dependent candidates, subject to existing nominal specificity rules (proposed V2 ranking: complete-arity tier first, then ordinary specificity within tier). If no complete candidate, require a unique compatible winner under ordinary specificity; do not rank by default value or number of omitted slots. Labels bind slots, not overload keys; never use labels alone to rescue an otherwise ambiguous family. No positional shifting. Preserve named-call source order; this chapter retains V1 runtime labels `name: expr` pending reconciliation with any separate equals-label proposal.

Overlapping arity ranges may coexist when normalized signatures differ; reject ambiguous CALLS rather than blanket-rejecting every overlapping interval (V2 proposed refinement). For `foo(x?: int? ?? 3 ??= 4)` and `foo(x?: string? ?? "bar" ??= "star")`, foo() and untyped foo(None) are ambiguous; typed None and Some select their nominal Option type. A type-incompatible exact-arity candidate cannot win. Reject duplicates even when only one is omittable. Reject nontrailing omissions without explicit hole or correct named binding.

### Lowering and evidence

Select overload statically before evaluation. Evaluate receiver then supplied expressions once in source order; resolve selected defaults once in formal order under the correct declaration execution/ownership context. Initial executable slice retains V1 closed, pure, non-suspending defaults. Computed earlier-formal defaults and suspension/actor defaults require independent effect/ownership gates; forward/self references reject. Keep original presence and outer Option discriminant distinct until branch selection; retain provenance only where observed or required by stable dispatch ABI. Do not fabricate an Option payload, implicitly move an omitted slot, allocate a dictionary, or block scheduler threads. ABI versioning must cover function references, virtual/trait/interface methods, actor messages, native exports and hot reload; no silent fallback on unsupported surfaces.

All fnc/mtd/routine, constructor, lambda, mixed formal order and return-signature forms need positive/negative compiled guest tests. Preserve v1 fixtures and version new ones. Exact-head/tree, stepful execution, independent review and identical guest inputs are required; reference models are not compiler parity.

## Independent question-mark positions

| Formal | Callee type | Required at call? | Absent-slot value |
| --- | --- | --- | --- |
| `int age` | `int` | yes | invalid |
| `int? age` | `Option<int>` | yes | invalid |
| `int age? = 18` | `int` | no | checked constant `18` |
| `int? age?` | `Option<int>` | no | typed `None` |
| `int? age? = Some(18)` | `Option<int>` | no | checked explicit default |

## Equivalent formal declaration orders

AttoLang admits **two equally normative declaration spellings**; one is
not an obsolete, erased, or lower-priority compatibility form. Both lower to
the **same** parameter name, resolved type, name-level `omittable` bit,
type-position `Option<T>` sugar bit, and unevaluated default expression.

| Type-first | Name-first | Semantics |
| --- | --- | --- |
| `int x` | `x: int` | required `int` |
| `int? x` | `x: int?` | **required** `Option<int>` |
| `int y? = 10` | `y?: int = 10` | omittable `int`, default `10` |
| `int? z?` | `z?: int?` | omittable `Option<int>`, default `None` |
| `int? z? = Some(5)` | `z?: int? = Some(5)` | omittable Option, checked default |
| `Option<int>? nested?` | `nested?: Option<int>?` | omittable nested Option |

In the name-first form, `?` **before** `:` belongs to the formal *name*,
and `?` **after** the type belongs to its *type*. `x: int??` must not be
reinterpreted as `x?: int?`; reject the malformed suffix rather than
silently moving the omission marker. A default with `x: int = 5`
also fails because the name has no `?`. Mixed declaration styles in one
formal list are allowed; duplicate names still fail.

```atto
fnc calculate(x: int, y?: int = 10, z?: int?): int {
  return x + y;
}

pub fnc main(): int {
  return calculate(x: 20, y: 22); // expected exit 42
}
```

The illustrative guest program above is **target syntax**, not evidence that
any backend currently executes defaulted or named calls. The signature is
equivalent to `fnc calculate(int x, int y? = 10, int? z?)`.
The formatter must preserve semantics and lexical call argument evaluation
regardless of its chosen output styling. Prefer round-tripping the user's
selected formal declaration order if the frontend retains source spelling.

**Type-position suffix `?` is exactly `Option<T>` sugar**: `T?` and `Option<T>` have the same nominal source type, ownership, layout, ABI, matching and inference semantics. An `Option<T>` argument does not become omittable because its *type* is optional. `T?` is valid wherever a type reference is admitted (including fields, local declarations, results, generic type arguments, type aliases, array elements and formals). Nested types can be written `Option<T>?` (`Option<Option<T>>`) or explicitly `Option<Option<T>>`; an unproven compact `T??` spelling must fail closed. Never substitute nullable host references or implicitly construct `Some` when only an ordinary `T` is supplied: existing explicit `Some(value)` / `None` semantics apply.

**Formal-name suffix `?` is only legal on a *value-parameter declaration*** (function, method, constructor, and other statically verified callable signatures). It is a compile-time omittable-slot bit, not a type suffix, nullable local variable, postfix propagation, conditional operator or runtime argument value. `let int age?`, `obj.age?` and named generic type parameters `<T?>` must never acquire "omittable parameter" meaning.

A non-Option `T name?` **MUST** declare a well-typed, compiler-admitted default; otherwise declaration is rejected. `T? name?` may omit a default and then synthesizes typed `None`. If a default is explicitly supplied on `T? name?`, that default wins. At the v1 implementation gate defaults must be compile-time deterministic, non-suspending, effect-free values evaluated under the declaration's type environment; no hidden runtime callback, ambient capture, mutable state, allocation side effect or borrow is created. Later runtime-dependent defaults require a separate evaluation/ownership contract. A default is *not* executed for a supplied slot.

```atto
fnc describe(string name, string? nickname, int retries? = 3, string? city?) -> string ::
  return name
end

describe("A", None)                                // legal: retries=3, city=None
describe("A", Some("Ace"), city: Some("Lima"))     // legal
describe(name: "A", nickname: None, retries: 5)     // legal
// describe("A")                  // ERROR: required nickname missing
// describe("A", "Ace")           // ERROR: string is not Option<string>
// describe("A", None, 5, "Lima")  // ERROR: city requires Option<string>
```

The example is **illustrative source**; no backend is certified by this document.

## Named runtime arguments versus named generic types

Runtime call items use **`label: expression`**. Generic type arguments use **`Name=Type`**. The two name spaces are not interchangeable. `f(x = 2)` must not be silently interpreted as `f(x: 2)`; assignments, record fields, actor mail and named metadata are not named argument calls. Names match the statically resolved formal labels exactly and case-sensitively; changing an inherited/public formal label is a source-level compatibility break.

A positional prefix may be followed by named items. Once any named item appears, later positional items are rejected, except the separately verified *single final trailing closure* rule. A named item may target a nontrailing omittable formal; later required formals can be supplied by name without positional shifting. The callee/receiver is evaluated once, then supplied argument expressions are evaluated once **in original source order**, including named reordering; only then are temporary values permuted to formal-order ABI slots. Failed static binding emits no executable IR and evaluates no expression. The full formal ABI arity remains stable.

```atto
fnc combine(int a? = 10, int b, int? c?) -> int ::
  return a + b
end

combine(b: 2)                   // a=10, b=2, c=None
combine(omit, 2, None)          // same; positional hole consumes a
combine(_, 2, None)             // same; _ is contextual omission
combine(b: 2, a: 8)             // a=8, b=2, c=None
// combine(2)                   // ERROR: positional 2 binds a; b is missing
// combine(a: 8, 2)             // ERROR: positional after named
// combine(b: 2, b: 3)          // ERROR: duplicate label
// combine(omit, omit)          // ERROR: cannot omit required b
```

Bare `omit` and `_` are **standalone call-item markers**, not expressions. They consume an omittable fixed formal and evaluate nothing. `None` is an evaluated, supplied `Option<T>` value, not a syntactic omission. A syntactically absent slot, an explicitly omitted slot and an explicitly supplied `None` must remain distinguishable in the call plan's source-provenance metadata. Rest/variadic formals may not be implicitly omitted and do not accept a hole; named-rest and named-plus-spread require separate proved support.

## Parsing, binding and safety requirements

1. Parse `?` by grammatical context. In a type position, consume one trailing type suffix and lower into `Option<T>` before nominal typechecking. On a *formal identifier*, consume a separate suffix and attach `omittable` metadata. Preserve the two flags separately and preserve source spans. In expression position retain existing postfix `value?` propagation and ternary `condition ? yes : no`.
2. Validate declaration formals: unique labels, legal defaults, no hidden `self`/receiver collision, correct default type/visibility, no unsupported mutable/borrow/structural omission, and stable interface/override labels. A required `Option<T>` stays required. Do not infer defaults from zero, null or host language optional parameters.
3. Resolve a callable using its standard owner, generic and nominal/arity policy. Labels cannot rescue ambiguous overloads. Optional arity intervals must not turn one call into two viable overloads; ambiguous candidates are compile-time errors. Bind argument item indices to unique formal indices *before* effect, ownership or lowering passes.
4. Reject unknown/duplicate labels, positionals after labels, positional/named collisions, omission of required or rest formals, malformed omissions with expression payloads, missing required formals, wrong types and non-static named targets. Do not partially publish a compiled specialization on failure.
5. Preserve the original call-item index, evaluated-expression index and formal index separately. Validate each supplied expression exactly once, in lexical order, including exceptions, cancellation, moves, borrows, effects and suspended execution. Defaults and typed `None` occupy ABI slots without masquerading as evaluated source expressions.
6. Formatter round-trips both question-mark positions, label spelling, named order, contextual omission and source spans without changing evaluation order. Generic `T=Type` syntax is independent of call `name: expr` binding. A backend lacking these semantics must reject the source before emission.

## Normative precedence and versioned legacy compatibility (2026-11-16)

**This chapter is the sole authority for the proposed new AttoLang parameter-presence contract.** The independent `T?` type suffix and formal `name?` omission marker here supersede the *historical source semantics* in LLVM `contracts/v1/OPTIONAL_PARAMETERS_V1.md` and Java/LLVM staged `contracts/v3/PARAMETER_PRESENCE_DEFAULT_ARG_VALS_V1.md` for **new-mode** source. Those historical documents remain versioned reference experiments; they do not silently change old source modules, serialized signatures or already-compiled code. The compiler must pin a contract version and reject incompatible imports/hot reload until explicit migration can be proved.

- New-mode `T? x` is a **required** `Option<T>` slot. It stays required even if a declaration has `@DefaultArgVals(x: ...)`, unless the formal is independently marked `x?`.
- New-mode `T x?` requires a type-checked deterministic default. If `@DefaultArgVals` is implemented, it may **supply a default for an independently omittable `name?` formal only**. It does not grant omission to a required formal or overwrite a per-formal default, even when values match. Its runtime use remains fail-closed until default, effect/ownership, source-order and full-arity ABI proof exists.
- New-mode `T? x?` omits to a type-checked explicit default or typed outer `None`. An explicit supplied `None` never triggers the default.
- The historical LLVM v1 interpretation of `T? x` as itself omittable and implicit supplied `T -> Some(T)` boundary lifting are **not** the new-mode language semantics. A plain `T` actual for `Option<T>` is rejected, whether the formal is required or omittable; callers must supply `Some(v)` or `None`.
- A compiler that cannot implement a target-language case must report a stable **unsupported** diagnostic before artifact publication, not silently treat unsupported as a normative invalidity. Tests must distinguish `CANONICAL_REJECT` from `CANONICAL_ACCEPT_BUT_BACKEND_UNSUPPORTED`.

The [byte-pinned Rust/Wasm guest candidate corpus](../contracts/optional-named-parameters-v1/guest-rust-slice-v1/manifest.json) extends the independent source-free call-binding shapes with ten executable positives and seven rejection cases; files share their exact Git blob SHA with [Rust/Wasm implementation PR #225](https://github.com/atto-lang/atto-source.rs/pull/225). The [host-only fixture integrity test](../tests/optional-named-executable-fixture-integrity.test.mjs) proves only byte identity and manifest integrity. The bounded Rust/Wasm compiler and guest execution passed [exact-tree private CI run #43935949194](https://github.com/cliptown/cliptown-e2e/actions/runs/43935949194) at source head `b0a79f68ce36a79623703f2836d815760b391567`, Git tree `cb80b007252d08fd6a2d3a25717d6b11f686c8ef`. This is NOT Java/LLVM/.NET/Forge, generic, named, or default-argument ABI parity.

## Conformance matrix and evidence

A versioned [source-free reference contract](../contracts/optional-named-parameters-v1/cases.json) checks binding shape and source provenance; its [Node test](../tests/optional-named-parameters-contract.test.mjs) is **not** parser, typechecker, compiler or guest evidence.

Actual parity requires the same canonical `.atto` fixtures compiled on Java/JVM and Graal Native Image, native LLVM, .NET Native AOT, WebAssembly and Forge (plus other enabled targets), with positive and negative parser, formatter, type, default, overload, constructor/method/interface, indirect-call, ownership, cancellation, source-order, generic and error-path cases. Verify executable tree/blob identities and real runner steps; zero-step Actions jobs, host-only models, and draft PRs do not pass the gate. Track unsupported behavior as `NOT_EXECUTED`, never silently accept degraded semantics.
