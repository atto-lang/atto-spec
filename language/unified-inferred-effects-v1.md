# Unified inferred effects and capability admission v1

**Status: normative TARGET proposal, 2026-11-21. NOT compiler-certified.** Extends [functions and effects](../spec/03-functions-and-effects.md), [permissions](../spec/08-isolation-and-permissions.md), and [real time](../spec/10-dop-and-realtime.md). This document does **not** replace existing checked `throws`/`raises`/`panics` types, `susp`/`suspends` syntax, `pure`, `with` effect upper bounds, or scoped `using`/critical loans. Existing [ownership/effects draft #163](https://github.com/atto-lang/atto-spec/pull/163) and [spawn-effects draft #123](https://github.com/atto-lang/atto-spec/pull/123) are complementary; reconcile their parser spelling before promotion.

## One static system, three independent questions

1. **What might happen?** A typed, inferred, transitive *effect row* describes the may-effects of evaluating a callable. It includes exceptional exits, suspension, allocation, external interaction, ambient nondeterminism, and actor-state access. A `with` row, when written, is an **upper bound**: inferred effects must be a subset. An absent row is inferred, not silently empty. A declared effect is never a runtime permission.
2. **Who may do it?** An authenticated, unforgeable runtime capability / Deno-like permission permits a particular resource operation. The effective authority is the intersection of host, artifact, runtime, tenant/actor and delegated grants. Listing `io.net` or `ffi` in a signature never grants network or native access. Static authority checking can reject impossible requests; the actual resource must be rechecked at runtime, including after resolution/revocation.
3. **Is the execution bounded?** A separate resource/cost proof tracks allocation counts/bytes, work/loop bounds, recursion/stack, blocking/suspension latency, queue capacity, scheduler budget, and imported native/runtime behavior. The fact `alloc` is absent does not prove bounded execution. A source annotation cannot by itself certify hard real time.

## Canonical semantic effect vocabulary (not new keywords)

| Effect | Required for |
| --- | --- |
| `throw<E>`, `raise<E>`, `panic<E>` | Respectively ordinary exception, escaping raise, and terminal panic. Operand types stay checked; the three are not interchangeable. |
| `suspend`, `block` | Logical continuation suspension versus parking/host-thread-blocking. Cooperating/backedges may suspend without blocking. |
| `alloc` | Any runtime allocation, **including** arena/pool bump allocation; distinguish `alloc.bytes` and count in the resource bound, not as an authorization. |
| `state.read`, `state.write` | Observing or mutating sealed actor state. A read/modify/write implies both effects. Requires a separate checked loan/critical grant. |
| `io.file.read`, `io.file.write`, `io.net`, `io.env`, `io.clock`, `io.entropy` | More precise families of file, network, environment, clock and entropy operations. A legacy coarse `io` upper bound covers these families for source compatibility but does not confer capability. |
| `ffi` | Invoking foreign code; even an admitted FFI call needs a trusted, closed transitive effect summary and verified ownership/ABI/capability boundary. |
| `nondet` | Observation of ambient data outside checked inputs (clock, system entropy, live environment, external network/file reads, scheduler identity, races). Passing a clock value or random seed as a value parameter does not itself imply `nondet`. |
| `spawns` | Actor creation (per #123). Startup/allocation/suspension are separately inferred; actor handlers' future effects are **not** automatically charged to senders. |

The specific row names above are **semantic IR identifiers** until a source grammar is independently admitted. Retain existing `io`/`suspend`/`alloc` names as compatible super-effects. File/network I/O may additionally imply `suspend` or `block` according to the *actual* provider; suffix `_blocking` is not by itself proof of OS-thread blocking. An operation with unknown provider semantics has an unknown effect bound and is rejected in strict profiles. A write is not automatically `nondet`; observing external mutable input is.

## Inference, subtyping and propagation

- Resolve names, overloads, generics, value binding and checked ownership **before** effect inference. Typecheck a CFG/MIR after macro expansion; collect both normal and exceptional/cancellation/cleanup edges, implicit `drop`/defer/finally, allocation and compiler-inserted cooperation. Do not use a source-token keyword scanner as authority.
- For each callable compute the least fixed point of `local effects ∪ effects of invoked callees`. Recursion/SCCs converge for finite effect rows, but *termination/cost* remains unknown without a separate ranking or bounded-depth proof. Source diagnostics should include the call path and the effect origin.
- A generic function or higher-order callback carries an effect variable/bound; monomorphization may specialize it. Store inferred effect rows in exported callable/type metadata and AOT link contracts. A callback's **latent** effects are charged when invoked; a Future/Task/Stream's effects are charged when started, polled, awaited, subscribed to or dropped if that action executes them. Constructing a dormant callback does not execute it.
- Virtual/interface dispatch must use a sealed set of implementations or an authenticated upper-bound summary covering **every** possible target, including hot-loaded replacements. Unknown calls, dynamic reflection, unresolved imports, unsafe intrinsics or unverified FFI summaries are **UNKNOWN**, not pure. An open dynamic call is forbidden in strict contexts; no empty-row fallback.
- Override effect rows are subsets of the interface/base upper bound; callers rely on that bound. Preserve effect rows through function references, actor messages carrying executable callbacks, polymorphic return values, and all AOT backends. A send has its own admission effects but not arbitrary receiver-handler effects.
- An exhaustive, typed `catch` or caller-side `trap` may discharge **only** the ordinary `throw<E>` effects it actually handles, including cleanup consequences. `raise<E>`, `panic<E>`, cancellation, allocations and I/O are never erased by `trap`. `finally` and `defer` always contribute their own effects.
- `critical-read` forbids writes through its loan even if a `with state.write` row is present. A live protected loan must not cross suspension/blocking; calls inside it require a sufficiently precise no-suspend/no-block transitive summary, including FFI and hidden callbacks. Capability grants do not relax loan rules.

## Pure, deterministic and hard-real-time are different guarantees

| Contract/profile | Admits | Rejects, absent additional separately proven declassification |
| --- | --- | --- |
| `pure` | Value computation, local allocation with no externally observable mutation, checked exceptional exits | I/O, ambient reads, actor-state reads/writes, external mutation, unknown FFI, nondeterministic observations and actor spawning |
| `deterministic` (target analysis profile) | Same observable result and failure for identical explicit inputs and pinned program/environment; internal allocation is allowed | Clock/entropy/environment/live file or network observations, scheduler-visible races and unknown dynamic/FFI results. A deterministic function need not be pure if its controlled effects are explicitly modeled, but strict initial admission forbids ambient I/O |
| `hard_rt` (target analysis profile) | Only fully resolved, bounded operations with independently verified cost/stack/scheduling/ownership evidence | Runtime allocation, GC, blocking calls, unknown/unbounded loops, unproved recursion, unbounded suspension, unsafe FFI, open dispatch, host I/O, actor creation and unverified destructors by default |

Purity does **not** imply `no_alloc`, `no_throw`, bounded work or termination. Determinism does **not** imply safety or real-time bounds. `hard_rt` analysis must check *the whole reachable closure*, including intrinsics, runtime/stdlib, imported objects, generated helpers and native code. A `no_alloc` check must reject both implicit boxing and explicit arena allocation, including on exceptional/cleanup paths. Bounded allocation may be admitted by a *separately specified* qualified profile but not by the conservative initial `hard_rt` profile.

For hard real time, even a statically bounded loop is insufficient without target-specific WCET, interrupt/preemption, stack, hardware and runtime evidence. Java/GraalVM soft-RT and a browser/Wasm target do not become hard-RT simply because this reference analysis accepts a source graph.

## Source surface and diagnostics

Keep `throws Foo`, `raises Bar`, `panics Baz`, `susp`/`suspends`, `pure`, and `with ...` as existing constructs. Future spelling of fine-grained rows/profiles is a separate parser/formatter decision; do not introduce an ad-hoc `effects` keyword. Illustrative *target-only* source (not a backend smoke test):

```atto
pure fnc int <- twice(int value) ::
  return value * 2;
end

// A helper reading the current clock must infer io.clock + nondet.
// A caller constrained to a deterministic profile cannot invoke it.
// A hard_rt method cannot call a helper that allocates, even transitively.
```

Recommended stable diagnostics: `E_EFFECT_BOUND` (inferred effect exceeds a declared upper bound), `E_EFFECT_UNKNOWN` (unresolved closure), `E_PURITY_EFFECT`, `E_NONDETERMINISTIC`, `E_HARD_RT_UNBOUNDED`, `E_HARD_RT_ALLOCATION`, `E_EFFECT_CRITICAL_SUSPEND`, `E_CAPABILITY_DENIED`. Diagnostics must name the origin operation, static call path, applicable profile and missing proof; a generic parse error is not conformance evidence.

## Initial conformance and rollout gates

The accompanying versioned [portable v2 contract](https://github.com/atto-lang/atto-platform-conformance/tree/feature/unified-effect-analysis-v2-20261121/contracts/v2/unified-effects-v2) is a small **source-free reference oracle**, not a compiler. Keep the existing v1 function-effects conformance JSON intact. Test: indirect allocation, observed time/RNG, known and unknown FFI, imported/dynamic targets, read/write protected state, effect-bound mismatch, callback latent effects, cleaned-up throws, loops/recursion, bounded work and backend-specific unknowns.

Promotion requires `.atto` positive and **specific** diagnostic-negative fixtures on each `atto-source.*` compiler, typed HIR/MIR summary dumps, exact callable and artifact hashes, actual compiler execution and stepful CI; never treat a model pass, parser-only rejection or zero-step run as compiler parity. Record source SHA, exact input blob, compiler SHA, observed diagnostics, and target-specific dynamic/runtime evidence. All backend cells begin `NOT_EXECUTED`.
