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

A source feature is not "five-backend parity" because a parser recognizes it, one backend passes a host-unit test, or different backends execute different reduced fixtures. The [nested functor/ADT return-type gate](23-functors-and-nested-adts.md) likewise requires actual guest execution and negative semantic checks on immutable heads; a source-free algebraic model is not guest evidence. Hierarchical `define supervisor` is **TARGET / NOT_VERIFIED** across all five until equivalent nested guest trees, CONTROL events and restarts execute in exact-head builds. The [source-free topology model](13-supervisor-hierarchies.md) checks invariants but is not guest proof.

## Named generic and named value-call conformance gate

Optional type and omittable formal syntax are independently specified in [chapter 27](27-optional-and-named-arguments.md), with a versioned [source-free reference corpus](../contracts/optional-named-parameters-v1/cases.json). Passing its Node model is **not** native or managed `.atto` guest execution and does not certify optional-argument support.

The normative target is specified in [generics](02-types-and-patterns.md) and [named value calls](03-functions-and-effects.md). The `oreslang-platform-conformance` named-generic-and-call-v1 corpus is a **source-level target and reference-model check only**, not executable guest certification. Every backend starts as `pending` until exact-commit, exact-tree parser/formatter diagnostics, positive and negative guest programs, ownership/effect/source-order checks, and an independent AOT run where applicable are evidenced. `Vector`, `Array` and `ArrayList` names must be resolved against actual exported declarations rather than guessed from other backend standard libraries. Distinguish pre-existing `Vector[int]` shape syntax, named type metadata, generic type binding, and value-call labels in all parser and formatter tests.

Actor factory `Actor.pipe(...)` and existing-actor `Actor.connect(...)` remain **TARGET / NOT_VERIFIED** for Java/GraalVM, LLVM, Wasm, Forge and .NET Native AOT. A host-only Wasm graph planner validates metadata but is not an executable `.atto` compiler/runtime implementation. The [factory contract and denial matrix](14-actor-pipeline-factories.md) require same-source guest execution receipts and cannot be certified by a source-free test. The additional [nested builder hardening gate](15-nested-actor-pipelines.md) requires flat/nested topology equivalence, forward and correlation-bound backward DATA compatibility, scoped capacity and supervisor registration, actor-generation fencing, move-only builder typing, and transactional start/rollback; its host-model tests are likewise not backend evidence.

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
- `README.md`: `431e343fa854910766cc22214e990d62628c4a90`

The positive fixture MUST actually compile and execute to return `42`.
A JVM guest returns 42 to its host; a native executable exits with status 42.
Each negative fixture MUST fail before emitting executable IR. No host
simulation, source file existence, compiler fallback, workflow with zero steps,
or shared blob SHA qualifies as actual guest parity.

Java and LLVM have **authored** execution/negative tests. Wasm currently has **contract fixtures only**. .NET and Forge have
**authored rejection-only gates** that remain unexecuted (not positive guard support). None is certified
on the exact source head without stepful runner receipts. Option narrowing
(`guard name is Some`) is a separate NOT_IMPLEMENTED gate until ownership,
typing, continuation and runtime evidence is available. All six PRs remain
draft until appropriate reviews and proof.

## Semantic floor v1 (additive candidate lane)

The [AttoLang semantic-floor amendment](21-semantic-floor-and-parity.md) and its versioned [machine contract](../contracts/attolang-semantic-floor-v1/contract.json) define six independently required targets, including Cranelift, for the new candidate lane. This corrects any implication above that the five-family table alone is an exhaustive compiler-parity list. The legacy 53-case `.ores` inventory remains separate. All four new `.atto` candidates are `AUTHORED_NOT_EXECUTED`; none can be called verified on a copied fixture, host-only run or zero-step job.

## Overload and binary pattern target v1 (NOT EXECUTED)

The [AOT overload, nested destructuring and binary-pattern amendment](27-aot-overloads-nested-and-binary-patterns.md) defines the canonical target for fnc/mtd/static and class-constructor overloading, actor constructor rejection, nested [head | tail] destructuring, and binary {} / packet {} typed patterns. The [machine-readable target corpus](../contracts/aot-patterns-and-overloads-v1/cases.json) and its [source-free tests](../tests/aot-patterns-and-overloads-v1.test.mjs) validate only reference semantics and contract coverage.

Every backend is **TARGET / NOT_VERIFIED** until the following independent evidence is attached: exact source/target compiler SHAs; parser + formatter positive/negative diagnostics; static overload selection and constructor chaining checks; AOT-generated control-flow, layout and dispatch manifests; byte ordering, alignment, truncation and length/offset overflow checks; nested pattern and borrow-lifetime gates; actor constructor and sealed-state rejection; compiled positive guest runs and negative source rejection; and native sanitizer/ownership tests where applicable. Source-free Node tests and a CI workflow with zero executed steps are not guest proof.

The sequence-pattern extension adds source-level `bytes[...]` and `bits[...]` with exact/prefix/tail semantics, `ByteView`/`BitView` ownership, MSB-first unaligned bit tails and explicit contextual distinction from `payload: bytes[length]` typed field segments. Its source corpus now has **48 acceptance/rejection entries** and **14 pinned canonical .atto fixtures** (including eight byte/bit sequence fixtures). Reference-model checks cannot verify the compiler's AST, typed IR, emitted branch plans, runtime owner-generation checks or zero-copy behavior. Require actual guest compiled tests that both match and nonmatch byte prefixes, distinguish one-byte literal from a three-byte length field, reject invalid literals/double tails, and verify a borrowed bit tail cannot survive owner retirement.

Neither a function name/arity-only host model nor a typed binary parser that dynamically interprets patterns at runtime satisfies the full AOT requirement. Backends must fail closed until compiled native/wasm code generation for the canonical fixture is demonstrated.


## Reactive conformance target

Use the [bounded reactive admission contract](23-pull-push-and-lazy-collections.md). Preserve exact backend classifications; source-free reference tests never establish compiled guest or memory-profile support.


## Browser evidence boundary

The [dated browser compiler snapshot](23-browser-compiler-profile.md) reports observed Wasm and ESM results separately from native parity. Unsupported positive cases and skips are not passes.
