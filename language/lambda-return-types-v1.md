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
                  | "|", [parameters], "|", "=>", result_type, "->", lambda_body ;
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
- Parameters are scoped to the lambda. Repeated parameter names are errors.
- Capture/borrow lifetime and actor isolation checks apply before lowering a
  lambda across actor, worker, or asynchronous boundaries.
- Callback evaluation is once per invocation; no eager evaluation of lambda
  bodies while building the Rx pipeline.
- The parser must not reinterpret malformed lambda signatures as bitwise OR
  or partially accept a missing statement semicolon.

## Current compiler availability

`atto-source.rs` implements **syntax-only AST parsing** for these forms and
explicitly refuses unsupported closure/array execution on its browser Wasm
backend. Closure types, captured variables, actor-safe ownership, Rx runtime
and formatter normalization require separate implementation and verified CI
before calling the feature executable across backends.
