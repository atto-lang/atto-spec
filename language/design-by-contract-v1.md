# Design-by-contract assertions v1 — preconditions, postconditions and invariants

**Status: proposed AttoLang language contract; NOT_EXECUTED.** This is a compiler/language design target, not evidence of parser, formatter, guest execution or cross-backend support. It complements (and does not replace) the separate `std.assert` module proposal in [atto-spec PR #114](https://github.com/atto-lang/atto-spec/pull/114).

## Surface grammar

A contract clause is part of a **named callable signature**, following any return type and declared effects and preceding its body opener. The proposed first slice is:

```ebnf
callable = callable_head effect_clauses? requires_clause* ensures_clause* body ;
requires_clause = "requires" bool_expr ";" ;
ensures_clause = "ensures" "|" identifier "|" "->" bool_expr ";" ;
class_contract = "invariant" bool_expr ";" ;
state_contract = "invariant" "|" identifier "|" "->" bool_expr ";" ;
```

Contract expressions must be delimited and statically typed as exactly `bool`. They are checked in source order; all must hold. `ensures |result|` names the **readonly** successful return value, without moving, copying or transferring it. Multiple clauses combine by logical conjunction with deterministic short-circuiting on first failure. The binder identifier is lexical and cannot shadow an existing parameter or receiver name.

```atto
fnc int <- double_positive(int value)
  requires value > 0;
  ensures |result| -> result > 0;
::
  return value * 2;
end

fnc int <- risky_positive(int value)
raises DomainError
requires value > 0;
ensures |result| -> result > 0;
begin
  if value eq 13 then
    raise! new DomainError();
  fi
  ^ value + 1;
end
```

The header remains compatible with both approved return-first separators (`<-` and exact U+2022 `•`), named `fnc` and `mtd` declarations, mandatory explicit return types, `::` for an effect-free body, and `begin ... end` for effect declarations. An existing braced callable body may also carry the same signature clauses. The formatter may alter layout but **must not** reorder, drop or synthesize clauses, change `ensures` binder identity or turn `begin` into `::` while effects are declared. Ordinary expression assertions remain the statically imported `std.assert.true(...)` / `std.assert.equal(...)` API, not an implicit global `assert` keyword.

## Runtime and compile-time semantics

1. Function call arguments evaluate by ordinary language rules; preconditions evaluate **once on the callee side**, after argument binding and before any body instruction. `requires` is a caller/callee API guarantee, but does not grant an effect or a mutable loan. A function body never runs if its precondition fails.
2. Every **normal** exit, including `return expression;`, `^ expression;`, fall-through for `void`, and early `?` returning `Err` or `None`, checks postconditions with the actual declared return value. `ensures` is not run after an escaping `throw!`, `raise!`, `panic!`, cancellation, or host trap. Evaluating `ensures` occurs before the caller observes completion. The result remains owned by the original return path.
3. A `requires`, `ensures` or `invariant` predicate is a statically effect-free readonly expression: no mutation, nonlocal I/O, send, spawn, allocation with observable identity, runtime FFI, throwing/raising/panicking, suspension, nondeterminism, or implicit ownership transfer. A compiler must check its complete transitive call graph's effects and borrowing. Unresolved calls fail closed. Each predicate must terminate with a statically bounded cost in hard-real-time or restricted embedded profiles, or that profile must reject it.
4. Constant `false` contracts can be rejected during compilation (`E_CONTRACT_ALWAYS_FALSE`), and provably true contracts can be eliminated by a sound compiler proof. All other contracts remain enabled in optimized **release** and full-AOT builds. There is no unchecked `assume`, `debug_assert` alias or default-off runtime flag. A compiler cannot treat unchecked runtime preconditions as optimization axioms.
5. On failure, the runtime raises a typed **`ContractViolationError extends Error`** as a **nonrecoverable `panic!` path**. Include contract kind (`requires`, `ensures`, `invariant`), compile-time contract identifier, source location and actor incarnation when relevant. This is not ordinary `throw!`; `try/catch` and `trap` cannot intercept it. In actors the runtime emits the existing authenticated priority supervisor CONTROL panic notice; the actor must not intercept its own panic. Non-actor execution follows ordinary process-level panic policy. No raw native abort or host exception may replace the language-defined failure path.
6. Stack cleanup, `finally`, `defer`, guard release, owned resources, and cancellation follow the existing nonrecoverable panic/unwind contract exactly once. If checking the contract itself would recurse or attempt to take a second state guard, reject statically rather than deadlock. Contract metadata is finite and emitted during compilation, with no guest reflection/JIT/interpreter.

## Object and actor invariants

An ordinary class can declare `invariant expression;` in the class body. Invariants are checked **after successful construction but before publication**, at entry and exit of externally callable methods, and after a state mutation is committed before the object may become externally observable. An exceptional method exit must not expose invalid mutable state: after existing unwind/cleanup, validate the invariant before access is restored, or permanently poison/retire the object on an already fatal path. Do not run predicates on a partially constructed `self`.

```atto
define class Counter as
  private let int count = 0;
  invariant self.count >= 0;

  mtd increment(int by): void
    requires by >= 0;
    ensures |result| -> self.count >= 0;
  ::
    self.count += by;
    return;
  end
end
```

An actor's sealed state **cannot** be read using direct external `self.state.field` access. An actor-owned state schema may declare `invariant |s| -> bool_expr;` where `s` is a compiler-provided readonly state view available **only during a nonescaping state-guard boundary**. Validate after initialization, before each committed write guard becomes observable and at actor lifecycle/turn handoff. A failed check is delivered exclusively via supervisor CONTROL. Predicate capture, holding a guard across `await`/`select`, nested lock acquisition, returning `s`, or transferring it as an actor message is illegal. No transient in-progress state need satisfy the invariant while the exclusive writer owns it.

For `Stream<T>` or streaming actor messages, an `ensures` clause on the returned stream **only validates its returned stream handle**. It does not silently assert or validate every future chunk. Item-level, terminal, cancellation and backpressure guarantees need explicit streaming protocol contracts and separate conformance cases; streamed send acknowledgements must not be mistaken for unary method completion.

## Deliberate v1 limits

- No `old(expr)` snapshots in this first slice. They require an independently defined borrow-safe, bounded-value snapshot rule to avoid implicit deep copies, leaks of sealed state or unbounded embedded allocations.
- No dynamic/global assertion builtin. The distinct `std.assert` module may expose recoverable `AssertionError` semantics, but contract failure is supervisor-/process-visible and cannot be swallowed by ordinary `catch`/`trap`.
- No inherited invariant weakening, interface contract variance, runtime reflection, arbitrary decorators or distributed guarantees implied by these declarations. Override and trait substitutability need a later versioned contract (preconditions cannot strengthen; postconditions and invariants cannot weaken once specified).

## Minimum implementation and acceptance gates

**Parser:** Signature placement; both return-first separators, `::`/`begin`/brace bodies and `mtd`; no clause in a body; typed `bool` rejection; duplicate binder/shadow and invalid delimiters.

**Typed IR:** `ContractClause(kind, expression, source_span, symbol_id)` attached to function/type/state schema; deterministic metadata and effect/borrow/purity validation. No hidden copies or dynamic dispatch. Reject unsupported profiles with a stable `E_CONTRACT_UNSUPPORTED` and **no guest artifact**.

**Lowering:** Callee-entry, every normal CFG return edge, class publication/method exits, state write commit and actor turn handoff. Preserve exact return identity, do not evaluate a contract twice on `?` cleanup, do not replace ordinary Error outcomes. Panic only through existing actor/process error machinery.

**Verification:** Conformance registry in `conformance/design-by-contract-v1.json` is a target inventory only. Require actual positive compiled-guest and negative compiler/no-artifact runs; negative runtime panic with supervisor CONTROL; strict full guest AOT compilation (no runtime codegen); actor streaming/guard and ownership tests. Record exact compiler/head/tree SHA, artifact digest, toolchain, runner with nonzero executed steps, and evidence by backend. Keep every target at `not_executed` until verified independently.
