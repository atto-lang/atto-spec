# Range iteration and value-producing blocks (DRAFT / TARGET)

**Status: proposed semantic contract, NOT executable compiler admission.** This chapter is a design target for all supported AttoLang backends. Do not mark parity as implemented until compiled-guest tests pass independently in Java, LLVM, .NET, WASM, and Forge. Preserve value `if ... then ... else ... fi`, imperative `do if ... then ... fi`, and legacy `for (...)` / `for ... of ...` syntax.

## Motivation

AttoLang distinguishes imperative `do if` and brace statements from value-producing keyword conditionals and ternaries. Allow compound value-producing `{ ... }` blocks anywhere expressions are admitted so the ternary remains concise even when an arm requires multiple statements. Introduce an `in` loop syntax and an efficient integral `..` / `..=` range value. No new keywords for value blocks.

```atto
for id in 1..1024 {
    ir.blocks.push(new Block(
        id: id,
        ops: id eq 1023
            ? { build_end_loan_ops(1..=80) }
            : { [] },
        successors: id eq 1023
            ? { [] }
            : { [id + 1] }
    ));
}
```

The user-facing structure construction above uses AttoLang-style `new Block(...)` and named value arguments, not Rust's `Block { ... }` initializer. `build_end_loan_ops` stands for a user function; it is not a new builtin. Empty collection literals receive a type only from a verified expected type or explicit annotation; no runtime dynamic guessing.

## Value block grammar

```ebnf
block_expr = "{" { statement } [tail_expression] "}" ;
ternary_expr = range_expr [ "?" expression ":" ternary_expr ] ;
```

- A brace block in an admitted block-expression grammar context is an `Ast.BlockExpr(statements, tail_expression?)`. Do not globally classify braces in expression positions: preserve the existing Map literal and empty collection rules; ambiguous standalone syntax must reject until explicit disambiguation is verified. The separately prefixed `record{...}`, `struct{...}` and `~(...)` forms keep their own grammars. Statement-position `{ ... }` remains a statement block.
- A value block is an **eager, lexical expression**, **not a function object or closure**: it captures the surrounding lexical environment by ordinary access, but does not allocate a closure, acquire its own function return boundary or create an implicit asynchronous task.
- All non-tail statements are ordinary statements and terminate normally. The **final expression without a semicolon** yields the block's value. A semicolon explicitly discards a value: `{ 42 }` is `int`; `{ 42; }` and `{}` have `Unit` type. Do not apply the usual optional-before-`}` semicolon rule to turn a terminated expression into an implicit tail.
- In a value-required context, an absent tail expression fails type checking rather than returning a made-up default. A statement-context block may have `Unit`. An unreachable terminal statement (`throw`, `raise`, `panic`, `return`) has `Never` flow and can coexist with value-producing paths where the surrounding effect rules allow it.
- In a general standalone value block, `return` exits the nearest enclosing **function/method/lambda**, not the block. In a conditional arm block the separately ratified v2 contract permits a final arm-local `return expression`; that exception does not extend to standalone blocks. `break` / `continue` target the nearest compatible enclosing loop; neither returns a block value. `yield` retains its generator-specific meaning.
- Each block opens a lexical scope. Bindings do not escape; only a value that satisfies normal move/borrow/lifetime rules may escape. An inner reference to a block-local must not be returned. Defer/resource cleanup runs exactly once on every exit path, after a movable result has been secured.
- Nested blocks work and may appear in arguments, assignments, interpolations (where expression parsing is admitted), nested ternaries and match-value arms. Source spans must identify both a failed tail and the corresponding enclosing expected type.
- Side effects, throws/raises, panics, suspension and ownership moves are checked with the established effect and borrow checker. A value block does not silently authorize `await` or a borrow across `await`/critical sections.

### Ternary typing and execution

`condition ? true_arm : false_arm` retains current right associativity, precedence and strict static `bool` condition. Evaluate the condition once and **only** the selected arm, exactly once. Type-check **both** arms even if the condition is constant. Infer a common static result type under an expected outer type when supported (especially `[]`); otherwise emit a deterministic type error. No truthiness, runtime boxing fallback or eager execution of both arms. Ownership at the merge must be valid for either branch, and a moved value is unavailable on any path where the move occurred. Both arm effects contribute to the enclosing effect upper bound; an untaken arm performs no effects at runtime.

Examples:

```atto
val int answer = ready
    ? { val int x = expensive(); x + 2 }
    : { 0 };

val int answer2 = ready ? { 42 } : { 7 };

// Not 42: trailing semicolon discards the value.
const int rejected = ready ? { 42; } : { 7 };
```

## Range grammar and iteration

