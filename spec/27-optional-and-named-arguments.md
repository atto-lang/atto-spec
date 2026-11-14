# 27 — Optional Types, Omittable Parameters and Named Arguments

**Status: TARGET / NOT_VERIFIED.** This is a normative language contract, not proof of Java, LLVM, .NET, Wasm or Forge guest execution. See [chapter 03](03-functions-and-effects.md) for named-call dispatch and [chapter 11](11-conformance.md) for evidence standards.

## Independent question-mark positions

| Formal | Callee type | Required at call? | Absent-slot value |
| --- | --- | --- | --- |
| `int age` | `int` | yes | invalid |
| `int? age` | `Option<int>` | yes | invalid |
| `int age? = 18` | `int` | no | checked constant `18` |
| `int? age?` | `Option<int>` | no | typed `None` |
| `int? age? = Some(18)` | `Option<int>` | no | checked explicit default |

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

## Conformance matrix and evidence

A versioned [source-free reference contract](../contracts/optional-named-parameters-v1/cases.json) checks binding shape and source provenance; its [Node test](../tests/optional-named-parameters-contract.test.mjs) is **not** parser, typechecker, compiler or guest evidence.

Actual parity requires the same canonical `.atto` fixtures compiled on Java/JVM and Graal Native Image, native LLVM, .NET Native AOT, WebAssembly and Forge (plus other enabled targets), with positive and negative parser, formatter, type, default, overload, constructor/method/interface, indirect-call, ownership, cancellation, source-order, generic and error-path cases. Verify executable tree/blob identities and real runner steps; zero-step Actions jobs, host-only models, and draft PRs do not pass the gate. Track unsupported behavior as `NOT_EXECUTED`, never silently accept degraded semantics.
