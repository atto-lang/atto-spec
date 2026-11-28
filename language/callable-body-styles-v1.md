# Callable body styles: C braces and Erlang-like comma sequences (proposal v1)

Status: **accepted syntax contract** (2026-11-15). Compiler support is independently
gated. Acceptance does **not** imply executable parity across backends.

## Effectful header extension (2026-11-17)

The grammar below describes the **unchanged legacy callable body families**.
When a signature contains inline `throws`/`raises`/`panics` clauses or structured `effects { ... }` / `budget { ... }` contracts,
the more specific
[java-style failure signature and body rules](java-style-failure-signature-bodies-v1.md)
apply: return-before-effects requires `{`, `begin` or `::`; a trailing
`-> T` after effects permits a newline-separated statement/`end` body
without `begin`. That form uses ordinary explicit-return statements,
not the comma-tail implicit-result semantics specified below.

This contextual delimiter applies only to the effect-final and return-first forms defined by that proposal; it does not change the legacy or opt-in v2 name-first `-> Type ::` comma-tail body semantics. Neither grammar grants implicit effect or ownership authority.

## Accepted declaration spellings

The body rules apply to `fnc`, `routine`, class/actor methods, and
out-of-line `mtd` receivers; existing modifier and receiver checks still apply.

```atto
fnc foo() : int { return 5; }
fnc foo() : int -> { return 5; }
fnc foo() : int -> 5;
fnc foo() -> int { return 5; }

fnc foo() -> int
    let int x = 3,
    x + 2
end

fnc foo() -> int ::
    let int x = 3,
    x + 2
end
```

The fourth/fifth forms are **Erlang-like**, not Erlang syntax or a new
evaluation strategy. They return the value of the terminal expression.

## Inline methods, out-of-line receivers and formatting (accepted)

All five body styles above apply identically to inline instance methods and
out-of-line `mtd`, with existing class/actor state and effect restrictions.
Class/actor instance methods may be written as `name(...)`, `fnc name(...)`,
or the legacy `method name(...)` declaration. The formatter canonically
**removes the redundant `fnc` / `method` prefix** inside a class or actor,
but retains `static fnc` for static functions.

```atto
define class Calculator as
    add(int a, int b): int { return a + b; }
    fnc subtract(int a, int b): int -> { return a - b; }
    multiply(int a, int b) -> int { return a * b; }
    divide(int a, int b) -> int
        let int result = a / b,
        result
    end
    square(int x) -> int :: x * x end
end

mtd (self: Calculator) add(int a, int b): int { return a + b; }
mtd (self: Calculator) subtract(int a, int b): int -> { return a - b; }
mtd (self: Calculator) multiply(int a, int b) -> int { return a * b; }
mtd (self: Calculator) divide(int a, int b) -> int
    let int result = a / b,
    result
end
mtd (self: Calculator) square(int x) -> int :: x * x end

mtd (mut self: Calculator) increment() -> int ::
    self.count = self.count + 1,
    self.count
end
```

The inline and out-of-line examples are alternative ways to declare an
implementation: **do not declare an identical owner/name/arity signature both
inline and out-of-line**. Mutability, ownership, and actor critical-state
checks apply before lowering. An actor's sealed state may not be accessed by
direct `self.field` operations merely because the method uses an Erlang body.

The following out-of-line *receiver headers* are accepted synonyms:

```atto
mtd (self: Calculator) square(int x) -> int :: x * x end
mtd (Calculator self) square(int x) -> int :: x * x end
mtd (Calculator) square(int x) -> int :: x * x end
mtd (Calculator _) square(int x) -> int :: x * x end
```

These are four **alternative declarations**, not four overloads to co-exist.
`(self: Calculator)` and `(Calculator self)` explicitly bind `self`.
`(Calculator)` and `(Calculator _)` are the implicit-receiver variants.
The canonical printer normalizes `(Calculator self)` to
`(self: Calculator)`, and `(Calculator _)` to `(Calculator)`. Explicit
mutable receivers use `(mut self: Calculator)`; no mutable receiver may be
silently inferred from a nominal spelling.

The formatter must preserve the original **body family** (braces versus
comma/`end`) unless explicitly asked to convert it; it must not insert
implicit returns into C-style blocks or replace Erlang sequence commas with
semicolons. Receiver normalization and inline-method prefix removal must be
idempotent (format twice equals format once). The formatter must never merge
distinct signatures or change receiver mutability.

`->` is used in these callable headers and lambda bodies. `=>` remains the
fat arrow for callable *type* definitions/declarations; do not rewrite one
into the other.

