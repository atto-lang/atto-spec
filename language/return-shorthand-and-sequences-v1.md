# Caret return and lexical sequence expressions (AttoLang v1)

Status: **proposed normative syntax**, pending resolution of the body-mode compatibility break and implementation receipts. This specification is not executable backend-parity evidence. `atto-source.rs` caret-return lowering is tracked separately; `seq` and `(> ... )` require their own parser, type-checker, ownership and backend admission gates.

## One checked sequence operation, several return spellings

`^` is a statement-position alias of `return`, except for one **contextual return-operand spelling**: a literal `return ^ (steps..., tail)` selects the last value of a nonempty sequence. No other expression-position `^` is admitted. In particular, standalone `^ (a, b)` is a regular return of a tuple and must never become last-value sequencing. This is not exponentiation, XOR, or a nonlocal lambda return.

```atto
fnc square(int x): int { ^ x * x; }
fnc evaluate(Result<int, Error> result): int {
    ^ match result over
        on Ok(value) -> value * 2
        on Err(error) -> 0
    end;
}
```

`seq` introduces a comma-separated **sequence of steps** terminated by the enclosing semicolon. Its final expression is the value of the sequence; it does **not** independently exit a callable. `^ seq ...;` explicitly returns that final value.

```atto
fnc calculate(int n): int {
    ^ seq
        let a = n + 1,
        let b = a * 2,
        b + 5;
}
```

`(> ... )` is the **delimited sequence expression**, analogous to the longer `begin ... end` spelling. It is valid anywhere an expression of its final value's type is valid, including initializers, nested expressions, call arguments, match arm values and lambda expression bodies. Its opening marker is the contiguous two-character sequence `(>`, not a `>` comparison applied to an ordinary parenthesized expression.

```atto
const int result = (>
    let x = 5,
    (> let y = x + 3, y)
); // result == 8

pub fnc main(): int {
    const int x = 5;
    const int y = x + 3;
    ^ seq let z = x + y, z + 4; // 17
}
```

### Comma returns and literal `return ^ ( ... )` select the last value

An **unparenthesized, top-level comma list** after `return` or its standalone statement alias `^` evaluates each expression once in source order, discards intermediate values under normal effect/ownership rules, and returns the final expression. This is return-statement syntax, **not a general comma expression operator**:

```atto
fnc last(): int {
    return 1, 2, 42; // return 42
}
fnc same(): int {
    ^ 1, 2, 42;      // return 42
}
fnc with_calls(): int {
    return print_header(), calculate_result(); // return calculate_result() value
}
```

The single-expression spelling `return x;` retains its existing meaning. Use `return seq ...;` if the list contains local declarations. A comma inside `f(a, b)`, `(a, b)`, collection literals, nested sequences, or other delimited expressions never becomes a return-list separator. In a `::` comma-delimited callable body, an unparenthesized comma remains a **body item separator**; use `return ^ (a, b)` for an explicitly delimited last-value return in that mode. This avoids silently changing prior callable-body semantics.

Malformed bare returns such as `return a,;`, `return a,,b;` and `return a, val b = 42;` must fail closed. The final expression supplies the return type, and all earlier expressions undergo the exact same borrow, move, effect, suspension and cleanup checks as `seq`.

### Literal `return ^ ( ... )` selects the last value

The contextual `^` immediately following the **literal `return` keyword** and before a parenthesized, nonempty sequence is a last-value selector, not a second return statement. It uses the same lexical `ExprKind::Sequence` / effect / ownership / cleanup semantics as `seq` and `(> ... )`. It is not a general prefix expression operator. Whitespace between tokens is optional, though the formatter prints `return ^ (`.

```atto
fnc scalar(): int {
    return ^ (first(), second(), 42); // first and second run once; return 42
}
fnc equivalent(): int {
    return seq first(), second(), 42;
}
fnc tuple_value(): (int, int) {
    return (10, 20);    // tuple, not a sequence
}
fnc also_tuple(): (int, int) {
    ^ (10, 20);         // statement ^ is still return
}
fnc invalid(): int {
    return ^ ();        // E_EMPTY_SEQUENCE: there is no final value
}
```

A one-element sequence `return ^ (x);` returns `x`. `return ^ (x, y);` returns `y`; `return ^ ((x, y));` returns the tuple. A trailing comma is forbidden. Nested function argument commas and tuple/grouping commas are always owned by the innermost construct. `return x, y;` and `^ x, y;` return `y` without constructing a tuple. `return ^ seq ...;` and arbitrary `return ^ x;` are errors.

All earlier steps execute exactly once, in source order, with the same checked ownership, effects, suspension, error propagation, lexical bindings, and cleanup as explicit `seq`. A terminal binding rather than a value, an empty sequence, or a trailing comma is rejected. `return ^ (...)` is forbidden in generators when it returns a value, just as `return seq ...;` is.

This additive return syntax does not resolve the separate `::` callable-body migration. It must be version-gated with the parent proposal and cannot make unmarked comma bodies acquire implicit return.

### Callable bodies: `::` explicitly enables implicit tail return

`::` after `-> Type` is a **callable-body mode marker** (not an expression operator).
The revised [body contract](callable-body-styles-v1.md) distinguishes:

```atto
define class Foo as
    rec1() -> int
        const z: int = 5;
        ^ z + 3;
    end

    rec2() -> int ::
        const z: int = 5,
        z + 5
    end
end
```

`rec1()` returns 8 via explicit `^` and `rec2()` returns 10 via
the comma body's implicit terminal-expression return. In contrast,
`rec2() -> int :: ^ const z: int = 5, z + 5 end` **must fail**
because a `const` declaration is not a return expression. Normal
`^` early returns from nested branches remain available in both bodies.

