# Caret return and lexical sequence expressions (AttoLang v1)

Status: **proposed normative syntax**, pending resolution of the body-mode compatibility break and implementation receipts. This specification is not executable backend-parity evidence. `atto-source.rs` caret-return lowering is tracked separately; `seq` and `(> ... )` require their own parser, type-checker, ownership and backend admission gates.

## One checked sequence operation, several return spellings

`^` is a statement-position alias of `return`. The owner-approved 2026-11-27 revision removes caret-based sequence selection. `return ^ operand` is a redundant return spelling accepted with a warning; it has exactly the same semantics as `return operand`. In particular, `return ^ (a, b)` and `^ (a, b)` return tuples. `^ return` is invalid. No expression-position `^` is admitted. This is not exponentiation, XOR, or a nonlocal lambda return.

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

### Explicit and implicit void early returns

The following forms are **normatively accepted target syntax**, including the
optional leading `do` on an imperative `if`. A brace-style `if` closes
with `}` and requires no `fi`; a `then`-style `if` closes with `fi`.
For legacy source compatibility, a standalone braced `if` may accept an
additional terminal `fi`. However, a braced `if` nested inside a keyword
`then ... fi` must **not** consume the *sole* `fi` that closes the outer
conditional. When both inner and outer use explicit markers, `fi fi` closes
the two statements in that order. Both forms return from the nearest lexical
callable, not the `if` block.

```atto
fnc bare() -> void {
    if true {
        ^
    }
}
fnc explicit() -> void {
    if true {
        ^ void;
    }
}
fnc procedural() -> void
    do if true then ^ fi
end
fnc procedural_explicit() -> void
    do if true then ^ void fi
end
```

All four lower to an ordinary no-value return, equivalent to `return;`.
Likewise `return void;` is an explicit spelling of the same operation.
No user expression is evaluated for the `void` marker, and neither the
caret nor the `do` wrapper changes defer/recover behavior, guaranteed
cleanup, ownership, borrow checking or return type checking. A `void`
marker is not allowed as a standalone expression, an initializer, a
payload in a non-void return, or part of an arithmetic expression.
`^ void + 1` must be rejected rather than silently returning early.

This clause describes the canonical language target. Companion Rust
parser/compiler tests are proposed on atto-source.rs #330; actual guest
execution, exact-head CI and cross-backend parity require independent
evidence. The dedicated `conformance/void-early-return-v1.json` vectors
are separate from the existing SHA-pinned caret/sequence corpus.

