# 04 — Ownership, Borrowing, Lifetime and Memory

**Status: DRAFT.** The ownership contract applies to objects, collections, actor state, closure captures, task frames, and transport.

Under [chapter 27](27-implicit-const-and-const-mut.md), `const mut` means an unrebindable local owning a fresh mutable instance from a constant template. Ordinary borrowing, sealed state and isolation checks still apply; global `const mut` is not admitted.

## Ownership operations

**Canonical source spelling for new AttoLang code uses the contextual bang forms**, not the legacy `rt` prefix. These are prefix ownership operators: the operation name is immediately followed by `!`, then its operand. The bang forms are the preferred and formatter-emitted spelling.

| Intent | Canonical spelling | Legacy compatibility spelling | Intended meaning |
| --- | --- | --- | --- |
| Transfer unique ownership | `take! value` | `rt take value` | Move exclusive ownership; subsequent use of the old place is invalid |
| Shallow/value copy | `copy! value` | `rt copy value` | Fresh root/value; aliasing children requires proved sharing or immutable storage |
| Deep graph copy | `copy!! value` | none | Distinct maximal-munch operation; preserve internal alias/cycle topology and reject unproved ownership |
| Shared read loan | `borrow! value` | `rt borrow value` | Acquire a bounded immutable loan |
| Exclusive mutable loan | `borrow! mut value` | `rt borrow mut value`, `rt mut borrow value` | Acquire a bounded exclusive mutable loan |
| Shared ownership | `share! value` | `rt share value` | Convert to explicitly authorized shared/frozen ownership |

The legacy forms have **the same typing, ownership effects, proof obligations, diagnostics and lowering** as their canonical bang equivalents. They are accepted only for source compatibility; formatters and new examples MUST emit the bang forms. A backend MUST NOT give the legacy spelling weaker checks or a different runtime representation.

This preference does not invent `ref!`, `deref!` or `unref!`. The separate [Pointer<T> v1 profile](../language/pointer-aot-safety-v1.md) is the scoped exception: when contextual typing proves a borrowed-local Pointer<T>, `ref!`, `deref!` and `unref!` are equivalent to `rt ref`, `rt deref` and `rt unref`. For other checked-handle families no alias or rights change follows from this chapter. The local release consumes the lease, returns void and does not destroy the referent. It also does not make `rt` a general ownership escape hatch: unlisted `rt` operations are not authorized by this table.

```atto
val packet = make_packet()
val owned = take! packet
// using packet here is a compile-time use-after-move error
```

**Migration and conformance:** New code and formatter output use `take!`, `copy!`, `borrow!`, `borrow! mut` and `share!`. Existing `rt take/copy/borrow/share` source remains accepted only as a compatibility spelling while a versioned migration profile exists. A compiler may warn on legacy source, but MUST NOT silently reinterpret it or allow it to bypass ownership checks. Positive and negative fixtures must exercise both spellings and prove identical typed ownership events.

Borrow checking is not optional for a native backend. Aliased writes, use-after-take, escaping stack borrows, double-drops, stale actor references, and mutable aliases crossing isolation domains MUST be rejected or safely represented with explicit runtime guards, never silently trusted.

Compact operands (`copy!value`, `borrow!mut value`) normalize to one ASCII space after the bang. The historical `mut borrow! value` is a migration alias for `borrow! mut value`. Prefix precedence is unary with postfix member/index expressions binding tighter; evaluate each operand once. Duplicate `mut` qualifiers reject. The [checked-handle call-loan profile](../language/checked-handle-call-loans-v1.md) defines all-path retirement, explicit lexical `block` scopes and versioned borrow-default call proof boundaries.

## Implicit argument borrowing (target)

The [versioned borrow-default profile](../language/implicit-argument-borrow-v1.md) makes ordinary nonprimitive object formals temporary loans. `inspect(foo)` and `inspect(borrow! foo)` have identical read-loan facts for a proven read-only parameter. `update(mut foo)` requires writable owner authority, a nonconflicting exclusive loan and a sealed callee write effect. Frozen data, sealed foreign actor state and ambiguous provenance never gain write rights. Borrow checks include subsequent arguments, exceptional edges, cleanup and all-path returned-loan provenance. Primitive scalars retain value passing. Explicit consuming `take! T` formals and explicit `take! owner` arguments are separate; `copy!!`, `share!` and `rebind` retain their own contracts. Legacy owned-formal behavior requires an explicit migration profile; do not silently switch it. No general compiler or ABI certification is implied.

## Explicit capability extensions: `freeze!`, `weak!`, and `pin!` (TARGET)

