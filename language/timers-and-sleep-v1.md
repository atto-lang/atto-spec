# AttoLang duration, timers and sleep v1

Status: **normative target contract; backend execution NOT VERIFIED** (2026-11-16).

This language contract is not a certification of any backend. Its adjacent Node tests
are a host-only reference model. The current Rust browser compiler explicitly
rejects await and does not yet compile duration literals.

## Public API and placement

"core.time.Duration" is an exact unsigned nanosecond value with range
0..=2^64-1, valid without an OS, heap, or scheduler. Overflow, negative
construction, or subtraction below zero must fail explicitly, never wrap or
silently saturate.

"std.time" owns the scheduler-dependent sleep APIs, also imported unqualified
in the standard prelude where the standard runtime exists:

~~~atto
pub susp fnc main(): int {
    await sleep(100ms);
    await std.time.sleep(250ms);
    return 42;
}

pub susp fnc worker(): void {
    // Synchronous-looking call in source, compiler-lowered into suspension.
    sleep_blocking(100ms);
}

pub susp fnc sleeper(): void { await sleep(100ms); }
pub susp fnc uses_sleeper(): void { await sleeper(); }
~~~

Conceptual declarations:

~~~atto
// core.time: Duration.milliseconds(value: uint): Duration, etc.
// std.time / prelude
pub susp fnc sleep(delay: Duration): void;
pub susp fnc sleep_blocking(delay: Duration): void;
~~~

Both spellings have the `susp` effect; sleep is a suspending callable
returning void, NOT a Future-of-Future. `await sleep(d)` is the explicit
awaitable timer form. A direct `await sleeper()` invocation of a suspending
function is proposed as an explicit call-site suspension marker; it must
not invent a Future or add a second suspension. This direct-call spelling
must be reconciled with the existing Java/Graal effect checker before claiming
guest support (its current contract admits await only on an awaitable).
If a user-created sleeper returns an actual awaitable, the ordinary await
rules apply. Await itself is not a first-class function.

The "_blocking" suffix denotes **synchronous-looking call-site syntax**,
NOT permission to block a carrier. The portable implementation requires a
`susp` frame: lower `sleep_blocking(d)` to a compiler-generated
continuation PC plus an execution-owned timer wait, so the logical
execution waits while its physical carrier runs other work. No
thread::sleep, Thread.sleep, busy spin, or blocking the sole JS/NIO reactor
thread. An ordinary `fnc` must fail the suspension-effect check; a
separately implemented parkable-fiber target may admit synchronous roots
only with explicit target/runtime proof. Browser non-fiber, no-scheduler
embedded and unbudgeted hard-real-time regions fail at compile time
(E_BLOCKING_CONTEXT or E_EFFECT) or with an Error subclass rather than
silently downgrading. On JVM a virtual thread is not itself proof that an
actor-state critical lease or pinned carrier can safely park.

## Duration grammar and types

~~~ebnf
duration_literal = integer, duration_suffix ;
integer          = digit, { digit | "_", digit } ;
duration_suffix  = "ns" | "us" | "ms" | "s" | "min" | "h" ;
~~~

Units are contiguous and case-sensitive. An integral duration is exactly
typed as Duration, not an int and not implicit multiplication. Values:
ns=1, us=1000, ms=1000000, s=1000000000, min=60000000000,
h=3600000000000 nanoseconds. Examples: 0ns, 1us, 100ms, 1_000ms,
5s, 2min, 1h. No implicit int-to-Duration conversion. Checked dynamic
constructors such as Duration.milliseconds(n) are available for integer n.

Reject: "-1ms", "100 ms", "1.5s", "1e3ms", "1__0ms", "100m",
unknown units, fractional values, unrepresentable conversions, and
untyped numbers passed to sleep. Errors: E_DURATION_LITERAL,
E_DURATION_RANGE, and E_DURATION_TYPE. The formatter must preserve
exact value and suffix without turning duration literals into arithmetic.

Zero is valid: both `sleep_blocking(0ms)` in a `susp` frame and
`await sleep(0ms)` yield to a later scheduler dispatch turn. They must
not recursively resume inline, even if their timer is already complete.

## Experimental browser migration

