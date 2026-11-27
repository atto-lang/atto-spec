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

## Verification

Source vectors are design targets, not executed fixtures. Compiler stages: grammar/AST (distinguish bundle vs ordinary type and runtime `with`), shared semantic binder, alias scope, type/ownership/layout checking, canonical IR and guest lowering, formatter round-trip. Unsupported forms fail closed. Report exact backend head/tree/toolchain and executed positive/negative guest evidence separately.
