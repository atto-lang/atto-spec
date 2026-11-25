# Actor scheduling policy v1: elastic parallelism and carrier affinity

**Status: PROPOSED / TARGET, 2026-11-22. NOT COMPILER IMPLEMENTED OR GUEST VERIFIED.** This document adds a bounded actor scheduling policy to the hosted runtime contract; no annotation or spawn override below is guaranteed to parse today. This is a review amendment to [actor scheduler domains v1](actor-scheduler-domains-v1.md), not a second pool/security model.

## Motivation and boundaries

An actor may request a ceiling on the **number of physical guest-executing carrier workers assigned concurrently**, may prefer a cache-warm lane, or may require stronger thread placement. This is independent of mailbox size, the number of live invocation stacks, message/request concurrency, and a Task's lifecycle. A suspended invocation retains its stack and quota but consumes **no physical carrier slot**. Actors own logical execution contexts and memory, not OS threads.

The actor MUST NOT hold a direct mutable `ThreadPool` reference. Its runtime-owned scheduling record contains an opaque authorized pool/domain ID, actor incarnation, immutable declaration cap, validated per-spawn effective policy, admission counters and a revocable home-worker preference. A scheduler/pool manager, not guest code, owns physical workers, healthy-capacity observations, carrier leases, generations, queues and budget changes. Serialized handles, guest-visible enums and user-supplied pool names never confer pool authority.

This contract refines chapters 05, 06, 10, 22 and 25. It must not silently reinstate the historical serial-by-default or single DATA turn rule: **ordinary actors are concurrently executable by default**. This contract's maximum counts guest execution segments across receive invocations, independently admitted receiver methods and actor-owned Tasks; it never relaxes critical-state loans. The active [receive-only serial and Atomic draft](https://github.com/atto-lang/atto-spec/pull/175) permits other logical invocations alongside the one serial receive. This contract preserves their admission eligibility but chooses a **one-running-carrier default and ceiling** for `define serial actor`, so methods/Tasks may interleave while the receive is suspended, not execute simultaneously on another carrier. The competing PR's claim that serial actors can physically execute multiple methods concurrently must be reconciled before merging either rule.

## Proposed declaration and spawn surface

```atto
@actor_schedule(max_parallelism = pool_size, affinity = sticky, pool = shared)
define actor ElasticWorker as
    // ...
end

@actor_schedule(max_parallelism = 1, affinity = pinned)
define serial actor CacheWorker as
    // ...
end

val worker = spawn ElasticWorker() with schedule(
    max_parallelism = 2,
    affinity = sticky
)
```

These are **target syntax only**; until annotation and `spawn ... with schedule(...)` grammar, typechecking, formatting and guest lowering are independently verified they MUST fail closed. The proposal introduces no special actor constructor and no globally mutable thread pool enum. Compiler metadata uses a closed tagged policy `Fixed(n: positive_int) | PoolSize`, regardless of whether source writes `1` or `pool_size`. Unrecognized policies, non-constant fixed caps, duplicate keys, incompatible annotations, cap zero/negative/overflow and applying the annotation to a non-actor reject with deterministic diagnostics. `pool` is an execution-domain request: `shared | isolated | untrusted` subject to the actor's declared execution class and authenticated host authority. An actor cannot move to a more privileged pool by annotation or spawn override.

Declaration policy gives an upper bound; a spawn override may narrow it and choose an allowed affinity, but MUST NOT raise a hard declaration cap, downgrade isolation, exceed configured tenant/global budgets or weaken serial semantics. A `PoolSize` declaration is an elastic ceiling, not permission to ignore an administrator cap. Spawn may return typed denial/unsupported according to the eventually specified spawn ABI; no unverified error class is invented here.

## Parallelism and capacity accounting

