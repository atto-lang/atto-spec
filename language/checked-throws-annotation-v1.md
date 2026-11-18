# Checked throws declarations: signature clauses and annotations (v1)

**Status:** proposed normative language contract, implementing in bounded
Rust/Wasm frontend stages only. This document adds a Java-style checked
ordinary-throw contract without conflating source exceptions with returned
`Result`, raised faults, or actor panics.

## Equivalent source forms

A caller-visible `throws` declaration can be written after the callable
signature, or before it as an **attached semantic annotation**:

```atto
fnc load(int id): User throws(Error) {
    return fetch_user(id);
}

@throws(Error)
fnc load(int id): User {
    return fetch_user(id);
}
```

Both spellings normalize to the same typed callable signature,
`load(int) : User ! {throws(Error)}`. The modifier is not a runtime
decorator and does not alter evaluation, dispatch, ABI, method overloading,
or exception type identity.

Apply the same rule to `fnc`, `routine`, instance or static `mtd`
and `method` declarations, actor methods and typed `receive` handlers,
including out-of-line attached methods. The browser compiler's initial
admission may cover only built-in `Error` and its existing syntax
subset; unsupported callable forms and Error subtypes must fail closed.

For consistency, `@raises(Error)` and `@panics(Error)` are equivalent
to their existing `raises(Error)` and `panics(Error)` signature clauses.
These failure channels remain **independent**; an annotation must never
lower `raise` or `panic` to an ordinary `throw`.

## Grammar and normalization

```ebnf
failure_kind       = "throws" | "raises" | "panics" ;
failure_types      = "(", error_type, { ",", error_type }, ")" ;
failure_annotation = "@", failure_kind, failure_types ;
effect_clause      = failure_kind, failure_types ;
callable_decl      = { failure_annotation }, callable_header,
                     { effect_clause }, callable_body ;
```

The full language may resolve one or more nominal `Error` subtypes per
clause, subject to the corresponding capability interfaces. This
currently **does not authorize** any browser backend to accept a union
or arbitrary subtype before representation and ancestry checking exist.

The AST/HIR records one canonical effect row per callable:
`{ throws: TypeSet, raises: TypeSet, panics: TypeSet }`, along with
source spans for diagnostics. Textual order between **different**
effect kinds is not significant; a formatter may choose the signature
form as the canonical pretty-printing choice while preserving parsed
semantic equivalence. Source spans should remain attributable to the
user's annotation or clause.

- Repeating the **same failure kind** in annotations or clauses, even
  with identical types, is a deterministic duplicate-declaration
  diagnostic. Prefer using just one placement for each kind.
- Different kinds may be split between prefix annotation and suffix
  clause, e.g. `@throws(Error) fnc f(): T raises(Error) { ... }`.
  They combine into one row; no effect is silently omitted.
- An annotation applies to exactly the **immediately following
  callable declaration**, not the following scope, overload group,
  module, class, parameter, variable, or constructor. An orphaned
  annotation, unknown annotation, or non-callable target is diagnosed.
- Validate all annotation arguments as nominal types with
  `Error` ancestry and required `Throwable`/`Raisable`/
  `Panicable` capability. No `@throws(string)` loophole.
- A `pure` callable must remain effect-free regardless of whether a
  forbidden effect came from prefix or suffix notation.
- A public exported callable must publish an explicit, checked
  failure upper bound (including an explicit no-throw contract in
  later language phases); purely internal callable effects may be
  inferred, but every public **caller boundary** must still account
  for them. A declaration does not suppress a failure.

## Java-style checked-caller rule

For each call to a routine/method/function value with
`throws(E)`, the enclosing operation must do one of:

1. Establish a matching typed `try/catch` that handles every
   possible ordinary thrown type, preserving unmatched residual
   effects;
2. Use `trap expression` at the dynamic caller boundary, producing
   the **must-handle** `Result<T,E>` (or joined Result), without
   swallowing `raise`/`panic`;
3. Propagate the escaping ordinary-throw effect through a compatible
   declared or inferred `throws` upper bound, until a permitted
   outer boundary handles it.

A **public request/entrypoint boundary** cannot silently infer an
unhandled throw out of existence. The application/task boundary must
have an explicit policy for remaining exceptions; for an actor,
unhandled failures must follow its supervisor CONTROL escalation
contract. Declaring `throws` means "may propagate", **not**
"handled by this callable".

`Result.Err` and `Option.None` remain ordinary returned values:
`throws` does not allow discarding an `Err`. `?` propagates checked
`Err`/`None` values, not exceptions. A function may have both
`Result<T,E>` and `throws(F)` in its signature, and both
independent obligations must be checked.

## Functional and continuous pipelines

For `a |> f` and `f <| a`, use the **same inferred checked throws
effect** of `f(a)`; the operator never erases or converts the effect.
For higher-order functions, callback signatures must carry their
effects; an unresolved callback may not be assumed pure.

For `source pipe transform pipe sink`, validate every stage's
failure effects and return checked
`Result<PipeHandle, PipeSetupError>`. Any later stage ordinary failure
is a checked `PipeError` observable via `await get_done()`, not
silently caught by setup-time `trap`. `rpipe` reverses graph wiring,
not failure semantics. Actor CONTROL notices remain independent
from stream DATA and `get_done()` outcomes.

## Minimum proof obligations

1. Signature and annotation versions have identical AST effect rows,
   typed-caller diagnostics, and emitted guest behavior where supported.
2. A caller with an uncovered `throws(Error)` effect and no compatible
   propagation policy is rejected before codegen.
3. Calls that are trapped or exhaustively caught remove only the
   **corresponding ordinary throw effect**, not raises/panics.
4. An explicit `throws(Error)` or `@throws(Error)` bound is checked
   against transitive calls, including mutually recursive call cycles.
5. Duplicate/conflicting declarations and invalid nominal Error
   types fail with stable errors and **no guest artifact**.
6. A non-executable actor receive/continuous transport path cannot be
   labeled "proved" just because an effect annotation was parsed.
7. Backend proof receipts include source and test SHAs, full admitted
   fixture outcomes, and run logs; parser-only or host-only tests
   cannot stand in for actual guest execution.

For the proof-versus-accounting distinction, see
[pipeline-effect-proof-v1.md](pipeline-effect-proof-v1.md). A fully
verified soundness theorem must state exactly which source operations,
FFI calls, runtime failures and trusted assumptions it covers.
