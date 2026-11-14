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

## Element iteration — `in`, `of` and typed `:`

The **canonical AttoLang form** is `for item in iterable` (or with parentheses/braces); `of` is an exact alias for element iteration, not a JavaScript-style property-key distinction. Java/C++ range-based `for (Type item : iterable)` is an accepted **typed, parenthesized** compatibility spelling. `:` is **not** valid after an untyped loop variable, and none of these spellings accepts a C-style initializer or three-clause separator.

```atto
for item in items do
    consume(item);
end

for (val item: int of numbers()) {
    consume(item);
}

for (Particle p : particles) {
    consume(p);
}

for (Particle p in particles) {
    consume(p);
}

for (Particle p of particles) {
    consume(p);
}
```

`in`, `of` and typed `:` must all desugar to the **same** typed `IntoIterator<Item>` contract. A source expression is evaluated exactly once; `into_iter()` creates exactly one iterator (or reuses an existing owned iterator); each body iteration calls `next()` once; `None` ends iteration without entering the body; the iterator's lifecycle is closed exactly once at completion or exit. Early `break`, `continue`, `return`, exception paths, cancellation, and actor teardown must respect ownership and resource cleanup; `continue` advances to the next item without closing the iterator.

- **Values, never implicit keys.** For maps, explicit `.keys()`, `.values()`, `.entries()` disambiguate. Unlike JavaScript's `for...in`/ `for...of` distinction, there is no inherited-property enumeration.
- **Types and mutability.** The loop variable's item type may be inferred (`for item in source`), explicitly annotated (`for (val item: Particle in source)`) or written in type-first Java/C++ form. The binding is per-iteration and immutable by default. `let` explicitly requests a mutable *local* copy, not automatic mutation of the underlying storage. `const` cannot bind runtime iterator elements.
- **Ownership.** Value iteration copies only `Copy` elements; consuming `move` iteration needs an explicit ownership transfer. Borrow iteration must specify a borrow scope/capability, for example `for (rt borrow mut p: Particle in particles)` (TARGET syntax, requires borrow checker admission), with no escaping alias, double mutable borrow, or cross-`await` unsoundness. `Particle* p` is a raw pointer, **not** an implicit mutable borrow; unsafe pointer iteration and `p->update(dt)` must be separately gated and are not silently emitted as safe iteration.
- **Arrays.** `Array<T>`, `Slice<T>`, and fixed arrays should specialize iteration to contiguous indexed loads, bounds/length checks as needed, and zero per-iteration allocation. Array-of-struct and struct-of-array storage may have different performance; `for` must not force object-pointer chasing. Collections and user iterators use the same element contract but may have different optimized lowering.
- **Exceptions and supervision.** `next()` or body errors must close the iterator via a well-defined cleanup path; an actor panic still follows its supervisor CONTROL path. Any asynchronous `next_async()` iteration requires an explicitly asynchronous variant and stable borrow/suspension semantics, not an implicit blocking call.
- **Performance.** No requirement for recursion or heap creation on each iteration. A direct array loop may be vectorized; an iterator object may be devirtualized; pointer iteration may require additional safety bounds. Effectful `p.update(dt)` remains effectful regardless of syntax.

