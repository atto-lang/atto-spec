# 27 — Stable source identity, structured logs and AOT/JIT tracing

**Status: PROPOSED / TARGET ONLY — no backend implementation or five-backend parity is certified here.** This chapter is an additive source-identity and compiler-lowering contract. It complements the existing scoped-resource and dynamic instrumentation draft in [PR #44](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/pull/44) and the [common-source native instrumentation v1 draft](https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/279). It does not redefine `using` or authorize a JIT in sealed guest AOT.

## The four IDs MUST be different

| Field | Domain | Generated when | Meaning |
| --- | --- | --- | --- |
| `routine_id` | Static source identity | Checked-in authoring tool, once | Logical callable / overload, independent of execution |
| `site_id` | Static source identity | Checked-in authoring tool, once | Exact log, diagnostic, span declaration or compiler probe location |
| `trace_id` | Runtime W3C/OTel context | Request/root trace, or validated remote propagation | One causally related distributed trace; 128 bits |
| `span_id` | Runtime W3C/OTel context | Each runtime span | One span instance within a trace; 64 bits |

A static `site_id` MUST NOT be put in the OpenTelemetry `trace_id` field. In OTLP log records, static source IDs are dedicated, namespaced attributes (proposed keys `atto.source.routine_id` and `atto.source.site_id`), whereas runtime `trace_id` and `span_id` occupy the standard trace-context fields. Static event identity is **not** a span instance, and is never randomly generated during request execution.

Additional metadata: `code_generation_id` records hot-loaded/JIT generation (not a source ID), `build_id` names the exact compiled artifact, `code.file.path` / `code.function.name` / `code.line.number` provide source hints when policy permits. Line numbers are hints, not durable identities. Distinguish source routine identity from a single invocation (the same routine may run concurrently on different tasks/actors).

Stable IDs are opaque 128-bit values with human-searchable textual renderings such as `rid_d5f8e146ba97430dac6bf17430477e2a` and `sid_652e1632e7464fdb936fc40fe24f1c7b`. A release MAY compress them to bounded per-artifact unsigned descriptor indices, but the index MUST resolve through the exact build's immutable source table; it is not a global ID. Reject collisions, stale registrations and confusingly duplicated source-ID claims.

## Source syntax — user code stays readable

Illustrative **target syntax; not yet proven accepted by every backend**:

```atto
use namespace ores.std.telemetry;

@Tracing.RoutineId("rid_d5f8e146ba97430dac6bf17430477e2a")
pub fnc hammer(): void {
    using telemetry.span("hammer") as span {
        log.info("hammer.started");
        log.info("hammer.progress");
        log.info("hammer.finished");
    }
}
```

The annotation is an *optional* explicit source anchor, not an obligatory UUID on every function or a runtime invocation of `Tracing`. Routine IDs may instead reside exclusively in the checked-in manifest below. Parser/formatter support for attributes and their placement is a separate grammar gate.

Three distinct log callsites above receive three different stable `site_id` values **without** putting UUIDs next to calls. Event names remain human-readable and grep-able. Duplicate event names are permitted at different sites, because `event_name` describes the event class, not source identity. A developer who needs an inline search anchor can use a short checked-in event name or, once statement-attribute grammar is approved, opt into `@Tracing.SiteId("sid_...")`; do not require explicit statement annotations by default.

Do not mandate a source-injected `const routine_id` merely to feed every log builder. Compiler-owned immutable callable metadata and generated lowering should attach the ID directly. A compatibility/source-introspection read-only `telemetry.routine_id()` may return it without allocating a new string per call, but user-shadowed locals MUST NOT affect emitted IDs. Compiler-generated intrinsic bindings must be hygienic.

## Mandatory committed site-ID registry

Default authoring path: a package-root `.atto.telemetry.ids.toml` registry (or an equivalent versioned, checked-in, machine-readable registry). This is a *proposed* file format; do not infer the current parser already reads it. Example:

```toml
schema = "atto.telemetry.source-ids.v1"

[[routines]]
id = "rid_d5f8e146ba97430dac6bf17430477e2a"
source = "src/hammer.atto"
symbol = "hammer():void"

[[sites]]
id = "sid_652e1632e7464fdb936fc40fe24f1c7b"
routine_id = "rid_d5f8e146ba97430dac6bf17430477e2a"
source = "src/hammer.atto"
event_name = "hammer.started"
anchor = "callsite:1"

[[sites]]
id = "sid_738b13448f724fc5905841e9037b410a"
routine_id = "rid_d5f8e146ba97430dac6bf17430477e2a"
source = "src/hammer.atto"
event_name = "hammer.progress"
anchor = "callsite:2"
```

The sample omits the third site for brevity; strict validation requires all active sites to have entries. The production registry needs a versioned AST anchor or source-token fingerprint, an expansion chain where applicable, and a verified source-unit identity. `anchor` ordinal alone is only a teaching example, never a sufficient production matching rule.

- `atto telemetry ids sync` explicitly proposes and writes initial IDs **at development time**, in source control. `atto telemetry ids check` performs a read-only, deterministic build/CI validation. Generated IDs MUST NOT be regenerated merely because source lines move, code is formatted or the compiler version changes.
- Move/rename/refactor preservation uses an explicit registry move record or a unique, verified structural match. If an edited file contains indistinguishable duplicate callsites, the tool MUST ask for a developer selection / fail closed, never silently reassign both. Whole-file copy/paste does not permit duplicate IDs.
- Strict production builds MUST reject unknown/duplicated IDs or stale ambiguity. Compiler builds may suggest changes but MUST NOT introduce nondeterministic registry edits in CI. In developer exploration, a temporary generated ID may be diagnosed as **nonpersistent**, not published as a durable source identity.
- Include macro invocation identity **and** definition/expansion origin. Multiple macro expansions do not become one source site by sharing a macro definition. Hygienic expansion and copied functions must preserve provenance or require explicit rebinding.
- The selected project-root/package identity, symlinks, source aliases, namespace, overload signature, and imported modules must use the verified resolver identity from chapter 09. No absolute workstation path becomes a global identity. Restrict untrusted foreign package metadata.
- A `grep -R 'sid_...' .` (or equivalent) should find the committed registry/explicit anchor; `atto telemetry locate sid_... --build <digest>` resolves the precise git revision, package-relative source path, function, nearest source span and macro expansion chain. Document an archived manifest lookup strategy for binaries built from older revisions.
- Store the complete source table in a reproducible sidecar symbol bundle, optionally stripping private path data from production binaries. Bind the sidecar to immutable `build_id`, binary/module digest, canonical registry blob digest and compiler identity. Never accidentally export private source paths to an untrusted tenant.

## Compiler and logger lowering

The typed frontend assigns `routine_id` to the resolved callable (including receiver method, overload signature, generic instantiation origin and qualified package/source identity) and `site_id` to each statically admitted instrumented expression. The compiler validates IDs before optimizing MIR; transformed/inlined/JIT-specialized code retains logical source identity and emits an additional distinct code-version identity for diagnostics.

Conceptual lowered log call:

```text
if recorder_enabled(level=INFO, descriptor_index=17) {
    record_structured(
        descriptor_index=17,
        active_context=current_logical_task_context(),
        message_template="hammer.started",
        typed_attributes=[]
    )
}
```

The descriptor table maps index 17 to immutable `routine_id`, `site_id`, `event_name`, canonical package-relative source, verified revision and source span. The hot path SHOULD avoid UUID string formatting, per-event metadata object allocation, unbounded boxing, reflection, stack walking and mandatory heap builders. Static message templates and typed field names should be checked at compile time; emit bounded binary/event records, and format in the collector/exporter.

**Evaluation contract:** do not silently skip side effects in argument expressions when tracing is off. Ordinary call argument evaluation remains governed by normal language rules. Compile-time-intrinsic or explicitly lazy log syntax MAY suppress attribute evaluation after an enabled check **only** with documented evaluation semantics; pure/effect-checked lazy field capture is preferred. Avoid exposing arbitrary closures to the exporter. Never do a blocking send, heap-allocating stringify, disk I/O or OTLP network send from a critical-read/write region or scheduler/CONTROL path.

Errors may carry `routine_id` and `site_id` independently of recording policy. A diagnostic site is not necessarily a log emission; the contract must cover error construction, panic/raise/throw provenance and supervisor CONTROL events without mutating their semantics.

## AOT, JIT and governed runtime controls

**Identity is created at compile/source time, not by JIT compilation.** A Truffle/Forge JIT tier or LLVM ORC-generated specialization must carry the same logical `site_id` as its verified source expression. Code versions, native PC ranges and inlining stacks are separately mapped under `build_id` + `code_generation_id`. Recompilation cannot invent new public source IDs.

Three different operations must not be conflated:

1. **Precompiled AOT probe activation:** enable already-emitted dormant probes under host authority; no new executable code or hidden JIT. Strict `--instrument=none` removes static sites. In an instrumentable JIT profile, source tags may remain only by explicit build/profile choice; do not call it stripped or zero overhead.
2. **JIT attachment / dynamic recompilation:** only where explicitly admitted; use trusted tagged Atto AST/bytecode/typed IR, bounded deopt/recompile, versioned metadata and safe retirement. Authentic instrumentation of newly generated code requires actual machine/code-version evidence, not swapping a test-provided host callback.
3. **Signed, precompiled hot-loaded generation:** a new source registry/binary mapping is versioned and generation-fenced. It is not a JIT and must not cause logs from the old code generation to resolve to the new source tree.

Proposed independent controls: build `--instrument=none|boundaries|functions`; execution `--jit=off|on` where the backend supports it; runtime `--trace=off|on` and separate propagation/export permissions. Do not let `--trace=on` turn on JIT, override a strict full-AOT build, bypass security permissions, or auto-attach probes to an opaque stripped binary. Authenticated control must report actual available sites, attached coverage, active generation, drop counts and unavailable targets.

LLVM XRay-style nop-sled/patch-point support is **optional platform-qualified implementation detail**, never a cross-platform language guarantee. AOT-compatible static branches are the portable baseline; executable-memory patching requires W^X, platform support, safepoint and race/retirement proof. JIT deoptimization is not a way to weaken ownership/borrowing, real-time budgets or sealed actor state.

## Span semantics and actor context

Reuse chapter 03's target `using telemetry.span(...) as span { ... }` scoped-resource semantics. An acquired scope closes exactly once after lexical exit on fallthrough, `return`, `?`, `trap`, `throw`, `raise`, `panic` or cancellation; `await`/`select` suspension is **not** scope exit. For native hard-RT profiles, require bounded scope closure, recorder offer and cleanup.

The active `trace_id`/`span_id` follows the logical task/continuation and approved actor-message envelope, **not** the carrier OS thread. Default concurrent actors can execute multiple receivers simultaneously; each handler invocation has independent context. Multiple causal parents use span links when appropriate, not a fabricated single parent. Distinguish producer/send, enqueue, queue wait, processing and child task spans; deduplicate stdlib automatic spans with user semantic spans. State and payload references never escape an actor merely because an exporter wants fields.

Untrusted incoming trace headers are validated context hints, never capabilities or permission to increase sampling. Disable implicit baggage and private fields. Bound per-event field count/bytes, queue size, sampling cost, exporter retry and shutdown. Drop-and-count on pressure. Do not export source-control IDs as telemetry labels for metrics with unbounded cardinality; log/trace diagnostic attributes may carry them under a controlled policy.

## Cross-backend conformance gates

Use the same positive and negative `.atto` fixture sources plus the same versioned registry in Java/GraalVM, LLVM native, Forge, Wasm and .NET. Compiler/tooling scripts must follow the existing Rust-only tooling policy (no new Python). The feature remains **NOT VERIFIED** until actual independently executed guest artifacts prove:

1. Parse, format and annotation placement when implemented; manifest sync idempotence and read-only check; identical output after formatting, line insertions, file moves and rebuilds; duplicate copy/ambiguous macro expansion must fail closed.
2. One stable routine ID and distinct site IDs across all logs, errors and source-instrumented spans; two simultaneous invocations share source IDs but have separate runtime spans; OpenTelemetry `trace_id` is never the static site ID.
3. Verify emitted descriptor table, per-artifact compact index mapping, source revision, macro expansion, linker stripping, symbol/source-map sidecar and unambiguous `telemetry locate` in stripped binaries. Corrupt/stale mapping must be rejected, including hot upgrade to a different source generation.
4. Log output correlated with runtime trace/span context through concurrent actor handlers, `await`, scheduler migration, multi-parent linking, failure/panic, cancellation and restart. No capability leak, no extra supervisor CONTROL delay and no changed failure semantics.
5. Build+runtime matrix: `none/off`, `boundaries/off`, `boundaries/on`, `functions/on`; same-image OFF→ON→OFF→ON for compiled probes; no newly added AOT site in `none`; JIT attach/deopt/recompile only if a real compiled guest variant is observed with correct source ID.
6. Measure hot-path code size, allocation count, event cost, JIT deopt pause and p50/p99/p99.9 latency, including saturation, actor mailbox throughput, critical-read/write and hard-RT budgets. No unconditional "zero overhead" claim for dormant branches. Deliberate exporter failure must preserve guest results.
7. Exact source/compiler/fixture/registry blob SHAs, target artifact digest, nonzero executed CI steps and actual guest output. Distinguish source-only checks, host recorder tests, native compiled execution, AOT proof and dynamic JIT probe proof.

## Existing work and precedent

- [AttoLang scoped `using` and live JIT/AOT contract draft](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/pull/44).
- [Atto common-source native instrumentation contract draft](https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/279).
- [`dd-next-1` routine versus static trace identifiers](https://github.com/dancing-dragons/dd-next-1/blob/dev/docs/routine-ids-vs-trace-ids.md) motivates preserving durable locations while removing per-statement UUID noise.
- [Rust tracing static callsites](https://docs.rs/tracing-core/latest/tracing_core/callsite/index.html), [.NET source-generated logging](https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/high-performance-logging), [LLVM XRay](https://llvm.org/docs/XRay.html), [OTel log record model](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/logs/data-model.md), and [OTel code attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/code/) are relevant precedents.

This document is deliberately a spec amendment: no newly introduced `@Tracing` annotation, CLI command, registry parser, probe emitter, native exporter or cross-backend conformance claim is treated as implemented.
