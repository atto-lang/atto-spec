# Explicit typed pointer methods — v2 candidate

Status: TARGET, additive to [v1](pointer-aot-safety-v1.md). No new method is certified by this document. Do not change existing v1 read-only local lease semantics, widen rights, or accept raw address syntax. Unary address-of and dereference are forbidden; binary multiplication and bitwise AND retain their existing grammar. No pointer member arrow. All new public method names are snake_case.

## Types and authority

Pointer<T> remains an invariant, opaque, compiler-known capability. Separate typed IR authority for BorrowedLocal(read), OwnedRegion(read/write/own), and bounded BorrowedRegion(read or exclusive write). A view is non-owning, lifetime-bound, not Copy/Clone/Sendable/Serializable, cannot close an allocation, and cannot grant rights absent in its parent. Surface view type proposed: PointerView<T> with compiler-tracked access. No implicit raw-address conversion or arbitrary reinterpretation. Use Option<Pointer<T>> for absence. CheckedRef<Class> remains separate. Existing ref!/deref!/unref! semantics are unchanged; contextual Pointer<T> type must resolve ref! unambiguously. Do not infer new BorrowMut<T> spelling from this document: scalar mutable loans use existing borrow! mut semantics with parameter representation finalized separately.

## Candidate signatures and effects

All fallible signatures below use Result<value, PointerError> as the proposed uniform contract; allocation failure, bounds, alignment, uninitialized slots, stale generation and invalid access have stable typed error categories. Statically provable violations must reject before an artifact exists. A backend without a method's complete typed contract must reject it, not lower to an unsafe host operation.

| Method | Result on success | Contract |
| --- | --- | --- |
| Pointer.alloc<T>(count) | Pointer<T> | unique owner; checked count/size; initially uninitialized slots; no arbitrary addresses |
| Pointer.alloc_value<T>(take! value) | Pointer<T> | allocate one initialized element; ownership moves only after successful allocation |
| p.len() | index-sized unsigned count | element extent, not bytes |
| p.size_bytes() | index-sized unsigned count | checked extent times target-specialized layout |
| p.is_empty() | bool | zero element extent |
| p.read() | T where Copy | exactly one element, initialized, readable; alias of checked read_at(0) only for singleton |
| p.write(value) | void | exactly one element, writable; same write_at semantics |
| p.read_at(index) | T where Copy | copy initialized value; never clone a pointer capability |
| p.write_at(index, value) | void | initialize empty slot or replace initialized slot; consumes non-Copy input on success only; old drop exactly once |
| p.replace_at(index, value) | T | requires initialized slot; exclusive owner authority; return old element by move, no drop of old element |
| p.borrow_at(index) | scoped read loan of T | non-Copy supported; cannot outlive source |
| p.borrow_mut_at(index) | scoped exclusive loan of T | initialized element, no conflicting loans; writable authority |
| p.take_at(index) | T | unique owning region only; move and mark slot uninitialized; never through view |
| p.slice(offset, count) | PointerView<T> | bounded readonly view; checked half-open range; zero length permitted |
| p.slice_mut(offset, count) | PointerView<T> | bounded exclusive writable view; no conflicting overlapping loans |
| p.fill(value) | void | Copy elements only; initialized old elements dropped as required; check whole range before effects |
| p.copy_from(source) | void | Copy elements only; equal extent, initialized source; nonoverlap required (distinct overlap-safe operation may be specified later) |
| p.swap_at(i, j) | void | both initialized, exclusive authority; identical indices valid no-op; no copying or dropping moved values |
| p.same_location(other) | bool | checked identity of live region generation, domain and element offset; no address exposure or automatic ordering/hash |
| p.close() | void | unique owner, no live views/loans; deterministic drop of initialized slots and exactly-once reclamation |

Index/count use a nonnegative, target-representable integer; concrete portable index type must be resolved in common IR before implementation. Metadata methods also require live authenticated authority and may fail if dynamically stale; no raw address leaks. Read-only local handles retain v1 deref/unref; proposed read() may delegate to deref only after a separately verified method admission for that authority. No write methods on read-only local handles. Views expose only appropriate metadata, read, write, element borrow and subview methods; never owning close/take/replace. For all borrowing results the type checker records source place, region, range and lifetime, not merely a nominal wrapper. View release is scoped and all-path proved; no implicit widening or promotion to owner.

