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

## Mandatory pipe delimiters (normative)

Every lambda or anonymous function **expression** MUST start with the opening
`|` token and MUST close its parameter list with the matching `|` token.
This applies equally in `const fnc` bindings, ordinary expression bindings,
call arguments, return expressions, and the bodies/arms of `match`, `switch`,
and `select`. Neither the annotation `: ReturnType`, the `->` body marker,
nor a surrounding expected callable type may substitute for either pipe.

```atto
const fnc exactly_one = |_| : int -> 5;       // valid: one ignored parameter
const fnc exactly_zero = || : int -> 5;        // valid: zero parameters
const fnc named = |x: int| : int -> x + 5;    // valid: named typed parameter
const fnc typed = |int x| : int -> x + 5;     // valid: type-first parameter
```

The following MUST be **syntax errors**, including when the lambda would be
otherwise well-typed:

```atto
const fnc invalid_one = _ : int -> 5;          // missing both pipes
const fnc invalid_two = _ -> 5;                // missing both pipes
const fnc invalid_three = x : int -> x + 5;   // missing both pipes
const fnc invalid_four = x -> x + 5;          // missing both pipes
```

The standalone `_` remains a wildcard *parameter* only inside a pipe-delimited
parameter list; it is not an arity-polymorphic lambda head. `|_|` accepts
**exactly one** ignored parameter; `||` accepts **exactly zero**; `|_, _|`
accepts **exactly two**. The type checker must not reinterpret a missing-pipe
expression as a callable, and the formatter must not silently repair it.
Ordinary uses of `_` outside the lambda-head grammar remain governed by their
own syntax rules. This is a syntax acceptance requirement, not evidence that
any backend currently executes closures.

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
