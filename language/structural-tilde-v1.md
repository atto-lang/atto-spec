# Structural shorthand `~` — contextual alias contract (candidate v1)

**Status: TARGET / PROPOSED; NOT EXECUTED in any AttoLang guest.** This contract does not assert compiler, formatter, Rust/Wasm, Java, LLVM, .NET, or other backend support. The current Rust browser compiler rejects structural parameters/patterns, named call arguments, and tilde source tokens.

## Decision

In a *structural type, type-pattern, or explicit structural argument-projection position*, prefix `~` is the short spelling of the existing contextual `structural` modifier. Both spellings MUST construct the same typed AST node, carry the same source span/provenance and enforce identical visibility, ownership, effect, lifetime and closed-shape proofs. `~` MUST NOT mean negation, bitwise NOT, fuzzy comparison, a generic cast, a new dispatch/overload mode, or dynamic `Any`.

The alias is contextual, **not** a lexer-wide replacement of `~` with an identifier. Whitespace must not change meaning: `~Point` and `~ Point` parse identically. A formatter may retain either source spelling or normalize to `structural`; it MUST preserve typed meaning, argument evaluation order, labels and the distinction between aggregate and structural expression forms.

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

### Pattern matching

```atto
return match<int> value over
    on is ~Position as val p when p.x > 0 -> p.x,
    on is structural Position as val p -> p.y,
    on _ -> 0
end
```

**Type vs value-pattern distinction (candidate decision):** `on is ~Position as val p` and `on is structural Position as val p` test **structural type compatibility** only. Without `is`, `on ~pattern_value as val p` and `on structural pattern_value as val p` are **structural value patterns**, never aliases for type tests. `pattern_value` must resolve to a statically immutable, accessible pattern constant; `on ~Position` is therefore invalid when `Position` only denotes a type. The compiler should suggest `on is ~Position` for that case. Type-pattern matches require statically reifiable fields; value-pattern matches require pure, effect-free comparable values; neither exposes private or sealed actor state.

## Grammar and precedence (target)

```ebnf
structural_mark     = "structural" | "~" ;
structural_type     = structural_mark, type_ref ;
shape_type          = structural_mark, "{", field_type, {",", field_type}, "}" ;
field_type          = identifier, ":", type_ref ;
param_type          = type_ref | structural_type | shape_type ;
formal              = param_type, identifier, ["?"]
                    | identifier, ":", param_type, ["?"] ;
parameter_list      = "(", [formal, {",", formal}], ")" ;
structural_pattern  = structural_type_pattern | structural_value_pattern ;
structural_type_pattern = "is", (structural_type | shape_type),
                          ["as", binding_kind, identifier] ;
structural_value_pattern = structural_mark, (immutable_pattern_value | value_shape_pattern),
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

Value patterns with source expressions that could throw, suspend, mutate, inspect private/actor state, or carry unproved ownership are rejected. Explicit `~{x: 10}` and existing `~(x: 10)` have different contexts: the former is a **match pattern**, while the latter is a **Record aggregate expression**.

## Important collision: aggregate tilde

Other active language contracts reserve `~(key => value)` for typed Map aggregates and `~(field: value)` for closed readonly Record aggregates, with `~map`/`~record` explicit disambiguators. Those forms must remain **aggregate expressions**. Therefore:

| Spelling | Contextual interpretation |
| --- | --- |
| `~Point`, `~ Point` | structural type/pattern if a type is expected; checked structural projection if a value is expected |
| `~{x: int}` | structural *shape type* only in type/pattern context |
| `~value`, `structural value` | structural value admission in expression context |
| `~(field: value)` | Record aggregate, **not** a structural projection |
| `~(key => value)` | Map aggregate, **not** a structural projection |
| `~()` | reject ambiguous empty aggregate; use an explicit aggregate kind |
| `~(value)` | reject in v1; use `structural (value)` or assign to a temporary first |
| `~(x: int)` in call arguments | Record syntax at the expression site; **never** a named call argument |
| `f(x: ~value)` | labeled call argument, then checked structural value |
| `f(~value, label: other)` | one positional then one labeled argument |

The same prefix-token rule applies to aggregate spellings `~(field: value)` ≡ `~ (field: value)` and `~(key => value)` ≡ `~ (key => value)`, **without** changing their aggregate meaning. A whitespace-separated operand `~ {}` is parsed as exactly the same operand as `~{}`, but empty shape or value patterns remain invalid under this v1 contract; whitespace does not permit an otherwise invalid operand. Explicit context distinguishes structural **type** shapes, **value** patterns, and ordinary **aggregate expressions**, not spacing.

Do not discriminate solely by whitespace (`~(x)` vs `~ (x)`), runtime type, speculative reparse, or implicit `Any`; that would make formatting affect meaning.

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