1. `Fixed(n)` requests at most `n` **simultaneously executing physical carrier leases** for actor-owned guest instructions. `PoolSize` requests the current **eligible healthy carrier count** of the actor's authorized pool, not the configured target, process thread count, CPU count or a snapshot captured at spawn. The effective instantaneous ceiling is `min(requested_cap, healthy_eligible_workers, authenticated_actor_cap, tenant_cap, scheduler_global_cap)`; a `PoolSize` cap is recalculated at each admission and pool resize/retirement event. Reserved supervisor CONTROL and foreign reactor workers do not count as eligible actor carriers.
2. Minimum requestable `Fixed` cap is 1; **this is not a reserved worker guarantee**. A runnable actor in a lazy pool may cause the pool manager to request its first eligible worker, subject to budgets. Capacity exhaustion must remain explicit (backpressure or typed admission denial). No actor has a permanent thread merely because `max_parallelism=1`.
3. An ordinary actor's default is `PoolSize` with bounded queue, live-invocation, stack and tenant quotas; the runtime may admit several DATA receives and independently eligible methods/Tasks on independent stacks. `define serial actor` has a hard `Fixed(1)` physical execution cap and a separate **one-live-DATA-receive** gate, including suspended receives. `max_parallelism != 1` on a serial actor is rejected, not silently ignored. A serial actor's non-receive methods/child Tasks can run on its one carrier when the receive suspends; all mutable state access still requires checked guards.
4. The running lease covers all actor-owned guest execution segments, including child Task initial dispatch, resume, independently scheduled receiver methods, and deferred cleanup guest code. Nested synchronous calls share the existing lease. A suspend/await/cooperate releases the **physical** lease but not the logical stack, receive permit, cancellation lineage or outstanding ownership quota. The runtime reauthenticates incarnation/domain/permit when resuming. Child Tasks never evade the cap through root/supervisor pools.
5. Growing a pool increases available parallelism *on demand*, without spawning workers merely because an actor declared `PoolSize`. Shrinking, retiring or losing a carrier reduces admission credits atomically: **do not issue new leases above the reduced cap**, and allow already-running bounded turns to reach a safe cooperative boundary/retirement. No unsafe forced stack migration, lease double-release or loss of accepted work. A worker death fences its lease generation before reassignment. A replacement inventory belongs to the authenticated pool identity and generation. Reject the entire update if it contains an older worker generation than one already observed for that slot, including slots temporarily absent from the healthy inventory. Admission requires the current worker generation and physical retirement of any prior lease on that slot. A noncooperating trusted turn remains subject to watchdog/failure policy, not imaginary arbitrary native preemption.
6. Fairness is bounded across actors and lanes: one elastic actor cannot monopolize all available DATA workers indefinitely, and CONTROL/STOP retains independently reserved forward progress. Pool growth and shrink must not change message outcomes, sealed ownership proofs or stale-wake detection. A one-worker pool provides sequential physical execution even for ordinary actors; it does not rewrite their source declaration to `serial`.

## Affinity policies and defaults

| Source value | Binding | Failure/reconfiguration behavior |
| --- | --- | --- |
| `none` | Any authorized eligible worker; no home preference | Scheduler may steal within the domain |
| `sticky` | Prefer an actor home lane/last eligible carrier and cache/NUMA locality; **soft affinity** | Bounded spill/steal or worker replacement permitted to ensure progress |
| `pinned` | One nominated worker at a time, **shared with other actors**; never concurrent placement on another worker | Retiring/failing/removed worker triggers fenced repin to another eligible worker; while repinning work queues, never crosses domains |
| `dedicated` | One exclusive reserved carrier owned by the actor until quiescence | Explicit admin/budget admission and clean retirement required; exhaustion denies rather than silently falling back to shared scheduling |

`sticky` (soft affinity) is the default for both ordinary and serial actors; `none` is available for throughput-oriented ordinary actors. This maintains chapter 25's default home-lane behavior. For an actor with `max_parallelism > 1`, `pinned` and `dedicated` as **single-carrier** options are invalid; use `sticky`/ `none`. An isolated actor already has an isolated pool, but that is **not** an exclusive physical carrier reservation. Dedicated requests require a verified worker reservation and globally charged quota; they MUST NOT spawn one OS thread per actor implicitly.

