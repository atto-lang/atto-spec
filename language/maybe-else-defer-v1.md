# Maybe/else and defer: AttoLang v1 candidate contract

Status: **converged design, implementation NOT VERIFIED**, 2026-11-21.
This is the *proposed* backend-neutral meaning, not a claim of supported
runtime behavior. It reconciles the earlier Atto spec and
[conformance proposal #485](https://github.com/atto-lang/atto-platform-conformance/pull/485).
A runner-executed positive/negative guest suite and independent review
are required before this can become an admitted cross-backend feature.

## Value matching, not an exception handler

A `maybe` evaluates its body from left to right. In `P ?= expr`, evaluate
`expr` **once**; if the value matches pattern `P`, bind its names in the
remaining successful body; otherwise skip every later body item and dispatch
the **original unmatched value** to a compatible `else` arm. A plain
`Err(value)` or `None` expression without `?=` is an ordinary value,
not a failure or a thrown exception.

```atto
define pub fnc load_balance(int id) -> Result[float, Error] as
  defer log("balance complete");

  return maybe
    Ok(user) ?= fetch_user(id);
    Ok(account) ?= fetch_account(user);
    Ok(balance) ?= get_balance(account);
    Ok(balance)
  else
    Err(reason) -> {
      log_error(reason);
      Err(reason)
    };
  end;
end
```

The above is a **candidate source example**, not proof that any compiler
accepts or executes it. Use `do maybe ... else ... end` for a procedural
scope; an ordinary successful fallthrough is not an implicit function
return. `return maybe ... else ... end;` requests a value from `maybe`
and then returns it from the enclosing function. A `return` statement
written inside a body or handler exits the **nearest enclosing callable**
(including any nested lambda), not a match arm. If every branch explicitly
returns, the `maybe` operand has bottom / `Never` completion and the
outer `return` must not create a second return.

## Syntax and keyword admission (v1)

```ebnf
maybe_stmt = "do", "maybe", maybe_body, "else", maybe_arms, "end", [";"] ;
return_maybe = "return", "maybe", maybe_body, "else", maybe_arms, "end", ";" ;
maybe_body = maybe_item, {";", maybe_item} ;
maybe_item = ordinary_stmt | expression | fallible_bind ;
fallible_bind = pattern, "?=", expression ;
maybe_arms = ["on"], pattern, ["when", guard], "->", arm_body,
             {";", ["on"], pattern, ["when", guard], "->", arm_body} ;
```

- `maybe` is **contextual**, not a globally prohibited identifier.
  `let maybe = 7;` and `return maybe;` are legal where identifiers are
  otherwise legal. A parser must unambiguously recognize the structured
  `do maybe` or `return maybe` form before treating it as a block.
- `?=` is atomic. In a structured `maybe` body it denotes a fallible
  pattern binding; this meaning is unchanged by the V2 optional-parameter
  contract, which additionally admits `?=` as a None fallback delimiter
  only in formal default-clause position. See [chapter 27](../spec/27-optional-and-named-arguments.md).
  It is not an alias for `=`, `?` early-exit, or the ternary operator.
  General expression/writeback uses remain rejected.
- For v1, `else` is **mandatory** and its possible failure alternatives
  must be exhaustively covered. Implicit propagation without `else`
  is deferred to a separately reviewed future version.
- `Ok(x) ?= Result[T,E]` exposes `x:T` only on success and has an
  `Err(E)` failure path; `Some(x) ?= Option[T]` similarly has `None`.
  All failure alternatives require matching handlers; there is no silent
  `Err`/`None` conflation, implicit error type conversion, or flattening.
- `on` before each failure pattern is accepted as a compatibility spelling.
  Omit `on` in canonical new examples, preserving the source author's
  choice in existing formatting until a dedicated formatter decision.
- Braced `{ ... }` arm bodies are allowed. An `end` belongs to the
  nearest active keyword block, including nested `try` and `maybe`.
  Arbitrary comma-separated body items and a bare, expression-position
  `maybe` form are future extensions; v1 uses explicit semicolons and
  the disambiguated `do` / `return` forms.

## Binding, typing, effects, and control flow

The first failed `?=` chooses **one** compatible `else` handler.
Successful `?=` binders are scoped to later success items; they are
not visible to `else` or after `end`. An `else` arm binder is local
to its arm. Exhaustiveness is static; unreachable/duplicate guards,
invalid variant arity, incompatible success/failure types and partially
initialized or escaping borrows must be rejected.

The result type of a value-producing `maybe` unifies successful and
handled-failure completions. Functions, including their nested explicit
returns, obey definite-return and `Never` analysis. Ownership moves,
actor sealed state, suspension, cancellation, borrowing and effects are
checked on **every** CFG edge. Never implement `maybe` through untyped
host exceptions, `catch`, or the value-match `ARM_RESULT` lowering
that changes source function-return semantics.

An ordinary guest `throw Error` inside `maybe` is **not caught by
`else`**; it may be intercepted by the nearest applicable outer
`try/catch`. `raise` bypasses ordinary catches; actor panic escalates
via supervisor CONTROL and is not interceptable locally. Explicit
`trap` and the distinct early-return `expr?` keep their own rules:
`expr?` exits the enclosing callable and does not dispatch to `else`.

## Precisely ordered cleanup

Defers are registered **only when reached** and execute exactly once
on eligible structured exits, in LIFO order per lexical scope.

1. Upon a failed `?=`, **exit the maybe body scope first**: run its
   reached body-local defers in reverse registration order.
2. Dispatch the original failed value to a matching `else` arm **after**
   body cleanup. Run reached handler-local defers on leaving that arm.
3. On a successful body completion, run body-local defers before the
   `maybe` result is delivered. On an explicit function return from
   the body/handler, return expression evaluation precedes cleanup.
4. Function-scope defers then run on exit from the enclosing callable,
   and outer `try/finally` performs its own applicable cleanup exactly
   once. An outer `catch` on an ordinary throw is reached only after
   inner eligible defers have unwound; value-based `else` is skipped.

Example trace for a failed second `?=` with two body defers,
an `else`-local defer, a function defer and an outer finally:

```text
call:first; body-defer:B; body-defer:A; else:Err;
handler-defer; function-defer; outer-finally
```

A defer cannot override the in-flight control transfer through a
`return`, `break`, `continue`, `?` or `?=`. No untracked
suspensions or unhandled cleanup errors may silently replace a primary
failure. Borrowed captures stay alive through their own deferred cleanup.
All cancellation/unwind promises are bounded by the backend's supported
physical quiescence; no guarantee exists for hard process termination,
fatal host traps, OOM or unrecoverable runtime death.

## Relationship to imperative try syntax

Both `try { ... } catch(...) { ... } finally { ... }` (without `end`)
and `try ... catch(...) ... finally ... end` lower to the same
exception-handling AST. Neither alters `maybe` value semantics.
A `maybe` nested inside a keyword `try` consumes its **own** `end`;
a thrown Error passes through `maybe` cleanup into the outer catch,
and an early function return performs eligible `finally` once. See
[imperative try PR #196](https://github.com/atto-lang/atto-spec/pull/196).

## Admission gates (unmet as of this proposal)

- Positive and negative compiler tests: first/middle/last failed bind,
  eval-once, no later calls after failure, result/option exhaustiveness,
  distinct error types, user variable named `maybe`, `Never` return,
  and `?=` outside structured maybe or an explicitly admitted formal default clause.
- Real cleanup trace from guest programs: body-local defer **before**
  `else`, handler cleanup afterward, function defer and outer finally;
  ordinary throw skips else and reaches catch, raise skips catch.
- Nested block parsing and formatter round-trip/idempotence, both
  braced and keyword try contexts, no capture of an inner/outer `end`.
- Type/ownership/actor-effect negatives; native LLVM O0/O2, Java/GraalVM,
  .NET NativeAOT, Wasm, and Forge/Cranelift actual guest execution.
- Record exact source/fixture blob SHAs and outcomes
  PASS/FAIL/UNSUPPORTED/NOT_EXECUTED. Host JavaScript reference models
  and runner-admission failures **cannot** certify guest execution.

Implementation-specific limitations may remain stricter than this proposal,
but must reject unsupported programs explicitly rather than reinterpret
the value/exception boundary or cleanup order.