**Return-first extension:** the accepted `fnc T <- name(params)` / `T <- name(params)` spellings and their `{}`, `begin`/`end`, and return-first statement/`end` bodies are specified in [return-first callable syntax v1](return-first-and-begin-callables-v1.md). That extension is in addition to the name-first body forms below, not permission to omit a return annotation or to reinterpret legacy comma/end tail returns.

## Inline single-expression arrow body (accepted target contract)

The one-expression form `fnc name(args): T -> expression;` is an alternative to a
braced body. It evaluates the expression exactly once and implicitly returns its
value, subject to the same declared return type, call arity, ownership, borrow,
effect, overflow, and evaluation-order checks as `{ return expression; }`.
The trailing semicolon **is mandatory**; it is a callable-body delimiter, not
a separator that permits a second expression. A braced `: T -> { ... }` body
still requires an explicit return for non-`void` callables. The form applies
to supported named `fnc`, `routine`, and method declarations; backends must
independently prove each category before claiming executable support.

```atto
pub fnc double(int x): int -> x * 2;
pub fnc increment(int x): int -> x + 1;
pub fnc main(): int {
    val a = 20 |> double |> increment;
    val b = double <| 21;
    return a + b; // 83
}
```

This spelling is distinct from the established `fnc f() -> T` trailing
return-type header and Erlang-style `end` body. No implicit `end`, newline
termination, or implicit return from a brace block is introduced.
Reject missing semicolons, empty expressions, mismatched result types, and
`: T -> expression end`. Mixed `|>` and `<|` application chains require
parentheses rather than an implementation-defined grouping.

Functional application rules: `x |> f |> g` = `g(f(x))`, and
`f <| g <| x` = `f(g(x))`; `<|` is right-associative. A standalone
`f <| x` is `f(x)`. Both use ordinary checked function calls and never
denote continuous actor/channel routing (`pipe`/`rpipe`).

## Multi-argument functional application and signed-i64 edges

Functional `|>` and `<|` **insert the piped value as argument 0** of the
named callable. Any explicitly written arguments occupy subsequent positions,
in their original order. For the expression patterns below, the same ordinary
function-call arity, type, ownership and effect checks apply as to an explicit
call. No implicit currying or callable value is created.

```atto
fnc subtract(int value, int adjustment): int -> value - adjustment;
val a = 42 |> subtract(2);    // subtract(42, 2) => 40
val b = subtract(1) <| 22;    // subtract(22, 1) => 21
```

Likewise `f(a) <| (x |> g)` lowers to `f(g(x), a)`. The explicit
parentheses resolve otherwise mixed functional directions; mixing bare
`|>` and `<|` without grouping must fail. The left-hand `f(a)` in this
reverse-pipe context is a *syntactic call target with pre-applied arguments*,
not an eagerly invoked partial function or a dynamically allocated closure.
Piped values and subsequent explicit arguments are evaluated exactly once in
the resulting argument order before entering the callable. Checked
arithmetic/control effects cannot silently disappear, reorder or wrap.
Continuous actor `pipe`/`rpipe` remains a distinct operator family.

For signed 64-bit `int`, `-9223372036854775808` is a valid negative
literal, even though its positive magnitude does not itself inhabit
`int64`. A compiler must not reject the negative minimum merely because
its host literal parser cannot represent `+9223372036854775808`.
Both `+9223372036854775808` and `-9223372036854775809` are out of
range and must fail source admission with no runnable artifact. Arithmetic
overflow of two valid operands (for example `INT64_MAX + 1`) is a
**runtime checked failure**, not modulo wraparound and not silently treated
as source-literal overflow; its exact transport depends on the target ABI.

These additional cases live in
`conformance/functional-pipelines-v1/edge/cases.json`. They extend
the eight pinned primary fixtures, rather than rewriting the primary
acceptance set or granting any backend a pass without compiled-guest evidence.

## Pure scalar compilation cannot reclassify concurrency control

The pure signed-int64 pipeline subset is not permitted to interpret
`sync`, `task`, or `yield` as ordinary callable, parameter-binding, or
local-binding identifiers. Those spellings are reserved by the
concurrency/task/generator language family and must never gain
ordinary scalar-function authority simply because they appear next
to `|>` or `<|`.

Until a production compiler implements the corresponding typed,
ownership-checked, effect-aware constructs, a scalar-only frontend
must reject all nine combinations (three words × three binding
positions) **before emitting executable output**. This is an
admission-boundary requirement, not proof of task, scheduler,
generator, or TenantVM runtime support.

## Body boundary and disambiguation

