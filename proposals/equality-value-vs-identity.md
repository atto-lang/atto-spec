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
x == y;    // false: distinct instances
x == x;    // true: same live instance
// val User z = x; would MOVE ownership; using x after that is invalid.
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

## Hardening notes (review candidate, not ratified)

### Operator typing and evaluation

- Evaluate the left operand once, then the right operand once, left-to-right; `neq` and `!=` must not evaluate either operand twice.
- `eq`/`neq` produce `bool`. On a nullable reference, first check for null: two nulls are equal, exactly one null is unequal; invoke `equals()` only for non-null operands.
- For references, `==`/`!=` must not invoke user code or allocate. Equality must remain stable across relocation and representation changes.
- Never implement `neq` by invoking a separate user-defined `not_equals()`; it is the logical complement of `eq`.
- A user-defined `equals()` must be callable without suspension and return exactly `bool`; reject ambiguous overloads. Error effects must be declared and propagated according to the language's effect rules rather than silently swallowed.
- Primitive numeric comparison must not use an implicit lossy cast. **Proposed default:** reject mixed primitive numeric types unless a common exact comparison is explicitly specified by the language; explicit conversion is always available.
- **Proposed IEEE floating-point rule:** NaN `eq` anything is false (including itself), NaN `neq` anything is true, and positive zero `eq` negative zero is true. Identity operators remain invalid on primitive floats.
- Distinguish reference-like types from nominal value classes and other aggregates; coordinate with the identity-free value-class specification before allowing identity comparisons.

### Review test matrix

| Fixture | Expected |
| --- | --- |
| `10 eq 10`, `10 neq 20` | true, true |
| `10 == 10`, `10 != 20` | compile-time error |
| `true eq true`, `'a' neq 'b'` | true, true |
| `1 eq 1.0` | compile-time error under proposed no-implicit-mixed-numeric rule |
| `nan eq nan`, `nan neq nan` | false, true under proposed IEEE rule |
| `+0.0 eq -0.0` | true |
| `ref_a == alias_a` | true |
| `ref_a == separately_allocated_equal_value` | false |
| `ref_a eq separately_allocated_equal_value` | calls resolved `equals()` |
| `nullable_null eq nullable_null` | true under proposed null rule |
| `nullable_null eq nonnull_ref` | false, no method dispatch |
| `lhs() neq rhs()` | each operand evaluated exactly once, in order |
| `value_struct_a == value_struct_b` | compile-time error when no reference identity |
| `x eq y` formatter round trip | same operator and meaning |

### CI admission protocol

1. Record exact source commit SHA and Git tree SHA before running tests.
2. First attempt source-org Actions and inspect actual job scheduling/completion; a queued or skipped job is not a pass.
3. If Actions budget blocks execution, use a permitted private alternate org/repo with available Actions minutes. Mirror the **exact source Git tree** into a temporary test branch, verifying each blob SHA, file mode, and tree SHA. Never depend on a cross-org checkout token or copy secrets.
4. Run parser, semantic, formatter, negative compilation, AOT runtime, and cross-backend conformance checks from that mirror. Record workflow run URL, SHA, test totals, failures, and any unavailable backend.
5. Do not mark this draft ready until semantic questions are resolved and real CI evidence exists. Clean up temporary mirror branches after evidence is retained.

**Verification status:** This document is a test plan, not an executed CI report.
