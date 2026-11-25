# 10 — Data-Oriented Programming, Affinity, Heterogeneous Compute and Real Time

**Status: DRAFT; largely an optimization/profile target, not universal runtime evidence.**

For the inverted struct/class value-versus-identity split and optimization legality, see [chapter 27](27-inverted-structs-classes-aot-jit.md). It is a proposed contract, not implemented guest parity.

## Data-layout semantics

AttoLang targets efficient arrays/records and explicit or compiler-selected AoS, SoA, AoSoA, and SoAoS layouts. Inverted classes, field-column storage and ECS-like iteration are performance representations. They MUST preserve declared value/ownership semantics, including identity, deterministic drop, bounds checking, mutation rights and actor state isolation.

### Normative layout and aliasing rules (DRAFT, 2026-11-06 audit)

These rules close gaps found in the Java and LLVM DOP reference code. They constrain every backend; they do not claim source-level `inverted` lowering exists.

1. **`inverted` is a contextual keyword.** It is meaningful only in `define [pub|private] [abstract] inverted class|struct`. Elsewhere `inverted` remains an ordinary identifier. Until a backend lowers inverted aggregates, it MUST reject them with a diagnostic that names the feature as specified but not executable. It MUST NOT parse them as ordinary row-wise (AoS) classes or fall back silently. `inverted` followed by anything other than `class` or `struct` is a syntax error.
2. **Four physical layouts, one logical row.** AoS, SoA, AoSoA (power-of-two lane tiles, at most 1024 lanes) and SoAoS (an explicit field-group partition, one compact sub-record per group, no lane tiles) are physical representations of the same logical rows. SoAoS groups MUST form an exact partition: no empty, duplicate, missing or out-of-range field.
3. **Checked geometry, physical quotas.** Offsets and sizes use checked 64-bit arithmetic and fail before any allocation. When segments share one owner allocation, quotas are checked against the *physical* extent, including inter-segment alignment holes, not the payload sum. Backends that share a layout ABI MUST produce byte-identical offsets for the shared golden corpus. Java and LLVM currently check one golden table, `heterogeneous-layout-golden-v1`.
4. **Write granules.** A borrow place carries a write granule. This is the number of consecutive rows a writer touches as one unit: the AoSoA lane count for tile-wide stores, the vector width for unmasked SIMD stores, and 1 for scalar access. It is a power of two, at most 1024. Logical overlap is cell-exact. When either side writes, however, conflicts are decided on row ranges widened to the coarser granule's boundaries. Rows `[0,12)` and `[12,24)` with 8-lane tiles are therefore *not* independently writable. Read/read never conflicts, but stale storage epochs still fail closed.
5. **Amortized growth.** Owning columnar stores MUST grow capacity geometrically. All-or-nothing `push` (pre-reserve, then commit) must not be implemented by reserving exactly `len + 1`, which makes bulk construction quadratic.

A layout annotation is not a promise of speedup. The compiler should select layout using access-pattern evidence and report effective layout with build-time diagnostics. Vectorization, SIMD and zero-copy transfers must be proven against scalar and copy baselines.

## Cache and CPU locality

L1/L2/LLC locality, NUMA ownership, worker-lane affinity and contiguous data access are optimization goals. Keep distinctions explicit:

- **Soft affinity:** prefer a worker lane/cache domain; the actor may migrate under bounded spill.
- **OS core pinning:** separately authorized and reported process/thread CPU affinity; a source hint alone cannot guarantee it.
- **NUMA placement:** memory allocation policy and verified locality, not merely worker-pool naming.
- **GPU residency:** actual device allocations/queues/synchronization, not CPU-side metadata.

Actor ownership and per-turn exclusivity are never relaxed to win locality. A task moved to another worker cannot bring along a stale mutable state loan. Shared frozen regions need explicit lifetime/region proof.

## CPU and GPU blocks

`gpu { ... }` with nested `cpu { ... }` and typed kernels are design targets for heterogeneous execution. Compiler lowering must establish effect and ownership boundaries across device queues, address spaces and asynchronous completion. A GPU device handle or kernel cannot be serialized into an untrusted actor simply because it is typed.

No implicit device fallback may change observable effects or bypass permission checks. Unsupported GPU targets fail closed or explicitly execute a declared CPU fallback with equivalent semantics.

## Real-time qualification

The Java/GraalVM runtime seeks **soft real-time** behavior and near-zero managed allocation on critical paths. Native LLVM seeks a qualified **hard-real-time profile** using ownership-based drop, preallocated memory, bounded queues, nonparking synchronization, predictable admission, and carefully controlled effects.

A hard-real-time claim requires a bounded worst-case execution-time argument, target-specific compiler/OS/configuration, no hidden allocations, bounded preemption/interrupt latency, and measured worst-case end-to-end completion under load. Zero tracing GC alone does not prove hard real time. General-purpose Wasm browsers, unmanaged JIT, or dynamically sized actor pools cannot inherit that qualification by name.

## Measurements and contracts

Benchmarks should record exact commit and target CPU model, processor quota, frequency conditions, worker count, actor workload, cold/warm behavior, p50/p95/p99 latency, tail outliers, cache misses, branch misses, allocations, collector pauses, queue depth, steal/migration count, NUMA transfers, and GPU queue timing where relevant.

Make performance regressions visible, but do not make cache placement a language correctness rule. Correctness tests precede optimization claims.