Introduce two lexer tokens, **`RANGE_EXCLUSIVE`** (`..`) and **`RANGE_INCLUSIVE`** (`..=`), preserving longest-match `...` spread and ordinary `.` member access. The number lexer must stop at `..`: `1..5` must scan as INT RANGE_EXCLUSIVE INT, not FLOAT or ELLIPSIS. No unbounded `..` form in v0.

```ebnf
range_expr = logical_or_expr [ (".." | "..=") logical_or_expr ] ;
for_in = "for" [ "const" | "let" ] identifier "in" expression loop_body ;
loop_body = "{" { statement } "}" | "do" { statement } "done" ;
```

Range precedence is **below logical-or and above the ternary**, with a range operator non-associative (reject `1..3..5` unless explicitly parenthesized and typed). Range bounds are evaluated left-to-right exactly once on range construction. V0 accepts fixed-width integral bounds of the same checked type; no silent float-to-int conversions. `a..b` iterates values `a <= n < b` and `a..=b` iterates `a <= n <= b` in steps of one. Thus `1..1024` visits **1 through 1023** (1023 iterations), and `1..=80` visits **1 through 80** (80 iterations). Descending forward ranges are empty; descending iteration can be expressed with a separately checked reverse adaptor.

Ranges are efficient first-class values with fixed-size bounds and an inclusive bit, not materialized arrays. Their iterator consumes no more than a small fixed state and must handle `MAX_INT` inclusive endpoints **without overflowing**; the last value may be yielded once and then the iterator marks exhausted instead of incrementing past maximum. Steps, `rev`, parallel, vectorized, and async iteration are optional *separately gated* adaptors, not assumed as v0 admission.

- `for id in items` is the new general iterable form with **one implicit immutable, fresh per-iteration binding**. `for const id in items` makes that explicit; `for let id in items` makes the iteration-local binding mutable without mutating the iterator's cursor.
- Existing `for const id of items` / `for (...)` forms remain accepted; the formatter should not silently rewrite them during the migration.
- `in` requires a statically verified iterable contract; no reflection/dynamic property lookup. The iterable expression is evaluated once; iterator acquire, `next`, cleanup and early `break`/exception paths must obey ownership and actor-region rules.
- `in` in `for` is a contextual delimiter, not an unrestricted declaration keyword. Destructuring, `for await ... in`, collection builders, `step_by` and parallel loops require separate checked design/admission.
- Preserve scheduler cooperation on loop backedges. The syntax does not grant CPU/GPU parallelization, actor memory sharing or permission bypass.

## Grammar/parser disambiguation and lowering

1. Lexer: greedily distinguish `...`, `..=`, `..`, `.`; preserve `?` as the existing context-sensitive token for propagation, optional types and ternary.
2. Parser: add `RangeExpr` and `BlockExpr` without rewriting braces in statement, record, struct, match-arm or function-declaration contexts. An expression position after `?` or `:` admits a block. Maintain a nesting-aware parser rather than splitting on the first `:` (which may occur in a nested call/record expression).
3. Typed AST/MIR: a block has a lexical scope and a final-value result slot; each ternary arm lowers to its own basic block with a phi/join or equivalent result temporary. Blocks are not closures, do not escape and do not require heap allocation. `RangeExpr` lowers to a typed iterator with checked finite exhaustion.
4. Typechecker: check bool, both arm result types, contextual empty-collection inference, ownership joins, effects, and definite assignment. Enforce semicolon-vs-tail distinction.
5. Backend: Java interpreter + guest/AOT, LLVM, .NET, WASM, Forge must produce identical observable results. Rejected unsupported syntax is not a pass.

## Acceptance and conformance

The machine-readable acceptance vectors live in `contracts/atto-value-block-range-v0.json`. They are **TARGET**, not evidence of compiler success. Require real parser/AST tests, type-checker negatives, formatter round-trips, executable compiled-guest tests, branch side-effect tests, range MIN/MAX overflow tests, benchmark for allocation-free ranges, and ownership/effect tests. Run both interpreted and Native Image/AOT paths where applicable. Exact revision SHAs and job logs are required to label a backend verified.

Do not collapse a passing syntax-only test or a host-language model into full guest conformance.

## Reconciliation with conditional arm blocks

The [v2 arm-block contract](27-conditional-expression-modes.md) is authoritative for the contextual final arm-local return. Do not auto-invoke bare lambdas. Standalone value blocks, range types and iteration are independent candidate features, requiring disambiguation from canonical Map/Record collection literals before parser admission. The host reference validates finite range exhaustion and candidate corpus invariants only. Keep the original compiler and guest gates unchanged.