A pinned worker's death or retirement may require replacement or fail-closed denial if no authorized worker remains. Pinning is a scheduler policy, not an OS CPU-affinity guarantee, thread-local-state lifetime promise, hard real-time certification or right to hold thread-local guest pointers across `await`. Affinity never changes logical stack identity or tenant confinement, and does not authorize work stealing across trusted/isolated/untrusted boundaries. CPU pinning/NUMA allocations are separate host-approved deployment policies.

## Interaction with runtime modes and lifecycle

- The runtime `--single-threaded` per-memory-space proposal (#95) is a stricter host ceiling. It restricts effective physical execution to one eligible worker in that memory space without making an ordinary actor semantically serial (its multiple live logical invocations remain distinct). If a requested hard reservation or fixed minimum cannot be met, the runtime must reject admission rather than invent capacity.
- STOP and cancellation seal new receive/Task admissions, fence generations and permits, and retain bounded cleanup-only progress; a suspended actor does not consume a carrier while waiting. A stale completion or worker-reassignment ticket cannot resurrect an actor or duplicate a running lease.
- Untrusted actors stay on the authenticated TenantVM pool, or explicitly sandboxed process fallback, even when they request `pool=shared`. No annotation, pool-size growth or re-pinning crosses a tenant or actor security boundary. Affinity is never a security isolation mechanism.
- Hard-real-time and embedded profiles may require static/fixed preallocated workers and reject `PoolSize`, dynamic growth, dedicated reservations or unsupported affinity rather than silently weaken timing requirements.
- Pool resizes/worker failure/restarts must report effective parallelism, available capacity, active carrier leases, migration/steal counts, queue depths and saturation events, without exposing authoritative mutable worker handles to actor code.

## Conformance plan (not execution evidence)

The companion [atto-platform-conformance draft #43](https://github.com/atto-lang/atto-platform-conformance/pull/43) should include machine-readable policy vectors and a source-free scheduler oracle; [actor-task pool affinity draft #515](https://github.com/atto-lang/atto-platform-conformance/pull/515) supplies orthogonal child-task domain/cancellation rules. Required independent compiled `.atto` guest cases include: ordinary actor admitting a second receive while its first is suspended, with separate invocation stacks; serial actor only one live receive including await; serial receiver method work while receive is suspended with no overlapping physical lease; Task+receive+method aggregate one cap; Fixed(1/2) and PoolSize on 1/2/8 workers; grow, shrink and worker death with clean repin; sticky spill/steal fairness; dedicated quota failure; untrusted no-fallback and stale continuation denial; CONTROL remains schedulable; STOP and cancellation release leases exactly once; invalid/duplicate/conflicting syntax rejected. Instrument actual carrier IDs, lease generations, actor/tenant identity and peak running counts—wall-time-only concurrency tests are inadequate.

For each backend (Java/GraalVM JVM and AOT, LLVM, Wasm, Forge and .NET NativeAOT), record source/commit/tree SHA, toolchain, compiler-produced artifact digest, positive/negative guest execution traces, runtime version and nonzero executed steps. Source-only models, parser acceptance, missing CI and zero-step runner failures mean **NOT_EXECUTED**, not passed. Backend capability gaps must reject unsupported source/policies rather than falsely report parity.

## Open reconciliation before normative merge

- Spec PR #49's prior `nonreentrant DATA turn gate irrespective of domain parallelism` is incompatible with chapter 22 concurrent-default actors; the intended invariant is instead **per-invocation identity and checked guarded state**, plus a one-live-receive gate only for serial actors.
- Spec PR #175 describes serial as receive-only and allows other methods to be independently live; its statement about *physically simultaneous* method execution conflicts with the user's explicit serial max-one-carrier request. Preserve method admission while settling this distinction in the reviewed spec and corresponding negative fixtures.
- Conformance PR #515's `physical single-writer lease` must mean an authenticated **per-execution-context/guard** check for ordinary actors, not an unconditional actor-global one-worker gate; the new actor-wide physical cap must apply to child Tasks as well.


This scheduling-policy candidate preserves the existing receive-only logical serial admission rule. The proposed additional one-running-carrier ceiling is a distinct opt-in target until the overlapping compiler and conformance contracts agree. No existing verified profile is silently reclassified by this proposal.
