# AttoLang structural sequence patterns v1

Status: **historical v1 target, superseded by [v2](sequence-pattern-matching-v2.md); compiler execution NOT_VERIFIED** (2026-11-16).

The `..._` / `_...` forms below document the original v1 proposal, not canonical
syntax for new code. v2 uses bare `...` and adds bounded counted repetition.

This is a backend-neutral **language contract**, not a claim that current compilers
parse, typecheck, lower, or execute the feature. In particular, the Rust browser
compiler currently rejects `match<T>`, list/tuple patterns and `is` type
patterns, and does not have general `Any` or `List<T>` values. A host-only
reference matcher in this repository tests this proposed contract, **not** guest
AttoLang or backend parity.

## Canonical form

```atto
pub fnc foo(Any v): int {
    return match<int> v over
        on List.of(..._, 5 as val x, 3 as val y, 2 as val z, _...) -> x + y + z,
        on List.of(..._, is int as val a, is int as val b, is int as val c, _...)
            when a > 0 -> a + b + c,
        on Tuple.of(1) -> 1,
        on is Tuple[!int] -> 0,
        on _ -> 0
    end
}
```

An `Any` subject is used above because both List and Tuple cases are
present. A statically `List<Any>` subject need not be able to match a Tuple.
`return match<T>` and arrow expression arms are *target language syntax*;
the browser compiler's current statement-match subset is not evidence that
this expression form works.

## Lexing and syntax

```ebnf
sequence_pattern = "List.of(", [sequence_item, {",", sequence_item}], ")"
                 | "Tuple.of(", [tuple_item, {",", tuple_item}], ")" ;
sequence_item    = value_pattern | "_" | "..._" | "_..." ;
tuple_item       = value_pattern | "_" ;
value_pattern    = primary_pattern, ["as", binding_qualifier, identifier] ;
primary_pattern  = literal | type_test | sequence_pattern ;
type_test        = "is", ["!"], type
                 | "is", "Tuple[", [tuple_type_item, {",", tuple_type_item}], "]" ;
tuple_type_item  = ["!"], type | "_" ;
binding_qualifier = "val" | "val mut" | "let" | "let mut"
                  | "const" | "const mut" ;
```

The structural wildcard forms `..._` and `_...` are **contiguous lexical
spellings**; `... _`, `_ ...`, and bare `...` are invalid. Their AST meaning
is one `SkipMany` node: consume and discard *zero or more* elements. The
direction only conveys readability and formatter placement:

- `..._` is canonical at the start or between explicit elements.
- `_...` is canonical at the end of a List pattern.
- `_` discards **exactly one** element.
- `_...` inside a List with subsequent items is rejected; use `..._` there.
- Adjacent `SkipMany` nodes are rejected as redundant/ambiguous.
- `Tuple.of` matches **exact arity**; rest wildcards are not admitted in
  `Tuple.of` in this v1. The empty forms match empty sequences.

Identifiers bound using `as` must specify the binding category, and are
introduced only after their subpattern matched. `5 as val x` matches the
literal 5 and binds x; `x as 5` and `5 as x` are not accepted aliases.
`is int as val x` checks the runtime type and binds the matched value.
`val` forbids rebinding; `let` allows rebinding, but neither implicitly
permits mutating an owned referent. The independent `mut` capability is
governed by [local binding mutability](./local-binding-mutability-v1.md).
A `const` binding is accepted only if compile-time evaluation of its
initializer can actually be proved; matching a dynamic subject does not
magically make its value compile-time constant.

Type tests use `is T` or `is !T`. `is !int` is the complement of the
runtime `int` type test **within the subject's admissible type universe**;
it does not disable type checking or bypass ownership restrictions.
`is Tuple[!int]` describes a **single-element** Tuple with a non-int
element; it does not mean any-length tuple without integers. Tuple type
patterns are arity-exact in this v1. Unknown/non-reifiable runtime type
tests must fail at compile time, not guess based on memory layout.

## Matching behavior

1. Evaluate the match subject exactly once. Each `on` arm is attempted in
   source order. `_` matches anything; static reachability and
   exhaustiveness checks still apply.
2. `List.of(5, 3, 2)` matches only a three-element List in that order.
   `List.of(..._, 5, 3, 2, _...)` matches a List containing those three
   values **contiguously**. `List.of(..._, 3, ..._, 3)` requires **two
   distinct** occurrences of 3, in order.
3. Rest wildcards consume zero or more values. For multiple valid
   decompositions of one sequence, choose the **leftmost-shortest** witness:
   each rest wildcard consumes the fewest elements compatible with an
   eventual full match, starting with the first wildcard. Captured values
   thus have deterministic positions.
4. Match pattern comparison is pure. It must not execute getters, invoke
   user predicates, suspend, mutate the subject, or use reference identity
   as a replacement for defined structural value equality.
5. Bindings become available in the guard and arm body only. A guard is
   evaluated **once**, after selecting the deterministic witness; if false,
   move to the next arm. Do not retry a different decomposition within the
   same arm to make the guard true. An unsuccessful arm does not leak bindings.
6. Subject ownership, borrowing, mutable access, actor isolation and
   sealed-state checks are enforced normally. No binding permits a move
   out of a borrowed or immutable List merely by appearing in a pattern.

## Algorithm and compiler requirements

An implementation can use a bounded dynamic-programming membership table
over (pattern-index, value-index), then reconstruct the leftmost-shortest
successful path. Avoid exponential backtracking for multiple rest wildcards.
With a fixed-cost atomic comparator, matching a list of length `n` against
`m` pattern items is O(n*m) time and O(n*m) space; an optimized compiler
may use less space. Subject access and element comparisons must remain safe
under size limits. Nested patterns need explicit depth/size budgets, not
unbounded recursive descent.

Lexers must keep `..._` and `_...` distinct from property access and
other dot operators. Parsers must reject malformed wildcard placement,
duplicate binding names, missing explicit binding qualifiers, invalid type
tests, and unsupported pattern combinations with precise diagnostics.
Formatters should preserve the canonical directional wildcard spellings
without changing match semantics.

## Conformance matrix (target cases)

| Pattern | Input | Expected |
|---|---|---|
| `List.of(..._, 5, 3, 2, _...)` | `[8, 5, 3, 2, 9]` | match |
| same | `[8, 5, 7, 3, 2]` | no match |
| same | `[5, 3, 2]` | match (both rests empty) |
| `List.of(5, _, 2)` | `[5, 8, 2]` | match |
| same | `[5, 2]` | no match |
| `List.of(..._, 3, ..._, 3)` | `[3]` | no match |
| same | `[3, 2, 3]` | match |
| `List.of(..._, is int as val x, _...)` | `["a", 2, 9]` | bind x = 2 |
| `is Tuple[!int]` | `Tuple("a")` | match |
| same | `Tuple(7)` | no match |

## Adoption gates

The checked-in host reference conformance is **not guest execution**.
Before claiming Rust browser support, implement lexing, typed AST/checker,
sequence representation, bounded lowering, and executable guest-Wasm tests
on exact commit SHA. Java/LLVM/.NET/other compilers require their own
parse/type/codegen/negative tests, not inferred parity. Unsupported
features must fail closed; do not relabel syntax examples as executable
or publish new compiler artifacts without their separate release gates.
