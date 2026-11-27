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

Each section occurs at most once; unknown sections/keys, duplicate entries, missing required initialization fields, unknown actor types and invalid effects are compile errors. Omitted or empty options use declaration/runtime defaults, except required init fields remain required. Existing bare spawn and legacy target with schedule(...) retain their semantics. Do not accept an arbitrary executable with block, implicit self, dynamic spread, or fallback on unrecognized options. Format canonical sections in source order to preserve expression evaluation. Schedule/resource keys use closed schemas; init keys require an actor-declared nominal typed startup schema (its declaration syntax remains open). Do not invent an init schema from caller-supplied keys or treat init data as public state setters. No implicit constructor or direct caller invocation of init. Existing actor spawn argument rules remain in force; do not silently combine duplicate init channels.

## Evaluation and security

- Evaluate supplied expressions once in caller context, in lexical order, with ordinary effect and ownership checks. Admission validates all options before actor allocation/publication. No caller closure or loan crosses into actor memory.
- Resource requests are positive checked integers, in bytes for heap/stack and messages for mailbox; overflow, zero, negatives, nonintegral values, and unsupported policies fail closed. Declaration, host and tenant limits are authoritative. Deny oversized requests rather than silently granting or clamping. Separate stack per invocation, total charged stacks, mailbox bytes and message count budgets; a count is not a byte quota. No new capability can be conferred by the options.
- Preserve existing scheduler rules: schedule request may narrow declaration limits, serial physical cap and tenant pool confinement; sticky is preference only. Never interpret pool names as authority.
- Actor owns its heap and stacks. Init payload uses checked owned move, independent logical copy, or authorized immutable sharing under existing transfer rules; reject mutable aliases, escaping loans, foreign raw pointers and nontransferable handles. No mandatory GC, JIT, reflection or serialization for safe same-process transfers.
- Reserve resource charges atomically; allocate and install typed init payload into private runtime-owned startup storage before invoking the private one-shot init hook under actor context. How a zero-arg init reads typed startup data is a separate API/grammar decision; no public state authority is introduced.
- Bare spawn preserves admission semantics; await spawn additionally waits for successful initialization/readiness, not termination. Fence DATA execution and actor state until ready; any provisional reference must be generation-fenced and cannot access partial state. Follow established mailbox admission contract; never run receive before ready.
- On failure/cancellation before publication, reclaim reservations, payloads, stacks and mailbox exactly once; prevent leaked or stale references. After admission, cancellation/readiness observation follows existing lifecycle ownership contract rather than silently cancelling a published actor. Define exact typed failure ABI before runtime certification. Preserve existing spawns and suspension effect checking.
- AOT: lower options to checked typed metadata and owned init payload; no dynamic name lookup, runtime source eval, or reflection. Unsupported backend/profile must issue deterministic compile/admission rejection, never ignore options.

## Acceptance matrix (not execution evidence)

Positive: canonical example; empty options; one section; reordered sections and side effects observed once in lexical order; defaults; legacy schedule syntax; owned init payload; await observes completed one-shot init; actor-local stacks/heap and actual resource accounting.
Negative: duplicate sections/keys, unknown keys, missing required init field, wrong type, nonpositive/overflow quota, cap escalation, serial max_parallelism=2, forbidden pool, mutable/borrowed cross-actor payload, direct init call, duplicate initialization sources, unsupported target, failure before publication, cancellation/STOP race, stale generation and leaked charge.
Require formatter roundtrip and exact positive/negative source fixtures plus actual compiler-emitted guest execution, resource/lease telemetry and failure rollback. Java/GraalVM JVM/AOT, LLVM, .NET NativeAOT, Rust, Wasm/browser and Forge each report separately. Parser-only and host-only runs are not guest parity. Exact head and root tree, toolchain and artifact hashes, executed jobs and independent review required. If source CI is zero-step, mirror exact tree into an authorized private funded carrier, compare tree identity, build using destination token; do not treat this as overriding branch protection.
