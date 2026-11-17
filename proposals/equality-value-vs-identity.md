# Equality operators: value versus identity (draft)

> Status: proposal for review. This document does not claim compiler implementation or backend parity.

## Decision

| Operator | Primitive operands | Reference operands |
| --- | --- | --- |
| `eq` | Compare values | Value equality via the applicable `equals()` contract |
| `neq` | Negation of `eq` | Negation of `eq` |
| `==` | **Compile-time error** | Compare object identity |
| `!=` | **Compile-time error** | Compare object identity inequality |

`==` means stable *object identity*, not physical memory address. Moving objects, arenas, and handles must preserve identity. Pointer comparison requires a separately specified pointer/provenance contract.

## Examples

```javascript
val int a = 10;
val int b = 20;
a eq b;    // false
a neq b;   // true
a == b;    // compile-time error: primitives have no reference identity
a != b;    // compile-time error

val User x = new User("Alex");
val User y = new User("Alex");
val User z = x;
x == y;    // false: distinct instances
x == z;    // true: same instance
x eq y;    // invokes value equality; true only if User.equals defines it
x neq y;   // logical negation of x eq y
```

## Compiler and runtime requirements

1. Parser: retain four distinct equality operator nodes/tokens; no silent rewrite from `==` to `eq`.
2. Type checker: reject `==` and `!=` for primitive values and non-reference value aggregates; require compatible reference identity domains.
3. `eq` on primitives: typed, deterministic value comparison; no user method dispatch.
4. `eq` on objects: resolve the applicable `equals()` method, checking visibility, return type `bool`, and non-suspending behavior. Specify null handling before implementation.
5. `neq` must be precisely the boolean negation of `eq`; `!=` the negation of `==`.
6. Formatter must preserve the operator choice. Diagnostics should suggest `eq` for primitive `==` and `neq` for primitive `!=`.
7. Compile-time and AOT implementations must agree across targets; do not require reflection or JIT.

## Review comments / questions

- **Numeric cross-type comparisons:** Should `1 eq 1.0` be accepted with exact numeric equivalence, or require explicit conversion? Avoid lossy implicit coercion.
- **Floating point:** Specify NaN, signed zero, and IEEE-754 rules for `eq` and `neq`.
- **Nullable references:** Decide whether null is compared by `eq`, `==`, or both, without invoking `equals()` on null.
- **Equality method contract:** Decide default object `equals()`, inheritance/override behavior, symmetry, hash consistency, and whether equality may throw.
- **Values versus references:** Define behavior for enums, strings, tuples, records, structs, symbols, and boxed primitives. A boxed primitive reference may have identity even though an unboxed primitive does not.
- **Pointers:** Explicitly distinguish raw address equality, provenance, and object identity; never assume `==` compares addresses.
- **Compatibility:** Audit existing `==` and `!=` uses; migration requires diagnostics and tests rather than a blind replacement.

## Required tests before ready for review

- Positive primitive `eq`/`neq` cases for integer, bool, float, char, including boundary values.
- Negative compile tests for primitive `==`/`!=`.
- Same-reference and distinct-reference identity tests; distinct objects with equal values.
- User-defined `equals()` dispatch, negation, missing/invalid method diagnostics.
- Null, NaN, signed zero, mixed numerics, symbols, value aggregates after semantic decisions.
- Parser/formatter round trips and cross-backend compile/run fixtures, with exact-head CI evidence.

**No tests are claimed to have run in this specification-only PR.**
