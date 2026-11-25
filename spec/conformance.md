# Cross-Backend Conformance and Parity — Editor's Draft

**Edition:** 0.1 | **Updated:** 2026-11-04 | **Status:** Proposed verification standard

This document governs evidence for the [core language](language.md) and [compiler/runtime contract](compiler-runtime-contract.md).

## 1. Goal and non-goals

A portable Oreslang program must preserve the same semantic outcome across **Java/Truffle, LLVM, Wasm, .NET Native AOT, Forge and Cranelift** as six independently evidenced backends. Different memory layouts, scheduler interleavings, performance and target capabilities are allowed only where they do not violate the declared contract.

This repository is **not** a dashboard asserting that any feature has passed. The fixture catalogue below is the acceptance target. Evidence must be collected from actual code, compilers and runtime executions.

A single backend agreeing with itself is insufficient proof: use an independently reviewed expectation and, where possible, at least two independent implementations.

## 2. One canonical fixture schema

Each test case should have:

- a stable immutable fixture ID and spec edition;
- source (and package manifest when relevant);
- declared language feature and expected compile acceptance/rejection;
- expected typed diagnostics for invalid code, including source-range expectations;
- expected values/errors or allowed event partial orders for valid code;
- applicable target profiles and run modes;
- normalization/observation rules that deliberately exclude backend-specific details.

Proposed fixture template:

~~~yaml
schema_version: 1
spec_edition: "0.1"
id: "arithmetic.signed_add_overflow_64"
kind: "compile_and_run"
source: |
  define fnc main() -> int as
    let a: int64 = 9223372036854775807
    let b: int64 = 1
    return checked_add(a, b)
  end
expected:
  compilation: "accept"
  outcome: "language_error"
  error_kind: "ArithmeticOverflow"
  # Exact source spelling and runtime API must first be ratified.
modes:
  - "llvm_o0"
  - "llvm_o2"
  - "truffle_interpreter"
  - "truffle_compiled"
  - "graalvm_native_image"
  - "wasm"
  - "cranelift"
  - "dotnet_native_aot"
comparison:
  ignore:
    - "backend_stacktrace"
    - "native_address"
    - "duration"
~~~

The checked_add spelling above is **illustrative** until standardized. Do not report this test as runnable solely because its YAML is parseable.

### 2.1 State-container and virtual-actor candidate corpus

Candidate IDs `state_container.*` and `virtual_actor.*` are specified in [state-containers-and-virtual-actors.md](state-containers-and-virtual-actors.md) and the portable JSON contract `state-container-virtual-actor-v1.json` in `oreslang-platform-conformance`. Each case starts `NOT_EXECUTED`; schema tests must not upgrade it to a compiler pass. `define grain` must not be accepted as an implicit alias.

### 2.2 Source-extension and traceability gate

New canonical language examples and parity fixtures use `.atto`. The existing `.ores` corpus is retained as **legacy compatibility evidence** until an explicit, reviewed migration; never rename, translate, or rewrite a case separately for one backend. A source-extension parser acceptance test is not proof of guest execution. See [specification-to-corpus traceability](parity-traceability.md) for bridge identity and evidence rules.

## 3. Required shared suites

The following IDs are a **proposed catalogue**, not evidence of existing files.