This **tightens** the earlier contract that allowed comma/implicit-tail
bodies after an unmarked `-> Type` header. It requires a versioned
migration gate and existing-source conversion where needed; no runtime
or compiler parity should be inferred from the document change.

## Grammar contract

```ebnf
return_stmt        = ("return" | "^"), [return_operand], statement_terminator ;
return_operand     = expression, {",", expression}
                   | return_sequence
                   | contextual_last_sequence ;
return_sequence    = "seq", sequence_items ; (* same terminating ';' as return *)
contextual_last_sequence = "^", "(", sequence_items, ")" ; (* only after literal "return" *)
(* Bare return commas are disabled in a :: body, where commas separate body items. *)
sequence_stmt      = "seq", sequence_items, statement_terminator ;
paren_sequence     = "(>", sequence_items, ")" ;
begin_sequence     = "begin", sequence_items, "end" ;
sequence_items     = sequence_step, {",", sequence_step} ;
sequence_step      = local_binding_without_terminator
                   | admitted_statement_without_terminator
                   | expression ;
```

Here `^ match ... end;` uses the normal value-position match grammar. `^ seq ...;` is special-cased at the **statement** boundary, not parsed as a regular identifier named `seq`. The final sequence step must be a value-producing expression, never a declaration or bare control-flow statement, whenever a value is required. An empty sequence or trailing comma is an error.

The scanner recognizes `^` as a single token only in its own right, without consuming the subsequent operand. The parser tests the literal preceding keyword: the `return ^ (` selector is valid, whereas `^ ^ (` and `^ ^` are not. `^^` is a distinct reserved boolean XOR spelling and is never two adjacent return tokens; `^=` is not return-assignment. Longest-match lexing applies. A `^` in expression position (`x ^ y`, `foo(^ x)`, `const x = ^ 3`) is rejected, not treated as XOR, exponentiation, a unary operator or a lambda shortcut. The sole exception is the contextual `return ^ ( ... )` operand, which cannot appear inside arbitrary expressions. Whitespace after `^` is formatter-canonical but is not required for tokenization.

The parser must distinguish the special `(>` opening from ordinary `(expression)`, tuples `(a, b)`, comparisons `a > b`, generics, `|>` pipelines, the `>>` channel read spelling and `pkg::symbol`. In particular `(> a, b)` is a sequence yielding `b`; `(a, b)` stays a tuple. A comma inside calls, tuples, lists, generics, lambda parameters or nested sequences belongs to that **innermost** construct, not an enclosing sequence. A comma is not a general-purpose infix operator.

## Scope, control flow, effects and typing

1. Evaluate sequence steps once in source order. Every binding becomes visible to subsequent steps only, including in nested sequences; it does not escape the sequence. A nested sequence can read outer bindings but cannot leak its own locals. Duplicates in one lexical scope are errors; normal nested shadowing rules apply.
2. The final expression's type determines the sequence type. No tuple construction, implicit flattening, truthiness, implicit `await`, or transformation into fire-and-forget I/O occurs. Evaluation/effect order is preserved.
3. `^ e;` exits the **nearest lexical callable** (free `fnc`, `routine`, method or lambda), not the enclosing sequence, block, match, actor supervisor or outer function. This differs deliberately from Smalltalk-style nonlocal block returns. `^;` is valid only for `void`-compatible returns, with the same generator restrictions as `return;`.
4. All regular checks—return type, definite assignment, move/borrow validity, `suspends`, `throws`, `raises`, `panics`, critical-state rules, cleanup and `defer`—are **identical** to the expanded `return` and `begin` equivalents. `^` never bypasses any of them.
5. `^` is valid in ordinary callable statement positions, including conditional branches, loops, match arm blocks, nested braces, and statement-bodied lambdas. It is not a member/field initializer, pattern, default argument, type-level expression, or free-standing top-level statement. `^ match` must use the same exhaustive/typed value-match rules as `return match`.
6. `seq` without `^` evaluates its steps as a statement and discards the final value when no consuming context exists. It **never implicitly returns** from the current function. By contrast, `^ seq` and `^ (> ... )` do.
7. In `(> ... )`, the final step must produce a value; `return`/`^` may appear only as admissible statement steps or inside nested blocks, subject to reachability analysis. A terminal unconditional return followed by steps is rejected as unreachable, not silently discarded.
8. Compiler and formatter must preserve this distinction: `return` may format to `^` only under an explicit style option. Default formatting preserves the original return spelling and canonicalizes spacing and sequence delimiters. Idempotence and source maps are required.
9. Bound nesting depth, number of items, source size and AST height according to target/compiler resource policies. Diagnostics must fail closed on unmatched `)`, empty items, missing comma/semicolon, accidental tuple interpretation, and nested delimiter confusion.

## Required conformance

The adjacent versioned JSON corpus contains **proposed, independently unverified** positive/negative programs for normal returns, return-match, nested `(>`, all major expression contexts, disambiguation, typing, ownership/effects and invalid delimiters. Every compiler/formatter must report `passed`, `failed`, `unsupported` or `not_executed` per case with an exact source tree/commit. Host parser tests alone are not proof of guest AOT or browser Wasm execution.

Parity must be separately verified for Rust/Wasm, Java/GraalVM, LLVM, .NET, Forge and any other supported backend, including formatter round-trip and checked-execution exit code/value. Preserve the accepted callable-body styles from [callable-body-styles-v1.md](callable-body-styles-v1.md); those do not gain an implicit return within C-braced bodies merely because this shorthand exists.
