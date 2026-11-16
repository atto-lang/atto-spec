# AttoLang structural sequence patterns v2 (proposed canonical syntax)

Status: **target language contract, not compiler support** (2026-11-16). Supersedes the
`..._`/`_...` directional-rest spelling in [v1](sequence-pattern-matching-v1.md).
Reference-model tests are **host-only**; neither AttoLang guest execution nor Java, Rust/Wasm,
LLVM, .NET, Forge or other backend parity is proven by this document.

## Summary and canonical examples

```atto
pub fnc sum_three(Any values): int {
    return match<int> values over
        on List.of(
            is int as val y,
            ...,
            is int as val a,
            is int as val b,
            is int as val c,
            ...,
            is int as val x
        ) when a > 0 -> a + b + c,
        on Tuple.of(1, 2, 3) -> 6,
        on _ -> 0
    end;
}
```

In a `List.of` or `Array.of` *pattern*, bare `...` consumes zero or more
unconstrained elements. `_` consumes one element. Named subpatterns before/after
rests still anchor to the start/end of the matched sequence. `List.of(..., 2, ...)`
searches for `2` anywhere; there is **no** `...(int)...` construct.

A separate fixed-width repetition uses `...(N of item [, N of item]...)`:

```atto
match values over
    on Array.of(...(3 of int, 3 of bool)) -> "three integers then three booleans",
    on List.of(..., ...(3 of int), ...) -> "three contiguous integers anywhere",
    on List.of(...(3 of 7)) -> "exactly three sevens",
    on _ -> "other"
end
```

`...(3 of int, 3 of bool)` **does not** search anywhere by itself: it matches
exactly six positions in the indicated order. `...(3 of 7)` tests *value* `7`,
whereas `...(3 of int)` tests *type* `int`. In repetition operands only, bare
built-in type names (`int`, `bool`, etc.) stand for `is T`; outside repetition
use `is T`. An `Array<T>` must be capable of storing all segment element types:
these patterns do not grant heterogeneous storage to an incompatible array.
`Array.of`/`List.of` in this context are structural *pattern forms*, not
constructor calls executed during matching.

## Grammar (pattern context only)

```ebnf
sequence_pattern = sequence_kind, ".of(", [sequence_item, {",", sequence_item}], ")" ;
sequence_kind    = "List" | "Array" | "Tuple" ;
sequence_item    = value_pattern | "_" | rest | fixed_repeat ;
rest             = "..." ;
fixed_repeat     = "...(", repeat_segment, {",", repeat_segment}, ")" ;
repeat_segment   = nonnegative_integer, "of", repeat_atom ;
repeat_atom      = bare_builtin_type | literal | "is", ["!"], reifiable_type
                 | "_" | sequence_pattern ;
value_pattern    = primary_pattern, ["as", binding_qualifier, identifier] ;
primary_pattern  = literal | type_test | sequence_pattern ;
type_test        = "is", ["!"], reifiable_type
                 | "is", "Tuple[", [tuple_type_item, {",", tuple_type_item}], "]" ;
tuple_type_item  = ["!"], reifiable_type | "_" ;
binding_qualifier = "val" | "val mut" | "let" | "let mut"
                  | "const" | "const mut" ;
```

`Tuple.of` still has **exact arity**, so an unbounded `...` is forbidden there.
Fixed-width repetition is legal in tuple patterns because it expands to an
exact number of positions. `...(0 of int)` is a zero-width segment. The
parser must reject nested repetition, bare `...` outside a sequence pattern,
`...(int)`, `...(int)...`, `...(3 of int)...`, invalid counts, adjacent bare
rests, duplicate binders, and repeated *named* binders. Count ranges such as
`...(2..4 of int)` are **deferred**; they are not v2 grammar. In expression
contexts, existing spread/slice operators keep their own syntax and do not
inherit pattern wildcard semantics. Legacy `..._`/`_...` is no longer canonical;
there is no silent reinterpretation of unknown token sequences.

## Matching and guards

1. Evaluate the subject exactly once. Attempt arms in source order. Type/literal
   tests are pure and fail closed for non-reifiable types, effectful predicates,
   unadmitted ownership or unsupported representations.
2. A bare `...` consumes zero or more elements; a fixed-width group expands to
   the stated contiguous atom tests. `List.of(3, ..., 3)` requires distinct
   occurrences; an intervening rest can consume zero elements, but the two
   explicitly matched positions can never alias one element.
3. Where multiple decompositions exist, select the **leftmost-shortest** rest
   lengths from left to right, conditional on the entire pattern matching.
   Explicit binders capture only selected positions.
4. Bindings become available after structural matching, *before* a `when`
   guard. Evaluate the guard **once** for that one witness. If it fails,
   continue to the next arm; **do not** search another witness in the same arm.
5. Literal patterns compare values using defined pure value equality;
   `7` is not `is int`, nor is `true` an integer. No getter/predicate calls,
   speculative mutation, suspend, capture escape or ownership violation is
   permitted during matching. Nested structural equality must have explicit
   reifiability, purity and resource contracts.
6. Exhaustiveness/reachability analysis accounts for exact arity, runtime
   type tests and guarded arms. A guarded arm alone cannot prove unconditional
   coverage. Typed `match<T>` / `switch<T>` return-arm checks and `case`/`on`
   consistency remain subject to their separate language contract.

## Implementation and resource limits

The compiler can expand *bounded fixed-width groups* during type checking and
lower the resulting sequence items using a bounded DP feasibility table over
(pattern index, sequence index). Reconstruct the first successful decomposition
by always preferring to consume zero rest elements when the suffix remains
feasible. For fixed-cost atomic tests the worst case is O(m*n) time/space,
where `m` is the **expanded** pattern length and `n` is input length. Production
compilers must budget expanded width, nesting, input size and total matcher
states; never permit integer overflow or unbounded stack/backtracking on
adversarial patterns. AOT lowering must not invoke a runtime source interpreter
or JIT compiler. No hidden allocation from repeated lookahead is permitted in
hard-real-time/embedded profiles without explicit admission.

## Comprehensions (separate admission milestone)

The proposed sequence patterns should be reusable in an eventual
`for pattern in source` comprehension filter; failed destructuring skips
an element, while a matched binder is scoped to the guard and output.

```atto
val positives = List.of(
    for Ok(n) in results
    when n > 0
    -> n * 2
);
```

This is **syntax proposal only**, not an assertion that current compilers
parse or run collection comprehensions. No new `List.contains(...)` pattern
form is required for v2; `List.of(..., pattern, ...)` already expresses a
contiguous search with explicit anchors.

## Migration and evidence gates

| Old v1 pattern | New v2 pattern |
|---|---|
| `List.of(..._, 2, _...)` | `List.of(..., 2, ...)` |
| `List.of(..._, is int as val x)` | `List.of(..., is int as val x)` |
| `List.of(1, _...)` | `List.of(1, ...)` |

The v1 specification and reference tests remain historical regression
artifacts; v2 has separate host-only tests. Compiler implementation is tracked
by [atto-source.rs issue #123](https://github.com/atto-lang/atto-source.rs/issues/123).
A compiler claim requires an exact code head, successful compiler tests and
**executed positive/negative AttoLang guest fixtures**; source-only tests are
insufficient. Backend results must individually identify PASS / FAIL /
UNSUPPORTED / NOT_EXECUTED. Do not publish unverified language-preview code as
executable or assert cross-backend parity by inference.
