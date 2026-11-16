# Explicit Copyable and ownership-safe copying — v1 candidate

Status: **candidate contract; NOT general compiler/runtime support** (2026-11-15). This is a backend-neutral target for `copy! value` and compatibility `rt copy value`. Neither a source-only test nor parser acceptance proves guest execution. Existing Java copy-policy and legacy `Copy`/`Clone` contracts must be reconciled, not silently superseded.

## Normative intent

* Ordinary argument passing/binding of a class object MUST NOT perform a deep copy. An unqualified class reference is not proof of mutation or lifetime authority; the owner/borrow checker still controls access.
* `copy! e` and `rt copy e` MUST evaluate `e` once, retain the source as valid, and return a new independently owned logical value if its *resolved type, concrete subtype, source place and ownership provenance* prove explicit copyability.
* A copy MUST NOT retain a mutable alias into the source-owned object graph. Distinct identity of the root is insufficient: nested arrays, class fields, owned buffers and views must be covered. Reusing genuinely immutable backing data is legal only with an immutable-lifetime/share proof.
* `take! e` transfers ownership, `borrow! e` loans it, and `share! e` shares **the same** identity under a separate proof. They MUST NOT be substitutions for a failed `copy!`.
* Unsupported or unresolved code paths MUST fail closed at type/ownership checking or AOT admission: do not silently degrade `copy!` into reference assignment, pointer duplication, shallow clone, serialization or `share!`.

## Capability vocabulary

* **`Copy`**: existing compiler-recognized trivial value duplication proof (e.g., scalar), potentially eligible for low-cost layout copies; it does **not** bless copies of owning references.
* **`Copyable<Self>`**: proposed public, explicit *logical duplication* capability, **derived automatically** for ordinary classes and aggregates when every owned field and inherited component has a proven copy plan. `copy! x` requires an intrinsic Copy proof or a verified derived/custom Copyable witness. Explicit `implements Copyable<Person>` is optional for otherwise derivable classes, not a prerequisite or a substitute for proof. Name `Copyable` rather than `Cloneable`, because the user-facing operator is `copy!`; existing `Clone` remains separate until reconciled.
* **`NoCopy`**: a negative type/field/instance policy which takes precedence over any positive witness. Existing `@NoCopy` and `NoCopy<T>` design must retain transitive provenance.
* **`@WarnOnCopy`**: optional legal-copy lint; never a substitute for a proof.
* **`@Copyable`**: existing proposed Java annotation is a legacy opt-in request, **not a required class annotation and not proof**. Once automatic derivation exists, a redundant positive annotation cannot confer additional copying rights; `@NoCopy` still wins.

Illustrative future interface syntax (not asserted to parse today):

```atto
define pub interface Copyable<T> as
    copy() -> T;
end

// No implements clause, @Copyable annotation or handwritten method needed.
define class Person as
    pub val string name = "";
    pub val Array<int> scores = Array.of();
end

val original = new Person();
val independent = copy! original;
val independent_legacy = rt copy original;

// A developer may opt into explicit conformance for clarity:
define class Account implements Copyable<Account> as
    pub val string label = "";
    pub val Array<int> history = Array.of();

    // Optional custom hook: only after the generated safe baseline copy.
    @Override
    pub copy() -> Account {
        val mut Account c = super.copy();
        c.rebuild_cache();
        return c;
    }
end
```

Every otherwise-safe concrete class automatically obtains a **compiler-synthesized `Copyable<Self>` witness and a generated `copy() -> Self` operation**. An explicit declaration and override are optional. Merely declaring a method named `copy`, or `implements Copyable<T>` / `@Copyable`, cannot make forbidden fields legal. The checker must establish fresh same-concrete-type identity, nested mutable-field separation, correct allocation domain, recursive ownership/drop and absence of borrowed escapes. No hidden copy on ordinary parameter passing.

### Derived class copying, and precisely when to intervene

**Automatic by default:** for a concrete class with scalar, immutable string, copyable struct/record/ADT, ordinary copyable nested class, and Array/List/Set/Map/Tuple fields, the compiler derives an owned copy plan. Each copyable nested class is handled recursively; mutable arrays/collections get independent owned backing and elements. Private fields remain visible to compiler derivation. The plan accounts for ancestor fields; it does not invoke a reference-aliasing constructor or replay arbitrary effectful initialization. A class lacking any required witness does not become Copyable by asserting conformance.

