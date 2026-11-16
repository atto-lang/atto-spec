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

`on ~Position as val p` and `on structural Position as val p` MAY be supported as precise sugar for `on is ~Position as val p`, but must never be parsed as value/constructor patterns. Type-test patterns need statically reifiable, accessible shape metadata and proven binding lifetimes; overlapping or unreachable arms and guards remain subject to normal match rules. A `~` prefix alone is never a wildcard, and structural refinement does not make an open match exhaustive.

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
structural_pattern  = ["is"], structural_type, ["as", binding_kind, identifier]
                    | ["is"], shape_type, ["as", binding_kind, identifier] ;
call_argument       = expression | identifier, ":", expression ;
argument_list       = "(", [call_argument, {",", call_argument}], ")" ;
structural_value    = structural_mark, postfix_expression ;
```

- `~` binds as a **prefix** to a type/reference or expression; it never changes top-level `:` parsing. The argument parser first identifies an immediate top-level `identifier :` as a label; *then* parses that argument's complete expression, so `f(p: ~point)` is one labeled argument. Within `~{x: int}`, `:` is a *type field* delimiter, not a call label.
- In a call, positional arguments can precede labeled arguments. Once a labeled argument appears, any later ordinary positional argument is rejected. Duplicate/unknown labels, slot collisions, missing required formals, extra arguments, and unstable method/overload signatures are errors.
- A parenthesized nested expression, ternary `?:`, nested call or record does not leak its colon into the enclosing argument-label scan. Neither `::` nor `T=Type` (generic named type argument) is a runtime named-argument delimiter.
- Callee/receiver evaluation precedes argument expressions. Every source argument is evaluated **exactly once in source order**; only proven temporaries may be permuted into parameter declaration-order slots. Explicit `~` admission must not reorder, duplicate, or weaken this proof.
- Prefix `~` does not imply that `~foo()` is a call target. Structural projection applies to the result of the ordinary postfix expression `foo()`, under a statically known expected structural target or explicit checked shape.
- `~` in a method or routine parameter uses the **same** type AST and checking path as in free functions. Out-of-line `mtd (self: Owner)` receivers retain nominal/static receiver lookup; applying a structural mark to the receiver itself needs a distinct verified dispatch contract and is **not** authorized by this proposal.

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