### Comma-only sequence syntax (2026-11-27 revision)

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

    const int a = seq! (1, 2, 42);     // 42
    const int b = (> 1, 2, 42);      // 42
    return result, a, b;             // 42, not a tuple
}
```

**Delimited expression:** `seq! (x, y, z)` is equivalent in result and ordered effects to `(> x, y, z)`. `seq x, y, z` and `seq! x, y, z` are identical bare sequence forms. `seq(x, y, z)` and `seq (x, y, z)` are ordinary function calls, independent of whitespace. `seq!` is a contiguous construct marker, not a function call or an ownership operation. Both delimited forms can be used in any value-expression position and produce the final value, with a fresh lexical scope for sequence-local bindings.

**Bare function argument:** `f(seq x, y, z)` is a **single argument**,
not three. A bare `seq` in a call consumes commas through that call's
matching `)` and therefore must be its syntactic final argument.
For multiple arguments, use `f(seq! (x, y), z)`,
`f((> x, y), z)`, or `f(z, seq x, y)`.
Nested calls and tuple parentheses retain their own delimiters.

**Assignments within sequences:** `seq! (z += x, z)` and
`f(seq z += x, z)` first perform the checked mutable-local assignment,
then yield the updated `z`. Assignments are valid **prefix steps** only,
not the required final value-producing expression. No special mutation
or borrowing exemptions arise from `seq`.

```atto
(x, y, z)           // tuple construction, not sequencing
seq! (x, y, z)        // evaluates x, y, yields z
(> x, y, z)         // shorthand, same sequence semantics
return x, y, z;     // contextual return sequence; yield z
^ x, y, z;          // contextual return sequence; yield z
|| -> x, y, z       // contextual lambda sequence; yield z
```

**Braceless lambda returns:** both `|| -> x, y, z` and
`|| -> return x, y, z;` / `|| -> ^ x, y, z;` have contextual
last-value semantics. `|| -> return seq x, y, z;` and
`|| -> return (> x, y, z);` share the same checked sequence AST.
A semicolon is required only for an explicitly written return statement,
not for an expression-body `|| -> x, y, z`.

Within `f(|| -> x, y, z)`, the commas belong to the lambda expression,
not the enclosing call. To pass a second argument, use a separately
delimited lambda such as `f((|| -> x), y)` rather than guessing at the
comma boundary. Lambda lowering is not yet executable in the current
scalar browser compiler; grammar/parser conformance must be reported
separately from runtime support.

In particular, `seq! (x; y; z)`, `seq! (x,)`, and `seq! (,x)`
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

### Existing unparenthesized comma returns select the last value

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

The single-expression spelling `return x;` retains its existing meaning. Use `return seq ...;` if the list contains local declarations. A comma inside `f(a, b)`, `(a, b)`, collection literals, nested sequences, or other delimited expressions never becomes a return-list separator. In a `::` comma-delimited callable body, an unparenthesized comma remains a **body item separator**; use `return (> a, b)` for an explicitly delimited last-value return in that mode. This avoids silently changing prior callable-body semantics.

Malformed bare returns such as `return a,;`, `return a,,b;` and `return a, val b = 42;` must fail closed. The final expression supplies the return type, and all earlier expressions undergo the exact same borrow, move, effect, suspension and cleanup checks as `seq`.

### Redundant return marker and migration

All eight combinations below return the final scalar value 5:

```atto
return seq 5, 3, 5;
return seq! 5, 3, 5;
return seq! (5, 3, 5);
return (> 5, 3, 5);
^ seq 5, 3, 5;
^ seq! 5, 3, 5;
^ seq! (5, 3, 5);
^ (> 5, 3, 5);
```

`return ^ x;` is accepted with a redundant-return warning and ordinary return typing. `return ^;` (and a bare return marker at an admitted void statement boundary) is a warned valueless return, subject to the ordinary void restrictions. `^ return x;`, `^ ^ x;` and longer chains are syntax errors. A warning on `return ^ (a, b)` must explain that the operand is now a tuple; if the return type does not accept a tuple the normal type error also applies. A migration tool must preserve legacy sequence intent by rewriting to `return (> a, b)`, not merely deleting the caret. Ordinary `seq(...)` calls must not be rewritten without evidence that the old construct was intended.

A delimited sequence containing a single tuple is `seq! ((a, b))` or `(> (a, b))`. Empty sequences, trailing commas and terminal declarations remain errors. Keep all existing callable-body edition boundaries; no change to bare comma returns or braceless lambda comma bodies is implied.

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
return_stmt        = ("return", ["^"] | "^"), [return_operand], statement_terminator ; (* warn for return followed by ^ *)
return_operand     = "void" | expression, {",", expression}
                   | return_sequence ;
return_sequence    = bare_seq ; (* same terminating ';' as return *)
(* Bare return commas are disabled in a :: body, where commas separate body items. *)
sequence_stmt      = bare_seq, statement_terminator ;
paren_sequence     = "(>", sequence_items, ")" ;
seq_expression     = "seq!", "(", sequence_items, ")" ;
bare_seq           = ("seq" | "seq!"), sequence_items ; (* leading ( reserved for call or delimited seq! *)
bare_argument_seq  = bare_seq ; (* last call argument only; ends at matching ')' *)
begin_sequence     = "begin", sequence_items, "end" ;
sequence_items     = sequence_step, {",", sequence_step} ;
sequence_step      = local_binding_without_terminator
                   | checked_assignment_without_terminator
                   | admitted_statement_without_terminator
                   | expression ;
```

Here `^ match ... end;` uses the normal value-position match grammar. `^ seq ...;` is special-cased at the **statement** boundary, not parsed as a regular identifier named `seq`. The final sequence step must be a value-producing expression, never a declaration or bare control-flow statement, whenever a value is required. An empty sequence or trailing comma is an error.

