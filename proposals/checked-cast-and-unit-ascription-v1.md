# Checked casts and unit ascription

Status: user-approved syntax direction, candidate implementation. Extends the existing checked cast semantics and Verified Core unit-attachment proposal. No change to the safety judgment.

~~~atto
val a = 21::<i64>;
val b = <i64>21;
val c = 21 as i64;
val duration = 21::<i64>.<Second>;
val distance = (<i64>21).<Meter>;
val weight = 21.<Kilogram>;
~~~

The three checked cast spellings elaborate to the same typed cast operation for the same operand and target. Prefix angle cast binds at unary precedence, postfix double-colon angle cast binds at postfix precedence, and as retains its existing precedence. Thus parentheses are needed when casting a whole binary expression, and to attach a unit to the result of a prefix cast. Numeric, nominal, refinement, ownership and effect checks retain their existing semantics; no unchecked narrowing or unit erasure. Evaluate the operand once. An unimplemented target or conversion must fail closed, not be accepted as an identity cast.

The postfix dot-angle operator attaches a resolved concrete unit to a dimensionless scale-one number without changing the numeric value or carrier. It is not a type cast or assertion. Preserve compact literals 21<Second>, keyword unit attachment (21 as Second), and the already executed legacy 21::<Second> attachment when the target unambiguously resolves to a unit. The formatter should prefer dot-angle in new unit examples, preserve source spelling by default, and never change meaning. Reject a target-name collision rather than guess a type/unit namespace. Prefix <Unit>x is not a unit attachment. Use explicit to_unit for conversion. No affine/float or dynamic conversion support is implied by this syntax alone.

Lexer: distinguish digits-dot-angle from decimal fractions and ordinary member access; do not re-tokenize comparison, range, callable-header double colon, or generic-call grammar. Preserve existing generic-call admission and ordinary colon ascription. A dot-angle target must resolve as a unit, not an arbitrary type. Keep explicit cast target grammar and existing diagnostic categories. Reject malformed and unknown targets, void casts, illegal ownership and range conversions, implicit unit erasure, repeated attachment, residual non-one scale, and wrong-kind targets. No runtime reflection or JIT needed.

Conformance: prove each admitted target against as using real compiler guest execution, operand evaluation exactly once, precedence, grouping and chaining, signed extrema, existing numeric conversion behavior, comparison/generic/member/header controls, and unit attachment versus conversion. Preserve all earlier quantity cases. Formatter parity and unsupported backend admission remain independently gated.

First Rust/Wasm slice: reuse existing checked cast AST and checker, with i64 as cast-site spelling for the int carrier. In the restricted quantity profile, only int/i64 identity scalar casts are admitted; other carriers/refinements are separate work. Existing general cast checker capabilities (such as int to float) are not expanded to unsupported numeric casts. Unit-bearing float and i32 quantity representations and the full generic double function are not certified by this slice.
