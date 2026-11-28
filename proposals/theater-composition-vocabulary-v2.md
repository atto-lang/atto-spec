# Atto Theater v2 — vocabulary and declarative composition (proposal)

Status: design RFC, requested direction 2026-11-27. Not ratified grammar, a release, or executed compiler evidence.
Baseline: [Atto Theater v1](../architecture/atto-theater-v1.md) remains authoritative. It uses the spelling Theater; Theatre is a candidate branding spelling, not an automatic rename or grammar alias.

## Vocabulary and ownership

| Name | Intended responsibility | Initial treatment |
| --- | --- | --- |
| Atto Theater | OTP-style application platform | existing umbrella |
| Atto Runtime | engine, scheduler, memory, mailboxes, isolation, CONTROL | existing |
| Atto Director | supervisor policy and lifecycle | existing |
| Atto Ensemble | ActorGroup, typed topics and subscriptions | existing |
| Atto Stage | application execution scope, tenant and placement binding | candidate composition abstraction |
| Atto Conductor | dependency ordering and workflow coordination | portable policy |
| Atto Cue | bounded timers, event triggers and scheduling | portable policy |
| Atto Spotlight | tracing, metrics, debugging and profiling | library/tooling |
| Atto Mesh | authenticated distributed actor communication | separate transport profile |
| Atto Rehearsal | deterministic simulation, fault injection and testing | tooling |
| Atto Cast | scoped actor registry/discovery facade | portable policy over ActorRegistry |
| Atto Scene | scoped workflow composition | deferred library experiment |
| Atto Forge | existing compiler/backend identity | unchanged |

Stage is a logical application scope, not by itself a new tenant, sandbox, worker, heap, or scheduler. A stage binds to an authenticated existing tenant/runtime and cannot weaken that boundary. Director is not a synonym or replacement for Supervisor. Ensemble membership and topic subscription are distinct. Conductor never gains permission to send privileged CONTROL merely by orchestrating an application. All names beyond v1 are proposals. Do not reserve them globally, create competing engine implementations or rename repositories as a result of this RFC.

## Candidate source composition (not accepted grammar)

The following sketches explore contextual declarations. They must be compared against a library-only ApplicationSpec/ActorGroup design before a grammar change is accepted. Existing identifiers called theatre, theater, stage, ensemble, director, cue, etc. must remain legal unless a separately approved compatibility rule changes this.

```atto
define ensemble OrderProcessing {
    supervisor OrderSupervisor;
    actor OrderReceiver;
    actor OrderValidator;
    actor OrderPublisher;
}

define stage CommerceStage {
    ensemble OrderProcessing;
    ensemble PaymentProcessing;
}

define theatre CommercePlatform {
    stage CommerceStage;
}
```

Names in member positions refer to existing declarations, not implicit spawn expressions, new ownership, or automatic subscriptions. The spelling `theatre` is exploratory and does not replace the v1 product name. The sketches deliberately omit constructor arguments, policy syntax, placement bindings and import spellings: those require an explicit grammar/type decision. No semantics are inferred for bare `define director`, `define cue`, etc.

## Composition semantics to validate

1. Compile-time descriptor resolves typed declarations without constructing live actors. Diagnose unresolved symbols, duplicate member identity, incompatible types, dependency cycles, ambiguous scope and invalid initialization. Member references alone do not instantiate actors.
2. Activation is explicit and capability checked against an existing runtime/tenant; reject unauthorized placement before any observable activation. Runtime owns child admission and incarnation identity. No raw state inheritance by supervisors.
3. An activation plan has exactly one lifecycle/supervision owner per live actor incarnation; an actor may have multiple authorized group memberships without changing that owner. Membership neither grants publish permission nor implicitly subscribes to a topic.
4. Activation order is deterministic given the dependency graph; start only admitted children, publish readiness after successful initialization, roll back partial startup in reverse dependency order, fence stale capabilities and wait for physical retirement before reusing generation-bound resources.
5. Shutdown closes admission, cancels scoped timers/subscriptions, drains or explicitly rejects bounded queued work per existing policy, retires children and releases resources. Duplicate stop is idempotent. Do not call guest callbacks under runtime/registry locks.
6. Preserve isolated actor heap/stack, single logical actor turn, bounded mailboxes, ownership/sendability, fair suspension and authenticated CONTROL/DATA separation. Composition never adds implicit shared mutable access or supervisor panic interception.
7. Sealed AOT: descriptor graph and callable targets must be statically admitted; no mandatory reflection, dynamic code generation, extra scheduler or garbage collection. Runtime-specific execution profiles remain independent.
8. Remote Mesh semantics require a separate contract for authentication, partition behavior, ordering, durability and retries. Cue cannot promise hard real-time or exactly-once scheduling without a separate contract.

