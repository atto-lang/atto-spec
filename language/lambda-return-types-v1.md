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

## Equivalent typed-parameter and void-return forms (accepted target)

The following four **local** declarations have the same two ordered formal
parameters and the same `void` return result. A trailing declaration semicolon
is accepted; a newline or a closing block delimiter may also terminate the
binding under the ordinary statement-boundary rules.

```atto
const v = |int foo, string x| -> {
    return;
};

const v = |foo: int, x: string| -> {
    return;
}

const v = |foo: int, x: string| -> void {
    return;
}

const v = |foo: int, x: string| : void -> {
    return;
}
```

These are **alternative declarations** of `v`, not four declarations to place
in one scope together. `int foo` and `foo: int` are interchangeable typed
parameter spellings and may be mixed in one parameter list. Parameter order,
name, type, mutability, capture/effect permissions and call ABI are unchanged.
The first two forms infer `void` from a body whose reachable returns are all
bare `return;` (or normal `void` fallthrough). The latter two explicitly
annotate `void`. The `-> void {` form is recognized as a result annotation
**only when the type is immediately followed by a braced body**, not an
expression returning a variable named `void`. The `: void ->` form is the
preferred explicit spelling; formatters may normalize provably equivalent
signatures to `|int foo, string x| : void -> {` without altering statements.

Local `const v` is an immutable binding. This **grammar contract is not a
claim** that every backend currently supports first-class closure storage,
escaping captures, or a file-scope `const v` declaration. Static callable
module declarations and their permitted initializers remain subject to the
separate module-constant/callable rules; implementations must report
unsupported semantic profiles instead of silently miscompiling the lambda.

## Grammar

```ebnf
lambda            = "|", [parameters], "|", [":", result_type], "->", lambda_body
                  | "|", [parameters], "|", "->", result_type, block
                  | "|", [parameters], "|", "=>", result_type, "->", lambda_body ;
parameters        = parameter, {",", parameter} ;
parameter         = identifier | type_reference, identifier | identifier, ":", type_reference ;
result_type       = type_reference ;
lambda_body       = expression | "return", [expression], ";" | block ;
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
- Parameters are scoped to the lambda. Repeated parameter names are errors. The
  parser must reject ill-typed or malformed formal annotations (including
  `void foo` and `foo: void`) before lowering, regardless of spelling.
- A bare `return;` indicates a `void` path; if every reachable return is
  bare or a permitted `void` fallthrough, the inferred result is `void`.
  Reject a valued `return expression;` in a `void` lambda and reject a
  bare return where a non-`void` signature is required.
- Both `-> void {` and `: void -> {` preserve a braced statement body.
  Reject missing braces after the legacy `-> Type` suffix and missing
  slim arrows after colon-annotated returns.
- Capture/borrow lifetime and actor isolation checks apply before lowering a
  lambda across actor, worker, or asynchronous boundaries.
- Callback evaluation is once per invocation; no eager evaluation of lambda
  bodies while building the Rx pipeline.
- The parser must not reinterpret malformed lambda signatures as bitwise OR
  or partially accept a missing statement semicolon.

## Current compiler availability

`atto-source.rs` has active draft work for typed parameters and bounded static
callable lowering; see compiler PRs #298 and #300. A parsed lambda is **not**
necessarily an executable first-class value. Full closure storage, capture,
actor-safe ownership, file-scope initializers and independent guest runs in
Java, LLVM, .NET, Wasm, Forge, JS and Cranelift require separate verification.
Do not mark any backend passed without exact-head compiler and guest receipts.
