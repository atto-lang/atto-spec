# Verified Core scalar refinements and contracts v1

Status: **candidate executable profile**. This slice extends [quantities v1](verified-core-quantities-v1.md) to immutable bindings, private calls, and function contracts in a standalone source file. The [Verified Core RFC](https://github.com/atto-lang/atto-source.java/pull/1799) defines the broader program.

## Admitted source

After optional file-local dimension and unit declarations, a standalone file opts into this profile with a prelude of `type Name = int where ...;` declarations. The carrier is signed i64. An alias is a structural constraint, independent of its spelling. Its clauses are `self <op> <signed integer>` and at most one `units in Unit`, joined by `and`. Operators are `<`, `<=`, `>`, `>=`, and `eq`. A predicate on `self` uses the coordinates of the alias unit. Contradictory intervals and repeated or unresolved unit declarations are errors.

Functions use type-first parameters, explicit result types, positional calls to earlier private helpers, immutable `val` bindings, and a terminal explicit return. Both binding orders, `val Type name` and `val name: Type`, are admitted. An immutable binding retains facts about its initializer after satisfying its declared type. Only a final, zero-argument `main` returning the unconstrained dimensionless carrier can be public. The source checker rejects recursing, importing, publishing a refined signature, mutable aliases, and unsupported callable or expression forms. Existing type and numeric behavior remains in effect outside the profile.

```atto
define dimension Time;
define unit Millis: Time;

type PositiveMillis = int
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

Each expression carries a normalized unit, an interval bounding its normal signed-i64 results, and the immutable parameter values that bound it above. The compiler verifies compatible units and interval inclusion at immutable bindings, calls, and returns before erasing metadata. A contract literal carries the exact normalized unit of the operand it constrains. Plain integer literals are dimensionless.

- Each `requires` constrains a named parameter by a constant. The callee may start with the resulting intersection. Every direct call must prove its argument lies within that interval.
- Each `ensures` bounds `result` by a constant or uses the same-unit comparison `result <= parameter`. At a normal return, the interval and relational facts must establish each clause. The caller receives the alias interval narrowed by declared postconditions and the declared upper relations to its actual arguments.
- For addition, subtraction, and multiplication, compute mathematical endpoint bounds and intersect with the representable range. For truncating signed division, compute the corner bounds only when the divisor interval excludes zero and the pair cannot be `MIN / -1`. Use the full interval when that proof is unavailable or when clipping leaves no normal result.
- Parameter reads establish the reflexive upper-bound fact. Immutable bindings preserve the initializer's facts. A sum preserves an upper bound on its left operand for a nonpositive right operand. A difference does the same for a nonnegative right operand. Dividing a nonnegative quantity by a positive dimensionless integer preserves the numerator's upper bounds. Unit compatibility still follows the quantity rules. Independent interval comparison can also establish `result <= parameter`.
- A failed proof produces a compile-time diagnostic. Arithmetic remains checked at execution, and a postcondition applies only to normal returns. These rules do not establish absence of arithmetic failure or authorize removing checked instructions.

This dialect slice uses earlier-only calls and keeps helpers private so a caller cannot skip the verified signature by using the erased carrier. Tests inspect both native and CIL lowering and run the same source through the real language entry points. A Z3 check of the example's local theorem and deliberate negative controls is in [formal/verified-core](../formal/verified-core/halve-i64.smt2). It establishes this particular arithmetic implication under bitvector semantics.

## Next integration boundaries

The target includes sized carriers, mutable refinement invalidation, branch facts, independent proof receipts, runtime checked ingress, typed exports, and protocols. Those need their own semantic and execution evidence. The scope of this version is file-local type and contract checking for normal execution.
