# AttoLang ownership vocabulary v1

**Status: TARGET specification; browser subset and Rust model only.** Syntax
admission is not proof of complete native guest runtime implementation.

| Spelling | Meaning | Proof obligation |
| --- | --- | --- |
| borrow! value | Explicit scoped shared read loan | No overlapping mutable loan |
| borrow! mut value | Explicit exclusive mutable loan | One writer, no shared readers |
| take! value | Transfer unique ownership | Old owner invalidated; no loans |
| share! value | Shared ownership of transitively frozen data or an explicitly guarded synchronization container | Unique writable capability consumed; no direct shared mutation |
| copy! value | Shallow/value-copy operation | Copy or equivalent proven type trait |
| copy!! value | Deep clone into separate object graph | Fresh nested allocations; preserve cycles/internal alias topology |
| mut | Mutable binding/referent qualifier | Must not bypass exclusive borrows |
| lt! a | Named lifetime binder | Name is a plain identifier, not a runtime value |
| lifetime! a | Long-form lifetime binder alias | Canonical formatter spelling lt! a |
| Borrow<T, lt=a> | Reference with named lifetime | Owner outlives named region |
| freeze! take! value | Consuming deep-immutability conversion | No surviving mutable alias or interior mutability |
| weak! shared | Non-owning reference | Atomic upgrade gives Option<Shared<T>>; generation and domain check |
| pin! take! value | Fix pointee storage address | No relocation; not OS-thread pinning |
| drop! value | Consume owner/release resource | No double-drop, live borrow, or unverified destructor |

## Deep copy versus shallow copy

copy!! must not use the shallow clone of the root pointer. For an object
graph, use a bounded source-to-destination identity table. Repeated references
and cycles in the source graph map to the SAME cloned destination node, but
they must not point back into the source graph's mutable storage.

Validate the graph, type provenance and domain before admitting clone. An
unknown foreign pointer, external mutable alias, interior-mutability escape,
unsupported dynamic type or unbounded allocation fails closed. Failed clone
must roll back all partial allocations and leave the original owner usable.
For primitive immutable values, copy!! can be an independent value copy.

## Lifetimes and implicit borrowing

Named binders use lt! a, NEVER Rust-style apostrophes. They can appear in
generic signatures and are referred to using named lifetime arguments:

~~~atto
// TARGET grammar: not yet executable in the browser compiler.
fnc read_first<lt! a, T>(Borrow<T, lt=a> value) -> T
~~~

For nonprimitive callable arguments, an unadorned parameter implicitly borrows
at the call site. No explicit Borrow<T> or borrow! token is needed in the
ordinary case. Explicit borrow! is still useful for disambiguation; mut requests
an exclusive mutable loan. The compiler must prove the owner outlives each
loan, track escaped closures/returns, and fence cancellation and suspension.

Pinning alone cannot make a live borrow safe across await or actor retirement:
continuation ownership and deterministic cleanup need separate proofs.

## Resource release and shared ownership

drop! is a consuming *statement*, not a function returning an owned value.
The old owner becomes unusable immediately, and active loans prohibit release.
A resource-owning value must run an authenticated destructor and reclaim its
allocation exactly once, including on checked exceptional/cancellation paths.
Until those runtime paths exist, a backend must reject resource-owning drop!
rather than implement a successful no-op. Scalar drop! can invalidate a local
without any heap destructor.

share! and freeze! are distinct operations with complementary effects: share!
must prove transitively frozen ordinary reachable data before publication,
consume any original unique writable capability, and retain the same allocation
on shared-to-shared duplication. freeze! can produce a frozen unique owner
without creating shared ownership. Neither operation can upgrade a temporary
read-only loan into shared ownership or bypass actor/tenant admission. Writes
through shared handles are forbidden except through explicit, independently
verified synchronization guards (such as trusted RwLock<T>) protecting interior
mutable storage. A frozen owner still needs domain-specific Share/Send/Sync
proof and tenant admission.

## Backend status and conformance gate

The Rust browser compiler (atto-source.rs PR #344) accepts primitive ownership
operations, including contiguous copy!! and scalar drop!; object-graph cloning,
resource destruction, weak/pin lowering and named lifetime generics still
reject until verified guest execution exists.

The canonical borrow checker (atto-borrow-checker.rs PR #43) models ownership
events for move, shallow/deep copy, borrow, freeze, shared publication, weak
probes, pin and drop; its host-only implementation supplies bounded cyclic
graph clone, immutable graph freeze, Arc/Weak upgrades, Pin<Box<T>> storage,
and a conservative lt! lifetime constraint checker.

Java, LLVM, .NET, Forge and Wasm backend implementations are NOT VERIFIED.
A passing host model or documentation test cannot establish native guest
behavior. Require exact-head source-to-typed-IR-to-machine/Wasm differential
tests, actor and tenant isolation, cancellation cleanup, sanitizer/equivalent
evidence, and honest unsupported gates.

See also attolang-language-spec.md PR #81 and atto-platform-conformance PR #76.

## Minimum negative regressions

1. Copy versus deep copy with non-Copy objects, repeated child aliases and cycles
2. Deep-copy independence under subsequent source and clone mutation
3. Use-after-take, use-after-drop, double-drop and release while borrowed
4. Graph freeze from live alias, unsafe exterior pointer or mutable cell
5. Weak upgrade after retirement, wrong-region permit or recycled generation
6. Pin relocation prohibition, with handle moves and cross-thread transfers
7. lt! lifetime shadowing, dangling outlives, unknown binder, and unsafe escape
8. Borrow conflict among implicit/shared/mut accesses across repeated CFG arms
9. Parse copy!! as adjacent bangs, not copy! plus unary boolean not
10. No success-shaped backend output for unimplemented heap/actor operations

These regressions are required even if native CI minutes are unavailable;
NOT EXECUTED is never equivalent to PASSED.