**Manual hook only when value-preserving post-processing is needed:** recompute a derived index, refresh a cache, regenerate a non-identity internal field where a separately audited reset policy permits it, or restore a class invariant. A manual override is **not required** for normal fields, arrays, nested copyable classes, or inheritance. If fields are `@NoCopy`, actor-owned resources, native handles, channels, or mutexes without a verified regeneration/copy policy, the class remains noncopyable even with an override. To create a new independent resource, use a deliberately named resource-specific factory or a separately reviewed field reconstruction policy; `copy!` must never silently duplicate its handle.

**Reserved `super.copy()` semantics:** within an `@Override copy() -> Self` body, `super.copy()` means *invoke the compiler's synthesized default copy plan for the entire current concrete class*, including copyable inherited fields. It is a **nonvirtual, nonrecursive compiler intrinsic**, not a conventional call to a parent `copy()` that returns only a base object. It works even for a root class with no user-declared parent. This special meaning exists **only** in a copy override; ordinary `super.method()` keeps its usual parent-dispatch semantics. The plan constructs the fresh object under a private, unpublished owner, then post-processes. Any ancestor hook must be safely composable in deterministic ancestor-to-descendant order and run at most once; otherwise reject as `E_COPY_INHERITANCE`.

In v1, an override calls `super.copy()` **exactly once** on all successful paths, never calls `copy! self` (recursive), modifies only the new owned object under valid mutability rules, and returns that same concrete object. The compiler rejects zero calls, double calls, returns of `self`, base-class slicing, passing a partially constructed clone to external code or leaking aliases. The result cannot retain mutable source-owned aliases; an asserted method signature alone is not a proof. `val mut` permits the hook to mutate the copy without rebinding `c`; a plain `const c` does not grant mutable-referent access. Effectful or fallible reconstruction requires an explicit future checked-copy API with typed effects and rollback, not silent synchronous `copy!`.

**Inheritance:** a subclass with only derivable fields receives its **own generated copy** even when the parent copy was generated; the concrete subtype is preserved. A custom ancestor hook must be included once by a verified generated composition, or the compiler rejects the derived copy. The historical rule requiring each subclass to handwrite `copy()` is superseded by this candidate. If static `Base` refers to dynamic `Child`, a permitted polymorphic `copy!` must preserve `Child` or reject (never slice); AOT vtables/witnesses must enumerate all admitted concrete subtypes.

**Graph caveat:** automatic derivation of a nominal copy witness does not imply that arbitrary cyclic/shared mutable graphs can be copied by naive recursion. A graph-aware, memoized, two-phase plan is required when alias topology/cycles are present; without it emit `E_COPY_GRAPH_UNPROVEN`.

**Override safety:** custom post-processing runs on a private copy, must leave the source intact, and is guarded against publishing mutable aliases or crossing actor domains. Compiler and runtime verification must prove clone separation, cleanup and concrete identity. The reference tests below are deliberately weaker host-only models; they do not certify arbitrary user method bodies.

## Aggregate table

| Type | Required `copy!` semantics |
| --- | --- |
| `int`, `bool`, floats, other admitted scalars | Duplicate value; resolved concrete Copy proof |
| Immutable `string` / immutable interned values | Value-equivalent result; immutable backing may be shared safely |
| `struct`, record, tuple, pair, Option, Result | Compiler-derived recursive logical copy of **all owned** fields/variants; deny on any uncopyable constituent |
| `class` | Automatically derived `Copyable<Self>` for provably copyable fields and ancestors, with optional safe `copy()` override; new concrete identity and nested mutable separation |
| `Array<T>`, `List<T>`, `Set<T>`, `Map<K,V>` | New owned container and owned mutable storage; copy each logical element/key/value recursively; type witnesses required even for an *empty* typed container |
| `Slice<T>`, mutable view, borrowed span | `copy! view` denied until a distinct view/owned-buffer contract is defined; `Array.copy_of(view)` can be a separately checked materialization API |
| Actor, channel, task, mutex, atomic, socket, file, unique handle, singleton, `NoCopy<T>` | No `Copyable` proof by default; explicit resource-specific duplication APIs do not retroactively grant `copy!` |
| `Box<T>`, `Arc<T>`, other smart pointers | Duplicating a handle or reference count is `share!`/handle semantics, **not** copying the pointee; require separately defined explicit copy policy |

**Identity and graphs.** A permitted copy of a graph must preserve observable logical value and internal alias topology without preserving any *mutable cross-copy alias*. A graph copier may use a memoized source-to-copy map and two-phase construction to preserve repeated identities and cycles. Until that algorithm is independently proven for a given type/backend, cycles, unbounded graphs, untracked aliasing and abstract/erased subtypes are `E_COPY_GRAPH_UNPROVEN`, not partially cloned results. Polymorphic class copies must preserve the concrete runtime subtype or reject; no object slicing.

