# Java-style failure clauses, return-type placement, and body delimiters (v1)

**Status:** accepted source grammar proposal (2026-11-17). This extends
[checked-throws-annotation-v1.md](checked-throws-annotation-v1.md) and
[callable-body-styles-v1.md](callable-body-styles-v1.md).
Compiler/back-end admission is independently gated; syntax alone never proves
runtime failure transport or compiler conformance.

## Declaration examples

```atto
// Return before effects: body delimiter must be explicit.
pub fnc load_config(path: String) -> Config
    throws IOError, ParseError
    raises RecoveryError
begin
    return parse_config(read_file(path));
end

// Same semantics with braces.
pub Config• load_config(path: String)
    throws IOError, ParseError
    raises RecoveryError {
    return parse_config(read_file(path));
}

// Return after effects: the return type closes the signature.
pub fnc load_config(path: String)
    throws IOError, ParseError
    raises RecoveryError -> Config
    return parse_config(read_file(path));
end

// Optional begin is also accepted here.
pub fnc load_config(path: String)
    throws IOError, ParseError
    raises RecoveryError -> Config
begin
    return parse_config(read_file(path));
end

// Equivalent effect declarations attached to the callable.
@Throws(IOError, ParseError)
@Raises(RecoveryError)
pub fnc load_config(path: String) -> Config {
    return parse_config(read_file(path));
}
```

## Return-first examples with optional `begin`

The following are **alternatives**, not duplicate declarations in one scope.
A nonvoid ordinary-statement body requires explicit `return`; the legacy
name-first comma-tail body still has its separate implicit result semantics.

```atto
fnc int <- double_answer(int value)
    return value * 2;
end

fnc int <- double_answer(int value) ::
    return value * 2;
end

fnc int <- double_answer(int value)
raises Foo
begin
    if value > 3 then
        raise! new Foo();
    fi
    return value * 2;
end

fnc int <- double_answer(int value)
raises Foo ::
    if value > 3 then
        raise! new Foo();
    fi
    return value * 2;
end
```

`raise!` is the newer canonical spelling being tracked in
[exception-control bang spellings](../language/exception-control-bang-spellings-v1.md).
The Error subclass `Foo`, checked raises effect and runtime unwind must be
implemented and executed in the relevant backend; **this is not browser guest
execution evidence**.

## Grammar and disambiguation

- The full language accepts a case-sensitive `throws` or `raises`
  followed by a comma-separated list of nominal Error types, or a
  parenthesized compatibility list, e.g. `throws(E1, E2)`.
  `panics` follows the same declaration placement rules.
- Uppercase `@Throws(...)`, `@Raises(...)`, `@Panics(...)`
  are attached annotations. Their lowercase predecessors remain accepted
  for compatibility; the formatter canonically emits inline keywords.
  The checked effect rows are identical irrespective of placement.
- `T• name(...)` is a type-prefix function or method. No source
  declaration may supply multiple return types.
- An inline effect clause that **follows** `-> T`, `: T`,
  `T•`, or `T <-` requires an unambiguous body boundary:
  `{`, `begin`, or the exact `::` separator. For `::`,
  the ordinary statement body starts on a later physical line.
  Without effects, return-first `T <- name(...)` and `T • name(...)`
  also permit newline-started statements through `end` without
  either `begin` or `::`. These are preferences, not different ABIs.
- If the last header clause is instead `-> T` **after** all inline
  effect clauses, the body may use `{`, `begin ... end`, or
  a *physical newline* followed by statements and `end`.
  The first body token must occur on a later line than the final
  return-type token. Comments and blank lines between them are allowed.
  A same-line body without an explicit opener is rejected.
- `raises Foo ::` and `throws E1, E2 ::` terminate the entire
  effect header. `::` is forbidden inside an error-type list, after
  an already-opened body or twice in one declaration. No effect
  clause can appear after `::`.
- The optional-`begin` newline/`end` body has ordinary
  semicolon/newline statement semantics and explicit `return`.
  It is **not** the earlier comma-separated Erlang-style body. Preserve
  existing comma-tail inference for unaffected `fnc f() -> T`
  signatures.
- A trailing `-> T` after effects closes the header; no additional
  effect clauses may follow it. Nested generics and callable return types
  must use balanced parsing so `->` within a type is not mistaken
  for this final clause.
- A declaration ends at its matching `}` or `end`, with nested
  `match/end`, `if/fi`, and `try/catch` blocks consumed independently.
- The formatter preserves the body family. It may reorder `throws`
  before `raises`, but must not alter resolved effect types, change
  an explicit statement return to an implicit comma-tail return,
  or insert/delete `begin` or `::` without proven parser and
  effect-equivalence. Retain the author's body-boundary choice by default.

## Safety obligations and target boundary

All declared ordinary errors must have `Error & Throwable` ancestry,
all raised errors `Error & Raisable`, and all panics
`Error & Panicable`. Each effect declaration denotes an explicit
upper bound; duplicates across annotations and keywords are errors.
Compile-time checking must track transitive/callback/receiver effects,
and may not erase residual failure effects when trapping only throws.

Full AttoLang HIR must retain the nominal error type set for each kind,
not merely a three-bit effect-presence mask. This specification does
not imply a compiler accepts user-defined subclasses or performs
raise/panic runtime unwinding. Browser acceptance initially remains
limited to the built-in `Error`, with any unsupported subtype
rejected before guest-artifact emission.

## Required conformance corpus

Positive: each body family with both return-type placements; prefix
`T•`, class instance methods and out-of-line `mtd`; annotation
equivalence; multiline generic types; nested end/fi; comments/blank
lines between signature and body; deterministic formatter round-trip.

Negative: missing `begin`/`::`/brace boundary for return-before-effects;
`raises Foo :: throws Bar`; duplicate `::`; same-line
implicit statement body after trailing return; missing `end`; dual
return types; repeated effect kinds; duplicate error type in a list;
invalid error ancestry; unsupported nominal types; effects illegally
added by overridden methods; unresolved callbacks silently treated as
pure; actor failure paths claiming unsupported supervisor transport.