These are **contextual prefix operations** (the word followed immediately by `!`), not
permissions that bypass ordinary ownership. They require the same checked
provenance as `borrow!`, `take!`, and `share!`. Existing `rt` forms remain
historical compatibility spellings; this section does not silently ratify
`rt freeze` / `rt weak` / `rt pin` as additional aliases.

### `freeze! owner`: permanently deep-immutable

- Consumes the **unique** owner graph and yields a distinct frozen capability.
  The source owner becomes unusable. It is not a temporary read-only loan.
- The compiler MUST prove the complete transitive reachable graph has no
  mutable aliases, interior-mutability escape, mutable FFI pointer, mutable
  closure capture, or reachable unsynchronized tenant/actor-local storage.
  Graphs with unresolved aliasing or dynamic types MUST fail closed.
- Once frozen, neither an owning handle nor a borrowed handle may mutate the
  graph. Compatible immutable borrows may continue.
- A later `share!` requires independent Sendable/Sync and tenant-domain
  admission proofs. `freeze!` does not grant cross-tenant access on its own.
- An immutable scalar is already deeply immutable and may be admitted as an
  identity operation. Do **not** generalize that optimization to a sum type
  with mutable nested payloads.

```atto
let config = make_mutable_config();
let frozen = freeze! take! config;
// config is moved; frozen can only be read and may be shared after proof.
```

### `weak! shared`: no ownership extension

- Only an explicitly admitted shared-ownership handle may be weakened; an
  ordinary local borrow or arbitrary object address may not.
- A weak handle does not keep the object/actor/region alive. `upgrade()`
  returns `Option<Shared<T>>`, with **atomic** generation validation and
  acquisition of a strong reference before any dereference.
- Failed upgrade returns `None`, never a dangling pointer. Recycled arena
  offsets, actor IDs and tenant slots MUST NOT resurrect an expired handle.
- Cross-domain access still requires a separate authorization check;
  a weak handle cannot confer stronger rights than its source.
- Weak reference cleanup and object retirement must be race-safe. Tests must
  cover concurrent upgrades, retirement and generation reuse.

```atto
let observer = weak! shared_service;
if observer.upgrade() as const service then
  service.notify();
fi
```

### `pin! take! value`: stable pointee address

- Pinning guarantees stable **pointee storage** until the required pin lifetime
  ends; the owning pointer/handle and its scheduler thread may still change.
- Backends MUST prove stable allocation placement and prevent address-changing
  compaction/relocation while pinned. Pinning does not make raw FFI safe.
- A pinned owner cannot cross a task capture, actor mailbox, guarded-region
  promotion or frozen shared-region publication unless the backend proves
  the actual pointee allocation retains its stable address across the handoff.
  The conservative V0 checker rejects such transfers with
  E_PIN_BOUNDARY_TRANSFER; ordinary same-arena moves of the owner handle are
  still legal.
- Pinning alone never extends the owner's lifetime, authorizes cross-actor
  borrowing, or makes a loan across `await`/cancellation valid. A separate
  continuation/cleanup and suspension proof is necessary.
- Runtime address-stability evidence MUST be generated by a trusted backend,
  not by accepting an unverified source-level boolean/witness.

```atto
let pinned = pin! take! io_buffer;
```

### Compatibility, diagnostics, and conformance

`drop!` remains an **optional future convenience** over deterministic
destruction, not a fourth newly reserved operation in this amendment.
Unadmitted `weak!`/`pin!` code MUST produce an explicit unsupported
diagnostic, not an identity lowering or a copied strong alias.

The canonical Rust V0 verifier models `Freeze`, `PinStorage`,
`RelocateStorage`, `CreateWeak`, and `ProbeWeak` as **typed ownership
events**. It does not build a real weak upgrade result or authenticate a
backend's deep-freeze, generation or stable-address witnesses. Successful model
tests are **not** cross-backend runtime certification. The browser compiler
admits scalar `freeze!` only and fails closed for unlowered weak/pin storage.

Required positive/negative tests include: valid scalar freeze, graph freeze
witness rejection, surviving mutable alias rejection, writes through frozen
handles, send/share domain mismatch, use-after-freeze, borrowed freeze,
pinning with no stable allocation, pointee relocation after moving the
pinned handle, pin plus cross-suspension loan (still rejected), weak from
unshared storage, stale/recycled-generation weak upgrades, and concurrent
retirement/upgrade races. Backend test evidence must be tied to exact commits.

### Concrete host reference model and conformance registry

