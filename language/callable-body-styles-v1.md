# Callable body styles: statement bodies and explicit :: comma tails (revision v2)

Status: **proposed breaking correction** (2026-11-15, draft PR #35) to the accepted
2026-11-15 callable-body contract. Previously, the unmarked `-> Type ... end`
also permitted an implicit-return comma sequence. This proposal **intentionally
changes** that rule: only an explicit header `::` enables comma sequencing and
implicit terminal-expression return. Backend support is independently gated;
this spec is not executable parity evidence.

## Accepted declaration spellings

The body rules apply to `fnc`, `routine`, class/actor methods, and
out-of-line `mtd` receivers; existing modifier and receiver checks still apply.

```atto
fnc foo() : int { return 5; }
fnc foo() : int -> { return 5; }
fnc foo() -> int { return 5; }

fnc foo() -> int
    const x: int = 3;
    ^ x + 2;
end

fnc foo() -> int ::
    let int x = 3,
    x + 2
end
```

The fourth form is an ordinary **semicolon statement body** and requires an
explicit `return` or `^` on every non-void path. The fifth form is an
**Erlang-inspired comma sequence**: its final expression implicitly supplies
the function result. `::` is a callable-header body-mode marker, not a
standalone expression operator.

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
        const result = a / b;
        ^ result;
    end
    square(int x) -> int :: x * x end
end

mtd (self: Calculator) add(int a, int b): int { return a + b; }
mtd (self: Calculator) subtract(int a, int b): int -> { return a - b; }
mtd (self: Calculator) multiply(int a, int b) -> int { return a * b; }
mtd (self: Calculator) divide(int a, int b) -> int
    const result = a / b;
    ^ result;
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

The formatter must preserve the original **body mode** (braces, unmarked
semicolon/`end`, or `::` comma/`end`) unless an explicit conversion mode
rewrites control flow and verifies equivalent typing/effects/ownership. It
must never silently add/remove `::`, change separators or introduce implicit
returns. Receiver normalization and inline-method prefix removal must be
idempotent (format twice equals format once). The formatter must never merge
distinct signatures or change receiver mutability.

`->` is used in these callable headers and lambda bodies. `=>` remains the
fat arrow for callable *type* definitions/declarations; do not rewrite one
into the other.

**Return-first extension:** the accepted `fnc T <- name(params)` / `T <- name(params)` spellings and their `{}`, `begin`/`end`, and return-first statement/`end` bodies are specified in [return-first callable syntax v1](return-first-and-begin-callables-v1.md). That extension is in addition to the name-first body forms below, not permission to omit a return annotation or to reinterpret legacy comma/end tail returns.

## Body boundary and disambiguation

```ebnf
callable           = callable_head, return_spec, callable_body ;
return_spec        = (":", type_ref) | ("->", type_ref) ;
callable_body      = "{", c_statements, "}"
                   | "->", "{", c_statements, "}" (* only after : Type *)
                   | statement_sequence, "end"  (* only after -> Type without :: *)
                   | "::", comma_sequence, "end" (* only after -> Type *) ;
statement_sequence = { statement_with_semicolon_or_safe_terminator } ;
comma_sequence     = comma_item, {",", comma_item} ;
comma_item         = statement_without_terminator | expression ;
```

A `-> Type` header followed by `{` selects a brace statement body. A
`-> Type` header followed by `::` selects a comma/tail body, **requiring**
a terminal value expression for non-void methods (unless all paths return
explicitly). Without either marker, `-> Type ... end` is an ordinary
semicolon-separated statement body and its trailing expression is **not**
returned. `::` is legal only after a `-> Type` callable header, not after
a `: Type` header, nor after `{`. A `: Type -> {` spelling remains valid.
No speculative fallback from one body mode to another is allowed.

`::` in `pkg::method()` is a **qualified-name** token unrelated to
the callable-body marker. The already-defined `^ expr;` is a statement
shorthand for `return expr;`; it never changes the body mode.

## Statement separation and value semantics

- In brace and unmarked `end` **statement** bodies, statements use
  semicolons (or an existing unambiguous safe terminator), and non-void
  functions need explicit `return`/`^` on every reachable path. A bare
  expression at the end **never** returns implicitly.
- In a `::` body, the outer items are separated by **commas**, never
  semicolons or newlines; a terminal expression has the declared return type,
  is evaluated once, and is implicitly returned. No tuple is constructed.
  Empty items, leading/trailing commas and missing `end` are errors.
- A declaration is not an expression. In particular,
  `:: ^ const z: int = 5, z + 5 end` is **illegal**: `^` requires
  an expression (or a dedicated `seq` return), and `const` starts a
  local binding. The valid spelling is
  `:: const z: int = 5, z + 5 end`.
- `^`/`return` are still permitted for genuine **early exits** in
  a `::` body (e.g. from a conditional arm). They retain their ordinary
  cleanup/effects/ownership checks and must not turn the comma list into
  a second implicit return. A final explicit return is legal when properly
  terminated, but redundant compared with the plain terminal expression.
- Within nested `match/end`, `if/fi`, loops, call argument lists, tuples,
  `seq`, `begin/end` and `(> ... )`, commas retain the **innermost**
  grammar. A comma is not a global expression operator.
- `void` bodies retain ordinary fallthrough semantics; an implicit
  non-void result cannot be synthesized from a final declaration.
- The same rules apply to free `fnc`, `routine`, class/actor instance
  methods, static methods, and out-of-line `mtd` receivers. These body
  forms must not weaken any actor sealed-state check or borrow/cancellation
  restrictions.

## Required examples and rejection tests

```atto
define class Foo as
    rec1() -> int
        const z: int = 5;
        return z + 3;
    end

    rec2() -> int ::
        const z: int = 5,
        z + 5
    end
end
// rec1() == 8; rec2() == 10.
```

Tests MUST:

1. Admit all five body spellings in this chapter and verify executable
   result equivalence (and `rec1`/ `rec2` results) per backend.
2. Reject `-> int let x = 3, x + 2 end` in the unmarked mode:
   commas do not introduce implicit return.
3. Reject `-> int 5; end` for a non-void callable without an explicit return.
4. Reject `-> int :: let x = 3; x + 2 end`: semicolon cannot separate
   top-level items in a comma body.
5. Reject `-> int :: ^ const z: int = 5, z + 5 end`;
   `^ const` must not be a return expression.
6. Admit `-> int :: const z: int = 5, z + 5 end` and check the result
   is exactly 10; check a trailing nested `(> ... )` similarly.
7. Reject `: int ::`, `-> int :: {`, missing `end`, trailing commas,
   empty items, mismatched return types and impossible fallthrough.
8. Admit explicit early `^`/`return` inside reachable branch bodies without
   accidentally returning from a nested lambda.
9. Preserve lexical scope, once-only evaluation, named argument and tuple
   comma disambiguation, ownership/effect checks and cleanup.
10. Require identical parsing/formatting for `fnc`, `routine`, inline
    class methods and out-of-line `mtd`, but report guest execution and
    backend support separately. Format twice must equal format once.

## Compatibility and rollout

Existing brace-style declarations remain valid and unchanged. **Migration:
unmarked `-> Type` comma bodies written under the earlier accepted
contract must add `::`, or be rewritten as semicolon statements with explicit
`^`/`return`. This is a source-compatibility change. No working edition/version flag is yet
specified or implemented in the compiler. **Do not merge the strict compiler
behavior as a silent default change.** A later PR must implement a versioned
admission gate and a formatter migration mode, and show tests that both old
and new sources behave correctly in their selected language versions. See
[the migration decision](callable-body-migration-v2.md).** `routine`
retains its direct-call-only/non-first-class intent and does not acquire
recursion guarantees solely from this syntax. `mtd` out-of-line receivers
are currently syntax-only in the Rust browser compiler; accepting a
header is not evidence that a guest Wasm method executes. Rust, Wasm,
Java, LLVM, .NET, Forge, the formatter, and playground should publish
their own tested capability status and a shared positive/negative
conformance corpus before declaring parity.
