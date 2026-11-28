# Callable aggregate parameter patterns v1

**Status:** requested language extension; draft normative target, not a compiler parity claim. Extends the flat local binding rules in [tuple-destructuring-v1](tuple-destructuring-v1.md) without changing their v1 grammar. Preserve the existing pipeline multi-formal tuple expansion in [functions and effects](../spec/03-functions-and-effects.md#pipeline-lambda-contracts).

## Surface and arity

```atto
// Existing: three formal slots; pipeline expands one tuple into three slots.
val int a = (5, 3, 5) |> |x, y, z| -> sum(x, y, z);
// New: one formal slot, one tuple, three component bindings.
val int b = (5, 3, 5) |> |(x, y, z)| -> sum(x, y, z);
val int c = (5, 3, 5) |> |(x, y, z) as t| -> sum(...t);
// All three yield 13.

fnc total((x: int, y: int, z: int)) -> int {
    return sum(x, y, z);
}
val int d = total((5, 3, 5));
val int e = (5, 3, 5) |> total;

// A nominal receiver is still implicit, never part of the pattern's arity.
total((x: int, y: int, z: int)) -> int {
    return sum(x, y, z);
}

// Named field selectors and recursive composition:
|{x, y}| -> x + y
|Point {x, y}| -> x + y
|{x as horizontal, y as vertical}| -> horizontal + vertical
|((a, b), {x, y})| -> sum(a, b, x, y)
fnc distance(Point {x, y}) -> int { return x + y; }
fnc read_xy({x, y}: {x: int, y: int}) -> int { return x + y; }
fnc with_scale((x: int, y: int), int scale) -> int {
    return (x + y) * scale;
}
```

Examples with runtime values use `val`, not compile-time `const`; normal constexpr rules are unchanged. The tuple-pattern leaf annotation is name-first `a: int`, consistent with the prior local tuple pattern contract. A type-first leaf spelling is not adopted by this amendment. Ordinary formals retain their existing grammar. The public callable signature counts **root slots** only, not leaves. No implicit expansion into a named multi-parameter function. Explicit call spread remains distinct. A tuple pattern is not a tuple type declaration, tuple expression, parenthesized expression, or sequence. Zero and singleton patterns are `()` and `(x,)`; `(x)` is not a singleton pattern. Named functions/methods need a complete static root type (explicit root annotation, nominal name, or recursively fully typed tuple leaves). Contextual lambdas can infer the root type; an unconstrained pattern lambda fails inference.

## Grammar extension

```ebnf
formal           = ordinary_formal | aggregate_formal ;
aggregate_formal = aggregate_pattern, [":", type_ref], [root_alias] ;
aggregate_pattern = tuple_pattern | field_pattern | nominal_field_pattern ;
tuple_pattern    = "(", [item, ",", {item, ","}, [item]], ")" ;
field_pattern    = "{", field, {",", field}, [","], "}" ;
nominal_field_pattern = nominal_type_ref, field_pattern ;
field            = IDENT, ["as", item] ;
item             = "_" | binder | aggregate_pattern ;
binder           = ["rebind"], ["mut"], IDENT, [":", type_ref] ;
root_alias       = "as", ["rebind"], ["mut"], IDENT ;
```

The tuple grammar admits a mandatory comma after the first item, so singleton syntax is unambiguous; multi-element tuples can end with or without a trailing comma. An empty named-field pattern is not admitted in v1. Root annotations use the ordinary type grammar, including a structural record type. A field name without `as` binds the same name. `field as _` discards the selected field. `field as (a,b)` and `field as {x,y}` recurse into its value. A root alias is optional, fixed/read-only by default, and labels the one formal for named calls; explicit rebind changes its local slot only. No synthetic name, leaf name, or field selector is a callable label. Existing return annotations, explicit receiver syntax, constructor syntax, and named-call binding remain distinct. Parser may admit syntax only where all downstream passes support it; otherwise diagnose unsupported, never reinterpret it.

## Shape rules

| Root | Admission |
| --- | --- |
| Tuple | Exact statically resolved arity and positional types, including empty/singleton |
| Structural record | Selected statically declared readable fields; extra fields allowed |
| Nominal struct | Selected statically resolved fields, nominal type/layout and visibility preserved |
| Nominal class | Selected actual accessible instance data fields; preserve identity; no dynamic getter, method, static member, or hidden/private field bypass |
| FixedArray | Separate explicit fixed-sequence pattern `[a,b]` is a future profile; no tuple coercion |
| Array/List/Map/Set | Runtime length/key membership is not an irrefutable parameter pattern; use explicit checks or match |
| Option/Result/ADT/enum | Refutable variant patterns are not ordinary formals; use match or an explicit fallible API |
| Union | Admit only if every alternative satisfies the same irrefutable shape and ownership requirements, with statically joined leaf types |
| Actor or sealed state | No external state projection; existing authorized scoped critical callback remains the sole state access path |
| Pointer/borrow/guard/handle/foreign object | No implicit dereference, reflection, authority escalation, or unchecked projection; unsupported unless existing typed lifetime/capability proofs establish every projection |

Field patterns are partial selection, not structural conversion or dynamic object creation. A nominal prefix is a compile-time type requirement, not a downcast or runtime match. No method/property invocation is introduced. Duplicate selectors at the same level reject, even if renamed or discarded. Duplicate binders across the entire callable parameter list, including ordinary parameters, aliases, and reserved implicit `self` and `arguments`, reject. The same field name at different nesting paths is permitted with distinct local names. A failed proof introduces no bindings. Literal, guard, variant, rest, default and optional-pattern syntax remain out of scope; reject rather than introduce an implicit exception or fallible invocation.

## Evaluation, ownership, and effects

Evaluate caller expressions once, left to right, then bind root slots with normal argument/ownership rules. The compiler validates the entire typed pattern tree before lowering any projections. Bind in deterministic source order after ordinary argument binding; no user code runs between field projections. No reflective field lookup, temporary object shape, array conversion, hidden allocation, implicit copy of an affine owner, extra destructor, extra callback, or duplicated evaluation.

Parameters default to fixed read-only local bindings; explicit `rebind` allows local reassignment, never changes the original field. `mut` independently requests referent authority subject to existing ownership, immutability and visibility rules. Canonical incoming modifiers are absent, mut, rebind, rebind mut. Previously admitted contextual val/let spellings are migration-only equivalents where semantically identical; local declaration qualifiers remain separate. No constexpr evaluation is required by incoming bindings. Contextual const is accepted only where already admitted as an immutable incoming marker, not as a new constexpr formal or const mut template. Duplicate/conflicting modifiers reject; scalar mut without writable interior rejects. A rebindable root alias retains its declared root type; existing leaf loans keep original provenance, and invalidating live loans or moving a still-loaned owned root rejects. A replacement never retargets previously bound leaves. No marker changes argument arity, named labels, ownership transfer, or ABI. See merged parameter-rebind #223 and incoming alias amendment #301. The existing implicit-argument-borrow profile remains authoritative: a borrowed root yields checked projections, never owners; immutable Copy scalar leaves may be copied. An owned root without alias may move non-Copy components only with proven partial-move/drop accounting, preserving all unselected fields and their cleanup. A root alias anchors ownership; non-Copy leaves are loans, not second owners. A borrowed/owned class is identity-preserving, never implicitly cloned or split into independently owned class fields without explicit proven take authority. Discard does not leak or double-drop affine values. Root and component uses obey disjointness, NLL, suspension, actor isolation, sealed/final fields, and move/borrow rules; no authority derived from a user-supplied field name. Reject unsupported layouts and unsafe escaping loans before code generation.

## Lowering and parity gates

Use a typed irrefutable pattern plan on root parameter index plus resolved field/tuple path, exact leaf type, binding mode, ownership provenance and source span. Keep root arity and callable ABI unchanged, and never expose compiler-generated root names. A conservative first slice may reuse existing checked local destructuring for flat Copy-scalar tuples; it must explicitly reject broader shapes, dynamic slots and any unproven borrowing. Record/struct/class and nested paths require a typed data-field projection plan, not unchecked map destructuring. Native/AOT, Wasm, interpreter, closures, methods and formatter must agree on root signature, scope, error/effect behavior and evaluation order.

Required positive: original spread and multi-formal pipeline; unary tuple lambda and regular callable; direct call vs pipeline; singleton and empty tuple; mixed ordinary slots; inferred and explicit leaf types; aliased root; reordered/renamed record fields and extra fields; public class/struct fields and inherited visible fields; recursive tuple/field paths; exactly-once side effects; lexical shadowing and allowed disjoint loans. Required negative: scalar or dynamic collection passed as tuple; wrong arity/leaf type; no inferred root; missing/duplicate fields, duplicate local names across slots, alias collision, inaccessible/static/method field; actor state access; class identity mismatch; refutable variant pattern; invalid contextual const/mut, fixed-root and leaf reassignment, rebind of an owned root with live projections, conflicting mutable root/leaf loans, marker duplicates; non-Copy duplication/partial move, root alias conflict, use after take, mutable alias overlap, escaping or across-await loan; malformed/singleton pattern; named calls using leaf or synthetic name; no implicit named-function tuple spread.

Evidence per backend must distinguish parse, static type/ownership, runtime guest/AOT, formatter and unsupported status. Exact SHA and executed test results are required. A draft, AST-only assertion, host test, or zero-step workflow is not compiled guest support.