The canonical Rust checker additionally includes a restricted host-only runtime model using iterative graph validation, Arc/Weak upgrade, exact-region read permits, nonblocking retirement, and Pin<Box<T>>. Its source and tests are in atto-borrow-checker.rs PR #43. The shared positive/negative expectation registry is atto-platform-conformance PR #76.

This proves neither source-to-IR completeness nor the correct code generation of Java, LLVM, Forge, .NET or Wasm guests. The runtime host must authenticate the original graph and caller domain; bare numeric IDs and caller-supplied boolean witnesses are not authority. Source compilers MUST continue rejecting unsupported graph freeze, weak upgrade and pin forms rather than accepting an unsound identity lowering.

Cross-backend release is gated on compiled guest tests for concurrent weak upgrades against retirement, actor/tenant stop, generation reuse, physical pinned address stability, cancellation cleanup, and sanitizer-backed lifetime safety. All exact-head backend evidence remains unverified until executed.
## Complete ownership vocabulary: copy!!, lt!, mut and drop!

This amendment completes the proposed user-visible set: borrow!, take!,
share!, copy!, copy!!, mut, lt!, freeze!, weak!, pin! and drop!.
All spellings and safety obligations are defined in atto-spec PR #92;
production backend support must be verified separately.

### copy!! — truly independent graph cloning

copy!! requires a full transitive clone into independent mutable storage,
preserving graph cycles and repeated references *within* the clone without
sharing nested mutable allocations with the original. A simple root pointer
copy, repeated copy!, or automatic Arc clone is NOT deep copy. The compiler
must verify all reachable types/edges, reject external mutable aliases and
unproven foreign handles, bound work, and cleanly roll back partial clone
failures without consuming the original. Scalar immutable values may use
ordinary value copy. The browser compiler currently rejects heap graph
copy!! until its allocation/clone ABI exists.

### lt! a and lifetime! a — compile-time region binders

A lifetime binder is a type-level declaration, not an ordinary expression:
lt! a is canonical; lifetime! a is the long-form alias. The name a is an
identifier without a Rust-style apostrophe, referenced by a named generic
parameter such as Borrow<T, lt=a>. Nonprimitive parameters borrow by default;
a caller need not use borrow! unless explicitly disambiguating. Explicit
mut requests exclusive access. Outlives, cancellation, scope exit and
suspension checking apply equally to implicit and explicit loans.

### drop! — consuming ownership release

drop! must be a standalone statement on a named owned value. It invalidates
the owner, rejects if any loan is live, and prevents repeated release. Real
resource-owning values require deterministic destructor/allocator integration
on normal exit and on verified exceptional/cancellation cleanup. A compiler
may accept drop! for resource-free scalars as logical ownership termination,
but must not pretend a class or external resource was reclaimed without a
working Drop ABI.

The canonical checker models copy!! via a distinct DeepCopy event rather
than the Copy trait and has a bounded host graph clone; it models drop via
Drop and named lifetimes via a separate conservative lt! verifier. These
are reference models, not compiler-generated guest ABI proofs. The shared
test registry (atto-platform-conformance PR #76) marks all native backends
NOT VERIFIED until exact source-to-guest tests run.

## Explicit lifetime relations (target)

The [lifetime design](27-inferred-lifetimes.md) describes named `lt! a` binders and named `lt=a` arguments, inferred default lifetimes and proof requirements for returned `Borrow<T>` / `BorrowMut<T>` views. Elide only with a unique proved origin, including a receiver; multiple possible origins require a verified relationship. No apostrophe or pointer/borrow sigils. The separate candidate checked-handle bang aliases do not amend the existing canonical spelling or grant pointer rights. Preserve explicit consuming formals in the opt-in borrow-default profile and reject unsupported lowering without an artifact.

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

`Pointer<T>` capability transport or serialization across actors, tenants, isolates or networks is forbidden, even if `T` is Sendable or Serializable. An authorized transfer may copy, move or serialize the **pointee data** under its own proof and receiving-domain ownership, never the pointer token. Same-domain owner transfer requires separate proof. `Sendable` and `Serializable` are distinct properties.

## Resource lifecycle

Deterministic destructor/defer behavior applies to owned guest resources on ordinary scope exit and supported cancellation/failure unwind. Host crash, forced process termination, OOM, and invalid FFI corruption cannot be made deterministic by a language promise. Native resource retirement may lag logical Future settlement, and actor `done` must not race with outstanding pinned resources.

## Verification minimum

Use negative compile tests for use-after-take, double release, cross-`await` borrow, cross-actor state escape, stale generation and forged shared rights; use sanitizer/heap proofs for LLVM, source-level borrow tests on all backends, and executable actor-retirement/GC characterization. A compiler error test is not a runtime memory-safety proof.
