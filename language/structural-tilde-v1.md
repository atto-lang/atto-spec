# Structural shorthand `~` — contextual alias contract (candidate v1)

**Status: PROPOSED general contract; VERIFIED bounded Rust/Wasm subset.** Ordinary fixed-layout class structural **value patterns** (`on ~{x?: 10, y: _}`) and public scalar structural **type tests** (`on is ~Point`) are compiled and guest-executed on both native and browser compiler hosts. The complete 99-case contract, structural parameter/argument **runtime lowering**, open/dynamic shapes, Java/LLVM/.NET and other backend parity are **not verified**. The production Rust parser now **retains** the `~Class` marker on fnc/routine/inline-method formals, while explicitly rejecting codegen until a safe projected-class loan ABI exists. Latest evidence: [full-tree carrier run #43909610197](https://github.com/cliptown/cliptown-e2e/actions/runs/43909610197), source SHA `300f94f8c278045a3bd8363706dff64b6ced9a25`, 592 original blobs and identical Git tree; 214 Rust tests, 503 conformance cases, 456 native/browser comparisons, 10 positive and 12 negative guest cases. Structural formal and named-call guest execution remain **fail-closed**, not passing feature claims.

## Decision

In a *structural type, type-pattern, or explicit structural argument-projection position*, prefix `~` is the short spelling of the existing contextual `structural` modifier. Both spellings MUST construct the same typed AST node, carry the same source span/provenance and enforce identical visibility, ownership, effect, lifetime and closed-shape proofs. `~` MUST NOT mean negation, bitwise NOT, fuzzy comparison, a generic cast, a new dispatch/overload mode, or dynamic `Any`.

The alias is contextual, **not** a lexer-wide replacement of `~` with an identifier. Whitespace must not change meaning: `~Point` and `~ Point` parse identically. A formatter may retain either source spelling or normalize to `structural`; it MUST preserve typed meaning, argument evaluation order, labels and the distinction between aggregate and structural expression forms.

## Cross-kind member compatibility (candidate refinement)

The explicit [structural member-witness contract](structural-member-witness-v1.md) defines the **all-member** satisfaction rules for interfaces (methods), traits and classes (exported state/properties plus methods), structs, Records, Tuples and Maps. A structural witness checks **every required accessible member**; extra actual members may be admitted for read-only projection. Tuple arity is exact, and a generic Map key type never proves a named key exists. These remain **normative targets**, not full compiler or guest parity. A backend without a checked method/field ABI must reject the affected source without generating guest code. The [43-case host-only matrix](../conformance/structural-member-witness-v1.json) does not certify a compiler.

## Target examples

```atto
define class Position as
    pub int x: 0
    pub int y: 0
end

fnc length_squared(~Position p): int {
    return p.x * p.x + p.y * p.y;
}

fnc length_squared_alt(p: structural Position): int {
    return p.x * p.x + p.y * p.y;
}

routine offset(~{x: int, y: int} p, int delta): int {
    return p.x + delta;
}

define class Service as end
mtd (self: Service) evaluate(p: ~Position, multiplier: int) -> int {
    return p.x * multiplier;
}

fnc use_position(Position existing): int {
    val a = length_squared(existing);              // checked structural formal
    val b = length_squared(~existing);             // explicit structural admission
    val c = length_squared_alt(p: structural existing);
    val d = offset(~existing, delta: 2);           // positional then named
    val e = offset(p: ~existing, delta: 2);        // all named
    return a + b + c + d + e;
}
```

These are proposed acceptance fixtures, not known working programs. Structural-formal admission is never permission to expose private fields or silently copy ownership-sensitive values.

### Formal and argument admission audit (2026-11-16)

The `~` token is contextual: `fnc length_squared(~Position p)` and `fnc length_squared(p: structural Position)` have equivalent **target** structural-formal meaning; the same holds for `routine` and inline methods. The Rust production parser now recognizes both type-first and name-first structural class formals and explicitly stores `Param.structural = true`, rather than erasing the mark to a nominal class type. `~Point`, `~ Point`, `~/*comment*/Point`, and `structural Point` are equivalent as formal types. Mutable structural formals are rejected pending a checked exclusive-borrow ABI; `~int` and inline type shapes are rejected as currently unsupported structural formal profiles. Out-of-line `mtd` structural formals still fail closed in their separate receiver-header parser.

**Crucial ABI boundary:** even when `Other` and `Position` share public fields, their **byte offsets, private headers, method tables, and lifetimes may differ**. Treating `~Position p` as an ordinary `Position` pointer, or as an implicit owned move/copy, would be unsound. The Rust checker therefore rejects a marked structural formal **before** signature registration and code emission with `E_UNSUPPORTED`; this is intentional until a validated, read-only borrowed argument descriptor/projection ABI can be generated. Merely parsing a formal is not proof that the function/method can be called.

At call sites, the **target** grammar admits `fnc_name(~obj)`, `fnc_name(arg: ~obj)`, `obj.method(arg: structural obj2)` and mixed positional-then-named calls. The source-only preflight:
- validates a complete immediate **postfix operand** such as `~obj`, `~obj.field`, `~obj.get()`, or `~obj[index]`, regardless of whitespace and comments;
- resolves a named label against the chosen callable's formal names **before** structural admission and returns a binding plan in source evaluation order;
- rejects obsolete `~(field: value)` and `~(key => value)` construction syntax; use `Record.of(...)` and `Map.of(...)` respectively; `~obj` remains a checked structural projection; `~{field: value}` is a shape/pattern, not an ordinary call argument;
- rejects duplicate/unknown names, positional arguments after named arguments, collisions, extra/missing arguments, unrecognized projected operands and explicit `~` against an ordinary nominal formal, with source-based diagnostic positions.

These are **syntax-only plans**, not production named-call or projected-call execution. The production Rust compiler still rejects structural argument projections and named call labels without producing Wasm. In particular, the bounded preflight currently rejects full arithmetic around the projected operand (`~obj + 1`) until typed expression precedence is implemented; this **does not** change the target rule that `~` binds to its first complete right-hand operand. No source argument may be evaluated twice or reordered by future parameter-slot permutation.

Verified audit: [GitHub Actions #43909610197](https://github.com/cliptown/cliptown-e2e/actions/runs/43909610197), including production-parser AST tests, all six new formal/call admission tests, full Rust/Node/Chromium regression, the exact mirrored 592-blob tree, and unchanged native/browser guest parity on the existing structural-matching slice. No Java, LLVM, Forge, or .NET parameter ABI parity is claimed.

### Pattern matching

```atto
return match<int> value over
    on is ~Position as val p when p.x > 0 -> p.x,
    on is structural Position as val p -> p.y,
    on _ -> 0
end
```

**Type vs value-pattern distinction (candidate decision):** `on is ~Position as val p` and `on is structural Position as val p` test **structural type compatibility** only. Without `is`, `on ~pattern_value as val p` and `on structural pattern_value as val p` are **structural value patterns**, never aliases for type tests. `pattern_value` must resolve to a statically immutable, accessible pattern constant; `on ~Position` is therefore invalid when `Position` only denotes a type. The compiler should suggest `on is ~Position` for that case. Type-pattern matches require statically reifiable fields; value-pattern matches require pure, effect-free comparable values; neither exposes private or sealed actor state.

> **Extension (2026-11-16):** [anonymous-structural-shapes-v1.md](anonymous-structural-shapes-v1.md) specifies that bare nonempty `{field: Type}` in type position is structural by default; singleton literal field types (`{foo: "dog"}`) and unions (`{foo: string | int}`) are proposed. In match arms, bare `on {...}` is a value pattern and `on is {...}` is a type test. Earlier rejection of `on is ~{foo: "dog"}` is superseded; this is a singleton **type**, not an accidental value-pattern conversion. Compiler field type/projection ABI parity is still unimplemented. The grammar below is the original v1 baseline; the extension takes precedence where it differs.

## Grammar and precedence (target)

```ebnf
structural_mark     = "structural" | "~" ;
structural_type     = structural_mark, type_ref ;
shape_type          = [structural_mark], "{", field_type, {",", field_type}, "}" ;
field_type          = identifier, ":", (type_ref | singleton_type | union_type | shape_type) ;
singleton_type      = string_literal | integer_literal | "true" | "false" ;
union_type          = (type_ref | singleton_type | shape_type), "|", (type_ref | singleton_type | shape_type), {"|", (type_ref | singleton_type | shape_type)} ;
param_type          = type_ref | structural_type | shape_type ;
formal              = param_type, identifier, ["?"]
                    | identifier, ":", param_type, ["?"] ;
parameter_list      = "(", [formal, {",", formal}], ")" ;
structural_pattern  = structural_type_pattern | structural_value_pattern ;
structural_type_pattern = "is", (structural_type | shape_type),
                          ["as", binding_kind, identifier] ;
structural_value_pattern = (structural_mark, immutable_pattern_value | [structural_mark], value_shape_pattern),
                           ["as", binding_kind, identifier] ;
value_shape_pattern = "{", pattern_field, {",", pattern_field}, "}" ;
pattern_field       = identifier, ["?"], ":", (literal | "_" | nested_pattern) ;
call_argument       = expression | identifier, ":", expression ;
argument_list       = "(", [call_argument, {",", call_argument}], ")" ;
structural_value    = structural_mark, postfix_expression ;
```

- `~` is a **standalone prefix operator token**. It applies to the next complete right-hand operand: no lexical adjacency to `{`, `(`, an identifier, or another operand token is required. Therefore `~{x: int}` and `~ {x: int}` are the same type-shape spelling; `~{x: 10}` and `~ {x: 10}` are the same field-value pattern; `~Point` and `~ Point` have the same contextual interpretation. Multiple spaces, line breaks, or comments between `~` and its operand do not change the parsed AST. The parser MUST NOT use source-byte adjacency or spaces to choose pattern/type/value/aggregate behavior.
- `~` binds as a **prefix** to a type/reference or expression; it never changes top-level `:` parsing. The argument parser first identifies an immediate top-level `identifier :` as a label; *then* parses that argument's complete expression, so `f(p: ~point)` is one labeled argument. Within `~{x: int}`, `:` is a *type field* delimiter, not a call label.
- In a call, positional arguments can precede labeled arguments. Once a labeled argument appears, any later ordinary positional argument is rejected. Duplicate/unknown labels, slot collisions, missing required formals, extra arguments, and unstable method/overload signatures are errors.
- A parenthesized nested expression, ternary `?:`, nested call or record does not leak its colon into the enclosing argument-label scan. Neither `::` nor `T=Type` (generic named type argument) is a runtime named-argument delimiter.
- Callee/receiver evaluation precedes argument expressions. Every source argument is evaluated **exactly once in source order**; only proven temporaries may be permuted into parameter declaration-order slots. Explicit `~` admission must not reorder, duplicate, or weaken this proof.
- Prefix `~` does not imply that `~foo()` is a call target. Structural projection applies to the result of the ordinary postfix expression `foo()`, under a statically known expected structural target or explicit checked shape.
- `~` in a method or routine parameter uses the **same** type AST and checking path as in free functions. Out-of-line `mtd (self: Owner)` receivers retain nominal/static receiver lookup; applying a structural mark to the receiver itself needs a distinct verified dispatch contract and is **not** authorized by this proposal.


### Type compatibility versus structural value matching

The presence of `is` is semantically decisive, not optional punctuation:

```atto
// Suppose Point is a nominal type with public x:int and y:int.
match value over
    on is ~Point as val p -> {
        // Compatible fields/types; x and y can have ANY values.
        process(p);
    }
    on _ -> { fallback(); }
end

// Field values: x must equal 10; y must exist, but its value is ignored.
match value over
    on ~ {x: 10, y: _} as val p -> {
        process(p);
    }
    on _ -> { fallback(); }
end
```

### Optional field presence and wildcard values

The `?` belongs to the **field name**, directly before the `:` token: `x?: 10`. The `_` belongs to the **value pattern** after the colon, not to the field name. This separates field existence from value matching:

| Pattern field | Field absent | Field present |
| --- | --- | --- |
| `x: 10` | fail | pass only when `x == 10` |
| `x: _` | fail | pass for any value, including a null-like value |
| `x?: 10` | pass | pass only when `x == 10` |
| `x?: _` | pass | pass for any value |

```atto
match value over
    on ~{ x?: 10, y: _ } as val p -> {
        process(p);
    }
    on _ -> { fallback(); }
end
```

Thus `{ y: 20 }` and `{x: 10, y: 20}` match; `{x: 11, y: 20}` and `{x: 10}` do not. An explicitly present null-like value is **not absence**; it is checked against the specified value pattern. The `as val p` binder always captures the original subject value, not a synthetic object with missing fields filled in. Extra fields may be present.

The lexer must produce separate `identifier`, `?`, and `:` tokens in **value-pattern field context**. `x?: 10`, `x? : 10`, and `x ? : 10` have identical meaning, and whitespace/comments after `~` remain insignificant. `x??:`, `?: 10`, duplicate `x`/`x?` declarations within a single pattern, absent right-hand pattern values, and effectful or unsupported value expressions are errors. Duplicate detection keys on the base field name, ignoring optionality.

`x?: 10` does **not** say that `x` is an `Option<int>`-typed member, does not make the right-hand literal optional, and does not change the function-call `name: expression` syntax, ternary/early-return operators, or the separate `is ~{x: int}` type-test grammar. Future optional **type-shape** fields (`on is ~{x?: int}`) would need a separately specified type-level compatibility rule; this proposal only adds presence optionality to **value patterns**.

An explicit value-pattern's required fields must be a **subset** of the subject's accessible fields, and **all** non-wildcard subpatterns must match (conjunction). Subject-only extra fields do not cause failure. An *any-overlap* predicate (one matching field being enough) is rejected: it makes arm dispatch unexpectedly broad and destroys useful exhaustiveness/overlap diagnostics. Equality is typed structural value equality, not object identity; recursive comparison is allowed only for statically admissible comparable fields with proven bounded evaluation. No getter side effects or automatic partial-object coercions.

`on ~Position` is valid only if `Position` is bound to an immutable **value pattern constant** whose accessible field names, types, and field values are statically established. If it resolves only to the nominal **type** `Position`, the source is an error (suggest `on is ~Position`). If a language scope has both a type and value named `Position` with ambiguous resolution, reject the bare identifier and require an explicit value-pattern record such as `~{x: 10}` or a clearly qualified constant. Do not infer field values from constructors, default field initializers, or the type declaration. Empty `~{}` value patterns reject to avoid accidentally matching everything; use `on _` deliberately.

The same distinction applies to the long spelling: `on structural Position` is a value pattern, whereas `on is structural Position` is a type pattern. The formatter, type checker, and generated code must retain the **type-test vs value-pattern** AST discriminant. The `as val p` binder is introduced only after the pattern and guard succeed. An omitted `is` must never be silently inserted by a formatter or parser.

Value patterns with source expressions that could throw, suspend, mutate, inspect private/actor state, or carry unproved ownership are rejected. `~{x: 10}` and bare `{x: 10}` are value patterns in match arms. The former `~(x: 10)` aggregate constructor spelling is removed; use `Record.of(...)` for construction.

## Removed tilde aggregate constructors and whitespace invariance

The canonical constructors are `Map.of(...)`, `Record.of(...)`, `Tuple.of(...)`, `Array.of(...)` and corresponding typed `.of` APIs where implemented. The obsolete `~(field: value)`, `~(key => value)`, and named `~map(...)`/`~record(...)` construction forms **reject** in all whitespace/comment variants; they must not be interpreted as structural projections. In particular, `~(value)` does **not** make parentheses legal structural projection syntax.

| Spelling | Meaning |
| --- | --- |
| `~Point`, `~ Point` | structural named type or projected value in the appropriate context |
| `{foo: string}`, `~{foo: string}` | structural shape type in type position |
| `on {foo: "dog"}`, `on ~{foo: "dog"}` | exact-value structural patterns |
| `on is {foo: string}`, `on is ~{foo: string}` | structural type tests |
| `~(field: 42)`, `~ (field: 42)` | reject; use `Record.of(...)` |
| `~(key => 42)`, `~ (key => 42)` | reject; use `Map.of(...)` |
| `f(p: ~value)` | labeled argument, with checked structural projection |
| `f(p: Record.of(...))` | labeled ordinary aggregate argument |

`~` binds the next right-hand operand regardless of spacing; spacing cannot revive removed syntax. See [anonymous-structural-shapes-v1.md](anonymous-structural-shapes-v1.md) and the removal contract [atto-spec PR #38](https://github.com/atto-lang/atto-spec/pull/38). An expression cannot masquerade as a structural type through a formatter rewrite.

### Rust/Wasm compiler implementation slice (PR #187; CI-verified for static classes)

The candidate Rust/Wasm compiler branch now wires `on ~{ x?: 10, y: _ } as val p` through the **production** match AST and checker rather than only the reference syntax parser. The initial executable slice is intentionally restricted to statically known ordinary **class** subjects with public fixed-layout fields. Presence is checked from the statically known class layout; a missing optional field passes, while a missing required field makes that arm false. Present integer/boolean literal fields compare with typed equality; `_` only checks presence, so it performs no field read. A match subject is evaluated once and match conditions use ordinary Wasm typed expression lowering.

The `as val p` binding is a **read-only scoped class loan**, not an implicit copy or transfer. Returning or passing that class handle to an ownership-consuming parameter is rejected until a verified borrowed-argument ABI is available. Private and protected state fields are rejected, including when the field is optional. Dynamic/opaque/actor subjects, nullable presence semantics, string literal **value** comparison, mutable `as let` bindings, inline `on is ~{field: Type}` checks, and **runtime/open** structural shapes are not implemented by this slice. The admitted `on is ~Point` check resolves a declared class's **public scalar field types** and statically proves compatibility with the subject's public class layout; values and nominal class identity are not compared. The match binder retains the actual subject class type as a scoped read-only loan. Missing or incorrectly typed fields fail that arm; additional public fields are allowed; empty shapes and nested class/actor-handle field shapes remain fail closed.

Verified against the complete original 591-blob source Git tree on a token-free mirrored private runner: [successful CI run #43827795242](https://github.com/cliptown/cliptown-e2e/actions/runs/43827795242) reports **208/208 Rust tests, 503/503 full compiler conformance checks, 456 native/browser guest-byte parity comparisons, 10/10 positive structural guest Wasm executions on both compiler hosts, and 12/12 negative structural compilation cases** on both hosts. Chromium browser/Worker E2E succeeded. This is not cross-backend proof: Java differential was not executed. Repository-wide rustfmt drift and Clippy warnings remain as separately recorded formatting/lint debt, not a source of pass claims.

## Hard safety and diagnostic requirements

1. Resolve the callee and its formal parameter-name/structural-type contract before binding names. A `~` argument does not pick an overload, change arity, or bypass nominal overload ambiguity.
2. Compare readable/public fields and their types recursively under depth/node caps; check mutability, sharing and access effects, including actor sealed state. Never introspect private fields, actor state outside critical leases, or foreign opaque references.
3. Preserve borrow and move rules: a `~` annotation is not an implicit copy, move, declassification, or lifetime extension, and must not leak a loan past `await`/critical boundaries.
4. A structural pattern evaluates the subject once, refines only after a successful check, introduces bindings only in that arm, executes guards at most once, and honors ordered/exhaustive match admission. No `~` pattern negation.
5. Unsupported form or unproved lowering MUST stop at compile time with deterministic `E_UNSUPPORTED`, `E_UNSUPPORTED_TYPE`, `E_SYNTAX`, `E_DUPLICATE` or a dedicated structural diagnostic, preserving source positions; emit **no Wasm/native object or false guest evidence**.
6. Parser, checker, formatter, AOT lowering, and all backends must be tested on the exact same source fixtures, including regular/labeled/mixed arguments, `fnc`, `mtd`, `routine`, nested expressions, guards, alias equivalence, and negative mutation cases.

See `conformance/structural-tilde-v1.json` for proposed cases. Passing these reference checks is **not** evidence of guest execution.

## Statement-match arm bodies

For multi-statement `match ... over` arms, use either `on Pattern -> { ... }` or `on Pattern -> ... end` (with a separate final `end` for the match). See [statement-match arm delimiters v1](match-arm-delimiters-v1.md). These are not the comma-separated expression arms of `return match<T>`.
