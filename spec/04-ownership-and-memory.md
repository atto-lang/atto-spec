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
| `ref! value` | Construct a checked handle only under verified ownership, domain, and generation authority; legacy `rt ref value` |
| `deref! handle` | Access a valid live checked handle without manufacturing ownership; legacy `rt deref handle` |
| `unref! handle` | Consume/retire a checked handle exactly once, or restore ownership only when its contract proves it safe; legacy `rt unref handle` |

```atto
val packet = make_packet()
val owned = rt take packet
// using packet here is a compile-time use-after-move error
```

**Canonical checked-handle operations:** `ref!`, `deref!`, and
`unref!`. They are contextual prefix operators, not macros, raw-pointer
sigils, reference-count increments by assumption, or synonyms for
`borrow!`/`take!`/`share!`. The compact forms `ref!value`,
`deref!handle`, `unref!handle` are accepted; the formatter emits
`ref! value`, `deref! handle`, `unref! handle`. Legacy `rt`
forms remain compatibility spellings and must resolve to the same
typed checked-handle operation and effects, not a different lifetime
contract. `mut` is not valid after these three prefixes.

The handle records and validates actor/arena, allocation extent,
generation, domain, alignment, permissions, and liveness before access.
`unref!` invalidates the handle on every path, rejects double
consumption and use-after-release, and cannot run while dependent
checked views remain live. It may return an owned value *only if*
the verified handle contract explicitly allows ownership restoration;
it must not be hardcoded as free(), raw-pointer cast, or generic
reference-count decrement. If a backend lacks such a verified
lowering, it rejects **both** the bang and legacy forms without
emitting guest code. `Pointer<T>` is a distinct explicit pointer
type; no assumption that every checked handle is a raw
`Pointer<T>` or that pointer conversion is safe is permitted.

Borrow checking is not optional for a native backend. Aliased writes, use-after-take, escaping stack borrows, double-drops, stale actor references, and mutable aliases crossing isolation domains MUST be rejected or safely represented with explicit runtime guards, never silently trusted.

## Inferred lifetime syntax (target, not executable today)

AttoLang's target reference types are `Borrow<T>` and `BorrowMut<T>`,
with lifetime inference by default and optional named generic lifetime
parameters (`fnc f<lt! a>(x: Borrow<T, lt=a>)`). The long-form
`lifetime! a` is accepted and formatted as `lt! a`; only named `lt=a`
references an in-scope lifetime. Positional `Borrow<T, a>` is not a lifetime
alias. `Shared<T>` denotes explicitly authorized shared ownership
and `Pointer<T>` denotes a separately checked pointer/handle, never
an implied borrow or independently owned object. The target does
**not** use Rust's `'a` lifetime spellings, `&T` / `&mut T`
borrow shorthand, or `*T` pointer shorthand. Returned borrows must
carry input/receiver provenance, never new owned-handle authority. The full syntax, NLL, CFG,
reborrow, async and actor lifetime proof obligations are recorded in
[chapter 27](27-inferred-lifetimes.md).

This is a **TARGET** contract, not an assertion that any backend currently
accepts `Borrow<T>` or safe references returned from functions. The
preferred `borrow!` source operator is proposed in PR #67; existing `rt`
forms remain the chapter-04 spelling until that reconciliation is merged.

## Lifetime elision for implicit object call arguments (target)

Ordinary nonprimitive `fnc inspect(Foo foo)` and method `inspect(Foo foo)`
formals borrow rather than consume in the updated target language model.
`inspect(foo)` and `inspect(borrow! foo)` must produce identical immutable
loan facts; `inspect(mut foo)` requires both a proven transitive callee write
effect and an exclusive writable loan. Primitive scalars remain by-value.
Inferred formal lifetime variables refer to the caller's root place and are
bounded by last use, not the lexical block alone. Neither spelling grants
permission to escape, transfer, drop or retain the object.

A returned non-owning view is marked `Borrow<Child>`; it may elide a
lifetime **only** when its input owner (or `self`) is unambiguous. Multiple
possible input owners require explicit `lt! a` declarations with
`Borrow<T, lt=a>` relationships, not guessed lifetimes. Explicit annotations
cannot manufacture ownership or extend the actual owner's lifetime.
See [chapter 27](27-inferred-lifetimes.md#implicit-parameter-lifetime-elision-2026-11-18-reconciliation).

**Migration caution:** historical compilers may consume class-valued `Foo`
formals; this draft rule cannot be enabled without explicit owned-formal
migration and backend-specific executed proof. The active companion
[implicit argument proposal](https://github.com/atto-lang/atto-spec/pull/89)
documents those hazards.

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
