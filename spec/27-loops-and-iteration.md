# 27 — Loops, iteration and control-flow boundaries

**Status: DRAFT TARGET. This chapter defines desired observable semantics, not deployed five-backend support.**

## Grammar contract

```ebnf
block               = '{' { statement } '}' ;
loop_body           = block | 'do' block | 'do' { statement } ('end' | 'done') ;
pretest_while       = 'while' bool_expr [ ';' ] loop_body ;
infinite_loop       = 'loop' loop_body | 'for' block | 'for' '_' loop_body ;
posttest_loop       = ('loop' loop_body | 'do' block) 'while' '(' bool_expr ')' ';' ;
counted_for         = 'for' '(' [ for_init ] ';' [ bool_expr ] ';' [ for_update ] ')' loop_body ;
empty_comma_for     = 'for' '(' ',' ',' ')' loop_body ;
iterator_for        = 'for' binding_pattern 'in' iterable_expr loop_body ;
```

These spellings are TARGET. `do` before a brace body is an optional introducer; braces end the body without an additional `end` or `done`. Unbraced `do` bodies must close with exactly one `end` or legacy `done`. The post-test `do` form deliberately requires braces; it must never be confused with `do match` or `do select`.

Use an explicit semicolon after a complete standalone `loop` body when the next statement starts with `while`, for example `loop { break; }; while ready() { ... }`; without the separator an immediately following `while (...) ;` is interpreted as the post-test suffix.

### Accepted target spellings

```atto
loop { work(); }
loop do { work(); }
loop do work(); end
loop do work(); done
loop { work(); } while (should_repeat());
loop do { work(); } while (should_repeat());
do { work(); } while (should_repeat());
while ready() { work(); }
while ready() do work(); end
while ready() do work(); done
for { work(); }
for _ do work(); end
for (;;) do work(); end
for (,,) do work(); end
for (let i = 0; i < 10; i++) do work(); end
for item in items do consume(item); end
```

`for {}` and `for _ do ... end` mean infinite loops, exactly like `loop {}`; they are NOT wildcard-iterator loops. Only `for _ in source ...` is a wildcard binding with an iterator source. `for (,,)` is a deliberate empty-header alias for `for (;;)`, and is valid only when all three clauses are empty. Semicolons, never commas, separate populated counted-for clauses. Commas are already admitted as condition conjunctions in legacy syntax, and must not be overloaded as header delimiters.

### Rejected target spellings

| Example | Reason |
| --- | --- |
| `while () {}` | Empty condition |
| `do {} while();` | Empty post-test condition |
| `loop {} while ();` | Empty post-test condition |
| `do {} while(1);` | Condition must have static type `bool` |
| `do {} while(true)` | Missing mandatory post-test semicolon |
| `do {}` | Post-test `do` requires its trailing `while (...) ;` |
| `loop {} while true;` | Post-test condition must be parenthesized |
| `for () {}` | Empty non-C-style header, not an infinite-loop alias |
| `for (,) {}` | Incomplete empty-comma shorthand |
| `for (let i = 0, i < 10, i++) {}` | Populated C-style headers use semicolons |
| `for _;` | Missing loop body |
| `loop do {} end` | Unexpected second closing delimiter |
| `for item in source while (ready()) {}` | Unadmitted iterator-guard syntax |

The parser must reject unsupported forms before emitting executable IR. A formatter must not silently rewrite a rejected form into an accepted one.

## Required semantics

