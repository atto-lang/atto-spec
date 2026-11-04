# 11 — Cross-Backend Conformance and Execution Evidence

**Status: DRAFT; this document certifies no backend today.**

## Required backends

All five implementations target the **same language-level semantics**:

| Backend | Execution family | Target |
| --- | --- | --- |
| `oreslang-source.java` | Java/Truffle/GraalVM | JVM plus Native Image/full guest AOT progression |
| `oreslang-source.llvm` | Native LLVM/C++ OresVM | Native AOT; qualified hard-RT profile |
| `oreslang-source.wasm` | WebAssembly/browser/host workers | Explicit guest linear-memory and host isolation |
| `oreslang-source.forge` | Forge independent JIT/AOT | Same language and actor contract |
| `oreslang-source.net` | .NET/CIL | Full Native AOT deployment target |

A source feature is not "five-backend parity" because a parser recognizes it, one backend passes a host-unit test, or different backends execute different reduced fixtures. Hierarchical `define supervisor` is **TARGET / NOT_VERIFIED** across all five until equivalent nested guest trees, CONTROL events and restarts execute in exact-head builds. The [source-free topology model](13-supervisor-hierarchies.md) checks invariants but is not guest proof.

## Named generic and named value-call conformance gate

The normative target is specified in [generics](02-types-and-patterns.md) and [named value calls](03-functions-and-effects.md). The `oreslang-platform-conformance` named-generic-and-call-v1 corpus is a **source-level target and reference-model check only**, not executable guest certification. Every backend starts as `pending` until exact-commit, exact-tree parser/formatter diagnostics, positive and negative guest programs, ownership/effect/source-order checks, and an independent AOT run where applicable are evidenced. `Vector`, `Array` and `ArrayList` names must be resolved against actual exported declarations rather than guessed from other backend standard libraries. Distinguish pre-existing `Vector[int]` shape syntax, named type metadata, generic type binding, and value-call labels in all parser and formatter tests.

Actor factory `Actor.pipe(...)` and existing-actor `Actor.connect(...)` remain **TARGET / NOT_VERIFIED** for Java/GraalVM, LLVM, Wasm, Forge and .NET Native AOT. A host-only Wasm graph planner validates metadata but is not an executable `.atto` compiler/runtime implementation. The [factory contract and denial matrix](14-actor-pipeline-factories.md) require same-source guest execution receipts and cannot be certified by a source-free test.

## Test classes

Every normative feature should have:

1. **Parser and formatter**: canonical `.atto` round-trip, spans, diagnostics and legacy `.ores` compatibility where applicable.
2. **Static positive/negative**: precise typing, effect, visibility, import, macro and borrow admission plus rejection before IR when unsupported.
3. **Actual guest execution**: compile and execute *equivalent source* and compare typed results, output, exit status and failure class.
4. **Concurrency**: mailbox admission/closure linearizability, actor isolation, cancellation races, control-notice delivery, channel ordering and fairness.
5. **Memory/resource safety**: move/drop/lifetime tests, sanitizer runs on native paths, bounded arena and native I/O retirement.
6. **Security**: permissions, symlink/DNS attacks, isolate capability forgery, untrusted transfer and hot-generation fencing.
7. **AOT and platform**: no interpreter fallback when full AOT is claimed; checked static metadata, precise target capability matrix, embedded restrictions.
8. **Performance/profile**: measurement where latency, GC-free or real-time is specifically advertised, not as a surrogate for correctness.

## Evidence manifest

A useful per-backend execution receipt includes:
```json
{
  "feature": "actor.send.admission.v1",
  "backend": "oreslang-source.llvm",
  "source_commit": "<immutable SHA>",
  "source_tree": "<immutable tree SHA>",
  "fixture_path": "tests/actor_send.atto",
  "fixture_blob": "<Git blob SHA>",
  "compiler_commit": "<immutable SHA>",
  "workflow_path": "<verified workflow file>",
  "run_id": 0,
  "job_id": 0,
  "runner_id": 0,
  "actual_guest_execution": false,
  "observed_result": "pending",
  "artifact_sha256": "<digest when executed>",
  "status": "pending"
}
```

This JSON is a **non-passing illustrative schema**, deliberately using zero IDs and `pending`. A real passing receipt needs independently authenticated positive runner/job IDs, actual steps, logs/artifact bytes and verified source/fixture identity. Self-reported manifests, source-free models and a zero-step job cannot certify execution.

## Reconciliation policy

A feature matures from `PROPOSED` → `TARGET` → `IMPLEMENTED per backend with exact evidence` → `VERIFIED PARITY`. Changes to ownership, actor isolation, exception effects, wire encoding, imports and AOT require all affected backend owners to agree on the observable contract. Track partial support honestly and fail closed instead of silently choosing a backend-specific dialect.

If the source GitHub organization has no Actions minutes, seek read-only runner status first. Source transfer into another org requires prior governed authorization for the exact private tree/destination and blob/tree verification; available minutes or token-free copying do not grant permission. See the [private-source gate](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/blob/main/docs/PROTECTED_SOURCE_EXPORT_ADMISSION.md).

The [platform-conformance evidence ledger](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/blob/main/docs/FIVE_BACKEND_EXECUTION_EVIDENCE.md) distinguishes declaration shape from actual authenticated execution.


## Guard v1 — canonical cross-backend acceptance (TARGET, not certified)

The same four files in `contracts/guard-v1/` are now proposed on
Java [#2517](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/2517),
LLVM [#1387](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/pull/1387),
Wasm [#285](https://github.com/ores-truffle-oreslang/oreslang-source.wasm/pull/285),
.NET [#353](https://github.com/ores-truffle-oreslang/oreslang-source.net/pull/353),
and Forge [#181](https://github.com/ores-truffle-oreslang/oreslang-source.forge/pull/181).
Read-back confirms byte-identical Git blob SHAs across all five:

- `canonical-scalar.atto`: `c86ac476e55074031c0bcda02f5eaf3cb1399477`
- `reject-fallthrough.atto`: `1ff87aa95ed2537839347e80984c69ae46fdfa17`
- `reject-else.atto`: `b2bbee98cd3b95ac19462b4efd95a2e98b469154`
- `README.md`: `15246dd7aaa09b15116e5c1ec449c83b0cc24a27`

The positive fixture MUST actually compile and execute to return `42`.
A JVM guest returns 42 to its host; a native executable exits with status 42.
Each negative fixture MUST fail before emitting executable IR. No host
simulation, source file existence, compiler fallback, workflow with zero steps,
or shared blob SHA qualifies as actual guest parity.

Java and LLVM have **authored** execution/negative tests. Wasm, .NET and
Forge currently have **contract fixtures only**. None is certified
on the exact source head without stepful runner receipts. Option narrowing
(`guard name is Some`) is a separate NOT_IMPLEMENTED gate until ownership,
typing, continuation and runtime evidence is available. All six PRs remain
draft until appropriate reviews and proof.