**Current executable Rust/Wasm subset:** bare `for item in generator()` already works; stacked [typed header PR #108](https://github.com/atto-lang/atto-source.rs/pull/108) adds `for item of generator()`, `for (int item : generator())`, `for (val item: int of generator())`, and typed `in/of`, all through the existing `Generator<int>` `next` and `close` machinery. It is **exact-head compiled-guest and real Chromium verified** at source commit `e974495f2225b8af25cce50957ecf486027dbed4` / tree `54f372d43808af7b9037bf624067b8c39951b35d`: private carrier [PR #32](https://github.com/honeypot-r-us-test/hnpt-e2e/pull/32), [Actions #43650525858](https://github.com/honeypot-r-us-test/hnpt-e2e/actions/runs/43650525858), **416/416 guest cases passed, 380 native-vs-Wasm byte parity checks, 14/14 CI steps successful**, Java differential skipped. A **first immutable `Array<int>` subset** now also exists on stacked [atto-source.rs PR #111](https://github.com/atto-lang/atto-source.rs/pull/111): `val xs: Array<int> = [1, 2, 3]` and `for (int n : xs) { ... }` lower to **contiguous, bounds-checked 8-byte static data loads**, without per-element allocation or a virtual `next()` call. The array descriptor is a copyable immutable view of read-only-by-language module data, and a `let` element is only a mutable *local copy*. The source expression is evaluated once. Literal items are presently compile-time signed `int` constants only, at most 1,024 per literal, within a shared 32 KiB module data budget. Empty `[]` arrays keep a static sentinel segment so the Wasm module declares memory for unreachable `i64.load` instructions. This profile does **not** grant dynamically constructed arrays or mutable array element indexing.

**`Array<Particle>`, `Slice<T>`, arbitrary `Array<T>`, user-defined `Iterator<T>`/`next()` dispatch, raw pointers, and mutable element borrowing remain *not executable* in this frontend.** Follow-up [atto-source.rs issue #109](https://github.com/atto-lang/atto-source.rs/issues/109) owns generic array/slice/Iterator<T>, optimized contiguous/SoA lowering, class/actor ownership and iterator cleanup conformance. Their parser and type checker must fail closed until independent backend and actor-ownership evidence exists.

## Value-returning immutable loops: `loop (val ...) { ... recur(...) }`

**TARGET**: In addition to ordinary imperative `loop`, the state-carrying expression has this grammar:

```ebnf
state_loop_expr = 'loop' '(' state_binding { ',' state_binding } ')' loop_body ;
state_binding   = 'val' identifier [ ':' type_ref ] '=' expression ;
loop_tail       = 'recur' '(' expression { ',' expression } ')' ';'
                | 'break' expression ';' ;
```

```atto
val total: int = loop (
    val i: int = 0,
    val sum: int = 0
) {
    if i >= 10 {
        break sum;
    }
    recur(i + 1, sum + i);
};
```

This returns **45**. In the executable Rust subset, braced `if` / `else` bodies are self-closing (an optional legacy `fi` is accepted), whereas unbraced `if ... then ... fi` requires `fi`. `recur` is intentionally adopted from Clojure `loop/recur`, **not** the earlier proposed stateful `continue(next_values)`. Ordinary `continue;` remains valid in imperative `while` / `for` / `loop` and is invalid in a state-carrying value-loop, whose `recur` must explicitly provide all next values.

Rules:

1. Every state binder is explicit `val` (immutable). A binding initializer is evaluated **once** in declaration order and may reference earlier bindings. Duplicate names and mutable `let`/other implicit binding kinds are rejected.
2. `recur(v1, ..., vn);` is a **control-flow transfer, not a function call or expression**. It is legal only in tail position of the nearest active immutable state-loop: the final statement of the loop body or the final statement of an exhaustive conditional branch. The number and static types must match the state's bindings exactly; no coercions or implicit defaults.
3. Each `recur` operand is evaluated once, from left to right, against the *old* immutable state. The implementation must evaluate all values before committing any of them, so `recur(b, a)` is a correct parallel swap and `recur(i + 1, sum + i)` uses the previous `i` for the sum.
4. `break value;` exits the innermost value-loop with its typed result. Every valued exit must agree on a single static type. A value-loop requires at least one statically identified valued `break`, and no execution path may fall through its body. `return` still exits the enclosing function.
5. `break;` or `continue;` without a new state/result is illegal in these value loops. `recur` outside a value loop is illegal. `break value` in ordinary loops is TARGET future work, not implied by this initial subset.
6. Loop state has lexical lifetime. Carried owned values and borrows require explicit per-backend ownership validation; none may escape their legal actor heap/isolate boundary. Recurring state must not imply synchronization, purity, or suspension.
7. Every immutable state-loop is lowered to a machine loop with phi/equivalent register/stack locals, **not a recursive call stack**. The loop infrastructure does not allocate on each iteration. The code *inside* the loop may still allocate, for example via string concatenation.
8. Every backedge must preserve actor cancellation, cooperative scheduling and hard fuel/real-time limits appropriate to the backend. The Rust/Wasm first executable profile limits carried values to copyable `int`, `bool`, `float`, and `string`; nested ordinary loops and generator frame lowering await a later, separately audited slice.

**Adversarial acceptance** includes tail-only `recur`, arity and type mismatches, repeated-evaluation prevention, parallel swaps, invalid fallthrough, mixed `break` result types, escaped `break value`, ownership across iterations, AOT debug/release equivalence, and actor cancellation under an unbounded `recur`. `fold`/`reduce` remain collection APIs, not aliases for this control-flow construct.

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
- The independent Rust browser E2E lane must execute a compiled unbounded loop in a disposable Worker, confirm the host's five-second worker timeout, and verify a subsequent fresh Worker still compiles/runs a healthy guest. This is browser-thread containment evidence, **not** actor-local scheduler/fuel or native process isolation proof.

## Implementation ledger (2026-11-14)

- `atto-lang/atto-source.rs` draft PR #96 implements a Rust/Wasm subset candidate with 15 positive and 20 negative `.atto` fixtures. **Exact-head guest execution now verified at source commit `8e2425cca6537103eb4150c9fda32cfa5f23fcdb` and root tree `88f15f261158fa36d4c7aee04d53af1246884675`** using the funded private Rust-only carrier [#30](https://github.com/honeypot-r-us-test/hnpt-e2e/pull/30): [Actions #43647095223](https://github.com/honeypot-r-us-test/hnpt-e2e/actions/runs/43647095223) completed all jobs successfully, 370/370 compiled-guest conformance cases and 334 native-vs-Wasm byte parity checks, Rust unit tests, generator tests, and actual Chromium browser Worker timeout/recovery. Java differential skipped. This is **Rust/Wasm verified only**, not five-backend parity.
- **New stacked Rust/Wasm immutable state-loop draft [atto-source.rs#106](https://github.com/atto-lang/atto-source.rs/pull/106)** implements `recur(...)` and typed `break value` over explicit immutable `val` bindings, evaluated simultaneously through staging locals; supports copyable scalar int/bool/float/string and rejects invalid recur arity/type/tail/fallthrough. Source commit `24a2102ecb7902a0274db59086ec513ce5050cc9`, source tree `d279b20111bb8f2f891fd0103474263083714b70`. A private exact-tree funded carrier [#31](https://github.com/honeypot-r-us-test/hnpt-e2e/pull/31) [Actions #43649249836](https://github.com/honeypot-r-us-test/hnpt-e2e/actions/runs/43649249836) executed **394 compiled-guest conformance tests (394 passed, 0 failed)** and **358 native-vs-Wasm byte comparisons**, Rust cargo tests, generated compiler builds, generator and target regressions, and real Chromium Worker tests covering `recur` sum 45, unbounded recur timeout and fresh Worker recovery. All CI job steps SUCCESS; Java differential intentionally skipped. This is **only Rust/Wasm verification**, not independent backend parity.
- **New stacked iterator header draft [atto-source.rs#108](https://github.com/atto-lang/atto-source.rs/pull/108)** adds type-annotated `for (int item : generator())`, `in`/`of` value aliases, `val`/`let` per-iteration items, and rejects unimplemented raw pointers and other source types. Rust/Wasm source commit `e974495f2225b8af25cce50957ecf486027dbed4`, exact tree `54f372d43808af7b9037bf624067b8c39951b35d`: private carrier [#32](https://github.com/honeypot-r-us-test/hnpt-e2e/pull/32), [Actions #43650525858](https://github.com/honeypot-r-us-test/hnpt-e2e/actions/runs/43650525858), **416/416 compiled guest conformance, 380 native/Wasm byte parity checks, real Chromium typed colon/of success; all 14 CI steps PASS**. Java differential skipped. Actual Array<Particle>/Iterator<Particle>/pointer/borrow execution remains **not implemented** and tracked in [#109](https://github.com/atto-lang/atto-source.rs/issues/109).
- Java, LLVM, Wasm primary backend, Forge and .NET require independent source-level admission, formatter roundtrip, type/borrow checks and executable guest tests. The older `while ... do ... done`, `loop ... do ... done` and counted `for (...;...;...)` forms are known in at least one implementation, but that is not parity.

**Release gate: DO NOT mark this target as implemented or five-backend-conformant until exact-head guest evidence is attached for each backend.**
