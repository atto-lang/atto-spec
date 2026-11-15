# Lambda return type annotations and body syntax (v1)

**Canonical syntax:** `|parameters| : ReturnType -> body`. The optional
` : ReturnType` annotates the lambda's result, *not* its arguments. Inference
is preferred wherever context and the body determine the result type.

```atto
val values = rx.Observable.from_iter([1, 2, 3, 4, 5]);
val small_doubled = values
    .filter(|n| : bool -> return n < 4;)
    .map(|n| : int -> return n * 2;)
    .take(2);
```

## Accepted forms

The standalone underscore form is an **arity-polymorphic discard lambda**:

```atto
val always_five = _ : int -> 5;           // matches 0..MAX_PARAMS arguments, ignores all
val inferred_five = _ -> 5;               // result type inferred from body
val exactly_zero = || : int -> 5;        // accepts exactly zero
val exactly_one = |_| : int -> 5;       // accepts exactly one, discarded
val exactly_two = |_, _| : int -> 5;   // accepts exactly two, both discarded
```

For direct calls, `always_five()`, `always_five(10)`, and
`always_five(true, 10)` all produce `5`. Each call site resolves to a
**concrete signature**; this is **not** an unconstrained runtime variadic ABI.

```atto
.map(|n| -> n * 2)                        // inferred, expression body
.map(|n| : int -> n * 2)                  // explicit, expression body
.map(|n| -> return n * 2;)               // inferred, statement body
.map(|n| : int -> return n * 2;)         // explicit, statement body
.map(|n| -> int { return n * 2; })       // original braced form
.map(|n| => int -> return n * 2;)        // legacy, still accepted
```

A braceless `return` statement requires its semicolon **inside** an enclosing
call before the closing `)`. Expression bodies implicitly return their
value and do not need an interior semicolon. Multiple statements use braces.

## Grammar

```ebnf
lambda            = "|", [parameters], "|", [":", result_type], "->", lambda_body
                  | "|", [parameters], "|", "=>", result_type, "->", lambda_body
                  | "_", [":", result_type], "->", lambda_body ;
parameters        = identifier, {",", identifier} ;
result_type       = type_reference ;
lambda_body       = expression | "return", expression, ";" | block ;
block             = "{", {statement}, "}" ;
```

The opening and closing parameter pipes and the following `->` distinguish
lambdas from the `|` conditional OR operator; parsing does not depend on type
name capitalization or symbol-table lookups. Qualified and nested generic
return types are admitted syntactically. A formatter should canonicalize the
legacy `=>` typed form to the colon typed form, while preserving inferred
annotations and braced versus braceless bodies where possible.

## Typing and safety contracts

- Return type inference uses the surrounding expected callable signature and
  typed body, never an unbound arbitrary runtime value.
- An explicit return annotation is checked against all return paths, including
  implicit expression returns. Conflicting returns are compile-time errors.
- Named parameters are scoped to their lambda. Repeated named parameter names are errors.
- Each pipe-delimited `_` is one distinct discarded parameter (including repeated
  occurrences). It cannot be referenced from the body.
- Only a **standalone** `_` outside parameter pipes has the zero-or-more
  wildcard meaning; it matches any concrete caller/callback arity from zero
  through the backend's bounded maximum, and exposes no argument names.
- Contextual typing of a wildcard callback needs an **exact expected callable
  signature**; without one it fails with an inference error. A direct-call
  compiler may infer a concrete argument signature per call site and reuse
  specialized functions for equal signatures. Every specialization must
  preserve left-to-right evaluation, evaluate each argument once, and discard
  it only after its normal expression effects.
- No wildcard lambda may evade arity/complexity limits, act as a dynamic
  variadic-array collector, or alter `_` in match/sequence patterns.
- Typed callable values, escaped callbacks, actor transport, and runtime
  polymorphism are not enabled merely by this syntax; unsupported lowering
  must fail closed instead of fabricating a signature.
- Capture/borrow lifetime and actor isolation checks apply before lowering a
  lambda across actor, worker, or asynchronous boundaries.
- Callback evaluation is once per invocation; no eager evaluation of lambda
  bodies while building the Rx pipeline.
- The parser must not reinterpret malformed lambda signatures as bitwise OR
  or partially accept a missing statement semicolon.

## Current compiler availability

`atto-source.rs` implements **syntax-only AST parsing** for these forms and
implements bounded direct noncapturing lambda calls and type checks
contextual callable signatures. The wildcard form specializes direct calls
per concrete scalar argument signature; general escaped callable values,
closures with captures, Rx runtime, and dynamic variadic dispatch remain
separate features requiring verified CI before claiming cross-backend parity.
The browser playground's pinned Wasm runtime may lag the Rust compiler branch.
