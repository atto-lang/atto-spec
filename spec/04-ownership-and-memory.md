# 04 — Ownership, Borrowing, Lifetime and Memory

**Status: DRAFT.** The ownership contract applies to objects, collections, actor state, closure captures, task frames, and transport.

## Ownership operations

AttoLang uses explicit rights operations. **TARGET (decided, 2026-11-14):** the preferred spellings are the punctuated ownership-prefix operators below. Legacy `rt` forms remain accepted compatibility aliases; a spelling change does not grant additional rights.

| Preferred spelling | Compact accepted spelling | Legacy compatibility spelling | Intended meaning |
| --- | --- | --- | --- |
| `take! value` | `take!value` | `rt take value` | Move exclusive ownership; subsequent use of the old place is invalid |
| `copy! value` | `copy!value` | `rt copy value` | Duplicate only when the type proves it is Copy |
| `borrow! value` | `borrow!value` | `rt borrow value` | Acquire a bounded immutable loan |
| `borrow! mut value` | `borrow!mut value` | `mut borrow! value`, `rt borrow mut value` and `rt mut borrow value` | Acquire a bounded exclusive mutable loan |
| `share! value` | `share!value` | `rt share value` | Convert to explicitly authorized shared/frozen ownership |
| `ref! value` | `ref!value` | `rt ref value` | Create a checked handle under validated ownership and domain authority |
| `deref! handle` | `deref!handle` | `rt deref handle` | Access through a validated, live checked handle; not an ordinary borrow |
| `unref! handle` | `unref!handle` | `rt unref handle` | Consume/retire the checked handle exactly once; unwrap ownership only when the checked-handle contract permits |

`ref!`, `deref!` and `unref!` are **syntax-only aliases** for the existing checked-handle `rt ref`, `rt deref`, and `rt unref` operations, respectively; they do not desugar to `borrow!`, `take!` or `share!`. The frontend MUST lower both spellings of each operation to the same typed checked-handle IR instruction, with identical evaluation count, handle kind, actor/arena/domain identity, allocation extent, generation, bounds, alignment, permissions, lifetime and release checks. `unref!` consumes the handle, must not permit double consumption or subsequent `deref!` on the retired handle, and MUST preserve any owned-value unwrap result defined by `rt unref` (never guess reference-count semantics); `deref!` must not grant an owned value, borrow, mutable access, cross-actor capability or raw host pointer that the legacy form could not grant. If a backend cannot implement the original checked-handle operation safely, it MUST reject both spellings (not silently reinterpret them as raw pointers, generic calls, or ordinary loans). These are TARGET contracts, not assertions of implemented compiler or guest support.

The formatter MUST emit a single ASCII space after `!` in the preferred forms (e.g. `copy! foo`, `borrow! mut foo`). It MUST accept the compact forms without warning and normalize old `rt` forms only when it can preserve the same AST, effects, precedence and evaluation order. No space or comment is allowed between an ownership verb and its `!` marker: `copy !foo` is *not* the `copy!` operator. `mut` follows the attached `borrow!` marker as a separate keyword. The earlier `mut borrow! value` form remains a compatibility alias, never the formatter output. See [chapter 16](16-lexical-and-grammar-reference.md#ownership-prefix-operators-target).

```atto
val packet = make_packet();
val owned = take! packet;
// using packet here is a compile-time use-after-move error

val payload_copy = copy! data;
val reader = borrow! record;
val writer = borrow! mut record;
val frozen = share! payload;
// A separate owned value is consumed when creating a checked handle.
val owned_for_handle = make_payload();
val checked_handle = ref! owned_for_handle;
block {
  val checked_view = deref! checked_handle;
  inspect_readonly(checked_view);
}
val returned_owner = unref! checked_handle;
```

### Checked-handle lexical block and borrowed callable boundary (TARGET / browser Rust prototype)

The canonical scoped statement is **`block { ... }`**, not a bare `{ ... }` statement. Callables such as `fnc main() { ... }` retain their existing braced-body syntax; the `block` keyword creates a separate, explicit **nested lexical scope**. The checked view returned by `deref!` must end at that scope's exit. An `unref!` that would consume the handle with any live view (including on an exceptional or suspension path) is invalid.

The first browser Rust/Wasm compiler prototype proposes an explicit borrowed class parameter contract, `fnc inspect_readonly(borrow! Payload item): int`. It is not a general new `Pointer<T>` or transferable capability and is **not yet tested as compiled guest behavior**. The call site remains `inspect_readonly(view)`; the callee's parameter is a readonly, nonescaping loan with no ownership transfer. A by-value class parameter (`fnc consume(Payload item)`) still moves its argument and MUST reject a checked view. The compiler MUST not let a borrowed parameter escape as a result, owned field, owned argument, suspended continuation, actor message, or closure; it MUST reject mutations through the loan. Nested synchronous calls with explicitly borrowed parameters may preserve the same loan while its caller's `block` stays active.

```atto
fnc inspect_readonly(borrow! Payload item): int { return item.value; }

val original = make_payload();
val handle = ref! original;
// original has moved

block {
  val view = deref! handle;
  inspect_readonly(view);
}

val restored = unref! handle;
```

Other backends MUST fail closed until the same parameter/loan provenance and runtime lifetime guarantees are implemented and tested. The initial browser profile only admits named local class values, synchronous top-level functions and explicit `val` handle/view/restore bindings; that restriction is an implementation gate, not a limit on the eventual language contract.

For `copy!foo`, the scanner must recognize `copy`, `!`, `foo` with a context-sensitive ownership-prefix parse; `!` is not part of the identifier. These are **TARGET semantics**, not a claim that every backend currently compiles the new spelling. In particular, mutable borrowing still requires an addressable writable place, shared ownership still requires explicit authority and the immutable/frozen proof, and `take!` never permits later use of a moved place.

```atto
val packet = make_packet()
val owned = rt take packet
// using packet here is a compile-time use-after-move error
```

Borrow checking is not optional for a native backend. Aliased writes, use-after-take, escaping stack borrows, double-drops, stale actor references, and mutable aliases crossing isolation domains MUST be rejected or safely represented with explicit runtime guards, never silently trusted.

### Checked-handle exceptional-call gate (current Rust/Wasm prototype)

The eventual language contract requires all-path retirement, including exceptional and cancellation exits. The current compiler does **not** yet have typed unwind/drop edges for checked handles and therefore must reject code that could bypass a required `unref!`. This includes transitive calls to known `throw`/`raise`/early-exit callees, even when the immediate caller contains no explicit failure statement. Unknown effects and suspendable calls must fail closed until their cleanup and lifetime proofs are available.

An independent bounded CFG proof prototype in `atto-borrow-checker.rs` tracks distinct handle/loan facts across branch joins and rejects missing cleanup on any path, including abrupt exits. This oracle is **not wired into compiler typed MIR**, and it does not yet establish runtime reclamation, actor-domain validity, or five-backend parity. Until native and Wasm guest tests run, the Rust frontend's straight-line checked-handle profile remains draft.

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
