# Deferred cleanup and recovery chains (proposed AttoLang v1)

**Status: normative candidate; not an executable-backend parity claim.**

**Trap Result migration:** [trap-result-v1](trap-result-v1.md) now defines `trap expression` as returning `Result`, retaining the original caught Error rather than the obsolete Option/None wrapper. Existing restricted browser execution receipts below do not establish full new Result/error-join parity.
The Rust/Wasm browser compiler executes a **restricted synchronous
top-level free-function slice** of ordinary `throw Error(message)`, `trap`,
`try/catch/finally`, `defer`, `recover`, and `raise` with executable Wasm
guest traces. Actor, async/cancellation and full Error subclass parity remain
unverified. Java has experimental host recovery-chain work; LLVM has a
narrower synchronous normal-exit defer slice. Neither constitutes full
guest-source conformance across backends.

## Separate control effects

| Source effect | Ordinary `catch` | `trap expression` | Registered `recover` | Ultimate failure |
| --- | --- | --- | --- | --- |
| `throw Error` | Nearest matching catch in the caller chain | Capture as `Err(original Error)` inside `Result` at a reached trap boundary | **Only if still unhandled** on reaching an eligible recovery boundary | Escalate at actor/task boundary |
| `raise Error` | Bypass | Bypass | Nearest eligible recover callback | Parent task or supervisor CONTROL |
| `panic Error` | Bypass | Bypass | **Never locally recoverable** | Supervisor CONTROL / root fatal policy |
| cancellation, host fatal | Bypass | Bypass | **Never** | Scheduler / host policy |

All source `throw` / `raise` / `panic` operands must be a statically
validated `Error` subclass, including the built-in `Error`. Distinguish
an application `raise` from host/runtime traps, allocator exhaustion,
authenticated cancellation and forced termination; none can be relabeled
as a recoverable application error.

A `throw` visits ordinary typed `catch` clauses and caller-side `trap`
boundaries **across the entire dynamic call chain to its task/actor failure
boundary before any `recover` callback is eligible**. A matching catch
consumes it; merely having a `try` does not. This includes a catch in the
caller's caller: a recovery registration inside a callee must not preempt
an outer caller's catch. A throw reaching a local `recover` registration
is **not** by itself proof that all caller catches have been exhausted.
If all catches/traps decline the throw, invoke eligible recovery callbacks
in their original LIFO registration order. If no callback handles it,
escalate at the explicit task/actor boundary, retaining original Error
identity and effect. A recover callback is not a second catch.

**Required implementation consequence:** full caller-chain catch precedence
requires a two-phase failure dispatch. Record eligible recovery registrations
in compiler-owned, lifetime-checked unwind metadata while searching outward
for ordinary catches; do not invoke a recover callback eagerly during this
search. A catch may win and discard these registrations without executing
them. If no catch wins, the recovery callbacks and any necessary suspended
typed continuations must remain valid despite cleanup of failed scopes.
Fail closed for any backend that cannot prove this ownership/lifetime and
resumption property. This cannot be implemented by installing one ordinary
Wasm exception handler at each local `recover` site.

## Accepted source syntax (canonical v1)

For imperative exception statements, both braced and keyword/end-delimited `try/catch/finally` are target spellings with the same unwind rules; see [imperative try block styles](imperative-try-blocks-v1.md). This does not certify execution.


All of the following register a deferred cleanup; **the block form is
canonical** for an ordinary zero-argument cleanup:

```atto
defer { release_resource(); };
defer _ -> { release_resource(); };
defer || -> { release_resource(); };
defer (|int captured| -> _ -> {
  stdio.println(captured);
})(5);
```

In these cleanup-registration contexts, `_ ->` is a nullary lambda
shorthand, **not** an ignored one-argument lambda. A factory evaluates its
explicit arguments exactly once in source order during registration and
stores the captured values in compiler-owned frame slots. Cleanup does not
run until leaving the eligible scope. A failed argument evaluation never
registers a partially initialized cleanup.

Recovery has an explicit two-parameter handler:

```atto
recover |err, cursor| -> {
  stdio.println(err.message);
  return 9;
};

recover |ErrorView err, RecoveryCursor cursor| -> {
  if err.is_raise then
    return 9;
  fi
  cursor.next();
};

// Compatibility/factory form remains admitted:
recover (|int fallback| -> |err, cursor| -> {
  return fallback;
})(9);
```

The inferred handler parameters are compiler-issued `ErrorView` and
`RecoveryCursor`; explicit annotations must use these respective special
types. The formatter should prefer `defer { ... };` and
`recover |err, cursor| -> { ... };` while retaining factory syntax when
captures are present. A bare `recover { ... }` is intentionally not admitted
because error/cursor handling must be explicit.