1. **Pre-test while** evaluates the condition before the first iteration and before every subsequent iteration. A false initial condition executes the body zero times.
2. **Post-test loops** execute the body once before the first condition check. The condition is evaluated exactly once after each normally completed iteration and after each `continue`; false exits. `break`, `return` and unwinding never evaluate the trailing condition again.
3. **Counted for** evaluates the initializer once in a loop-local scope. Missing condition is constant `true`. Each iteration evaluates the condition before the body; its update runs after the body or after `continue`, never after `break`, `return`, or unwind. The loop-local binding cannot escape its scope.
4. **Infinite loop aliases** all have the same observable control flow and termination behavior. They may exit through `break`, `return`, throw/raise/panic propagation or cancellation. They must not be assumed to terminate.
5. **Iterator for** evaluates its source exactly once; advances it once per iteration; binds each yielded element per the ownership rules. Exhaustion, early exit, cancellation, error propagation and normal return must close or drop the owned iterator exactly once; a `continue` must not close it prematurely.
6. **Condition typing** requires a static `bool`. No integer, string, pointer, Option or Result truthiness coercion; assignment-as-condition is invalid. Parentheses and commas must not change evaluation count or introduce a second parse.
7. **Nested bodies** use lexical, structurally balanced delimiters. An `end` consumed by a nested `match`, `select`, method or loop must not close the enclosing loop.
8. **Cleanup** for an iteration's lexical scope runs before a normal next-iteration condition/update, and on `continue`, `break`, `return` or unwind according to `defer` and ownership semantics. No use-after-move or escaping borrow may be introduced by lowering.
9. **AOT and JIT** may normalize all loop variants to one common MIR loop shape with distinct condition placement (entry / backedge / none), but must preserve `continue`, break, side effects, source locations and exact evaluation counts. An optimizer may not hoist a side-effectful condition out of an iteration.
10. **Actor scheduling/security**: backedges and long-running bodies require profile-defined cooperation, cancellation and bounded fuel. A soft fairness poll is not a hard untrusted work quota; no backend can claim preemption merely because its parser recognizes a loop.

## Loop IR invariants

```text
pre-test:  condition -> (false: exit, true: body) -> update? -> condition
post-test: body -> condition -> (false: exit, true: body)
counted:   initializer -> condition -> (false: exit, true: body) -> update -> condition
continue:  pre-test -> condition; post-test -> trailing condition; counted -> update
break:     exit without running any condition or update after the break
```

All paths must preserve source-order evaluation of loop-body expressions. In actor methods concurrently invoked on separate worker threads, legal shared memory access must still respect sealed state and `Atomic`/`Arc` ownership constraints; a loop does not confer implicit synchronization.

## Required conformance and admission

- Parser positive/negative tests for every accepted/rejected row, with stable diagnostic codes and precise spans; brace/`end`/`done` nesting, whitespace, comments and parser-depth fuzzing.
- Executable `.atto` fixtures: zero-versus-one iteration, condition evaluated exactly once, counted update after `continue`, post-test condition after `continue`, skipping after `break`, nested labeled/unlabeled control flow when admitted, static `bool` failures, scope/borrow errors and iterator cleanup.
- Run equivalent fixtures on independent Java/GraalVM, LLVM-native AOT, Wasm, Forge and .NET Native AOT compilers. Cross-backend source/tree/fixture SHAs and stepful test logs are required. Rust browser compiler is an additional independently versioned admission lane, not proof of five-backend parity.
- Check optimization and generation modes independently (debug/release, AOT/JIT, `O0`/`O2` where applicable); prove identical side-effect counts and cancellation/fuel observations.
- A failed, missing or zero-step GitHub Actions job is NOT execution evidence. A temporary token-free mirror requires the repository's governed private-source export authorization and exact blob/tree verification.

## Implementation ledger (2026-11-14)

- `atto-lang/atto-source.rs` draft PR #96 proposes parser/type-checker/Wasm/generator-CFG lowering plus 15 positive and 16 negative fixtures (including wildcard iterator discard, post-test return analysis, moved-condition rejection and terminator disambiguation). Its source-org Actions job completed without usable build logs; the new forms are **not verified executed**.
- Java, LLVM, Wasm primary backend, Forge and .NET require independent source-level admission, formatter roundtrip, type/borrow checks and executable guest tests. The older `while ... do ... done`, `loop ... do ... done` and counted `for (...;...;...)` forms are known in at least one implementation, but that is not parity.

**Release gate: DO NOT mark this target as implemented or five-backend-conformant until exact-head guest evidence is attached for each backend.**
