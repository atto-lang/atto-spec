# Statement-match arm delimiters v1

**Status: TARGET / DRAFT.** The Rust/Wasm browser compiler PR at [atto-source.rs #187](https://github.com/atto-lang/atto-source.rs/pull/187) is the implementation candidate for statement matches. Structural `~` match patterns are still syntax-only / **NOT_EXECUTED**. A passing test for ordinary literal patterns is not evidence that structural matching works.

## Normative surface

Each statement-style match arm has a **self-contained body delimiter**. Its body can be either an explicit `end`-delimited statement sequence, or a braced statement block. The enclosing unbraced `match ... over` always terminates with its **own, additional** `end`.

```atto
// Arm-local end AND enclosing match end
match value over
    on is ~Point as val p ->
        process(p);
    end
    on _ ->
        fallback();
    end
end

// Braced arms, only the enclosing match needs end
match value over
    on is ~Point as val p -> {
        process(p);
    }
    on _ -> {
        fallback();
    }
end

// Both forms may coexist
do match value over
    on is structural Point as val p when p.x > 0 -> {
        process(p);
    }
    on _ ->
        fallback();
    end
end
```

The structural type-test and `~` aliases above are *target syntax*, not yet executable compiler features. They must not become a permissive dynamic shape lookup or a fallback `Any` match.

## Grammar (statement match, not value match)

```ebnf
statement_match   = ["do"], "match", ["first"], expression,
                    "over", { match_arm }, "end" ;
match_arm         = "on", pattern, ["when", expression],
                    "->", statement_arm_body ;
statement_arm_body = "{", { statement }, "}"
                   | { statement }, "end" ;
```

The `{ statement }` repetition above is **recursive**: a nested `if ... fi`, `match ... end`, or callable/body construct consumes its own closing delimiter before the arm parser looks for the arm-level `end`. Implementations MUST NOT split source by scanning for the next raw `end` token. Lexing inside strings/comments is already protected.

Empty arm bodies are valid in both styles: `on P -> { }` and `on P -> end`. An end-delimited empty arm still requires an additional outer match `end`. A missing arm `end`, extra `end`, or missing outer `end` is a deterministic syntax error, with no executable object emitted. The following is **not valid**:

```atto
match value over
    on 1 -> process_one();
    on _ -> fallback();
end
```

The first arm did not close. A newline, semicolon, or following `on` never substitutes for an arm delimiter.

### Interaction with expressions and arguments

- `process(p: ~point, count: 2);` inside an arm uses the ordinary **named-argument** `identifier : expression` grammar. The `:` does not affect the arm boundary; nested `~(field: value)` remains a record aggregate.
- `when` is parsed as a guard **before** the `->` body marker, so `on is ~Point as val p when p.x > 0 -> ... end` does not make the guard part of the body.
- The `~`/ `structural` alias must yield an identical structural type-pattern AST regardless of the chosen body delimiter. Guards remain checked for purity, ownership and once-only subject evaluation.
- The parser must support multi-statement arm bodies, nested matches, `if ... fi`, `do match`, mixed brace/end arms and correctly scoped bindings.
- Formatting may canonicalize delimiter styling if configured, but MUST retain the separation between **arm end** and **match end**, and must not move side effects or rewrite named-argument labels.

### Separate value-match expression form

This contract governs **statement blocks**. Existing concise value matches of the form:

```atto
return match<int> x over
    on 1 -> 10,
    on _ -> 20
end;
```

are **expression arms** and keep their comma-separated expression grammar. This does not implicitly change the `return match<T>` syntax to add arm-local `end` markers. Expanding value matches to block arms would need a separate, explicit return/value-unification rule and compiler tests.

## Test admission

Run same-source positive/negative fixtures across the parser, checker, formatter, and each executable backend. Require actual compiled guest execution for runtime parity claims; syntax-only reference vectors are not runtime evidence. The candidate Rust compiler tests cover ordinary scalar/guarded matches, two arm-body spellings, mixed style, nesting, `do match`, missing delimiters and safe rejection of unlowered `~Point` patterns. Backend parity is pending.
