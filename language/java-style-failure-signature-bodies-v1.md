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
[exception-control bang spellings (draft spec #146)](https://github.com/atto-lang/atto-spec/pull/146).
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

## Flexible contract headers: effects, budget and result placement (2026-11-26)

**Accepted syntax target (language-owner direction); enforcement and compiler parity independently gated.** The inline contract sequence includes existing `throws`, `raises`, `panics`, and the structured `effects { ... }` and `budget { ... }` clauses. The same result annotation may occur before all clauses or after all clauses. These five forms are alternative declarations, not overloads. Placeholder comments below are schematic; a nonvoid executable fixture must supply a valid return on every reachable normal path.

```atto
fnc process_packet(Packet packet) -> Result<Response, Error>
    effects { allocate: 0, suspend: false }
    budget { stack: 4096, operations: 10000 }
begin
    // implementation
end
```

```atto
fnc process_packet(Packet packet)
    effects { allocate: 0, suspend: false }
    budget { stack: 4096, operations: 10000 }
-> Result<Response, Error>
begin
    // implementation
end
```

```atto
fnc process_packet(Packet packet)
    effects { allocate: 0, suspend: false }
    budget { stack: 4096, operations: 10000 }
-> Result<Response, Error>
    // implementation
end
```

```atto
fnc process_packet(Packet packet)
    effects { allocate: 0, suspend: false }
    budget { stack: 4096, operations: 10000 }
-> Result<Response, Error> {
    // implementation
}
```

```atto
fnc process_packet(Packet packet) -> Result<Response, Error>
    effects { allocate: 0, suspend: false }
    budget { stack: 4096, operations: 10000 }
{
    // implementation
}
```

The opening brace of a contract map belongs to that clause, not the executable body. Consume its balanced contents before looking for the next clause, result annotation or body opener. The executable brace may be on the same line as the last header token or a later line. Whitespace and comments do not change the signature. The final result annotation after one or more contract clauses permits a physical-newline ordinary statement body through matching `end` without `begin`. A return-before-contract signature requires an explicit body opener as in the existing failure-clause rule; do not extend implicit body opening to it in this amendment.

```ebnf
name_first_contract_header = named_head, ( return_before, contract_clause, { contract_clause }
                          | contract_clause, { contract_clause }, return_after ) ;
return_before = (":" | "->"), return_type ;
return_after = "->", return_type ;
contract_clause = failure_clause | effects_clause | budget_clause ;
effects_clause = "effects", "{", checked_effect_entries, "}" ;
budget_clause = "budget", "{", checked_budget_entries, "}" ;
(* Existing return_type, failure_clause and entry grammars apply. *)
```

For the before-contract alternative require a brace body, begin/end, or the existing explicit statement separator. For the after-contract alternative allow a brace body, begin/end, or a physical-newline statement/end body. The return type is mandatory exactly once. As in the established failure-signature grammar, the trailing result uses `->` (not `:`). No clauses may follow a trailing return annotation or occur after body opening. The implicit statement-body boundary is a physical newline after the last result-type token, not a newline within a generic type, comment, or contract map before that token. A same-line brace or `begin` remains explicit. Never recover from a malformed contract header by reclassifying its tokens as a body, a comma-tail expression, or an unannotated callable. Existing no-contract callable syntax, return-first prefix rules, explicit inline-expression forms and edition-specific comma-tail rules are unchanged. Nested generic and callable types and nested body delimiters must be parsed structurally, not by searching text for arrows or braces.

Normalize all five spellings to the same checked signature and ordinary-statement body in HIR; preserve source spans, effect rows, budget constraints, ownership, failure types and receiver/visibility. Syntax does not define new resource units, weaken any budget or grant effect authority. A backend without complete enforcement of a declared bound must reject before artifact emission rather than drop metadata. Duplicate clauses or duplicate map keys reject, as do malformed maps, missing/duplicate result annotations, invalid body boundaries and unmatched delimiters. Existing Error ancestry and transitive effect checks remain mandatory. Formatting preserves result placement, explicit body family and all clause contents by default; any optional normalization requires checked equivalence and idempotence.

### Additional conformance requirements

- Five independent source fixtures with an actual explicit return and identical observable output; a mixed header containing all five contract kinds with both result positions and each admitted body boundary.
- Test comments, blank lines, nested generic results, nested statement blocks, contract-map closing braces adjacent to body-opening braces, and brace opener on a separate line.
- Reject duplicated return/effects/budget clauses, repeated map keys, malformed/unclosed maps, clauses after trailing result or after body start, same-line implicit bodies, missing end, and ordinary nonvoid fallthrough.
- Enforce the same checked effects and resource ceilings in all equivalent variants; exercise rejected allocation/suspension or budget violations where the corresponding semantic profile defines them. No unchecked metadata erasure or backend-specific silent acceptance.
- Repeat across fnc/routine and applicable inline/static/out-of-line methods, formatter and browser frontend; require pinned compiled guest execution or negative no-artifact diagnostics from each supported compiler. Unsupported or unexecuted cases are not passes. These are test requirements, not execution receipts.

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