The scanner recognizes `^` as a single token without consuming its operand. The parser accepts exactly one redundant `^` after literal `return` with a warning, never the reverse or repeated carets. `^^` remains distinct boolean XOR; `^=` is not return-assignment. Longest-match lexing applies. Carets in expression position (`x ^ y`, `foo(^ x)`, `const x = ^ 3`) are rejected. `seq` is contextual: a following `(` always selects ordinary call syntax; `seq!` followed by `(` owns the sequence delimiters. For a bare sequence with a parenthesized first operand, use the explicit delimited form. Whitespace around tokens does not alter this decision.

The parser must distinguish the special `(>` opening from ordinary `(expression)`, tuples `(a, b)`, comparisons `a > b`, generics, `|>` pipelines, the `>>` channel read spelling and `pkg::symbol`. In particular `(> a, b)` is a sequence yielding `b`; `(a, b)` stays a tuple. A comma inside calls, tuples, lists, generics, lambda parameters or nested sequences belongs to that **innermost** construct, not an enclosing sequence. A comma is not a general-purpose infix operator.

## Scope, control flow, effects and typing

1. Evaluate sequence steps once in source order. Every binding becomes visible to subsequent steps only, including in nested sequences; it does not escape the sequence. A nested sequence can read outer bindings but cannot leak its own locals. Duplicates in one lexical scope are errors; normal nested shadowing rules apply.
2. The final expression's type determines the sequence type. No tuple construction, implicit flattening, truthiness, implicit `await`, or transformation into fire-and-forget I/O occurs. Evaluation/effect order is preserved.
3. `^ e;` exits the **nearest lexical callable** (free `fnc`, `routine`, method or lambda), not the enclosing sequence, block, match, actor supervisor or outer function. This differs deliberately from Smalltalk-style nonlocal block returns. Bare `^` and `^;` are valid only for `void`-compatible returns. In that context `^ void` and `return void` are explicit valueless return spellings, with the same generator restrictions as `return;`.
4. All regular checks—return type, definite assignment, move/borrow validity, `suspends`, `throws`, `raises`, `panics`, critical-state rules, cleanup and `defer`—are **identical** to the expanded `return` and `begin` equivalents. `^` never bypasses any of them.
5. `^` is valid in ordinary callable statement positions, including conditional branches, loops, match arm blocks, nested braces, and statement-bodied lambdas. It is not a member/field initializer, pattern, default argument, type-level expression, or free-standing top-level statement. `^ match` must use the same exhaustive/typed value-match rules as `return match`.
6. `seq` without `^` evaluates its steps as a statement and discards the final value when no consuming context exists. It **never implicitly returns** from the current function. By contrast, `^ seq` and `^ (> ... )` do.
7. In `(> ... )`, the final step must produce a value; `return`/`^` may appear only as admissible statement steps or inside nested blocks, subject to reachability analysis. A terminal unconditional return followed by steps is rejected as unreachable, not silently discarded.
8. Compiler and formatter must preserve this distinction: `return` may format to `^` only under an explicit style option. Default formatting preserves the original return spelling and canonicalizes spacing and sequence delimiters. Idempotence and source maps are required.
9. Bound nesting depth, number of items, source size and AST height according to target/compiler resource policies. Diagnostics must fail closed on unmatched `)`, empty items, missing comma/semicolon, accidental tuple interpretation, and nested delimiter confusion.

## Required conformance

The adjacent versioned JSON corpus contains **proposed, independently unverified** positive/negative programs for normal returns, return-match, nested `(>`, all major expression contexts, disambiguation, typing, ownership/effects and invalid delimiters. Every compiler/formatter must report `passed`, `failed`, `unsupported` or `not_executed` per case with an exact source tree/commit. Host parser tests alone are not proof of guest AOT or browser Wasm execution.

Parity must be separately verified for Rust/Wasm, Java/GraalVM, LLVM, .NET, Forge and any other supported backend, including formatter round-trip and checked-execution exit code/value. Preserve the accepted callable-body styles from [callable-body-styles-v1.md](callable-body-styles-v1.md); those do not gain an implicit return within C-braced bodies merely because this shorthand exists.