`ErrorView` is a **non-escapable, read-only, scope-bound view** over the
original failure. The initial verified browser profile exposes only
`err.message: string` and `err.is_raise: bool` (true for an escalated
`raise`, false for an ordinary unhandled `throw`). The handle itself
cannot be stored, returned, moved, cloned, captured, or sent to another
actor. Those properties do not allocate another Error or change the
underlying Error identity. `RecoveryCursor` is also non-escaping; in the
admitted profile its only operation is terminal `cursor.next()`.

**Fail-closed hardening and inferred escaping effects:** A recovery
handler's compiler-issued error and cursor binding names cannot be shadowed
by nested local bindings. The browser checker computes a two-channel
(`throws Error`, `raises Error`) *escaping* effect summary for each typed
function by monotone call-graph fixed point, including recursive call groups
and effectful argument evaluation. Ordinary `catch (Error e)` discharges
`throws` from its protected body; its handler is checked separately. A
caller-side `trap expression` discharges only ordinary `throws` of the
expression; neither mechanism discharges `raises`. Consequently a function
that catches its own ordinary throw, or traps that throw, can be invoked
inside `defer`, `recover`, or `finally` without causing a false rejection.
A cleanup body's remaining escaping throw/raise is rejected before Wasm
emission, including indirect calls through a cycle. Callback registration
does **not** discharge its enclosing function's effect merely because a
`recover` exists: an outer caller's `catch` or `trap` must retain priority.
Effects of potential unreachable statements/handlers may still be
overapproximated until full CFG reachability and effect polymorphism are
implemented. Panic, forced termination and host traps are not ordinary
catchable `Error` effects and do not gain any new cleanup guarantee.

Factory argument failures do not register an incomplete cleanup, but
previously registered cleanups still unwind. Full cleanup-failure
suppression and cross-backend effect-polymorphic admission await separate
proof.

**Effect spelling compatibility:** The verified browser subset presently documents legacy `throws(Error)` and `raises(Error)` effects; the target Java-style `throws Error`/`raises Error` spelling is a separate grammar migration and must be admitted by a real parser before it is claimed executable.

**Explicit source upper bounds (browser compiler hardening):** A top-level
function may declare `throws(Error)`, `raises(Error)`, or both. Once any
explicit exceptional-effect clause is supplied, the declared ordinary
`throws` and escalated `raises` channels are checked as a complete upper
bound for those two effects. For example,
`fnc f(): int throws(Error) { raise Error("x"); }` is rejected
(`E_EFFECT`), including when the undisclosed raise comes from a callee.
A function without any exceptional-effect clause retains inference-only
compatibility; absence of an annotation is **not** a claim of no exceptions.
`panics(Error)` can be parsed and retained but does **not** constitute a
certified no-panic proof: fatal overflow/traps, cancellation and host
termination remain outside this checker.

For the admitted typed sublanguage, let `E` contain independently tracked
`throw` and `raise` effects. The checker iterates a monotone finite
call-graph fixed point to resolve recursive functions. Its relevant
transfer rules are:

- `E(trap e) = E(e) - {throw}`, never removing `raise`.
- `E(try b catch h finally g) = (E(b) - {throw}) ∪ E(g) ∪
  (if throw ∈ E(b) then E(h) else ∅)`.
- `E(call f(args)) = E(f) ∪ ⋃ E(args)`.
- Explicit `return`, `throw`, `raise` and other structurally proven
  terminal exits cut off effects of *following* unreachable statements.
- `defer`, `recover`, and `finally` callback bodies must have no
  escaping `throw` or `raise`; factory-registration arguments are separately
  evaluated before callback registration.

These rules are intentionally conservative around conditional reachability
and do not constitute general whole-program proof of the `panic` channel,
suspension, resource-release liveness, or other backends.

**Admission note:** The Rust browser compiler currently supports only
top-level registrations in synchronous free-function bodies, scalar/string
factory captures, and compiler-owned unwind frames. Nested scope,
suspension, actor-supervisor, arbitrary Error subclasses, and transferable
error handles still require separate implementation and conformance tests.
Do not interpret a successful parser check as cross-backend execution parity.

## Registration, cleanup and callback contract

The source-level candidate follows the Java recovery-chain draft:

```atto
fnc load(string id): int {
  recover (|string label| -> |err, c| -> {
    if can_fallback(err) then
      return 7;
    fi
    c.next();
  })(id);

  defer || -> { release_resource(); };
  return may_raise_or_throw(id);
}
```

- A `defer` registers a cleanup **without running it**. Once registered,
  it runs exactly once in reverse registration order on ordinary return,
  uncaught throw, raise, panic, cancellation or scope exit where the
  runtime can safely execute guest cleanup. Cleanups run on the owning
  task/actor execution context, never on a foreign mailman or I/O thread.
  VM-corrupting abort and OS kill cannot promise cleanup.
