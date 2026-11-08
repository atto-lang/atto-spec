# 04 — Ownership, Borrowing, Lifetime and Memory

**Status: DRAFT.** The ownership contract applies to objects, collections, actor state, closure captures, task frames, and transport.

## Ownership operations

AttoLang uses explicit rights operations, expressed as reserved `rt` forms:

| Operation | Intended meaning |
| --- | --- |
| `rt take value` | Move exclusive ownership; subsequent use of the old place is invalid |
| `rt copy value` | Duplicate only when the type proves it is Copy |
| `rt borrow value` | Acquire a bounded immutable loan |
| `rt mut borrow value` | Acquire a bounded exclusive mutable loan |
| `rt share value` | Convert to explicitly authorized shared/frozen ownership |

The public language does not admit pointer/ref/dereference intrinsics, `Pointer<T>` or pointer-sigil aliases. Opaque compiler/runtime handles may exist only behind capability-checked APIs, and are not permission to expose raw memory addresses in AttoLang source.

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

A 32-bit compressed offset/handle inside actor-local regions may reduce footprint on 64-bit machines, but it is not universally a 32-bit machine pointer or a promise of 50% total memory reduction. Check bounds, generation, alignment and overflow before dereference.

## Cross-actor transport

Each message transfer must have a provable ownership action (`take`, `copy`, or permitted `share`), validated payload graph, bounded bytes/depth/nodes, and type-correct domain admission. A mutable pointer, synchronized cell, closure with host capability, or foreign pointer cannot be smuggled across isolation merely because its in-memory representation is small.

Opaque runtime/FFI descriptors may cross domains only under a versioned, capability-checked copy, move, or immutable-share contract; a raw address is never a portable wire representation and public `Pointer<T>` is not source syntax. `Sendable` and `Serializable` are distinct properties.

## Resource lifecycle

Deterministic destructor/defer behavior applies to owned guest resources on ordinary scope exit and supported cancellation/failure unwind. Host crash, forced process termination, OOM, and invalid FFI corruption cannot be made deterministic by a language promise. Native resource retirement may lag logical Future settlement, and actor `done` must not race with outstanding pinned resources.

## Verification minimum

Use negative compile tests for use-after-take, double release, cross-`await` borrow, cross-actor state escape, stale generation and forged shared rights; use sanitizer/heap proofs for LLVM, source-level borrow tests on all backends, and executable actor-retirement/GC characterization. A compiler error test is not a runtime memory-safety proof.
