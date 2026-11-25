# Canonical Boolean operators — AttoLang V1

**Status:** reconciled target contract; backend implementation and guest parity require independent exact-head evidence. Supersedes the [2026-11-12 proposal](BOOLEAN_OPERATORS_HISTORICAL_2026-11-12.md) and follows the merged [operator spelling decision](../language/bitwise-and-stream-operators-v1.md).

| Form | Meaning | Evaluation |
| --- | --- | --- |
| `a && b` | Boolean conjunction | left first; skip right if false |
| `a || b` | Boolean disjunction | left first; skip right if true |
| `Xor(a,b)` | Boolean exclusive disjunction | eager, left first, exactly once each |

Operands must be bool; no implicit conversion or truthiness. Comparison binds tighter than &&, which binds tighter than ||. Both infix operators associate left to right; parentheses override precedence. Xor is an explicit call, not an infix precedence level. Both operands must typecheck even when one is skipped at runtime.

Neither uppercase nor lowercase word operators are newly reserved by this decision. Historical AND/OR/XOR, comma and pipe spellings require profile-specific migration; do not silently rewrite effects. Integer `^^` is not Boolean XOR, and single caret is statement return, never binary power or XOR. Bare ampersand/pipe are not canonical Boolean operators.

The historical scalar And/Or intrinsic short-circuit proposal is **not** a verified portable function-call behavior; retain existing profile-specific semantics until separately reconciled. Xor(bool,bool) evaluates both inputs, exactly once in order. No variadic overload, shadowing rule or extra grammar is introduced here.

## Verification

Run `node tests/boolean-operator-reference.mjs` for typed truth tables, short-circuit traces, eager Xor and negative coercion checks. This is a host reference model, not an Atto parser, compiler or runtime proof. For each backend require exact source head/tree, executed positive and negative guest tests, effect order and formatter evidence; record PASS/FAIL/UNSUPPORTED/NOT_EXECUTED without treating historical proposals as executed evidence.
