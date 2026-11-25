# Fresh object return types — candidate v1

**Status: normative candidate, not implemented by Java/LLVM/.NET compilers.** This refines fresh identities used by [Copyable shallow/deep v2](copyable-ownership-v1.md). The revised copy! is shallow and copy!! is deep; prior deep-by-default copy! text in historical discussion is superseded.

## Surface syntax and intent

```atto
// Correct for a proven stateless concrete class: new identity, full logical copy.
define class Foo as
    @Override
    copy(): new Foo {
        return new Foo();
    }
end

fnc make_foo(): new Foo {
    return new Foo();
}

// Proposed additional exclusivity refinement:
fnc make_owned_foo(): new unique Foo {
    return new Foo();
}
```

* `Foo`: may return `self`, a parameter, an old cached object, or a newly allocated object.
* `new Foo`: the **returned object's logical identity was created during this invocation**, and was not a live object before the invocation began. A fresh object may already have been published to another owner, so this alone **does not guarantee exclusivity**, deep-copy safety, or non-aliasing to its own child objects.
* `new unique Foo`: `new Foo` **plus** exclusive mutable ownership at the handoff to the caller. The implementation must prove that no independent accessible owner/alias remains and that all owned mutable reachable objects satisfy the isolation contract. Immutable shared data can be retained where a sound lifetime/share proof exists.
* `Foo & !self`: a possible future relational predicate, **not a freshness guarantee**. An old cached Foo other than self would satisfy it. Do not adopt `& !self` as a substitute for `new Foo`.

A `new` return **type qualifier** is distinct from the `new Foo()` **expression**. It is parsed only in a return-type position, after an existing `:` or `->` return-type introducer. Prefer `copy(): new Foo`. Where both callable return introducers are supported, `copy() -> new Foo` is equivalent; parenthesizing the type `(new Foo)` does not change its meaning. No change to constructor parsing or ordinary expression grammar. `new int` and other scalar/no-identity types are invalid (`E_FRESH_TYPE`); ordinary value copying retains the existing `Copy` rule. Valid targets are an identity-bearing class, `Self`, or an identity-bearing generic type whose bound proves the necessary capability; abstract/erased targets require runtime concrete-type and verified allocation witnesses.

## Static freshness proof

Freshness is **relative to one invocation**, not pointer-address inequality. Allocator address reuse after deallocation is permissible if logical identities differ. Tracking object addresses, `!= self`, or running a runtime identity assertion is not a substitute for proof.

The type/ownership checker MUST track an allocation-provenance refinement alongside the normal resolved type and ownership qualifier:

* `new Foo()` creates a fresh logical object identity. Moving or renaming its local reference preserves that provenance; assigning an old reference, `take!`, borrowing, casting, or selecting a different value cannot create freshness.
* Every normal return edge of a `new T` function/method must return a proven fresh object with a compatible concrete dynamic type. Branches, loops, early `return`/`^`, `guard` exits, `match`, `try` and deferred returns must all be checked. Mixed fresh/old or unknown paths fail. Exiting by throw/raise/panic does not return an object and has no successful-result obligation.
* An ordinary call yields fresh provenance only if the resolved target has a **verified** `new T` return contract. Every reachable override/dynamic target must uphold that contract. Import metadata, generic instantiations, trait witnesses, AOT dispatch tables and foreign ABI lowering must preserve it; unknown or untrusted foreign declarations fail closed.
* `new T` is not a statement that an allocation must occur directly inside the current syntactic method. It may return an object made by a verified helper **during this call**. It may not return an object allocated earlier, even one moved into the function with exclusive ownership.
* A fresh object may acquire non-exclusive aliases without losing freshness; such a value ceases to qualify for `new unique T`. For uniqueness, enforce no ownership leakage across publishing, capture, field stores, actor domains, callback reentrancy, or suspension; temporary nonescaping borrows are acceptable only once ended.
* An abstract analysis that cannot prove a return path's provenance or ownership MUST reject it. The compiler must not silently weaken `new T` to `T`.

Subtyping: `new T` may be used where `T` is expected (forgetting provenance), but not vice versa. `new unique T` may weaken to `new T`, then to `T`. Refined return contracts may be strengthened but not weakened by overrides, trait implementations, or exported ABI changes. A fresh result is not automatically a deep copy.

