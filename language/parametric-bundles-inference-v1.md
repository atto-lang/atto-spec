# Named parametric bundles and explicit inference v1

**Status: TARGET / NOT EXECUTED.** User-approved direction, proposed concrete grammar below. No backend support certified.

## Grammar and identity

A bundle is a compile-time mapping of named arguments, not a runtime Record, a nominal value type, or a generic declaration. Example (assuming Array declares `type` and `size`):

```atto
type T = <type=int, size=5>;
type X = T with {size=6};
const Array<T> a = [1, 2, 3, 4, 5];
const Array<X> b = [1, 2, 3, 4, 5, 6];
```

`type X = <type=int, size=6>` is equivalent to the derived bundle. `type X = Array<T>` instead aliases a complete value type. A bundle cannot occupy a type slot as a value type; bundle expansion is statically resolved in a generic argument list. A parameterized bundle such as `type Fixed<E, const N> = <type=E, size=N>;` expands after its own arguments resolve. Bundle references are immutable and cycle checked. Named projections `X.type` and `X.size` have their respective compile-time kinds.

Use declared formal names only (chapter 02 and named collection layouts); `type` and `size` examples require an Array declaration with those formals or a separately ratified alias schema. Never silently rename `T` to `type` across arbitrary nominal declarations, conflate metadata with formals, or treat size as capacity. Values must have the declared kinds and obey all target bounds.

## Inference and refinement

Preferred spelling:
```atto
const Array<infer X from T> x = [1, 2, 3, 4, 5, 6] with {size=6};
const Array<X> y = [6, 5, 4, 3, 2, 1];
```

Candidate equivalent spelling: `Array<infer X extends T>` (only in this explicit bundle binder; not subtyping). Also admit `Array<X extends T> x = infer literal with {size=6};` as an explicitly marked initializer-based binder, never an implicit declaration without `infer`. Both proposed alternatives require parser disambiguation; canonical formatter preserves source until semantic equivalence is proven. `infer` on initializer is a contextual compile-time marker, not a runtime operation.

A seed supplies inherited defaults; explicitly written replacement keys in the refinement clause replace those seed keys only. Other explicit constraints are never overwritten. A fixed seed field is not implicitly changed by a literal length or type mismatch. Unseeded `Array<infer X>` captures the fully resolved canonical argument bundle including defaults. Individual `Array<type=infer E, size=infer N>` bindings capture the named type and constant respectively. Inference variables bind in the enclosing lexical scope only after successful declaration checking, are not visible in their own initializer, may not redeclare existing names in that scope, and never escape it. Bare `infer` is not a new anonymous generic argument; existing call-specific underscore rules are unchanged.


### Explicit replacement by inference (candidate extension)

```atto
type Base = <type=int, size=5>;
const Array<infer X from Base> x = [1,2,3] with {size=infer};
type Y = X with {size=2};
const Array<Y> y = [10,20];
```

Only in a seeded literal refinement clause, a whole RHS `infer` marks that particular inherited formal as a required inference hole. It removes the seed's binding before inference, retains all other seed values, and cannot overwrite an independent explicit constraint. Evidence must be unique, statically available and kind-correct; no default may fill this hole. The resulting X.size is 3, Y.size is 2 and Base.size remains 5. This contextual hole is not a bare generic argument or a runtime expression. Outside a seeded literal refinement, `size=infer` is not admitted in v1. An empty literal can supply length zero but cannot infer an absent element type. Replacing a type or layout still needs a complete checked initialization and no implicit conversion. A backend may reject the candidate extension as unsupported before guest artifact emission.

### Composition and projection (candidate extensions)

```atto
type Element = <type=int>;
type Shape = <size=3>;
const Array<Element, Shape> a = [1,2,3];
type P = params_of(a);
type Q = P with {size=2};
```

Composition is disjoint union of resolved formal identities, not last-writer-wins: duplicates fail even when values agree. A bundle cannot be confused with an ordinary positional type argument. Resolve the kind of each argument before expansion, retain the existing positional-before-named rule, and reject ambiguous names. `params_of` is a proposed compile-time intrinsic of an already resolved concrete nominal specialization or statically typed binding; it does not evaluate the binding, invoke getters or inspect runtime state. Its result retains canonical typed formal identities and the nominal schema provenance; reapplication to another schema requires an explicit, separately checked mapping, not name-only compatibility. No reflection or arbitrary expression execution is implied. The spelling and cross-schema rules remain candidate, not an implementation claim.

## Contextual literal forms

```atto
const Array a = [1, 2, 3, 4, 5] with {type=int, size=5};
const Array<T> b = [1, 2, 3, 4, 5] with T;
const Array<T> c = [1, 2, 3, 4, 5] as T;
const Array<T> d = [1, 2, 3, 4, 5] as <type=int, size=5>;
const Array<T> e = T[1, 2, 3, 4, 5];
const f = Array<T>[1, 2, 3, 4, 5];
```

