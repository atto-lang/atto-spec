# Canonical Boolean operators — AttoLang V1

**Status:** reconciled target contract; backend implementation and guest parity require independent exact-head evidence. Supersedes the [2026-11-12 proposal](BOOLEAN_OPERATORS_HISTORICAL_2026-11-12.md) and follows the merged [operator spelling decision](../language/bitwise-and-stream-operators-v1.md).

| Form | Meaning | Evaluation |
| --- | --- | --- |
| `a && b` | Boolean conjunction | left first; skip right if false |
| `a || b` | Boolean disjunction | left first; skip right if true |
| `Xor(a,b)` | Boolean exclusive disjunction | eager, left first, exactly once each |

Operands must be bool; no implicit conversion or truthiness. Comparison binds tighter than &&, which binds tighter than ||. Both infix operators associate left to right; parentheses override precedence. Xor is an explicit call, not an infix precedence level. Both operands must typecheck even when one is skipped at runtime.

Neither uppercase nor lowercase word operators are newly reserved by this decision. Historical AND/OR/XOR, comma and pipe spellings require profile-specific migration; do not silently rewrite effects. Integer `^^` is not Boolean XOR, and single caret is statement return, never binary power or XOR. Bare ampersand/pipe are not canonical Boolean operators.

## Named Boolean reductions (proposed portable target)

This section reconciles the requested scalar and array calls with the existing Java intrinsic tests. It is a target, not a claim of backend implementation. It does not introduce new infix operators or general user-defined variadic overloads.

| Resolved core call | Valid scalar arity | One array argument | Empty array |
| --- | --- | --- | --- |
| `And` | two or more bools | all elements true | true |
| `Or` | two or more bools | at least one true | false |
| `Xor` | two or more bools | odd count of true elements | false |

```atto
val bool scalar_xor = Xor(true, false);
val bool scalar_and = And(true, false);
val bool scalar_or = Or(true, false);
val bool array_xor = Xor([true, false]);
val bool array_and = And([true, false, true, true, true]);
val bool array_or = Or([true, false, true, false]);
```

The expected results are respectively true, false, true, true, false, true. XOR is parity, not “exactly one true”: three true inputs produce true, and two produce false. Singleton arrays return their element. A zero-argument call or a single scalar is invalid; `[]` receives contextual Boolean array typing. All scalar and array elements must statically be bool, including operands skipped at runtime. No integer truthiness, mixed scalar/array argument list, nested array, or implicit generic conversion is admitted by this contract.

For calls resolved to the core intrinsic identity, scalar And and Or evaluate left to right exactly once per reached argument, stopping at false or true respectively; scalar Xor evaluates every operand exactly once left to right unless a failure interrupts it. A single array expression is evaluated exactly once before reduction. In particular, array literal elements are evaluated normally in source order; an early decisive value does not skip a later effect or failure during construction. Reduction itself is read-only; borrowing a typed array must not consume, mutate, copy, or retain it. A temporary follows normal lifetime/drop rules.

Unqualified calls require no explicit import. Where the qualified `BooleanOps` intrinsic namespace is admitted, it has identical semantics. Resolve ordinary declarations/imports first according to the language's name resolution rules; never recognize an intrinsic solely from its short spelling. A same-named user function retains its own argument evaluation and ownership rules. General List/Slice, explicit generic arguments, and callable reification are outside this initial array contract unless independently specified.

Backends without the relevant aggregate/lifetime lowering must diagnose unsupported source before publishing artifacts. Scalar and array support are independent; acceptance, host-reference results, and actual compiled guest execution are distinct. Verify typed local declarations, dynamic inputs, nested calls, all truth vectors through length six, array reuse, empty/singleton arrays, late invalid operands, skipped versus reached failures, left-to-right order, non-Boolean rejection and shadowing. Run optimized and unoptimized paths and actual AOT/guest targets where available. Keep old profile-specific behavior explicitly identified until the portable target is integrated.

## Verification

Run `node tests/boolean-operator-reference.mjs` for typed truth tables, short-circuit traces, eager Xor and negative coercion checks. This is a host reference model, not an Atto parser, compiler or runtime proof. For each backend require exact source head/tree, executed positive and negative guest tests, effect order and formatter evidence; record PASS/FAIL/UNSUPPORTED/NOT_EXECUTED without treating historical proposals as executed evidence.