- A `recover` registers a recovery callback factory. The factory and
  its explicit capture arguments are evaluated once, at registration;
  its handler is invoked **only while unwinding** a permitted throw or
  raise. It never runs on successful return.
- On unwinding, run the affected scope's registered defers and compiler
  owned resource guards **before** invoking its recover callbacks.
  Inner scopes unwind before outer scopes. `finally` executes once,
  regardless of matching or bypassed ordinary catch.
- Eligible recovery callbacks run LIFO. A callback must either return a
  value compatible with its enclosing callable (`Recovered<T>` result)
  or call terminal `c.next()`, which passes the unchanged pending
  failure to the next eligible callback or outer boundary. There is
  no automatic continuation of the interrupted statement. No callback
  may silently fall through, invoke `c.next()` twice, store/clone/send
  the cursor, or reenter itself when it raises another error.
- The compiler enforces capture ownership, effects, return type, lifetimes
  and cancellation safety. Recovery cursors are compiler-issued one-shot
  non-`Send` values and cannot escape the dynamic recovery invocation.
- A defer/cleanup failure never silently erases a stronger pending
  cause. Keep the original cause and bounded suppressed diagnostics;
  attempt other registered cleanups. Fatal/cancel > panic > raise >
  ordinary throw > success is the precedence order for terminal
  outcomes. In particular, recovery may not convert a panic or
  cancellation to success.
- Await/task boundaries require durable compiler-owned unwind frames
  rather than native thread-local or Java thread-affine handlers.
  Physical child/actor quiescence and ownership/lock retirement are
  prerequisites for releasing an actor arena.

## Mandatory conformance traces

Each row is an **expected future guest trace**, not a passed test.

| Scenario | Expected ordered trace / outcome |
| --- | --- |
| Normal return with two defers | register A, register B, body, B, A; original return value |
| Early return evaluates expression before cleanup | return expression, B, A; snapshotted return value |
| Raise inside a try/catch | body, finally, deferred cleanup, recover; **never catch** |
| Throw handled locally | throw, matching catch, finally, cleanup; **never recover** |
| Throw from a callee with recover, handled by an outer caller | callee defers, caller catch, caller finally; **never callee recover** |
| Throw through nested calls with no matching catch | inner finally/defers, outer defers, recover with original Error |
| Recovery delegates | newest recover calls `c.next()`, then next older recover sees same Error exactly once |
| Recovery declines all callbacks | original error escapes to parent/task supervisor |
| Panic in defer or ordinary code | no catch/trap/recover success; supervisor CONTROL with original failure |
| Cancel while suspended | no catch/trap/recover success; cleanup/guard retirement once where safe |
| Cleanup raises during an existing throw | stronger failure wins, weaker cause recorded as suppressed |
| Raise or throw with non-Error payload | compile-time type error; no Wasm output |
| Unrecognized tag/host exception/guest OOM | never interpreted as a source Error or recoverable raise |
| Concurrent serial actor messages | recover runs on the single actor turn, not a different mailman thread |
| Nested recovery scopes and repeated failures | per-invocation LIFO chain, no stale cursor reuse or duplicate callbacks |

## Implementation and admission gates

1. Parse and type `defer` / `recover` / `raise` without giving
   unsupported syntax a valid emitted guest. Reserve separate typed
   ordinary and escalated failure tags (never reinterpret Wasm panic traps).
2. Compile cleanup scopes with all early-return, fallthrough, throw,
   raise, cancellation and owned iterator/guard exit edges. Prove
   once-only LIFO order and return-value snapshots on executed guests.
3. Prove dynamic catch-chain precedence over recover; restore original
   Error identity and typed effect while crossing function boundaries.
4. Lower typed recovery callbacks, captures and the bounded one-shot
   cursor. Prove panic/cancel/host-fatal bypass using negative tests.
5. Execute the same fixture sources from native Rust and wasm32 Rust
   compilers and run the resulting guest Wasm; compare observable traces
   with Java/GraalVM and LLVM source compiler artifacts on exact SHAs.
6. Only after those checks and independently reviewed browser-artifact
   promotion may the public playground move these source-only previews
   into its runnable picker.

Cross-reference: the active [Java/GraalVM backend](https://github.com/atto-lang/atto-source.java), [LLVM backend](https://github.com/atto-lang/atto-source.llvm), and [platform conformance](https://github.com/atto-lang/atto-platform-conformance). Earlier design snapshots included an obsolete proposal permitting local panic recovery; **this document explicitly rejects local interception of panic**. The earlier snapshot paths are not published in these canonical repositories, so do not treat them as live documentation or execution evidence.
