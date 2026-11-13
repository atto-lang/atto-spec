# 21 — AttoLang semantic floor and compiler parity handoff

**Status: DRAFT / TARGET / NOT VERIFIED.** This is an additive amendment to chapters 01–11 and 18, not a claim that a compiler implements these forms. In the event of a contradiction, record the existing chapter and this amendment for semantic review; do not silently choose the convenient implementation.

## Shared source of truth

The versioned machine-readable contract is [`contracts/attolang-semantic-floor-v1/contract.json`](../contracts/attolang-semantic-floor-v1/contract.json). The *same bytes* and the four candidate `.atto` fixtures are mirrored in [`oreslang-compilers-parity-testing`](https://github.com/ores-truffle-oreslang/oreslang-compilers-parity-testing/tree/main/contracts/attolang-semantic-floor-v1). Compare Git blob IDs on the proposed PR heads before promotion; a path match or matching documentation alone is insufficient.

The legacy parity corpus remains a separately named 53-case `.ores` inventory. Its current counts and historical results **must not** be rewritten as `.atto` execution. This new contract has four authored candidate cases, **zero** compiler-backed passing cases, and a fail-closed admission policy.

## Semantic decisions to reconcile and test

1. **Immutable by default; compile-time by shorthand (proposed clarification):** `int x = 7` and `const int x = 7` are *equivalent compile-time constants*. `const x = 7` is also a compile-time constant with inferred type, where supported. Runtime initializers require explicit `val` (fixed binding) or `let` (rebindable binding); a non-constant type-first initializer is rejected, never silently rewritten to `val`. `mut` does not authorize binding reassignment on its own: `const mut` is explicit, fixed-binding, per-execution mutable-instance construction subject to ownership and isolation checks. Primitive values are not mutated in place. The complete proposed semantics and context exceptions are in [chapter 27](27-implicit-const-and-const-mut.md), staged as an independent contract so the existing semantic-floor-v1 files stay unchanged.
2. **Effect admission:** `suspends fnc` is the canonical potentially-suspending declaration. `async fnc`, `critical suspends fnc` and `suspends critical fnc` must fail for the intended modifier reason before executable IR. `suspends fnc` may enter a `critical {}` body only when that body cannot suspend; contended acquisition must not block an OS carrier.
3. **Calls and TCO:** `routine` remains a direct-call-only, acyclic callable form, including indirect-cycle detection. `fnc` and ordinary class methods are the proper tail-call/mutual-recursion targets; cleanup, exception, effect, actor-turn and ownership invariants survive tail-call lowering.
4. **Transport:** functions, methods and closures do not cross channels, actor-group publications or pub-sub subscriptions. Accepted messages must be data with explicit ownership, `Sendable` and serialization proof where required.
5. **Actor groups:** actors may join several groups without changing their one controlling supervisor. Publish-vs-unsubscribe, group close, termination and resubscribe require generation-fenced linearization; FIFO applies per publisher/subscription edge. Reliable publication backpressure suspends tasks, never a locked actor turn or OS carrier.
6. **Diagnostics across boundaries:** stack traces through task continuations, actor turns, supervisor escalation and heap/arena retirement carry bounded immutable causal metadata. Pointers, mutable exception objects and borrowed frames do not cross ownership or tenant boundaries. Loss/truncation is explicit, with no invented guest frames.
7. **Portable modules and DOP:** core/std should use canonical byte-identical `.atto` for backend-independent behavior. Java/C++/C#/Rust host implementations are restricted to compiler, runtime and platform ABI primitives. AoS/SoA/AoSoA/inverted data layouts must preserve observable bounds, ownership, aliasing, and logical field semantics; native layout performance is a separate claim.
8. **Local storage:** TLS, task-local, actor-local and routine-local storage have separately scoped lifetimes; carrier migration, actor restart and tenant isolation cannot accidentally grant a borrowed slot to another scope.

## Cross-backend conformance rules

This parity suite has **six independent required compiler targets**: Java/GraalVM, LLVM, Wasm, .NET NativeAOT, Forge and Cranelift. The older five-family language table does **not** certify Cranelift as a Forge alias. JavaScript transpilation remains optional.

Each semantic rule needs parser/formatter tests, positive and targeted-negative type/effect/borrow cases, real same-byte guest runs (where positive), cancellation or concurrency races when applicable, native sanitizer/profile runs where claimed, and independently verified exact-head receipts. `runner_id=0`, zero executed meaningful steps, host models, a successful file read, an interpreter-only stand-in, or a non-matching negative diagnostic never qualifies as compiler parity.

Candidate fixtures are intentionally *not* inserted into the existing 53-case inventory: they require a reviewed `.atto` adapter and matching negative-diagnostic oracle first. Check the paired repository's [handoff guide](https://github.com/ores-truffle-oreslang/oreslang-compilers-parity-testing/blob/main/docs/ATTOLANG_SEMANTIC_FLOOR.md) for promotion gates.
