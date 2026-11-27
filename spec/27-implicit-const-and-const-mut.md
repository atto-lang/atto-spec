# 27 — Type-first immutable constants and explicit mutable constant instances

**Status: PROPOSED / NOT EXECUTED.** This is a prospective semantic decision for review, not evidence that the syntax runs on any compiler backend. See the versioned [implicit-const-v1 contract](../contracts/implicit-const-v1/contract.json).

## 2026-11-27 language-owner amendment — local bindings v2

**Approved design direction; implementation and guest parity NOT VERIFIED.** This amendment supersedes conflicting local-binding rules in the historical v1 sections below and in the v1 compile-time/binding documents (merged #13, #170). Preserve v1 fixtures as historical evidence, not as the v2 acceptance oracle. Reconcile with the earlier runtime-const rule in legacy common-source #203 and conformance #319 before backend integration.

### Canonical local declaration forms

```atto
int x = 5;
string name = "Alice";
const int y = 10;
const y : int = 10;
const y = 10 as int;
const y as int = 10;
val List[int] numbers = [1, 2, 3];
const mut List[int] other = [4, 5, 6];
let int z = 10;
let int z = 20;
let z :int = 10;
let z : int = 20;
```

Alternative declarations of y above are independent examples, not a single scope containing four y declarations. All four z declarations in order are fresh lexical shadow bindings.

- In a local declaration statement, resolved type-first `T name = expr` is implicit `const T name = expr`. Inferred, prefix-typed, colon-typed and name-first `as`-typed const declarations share one immutable fixed-binding representation.
- `const mut` and `val` are exact aliases: a fixed binding with the ordinary ownership-checked mutable-value access policy. No distinct mandatory compile-time template, implicit clone or additional allocation. Scalars have no mutable interior and can still be declared with either spelling, but neither permits replacement of the fixed root slot.
- All local const spellings admit once-only runtime initialization under ordinary type/effect/ownership rules; compile-time folding is an optimization when proven safe, not a requirement imposed by type placement. Preserve independent explicit compile-time requirements (e.g. final const where applicable) and file/module rules; do not silently reinterpret failed typing as val.
- `let` creates a fresh lexical binding on same-scope redeclaration, with existing explicit rebinding and ownership rules; same-scope const/implicit-const redeclaration fails. val/const mut fixed-binding same-scope redeclaration also fails. Mixed qualifier collision and nested scope policy beyond the existing contract need explicit reconciliation rather than silently changing scope behavior.
- Bare variable assignment `x = e` is not a declaration or legal reassignment. Explicit `set` / `set!` retain their separate contract; neither may replace fixed bindings. Do not change named arguments, record fields, constructor initialization or pair-forming `:=`.
- Support prefix/colon/name-first-as type annotations on explicit const, const mut, val and let. Generic, nominal, tuple and other valid resolved types use the existing type grammar. Colon whitespace is insignificant. A postfix initializer `expr as T` is the ordinary expression-level cast, not a token rewrite into an annotation: infer its result type, preserve conversion checks, evaluation order and failures. For an already-T literal the result is equivalent to the explicit T annotation. Distinct casts and incompatible annotations must not be erased.
- Evaluate the initializer exactly once before installing the new binding. Resolve a shadowing initializer against the preceding environment. Do not silently default-initialize, leak mutation authority through aliases, bypass sealed actor state, or introduce runtime storage/dispatch merely because of syntax.
- Type-first shorthand applies to local declaration positions only; no change to fields, parameters, module declarations, destructuring, or contextual match/if bindings. Ambiguous type/expression prefixes must be resolved with the real parser, not regular-expression source rewriting.

### Backend and tooling gates

Normalize aliases in typed AST/HIR while retaining spans and any real cast. Require equivalent diagnostics, typed IR and observable outputs; preserve formatter round-trip/idempotence and no semantic rewrite of casts. Test all eight compiler lanes (Java/GraalVM, LLVM, .NET NativeAOT, Rust, independent Wasm, JS, Forge, Cranelift), including actual guest execution, explicit rejection diagnostics, no illegal artifact, ownership/borrow and actor isolation, and AOT where applicable. No source-only test or zero-step Actions run constitutes compiler execution. Keep the older v1 descriptions below as historical implementation context until each dependent contract and compiler is reconciled.

## Decision and terminology

A **local** declaration whose first syntax constituent is a resolved type and whose binding qualifier is omitted has exactly the meaning of an explicit `const` declaration. Omission changes spelling only, never evaluation time, ownership, storage, or mutability. In particular, the compiler **MUST NOT** recover from a non-constant initializer by silently choosing `val`.

| Source form | Initializer | Can rebind | Mutation authority |
| --- | --- | --- | --- |
| `T x = e;` | compile-time constant expression | no | immutable constant value |
| `const T x = e;` / `const x: T = e;` | compile-time constant expression | no | immutable constant value |
| `const x = e;` | compile-time constant expression, type inferred (**target**; stage one keeps a readonly binding, see [stage-one scalar slice](#stage-one-scalar-slice-backend-status)) | no | immutable constant value |
| `const mut T x = e;` | compile-time constant expression, fresh owned runtime instance | no | mutable referent only under ordinary ownership checks |
| `val T x = e;` / `val x = e;` | runtime permitted | no | determined by independent ownership and borrow permissions |
| `let T x = e;` / `let x = e;` | runtime permitted | yes | determined by independent ownership and borrow permissions |

`mut` is not a shorthand for `let`. It qualifies access to a referent, not the identity of a binding. `let mut` remains the explicitly mutable-binding/mutable-access form where otherwise admitted. The keyword combination `const mut` is **never** shortened by dropping `const`: `mut T x = e;` is invalid, including when `T` is a mutable aggregate. A qualifierless declaration must not be reinterpreted as `val` merely because its initializer is not constant.

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

The universal explicit-initialization rule is specified in [chapter 28](28-explicit-initialization-no-implicit-defaults.md): no local may omit its initializer, and no field or aggregate may acquire a silent zero/default value. Constructor assignment is permitted only under the separate exactly-once definite-initialization proof there.

## Grammar and context boundaries

Proposed local productions (illustrative, not a complete parser grammar):

```text
local_decl :=
    type identifier "=" expr ";"
  | "const" type identifier "=" expr ";"
  | "const" identifier ":" type "=" expr ";"
  | "const" identifier "=" expr ";"
  | "const" "mut" type identifier "=" expr ";"
  | ("val" | "let") [type] identifier "=" expr ";"
```

`const x: T = e;` is the same typed constant declaration as `const T x = e;`; both have identical type checking, compile-time evaluation, rejection and immutability. Bare `mut T x = e;` is rejected with a dedicated `missing_binding_qualifier` diagnostic; it must not silently become `const mut`, `val mut` or `let mut`.

The `type identifier` prefix is a declaration only after type-name/generic syntax resolution in a declaration-eligible statement position. Parser and type checker must reject ambiguities, rather than reinterpreting `T x` as an expression or confusing generic angle brackets with comparisons. Module/global, class/actor field and parameter grammars remain separate. Existing field `int id: 7` and `final int epoch: 1` are **not** transformed into compile-time local constants by this change.

Existing `if runtime_expr as const name` uses `const` as a **contextual immutable binding** and does not require the expression to be compile-time evaluable. Pattern destructuring and `for const item` likewise keep their context-specific immutable-binding roles until separately specified. No global text rewrite of the lexeme `const` is permitted.

The formatter may normalize `const T x = e;` to `T x = e;` **only for validated type-first local declarations**; the reverse forms must yield identical typed IR, initializer checks, diagnostics, and observable behavior. It must preserve `const mut`, untyped `const x`, contextual `const` and explicit class/actor field modifiers. Format–parse–format is idempotent, including error cases that must not be auto-repaired into `val`.

## Stage-one scalar slice (backend status)

The first implementation slice, coordinated across java #3066 (leader), llvm #1779 and net #516, enforces only the **typed scalar** part of this chapter. It describes what those compilers implement; it is not a parity certificate (see the gates below).

- **Scope.** `T x = e;`, `const T x = e;` and `const x: T = e;` with `T` in `int`, `bool`, `string`/`String` (llvm and java; the .NET structured compiler has `int`/`bool` only). Type-first locals of other types (generic, nominal, aggregate, `T?`) are not admitted as runtime bindings either: they need a const evaluator for that type or an explicit `val`/`let`.
- **Constant expressions.** Literals; earlier typed scalar constants; unary `-` and `!`; checked `+ - *` on `int`; comparisons; `&& || ^^` on `bool`. Java additionally folds string `+` under a 1 MiB budget (`E_CONST_EVAL_BUDGET`) and `cond ? a : b` over constants. A call, a read of a `val`/`let`/parameter, `await`, actor state or any effect is not constant.
- **Diagnostics.** `E_NON_CONST_INITIALIZER` -> `non_const_initializer`; `E_CONST_OVERFLOW` -> `const_eval_overflow`; `E_IMMUTABLE_REBIND` -> `immutable_reassignment`; scalar `const mut` -> `E_CONST_MUT_UNSUPPORTED` (`invalid_const_mut_target`); bare `mut T x = e;` -> `E_MUT_QUALIFIER` (`missing_binding_qualifier`) in java and .NET.
- **Untyped `const x = e;` is deferred.** Java and .NET keep it as a fixed readonly binding: folded when the initializer is constant, otherwise evaluated once at runtime (java `docs/LANGUAGE.md`). LLVM rejects untyped scalar locals until inference lands (llvm #1256). Making untyped `const` compile-time-only needs a separate migration because java uses it widely as a runtime readonly binding, as do destructuring `const`, `for const` and `if ... as const`.
- **`val` is unchanged.** `val` stays the runtime fixed binding and keeps its referent-mutation permission subject to ownership checks; java still rejects `val mut` as a duplicate qualifier. Removing implicit referent mutability from `val` is a separate decision.
- **Aggregate `const` and `const mut`** keep their existing per-backend behaviour and are outside this slice; fresh-instance `const mut` materialization is not implemented anywhere yet.

## Verification and migration gates

Versioned positive and targeted-negative `.atto` fixtures must test: shorthand/explicit equivalence, including the type-right `const x: T` form; bare `mut` qualifier rejection; constant evaluation and rejection of runtime initializers; no reassignment; runtime `val`/`let`; fresh `const mut` instance isolation; rebind rejection; illegal global mutable constants; inappropriate scalar `mut`; actor/tenant isolation; borrow aliases; and formatter round trips. Negative results must match **semantic diagnostic categories**, not incidental parser failures. Verify all required compiler families at immutable commits, with real guest execution for positives and captured failure diagnostics for negatives. A source-only contract, host oracle, test file or mirror run is not compiler parity proof.

Until those gates are met, this chapter and its fixtures remain **proposed**. Legacy semantic-floor-v1 fixtures are preserved byte-for-byte and their existing unpublished execution status is unchanged.