**Generics and unions.** A generic `T` cannot be copied just because a particular call site happens to hold an integer. A resolved `T: Copyable<T>` (or intrinsic `Copy`) proof is required at the call site and at every lowered specialization. Union variants and ADT arms must each prove the applicable copy contract. A nominal witness must remain present across exports, FFI, AOT tree shaking and separately compiled package ABI.

**Ownership and lifetime.** The copy receives its own owner/drop obligations and must not reuse a mutable actor-private allocation from the source actor. Failure midway must not publish a partially constructed copy; allocated temporaries must be retired exactly once and the source must remain valid. The operation cannot escape borrow, `critical-read`, mutable receiver or actor-isolation restrictions. All effects (allocations and potential failure) must be preserved; no silent suspension or hidden I/O in a synchronous copy method. Hard-real-time profiles must reject unbounded copy depth, allocation, work or time.

## Diagnostics (stable proposed codes)

* `E_COPY_UNPROVEN` — unresolved type/witness, class without verified copy implementation, or dynamic dispatch not proven
* `E_COPY_FORBIDDEN` — `@NoCopy`, noncopyable type or resource
* `E_COPY_TRANSITIVE` — nested field/collection key/value fails a copy proof; include the field/index origin
* `E_COPY_GRAPH_UNPROVEN` — cyclic, aliased or polymorphic graph without a verified graph-aware copier
* `E_COPY_VIEW` — borrowed slice/view would alias instead of producing an independent owned value
* `E_COPY_ALIAS` — implementation returns the original object or retains mutable reachable storage
* `E_COPY_OVERRIDE` — manual override omits/repeats synthesized baseline, returns a different object, recurses via `copy! self`, or leaks partial object
* `E_COPY_INHERITANCE` — parent and child copy plans/hooks cannot compose without slicing or double execution
* `E_COPY_EFFECT` — copy method violates synchrony/effect or cleanup requirements
* `W_COPY_DISCOURAGED` — legal but annotated discouraged copy

Prove legality at compile time; runtime assertions may supplement but cannot replace that proof. Diagnostics must be deterministic and must not report a failed backend as an accepted copy.

## Acceptance matrix (not yet implemented)

1. Resolve `copy!` and `rt copy` to the **same checked IR operation**, single operand evaluation and identical diagnostics. Formatter emits `copy! value` while keeping compatibility input.
2. Execute positive tests: scalar, nested struct, class with owning mutable array, array-of-arrays, list, map, tuple, pair, Option/Result, immutable string. Mutate cloned nested data and verify the original is unchanged.
3. Compile-negative: implicit deep-copy on ordinary class argument passing, explicit witness/annotation without supporting field proof, no-copy nested field, empty generic collection with forbidden element type, original-return, shallow nested alias, invalid manual override (missing/duplicate `super.copy`, wrong subtype, source alias, wrong mutability), uncomposable ancestor hook, resource handle, mutable view, unresolved generics, cycles/polymorphism without proof, incompatible copy effects.
4. Exercise immutable-backed sharing, copy of repeated graph references (where admitted), failure cleanup and no double-drop; test source and destination actor heaps/isolation.
5. Report **compiler-backed** positive and negative results independently for Java/GraalVM, LLVM, .NET Native AOT, Wasm and Forge, plus additional Rust/JS backends. Pin exact head, source tree, executed workflow steps and full-native-AOT provenance. Do not count host-only reference models or zero-step GitHub checks as parity.

### Existing evidence and dependency notes

* Java draft [oreslang-source.java#2337](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/2337) retains `@NoCopy`, `@WarnOnCopy`, `@Copyable`, but conservatively denies unproved class copies. Its reported exact-file-subset JUnit result does not establish general class/array duplication.
* Older [Java #148](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/148) documents recursive structs and a previously required per-class handwritten `copy()` method. **The manual-method requirement is superseded by the new automatic derivation candidate**; preserve its safety invariants and negative cases when reconciling with #2337.
* [atto-source.rs#135](https://github.com/atto-lang/atto-source.rs/pull/135) covers a checked scalar `copy!` subset, not arbitrary heap graph copies.
* [ownership-bang spec #67](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/pull/67), [Java frontend #3112](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/3112) and [formatter #144](https://github.com/ores-truffle-oreslang/oreslang-format/pull/144) concern alias syntax and parsing, not proof of deep-copy execution.
* Existing `Copy` and `Clone` terminology in `docs/OWNERSHIP_SMART_POINTERS_DOP.md` must be explicitly reconciled during promotion; this candidate does not change implicit-copy rules.

**Source-only tests** for this candidate demonstrate a bounded reference graph-checking oracle, never the AttoLang parser, compiler, guest runtime or exact-head conformance.
