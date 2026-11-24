# Verified Core scalar refinements and contracts v1

Status: **candidate executable profile**. This slice extends [quantities v1](verified-core-quantities-v1.md) to immutable bindings, private calls, and function contracts in a standalone source file. The [Verified Core RFC](https://github.com/atto-lang/atto-source.java/pull/1799) defines the broader program.

## Admitted source

After optional file-local dimension and unit declarations, a standalone file opts into this profile with a prelude of `type Name = Carrier where ...;` declarations. The carriers are `int` (signed i64) and `i32` (signed 32-bit). An alias is a structural constraint, independent of its spelling. Its clauses are `self <op> <signed integer>` and at most one `units in Unit`, joined by `and`. Operators are `<`, `<=`, `>`, `>=`, and `eq`. A predicate on `self` uses the coordinates of the alias unit. Contradictory intervals, including intervals wholly outside the carrier, and repeated or unresolved unit declarations are errors.

Functions use type-first parameters, explicit result types, positional calls to earlier private helpers, immutable `val` bindings, and a terminal explicit return. Both binding orders, `val Type name` and `val name: Type`, are admitted. An immutable binding adopts the declared carrier and retains facts about its initializer after satisfying its declared type. Only a final, zero-argument `main` returning `int` can be public. The source checker rejects recursing, importing, publishing a refined signature, mutable aliases, and unsupported callable or expression forms. Existing type and numeric behavior remains in effect outside the profile.

```atto
define dimension Time;
define unit Millis: Time;

type PositiveMillis = i32
    where self > 0
    and units in Millis;

fnc halve(PositiveMillis duration) -> PositiveMillis
    requires duration >= 2<Millis>
    ensures result > 0<Millis>
    ensures result <= duration
{
    return duration / 2;
}

pub fnc main() -> int {
    val PositiveMillis duration = 84<Millis>;
    val half: PositiveMillis = halve(duration);
    return half / 1<Millis>;
}
```

## Verification rules

Each expression carries a signed carrier, a normalized unit, an interval bounding its normal results, and the immutable parameter values that bound it above. The compiler verifies compatible units and interval inclusion at immutable bindings, calls, and returns before erasing metadata. A contract literal carries the exact normalized unit of the operand it constrains. Plain integer literals start as dimensionless `int` values.

- Each `requires` constrains a named parameter by a constant. The callee may start with the resulting intersection. Every direct call must prove its argument lies within that interval.
- Each `ensures` bounds `result` by a constant or uses the same-unit comparison `result <= parameter`. At a normal return, the interval and relational facts must establish each clause. The caller receives the alias interval narrowed by declared postconditions and the declared upper relations to its actual arguments.
- An operation with an `i32` operand uses signed `i32` arithmetic and requires both operand intervals to fit. Use a wider typed binding of the same unit to select `int` arithmetic. Every `i32` addition, subtraction, multiplication, division, and negation checks its own result before a subsequent operation can use it. Signed division checks zero first. `MIN / -1` overflows at either width.
- Infer bounds for addition, subtraction, multiplication, and negation in mathematical integers and clip the result to the carrier. Infer truncating division from the endpoint quotients when the divisor interval excludes zero. At signed i64, use the full interval if `MIN / -1` is possible. If clipping would leave no normal result or a divisor could be zero, use the full carrier interval conservatively.
- Parameter reads establish the reflexive upper-bound fact. Immutable bindings preserve the initializer's facts. A sum preserves an upper bound on its left operand for a nonpositive right operand. A difference does the same for a nonnegative right operand. Dividing a nonnegative quantity by a positive dimensionless integer preserves the numerator's upper bounds. Unit compatibility still follows the quantity rules. Independent interval comparison can also establish `result <= parameter`.
- A failed proof produces a compile-time diagnostic. Arithmetic remains checked at execution, and a postcondition applies only to normal returns. These rules do not establish absence of arithmetic failure or authorize removing checked instructions.

## Explicit checked casts

`expression as Target` checks both inclusive bounds of a declared refinement or scalar carrier. The source and target must have identical normalized dimensions and scale. A cast evaluates its operand once before performing the signed bounds check. Success preserves the numeric value, adopts the target carrier, and establishes the intersection of the source and target intervals on normal continuation. The checker retains the source's relational upper bounds. If the inference finds an empty intersection, it conservatively uses the target interval for normal results, and the executed cast fails. An out-of-range value terminates this standalone scalar program with a refinement failure.

For example, `val PositiveMillis timeout = read_timeout() as PositiveMillis;` accepts a value returned in milliseconds by a private helper with an unconstrained interval. The cast checks positivity and signed 32-bit representability. Bindings, calls, and returns still require static proof of any further constraints. `as` binds after arithmetic. Parentheses can make the checked value an operand in a larger arithmetic expression. The fallible `as?` form needs an `Option<T>` refinement representation and is outside this profile.

## Evidence

This dialect slice uses earlier-only calls and keeps helpers private so a caller cannot skip the verified signature by using the erased carrier. Tests inspect native guard blocks and private function metadata, then run the same source through the real language entry points. Z3 checks the example's local theorem and deliberate negative controls under [32-bit](../formal/verified-core/halve-i32.smt2) and [64-bit](../formal/verified-core/halve-i64.smt2) bitvector semantics. A separate [checked positive i32 model](../formal/verified-core/checked-positive-i32.smt2) checks both bounds against exact signed narrowing and tests the effect of dropping either check.

## Next integration boundaries

The target includes further sized carriers, mutable refinement invalidation, branch facts, independent proof receipts, checked ingress at typed import and deserialization boundaries, typed exports, and protocols. Those need their own semantic and execution evidence. This version covers file-local type and contract checking, including explicit checked casts.
