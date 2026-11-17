# Deferred cleanup and recovery chains (proposed AttoLang v1)

**Status: normative candidate; not an executable-backend parity claim.**

**Trap result migration:** [trap-result-v1](trap-result-v1.md) replaces the legacy `Option` trap result with `Result` and requires nonconformant backends to reject the old lowering.
The Rust/Wasm browser compiler currently executes a restricted ordinary
`throw Error(message)` / caller-side `trap expr` path, but not source `try`,
`catch`, `defer`, `recover`, or `raise`. Java has experimental host
recovery-chain work; LLVM has a narrower synchronous normal-exit defer slice.
Neither constitutes full guest-source conformance.

## Separate control effects

| Source effect | Ordinary `catch` | `trap expression` | Registered `recover` | Ultimate failure |
| --- | --- | --- | --- | --- |
| `throw Error` | Nearest matching catch in the caller chain | Catches as `Err(original Error)` in a Result at a reached trap boundary (see [trap-result-v1](trap-result-v1.md)) | **Only if still unhandled** on reaching an eligible recovery boundary | Escalate at actor/task boundary |
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

Cross-reference: `oreslang-source.java/docs/RECOVERY_CHAIN_DATA_LAYOUT_V1.md`,
`oreslang-source.java/docs/TASK_CANCEL_DEFER_RECOVER_LOCKS_V1.md` and
`oreslang-source.llvm/docs/EXCEPTION_SUPERVISION_SEMANTICS.md`. The
older LLVM document contains an outdated proposal permitting local
panic recovery; this document explicitly rejects that possibility.
