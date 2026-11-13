# 27 — Type-first immutable constants and explicit mutable constant instances

**Status: PROPOSED / NOT EXECUTED.** This is a prospective semantic decision for review, not evidence that the syntax runs on any compiler backend. See the versioned [implicit-const-v1 contract](../contracts/implicit-const-v1/contract.json).

## Decision and terminology

A **local** declaration whose first syntax constituent is a resolved type and whose binding qualifier is omitted has exactly the meaning of an explicit `const` declaration. Omission changes spelling only, never evaluation time, ownership, storage, or mutability. In particular, the compiler **MUST NOT** recover from a non-constant initializer by silently choosing `val`.

| Source form | Initializer | Can rebind | Mutation authority |
| --- | --- | --- | --- |
| `T x = e;` | compile-time constant expression | no | immutable constant value |
| `const T x = e;` | compile-time constant expression | no | immutable constant value |
| `const x = e;` | compile-time constant expression, type inferred | no | immutable constant value |
| `const mut T x = e;` | compile-time constant expression, fresh owned runtime instance | no | mutable referent only under ordinary ownership checks |
| `val T x = e;` / `val x = e;` | runtime permitted | no | determined by independent ownership and borrow permissions |
| `let T x = e;` / `let x = e;` | runtime permitted | yes | determined by independent ownership and borrow permissions |

`mut` is not a shorthand for `let`. It qualifies access to a referent, not the identity of a binding. `let mut` remains the explicitly mutable-binding/mutable-access form where otherwise admitted. The keyword combination `const mut` is **never** shortened by dropping `const`. A qualifierless declaration must not be reinterpreted as `val` merely because its initializer is not constant.

The design preserves three separate axes: binding reassignment, mutation permission for the referred-to object, and compile-time evaluation. Separately, the type/ownership system establishes lifetime, actor isolation, and whether a mutable loan is available. A fixed binding may own a mutable value; a mutable binding never grants an alias-based write capability on its own.

## Static evaluation rules

1. Resolve the declared type, type arguments and initializer, and type-check the initializer before constant evaluation. Untyped `const name = expr` infers a type only where it is unique and valid.
2. Evaluate a constant expression deterministically, with specified arithmetic, overflow, aggregate layout and string semantics independent of the chosen backend. Reject runtime I/O, clock/random input, environment reads, actor state, dynamic allocation requiring runtime-only effects, suspension, unsafe FFI and non-const-evaluable calls. A function is eligible only if the compiler proves its body and transitive calls const-evaluable under a versioned policy.
3. Use bounded, cycle-checked constant evaluation with explicit resource limits and stable diagnostics. No host-language callback or implicit reflection may make a forbidden expression appear constant.
4. `const T x` denotes immutable constant data. Reference-containing aggregates must be frozen/read-only or represented as immutable constant values, not mutable writable global aliases. A non-constant runtime expression is a targeted `non_const_initializer` error even if its value would happen to be the same each execution.
5. `infer struct{}` and other inference/structural constructs are admitted only when their actual syntax, inferred type, fields, defaults and initializer are accepted by the versioned constant evaluator. Illustrative examples are not automatic backend-support claims.

## `const mut`: fixed binding, fresh mutable instance

`const mut T x = constant_expr;` declares an **unrebindable local** with a compile-time evaluated *template value* and a **fresh actor-/scope-owned mutable runtime instance per execution** of the declaration. Mutable data must never point into pooled, frozen constant storage. The construction may copy or instantiate only compiler-proven, admissible owned data; resource handles, capabilities and other non-cloneable runtime values are not implicitly synthesized.

- Every evaluation creates a logically distinct owned mutable referent. Optimizations may remove allocations only if identity, visible mutation, aliasing, drop and lifetime semantics remain identical.
- Mutating the referent requires a valid exclusive mutable capability/loan (for example `rt borrow mut`) and cannot create competing writers. The `mut` word does **not** bypass the borrow checker or actor sealed-state checks.
- `x = replacement` is still forbidden, because the binding is fixed. Only appropriate member/element operations on an authorized mutable referent can mutate its contents.
- The initial constant expression itself must be fully evaluated without runtime effects. Any per-instance materialization is a distinct, compiler-specified runtime operation, not permission to invoke arbitrary runtime constructors from `const`.
- Top-level, static, singleton and module-level `const mut` declarations are **not admitted in this first contract**. This deliberately avoids silent global mutable storage and cross-tenant/actor sharing. A future explicit region/actor-owned static contract would need separate approval.
- Primitive scalar types without separately mutable interior storage get no extra mutable rights from `mut`. Compilers should reject meaningless mutable-interior qualifiers with `invalid_const_mut_target`, rather than pretending a fixed scalar can be reassigned.
- `const mut` on fields is deferred until the class/actor field grammar is reconciled independently. A `const mut` local inside an admitted `critical-write` region does not itself grant access to the surrounding actor's sealed state.

A `val` binding remains the ordinary choice for a runtime-owned immutable name pointing to a potentially mutable object. The point of `const mut` is a compile-time supplied *initial value* with fresh mutable per-scope storage, not a second spelling for `val`.

## Grammar and context boundaries

Proposed local productions (illustrative, not a complete parser grammar):

```text
local_decl :=
    type identifier "=" expr ";"
  | "const" type identifier "=" expr ";"
  | "const" identifier "=" expr ";"
  | "const" "mut" type identifier "=" expr ";"
  | ("val" | "let") [type] identifier "=" expr ";"
```

The `type identifier` prefix is a declaration only after type-name/generic syntax resolution in a declaration-eligible statement position. Parser and type checker must reject ambiguities, rather than reinterpreting `T x` as an expression or confusing generic angle brackets with comparisons. Module/global, class/actor field and parameter grammars remain separate. Existing field `int id: 7` and `final int epoch: 1` are **not** transformed into compile-time local constants by this change.

Existing `if runtime_expr as const name` uses `const` as a **contextual immutable binding** and does not require the expression to be compile-time evaluable. Pattern destructuring and `for const item` likewise keep their context-specific immutable-binding roles until separately specified. No global text rewrite of the lexeme `const` is permitted.

The formatter may normalize `const T x = e;` to `T x = e;` **only for validated type-first local declarations**; the reverse forms must yield identical typed IR, initializer checks, diagnostics, and observable behavior. It must preserve `const mut`, untyped `const x`, contextual `const` and explicit class/actor field modifiers. Format–parse–format is idempotent, including error cases that must not be auto-repaired into `val`.

## Verification and migration gates

Versioned positive and targeted-negative `.atto` fixtures must test: shorthand/explicit equivalence; constant evaluation and rejection of runtime initializers; no reassignment; runtime `val`/`let`; fresh `const mut` instance isolation; rebind rejection; illegal global mutable constants; inappropriate scalar `mut`; actor/tenant isolation; borrow aliases; and formatter round trips. Negative results must match **semantic diagnostic categories**, not incidental parser failures. Verify all required compiler families at immutable commits, with real guest execution for positives and captured failure diagnostics for negatives. A source-only contract, host oracle, test file or mirror run is not compiler parity proof.

Until those gates are met, this chapter and its fixtures remain **proposed**. Legacy semantic-floor-v1 fixtures are preserved byte-for-byte and their existing unpublished execution status is unchanged.