## Implementation ordering and existing work

- P0: extend existing portable OTP APIs in [common-source #74](https://github.com/atto-lang/atto-common-source/issues/74), especially ApplicationSpec, Supervisor, ActorGroup and typed topics. Prove the library-first composition path before proposing parser changes. Reuse existing Java [#114](https://github.com/atto-lang/atto-source.java/issues/114), [#438](https://github.com/atto-lang/atto-source.java/issues/438), [PR #1804](https://github.com/atto-lang/atto-source.java/pull/1804), [PR #1458](https://github.com/atto-lang/atto-source.java/pull/1458) and Rust [#501](https://github.com/atto-lang/atto-source.rs/issues/501). Related JS preview PRs #31 and #42 are not new composition engines.
- P1: specify contextual grammar, formatter round trip, name resolution, typed descriptor lowering and compatibility controls if language owner approves the syntax. Keep APIs usable without dedicated keywords.
- P2: Stage/Conductor/Cue semantics and positive/negative guest execution; Spotlight and Rehearsal tooling; Mesh independently after local safety.
- Legacy overlap: actor-group invitation and pub/sub integration issues [legacy Java #689](https://github.com/ores-truffle-oreslang/oreslang-source.java/issues/689), [#2646](https://github.com/ores-truffle-oreslang/oreslang-source.java/issues/2646), [#2708](https://github.com/ores-truffle-oreslang/oreslang-source.java/issues/2708). No legacy work is superseded by this naming RFC.

## Acceptance cases (target only)

| ID | Expected outcome |
| --- | --- |
| COMPOSE-01 | Valid descriptor resolves without spawning any actor |
| COMPOSE-02 | Duplicate or unresolved member rejected at compile time |
| COMPOSE-03 | Dependency cycle rejected before activation |
| COMPOSE-04 | Existing identifiers remain legal; comments and strings inert |
| COMPOSE-05 | Unauthorized tenant binding rejected before child startup |
| COMPOSE-06 | One lifecycle owner, multiple authorized memberships |
| COMPOSE-07 | Join does not subscribe; explicit typed subscription delivers DATA |
| COMPOSE-08 | Partial startup rollback in reverse dependency order |
| COMPOSE-09 | Child restart fences old-generation subscriptions and handles |
| COMPOSE-10 | Full mailbox backpressure preserves bounded memory |
| COMPOSE-11 | Concurrent shutdown/restart cannot resurrect retired scope |
| COMPOSE-12 | Duplicate shutdown is idempotent; no leaked permits/timers |
| COMPOSE-13 | Forged supervisor CONTROL rejected from DATA |
| COMPOSE-14 | Guest callback does not run under registry locks |
| COMPOSE-15 | Scoped Cue cancelled on owner retirement |
| COMPOSE-16 | Guest AOT artifact executes without reflection/dynamic loading |
| COMPOSE-17 | Unsupported compiler profile rejects before artifact emission |
| COMPOSE-18 | Stage name cannot grant isolation or placement privilege |

All cases are NOT_EXECUTED. Coordinate with [central Theater parity #552](https://github.com/atto-lang/atto-platform-conformance/issues/552) and the existing 28-case registry, avoid double-counting overlapping cases. Record independently for java, llvm, net, wasm, forge, cranelift, rs, js, hdl, atto, realtime; explicitly document unsupported/bootstrap profiles. Exact source SHA/tree, fixture bytes, backend version, toolchain, executed runner steps and positive/negative outputs are required. Host model tests do not establish compiled guest parity. Respect zero-step CI and independently authorized private source export rules.

## Host-only planning oracle (2026-11-27)

Run `node --test tests/theater-composition-v2-model.test.mjs` for 28 prospective model checks. The oracle bounds input arrays before traversal, limits identifiers, uses iterative deterministic topological sorting, rejects duplicate/unresolved members, invalid supervisor ownership and cycles, and computes reverse rollback only from a valid startup prefix. Limits (1024 members/dependencies, 128-character model identifiers, ASCII identifiers) are **test-model limits**, not language grammar or production runtime limits. Its authorization argument represents a prevalidated tenant capability and is **not** an authentication service. It never activates a guest, issues CONTROL, verifies physical retirement or proves runtime isolation. The same 28 checks ran successfully in a V8 development harness against Git blob `93f1913250fe877193364431682b7e6c0abeedf8`; independent GitHub Node execution remains separately gated. All compiled guest cases remain NOT_EXECUTED.