Validate all relevant checks before observable effects. For a failed allocation or store, inputs remain owned by caller unless a separately specified consuming failure contract exists. For fallible destructor effects, require the common cleanup/unwind profile before admitting the affected element type; never promise transactional rollback after a destructor ran. No unchecked integer arithmetic, fabricated pointer handles, implicit bitcasts, or partial initialization leaks. Multi-element writes preflight all ranges and rights; element types with unproven drop semantics are unsupported. Conservative whole-region loan exclusion is a correct initial implementation; accepting disjoint mutable slices requires an interval proof, including reborrows and exceptional edges.

## Illustrative source targets (not compiler-certified)

```atto
pub fnc main(): int {
    let value: int = 42;
    val Pointer<int> p = ref! value;
    val answer = deref! p;
    unref! p;
    return answer;
}
```

```atto
pub fnc memory_example(): Result<int, PointerError> {
    let cells: Pointer<int> = Pointer.alloc<int>(4)?;
    cells.fill(0)?;
    cells.write_at(2, 42)?;
    val answer = cells.read_at(2)?;
    cells.close()?;
    return Ok(answer);
}
```

The second example requires all-path owned-region cleanup even if ? exits early. Do not admit it until that proof is implemented. No new syntax for mutation of a read-only ref! lease. Nested Pointer<Pointer<T>> requires non-Copy element loans, stable lifetime and explicit ownership transfers; deref must never duplicate the inner token.

## Systems-programming profiles still required

- Local scalar mutable borrow, field/element projections, nested pointer slots, output parameters: typed loans, explicit mutation and lifetime proof, not raw address-of. Use ordinary borrow-by-default for object call arguments where supported.
- Persistent links: arena-backed generational handles, checked node lookup, explicit roots and deterministic reclamation for cycles; local pointer escape prohibited. Unique-owned trees and shared graphs have different authority contracts.
- Foreign memory and C ABI: separate privileged FFI profile for bounded, aligned, pinned foreign regions, explicit direction, ownership/release callback and lifetime; no raw numeric addresses in ordinary Atto source, no portable ABI claim on targets lacking it.
- Atomic reference operations: separate AtomicPointer<T> candidate with explicit load/store/compare_exchange, ordering and reclamation policy; no duplicated linear ownership from atomic load and no inferred thread safety.
- DMA, volatile/MMIO and mapped files: separate target capability APIs with bounded regions, explicit device or mapping lifetime, volatile ordering, pinning and permission checks; no unrestricted address arithmetic. Unsupported targets reject explicitly.
- Allocation-free local references and borrowed calls; native direct load/store or Wasm checked offsets when proofs allow. No mandatory wrapper allocation, tracing GC, runtime compilation or unchecked alias metadata.

## Acceptance matrix (target cases, NOT_EXECUTED)

Each case must be compiled through the real frontend/type checker/IR/backend and executed where positive. Rejections must produce no new executable artifact and preserve caller-owned prior outputs. Test the same source bytes and expected semantics across every atto-source.* compiler; platform-only profiles require explicit supported/unsupported reporting. Host-model success does not count as guest evidence.

| ID | Acceptance |
| --- | --- |
| PM-001 | singleton alloc_value/read/write/close returns 42 |
| PM-002 | fill, indexed read/write, metadata and zero-size behavior |
| PM-003 | copy_from, swap and replace preserve expected values |
| PM-004 | non-Copy element borrow, move-out, reinitialize and exactly-once drop |
| PM-005 | readonly view and nested view bounds; zero-length end slice |
| PM-006 | exclusive view writes visible after release; proven disjoint slices |
| PM-007 | mutable scalar in/out call; caller sees change, no wrapper allocation |
| PM-008 | nested pointer loan, no inner capability copy, ordered release |
| PM-009 | checked same_location, distinct allocation/generation inequality |
| PM-010 | early return, ?, exception and supported cancellation clean owned regions once |
| PM-011 | reject unary pointer operators, raw casts and forged capabilities; binary operators still work |
| PM-012 | reject readonly write, view close/take, aliasing write and overlapping mutable loans |
| PM-013 | reject dangling view, double release, move while borrowed and cross-domain escape |
| PM-014 | reject non-Copy reads/fill/copy, uninitialized read, unsupported generic layout |
| PM-015 | contain dynamic negative/overflowing counts, bounds, alignment, stale generations, allocation failure |
| PM-016 | copy overlap and extent mismatch rejected before effects; caller retains failed-store value |
| PM-017 | deterministic partial-init cleanup and drop count under failures |
| PM-018 | typed FFI/out parameter, pin/DMA/volatile and atomic profiles require independent admission |
| PM-019 | no implicit capability clone, address ordering/hash or network serialization |
| PM-020 | exact-head native optimized and sanitizer guest, Wasm guest and target-specific AOT proof; no runtime compiler |