## Copyable / DeepCopyable reconciliation (2026-11-17)

For identity-bearing objects, the compiler-generated methods are **copy(): new Self** and **copy_deep(): new Self**, each admitted under separate Copyable<Self> and DeepCopyable<Self> capabilities. Root Object exposes guarded method names, but does not grant every object an unconditional copy witness.

- **copy! x / x.copy()** produces a freshly allocated root of the exact concrete subtype, copies immediate stored fields, and may retain nested references only with a verified share/lifetime capability. Freshness does **not** make its entire mutable graph unique: a shallow copy may deliberately share a mutable child with the source.
- **copy!! x / x.copy_deep()** produces a fresh root and a recursively detached mutable graph, preserving repeated aliases/cycles through one hidden graph context where verified. Immutable backing may be safely shared. Root freshness alone is not proof of deep separation.
- Neither method accepts user-visible arguments. A hidden graph memo/arena argument inside compiler-generated deep-copy lowering is not part of its public signature or caller syntax.
- **new unique Self** requires strictly stronger full ownership proof than new Self. Never assume the shallow copy with shared children can satisfy the unique refinement merely because the root is new.

A user override must establish the corresponding *mode-specific* complete copy contract. It may call the reserved nonvirtual synthesized baseline **super.copy()** or **super.copy_deep()** exactly once, or use separately compiler-proven complete direct construction. A stateless concrete Foo returning new Foo() can satisfy either mode. Returning a fresh object while dropping state, reusing an exclusively owned child, or returning a different dynamic subtype is not sufficient. Dynamic dispatch, trait witness tables, exports and Native AOT metadata preserve both copy capabilities and the new Self return provenance.

~~~atto
// Ordinary fresh result; not automatically a copy witness.
fnc make_foo(): new Foo { return new Foo(); }

// Shallow customization: only if immediate child aliases are legal.
@Override
copy(): new Self {
    val mut Self result = super.copy();
    result.rebuild_shallow_cache();
    return result;
}

// Deep customization shares compiler-hidden graph context.
@Override
copy_deep(): new Self {
    val mut Self result = super.copy_deep();
    result.rebuild_deep_cache();
    return result;
}
~~~

For a generic user-written Copyable<T> or DeepCopyable<T>, the result is kind-aware: new T for identity-bearing object types, ordinary T for scalar/identity-free types. This is a compiler-level refinement, not an illegal promise that new int allocates. A class that cannot be shallow-copied due to a unique child can still be DeepCopyable if the deep duplication plan is proven.

## Diagnostics and acceptance

* `E_FRESH_TYPE`: target lacks identity, dynamic subtype mismatch/slicing, or unsound return-type refinement.
* `E_FRESH_UNPROVEN`: `self`, old cache/parameter, unverified foreign/helper, cast laundering, ambiguous branch, or unverified dynamic dispatch.
* `E_FRESH_NOT_UNIQUE`: value was published/shared or retains aliases inconsistent with exclusive ownership.
* `E_FRESH_MISSING_RETURN`: a normally completing path does not yield an appropriate result.
* `E_COPY_OVERRIDE`: the existing strict Copyable protocol has no synthesized baseline, duplicates it, or returns a different object.

Compiler-backed positive/negative fixtures MUST cover constructor, local alias/move, verified helper, return/control-flow paths, self/parameter/cache, type erasure, virtual dispatch, ownership transfer, shared-child versus unique ownership, both `copy!` and `copy!!`, and the distinct `super.copy()` / `super.copy_deep()` hooks. Report Java, LLVM, and .NET results separately at exact SHA and do not count a host reference oracle as compiled guest evidence. Native AOT / isolated tenant-VM semantics remain separate gates.

**Migration:** existing copy(): Foo source may continue to compile as an *ordinary method*, but MUST NOT be treated as a verified Copyable witness without checking the new shallow contract. Existing deep-copy implementations must migrate to copy_deep() if they intend deep semantics. Existing stateless direct-constructor copy methods may be upgraded once type/provenance checking proves them; stateful methods require a full copy plan, not a signature-only upgrade. No silent ABI break or unverified implicit upgrade.
