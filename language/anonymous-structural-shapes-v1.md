# Anonymous structural shape types — candidate extension v1

**Status: PROPOSED semantics, NOT a compiler/runtime parity claim.** This extends [structural-tilde-v1.md](structural-tilde-v1.md) and does not relax its verified class-only compiler subset. Existing explicit `~Type` and `structural Type` remain aliases.

## Decision: bare braces in TYPE position imply an open structural row

A nonempty `{field: Type, ...}` in a type position is structural by default and is exactly equivalent to `~{field: Type, ...}` and `structural {field: Type, ...}`. The row is **open** for checking: extra accessible fields are permitted. It is **not** a Map or Record constructor. A nominal `Point` without `~` remains nominal. `~ Point`, `~Point` and `structural Point` use the accessible structural view of that declared type.

```atto
fnc length_squared(~Point p): int { return p.x * p.x + p.y * p.y; }
routine length_squared_alt(p: structural Point): int { return p.x * p.x + p.y * p.y; }
fnc inspect({foo: string} p): int { return 1; }
routine exact(p: {foo: "dog"}): int { return 1; }
define class Service as
    evaluate(p: {foo: string | int}): int { return 1; }
end
```

These are **target examples**, not currently executable Rust/Wasm function calls. The compiler must retain the full shape type in its checked type IR and must not collapse `{foo:"dog"}` to `{foo:string}` or silently lower it as an ordinary class pointer.

## Field type operators

- `foo: string`: required readable field whose static type is assignable to `string`; extra fields allowed.
- `foo: "dog"`: **singleton/literal type**, requiring proof that the field is always exactly the string `"dog"`. `foo: 42`, `foo: true`, and `foo: -1` are analogous literal types. A class default initializer does **not** imply a singleton field type if the field can subsequently change.
- `foo: string | int`: required field with a union type; either arm is accepted. If the declared field is `string | int`, the body sees the union and must narrow it before type-specific operations. A `string` field conforms because `string` is a subtype of `string | int`.
- `foo: {bar: bool}`: nested structural shape (bounded, checked recursively). Cycles require a graph-aware structural type check, not unbounded recursion.
- `foo: _`: **not a type** in v1. A wildcard after `:` is supported in **value-pattern** position (`on {foo: _}`) and only checks field presence. In a type position use an explicitly defined safe top type in a later proposal; do not inject implicit `Any`.
- `foo?: T` in a **value pattern** allows absence and otherwise requires a match. Optional fields in a **type shape** remain out of scope in this extension until their presence/read type is formalized. `{foo?: string}` as a formal rejects rather than silently becoming an optional pattern.

Literal types require typed equality (string contents, not pointer identity). Mixed numeric variants, null-like values, NaNs, mutable aliases, and rich/composite literals need explicit equality rules before admission.

## Static admission matrix

| Source | `{foo: string}` | `{foo: "dog"}` |
| --- | --- | --- |
| Class with public `foo: string` | yes, read-only loan | no, unless singleton guaranteed |
| Record or anonymous record with immutable `foo: "dog"` | yes | yes |
| Concrete struct with accessible `foo: string` | yes, via checked view | no, unless singleton guaranteed |
| Map with compile-time **guaranteed key** `"foo"` of type string | yes, via key witness | only if guaranteed value |
| Ordinary `Map<string,string>` without a key-presence proof | **no static admission** | no |
| Opaque/dynamic map, `Any`, untrusted/foreign value | runtime checked pattern/projection only | runtime checked exact value |

A record is structurally typed by default; a struct remains a **concrete closed layout** as a value type but may project a *read-only structural view* into an open-row formal. The conversion must not discard its concrete nominal/ownership identity. Class method/getter names are not fields. Private, protected, sealed actor state, capability-restricted, and effectful getters never satisfy a public shape. For dynamically indexed maps, read by an immutable single-lookup snapshot and use key-presence semantics; `null` is a present value, not an absent key.

Static readonly admission requires a provable layout/key witness, public visibility, compatible **covariant read** types, and valid lifetime/ownership. Mutable write projection is **not automatically safe**: writing `int` into a source field declared `string | int` is not valid merely because an `int` read arm matched. Reject mutable projection unless an invariant/exclusive proof is separately established.

## Runtime matching and narrowing

```atto
match candidate over
    on {foo: "dog"} as val p -> { use_exact(p); }
    on {foo: _} as val p -> { use_present(p); }
    on _ -> { fallback(); }
end

match candidate over
    on is {foo: string} as val p -> { consume_string(p.foo); }
    on is {foo: int} as val p -> { consume_int(p.foo); }
    on _ -> { fallback(); }
end

match candidate over
    on {foo?: "dog", status: _} as val p -> { process(p); }
    on _ -> { fallback(); }
end
```

Here bare `on {...}` is an anonymous **value pattern** (same AST as `on ~{...}`); `on is {...}` is a **type-refinement test** (same as `on is ~{...}`). `on {foo: "dog"}` and `on is {foo: "dog"}` may test the same literal at runtime, but their AST kind and the type/refinement proof they produce are distinct. `on {foo: string}` without `is` is a **type-name-in-value-pattern error**, not an implicit type test. A field named `foo` must exist for a non-optional pattern, `_` accepts any present value, and a literal enforces typed exact equality. Extra fields are ignored, all specified constraints are conjunctive, and pattern subjects are evaluated once.

A runtime match on `Map<string,string>` is allowed *only after* a checked shape test establishes the key and its type. For a projected view, capture validated fields/loans atomically or ensure a stable snapshot; do not validate a mutable key and then read a different value (TOCTOU). Reflection/dynamic maps require a specified safe adapter; this is not a green light to inspect private fields or call getters. The narrowing applies only within the matched arm; outside it, the source retains its original type. A `string | int` field cannot be used as an `int` until it has been narrowed or a total common operation is selected.

## Compiler obligations and gates

1. Parser: contextual bare `{...` in **type** positions; optional `~` synonym; a distinct `ShapeType` with fields/literal/union members, versus `ValueShapePattern` in a match arm.
2. Type checker: finite, memoized `ShapeWitness` with origin, public field/key evidence, read-only capability, ownership lifetime and union/singleton constraints; reject missing keys and writable/invariant loopholes.
3. Lowerer: a checked borrowed projected-shape descriptor or statically resolved field access, **not** a cross-nominal pointer cast; dynamic map adapter only after atomic/snapshot presence and type checks.
4. Match IR: explicit `TypeTest` / `ValuePattern`, guard-after-match, arm-local narrowing, fallthrough on mismatch, and no eager/inaccessible getters.
5. Verification: parser and negative fixtures, class/record/struct/static-map positive cases, dynamic-map negatives and runtime checks, ownership escape/write attempts, string equality and union tests, native/browser guest execution, then five-backend parity. **Not executable yet** for the general case.

No existing compiler is claimed to support this complete extension merely because it recognizes the syntax.
