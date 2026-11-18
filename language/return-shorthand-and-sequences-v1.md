# Caret return and lexical sequence expressions (AttoLang v1)

Status: **proposed normative syntax**, pending resolution of the body-mode compatibility break and implementation receipts. This specification is not executable backend-parity evidence. `atto-source.rs` caret-return lowering is tracked separately; `seq` and `(> ... )` require their own parser, type-checker, ownership and backend admission gates.

## One return operation, two sequence spellings

`^` is **exactly** a statement-position alias of `return`. It does not introduce a new value category, implicit return, nonlocal lambda return, or exponent/XOR operator.

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

### Comma-only `seq` expression syntax (2026-11-17 refinement)

The **separator inside every sequence is a comma**. Semicolons remain
statement terminators; they do not separate sequence steps.

```atto
fnc calculate(int value): int { return value; }
pub fnc main(): int {
    let int z = 10;
    const int x = 5;

    const int result = calculate(
        seq
            z += x,
            z * 2
    );                         // calculate(30)

    const int a = seq(1, 2, 42);     // 42
    const int b = (> 1, 2, 42);      // 42
    return result, a, b;             // 42, not a tuple
}
```

**Delimited expression:** `seq(x, y, z)` is equivalent in result and
ordered effects to `(> x, y, z)`. Both can be used in any expression
position and produce the last value, with a fresh lexical scope for
sequence-local bindings.

**Bare function argument:** `f(seq x, y, z)` is a **single argument**,
not three. A bare `seq` in a call consumes commas through that call's
matching `)` and therefore must be its syntactic final argument.
For multiple arguments, use `f(seq(x, y), z)`,
`f((> x, y), z)`, or `f(z, seq x, y)`.
Nested calls and tuple parentheses retain their own delimiters.

**Assignments within sequences:** `seq(z += x, z)` and
`f(seq z += x, z)` first perform the checked mutable-local assignment,
then yield the updated `z`. Assignments are valid **prefix steps** only,
not the required final value-producing expression. No special mutation
or borrowing exemptions arise from `seq`.

```atto
(x, y, z)           // tuple construction, not sequencing
seq(x, y, z)        // evaluates x, y, yields z
(> x, y, z)         // shorthand, same sequence semantics
return x, y, z;     // contextual return sequence; yield z
^ x, y, z;          // contextual return sequence; yield z
|| -> x, y, z       // contextual lambda sequence; yield z
```

**Braceless lambda returns:** both `|| -> x, y, z` and
`|| -> return x, y, z;` / `|| -> ^ x, y, z;` have contextual
last-value semantics. `|| -> return seq x, y, z;` and
`|| -> return ^ (x, y, z);` share the same checked sequence AST.
A semicolon is required only for an explicitly written return statement,
not for an expression-body `|| -> x, y, z`.

Within `f(|| -> x, y, z)`, the commas belong to the lambda expression,
not the enclosing call. To pass a second argument, use a separately
delimited lambda such as `f((|| -> x), y)` rather than guessing at the
comma boundary. Lambda lowering is not yet executable in the current
scalar browser compiler; grammar/parser conformance must be reported
separately from runtime support.

In particular, `seq(x; y; z)`, `seq(x,)`, and `seq(,x)`
are invalid. A comma is **not** a general-purpose infix sequence
operator outside these explicitly admitted contexts. This spec
describes the target grammar; tuple code generation and general
lambda return sequencing require their own compiler receipts.

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
return_operand     = expression | return_sequence ;
return_sequence    = "seq", sequence_items ; (* same terminating ';' as return *)
sequence_stmt      = "seq", sequence_items, statement_terminator ;
paren_sequence     = "(>", sequence_items, ")" ;
seq_expression     = "seq", "(", sequence_items, ")" ;
bare_argument_seq  = "seq", sequence_items ; (* last call argument only; ends at matching ')' *)
begin_sequence     = "begin", sequence_items, "end" ;
sequence_items     = sequence_step, {",", sequence_step} ;
sequence_step      = local_binding_without_terminator
                   | checked_assignment_without_terminator
                   | admitted_statement_without_terminator
                   | expression ;
```

Here `^ match ... end;` uses the normal value-position match grammar. `^ seq ...;` is special-cased at the **statement** boundary, not parsed as a regular identifier named `seq`. The final sequence step must be a value-producing expression, never a declaration or bare control-flow statement, whenever a value is required. An empty sequence or trailing comma is an error.

The scanner recognizes `^` as a single token only in its own right, without consuming the subsequent operand. `^^` is a distinct reserved boolean XOR spelling and is never two adjacent return tokens; `^=` is not return-assignment. Longest-match lexing applies. A `^` in expression position (`x ^ y`, `foo(^ x)`, `const x = ^ 3`) is rejected, not treated as XOR, exponentiation, a unary operator or a lambda shortcut. Whitespace after `^` is formatter-canonical but is not required for tokenization.

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
