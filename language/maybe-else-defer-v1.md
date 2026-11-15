# Maybe/else with defer: proposed AttoLang v1 contract

Status: **proposal, not compiled support**, 2026-11-15. This defines a target
language contract; it does not establish support in Rust/Wasm, Java or LLVM.
Erlang's maybe uses value-pattern short-circuiting rather than catching
exceptions. We preserve that separation.

## Canonical proposed syntax

~~~atto
fnc read_count() -> Result<int,string> ::
    maybe
        Ok(is int as val handle) ?= open_handle(),
        defer close_blocking(handle),
        Ok(is int as val count) ?= read_handle(handle),
        Ok(count)
    else
        on Err(is string as val reason) -> Err(reason)
    end
end
~~~

The optional on marker deliberately follows AttoLang match-arm notation,
not Erlang's exact spelling. The example is **target syntax**, not currently
an executable fixture. Explicit binders (as val, as let, etc.) follow the
structural pattern contract; none may default to mutable access.
The callable's comma-delimited Erlang-style body and conventional
brace/semicolon form must both parse without confusing expression commas,
pattern commas or argument commas.

Grammar sketch:

~~~ebnf
maybe_expr = "maybe", maybe_body, ["else", maybe_arms], "end" ;
maybe_body = maybe_item, {separator, maybe_item} ;
maybe_item = statement | expression | conditional_match ;
conditional_match = pattern, "?=", expression ;
maybe_arms = "on", pattern, ["when", guard], "->", arm_body,
             {"on", pattern, ["when", guard], "->", arm_body} ;
~~~

The ?= token is indivisible, is permitted only for top-level maybe-body
items, and is not general assignment. The ? early-return operator
remains distinct.

## Semantics and invariants

1. Evaluate each reached expression exactly once, from left to right.
2. Successful P ?= expr binds its explicit pattern names only for
   subsequent items in that maybe body. The last successful expression
   yields the maybe result. Normal expression evaluation, including
   Err(x) or None values, does not automatically enter else.
3. Failed P ?= expr stops the body immediately. Feed the **original**
   evaluated nonmatching value to the first matching else arm.
   If there is no else, yield that original value, subject to static
   type unification with the successful path.
4. When else exists, require exhaustive error-value arms for the possible
   failing subjects or an on _ fallback; never silently drop a failure.
   Detect unreachable/duplicate arms and type-invalid guards. Guards
   must evaluate once and must not mutate/move the failure subject.
5. Bindings in the maybe body are not visible in else or outside end.
   Else-arm binders are scoped to that guard/body only. Reject partially
   initialized bindings, stale borrows, double moves and access to another
   actor's sealed state. Both successful and handled failure branches
   must unify to one static expression type; no implicit flattening of
   nested Result/Option values.
6. An ordinary throw Error(...) does **not** trigger else; nearest try/
   catch applies. Raise follows defer/recover escalation. Actor panic
   goes to supervisor CONTROL and is not interceptable by that actor.
   trap is a separate, explicitly requested exception-to-value operation
   and must not catch fatal engine traps.
7. The existing expr? returns early from the enclosing callable, *not*
   from the maybe body through else. It executes eligible cleanup on
   the way out.

## Defer and the finally effect

A reached defer registers one cleanup action in the entire maybe-expression
scope, including its else arms. On successful completion or completion of a
chosen else arm, run registered cleanup in **reverse registration order**
before delivering the resulting value. A failed ?= transfers into else
**before** unwind, so an inner resource can be inspected by the appropriate
cleanup while else handles the failure *value*. A defer that was never
reached is never registered. Nested scopes unwind inside-out.

The same registered defers must execute exactly once on an eligible
ordinary return, break/continue, guest throw, raise or supported
cooperative cancellation/unwind. Captures and loans stay live until their
cleanup: reject moving a captured resource, borrowing across forbidden
suspension, or escaping a maybe-local borrow. Defer may not use return,
break, continue, ?, ?= or other control transfer to override an in-flight
result. Require statically nonthrowing cleanup, or explicit handling of
fallible cleanup operations, so cleanup failure never silently replaces
the primary error. Cleanup in real-time or critical sections must respect
effect, nonblocking and worst-case-time constraints.

**No universal cleanup guarantee** exists for fatal panic, OOM,
process termination, host trap, hard cancellation, or runtime death.
Panic still reports through supervisor CONTROL; it is not converted into
a value and is not caught by else. Never advertise defer as stronger than
the runtime's actual unwind boundary.

The flow is: **conditional-match failure -> else value handler -> defer
cleanup -> result**. Ordinary exception flow is **throw/raise -> defer
cleanup on supported unwind -> outer exception machinery**.
Therefore maybe/else + defer provides a finally-like effect for supported
exits, but does not replace try/catch.

## Mandatory regression cases

| Scenario | Expected behavior |
|---|---|
| Two successful ?= | each operand evaluated once; final value |
| Failure at first/second ?= | later items skipped; original failed value handled |
| Failure without else | return original failure if type-compatible |
| Err or None without ?= | ordinary value, not auto-failure |
| Return or expr? inside maybe | registered defers run; else bypassed |
| Throw inside maybe or else | else bypassed; eligible defer then catch |
| Raise or actor panic | existing escalation; never swallowed |
| Nested defers, partial registration | exactly once, reverse order |
| Else using maybe-local binding | compile-time scope error |
| Wrong pattern, missing qualifier, nonexhaustive else | static diagnostic |
| ?= outside maybe or inside guard | static diagnostic |
| Defer with control transfer or unhandled throw | static effect diagnostic |
| Move/borrow across defer or await/select | ownership/effect rejection |
| Fatal trap or hard cancellation | no false cleanup assertion |

## Implementation and verification gate

The Rust browser subset does not lower general try/catch or defer.
It supports only a narrower ordinary guest throw/trap mechanism.
Until cleanup edges are verified, maybe is **E_UNSUPPORTED** and never
approximated as a plain identifier or callable. A parser-only green test
is not proof of runtime correctness.

For each backend: lexer/parser and formatter round trips; typed AST
success/failure/unwind edges; exhaustive pattern/type and definite
assignment analysis; ownership and effect checks; once-only cleanup
lowering; executable guest native/Wasm tests for both paths; full-AOT,
actor supervision and suspension verification where relevant. Record
the exact commit SHA and status passed/failed/unsupported/not-executed.
Do not call host-only reference tests executable backend conformance.
