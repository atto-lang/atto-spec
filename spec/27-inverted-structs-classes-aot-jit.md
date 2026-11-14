# 27 — Inverted Structs and Inverted Classes: DOP, AOT and JIT

**Status: TARGET / DRAFT.** This is a semantic and admission contract, not a claim that any backend currently compiles these source forms. New examples use `.atto`; only explicitly migrated fixtures use `.ores`. Read with [DOP](10-dop-and-realtime.md), [ownership](04-ownership-and-memory.md), [concurrency](22-concurrency-and-shared-ownership.md), and [full guest AOT](24-aot-zero-gc-controlled-dynamism.md).

## The two kinds of inverted type

An **inverted struct** is a closed-shape **value type** whose owning `InvertedArray<T>` stores fields as columns. Extracting a value makes a detached snapshot or a statically scoped borrow; it never invents an independently heap-allocated row object. Copies preserve value semantics. The type has no per-element reference identity.

An **inverted class** is a nominal **reference-like row interface** backed by an owning `InvertedArray<T>`. The only durable row identity is an opaque issuer+store+slot+generation capability, not a physical index or pointer. Methods lower to checked row/column operations and may not smuggle out `self`, mutable field pointers, or a borrow beyond the store's lifetime. Per-row physical class allocations and ad-hoc object headers are **not** part of the SoA representation.

Target grammar is `define [pub] inverted struct Name as ... end` and `define [pub] inverted class Name as ... end`, subject to the established visibility grammar; `inverted` is a declaration modifier, not a standalone runtime type constructor. This spelling is *proposed* pending parser/formatter acceptance tests.

Illustrative **not-yet-portable** `.atto` source:

```atto
define inverted struct Position as
    f32 x
    f32 y
end

define inverted class Particle as
    f32 x
    f32 y
    f32 vx
    f32 vy

end

mtd (mut self: Particle) move_by(f32 dt): void {
    self.x = self.x + self.vx * dt;
    self.y = self.y + self.vy * dt;
}

let positions = InvertedArray<Position>.with_capacity(1024);
let particles = InvertedArray<Particle>.with_capacity(1024);
```

A plain `Array<T>` retains its documented ordinary array semantics. No compiler may silently reinterpret an existing `Array<T>` as `InvertedArray<T>`, or choose an AoS representation for a declared inverted-class store in contradiction to its SoA contract. A layout conversion is explicit and may copy. A fixed-width nested record may remain one opaque column element; recursive flattening requires its own opt-in layout contract and proof.

## Ownership, memory, and destruction

- Every mutable collection has one owner domain: local, task-region, actor-owned arena, or explicitly authorized shared region. An ECS row is **not** an actor. Inverted data is not necessarily actor-owned.
- Every column has the same logical live length. Insertion publishes all fields or none; failed growth must preserve all prior handles and values. Overflow, negative dimensions, padding, alignment and per-owner quota are checked **before** publishing.
- Swap-delete may change dense physical row coordinates but must preserve the identities of surviving class handles. Deleted/foreign/retired handles fail. Reusing a slot increments a non-wrapping generation; exhaustion retires it permanently. An inverted struct *value snapshot* has no handle identity.
- Read loans may coexist on the same field. A mutable loan excludes other same-field loans and ordinary same-field operations. Proven-disjoint fields and row partitions may run concurrently. Growth, erase, migration, transfer and teardown exclude **all** live unsafe column loans.
- No mutable column loan, physical span, row-view or owner-relative offset may escape its region, cross a suspend/await/actor boundary unproven, or survive hot-reload/teardown. `rt share` may share only admitted immutable snapshots/regions; it never manufactures shared mutable row pointers. Actor sealed-state rules remain in force.
- Drop/destructors for owning resource fields, cycles and recursive reference fields are **not** admitted by the phase-one scalar-only ABI. Nested fixed-size POD admission must be transitive, and must not accidentally turn an owning resource into a memcpy-only field.
- The logical reference is not a raw address; with 32-bit actor-relative arenas the compiler checks offset and extent before narrowing. Reclamation is deterministic according to the selected ownership profile. A native reference-counted host prototype does **not** prove process zero-GC.

## Compiler pipeline and optimization legality

The parser emits distinct `InvertedStructDecl` and `InvertedClassDecl` metadata, with nominal declaration identity, closed field order/types, storage policy and source spans. Type checking must either produce a fully admitted representation descriptor or reject the source **before executable IR**. Unsupported inheritance, virtual dispatch, GC/resource-owning fields, unsized/recursive fields, unproven aliasing, or incompatible target ABIs fail closed.

A normalized layout plan contains declaration and generation identity, field types/widths/alignments, column offsets and capacities, owner/arena identity, store generation, row mapping policy, loan/effect summary, and selected layout. Every field address is checked using wide integer arithmetic, aligned segment bounds, and current handle/loan authority; field access does not first resolve an index then race an erase. The plan is a **compiler-owned**, versioned artifact, not user-constructed authority. Its physical description must agree across codegen, reflection/debugging, binary serializers and FFI or those integrations must be rejected.

### Typed inverted-access IR admission (target contract)

Before code generation, every backend must lower admitted `.atto` inverted operations to **typed compiler-owned IR**, never directly to unverified host-side column calls. The canonical *target op semantics* below do not assert that any backend implements them today; concrete IR spellings can differ between independent compilers.

