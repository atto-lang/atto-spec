# Verified Core contract annotations and explicit statement bodies

Status: candidate syntax extension requested 2026-11-25. Extends [scalar refinements](verified-core-refinements-v1.md) and [accepted callable body styles](../language/return-first-and-begin-callables-v1.md). Annotation names below are proposed spellings, not a claim of existing parser support.

## Equivalent spellings

~~~atto
type PositiveMillis = int
    where self > 0
    and units in Millis;

fnc halve(PositiveMillis duration) -> PositiveMillis
    requires duration >= 2<Millis>
    ensures result > 0<Millis>
    ensures result <= duration
begin
    return duration / 2;
end
~~~

~~~atto
@where(self > 0)
@units(Millis)
type PositiveMillis = int;

@requires(duration >= 2<Millis>)
@ensures(result > 0<Millis>)
@ensures(result <= duration)
fnc halve(PositiveMillis duration) -> PositiveMillis
begin
    return duration / 2;
end
~~~

Either declaration form may use an ordinary braced body instead. These are alternatives, not distinct overloads.

## Grammar and elaboration

- A declaration-prefix annotation is an exact contextual name with one parenthesized argument of the same grammar as its corresponding clause. @where and @units attach to a type alias; @requires and @ensures attach to a callable. Parentheses delimit the annotation, not an executable call. No stringification of predicates.
- Resolve annotation arguments in the declaration's semantic scope, after the signature is resolved: self is the carrier value in a refinement; parameters bind by name in preconditions; result is available only in postconditions. Unit names use the normal nominal resolver. Do not treat the annotations as user macros or runtime decorators.
- Keyword clauses and annotations may coexist. Conjoin predicates; each clause must be checked. A single unit clause is allowed across both spellings; repeated unit clauses are rejected under the existing profile. Contradictory refinements reject; contract satisfiability and proof status retain the existing rules. Never overwrite one clause with another. Unsupported, malformed, unrecognized formal annotations or wrong attachment sites reject; never silently discard a contract.
- Name-first headers with completed requires/ensures clauses accept either an ordinary brace body or explicit begin/end statement body. Match delimiters, preserve semicolons and explicit returns. Nested constructs own their closing tokens. This is not the legacy comma-tail implicit return body. Do not add new bare-end inference.
- Contracted statement-body boundary: a `{` may follow the final complete header/contract clause on the same physical line or a later line. An explicit `begin` must start on a later physical line than the final token of the completed header (including any trailing contract/effect clause); indentation and intervening blank/comment-only lines are permitted. A multiline predicate is measured from its final token, not the clause's first line. Comments or whitespace without a physical newline do not satisfy this rule. Reject same-line `begin` in this contracted profile; do not silently reinterpret it as a predicate or comma-tail body. This does not change uncontracted callable grammar.
- Both syntactic forms elaborate to the same typed contract representation and generate equivalent obligations, checks, effects and failure outcomes, modulo source locations. The unit clause remains structural metadata in typed IR until validated erasure. Preserve the original clause spans for diagnostics.
- No annotation may weaken checking, change evaluation order, introduce runtime reflection, require JIT or an embedded solver, or turn an unknown proof into a proven one. Use the same fail-closed admission and AOT lowering rules as the keyword form.
- Formatter preserves annotation versus keyword spelling and brace versus begin/end style by default, with idempotent output; any explicit style conversion must preserve all clauses. Existing annotation/macro namespace compatibility must be audited before compiler admission.

## Contract body boundaries

These are alternative declarations of the same function, not overloads:

~~~atto
fnc divide(int a, int b) -> int
    requires b != 0 {
    return a / b;
}
~~~

~~~atto
fnc divide(int a, int b) -> int
    requires b != 0
{
    return a / b;
}
~~~

~~~atto
fnc divide(int a, int b) -> int
    requires b != 0
begin
    return a / b;
end
~~~

Reject `requires b != 0 begin` on one physical line. The same header rule applies to annotation-only and mixed contracts. The formatter may preserve either brace placement and must always place `begin` on its own following line. Do not require a newline before a brace. Do not infer that a nonzero divisor proves absence of signed MIN/-1 overflow: checked arithmetic remains mandatory unless independently proved safe. The existing narrow interval profile does not yet admit general disequality predicates or unrestricted scalar division; this example is an explicit implementation target extending that profile, not a claim of existing acceptance. For signed i64, division truncates toward zero and still traps on MIN/-1. A call violating the nonzero precondition is rejected when statically disproved, under the existing contract admission rules.

## Required conformance matrix

Run all four combinations of annotation/keyword and brace/begin-end with the same positive guest (halve 84 Millis then divide by 1 Millis returns 42), same resolved units, same normalized obligations and equivalent execution result. Also test a mixed keyword/annotation declaration with all predicates retained.

Add same-line and next-line brace positives, newline begin positives, and same-line begin negatives for keyword, annotation-only and mixed headers. Include multiline final predicates, CRLF/LF, blank lines, line/block comments, and malformed/missing delimiters. Exercise the divide example with 84/2, negative operands, zero precondition rejection and MIN/-1 overflow. The disequality and scalar-division semantic extension must be independently implemented and tested; do not count delimiter-only parsing as executable admission.

Negative controls: precondition violated at call; unproved postcondition; contradictory refinement; mismatched unit; repeated unit clause split across syntaxes; result in precondition; self outside refinement; unknown parameter; malformed annotation parentheses; wrong attachment site; unknown formal annotation; missing end; mismatched closing brace/end; missing explicit return; nested terminator ownership; ordinary identifiers named requires/ensures/units where legal; formatter round-trip.

Compiler support, actual guest execution and independent proof receipts remain separately gated. This proposal does not certify annotation parsing, general refinements, or compiler parity. No new globally reserved keywords are introduced.