Unmerged Rust/Wasm async integration [atto-source.rs #186](https://github.com/atto-lang/atto-source.rs/pull/186) currently lowers `await rt.sleep(25)` using an integer **millisecond** argument to a JSPI `atto.sleep_ms` host import. That is a narrow experimental browser compatibility API, not the portable Duration API defined here. Keep it available on its integration branch while introducing typed `await sleep(25ms)`; do NOT reinterpret an existing `int` parameter as Duration or silently change the host import ABI. The host currently enforces a 1000-ms cap and uses `setTimeout`; its cancellation, monotonic deadline and shutdown semantics need their own audited changes. No `sleep_blocking` capability is implied by JSPI.

## Integration with NIO, the scheduler and execution contexts

\`await sleep(d)\` and \`sleep_blocking(d)\` share one logical suspension
primitive, not two scheduling designs. The compiler emits an Await/Sleep
step and a continuation PC owned by the current execution. It does **not**
start a child Task, dispatch through the normal actor DATA mailbox, block
the NIO poller, or execute guest code on the timer/selector thread.

The scheduler owns the reusable continuation, consistent with NIO Future
readiness: the reactor or timer producer may *signal* readiness but only
the owning scheduler can re-enter the suspended execution. A wake has a
**new dispatch ID** and the **same runtime-minted ExecutionContext ID**
and allocation-domain/generation fence. Task-local and tracing data remain
with that logical execution, not a ThreadLocal inherited from the clock or
reactor producer. Nested calls with \`susp\` retain the same logical
execution unless \`task { ... }\` explicitly creates a child.

Each sleep registration belongs to the current Task/ExecutionContext; its
cancellation or scheduler/actor STOP must detach and cancel that timer.
A separate I/O Future or channel Future awaited by the same execution
may be shared or externally owned and MUST NOT be cancelled just because
its waiter was cancelled. Scheduler shutdown and source lexical cleanup
are distinct: physical frame/actor heap reclamation requires an explicit
quiescence receipt, not merely a cancelled timer ticket.

Actor single-flight, supervisor CONTROL priority and generation checks
still gate resumed guest code. Reentrancy, stale callbacks after actor
restart, direct callback invocation on an NIO/select reactor, and
\`sleep_blocking\` inside a sealed critical-state lease are forbidden.
Both standalone timer wakeups and NIO completions may arrive from foreign
threads with **zero execution-context authority**.

A Java host-only integration candidate uses
\`OresScheduler.Sleep<T>\` with execution-owned \`OresTimers\` Futures,
reentering through existing \`TaskRunner\` dispatch, cancellation,
\`TraceContext\` and quiescence gates. The current Java host clock remains
separate from \`SharedReactorPool\` and does not yet meet a unified
no-dedicated-timer-thread target. LLVM native TimerQueue already has
expiring/claimable tokens but no demonstrated guest sleep continuation
bridge. .NET execution authority likewise needs an actual timer adapter.
**No backend-wide parity is implied.**

## Clock and lifecycle guarantees

* Always use a checked **monotonic** deadline; never schedule elapsed
  sleeps from wall time, local time, timezone or NTP adjustments. Handle
  limited-width embedded clock rollover and round timer resolution UP.
* Never wake before the requested deadline; waking later is possible
  under scheduling contention or OS timer latency. No hard-real-time
  guarantee follows from sleep alone. No polling/busy waiting.
* Cancellation is idempotent and linearizable versus timer expiry:
  exactly one completed, cancelled, or typed TimerError terminal state;
  no double-resume, leaked handle, or resurrected actor. Scope
  cancellation and shutdown cancel owned pending timers.
* A disposed actor/runtime must not receive an expired callback and
  must not be accessed via a stale timer callback. Resource quotas
  return TimerError instead of unbounded handle accumulation.
* Simultaneous deadlines on one queue must not lose wakes; no global
  ordering guarantee across actors/runtimes. Use the scheduler CONTROL
  wake mechanism, not a normal mailbox message susceptible to closure.
* Normal throw/raise/defer/recover behavior applies to resumed frames.
  Panic propagates to supervisor CONTROL, never swallowed. Cancellation
  is CancelledError (Error subclass), not successful elapsed time.
  Timers/capacity/shutdown failures use TimerError subclasses.
  Explicit trap around the awaited operation can capture these errors
  in its defined Option/Result form, subject to existing precedence
  and effect rules; do not invent a new trap-await precedence.
* Sleep requires a susp context and is illegal in pure contexts or while
  holding non-suspendable borrows/actor critical state leases.
  sleep_blocking cannot appear in critical, event-loop, non-parkable,
  hard-real-time-unbudgeted, or other disallowed blocking contexts.

Timer.after(delay) may later expose the same one-shot registration as an
awaitable. Periodic timers, timeouts, recurring drift/catch-up policy and
wall-clock alarms require separate contracts; do not infer them from sleep.

## Required tests and adoption criteria

Cover exact duration parsing and overflow, zero duration yielding, checked
deadlines, monotonic vs wall-clock jumps, cancellation before/after expiry,
cancel/expire/shutdown races, multiple equal-deadline timers, no early
wakeup, resource exhaustion, runtime teardown and clock rollover.
Reject type/effect/critical/parkability violations. Test exceptions,
cancellation and trap at suspension and supervision boundaries.

Each backend must record an exact SHA and separate positive/negative
parser/typechecker fixtures, actual guest execution, timer wake traces,
shutdown/cancellation proofs and platform evidence. Host model tests
are NOT compiler or guest/runtime evidence. Unsupported implementations
must fail closed with precise diagnostics rather than simulate success.