```text
InvertedLayoutV1<T> = (declaration_identity, declaration_generation,
  kind: struct|class, ordered_field_types_and_alignments, SoA_column_layout,
  owner_domain, row_mapping_policy, layout_epoch_policy, target_abi)

InvertedAlloc<T>(owner, capacity)               -> Store<T>                   [alloc, structural]
InvertedPush<T>(store, typed_row_value)          -> CheckedClassHandle<T>      [alloc?, structural, trap]
InvertedResolve<T>(store, class_handle)          -> CheckedRow<T>              [read, generation_check, trap]
InvertedFieldRead<T,F>(store, checked_row, loan) -> F                          [read, bounds/loan_check, trap]
InvertedFieldWrite<T,F>(store, checked_row, F)   -> void                       [write, bounds/loan_check, trap]
InvertedSnapshot<T>(store, checked_row)         -> DetachedValue<T>           [read, whole_row_check, trap]
InvertedEraseSwap<T>(store, class_handle)       -> void                       [write, structural, trap]
InvertedDrop<T>(store)                          -> void                       [owner_drop, revoke_loans]
```

The class-handle operations above apply to `inverted class`; an `inverted struct` remains a detached value or scoped borrow, never a durable `CheckedClassHandle<T>`. Each operation preserves source-defined receiver/index/RHS evaluation order and exactly-once evaluation, including when the operation traps. The verifier rejects a forged capability, wrong owner, expired generation, stale layout, invalid field type, illegal alias or escaping loan. The lowered read/write checks and the access itself must be **linearizable under the same synchronization boundary**; an independent check followed by a raw address dereference is forbidden.

An issued physical `LayoutGuard` contains store issuer identity and a monotonic epoch. A `reserve(n)` that **does not grow any backing metadata or field column** preserves the guard; real growth and `push` / `erase_swap` invalidate it. If a growth attempt can partially relocate storage before failing, it must invalidate the guard *before* its first allocation. A guard never grants raw pointer access, skips row/loan checks, or substitutes for code-generation/schema/CPU-feature guards. JIT deoptimization must not repeat a committed field write or exception side effect. The compilation pipeline must reject unrepresentable owner-relative 32-bit offsets *before narrowing*, and preserve deterministic arena reclamation without silently introducing tracing GC.

These operations require backend-specific checked lowering and real compiled-guest `.atto` tests. A host C++ template or Java class implementing similar operations is **not** evidence of this IR or its AOT/JIT execution.

**AOT:** monomorphize admitted row operations, fix offsets/strides at build time, inline bounded index+generation checks, eliminate temporary row materializations where observable semantics permit, vectorize proven independent field loops, and produce a static method/ABI manifest. Strict full-guest-AOT artifacts contain no interpreter, runtime source compiler, or JIT fallback.

**JIT/hybrid:** profile column-hot loops, specialize the same admitted IR by shape, CPU SIMD capability, stride/tile and access-set; inline/scalar-replace row views; fuse scans and map/filter passes; unroll/peel or vectorize only when legal. Guards include the exact declaration/code generation, storage epoch, shape/layout version, active borrow/effect regime, and CPU features used for specialization. If guards fail, deoptimize **before uncommitted side effects** or resume from a compiler-defined statepoint preserving effects, drops, exceptions, row identities, and loan counts. No JIT guard can revoke an active loan or rewrite a live store's physical layout in place. Changing a layout requires a new region or an explicitly synchronized copy/migration transaction.

**Both:** identical overflow/panic, bounds, evaluation-order, exception/raise, signed zero/NaN, float reassociation and alias/ownership semantics. SIMD tail masking must not touch padding or a removed row; reductions may reassociate floating-point values only under an explicitly permitted math mode. Fusing operations cannot skip observably required traps, drops, allocation failures or scheduling/cooperation points. AOT and JIT may select different *implementations*, not different answers.

At present, generic AoS/SoA/AoSoA/SoAoS planners and native column containers are partial **host models**, not evidence of these guest-language lowering steps. Java/GraalVM Native Image is not automatically guest AOT, and host JVM JIT acceleration is not automatically AttoLang optimized compilation.

## Required backend evidence (all `.atto`)

1. Parser + formatter round trip and negative admission for both inverted declaration forms; no fake guest artifact from an unsupported feature.
2. Compiled-guest trace equivalence of inverted struct values and inverted class row handles versus AoS oracle: push, snapshot, mutation/method call, swap-delete, reuse, stale/foreign handles, drop and allocation-failure rollback.
3. AOT unoptimized/optimized and JIT cold/warm/deoptimized executions of *identical source*; force invalidated layout/epoch guards and compare trace+exit status, including failure/trap order.
4. Race/ownership tests: same-column borrow conflicts, disjoint-column and proven row-range writes, close-versus-loan, actor transfer and `await` escape rejections, hot-update epoch change.
5. Generated IR/binary checks for exact checked accesses and no fallback; real ASan/UBSan/TSan, AOT/NativeAOT and Graal native-image runs where applicable. Benchmark AoS, SoA and AoSoA on column-only **and** full-row workloads with allocation, cache misses, p50/p99 latency, and tail behavior, recording CPU and exact SHA.
6. Report status separately as `SOURCE_REJECTED`, `HOST_MODEL_EXECUTED`, `GUEST_AOT_EXECUTED`, `GUEST_JIT_EXECUTED`, or `NOT_EXECUTED`. A zero-step Actions run, a passing JSON oracle or an executing host model never counts as backend parity.

## Hardening priority

**P0**: source admission/diagnostics, value-vs-identity split, typed access IR, generation/loan/overflow fences and actual AOT guest trace.

**P1**: compiler-verified hot-loop vectorization, layout descriptors/ABI, JIT guards+deopt statepoints, combined AOT/JIT differential tests.

**P2**: adaptive AoSoA tiling, ECS archetype migration, dynamic code-generation upgrades with explicit schema migration, NUMA/GPU and device-transfer fences, only with measured correctness and performance.
