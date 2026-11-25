# Actor failures, on_panic, ExecutionContext, and supervision trees (v1 candidate)

**Status: proposed normative contract; NOT evidence of compiled AttoLang guest execution.**
This specification complements the two-phase `throw`/`raise`/`recover` design in
[defer/recover PR #23](https://github.com/atto-lang/atto-spec/pull/23).
It does not make unsupported Rust/Wasm actor hooks or nested actor spawning executable.

## 1. Effect taxonomy and non-interception

| Origin | Ordinary catch / trap | Recovery callback | Supervisor-visible outcome |
| --- | --- | --- | --- |
| `throw Error` | First eligible matching catch/trap across the complete *logical task call chain* | Only after all matching caller-chain catches/traps decline | Unhandled throw is promoted to unhandled raise; eventually a panic notice if not recovered |
| `raise Error` | **Never** | Closest eligible one-shot recover, after cleanup | Unhandled raise promotes to panic notice |
| `panic Error` | **Never** | **Never** | Immediate priority CONTROL notice |
| checked arithmetic trap / guest resource panic | **Never** | **Never** | Runtime-generated panic with a distinct origin code |
| cancellation, host fatal, forced kill | **Never** | **Never** | Scheduler/host terminal control policy; not forgeable by guest code |

Only statically verified subclasses of `Error` may be explicit source
`throw`, `raise`, or `panic` operands. Unsupported effects must fail
closed before code emission. The current browser compiler admits only a
narrow top-level `throw Error(string)`/caller `trap` profile; it **does not**
implement this whole table.

A thrown error must first search all matching catch/trap sites in the
**same logical task**, including its caller's caller, without invoking
a callee's `recover` prematurely. If none handles it, eligible `recover`
registrations execute in LIFO order. An unrecovered throw changes *routing*
to `raise`, preserving `origin_effect=throw` and `error_id`. Unrecovered
`raise` changes routing to `panic`, preserving origin, cause, and stack.
These promotions cannot cross back into a catch/trap or re-enable recovery.
No language catch/recover may consume a panic, host fatal, or cancellation.

## 2. Actor boundary and the on_panic handler

A failed actor MUST NOT run its own `on_panic` as a local catch, recover,
ordinary `receive`, or arbitrary user callback. `on_panic` is a
**supervisor-owned CONTROL handler** (or parent actor's explicitly installed
supervision component). An actor cannot mask its own failed state, continue
the interrupted turn, modify its sealed state after failure, or revive a
dead actor generation. The syntax and typed callback ABI are separately
versioned; no compiler should accept a bare actor `on_panic()` *method* and
silently treat it as an operative lifecycle hook.

A source `raise` that escapes the actor's recover scopes, an unhandled
`throw`, or an explicit/runtime `panic` causes terminal failure of that
actor generation. The runtime snapshots a bounded failure record at the
faulting logical task, **before disposing its continuation/arena**, and
admits exactly one fatal CONTROL notification for that (actor_id, generation,
failure_epoch). CONTROL admission is independent of DATA mailbox capacity
and does not execute guest code under mailbox locks. Subsequent duplicate
notices for the same failure epoch are coalesced. Notifying does not itself
prove physical quiescence or memory reclamation.

The supervisor `on_panic` receives an immutable, capability-reduced
`ActorFailure` snapshot, not the failed actor's Error object pointer,
stack pointers, mutable actor state, closure, or foreign execution context.
The supervisor may choose stop, restart, escalate, or a documented
bounded policy; it cannot resume the failed instruction. Cleanup and
quiescence precede any generation replacement. A supervisor handler
that itself panics is never reinvoked recursively in the same generation:
it is marked failed and sends at most one new CONTROL notice to the next
authoritative supervisor. Root failure obeys a documented process/tenant
termination policy. Watchers may observe a read-only notification but do
not become competing restart authorities.

## 3. Actors of actors / supervision ownership

Actor creation inside an actor requires an explicit typed spawn capability
and admitted runtime support. Creating an actor does **not** imply arbitrary
access to its private heap or automatic authority over unrelated actors.
Each live actor generation has exactly one authoritative supervisor
relation, optionally a parent actor owning a supervisor component; the
root supervisor has no parent. Watch subscriptions and ActorGroup
memberships do not grant supervision authority.

- Parent and child identities are `(actor_id, generation)`, and the
  parent edge is generation-fenced. Self-parenting, cycles, stale-generation
  parents, and unauthorized reparenting are rejected before child admission.
- A child panic enters its immediate supervisor's CONTROL lane, **not**
  its parent's DATA mailbox. Siblings continue unless a declared restart
  strategy directs otherwise. A parent's ordinary catch/recover cannot
  intercept a child's panic across the actor isolation boundary.
- Parent termination closes child creation, fences outstanding sends and
  propagates structured shutdown/cancellation to all owned descendants.
  A child may outlive its parent only via an explicit, atomic transfer of
  supervision authority to a live supervisor before parent retirement.
- Parent and child failures racing during shutdown must settle each
  actor generation exactly once; stop/restart/escalate decisions are
  serialized under a bounded CONTROL policy. A notice for an already
  retired generation is not delivered to the replacement's handler.
- A restart uses a fresh generation, new logical task/continuation, and
  clean state. Child-generation references and in-flight messages from
  the old generation are rejected or retired explicitly. A restart must
  not simply reuse the old mutable actor heap.
- The actor may join multiple groups and have many observers, but never
  multiple independent authoritative restart owners.

## 4. ExecutionContext, logical stack, and causal trace

`ExecutionContext` is per *logical task activation*, not per carrier
thread. Its immutable security/tenant/capability projection and
versioned task/actor identity follow suspension, resumption and migration.
Thread-local storage does not establish task identity. Every active
receiver turn has a separate logical stack, even when turns run
concurrently in the same actor. A serial actor cannot start a second
turn while its first still owns the turn.

The runtime captures bounded logical `CallFrame` records (module/function,
source span, optional inlining marker), plus bounded `await`/spawn
**causal links**. These are different from physical/native/JVM stack
addresses, which must never be transferred in failure notices. The
originating `throw`/`raise`/`panic` records its failure stack once;
defer/finally/supervisor scheduling may append bounded suppressed causes
but must not overwrite the origin. An async stack hop is an explicit link,
not a fabricated synchronous caller frame.

At actor boundaries the supervisor receives a serializable, size-bounded
and privacy-filtered snapshot including: schema_version, event_id,
origin_effect, terminal_effect, actor_id, generation, parent_id,
parent_generation, supervisor_id, task_id, receiver_id, failure_epoch,
error_type, sanitized_error_message, logical_stack, causal_links and
suppressed_count. Sensitive task-local data, secrets, raw arguments,
capability tokens and arbitrary Exception object graphs do not cross.
A truncated trace must say it is truncated and never claim completeness.
Every field is validated against explicit budgets; unknown critical
schema versions fail closed.

An actor-to-actor message starts a *new* logical call stack and separate
ExecutionContext. Only an allowlisted projection of tenant/tracing
identifiers and attenuated capabilities may cross; sender task-local and
actor-local mutable references never do. A child task may inherit a
cancellation scope, but may not inherit stronger permissions than its
owning actor. Task migration cannot change the recorded actor-generation
identity.

## 5. CONTROL, cleanup, and ownership safety

CONTROL admission is linearized separately from DATA and may not starve
behind a full DATA queue. Once failure is known, new DATA dispatch is
fenced; already running receiver turns are completed or independently
quiesced before actor retirement. Supervisor callbacks execute outside
global scheduler/mailbox locks, on a supervisor-owned execution context,
without access to the failed actor's active critical-write lock.

Safe LIFO defer/finally cleanup remains owned by the *faulting task*.
An `on_panic` handler does **not** serve as a replacement for guest
cleanup. VM corruption, forced OS termination or abandoned host processes
cannot promise user cleanup. A cleanup failure must not erase the
original panic or allow a recover callback to convert it into success.
Only after tasks, locks, queued DATA/CONTROL, and borrowed actor-owned
resources are retired may the underlying actor arena be freed.

## 6. Conformance and negative test matrix

Minimum executed guest+host tests, evaluated on exact compiler/runtime SHA:

1. Throw across three calls: an outer matching catch wins over inner recover.
2. Unhandled throw: recover LIFO; exhausted chain promotes raise then panic
   retaining the original error identity/origin and logical fault stack.
3. Explicit raise bypasses all catches/traps, reaches recover at most once.
4. Explicit panic, arithmetic panic, cancellation and host fatal never
   pass through catch, trap or recover.
5. A dead actor's local `on_panic` declaration is rejected by the compiler;
   supervisor-owned `on_panic` gets one CONTROL event, not a DATA message.
6. DATA saturation does not block/control-starve a child panic notice.
7. Panic+stop, panic+restart and duplicate-panic races yield one settlement.
8. Child panic cannot be caught by parent; sibling isolation and
   restart-policy behavior are deterministic.
9. Parent failure closes admissions and descendants quiesce before arena
   free; unauthorized child adoption is refused.
10. Nested spawn without explicit capability is rejected with no guest
    artifact; cycles and stale parent generations are rejected.
11. Supervisor `on_panic` failure escalates once to its own supervisor,
    without same-generation handler recursion.
12. Suspend/resume on a different carrier preserves task id, receiver id
    and origin stack, and does not leak TLS or actor-local state.
13. Cross-actor error envelope contains no raw pointer, mutable Error
    reference, secret or capability; oversize and malformed envelopes
    fail closed.
14. Async causal links, stack truncation, source spans, and bounded
    suppressed-cleanup failures remain explicit after restart.
15. All emitted notices have exact actor_id+generation+failure_epoch,
    and stale notices never target a replacement generation.

Evidence must distinguish **REFERENCE_MODEL**, **RUNTIME_HOST**,
**COMPILED_ATTO_GUEST**, and **MULTI_BACKEND_PARITY**. A finite model,
a Java/LLVM host test, or a Rust parser rejection is not evidence of
cross-backend compiled guest behavior. Each receipt identifies exact
source tree, compiler and runtime artifacts, executed fixture names,
backend, trace digest, and any unsupported paths.

## Related work

- [defer/recover proposal PR #23](https://github.com/atto-lang/atto-spec/pull/23)
- [Rust fail-closed PR #150](https://github.com/atto-lang/atto-source.rs/pull/150)
- [Executable recovery P0 #152](https://github.com/atto-lang/atto-source.rs/issues/152)
- [Typed supervisor watch PR #37](https://github.com/atto-lang/atto-source.rs/pull/37)
- [Common actor trace v2](https://github.com/atto-lang/atto-common-source/blob/main/contracts/actor-trace-v2.json)