A bare bundle prefix needs a uniquely known contextual collection family. A resolved runtime value prefix continues to mean indexing, not a type-literal fallback. `as` here specializes a literal, does not cast a constructed array, resize, or convert elements. `with {key=value}` is a compile-time argument clause, distinct from runtime record `with {field:value}` and allocator selection. Mixed separators, dynamic keys, nonconstant parametric values, duplicate keys, ambiguity and wrong kind are errors. No fallback after failed nominal resolution. A nonliteral runtime value cannot use the parametric literal suffix to retype itself.

## Binding algorithm

1. Resolve the nominal family and ordered declared formal schema. Expand bundle aliases with cycle/depth/size limits and lexical kind resolution.
2. Collect each source argument with provenance and reject duplicate keys (including positional/named/bundle collisions in ordinary application). For a derivation only, replace seed fields explicitly named in its one refinement clause. Reject collisions with independently explicit fixed arguments even if identical (a repeated complete contextual bundle in a literal suffix may instead act as an equality constraint).
3. Infer unresolved fields using type and constant evidence from the literal, then apply permitted declared defaults in order. Explicit named inference holes need actual inference evidence, not a fallback default. Check every explicit/inherited constraint, kinds, bounds and dependencies.
4. Canonicalize by resolved nominal declaration and formal identity/order, resolved type identity and canonical compile-time values. No spelling or alias-name based specialization cache keys. Validate complete construction before publishing any inferred aliases, allocating or emitting executable IR.

## Initialization, ownership and safety

Fixed size is logical element count, not reserved capacity. Under the explicit-initialization contract, `[]` may construct a fixed-size zero-element array only; the user's nonzero empty-literal example is a syntax target but fails initialization. Use a full literal or a separately specified explicit fill initializer. No implicit zero/default values, padding, hidden mutation, aliasing, layout conversion or cast. Existing ownership, effects, once-only lexical evaluation, checked size arithmetic and AOT rules remain mandatory.


## Contextual nominal construction (owner-approved direction)

```atto
type Base = <type=Particle, size=5, layout=soa>;
let particles: Array<infer X from Base> = [
    make {x:10, y:20, velocity:1},
    make {x:30, y:40, velocity:2}
] with {size=infer};
```

The expected element type supplies a unique, resolved nominal constructor owner; the explicit size hole obtains its evidence from the element count. The element type and physical layout are retained. `make {...}` constructs a value; `new {...}` constructs a reference under the existing nominal reference and allocation rules. In a reference-element collection the latter obtains its owner from the referent type. The existing struct boxing restriction remains in force unless separately ratified: a struct value is not implicitly reference-allocatable. An inline SoA value slot must reject reference construction even when the field shapes agree. No automatic boxing, copying, dereference or identity discard. The reference spelling in examples is illustrative until the canonical type schema is resolved.

The braced operands use field initializers with colon separators, not a Record value or a generic argument map. Require a unique expected nominal owner (including resolved constructor category), accessible constructor/fields, exactly one initializer for each required field and checked field types. Never choose an owner by field-name matching. Nested field construction receives its own field's expected type. Function arguments, returns, assignments, channel messages and match arms use the same contextual resolution rules. Resolve overloads by ordinary type constraints, without evaluating expressions or guessing when several owners remain. Reject circular expected-type inference and unresolved owners before lowering.

Primitive typed construction (`make Particle {...}`, `new Widget {...}`) shares the checks of the corresponding contextual form. Declared factories (`Particle.make(...)`, `Widget.new(...)`) remain ordinary resolved calls with their declared effects, result types and context; no name-based rewrite. Contextual positional `make(...)` / `new(...)` and collection-prefix `make [...]` / `new [...]` are separate candidate extensions, not admitted here.

For primitive reference construction, an inner `with allocator` selects the typed allocation context; the outer literal's `with {size=infer}` is a compile-time clause. Preserve the allocation and first-class bound-factory rules in the contextual specialization proposal (atto-spec#294). No fallback allocator or implicit factory binding. Evaluate field expressions exactly once in written order; canonical storage order must not reorder effects. Direct destination value construction is permitted only if equivalent under initialization, effects, ownership, borrow and cleanup rules. On failure, clean up initialized resources in reverse order, release reservations exactly once and do not publish partial values. Do not erase observable identity or quota effects of `new`.

A backend may initially implement only the fully typed local scalar struct-array value subset. It must reject contextual reference construction and all unresolved or unsupported cases before emitting guest artifacts. Full reference construction requires a real identity-bearing representation and lifetime/allocator tests.

## Verification

Source vectors are design targets, not executed fixtures. Compiler stages: grammar/AST (distinguish bundle vs ordinary type and runtime `with`), shared semantic binder, alias scope, type/ownership/layout checking, canonical IR and guest lowering, formatter round-trip. Unsupported forms fail closed. Report exact backend head/tree/toolchain and executed positive/negative guest evidence separately.
