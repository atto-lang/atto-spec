# Canonical Boolean operators — AttoLang V1

**Status:** proposed backend-neutral contract; executable verification is tracked per backend, not inferred from this document.

## Syntax and precedence

| Spelling | Meaning | Associativity | RHS evaluation |
| --- | --- | --- | --- |
| `&&`, `AND` | conjunction | left | short-circuit if left is false |
| `^^`, `XOR` | exclusive disjunction | left | eager |
| `||`, `OR` | disjunction | left | short-circuit if left is true |

Uppercase words are **case-sensitive infix aliases**, not standalone Boolean values and not independent statement delimiters. No implicit coercion/truthiness: both operands must be `bool`. `true` and `false` are values. `AND`, `OR`, `XOR` are reserved in this proposed grammar.

Precedence (tight to loose): unary `!`, arithmetic and comparisons/equality, Boolean AND, Boolean XOR, Boolean OR, conditional `?:`. Existing comparison/arithmetical precedence remains unchanged.

```ebnf
boolean_or  = boolean_xor, { ( "||" | "OR" ), boolean_xor };
boolean_xor = boolean_and, { ( "^^" | "XOR" ), boolean_and };
boolean_and = equality, { ( "&&" | "AND" ), equality };
```

Parentheses override precedence. A left operand is evaluated once before the right. The two forms of each operator must emit identical execution results and observable side effects.

## Truth table

| a | b | a && b | a \|\| b | a ^^ b |
| --- | --- | --- | --- | --- |
| false | false | false | false | false |
| false | true | false | true | true |
| true | false | false | true | true |
| true | true | true | true | false |

## Evaluation and effects

- `a && b`: evaluate `a`; if false, produce false without evaluating `b`; otherwise evaluate `b` once.
- `a || b`: evaluate `a`; if true, produce true without evaluating `b`; otherwise evaluate `b` once.
- `a ^^ b`: evaluate both exactly once in order; return their Boolean XOR.
- Errors, panics, allocations, writes, tracing and other effects in a skipped RHS **must not happen**.
- Type checking still validates both operands even if their execution is statically unreachable.
- `And(a,b)`, `Or(a,b)` and `Xor(a,b)` are independently exposed named intrinsics. Their arity, array overloads, and eager-vs-lazy operand rules must be specified and reconciled across backends before claiming **named intrinsic** parity. They are not automatically equivalent to infix operators for side effects.

## Legacy migration

Legacy condition-only `,` and `|` are NOT canonical logical spellings. Existing browser builds interpret them eagerly; certain Java implementations short-circuit them. Do not silently rewrite them to `&&` or `||` in code with side effects. First audit their evaluation-order contracts, then migrate/reject with explicit diagnostic and formatter support. Ordinary commas still separate arguments, tuple elements, and declarations; `|` has unrelated roles (e.g. types, lambdas, actor/channel syntax).

Do not reinterpret bitwise `^` or unsupported `%` as Boolean operations; a single caret remains distinct from `^^`.

## Required conformance

1. Four Boolean operand pairs for each symbolic/uppercase spelling.
2. Mixed-spelling associativity, precedence and parentheses.
3. Each operator inside assignments, return values, if/while guards and conditional expressions.
4. Instrumented RHS proving short-circuit (including traps/panics in a skipped branch), eager XOR, and no duplicate effects.
5. Negative mixed `int`, `float`, `string`, object and invalid-arity cases.
6. Ambiguous tokens: `|` versus `||` versus `|>`; `^` versus `^^`; `&` versus `&&`; nested callbacks/actor pipes.
7. Compile to actual guest executable per target, assert expected output/traps, and verify exact PR-head SHA, compiler/runtime ABI and a **nonzero** number of executed test steps.

Backend status must use **passed / failed / unsupported / not executed**. Source-only parsing, compiler-host tests and CI run existence do not establish guest execution.

## Implementation status at the 2026-11-12 audit

- Rust browser compiler: candidate implementation `atto-lang/atto-source.rs#53`, with native, Wasm guest and Chromium evidence against its recorded PR head. Not yet released into the public playground binary.
- Java/Graal: `&&` and `||` already parsed as adjacent lexer tokens; at audit, parser explicitly rejected `^^`. Full parity **not verified**.
- LLVM: `oreslang-source.llvm/docs/BOOLEAN_LOGICAL_PARITY.md` describes incomplete typed Boolean lowering. Full parity **not verified**.
- Other backends: not audited in this change.

The website source previews are `atto-lang/atto-lang.github.io#43`. Preview selection does **not** prove that the pinned browser compiler supports the construct. Public compiler updates require separate SHA-256 provenance and release approval.
