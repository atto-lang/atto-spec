# 18 — Runtime Guarantees and Actor Failure

**Status: DRAFT / TARGET.** This chapter gathers in one place what the runtime promises, what it does not promise, and how actors behave when they fail. No backend implements all of it today. See [What happens today](#what-happens-today).

Labels used here:

- **TARGET (decided):** the language owner decided this on 2026-11-03 or 2026-11-04.
- **TARGET:** carried over from an earlier chapter or contract.
- **PROPOSED:** a recommended design that has not been confirmed.

## Failure domains

Every failure ends exactly one of these domains. A failure must never take down a wider domain than its class allows.

| Domain | What ends | What survives |
| --- | --- | --- |
| Turn | The current message's uncommitted work | The actor, after restart |
| Actor incarnation | One actor's memory and in-flight message | Its queued mail and stored state, then its siblings |
| Pipeline | One actor graph, once restarts are exhausted | The rest of the tenant |
| Tenant VM | All of one tenant's actors and memory | Other tenants and the process |
| Process | Everything | Nothing in memory |

## Failure classes

| Failure | Domain | Response |
| --- | --- | --- |
| `throw` not caught, `raise` not recovered | Actor | Restart |
| `panic`, including `unwrap()` on `None` | Actor | Restart |
| Integer overflow | Actor | Restart |
| Stack exhaustion | Actor | Restart |
| Guest trap or out-of-bounds access | Actor | Restart |
| Turn deadline exceeded | Actor | Restart |
| Tenant CPU budget exceeded | Tenant VM | The tenant stops |
| Access outside the tenant's memory | Tenant VM | The tenant stops, with no restart, because the boundary itself failed |
| Runtime bug, VM corruption, OS kill | Process | No recovery is promised |

That an actor's failure restarts the actor, including on stack exhaustion and integer overflow, is **TARGET (decided)**, because one untrusted actor must not end hundreds or thousands of siblings. The exact class of each other row is **PROPOSED**. A backend that cannot contain an actor-level failure must not run untrusted actors directly on that path.

## Stacks

An actor does not need its own native stack for containment. Turns run to completion, so no native frames survive between turns, and a guarded stack per carrier thread is enough. A backend needs per-actor native stacks only if it suspends actors mid-frame.

**TARGET:** every backend that runs untrusted actors MUST:

1. Detect exhaustion before it can corrupt memory, whether with a guard region, a stack limit or an equivalent mechanism.
2. Handle exhaustion on separate stack space.
3. Contain exhaustion that happens inside a runtime call, not just in guest code. A guest can recurse to just short of the limit and then call into the runtime.
4. Prevent a single large frame from stepping over the guard.

## Restarting a failed actor

**TARGET (decided):** a failed actor is restarted from its stored state by default.

1. The failed turn's uncommitted work is discarded, and the supervisor receives the reason on CONTROL.
2. The new incarnation gets fresh memory, runs initialization, and loads the last committed state.
3. The message that was running is not redelivered, because it may be what caused the crash. A waiting caller receives a typed actor failure, and the supervisor receives a record of the loss.
4. **Mail that was queued but never started carries over** to the new incarnation in its original order. It never ran, so this cannot duplicate work.

This changes an existing rule. `ACTOR_RUNTIME_RESILIENCE_V1` section 9 says mail accepted by a failed incarnation is not replayed into a new one. An amendment is drafted but not yet merged.

Durable replay of mail that had started remains an explicit protocol, and is never automatic.

### Stored state

**TARGET (decided):** state lives somewhere that outlives the actor, in the manner of an Erlang ETS table. The mechanism itself is not yet chosen.

**TARGET (decided):**

| Tier | Survives | Mechanism |
| --- | --- | --- |
| Default | Actor crash, but not tenant or process failure | A table owned by the tenant VM, which the actor cannot address directly, charged to the tenant's quota |
| Durable, opt-in | Tenant and process failure | The durable-objects store |

The actor's sealed state ([chapter 05](05-actors-and-state.md)) is what gets stored, so programmers need no separate API or manual save step.

Fixed-size state is straightforward. Heap-backed state is an open problem, because arena memory can be half-written at the moment of a crash, and this also affects the zero-GC goal (S-27).

### Commit

**TARGET (decided):** a successful turn commits its state and its outbound mail together, and a failed turn commits neither.

A send during a turn reserves mailbox capacity and returns its admission result straight away. The message is published at commit, and a failed turn releases the reservation. Without this, a producer that sends sequence 5 and crashes before saving would restart at 4 and send 5 a second time.

Effects outside the language runtime, such as a network call already made, cannot be undone by this rule.

### Restart limits and identity

**TARGET (decided):**

- The default supervision is `one_for_one` with `#transient` children, so an actor that fails restarts and one that stops normally does not.
- Each supervisor has a restart budget, with backoff between attempts. The starting numbers are 3 restarts in 10 seconds and a 10 ms backoff that doubles. They have not been measured.
- Restart work is charged to the tenant's CPU budget, so a crash loop cannot starve other tenants.

The budget is essential, because stored state can itself cause the crash, and reloading it would otherwise loop forever.

**TARGET:** an `ActorRef` belongs to one incarnation. It never reaches a replacement, and a send through a stale ref fails as `TERMINATED`.

**PROPOSED:** pipeline edges and other supervisor-published routes address an instance ID, which resolves to the current incarnation, so a restart needs no rewiring. A reply addressed to a failed incarnation is rejected rather than handed to its replacement.

## Pipelines

**TARGET (decided):** pipeline behavior follows the principle of least surprise.

**TARGET (decided):** a pipeline stops once a stage has spent its restart budget, and the rest of the tenant keeps running. The other rows below are **PROPOSED**. A stage's crash should not be visible to its neighbours while a restart can still succeed.

| Event | Behavior |
| --- | --- |
| A stage crashes and restarts | Neighbours keep working. A full mailbox gives ordinary `FULL` backpressure |
| Restart budget spent on a consumer | Producers' sends fail as `TERMINATED`, and queued mail is reported as abandoned |
| Restart budget spent on a producer | The consumer finishes accepted mail, then receives an **upstream-failed** signal |
| Fan-in | That signal is per edge, so the consumer knows which upstream failed |
| Round-robin worker terminal | No silent rerouting. The edge reports failure, and the selection still uses up its position |
| After a stage is terminal | The pipeline stops by default, and the rest of the tenant keeps running. A supervisor may declare otherwise |

An upstream failure must never look like normal completion. Otherwise a consumer would treat partial data as a finished result.

## Guarantees

**Scope** says who can rely on each one. *Language* means every conforming backend. *Profile* means only a validated target profile. All are targets until backed by evidence.

| Guarantee | Scope | Defined in |
| --- | --- | --- |
| At most one conflicting turn per actor at a time | Language | [05](05-actors-and-state.md), [06](06-async-and-scheduling.md) |
| Actor state is reachable only through its turn or sealed state access | Language | [05](05-actors-and-state.md) |
| Mailboxes are bounded, and no API bypasses the limit | Language | [05](05-actors-and-state.md) |
| A rejected send fails explicitly with a typed reason | Language | [05](05-actors-and-state.md) |
| Accepted mail is processed or reported as abandoned, never lost silently | Language | This chapter |
| Mailbox admission does not mean the message was processed | Language | [05](05-actors-and-state.md) |
| Supervisor failure notices do not depend on mailbox room | Language | [05](05-actors-and-state.md), [13](13-supervisor-hierarchies.md) |
| No supervisor code runs on the failing actor's carrier | Language | [13](13-supervisor-hierarchies.md) |
| Actor identity is not thread identity | Language | [06](06-async-and-scheduling.md) |
| Cancellation releases slots, wakes waiters and settles Futures exactly once | Language | [06](06-async-and-scheduling.md) |
| `defer` runs in reverse order on normal and unwinding exits | Language | [07](07-errors-and-failure.md) |
| Moved values cannot be used again | Language | [04](04-ownership-and-memory.md) |
| Mutable aliases do not cross isolation domains | Language | [04](04-ownership-and-memory.md) |
| Unsupported syntax is rejected, not reinterpreted | Language | [00](00-scope-and-status.md) |
| Up to 1000 tenants in one OS process, one VM per tenant | Profile | This chapter |
| A tenant's faults do not reach another tenant | Profile | This chapter |
| No tracing GC on admitted paths | Profile (LLVM) | [04](04-ownership-and-memory.md) |
| Bounded latency | Profile (hard real-time) | [10](10-dop-and-realtime.md) |

### Tenant VMs

**TARGET (decided):** one OS process hosts up to 1000 tenants, with one in-process VM per tenant. A tenant is never given its own OS process as the design. On GraalVM a VM is a Graal isolate. LLVM, Wasm and .NET provide the equivalent: guest code is compiled from `.atto` through validated Wasm into a memory cage, so tenants never supply native code. Bounds checks are the default for lowered guests, and they are what separates actors within a tenant.

Sharing a process has real costs:

- A bug in the runtime, validator or compiler path can reach every tenant.
- A crash outside guest code ends every tenant.
- Speculative side channels between tenants are not addressed.

## What is not guaranteed

- Exactly-once delivery, or delivery across a restart for the message that was running.
- Survival of in-memory stored state when the tenant or process dies.
- Recovery from memory corruption, unsafe FFI, out-of-memory conditions at the host level, or OS termination.
- Undoing external effects made by a failed turn.
- Cleanup when the host dies. `defer` cannot run in a killed process.
- An actor being a security boundary on its own. See [chapter 08](08-isolation-and-permissions.md).
- A specific thread count. JVM, CLR and OS runtimes create their own threads.

## What happens today

These results are local observations, not conformance evidence. See [chapter 19](19-observed-status-2026-11-03.md).

| Scenario | Result | Meets the target? |
| --- | --- | --- |
| Java: an actor overflows its stack, and `main` awaits it | `get_done()` fails, `main` ends, and the process exits 1. A healthy actor in the same program never receives its message | No |
| Java: an actor overflows its stack, and `main` does not await it | The process exits 1 instead of 42 | No |
| LLVM: plain recursion with no tenant VM | The process dies with SIGSEGV | No |
| LLVM tenant VM branch: a source actor traps, overflows its stack or passes its deadline | Only that actor restarts, from its last finished turn, and queued mail stays in order | Yes for this case, with fields only as stored state |
| LLVM tenant VM PR #1424: an actor spends its restart budget | Only that actor ends, and the tenant keeps running | Yes, once merged. There are no supervisors or pipelines at this level yet |
| LLVM tenant VM branch: recursion with a runtime call at each level, from C or a validated Wasm module | The process dies with a bus error. Fixed in PR #1419, not yet merged | No, until the fix merges |
| LLVM: `int` overflow, native | The process traps | Partly: the arithmetic is checked, but the failure is not actor-level |
| LLVM tenant VM branch: `int` overflow in a source actor | Only that actor restarts | Yes |
| Java: `int` overflow | Wraps silently | No |
