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

A source feature is not "five-backend parity" because a parser recognizes it, one backend passes a host-unit test, or different backends execute different reduced fixtures.

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
