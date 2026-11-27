# Grouped actor spawn options v1

Status: user-approved surface 2026-11-26; semantic details below are proposed for review. NOT compiler/runtime verified. Extends [actor scheduling policy](actor-scheduling-policy-v1.md) (merged PR #49), not a competing lifecycle or scheduler.

## Canonical example

```atto
const ActorRef a = await spawn MyActor() with {
    schedule {
        max_parallelism = 2;
        affinity = sticky;
    }

    resources {
        heap_size = 64 * 1024 * 1024;
        stack_size = 64 * 1024;
        mailbox_capacity = 1024;
    }

    init {
        name = "worker-1";
        seed = 42;
    }
};
```

## Grammar and static admission (proposed)

```text
spawn-options := 'with' '{' spawn-section* '}'
spawn-section := ('schedule' | 'resources' | 'init') '{' spawn-entry* '}'
spawn-entry   := IDENT '=' expression ';'
```

Each section occurs at most once; unknown sections/keys, duplicate entries, missing required initialization fields, unknown actor types and invalid effects are compile errors. Omitted or empty options use declaration/runtime defaults, except required init fields remain required. Existing bare spawn and legacy target with schedule(...) retain their semantics. Do not accept an arbitrary executable with block, implicit self, dynamic spread, or fallback on unrecognized options. Format canonical sections in source order to preserve expression evaluation. Schedule/resource keys use closed schemas; init keys require an actor-declared nominal typed startup schema (its declaration syntax is proposed below). Do not invent an init schema from caller-supplied keys or treat init data as public state setters. No implicit constructor or direct caller invocation of init. Existing actor spawn argument rules remain in force; do not silently combine duplicate init channels.

## Evaluation and security

- Evaluate supplied expressions once in caller context, in lexical order, with ordinary effect and ownership checks. Admission validates all options before actor allocation/publication. No caller closure or loan crosses into actor memory.
- Resource requests are positive checked integers, in bytes for heap/stack and messages for mailbox; overflow, zero, negatives, nonintegral values, and unsupported policies fail closed. Declaration, host and tenant limits are authoritative. Deny oversized requests rather than silently granting or clamping. Separate stack per invocation, total charged stacks, mailbox bytes and message count budgets; a count is not a byte quota. No new capability can be conferred by the options.
- Preserve existing scheduler rules: schedule request may narrow declaration limits, serial physical cap and tenant pool confinement; sticky is preference only. Never interpret pool names as authority.
- Actor owns its heap and stacks. Init payload uses checked owned move, independent logical copy, or authorized immutable sharing under existing transfer rules; reject mutable aliases, escaping loans, foreign raw pointers and nontransferable handles. No mandatory GC, JIT, reflection or serialization for safe same-process transfers.
- Reserve resource charges atomically; allocate and install typed init payload into private runtime-owned startup storage before invoking the private one-shot init hook under actor context. The proposed zero-arg init accessor is specified below; no public state authority is introduced.
- Bare spawn preserves admission semantics; await spawn additionally waits for successful initialization/readiness, not termination. Fence DATA execution and actor state until ready; any provisional reference must be generation-fenced and cannot access partial state. Follow established mailbox admission contract; never run receive before ready.
- On failure/cancellation before publication, reclaim reservations, payloads, stacks and mailbox exactly once; prevent leaked or stale references. After admission, cancellation/readiness observation follows existing lifecycle ownership contract rather than silently cancelling a published actor. Define exact typed failure ABI before runtime certification. Preserve existing spawns and suspension effect checking.
- AOT: lower options to checked typed metadata and owned init payload; no dynamic name lookup, runtime source eval, or reflection. Unsupported backend/profile must issue deterministic compile/admission rejection, never ignore options.

## Acceptance matrix (not execution evidence)

Positive: canonical example; empty options; one section; reordered sections and side effects observed once in lexical order; defaults; legacy schedule syntax; owned init payload; await observes completed one-shot init; actor-local stacks/heap and actual resource accounting.
Negative: duplicate sections/keys, unknown keys, missing required init field, wrong type, nonpositive/overflow quota, cap escalation, serial max_parallelism=2, forbidden pool, mutable/borrowed cross-actor payload, direct init call, duplicate initialization sources, unsupported target, failure before publication, cancellation/STOP race, stale generation and leaked charge.
Require formatter roundtrip and exact positive/negative source fixtures plus actual compiler-emitted guest execution, resource/lease telemetry and failure rollback. Java/GraalVM JVM/AOT, LLVM, .NET NativeAOT, Rust, Wasm/browser and Forge each report separately. Parser-only and host-only runs are not guest parity. Exact head and root tree, toolchain and artifact hashes, executed jobs and independent review required. If source CI is zero-step, mirror exact tree into an authorized private funded carrier, compare tree identity, build using destination token; do not treat this as overriding branch protection.

## Actor-owned startup schema and one-shot access (review proposal, 2026-11-26)

The caller-side syntax above is user-approved; the following actor-side surface is proposed, not yet ratified or compiler-implemented. A declaration-local `init { ... }` schema is distinct from the private zero-argument lifecycle method `init()`. For example (target syntax):

```atto
define actor MyActor as
    init {
        string name;
        int seed;
    }

    state {
        let string name;
        let int seed;
    }

    private external mtd init() -> void {
        const startup = self.take_init();
        self.handle_state(critical-write |mut s| -> {
            s.name = startup.name;
            s.seed = startup.seed;
        });
    }
end
```

The schema is compile-time nominal metadata attached to the actor descriptor, not a second state object or a constructor. Every field in v1 is required, with no implicit default or conversion. Reject duplicates, unknown fields, type mismatches, and nontransferable or borrowed caller data; defaults are a separate extension. Existing positional spawn argument forms remain separately supported and may not populate the same schema simultaneously. An actor without a schema admits an empty init section only.

`self.take_init()` is a proposed compiler-owned, statically resolved intrinsic, available only to the authenticated one-shot init body for that actor and incarnation. It consumes a linear startup slot and yields a nominal actor-private owned aggregate with no borrowed caller storage. It may not be overridden, referenced as a method value, or called from a helper, receive, task, supervisor, foreign actor, constructor or after initialization. Reject paths that can consume it twice, including loops and conditional merges; if never consumed, dispose of it on exit. A schema is not automatically installed into state; explicit guarded state initialization is required. Noncopyable fields must use existing explicit move semantics, not implicit shallow aliasing. Ownership and destructor checks apply to the aggregate and its fields. The compiler may eliminate the aggregate allocation when observationally equivalent.

The admission boundary is transactional: (1) evaluate arguments and options once left to right; (2) check schema, transfer and authority before reservation; (3) reserve all charges atomically; (4) construct private actor heap, stack and startup slot; (5) run init under a generation-bound permit; (6) publish readiness only after successful init, retire startup slot; (7) on failure fence first, clean up exactly once, and settle the readiness observation. A provisional reference is not ready authority. No DATA execution before ready, and no raw heap pointer or mutable host capability in any message. Already-moved values are not magically restored to caller on an admission failure; the runtime must dispose of owned values on its failure path. Cleanup errors cannot replace the original failure or suppress quota release; use existing panic/cleanup contracts.

Failure categories to encode in the existing spawn ABI: invalid request, quota/authority denial, unsupported profile, allocation failure, init failure, cancellation/stop. Do not invent a new public error type until existing spawn/await and error contracts are reconciled. Bare spawn and await spawn keep their existing result/effect types; a readiness failure must never be represented as a successfully initialized ActorRef. Explicitly test races between initialization, cancellation, publication and generation reuse. No new suspension permission follows from the accessor.
