# Lambda return type annotations and body syntax (v1)

**Canonical typed inline syntax:** `|parameters| => ReturnType -> expression` (merged #172). The historical colon annotation is a compatible alternative. The optional
`=> ReturnType` annotates the lambda's result, *not* its arguments. Inference
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
and `select`. Neither the annotation `=> ReturnType` (or compatibility `: ReturnType`), the `->` body marker,
nor a surrounding expected callable type may substitute for either pipe.

```atto
const fnc exactly_one = |_| => int -> 5;       // valid: one ignored parameter
const fnc exactly_zero = || => int -> 5;        // valid: zero parameters
const fnc named = |x: int| => int -> x + 5;    // valid: named typed parameter
const fnc typed = |int x| => int -> x + 5;     // valid: type-first parameter
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
.map(|n| => int -> return n * 2;)        // canonical annotation; statement body remains separately admitted
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
val v = |int foo, string x| -> {
    return;
};

val v = |foo: int, x: string| -> {
    return;
}

val v = |foo: int, x: string| -> void {
    return;
}

val v = |foo: int, x: string| : void -> {
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
expression returning a variable named `void`. The `: void ->` form is a compatibility spelling for a braced statement body. Preserve the author’s body kind and only normalize provably equivalent signatures. Typed inline expression bodies prefer `=> T ->`; see [chapter 03](../spec/03-functions-and-effects.md#lambda-bodies-explicit-results-and-comma-sequencing).

Local `val v` is a fixed runtime binding. A typed `const` initializer requires compile-time proof under [chapter 27](../spec/27-implicit-const-and-const-mut.md); this grammar does not authorize runtime const fallback. This **grammar contract is not a
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
return types are admitted syntactically. For inline expression bodies, a formatter prefers `=> T ->` under #172; preserve braced/statement bodies and inferred annotations. The candidate comma-body grammar is separately profile-gated.

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
