# Fresh object return types — candidate v1

**Status: normative proposal, not implemented by Java/LLVM/.NET compilers.** This extends [Copyable v1](copyable-ownership-v1.md), rather than replacing its deeper graph/ownership requirements.

## Surface syntax and intent

```atto
define class Foo as
    @Override
    copy(): new Foo {
        val mut Foo out = super.copy();
        return out;
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

## Copyable reconciliation

For identity-bearing objects, the compiler-generated `Copyable<Self>.copy()` contract should be written **`copy(): new Self`**. This is in addition to, **not instead of**, the existing deep logical duplication rule (no mutable alias back into the source graph, subtype preservation, and fail-atomic cleanup). Scalar/value `Copy` requires no fresh heap identity.

An `@Override copy(): new Self` in the existing v1 copy-contract remains **more restricted** than a general `new Self` method: v1 mandates precisely one nonvirtual, whole-concrete-type `super.copy()` synthesis on each successful path, and the override must return that same baseline object. A user-defined `copy()` that simply returns an unrelated `new Foo()` **is not accepted as a Copyable override in this v1 protocol**, even though it could satisfy an ordinary `new Foo` return type. This rule prevents bypassing inherited fields, mutable graph separation, identity topology, and copy hooks. Future manually implemented construction-based copying requires a separate verified protocol/reconstruction plan.

```atto
// Ordinary fresh result; not automatically a Copyable implementation.
fnc make_foo(): new Foo { return new Foo(); }

// Copyable v1 post-copy hook (generated baseline is essential).
@Override
copy(): new Self {
    val mut Self result = super.copy();
    result.rebuild_cache();
    return result;
}
```

Where user-written `Copyable<T>` is supported for both reference and value targets, the interface needs a *kind-aware* result (fresh `new T` for identity-bearing T, ordinary `T` for identity-less scalar/value T), **not** a blanket `new T` for all types. The compiler can model this as a verified `copy_result<T>` capability without introducing that name into source syntax. A future separate `FreshCopyable<T>` witness may be introduced if kind-dependent dispatch proves ambiguous. Do not require allocation for scalar `copy! 5`.

## Diagnostics and acceptance

* `E_FRESH_TYPE`: target lacks identity, dynamic subtype mismatch/slicing, or unsound return-type refinement.
* `E_FRESH_UNPROVEN`: `self`, old cache/parameter, unverified foreign/helper, cast laundering, ambiguous branch, or unverified dynamic dispatch.
* `E_FRESH_NOT_UNIQUE`: value was published/shared or retains aliases inconsistent with exclusive ownership.
* `E_FRESH_MISSING_RETURN`: a normally completing path does not yield an appropriate result.
* `E_COPY_OVERRIDE`: the existing strict Copyable protocol has no synthesized baseline, duplicates it, or returns a different object.

Compiler-backed positive/negative fixtures MUST cover constructor, local alias/move, verified helper, all return/control-flow paths, self/parameter/cache, type erasure, overloaded/virtual dispatch, ownership transfer, unique alias leakage, `copy!` and `rt copy`, derived base copy and a custom `super.copy()` hook. Report Java, LLVM, and .NET results separately at exact SHA and do not count a host reference oracle as compiled guest evidence. Native AOT / isolated tenant-VM semantics remain separate gates.

**Migration:** existing `copy(): Foo` source may continue to compile as an *ordinary method*, but MUST NOT be treated as a verified implementation of the fresh Copyable witness without rechecking and strengthening the declaration. No silent ABI break or unverified implicit upgrade.