Require source/head/tree and compiler/artifact digests, actual executed steps, guest results and independent negative rejection receipts. Keep current v1 conformance in force. Add these as target-only records to the shared conformance repo before promotion; do not mark any backend PASS on the basis of this document.

## Common lowering and acceptance integration

The target inventory is now tracked by [conformance #631](https://github.com/atto-lang/atto-platform-conformance/pull/631): 20 operation effect rows and 20 case categories across eleven backends, all NOT_EXECUTED for guest evidence. The inventory is not an acceptance receipt.

A success-conditional ownership argument is not an ordinary eager take! evaluation: until a typed transactional call effect and a failure-path owner location are specified in common IR, reject alloc_value/write_at/replace_at of non-Copy values rather than silently consuming or duplicating them. The initial executable profile may restrict these to Copy elements. For fallible cleanup, the caller must not regain an already-dropped element. A view cannot close the source region and cannot perform owner-only take_at/replace_at. Readonly ref! local leases continue to require explicit unref! on every admitted exit until a separately verified cleanup profile exists. The same_location operation compares live region generation/domain/offset, not content or raw address; stale inputs fail rather than returning an arbitrary equality result.

## Borrow-by-default for all function and method boundaries

The language default for nonprimitive object arguments to fnc and mtd is a scoped readonly borrow; it is not an opt-in language semantics switch. The existing [borrow-default migration profile](implicit-argument-borrow-v1.md) remains a staged implementation mechanism only. Unmigrated compiler paths must not silently move an object under the new contract.

An ordinary Pointer<T> or PointerView<T> formal borrows the existing capability, not its ownership or a fresh capability token. Explicit Borrow<T> and borrow! spellings have equivalent read-loan facts. For a writable formal the caller must request an exclusive loan with mut or borrow! mut; the callee must have a proven write effect. The same rule applies to instance method receivers (including implicit this), static method arguments and synchronous local actor methods; remote actor messages use their separate transfer rules.

| Call shape | Typed effect |
| --- | --- |
| inspect(p) / inspect(borrow! p) | BorrowRead; caller retains unique owner |
| update(mut p) / update(borrow! mut p) | BorrowWrite; caller retains unique owner |
| p.read_at(i) / p.len() | BorrowRead receiver; no capability duplication |
| p.write_at(i, v) | BorrowWrite receiver, subject to existing source rights |
| p.take_at(i) / p.replace_at(i, v) | exclusive receiver loan plus owner-only element authority; no region-owner transfer |
| p.slice(i, n) / p.slice_mut(i, n) | readonly/exclusive child loan tied to receiver lifetime |
| p.close() / unref! p | explicitly consuming receiver/operator; not admitted through a borrowed formal |
| consume(take! p) | explicit consuming formal and caller move; no automatic move from ordinary call |

For method calls, the receiver expression is evaluated once; the statically sealed receiver effect determines read, exclusive write or explicit consuming access. No method may upgrade a readonly local ref! lease, and no borrowed formal or view may close, unref, retain or export the underlying owner's token. A borrowed receiver with a proved mutable region loan may mutate elements but owner-only element take/replace require additional authority explicitly carried by the loan; no implicit promotion.

All call loans include subsequent argument evaluation, nested calls and all normal/exceptional exits; borrowed results are tied to the originating receiver or formal. Reject unproved suspension, escape, rebind, callbacks, alias conflicts, and unknown external effects. For primitive value scalars the ordinary call remains by value. No automatic Copy/Clone/Sendable/Serializable for Pointer<T>. No heap wrapper, refcount or allocation merely to pass a borrow; backend ABI moves of a handle are not semantic copies.

Target tests: implicit/explicit readonly calls are equivalent; mutable argument forms equivalent; read-only write and borrowed close/unref rejected; owner still usable after non-consuming call; receiver evaluation exactly once; conflicting argument/receiver loans rejected; returned view cannot outlive owner; primitive ABI unchanged; unsupported method or actor crossing rejected. These are target cases, not claims of executed compiler support.