| Fixture ID | Acceptance condition |
| --- | --- |
| parse.define_actor | Parse an actor declaration and preserve semantic AST kind |
| parse.define_supervisor | Parse a supervisor declaration distinctly from a class |
| parse.define_pub_module | Accept canonical declaration/formatter form |
| parse.legacy_instance_fnc | Canonicalize legacy instance-fnc without changing meaning |
| parse.if_presence_binding | Recognize as const/as let; reject as final |
| parse.match_forms | Match and do match accepted/normalized per grammar |
| parse.symbol_hash | Symbol #ready distinct from string "#ready" |
| parse.compound_critical | critical-read and critical-write tokenized as intended |
| types.generic_defaults | Resolve named and dependent generic defaults |
| types.overload_nominal | Overload by arity/allowed nominal distinction, not structural guessing |
| types.match_duplicate | Reject duplicate/redundant arms with stable diagnostic |
| types.match_return_inference | Infer return match result consistently |
| arithmetic.signed_add_overflow_64 | Checked overflow gives language error, never LLVM poison |
| arithmetic.signed_min_div_neg1 | Defined arithmetic failure for extreme division |
| arithmetic.div_zero | Language-level division error |
| arithmetic.cast_boundaries | Truncation and overflow follow declared conversion mode |
| arithmetic.float_specials | NaN, infinities and signed zero follow declared rules |
| ownership.use_after_take | Compile-negative with no runnable artifact |
| ownership.double_mut_borrow | Compile-negative conflicting mutable alias |
| ownership.read_write_alias | Compile-negative mutable versus immutable overlap |
| ownership.heap_alias | Same borrow rules for heap-owned data as locals |
| ownership.borrow_across_await | Reject or prove pinned lifetime per rule |
| ownership.take_actor_send | Sender cannot use taken value after accepted transfer |
| ownership.arc_mutation | Shared handle alone does not authorize racy mutation |
| actor.sealed_state_access | Direct state access outside callback rejected |
| actor.critical_read_parallel | Multiple readers admitted without conflicting writer |
| actor.critical_write_exclusive | Writer excludes incompatible readers/writers |
| actor.state_escape_negative | State alias escape rejected |
| actor.send_close_race | Exactly one linearizable admission/closure outcome |
| actor.mailbox_backpressure | Capacity bound and failure/await policy respected |
| actor.panic_control | Panic reaches supervisor CONTROL and not actor-local catch |
| actor.raise_recover | Raise escapes catch and enters defined recovery boundary |
| actor.throw_catch | Throw catches nearest applicable handler |
| actor.group_multi_membership | One actor belongs to multiple groups without shared-state alias |
| actor.group_leave | Revoking one membership does not revoke unrelated memberships |
| pubsub.topic_scope | Topic identity respects broker scope |
| pubsub.order_per_stream | Per-source/per-recipient order is maintained |
| pubsub.unsubscribe_cutoff | Unsubscribe has explicit admission cutoff |
| pubsub.shutdown | Shutdown drains/cancels according to documented policy |
| pubsub.backpressure | No unbounded implicit queue or silent loss |
| channel.select_cancel | Cancellation and selection have valid one-winner/cleanup behavior |
| io.blocking_name | Blocking API naming canonicalization and semantic effect |
| errors.trap_result | Trap call returns declared typed outcome |
| errors.trace_opt_in | New Error need not materialize a stack trace |
| modules.root_plus | + root resolves by package manifest, not CWD accident |
| modules.symlink_escape_negative | No forbidden import through symlink |
| permissions.default_denial | Restricted host operation denied without capability |
| wire.option_result | Exact accepted bytes and malformed payload rejection |
| hotload.version_retirement | No in-flight call targets retired code |
| native.layout_abi | DataLayout and calling-convention boundary verified |
| aot.no_dynamic_dependency | Native Image/Native AOT respects deployment constraints |

Tests for unresolved language rules must initially be marked **SPEC_PENDING**, not arbitrarily given an expected value from one host runtime.

## 4. Compile-negative gates

Negative tests establish that the compiler rejects unsafe constructs. They must check:

1. Nonzero failure from the language compiler, rather than a later crash.
2. Stable diagnostic category and relevant source span.
3. No linked executable, native object, LLVM IR or other output artifact that the contract says must not be emitted.
4. The same semantic rejection across all supported frontends.
5. No regression where -O0 rejects while -O2 accepts, or vice versa.

**No output** must be interpreted against a declared transactional-output policy: tools may write temporary files internally, but must not expose a successful output artifact for rejected programs. When the contract explicitly requires no files at all, use a fresh sandbox and verify the full directory is unchanged.

Representative negative programs include use-after-take, escape from critical-write, invalid actor superclass, state mutation through an immutable shared handle, non-Error throw, and unauthorized source imports.

## 5. Differential execution methodology

### 5.1 Modes

For each eligible fixture run independently:

- LLVM native O0 and O2 (O3 as extended profile);
- Truffle interpreted and stabilized compiled execution;
- GraalVM Native Image where supported;
- Wasm using its supported host profile;
- Cranelift/Forge JIT/AOT as implemented;
- .NET Native AOT on Linux and Windows where supported.

Feature matrices must distinguish unavailable target mode, compile failure, execute failure and runner admission failure. A mode omitted from a test plan must not be presented as passing.

### 5.2 Semantic observations

Normalize results to:

~~~text
{
  fixture_id,
  compilation: accepted | rejected,
  diagnostic_codes: [...],
  outcome: value | language_error | panic | cancelled,
  result_value_or_error_kind,
  actor_event_constraints,
  wire_bytes_if_applicable,
  resource_admission_outcomes
}
~~~

Do **not** normalize away actual error classification, overflow outcomes, lost messages, ownership violations, wire bytes, or forbidden effects.

Timing, native addresses, heap object IDs, optimized assembly and host stack frames are not required to match.

### 5.3 Concurrency as partial-order verification

Independent schedulers are nondeterministic. Test guaranteed relations such as:

- a message cannot be received before successful admission;
- a rejected send cannot later be delivered as accepted;
- a sender's defined per-recipient ordering remains intact;
- one exclusive writer never overlaps an incompatible reader;
- unsubscribe prevents newly admitted delivery after the documented cutoff;
- panic CONTROL notice reaches the supervisor through its defined path;
- closing/reusing a mailbox incarnation cannot admit a stale delivery.

