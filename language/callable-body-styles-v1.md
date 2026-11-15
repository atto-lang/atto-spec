# Callable body styles: C braces and Erlang-like comma sequences (proposal v1)

Status: **proposed normative contract**. Compiler support is independently
gated. This document does **not** claim executable parity across backends.

## Accepted declaration spellings

The body rules apply to `fnc`, `routine`, class/actor methods, and
out-of-line `mtd` receivers; existing modifier and receiver checks still apply.

```atto
fnc foo() : int { return 5; }
fnc foo() : int -> { return 5; }
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

## Body boundary and disambiguation

```ebnf
callable          = callable_head, return_spec, callable_body ;
return_spec       = (":", type_ref) | ("->", type_ref) ;
callable_body     = "{", c_statements, "}"
                  | "->", "{", c_statements, "}"  (* only after : Type *)
                  | ["::"], erlang_sequence, "end" (* only after -> Type *) ;
erlang_sequence   = erlang_item, {",", erlang_item} ;
erlang_item       = statement_without_terminator | expression ;
```

A `-> Type` header followed by `{` unambiguously selects C-style.
The optional `::` after `-> Type` selects Erlang-style explicitly;
otherwise the absence of `{` selects Erlang-style. A `: Type` header
does **not** implicitly select Erlang-style. A body-opening `->` following
`: Type` requires `{`. Neither `::` nor a second `->` may be used
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

1. Each of the five examples above returns 5.
2. `fnc f() : int { 5; }` does not gain implicit return.
3. `fnc f() -> int :: 3, 2 + 3 end` returns 5.
4. Reject a missing `end`, a trailing comma, adjacent items without
   comma, a top-level semicolon in Erlang-style, and `: int ::`.
5. Reject `fnc f() : int -> 5 end`: the `->` body marker requires braces.
6. Reject a non-`void` Erlang body that can fall through without a
   result, and enforce return-type and ownership checks for its tail.
7. Keep argument commas (e.g., `sum(2, 3)`) distinct from sequence
   commas; properly consume nested `if/fi` and `match/end`.
8. `fnc`, `routine`, class methods and out-of-line `mtd` must use
   equivalent syntax recognition, but executable claims require **actual
   tested lowering** for that callable category.

## Compatibility and rollout

Existing C-style declarations remain valid and unchanged. `routine`
retains its direct-call-only/non-first-class intent and does not acquire
recursion guarantees solely from this syntax. `mtd` out-of-line receivers
are currently syntax-only in the Rust browser compiler; accepting a
header is not evidence that a guest Wasm method executes. Rust, Wasm,
Java, LLVM, .NET, Forge, the formatter, and playground should publish
their own tested capability status and a shared positive/negative
conformance corpus before declaring parity.
