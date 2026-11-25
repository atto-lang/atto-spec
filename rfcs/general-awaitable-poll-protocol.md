# RFC: General Awaitable<T> protocol
Status: draft; proposed semantics, not implementation or execution evidence.

## Motivation
Await must accept any nominal implementation of compiler-known Awaitable<T>, not only Future<T>. Future, TaskFuture, ActorFuture, timers, NIO readiness and completion, channels, actor/process completion and custom operations can implement it directly. No mandatory intermediate Future allocation.

## Surface (illustrative syntax pending grammar reconciliation)
```atto
define enum Poll<T> as
    Pending;
    Ready(T);
end
define pub interface Awaitable<T> as
    poll(context: mut AwaitContext) -> Poll<T>;
end
```
The receiver is exclusively accessed for the duration of poll; no concurrent polling of the same operation. Context is a nonescaping scoped capability; get_waker() returns a safe owned, generation-fenced wake handle. Poll is synchronous, bounded and nonblocking; it must not suspend or recursively resume guest code. Pending requires a registered progress notification or an already queued wake. Ready transfers the result once for affine operations. Shared repeatable observations require explicit copy/share semantics. Fallible operations may yield Result<T,E>; preserve existing error and cancellation contracts.

```atto
let value = await future;
let reply = await actor_future;
await timer;
let bytes = await socket.read(buffer);
let message = await channel.read();
await custom_awaitable;
```
Evaluate operand once, retain operation in a stable continuation frame, resolve nominal interface including generic constraints and inherited implementations, poll, suspend on Pending and repoll on scheduler notification. No reflective discovery. Immediate Ready does not require suspension. get_future() may be an explicit adapter; never a mandatory hook. Reconcile legacy getAwait() projection in atto-source.java#515 via explicit compatibility adapter and migration, not implicit recursive conversion. Existing Future-returning APIs remain valid.

## Scheduler and safety
NIO/timer/actor/task producers publish readiness before wake; wake only enqueues in the owning scheduler domain, never runs guest continuation inline. Registration and park must handshake with concurrent wake (including wake during poll); coalesce duplicates without losing progress; generation fencing rejects stale wake after reuse. Serialize poll and terminal transitions. Enforce bounded registration quotas, fairness, shutdown and rejection settlement. No carrier parking. Waker must not confer actor authority or cross isolation with non-sendable payloads.

Logical completion/cancellation and physical retirement are distinct. Cancellation detaches observer; producer cancellation only by explicit ownership/policy. Retain buffers, pins and loans until physical completion or acknowledged cancellation. Retire registration exactly once, including failed registration, select loser, shutdown and late callback. Select must separate observation from destructive commit; never consume a losing arm, reject unsupported transactional selection rather than silently losing data.

## Ownership
Compiler treats every await as potential suspension. Stable frame storage or certified movable registration; reject conflicting loans, escaping context, use after take!, unsafe actor-state critical sections and non-sendable cross-domain state. Poll result extraction respects affine ownership. Runtime-owned loans must be tied to physical retirement, not just logical task cancellation. Custom implementations cannot forge scheduler handles; unsafe host integrations require explicit trust boundary.

## Verification
Model Created, Pending, Completed, Cancelled, Retired with immediate completion/cancellation edges. Prove single terminal outcome, at-most-once result delivery, no concurrent poll, no lost wake, no stale generation resume, exactly-once retirement, and no use-after-free. Liveness conditional on fair scheduling and producer progress. Logical completion alone does not prove physical retirement.

## Acceptance matrix
Positive guest execution: immediate/pending Future, TaskFuture, ActorFuture, direct timer, NIO read/write, channel, custom awaitable, generic and inherited interface, nested await, single evaluation, one-carrier peer progress, fallible output. Negative compile tests: non-awaitable, wrong output, escaping context, conflicting borrow, move after take!, invalid suspension across critical section. Runtime race tests: wake before/during/after park, duplicate and stale wake, completion vs cancellation, shutdown, registration failure, select loser cleanup, physical buffer retirement, affine double extraction, quota exhaustion. Test actual backend implementations, not just fixtures or host models.

## Rollout
Canonical spec here; independent core/async .atto implementations with minimal native primitives in Java, Rust, LLVM, .NET, Wasm, Forge, Cranelift and JS; shared conformance in atto-compilers-parity-testing. Audit existing Java #515, #574, #1224, common-source #82 and parity #51 for compatibility. Preserve public semantics while allowing backend-specific representations. Report unsupported cases explicitly. Require exact-head executable CI and native/AOT where applicable before implementation promotion; zero-step jobs are not passes. Any alternate private CI carrier must be authorized by repository policy and exact-tree verified.

## Abstract model evidence
Run `node tests/awaitable-protocol-model.mjs` for deterministic sequential interleaving scenarios covering wake/park, generation fencing, affine delivery, cancellation, retirement and non-destructive selection. This is a host-level reference oracle, not proof of concurrent implementation, memory ordering or guest execution. The full acceptance matrix remains mandatory.
