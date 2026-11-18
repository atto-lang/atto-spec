# 04 — Ownership, Borrowing, Lifetime and Memory

**Status: DRAFT.** The ownership contract applies to objects, collections, actor state, closure captures, task frames, and transport.

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

## Implicit argument borrowing (target amendment, 2026-11-18)

**Source-level default:** a nonprimitive reference-backed argument passed to an ordinary `fnc` or method is a temporary *loan*, not an ownership move. For a proved read-only parameter `fnc inspect(Foo f)`, `inspect(foo)` and `inspect(borrow! foo)` must produce equivalent typed ownership/loan facts. No `Borrow<Foo>` spelling is necessary for an ordinary nonescaping formal; it remains available as an explicit type.

```atto
define class Foo as pub let int value = 1; end
fnc inspect(Foo f): int { return f.value; }
fnc update(Foo f): void { f.value += 1; }
pub fnc main(): int {
  val mut Foo foo = new Foo();
  val old = inspect(foo); // readonly loan, foo remains owned
  update(mut foo);        // exclusive loan, requested at call site
  // update(foo);         // E_BORROW_MUT_REQUIRED
  return old;
}
```

Parameter mutability inference is an explicit callable-formal rule, not permission to mutate an ordinary unqualified local `val Foo` in violation of [local binding mutability](https://github.com/atto-lang/atto-spec/blob/main/language/local-binding-mutability-v1.md). The compiler must compute and seal transitive parameter write effects into statically checked callable signatures **before** call admission; unresolved foreign/indirect/public bodies need an explicit effect contract (or an ambiguity rejection). `mut` never grants writable rights to frozen data, other actors' state or a conflicting borrowed owner. Calls use the same CFG/SSA provenance, drop/cleanup and lifetime validation as explicit `borrow!`, including subsequent arguments and exceptional edges. If ownership, argument place or lifetime cannot be proven, require explicit `borrow!` plus a verifiable contract; explicit spelling cannot override an unsound or unimplemented case.

The default never implies `take!`, `copy!!`, `share!`, `rt share`, persistent reference-counted ownership or cross-actor transfer. A consumed parameter must be explicit at *both* contract and call boundary after a versioned migration (exact consuming-formal grammar under review). Existing implicit class-by-value move code is a breaking-change concern, **not** evidence that the new default already runs. No backend may silently retain implicit moves and advertise this rule.

See [Atto canonical target contract](https://github.com/atto-lang/atto-spec/pull/89) (in draft review); current Rust compiler [#332](https://github.com/atto-lang/atto-source.rs/pull/332) implements only narrower explicit `Borrow<Class>` call loans. This section is **target semantics, not implementation or parity certification**.

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
