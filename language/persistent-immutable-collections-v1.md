# Persistent immutable collections v1 — qualifier, literal and ownership contract

**Status: PROPOSED / NOT COMPILER-EXECUTED (2026-11-21).** This is a target language contract, not a claim that any AttoLang backend already implements persistent collection guest allocation, frozen graph verification or updated methods. Do not merge or promote conformance solely from source-only checks.

Related: [inline collection literals (draft #69)](https://github.com/atto-lang/atto-spec/pull/69), [contextual empty literals (draft #130)](https://github.com/atto-lang/atto-spec/pull/130), [type-first implicit const (#170)](https://github.com/atto-lang/atto-spec/pull/170), [immutable Record with-update (#75)](https://github.com/atto-lang/atto-spec/pull/75), [mutable Map/Entry API (#116)](https://github.com/atto-lang/atto-spec/pull/116), [ownership vocabulary](ownership-vocabulary-v1.md), and [shared ownership / guards](shared-ownership-and-guards-v1.md). This proposal extends those contracts and must be reconciled against them before implementation.

## Motivation: the ordinary spelling must be enough

```atto
// Fully constexpr, frozen data: the requested canonical spelling.
const Vector<int> foo = [];
const Vector<int> primes = [2, 3, 5, 7];

// Type-first implicit const, where that proposal is supported:
Vector<int> also_primes = [2, 3, 5, 7];

// Runtime-created immutable collection: do NOT silently reinterpret const.
val Vector<int> runtime_primes = build_primes();

// Persistent operations allocate a new logical value, leaving the source unchanged.
val Vector<int> more = primes.appended(11);
val Vector<int> revised = more.updated(0, 1);
```

The binding qualifier, referent mutation authority, compile-time eligibility and deep-freezing proof are **distinct**. A compiler MUST NOT interpret `const` as merely a non-reassignable pointer to a mutable collection. For ordinary locals, `const` requires a proven compile-time initializer and an immutable value; `val` permits runtime initialization. The separate narrow file/module `define const` startup-environment exception does not apply to local collections.

The empty `[]` is contextually interpreted as an empty `Vector<int>` because the expected type is explicit. The same token sequence can construct a `List<T>` or `Array<T>` when that exact target is known. It MUST NOT default to Vector, infer an unconstrained `T`, or silently collapse distinct collection types. This adds `Vector<T>` to the contextual `[]` set in draft #130, subject to reconciling its scope and the final approved literal spec.

The compiler's constexpr collection evaluator must support safe bounded constants before this example is actually accepted. An empty runtime collection is NOT automatically constexpr just because it contains zero elements; actual constexpr eligibility requires deterministic type-aware construction, no runtime effects, immutable graph proof and bounded static materialization. Unsupported constexpr collections must reject with a targeted diagnostic and **no guest output**; they must not be downgraded to runtime `val`.

## Binding, collection mutation and evaluation are separate axes

| Source declaration (local) | Initializer | Rebind name | Write collection elements / structure |
| --- | --- | --- | --- |
| `const Vector<int> x = [...];` | constexpr only | no | no; frozen |
| `val Vector<int> x = expr;` | runtime permitted | no | no |
| `let Vector<int> x = expr;` | runtime permitted | yes | no (may rebind to a new vector) |
| `val mut Vector<int> x = expr;` | runtime permitted | no | yes, with exclusive ownership/loans |
| `let mut Vector<int> x = expr;` | runtime permitted | yes | yes, with exclusive ownership/loans |
| `const mut Vector<int> x = constexpr;` | constexpr template | no | yes, **fresh owned local instance** per evaluation, only when independently implemented |

The `val mut` and `const mut` examples are **targets**, not claims of universal current parser acceptance. In particular, existing Java code has a narrower qualifier profile; changing `val` from runtime fixed binding with a mutable referent into an automatic referent freeze is *not* assumed. Instead, this proposal specifies the value-level immutable interface for `Vector<T>` and the distinct explicitly authorized mutable operations. `let` alone is never mutation authority.

## Collection families, without type-identity collapse

- `Vector<T>`: immutable persistent indexed sequence by default; optimized indexed reads and path-copy updates are the goal. **Not** an alias to `Array<T>`.
- `List<T>`: immutable persistent ordered sequence; prepend, append and structural sharing where safe. **Not** Vector under another name.
- `Map<K,V>`: keyed collection with stable `Eq`/`Hash` rules and checked Option-valued lookup. Existing `mut Map` `set` / `add` / `try_add` remain the mutable API; immutable values use **nonmutating** methods returning a new Map.
- `Set<T>`: distinct membership collection; stable Eq/Hash; nonmutating insertion/removal returns a new Set.
- `Array<T>`: retains its separately defined contiguous storage, layout and ownership. A readonly `val Array<T>` view must not be confused with a proven deeply frozen aggregate; `const Array<T>` requires a frozen constexpr representation, and mutable array writes need `mut` plus an exclusive loan.

For an immutable persistent collection, neither index assignment nor a mutating method is available without an explicit mutable capability. A mutable collection instance retains the same nominal type constructor but has independently checked owned/write permissions; a persistent operation works on either, but never mutates its source.

## Pure persistent API (TARGET method spellings)

```atto
val Vector<int> v = [10, 20, 30];
val Vector<int> v2 = v.appended(40);      // [10,20,30,40]
val Vector<int> v3 = v2.updated(1, 25);  // [10,25,30,40]
val Vector<int> v4 = v3.removed_at(0);   // [25,30,40]

val List<int> xs = [2, 3];
val List<int> ys = xs.prepended(1);        // [1,2,3]

val Map<string,int> m = {"alpha" => 1};
val Map<string,int> m2 = m.updated("beta", 2);
val Map<string,int> m3 = m2.removed("alpha");

val Set<int> s = Set.of(2, 3);
val Set<int> s2 = s.inserted(5);
val Set<int> s3 = s2.removed(2);
```

These names are deliberately snake_case (`removed_at`, not `removedAt`). `updated`, `removed`, `inserted`, `appended` and `prepended` NEVER mutate the source and return a *new logical collection value*. Implementations may share **immutable** internal nodes with an existing collection if both remain observationally immutable; physical full copying is not required. Structural sharing must not smuggle mutable child aliases or violate actor/tenant ownership. Do not promise specific O(log n) bounds until storage profiles are independently benchmarked and proved.

- `Vector.updated(i, value)` requires an in-range index; `removed_at(i)` likewise has a checked bounds contract. No silent append or wraparound on an invalid index. Exact checked API errors (Result, Option, or typed Error) must be chosen consistently with the existing indexing contract before guest implementation.
- `Map.updated(k,v)` is persistent upsert; `Map.removed(k)` preserves the original and handles missing keys deterministically. It does not alter mutable `Map.set`/Entry APIs. Keys must remain hash/equality stable while stored. `Set.inserted/removed` are analogous.
- `map`, `filter` and `reduce` preserve the collection-specific return type or explicitly documented result type; user lambdas always use `|...|` delimiters. Effectful callbacks evaluate according to one documented source-order rule, once per visited element, with no partially published result on failure.
- Persistent operations cannot be mistaken for the existing Record `with {...}` syntax. A collection update is an ordinary method call with ordinary generic type checking and ownership admission.
- `mutable` method candidates (`push`, `set_at`, `remove_at`, `Map.set`) require proven unique mutable authority and invalidate outstanding conflicting loans. A persistent method is never silently lowered to an in-place write visible through the source.

## Reachable element graphs, deep freezing and aliases

`const Vector<T>` is **transitively immutable**: every reachable ordinary element graph is immutable or independently proven frozen. It cannot contain a writable alias to mutable `T` or host/FFI mutation escape. A non-frozen `T` must be explicitly converted with the separate checked `freeze! take!` / `share!` rules where permitted, or the collection construction rejects. A readonly binding is not a general-purpose deep freeze and cannot retroactively revoke unknown external aliases.

`val Vector<T>` and `let Vector<T>` expose a **nonmutating collection interface**. Admitting mutable reachable elements requires an explicit type/ownership contract; never infer that readonly access to a collection automatically makes each embedded object safely shareable. Persistent updates may retain immutable/Copyable elements or provably shared frozen elements; they may not duplicate an exclusive mutable owned child into both old and new collections. Otherwise reject `E_PERSISTENT_OWNERSHIP`, require an explicit graph copy, or use an explicit consuming update API specified separately. Neither construction nor updates implicitly run `copy!!`, `share!`, `take!`, or a host GC clone.

```atto
const Vector<int> data = [1, 2, 3];
data[0] = 9;              // E_IMMUTABLE
data.push(9);             // E_IMMUTABLE
data = [9];               // E_IMMUTABLE_REBIND

let Vector<int> current = [1, 2, 3];  // constexpr shorthand not used: runtime let
current = current.appended(4);        // legal rebinding to a fresh logical value
current[0] = 4;                       // E_IMMUTABLE

val mut Vector<int> scratch = [1, 2, 3];
scratch.push(4);          // TARGET: legal only with a valid exclusive mutable owner
```

`const mut Vector<T>` is a separate local-only contract from #170: a constexpr template, independently materialized into a fresh mutable per-scope instance. It must never mutate or reuse the frozen `const Vector` template allocation.

## Actors, domains, memory and failed updates

- Immutable collection status does **not** automatically confer `Sendable`, `Serializable`, or permission to cross actors/workers/tenants. Transfer (`take!`), independent deep copy (`copy!!`), or checked frozen shared ownership (`share!`) still follow their own contracts. No leaked raw pointer, mutable alias, borrowed child or actor state may cross the boundary.
- A frozen persistent structure may be structurally shared only within an explicitly supported allocation/ownership domain. Independent Wasm Workers without shared memory must use a compliant transfer/copy/codec; they cannot pretend to share heap nodes.
- Constructor and update evaluation is left-to-right, once per source expression, with bounded allocation and constant-evaluation budgets. Overflow, OOM, hash/equality failure and partial update must not mutate the source or publish a partially constructed destination. Temporary owned values must be cleaned up exactly once.
- Equality and hashing are structural/value-based only for admitted element types and map/set key witnesses; no accidental pointer-identity equality or order-dependent Map equality. Deterministic serialization requires a separate explicit codec and canonical ordering contract. Persistence does not imply durable disk storage.

## Conformance and rollout — no invented PASS

1. **Spec + formatter:** validate declared-type `[]` for `Vector<T>`, `List<T>`, `Array<T>`; reject untyped `[]` or conflicting expected types. Parse/type-check all six qualifiers and uphold implicit-const equivalence only in its permitted contexts; formatter must roundtrip exact types and rights.
2. **Const evaluator:** prove constexpr empty/nonempty `Vector<int>`, immutable/frozen aggregate lowering, budget failure and runtime initializer refusal; never demote failed `const` to `val`.
3. **Guest positive fixtures:** execute immutable vector reads, original-preserving appended/updated, List prepend, Map upsert/remove, Set insert/remove, `let` rebinding and valid exclusive mutable operation on actual compiled guest values.
4. **Guest negative fixtures:** immutable index/method write, rebinding `const` and `val`, `const` runtime initializer, untyped `[]`, unhashable keys, out-of-bounds updates, unsafe retained mutable child, aliased mutable owner, stale borrow, use-after-take, actor state bypass and cross-domain unproven shared nodes. Require exact expected diagnostic category and **no guest artifact**.
5. **Safety / performance:** prove structural-sharing identity only for frozen nodes; distinguish logical identity, allocator budget, drop/refcount balance, update failure rollback, nested aliases and cycles; exercise sanitizers, cancellation and actor isolation. Preserve separate `Vector/List/Array/Map/Set` type/layout/equality/ownership identities.
6. **Parity:** run identical pinned-source fixtures on Rust native and browser-hosted compiler/Wasm guest, Java/GraalVM, LLVM, .NET, Forge and other independent compiler paths. Report **PASSED / FAILED / UNSUPPORTED / NOT_EXECUTED** separately; no parser-only, static oracle, zero-step Actions or borrowed CI result counts as guest verification.

**Current state of this proposal:** all positive and negative guest cases are **NOT_EXECUTED**. Existing collection PRs and their historical receipts retain their own scope; this proposal certifies none of them.
