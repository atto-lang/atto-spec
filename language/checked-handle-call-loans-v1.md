# Checked handles and call loans — reconciled target profile

**Status: TARGET / NOT_EXECUTED.** The checked handle operations remain `rt ref`, `rt deref`, `rt unref` under merged #221. Their older proposed bang spellings are not canonical or admitted by this document. Existing Rust prototype references describe historical candidate profiles, not current verified backend behavior. Borrow-by-default is the versioned profile in [implicit argument borrowing](implicit-argument-borrow-v1.md), not an unconditional legacy ABI change.

### Default function/method call ownership and Rust-grade loan exclusion (TARGET)

**Normative cross-reference:** [implicit-argument-borrow-v1.md](implicit-argument-borrow-v1.md) governs calls; copyable contract (PR #39) governs shallow vs deep copies; Pointer contract proposal (#18) governs `Pointer<T>`. The referenced proposals have separate implementation and edition admission gates. The existing bounded browser/compiler prototypes do **not** certify that these rules are implemented across backends.

- For ordinary **nonprimitive** `fnc` and method formals, `process(owner)` means a proven, non-owning **shared readonly loan**. It neither copies `owner` nor transfers it, changes its allocation, grants a destructor, creates shared ownership, or inserts an implicit `Pointer<T>`. `process(borrow! owner)` has the **same typed loan proof** and effect. A lone concrete `Borrow<T>` annotation is not mandatory at the ordinary call boundary.
- Primitive and proven value-copy scalars (e.g. `int`, `bool`) retain **by-value** semantics. An ABI may pass an address, offset, register, or word without changing AttoLang ownership semantics; physical argument passing is **not** permission to retain or mutate the caller's owner.
- `mutate(mut owner)` or `mutate(borrow! mut owner)` requests an **exclusive mutable loan**. It is legal only for a writable addressable place, with a compiler-proved writable callee effect and **no** overlapping read or write loans. The default read loan cannot mutate even if the caller's binding is mutable.
- `consume(take! owner)` requires a `take!`-marked **consuming formal**. The caller owner is invalidated upon transfer. Neither the callee nor overload resolution may silently treat a bare `T` formal as consuming.
- `copy! owner` is a **shallow** copy with a verified `Copy`/`Copyable` witness. A fresh identity-bearing root must not duplicate uniquely owned mutable children; reject illegal aliasing. `copy!! owner` is an explicit **deep** copy with a separate `DeepCopyable` proof. `share! owner` remains an explicit independently proved shared-ownership action. No one of these is inserted by an ordinary call.
- Multiple read-only loans of the *same place* may coexist. A mutable loan excludes **all** overlapping read and write loans, including those from a different alias, field projection, receiver, argument, closure, checked pointer, callback or async continuation. Use place-sensitive liveness/last-use and reborrowing only when provenance is proved; do not assume lexical blocks or call returns automatically erase escaped loans.
- Resolve effects, generics, overloads, receiver identity, argument evaluation order, named/default arguments, and each lifetime edge in typed frontend/MIR **before** backend lowering. A virtual/FFI/unknown callee must prove read/write effects and nonescape or reject. Actor state remains sealed; `await`, `select`, actor transport, cancellation and exceptions need pinned/cleanup/outlives proof. Any missing proof fails closed **without generating a guest artifact**.
- A borrowed-local `Pointer<T>` is a compiler-minted non-owning handle, **distinct** from an implicit loan and from the owning `CheckedRef<Class>` prototype. `rt ref local` may mint a checked local lease, `rt deref ptr` safely reads while live, and `rt unref ptr` consumes that lease and returns `void` (never frees the local). An owning `Pointer<T>` region has separate `close`/drop rules; `CheckedRef<Class>` may have an ownership-restoring `rt unref` according to its distinct type. No implicit handle copying or raw address syntax.


### Java-style zero-payload-copy calls with checked rights (TARGET)

The ordinary nonprimitive call `inspect(obj)` passes a **temporary read-only loan to the original allocation**, analogous in cost to Java passing a reference value, but unlike an unrestricted Java mutable alias. The callee gets no new object identity or ownership; no payload graph copy, clone, implicit share, refcount promotion or additional destructor is permitted. ABI lowering MAY copy an offset, pointer-sized word or register/spill **representing** that loan, without minting a second owner. A small reference-word transfer is not an object `copy!`. Argument call sugar never creates a user-visible `Pointer<T>`.

- `inspect(obj)` and `inspect(borrow! obj)` have equivalent loan rights and provenance; `obj.inspect()`, virtual/interface/generic receivers and nested synchronous calls must preserve this. `inspect_pair(obj, obj)` may hold two simultaneous read loans to the same place; no clone is performed.
- `write(mut obj)` or `write(borrow! mut obj)` is an **exclusive write-through** loan only if the writable formal effect is sealed and statically proven. It mutates the caller's original allocation. `write(obj)` cannot silently promote read access to write. The first argument's loan remains active while later arguments are evaluated: `f(mut obj, obj)`, `f(obj, mut obj)`, and `f(mut obj, mut obj)` must fail before emission when their proven place projections overlap.
- `take! obj` explicitly transfers ownership (caller invalidated). `copy! obj` produces a verified shallow copy; `copy!! obj` produces a separately verified deep copy; `share! obj` requires a separate sharing proof. Plain arguments, methods, receiver lookup and return lowering MUST NOT insert any of these. Primitive scalar and proven inline-value ABI passing remain by-value; the no-copy rule concerns nonprimitive/reference-backed object **payloads**, not machine register movement.
- An assignment such as `val alias = obj` MUST NOT silently create a second independently droppable owner or duplicate the object graph. Until the binding rule establishes a checked scoped alias or a separately specified affine move, ambiguous binding must fail closed. An implicit read-only parameter cannot return an independently owned `T`, store a borrow into an unbounded field, or detach it to a task. A `Borrow<T>` result must carry a proven origin/outlives relation; an owned return requires proved explicit transfer.
- Passing a unique `Pointer<T>` to an ordinary readonly formal passes a **loan of the pointer capability**, not a cloned or transferred handle. The callee cannot `rt unref`, `close()`, `take!`, return or retain that pointer as an owner. Under a separately supported consuming-formal contract, `take! ptr` may transfer the unique handle with all-path cleanup; the old binding becomes invalid. Copying pointer bits for ABI delivery does **not** create a second independently releasable token. `copy! ptr` and `copy!! ptr` reject even when the pointee type has copy traits. Independently minting multiple read leases with `rt ref local` is distinct from duplicating one linear handle.
- `rt deref ptr` of a Copy primitive yields a primitive value; for a non-Copy referent it grants a bounded checked view, **not a copied referent**. The read-only lease cannot be upgraded to write authority. `rt unref ptr` of a local borrowed pointer consumes that lease exactly once, does not free the original local and returns `void`. Owning-region `Pointer<T>` requires its own close/drop protocol. The separate `CheckedRef<Class>` ownership-restoring `rt unref` must not be confused with either form.
- A compact actor-local `Ref32` can move as a 32-bit ABI word but is **not** an unscoped physical address: origin actor, actor incarnation, domain, allocation generation, bounds, alignment, type and authority must still be checked in typed IR/runtime sidecars. Numeric equality of handles from different actors grants no access. `Pointer<T>` is never actor/network `Sendable` or `Serializable` by inheritance from `T`.
- Before emission, validate non-escape, alias last use, receiver identity, argument evaluation order, dynamic callees, FFI, exceptional/cancellation cleanup, suspension and actor critical sections. Unknown effects or unproved provenance fail closed with **zero emitted guest artifact**. Host structural fixtures alone cannot certify guest soundness.

~~~atto
fnc read(Document d): int { return d.version; }
fnc write(mut Document d): void { d.version += 1; }
let mut doc = make_document();
val before = read(doc);  // uses same allocation; no payload copied
write(mut doc);         // modifies original; no clone
val after = read(doc);
val other = copy!! doc; // a new graph is explicitly requested
// write(doc);          // E_BORROW_MUT_REQUIRED
// f(mut doc, doc);     // E_BORROW when argument loans overlap
~~~

**Conformance admission (TARGET, not guest-verified):** check unchanged allocation identity, no additional guest object-payload allocation, alias/loan exclusion, readonly mutation rejection, pointer token non-Copy/non-Send, local all-path release, borrowed return outlives, actor numeric-handle collision and no-artifact negative diagnostics across every backend. Host/ABI register copies are not object cloning.

Illustrative compiler acceptance/rejection **targets**, not executed guest evidence:

```atto
fnc inspect(Document d): int { return d.version; }
fnc modify(mut Document d): void { d.version += 1; } // explicit exclusive-writer formal
fnc consume(take! Document d): int { return d.version; }

let mut doc = make_document();
val a = inspect(doc);             // shared readonly loan; doc remains owned
val b = inspect(borrow! doc);     // same permissions and proof as inspect(doc)
modify(mut doc);                  // exclusive writable loan if no readers live
val copy = copy! doc;             // verified shallow Copyable copy
val clone = copy!! doc;           // verified deep DeepCopyable copy
val owned = consume(take! doc);   // ownership moved; doc now invalid
// inspect(doc);                  // E_MOVED
// modify(doc);                   // E_BORROW_MUT_REQUIRED
// consume(doc);                  // E_OWNERSHIP, explicit take! required
```

Mandatory negative compiler gates include read+write overlap, two mutable loans, writes under a read loan, use-after-take, owner drop/close with a live loan, escaping returned/retained borrow, forged `Pointer<T>`, double `rt unref`, `rt deref` after `rt unref`, stale generation and cross-actor pointer leak. The standard is **real compiler + executed guest tests** on exact backend heads, not parser-string or reference-model checks.

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
val checked_handle = rt ref owned_for_handle;
block {
  val checked_view = rt deref checked_handle;
  inspect_readonly(checked_view);
}
val returned_owner = rt unref checked_handle;
```

### Checked-handle lexical block and borrowed callable boundary (TARGET / browser Rust prototype)

The canonical scoped statement is **`block { ... }`**, not a bare `{ ... }` statement. Callables such as `fnc main() -> void { ... }` retain their existing braced-body syntax; the `block` keyword creates a separate, explicit **nested lexical scope**. The checked view returned by `rt deref` must end at that scope's exit. An `rt unref` that would consume the handle with any live view (including on an exceptional or suspension path) is invalid.

The first browser Rust/Wasm compiler prototype proposes an explicit borrowed class parameter contract, `fnc inspect_readonly(borrow! Payload item): int`. It is not a general new `Pointer<T>` or transferable capability and is **not yet tested as compiled guest behavior**. The call site remains `inspect_readonly(view)`; the callee's parameter is a readonly, nonescaping loan with no ownership transfer. **Reconciled ownership target:** ordinary nonprimitive `fnc inspect(Payload item)` parameters are read-only implicit borrows, with the same restrictions as `fnc inspect(borrow! Payload item)`. A consuming parameter instead requires an explicit `take! Payload item` formal and `take! owner` at the call site. The older checked-handle compiler prototype's by-value class-parameter move is a *legacy restricted implementation*, not the intended language default. Both forms must reject unsupported view-to-owner conversions; neither may turn a borrowed view into an independently owned class. The compiler MUST not let a borrowed parameter escape as a result, owned field, owned argument, suspended continuation, actor message, or closure; it MUST reject mutations through the loan. Nested synchronous calls with explicitly borrowed parameters may preserve the same loan while its caller's `block` stays active.

```atto
fnc inspect_readonly(borrow! Payload item): int { return item.value; }

val original = make_payload();
val handle = rt ref original;
// original has moved

block {
  val view = rt deref handle;
  inspect_readonly(view);
}

val restored = rt unref handle;
```

Other backends MUST fail closed until the same parameter/loan provenance and runtime lifetime guarantees are implemented and tested. The initial browser profile only admits named local class values, synchronous top-level functions and explicit `val` handle/view/restore bindings; that restriction is an implementation gate, not a limit on the eventual language contract.

For `copy!foo`, the scanner must recognize `copy`, `!`, `foo` with a context-sensitive ownership-prefix parse; `!` is not part of the identifier. These are **TARGET semantics**, not a claim that every backend currently compiles the new spelling. In particular, mutable borrowing still requires an addressable writable place, shared ownership still requires explicit authority and the immutable/frozen proof, and `take!` never permits later use of a moved place.

```atto
val packet = make_packet()
val owned = take! packet
// using packet here is a compile-time use-after-move error
```

Borrow checking is not optional for a native backend. Aliased writes, use-after-take, escaping stack borrows, double-drops, stale actor references, and mutable aliases crossing isolation domains MUST be rejected or safely represented with explicit runtime guards, never silently trusted.

### Loan-preserving procedural `do if` (TARGET / checked Rust-browser profile)

A conditional over live checked-handle loans uses **`do if ... then ... else ... fi`** as its preferred procedural spelling. Every reachable arm must preserve the outstanding checked handle and all live immutable views, and no branch may skip the required post-scope `rt unref`. Branches are admitted only when every reachable call preserves the checked view's loan rights and cleanup. An ordinary `Class` parameter is a readonly implicit loan in the target language; the legacy prototype that moves a plain class formal must be version-gated or reject, not silently treated as conformant. A consuming `take! Class` parameter MUST reject a borrowed view.

```atto
fnc inspect_readonly(borrow! Payload item): int { return item.value; }
fnc inspect_other(borrow! Payload item): int { return item.value; }

fnc get_payload(bool condition): Payload {
  val original = make_payload();
  val handle = rt ref original;
  block {
    val view = rt deref handle;
    do if condition then
      inspect_readonly(view);
    else
      inspect_other(view);
    fi
  }
  val restored = rt unref handle;
  return restored;
}
```

The initial Rust/browser prototype adds a bounded, path-sensitive **type-admitted source-to-CFG bridge** to the canonical borrow-checker model, with explicit `Ref`, `Deref`, scope-end `EndView`, `Unref`, `Exit` and conditional edges. This is a precursor to general typed-MIR certificates; it is not a complete NLL/Polonius implementation and does not permit unchecked loops, unverified effects, suspension or cross-actor handle transfers. Implementations without corresponding compiler/runtime proof MUST fail closed.

### Checked-handle exceptional-call gate (current Rust/Wasm prototype)

The eventual language contract requires all-path retirement, including exceptional and cancellation exits. The current compiler does **not** yet have typed unwind/drop edges for checked handles and therefore must reject code that could bypass a required `rt unref`. This includes transitive calls to known `throw`/`raise`/early-exit callees, even when the immediate caller contains no explicit failure statement. Unknown effects and suspendable calls must fail closed until their cleanup and lifetime proofs are available.

An independent bounded CFG proof prototype in `atto-borrow-checker.rs` tracks distinct handle/loan facts across branch joins and rejects missing cleanup on any path, including abrupt exits. This oracle is **not wired into compiler typed MIR**, and it does not yet establish runtime reclamation, actor-domain validity, or five-backend parity. Until native and Wasm guest tests run, the Rust frontend's straight-line checked-handle profile remains draft.