```ebnf
callable          = callable_head, return_spec, callable_body ;
return_spec       = (":", type_ref) | ("->", type_ref) ;
callable_body     = "{", c_statements, "}"
                  | "->", "{", c_statements, "}"  (* only after : Type *)
                  | "->", expression, ";"    (* only after : Type *)
                  | ["::"], erlang_sequence, "end" (* only after -> Type *) ;
erlang_sequence   = erlang_item, {",", erlang_item} ;
erlang_item       = statement_without_terminator | expression ;
```

A `-> Type` header followed by `{` unambiguously selects C-style.
The optional `::` after `-> Type` selects Erlang-style explicitly;
otherwise the absence of `{` selects Erlang-style. A `: Type` header
does **not** implicitly select Erlang-style. A body-opening `->` following
`: Type` requires either `{` for a statement block or exactly one expression
terminated with `;`. Neither `::` nor a second `->` may be used
as an expression operator. The parser must not fall back to another
interpretation after encountering malformed delimiters.

## Statement separation and value semantics

- Within C-style braces, preserve existing semicolon and safe-newline
  statement termination. C-style expression statements do **not**
  implicitly return.
- Within the outer Erlang-style sequence, use a comma between items.
  A newline is whitespace, not a substitute for a comma. A semicolon
  is not an outer sequence separator. Trailing commas and empty items
  are invalid. An explicit `return` is allowed but not required.
- A terminal expression in an Erlang-style non-`void` callable acts
  exactly like `return expression`: evaluate it once, check its type
  against the declared return type, and apply the normal ownership,
  control-flow and cleanup rules. Earlier expressions are evaluated
  for effects and their results discarded.
- For `void`, a final expression is an ordinary expression statement,
  not a value-return. Non-`void` paths without a terminal expression
  or explicit return must fail type/control-flow checking.
- Nested `if/fi`, `match/end`, `while/done`, function arguments,
  lists and tuples retain their own delimiter grammars. Commas inside
  nested expressions are not outer statement separators. In particular,
  conditional comma-as-AND stays scoped to conditional parsing.
- The explicit `::` form is recommended for a multi-line body when
  a declaration boundary could be confused with the body beginning.

## Rejection and safety tests

All backends and the formatter should test the following:

1. Each of the six examples above returns 5; the inline `: int -> 5;`
   form returns 5 with checked implicit-return typing.
2. `fnc f() : int { 5; }` does not gain implicit return.
3. `fnc f() -> int :: 3, 2 + 3 end` returns 5.
4. Reject a missing `end`, a trailing comma, adjacent items without
   comma, a top-level semicolon in Erlang-style, and `: int ::`.
5. Reject `fnc f() : int -> 5 end`: an unbraced `: int ->` body requires
   a single expression followed by a semicolon.
6. Reject a non-`void` Erlang body that can fall through without a
   result, and enforce return-type and ownership checks for its tail.
7. Keep argument commas (e.g., `sum(2, 3)`) distinct from sequence
   commas; properly consume nested `if/fi` and `match/end`.
8. `fnc`, `routine`, class methods and out-of-line `mtd` must use
   equivalent syntax recognition, but executable claims require **actual
   tested lowering** for that callable category.
9. Inline `fnc`/`method` prefix normalization and both named receiver spellings
   round-trip to one canonical form, including `mut self` and implicit `_`.
10. Reject duplicate owner/name/arity across inline versus out-of-line methods;
    actor sealed-state/critical guards remain enforced in every body family.

## Compatibility and rollout

Existing C-style declarations remain valid and unchanged. `routine`
retains its direct-call-only/non-first-class intent and does not acquire
recursion guarantees solely from this syntax. `mtd` out-of-line receivers
are currently syntax-only in the Rust browser compiler; accepting a
header is not evidence that a guest Wasm method executes. Rust, Wasm,
Java, LLVM, .NET, Forge, the formatter, and playground should publish
their own tested capability status and a shared positive/negative
conformance corpus before declaring parity.

## Opt-in v2 body mode (draft)

The legacy v1 grammar above remains the default. With an explicitly selected v2 edition only, an unmarked `-> Type ... end` body is statement-oriented and non-void paths require `return` or contextual `^`. An explicit `::` selects a comma body with implicit tail return. The `: Type -> expression;`, return-first, receiver, effect and ownership contracts above are unchanged. No edition inference from nested commas, no implicit format migration, and no change to package defaults is authorized. See [the v2 migration contract](callable-body-migration-v2.md) and [sequence contract](return-shorthand-and-sequences-v1.md). A terminal binding is not a return value; bare return commas cannot consume a `::` body's separators. Test both modes independently, including negative fallthrough, trailing commas, nested scopes, and receiver checks. Cross-backend parity is not established.
