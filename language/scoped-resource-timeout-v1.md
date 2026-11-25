# Scoped resources and timeout across suspension (v1)

**Status:** Proposed normative source and lifecycle contract. This document is
not evidence of an executable compiler, a browser package linker, or backend
parity.

## Canonical example

```atto
import span from pkg "core.telemetry";
import sleep from pkg "std.time";

pub suspends fnc main(): int {
  using span("playground.demo") as current_span {
    with timeout(2000) {
      current_span.set_attribute("feature", "import");
      await sleep(1);
      stdio.println("span retained over suspension");
    }
  }
  return 0;
}
```

The import names are statically linked public exports, using the named import
grammar in `unified-static-imports-v1.md` (not a wildcard import or a
runtime-destructuring expression). The code also illustrates that
`using` is a **resource statement**, not an import declaration.

## Grammar and static checks

```ebnf
using_stmt   = "using", expression, [ "as", identifier ], block ;
with_stmt    = "with", expression, block ;
timeout_expr = "timeout", "(", expression, ")" ;
block        = "{", { statement }, "}" ;
```

- The binder `current_span` is lexical to its `using` body and cannot
  escape by returning or storing a non-owning reference to its scope.
- `using` evaluates the resource initializer exactly once, registers one
  cleanup obligation only after successful acquisition, and requires a
  resource that exposes the compiler-verified cleanup contract. This is not
  inferred from an arbitrary `close` method name.
- `await` is permitted only in an effect-checked `suspends` callable. A
  resource live across suspension must satisfy the target's suspend-safe
  ownership rule; borrow/loan state and cleanup obligation are retained in
  the continuation frame. Suspension alone **does not close** the span.
- `with timeout(2000)` begins a monotonic deadline on entry, in milliseconds.
  Nested timeouts use the effective minimum deadline. The scope includes all
  async child work that has not been explicitly detached under a separate
  capability, and must not block an underlying host/actor thread.
- `timeout` is contextual as a `with` scope operation, not an ambient
  import of a user function. An ordinary user-defined function with the same
  name must not silently substitute for the deadline capability.
- Negative, non-integer, overflowing or out-of-policy timeout values are
  rejected or produce a typed runtime error before entering the body, as
  appropriate to static versus dynamic values. No half-initialized scope
  may be left behind.

## Dynamic semantics

1. Acquire the span, bind `current_span`, and establish its cleanup guard.
2. Enter the timeout scope, register its monotonic deadline and task
   cancellation hook. With a 2000 ms deadline, `await sleep(1)` should
   normally finish first, but scheduling delays may still trigger timeout.
3. At `await`, persist the span handle and guard in the task continuation.
   Resume inside both scopes with the same resource identity.
4. On a normal body exit, return, handled or escaping throw/raise, timeout,
   or cooperative cancellation: retire the timeout scope, then unwind the
   `using` guard **exactly once** after all scoped operations complete.
   Nested cleanup occurs in reverse acquisition order; the span is never
   closed merely because the task is suspended.
5. On timeout, request structured cancellation and propagate a typed timeout
   failure only after scoped cleanup completes. A cancellation/timeout race
   must admit one terminal outcome, not double-release or use-after-close.
6. A hard process abort or forcibly terminated Wasm instance cannot promise
   in-guest cleanup; host-owned resources require their own terminal cleanup.
   Do not claim ordinary unwind semantics for such termination.

A cleanup failure must not silently replace an already-pending body error;
preserve both failure identities in diagnostic/result semantics. Exact
propagation and cleanup-failure encoding must be validated by runtime tests
before executable promotion.

## Required conformance / executable gates

Positive checks:
- Parse the literal example above, resolve public `span` and `sleep`
  exports, effect/type-check, compile to real Wasm, and execute the guest.
- Assert span identity before/after `await`, attribute preservation, one
  close after scope exit, and exact stdout + exit code 0.
- Cover nested using, return, throw, raise, handled errors, timeout,
  cooperative cancellation, and timer cancellation after early completion.
- Verify current suspended task can resume without replaying resource
  acquisition, attribute writes, or completed print operations.

Negative checks:
- Reject `await` in a non-`suspends` callable; invalid imports and
  inaccessible exports; missing cleanup contract; escaped scope binder;
  non-suspend-safe resource; negative timeout; forged timer capability.
- Assert no Wasm guest emitted on rejection and no leak/double cleanup in
  cancellation races. Ensure a timeout is not implemented as a worker-thread
  sleep or as a host-only JavaScript interpreter of source text.

A syntax-highlight/catalog test or parse-only target scanner is not proof
of language support. Promote the example from preview to showcase only
when native Rust and wasm32 compiler parity, real guest execution, browser
Worker integration and resource lifecycle negative tests pass at exact
source revision. Record unsupported backends honestly instead of inventing
cross-backend evidence.