Use bounded-state/model-checking or deterministic scheduler injection for race cases, combined with stress runs. Do not claim correct concurrency because a single trace happened to match Java.

## 6. Property-based testing and metamorphic checks

Generate small well-typed programs and separately generate invalid mutations. Validate that:

- alpha-renaming and formatting do not change observable results;
- function inlining and optimization do not change semantics;
- equivalent Option/Result pipelines preserve error early exit;
- moving values or reordering borrows cannot evade diagnostics;
- parsed/formatted/parsed ASTs are semantically equivalent;
- adding irrelevant actors does not break message safety;
- serialization then deserialization respects the accepted wire contract;
- host exception details never leak into the language result.

Automatically minimize every mismatch into a checked-in regression fixture with the seed and toolchain versions.

## 7. Native safety and real-time testing

In addition to normal functional tests:

- ASan/UBSan runs on native runtime and generated-code integration fixtures.
- Carefully designed concurrency stress, race instrumentation where available, stale-handle and ABA tests.
- x64/ARM64, Linux/Windows, GCC/Clang and suitable optimization combinations within supported target profiles.
- Arena reuse, actor destruction, mailbox erase, CONTROL saturation, cancellation, double-close and failed hot reload.
- Bounded allocation, latency and watchdog metrics for explicitly advertised real-time profiles.

A passing sanitizer suite is useful evidence but does not establish formal memory safety or worst-case execution guarantees.

## 8. Evidence states and gate interpretation

| Status | Meaning |
| --- | --- |
| SPEC_PENDING | Expected language behavior is not yet ratified |
| NOT_IMPLEMENTED | Backend has no implementation for this contract |
| SOURCE_REVIEWED | Source appears relevant; not yet compiled or executed |
| COMPILE_VERIFIED | Compiler genuinely ran and produced expected compile result |
| RUNTIME_VERIFIED | Program executed with captured actual outcome |
| CONFORMANCE_VERIFIED | Expected semantic outcome was checked, with reproducible provenance |
| BLOCKED | Setup, permissions, runner or dependency prevented intended check |
| NOT_EXECUTED | No relevant compiler/runtime execution occurred |
| FAILED | Check executed and reported a real mismatch or regression |

A CI job with steps null or zero executed steps means **NOT_EXECUTED/BLOCKED**, not a compiler or runtime failure. A test log with "pending" or "skipped" must not be counted as passing.

A conformance result must retain exact source commit, source **tree** SHA, fixture version, target OS/triple, compiler and runtime versions, input seed, optimization mode, executed command, exit code and immutable log/artifact references.

## 9. Private-source runner protocol

When source-org Actions cannot run due to budget/admission:

1. Diagnose the source job admission/runner issue without misclassifying it as source failure.
2. Construct an isolated **private** mirror in an authorized alternative org using a temporary branch; avoid cross-org secret/token injection.
3. Verify every mirrored Git blob and exact tree identity against the source commit before interpreting tests.
4. Run only the intended minimal test jobs, with least-privilege permissions and no accidental release/publish step.
5. Record carrier organization, mirror branch/tree, source SHA, workflow revision and executed job IDs.
6. Preserve the distinction between tests run on the verified mirror and source-org runs; do not infer that unrelated branches, platforms or PRs passed.

Do not promote results when identity or execution evidence is missing.

## 10. Parity scoreboard

Track **feature × backend × execution mode × target** rather than a single repository-wide green/red badge.

Minimum fields:

~~~yaml
feature: "actor.sealed_state_access"
spec_edition: "0.1"
backend: "llvm"
mode: "native_o2"
target: "linux-x86_64"
status: "NOT_EXECUTED"
source_sha: null
source_tree_sha: null
fixture_sha: null
execution_id: null
evidence_uri: null
reason: "Example only; no runtime verification supplied."
~~~

No numeric parity percentage may include SPEC_PENDING, BLOCKED or NOT_EXECUTED as passing. PR descriptions must report newly verified features and outstanding gaps.

## 11. Merge/release gate

A change affecting language semantics must contain:

1. A specification diff identifying old and new behavior.
2. Positive and negative fixtures with stable IDs.
3. HIR/MIR verifier and frontend tests where applicable.
4. At least one genuine runtime execution on each impacted implemented target; missing targets explicitly disclosed.
5. Target-specific ABI/sanitizer/race evidence when the change touches native memory or concurrency.
6. Explicit provenance, risk and fallback notes.

**Pass** means the declared and executed gate passed. It never means "all five toolchains are at parity" unless all six required backends have independently earned CONFORMANCE_VERIFIED for the relevant profile.

---

Further reading: [Core language](language.md) · [Compiler/runtime portability](compiler-runtime-contract.md).
