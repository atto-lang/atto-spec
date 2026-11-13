# 04 — Ownership, Borrowing, Lifetime and Memory

**Status: DRAFT.** The ownership contract applies to objects, collections, actor state, closure captures, task frames, and transport.

## Constant bindings and mutable constant instances (proposed)

A type-first unqualified *local* declaration is a compile-time `const`, not implicitly `val`. Plain constants do not provide writable shared aliases. `const mut T x = expr` must create a distinct owned mutable instance on each execution of the declaration from const-evaluable template data, with a fixed binding and separately proved borrow/actor-state permissions. `mut` never grants writable access across tenant, actor, or pinned-continuation boundaries. Shared mutable global `const mut` is not admitted in the initial design. See [chapter 27](27-implicit-const-and-const-mut.md) for precise scope and diagnostic targets. This target is not a claim of implementation.

## Ownership operations

AttoLang uses explicit rights operations, expressed as reserved `rt` forms:

| Operation | Intended meaning |
| --- | --- |
| `rt take value` | Move exclusive ownership; subsequent use of the old place is invalid |
| `rt copy value` | Duplicate only when the type proves it is Copy |
| `rt borrow value` | Acquire a bounded immutable loan |
| `rt borrow mut value` | Acquire a bounded exclusive mutable loan |
| `rt share value` | Convert to explicitly authorized shared/frozen ownership |
| `rt ref` / `rt deref` / `rt unref` | Managed or checked handle operations, never unchecked cross-isolate escape |

```atto
val packet = make_packet()
val owned = rt take packet
// using packet here is a compile-time use-after-move error
```

Borrow checking is not optional for a native backend. Aliased writes, use-after-take, escaping stack borrows, double-drops, stale actor references, and mutable aliases crossing isolation domains MUST be rejected or safely represented with explicit runtime guards, never silently trusted.

## Lifetimes across suspension

`await`, `select`, `nb` task creation, cancellation, and actor turn boundaries are suspension or ownership checkpoints. A loan can cross only if its owner is pinned for the full continuation, aliasing remains valid, cleanup and cancellation are generation-fenced, and no conflicting turn can access the region. A critical writer or reactor callback may not accidentally hold an actor-state loan across an unrelated suspension.

A `Task<T>` result has an owner and exactly-once completion/drop semantics. Move-only arguments move into the Task at launch; merely capturing a pointer to a caller stack slot is forbidden.

## Memory regions

The **target topology** is a persistent allocation arena per actor, with separate scratch/task scopes and explicit frozen/read-only regions. Actor retirement drops its owned data once, after live continuation and native I/O loans retire. Shared actors do not implicitly share writable actor arenas.

- **Java/GraalVM:** minimize managed allocation and GC pressure through off-heap/arena placement where safe, but Java/Truffle wrappers and runtime objects can remain GC-managed. `near-zero GC` is an optimization objective, not a universal zero-GC guarantee.
- **LLVM/native:** use ownership/region destruction to target **zero tracing GC** on admitted paths; prove actual behavior with allocator and runtime tests.
- **Wasm:** target deterministic linear-memory regions/ownership where feasible; host/browser garbage collection may remain outside the guest's control.
- **Forge and .NET:** preserve identical source-level ownership and drop semantics, regardless of JIT/AOT and managed-memory implementation.

The target actor-heap reference representation uses checked **32-bit arena-relative offsets/handles**, including on 64-bit hosts. This is not a 32-bit host pointer or a promise of 50% total memory reduction. Each arena must stay within its representable range; reject exhaustion and arithmetic overflow instead of truncating or silently widening guest references. Check actor/arena identity, generation, bounds, allocation extent and alignment before dereference. Domain and generation metadata may live outside the 32-bit offset. See [chapter 22](22-concurrency-and-shared-ownership.md).

## Cross-actor transport

Each message transfer must have a provable ownership action (`take`, `copy`, or permitted `share`), validated payload graph, bounded bytes/depth/nodes, and type-correct domain admission. A mutable pointer, synchronized cell, closure with host capability, or foreign pointer cannot be smuggled across isolation merely because its in-memory representation is small.

`Pointer<T>` transport is only admissible under a proof of pointee safety and a domain-specific copy, move, or immutable share strategy; a raw address is never a portable wire representation. `Sendable` and `Serializable` are distinct properties.

## Resource lifecycle

Deterministic destructor/defer behavior applies to owned guest resources on ordinary scope exit and supported cancellation/failure unwind. Host crash, forced process termination, OOM, and invalid FFI corruption cannot be made deterministic by a language promise. Native resource retirement may lag logical Future settlement, and actor `done` must not race with outstanding pinned resources.

## Verification minimum

Use negative compile tests for use-after-take, double release, cross-`await` borrow, cross-actor state escape, stale generation and forged shared rights; use sanitizer/heap proofs for LLVM, source-level borrow tests on all backends, and executable actor-retirement/GC characterization. A compiler error test is not a runtime memory-safety proof.
