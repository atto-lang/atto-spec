# Copyable and DeepCopyable — shallow/deep ownership-safe copying (v2 draft)

**Status: candidate language contract; NOT implemented across compilers. Updated 2026-11-17.** This revision supersedes the earlier deep-by-default interpretation of copy! in this draft PR. Existing host-only oracle tests and prior CI reports are **not** evidence of compiled AttoLang behavior. Reconcile the older Java and Rust copy contracts before implementation.

## Decision

- **copy! expression** means *shallow copy*. Evaluate its operand exactly once. For an identity-bearing class, construct a **fresh concrete root object** and copy every immediate field without recursively copying referenced objects. Embedded value fields are copied by value. Immutable references may be reused; mutable references may be reused **only** when a statically verified sharing/ownership capability makes that alias legal.
- **copy!! expression** means *deep copy*. Evaluate its operand exactly once. Construct a **fresh mutable graph**, recursively duplicating owned mutable reachable objects, while preserving internal repeated references and cycles where the backend admits a verified graph copier. Proven immutable interned data may be shared.
- **obj.copy()** corresponds to copy! obj and **obj.copy_deep()** corresponds to copy!! obj, subject to the same static witness and dynamic subtype obligations.
- The two public methods accept **zero arguments**. Implementation-specific allocation/graph context is an **invisible compiler/runtime parameter**, not a user-visible argument. Application-specific variants may have named methods like copy_with(options), but operators NEVER forward arguments.
- copy! and copy!! require separate capabilities. DeepCopyable does not imply Copyable: a type with uniquely owned mutable descendants may support a deep copy but not a shallow copy. Do not automatically change copy! into copy!! when shallow copying is unsafe.
- take! transfers ownership of the original. share! shares the original identity with separately verified permissions. Neither is an alias or fallback for either copy operator.

These are copying operations, **not** ordinary passing/binding: passing a class as a parameter never silently copies it.

## Default call borrowing is not copying

For nonprimitive call arguments, `inspect(owner)` is the canonical implicit
scoped read loan; `inspect(borrow! owner)` makes the same loan explicit.
Neither spelling invokes `copy()`, `copy_deep()`, `share!` or an implicit
ownership move. A consuming callee must declare `take! T` and be invoked
with `take! owner`. An exclusive mutation request uses `mut owner` (or
`borrow! mut owner`) and must prove no overlapping readers or writers.

```atto
fnc inspect(Document doc): int { return doc.version; }
fnc consume(take! Document doc): int { return doc.version; }
// Target call-site contract, not necessarily supported on every compiler head.
val version = inspect(doc);           // implicit readonly borrow!
val again = inspect(borrow! doc);     // same loan rights
val separate_root = copy! doc;        // shallow, conditional on Copyable
val separate_graph = copy!! doc;      // deep, conditional on DeepCopyable
val consumed = consume(take! doc);    // invalidates caller's owner
```

A shallow copy cannot be auto-upgraded to a deep copy merely because its
mutable children are unsafe to alias. Conversely a deep clone does not
inherit the source allocation's `pin!` stability claim. Copying a value while
it has an outstanding conflicting loan, or copying untrusted external resource
handles, must fail closed. These are separate static and backend obligations;
reference tests alone do not establish implementation.

## Copy expressions passed to calls (target call-boundary contract)

An expression passed to a function is **not** automatically transferred to that
function merely because the expression produced a new, owned value. Resolve the
formal's ownership mode before checking the argument:

- `inspect(copy! x)` evaluates `x` once, makes a new shallow root (when
  Copyable is proven), then passes a **temporary read loan of that new root** to
  the ordinary, non-owning class formal. The callee may not retain, return as an
  owned value, move, or drop the root. On normal or exceptional completion,
  the loan ends and the temporary owned root is cleaned up exactly once. If a
  verified borrowed result keeps a loan alive, its owner and lifetime must
  survive accordingly; no dangling temporary may escape.
- `inspect(copy!! x)` has the same non-owning call-boundary rule, but first
  deep-copies the mutable graph under a verified DeepCopyable witness.
- `inspect(borrow! x)` **does not copy**. It borrows the original root. The
  two forms must remain observably different for root identity and write
  isolation; shallow nested child references may still be shared legally.
- For a consuming formal `take! T`, the initial phase-1 profile requires an
  explicit `take!` of a **named live owned place** at the call site. A copied
  temporary must first be bound to an owned local and then explicitly moved.
  Neither `consume(copy! x)` nor `consume(copy!! x)` can silently transfer
  ownership; and `consume(take! (copy! x))` is not supported by the phase-1
  named-place grammar. A future separately versioned rvalue-consume extension
  may admit such syntax only with verified exactly-once move/drop semantics.
- For intrinsic scalar Copy values, passing the result remains ordinary value
  passing; it does not manufacture a heap pointer or identity-bearing root.

~~~atto
fnc inspect(Document doc): int { return doc.version; }
fnc consume(take! Document owned): int { return owned.version; }

val original = new Document();
val version_a = inspect(borrow! original); // original root, no allocation
val version_b = inspect(copy! original);   // fresh shallow root, loan for call
val version_c = inspect(copy!! original);  // detached mutable graph, loan for call
val owned_copy = copy!! original;
val version_d = consume(take! owned_copy); // explicit ownership handoff
// original is still valid; owned_copy is moved and unusable
// consume(copy! original);                 // E_OWNERSHIP: no take! named place
// consume(take! (copy! original));         // E_OWNERSHIP: phase-1 rejects rvalues
~~~

The backend may physically pass a pointer/reference to the **fresh copy** (as
Java does for a clone), but it must never pass only a duplicate pointer to the
original and call that `copy!`. Physical ABI references are not proof of
logical aliasing, ownership, or callee retention rights. Copy mode and the
callee's ownership mode must both survive typed IR, optimization, and AOT
lowering. In particular, do not optimize away a copy merely because a
read-only callee currently ignores the argument, without an established
effects/identity observability and cleanup proof.

**Required compiler-backed test targets (not claimed implemented):**
`inspect(copy! x)` and `inspect(copy!! x)` preserve the caller's owner;
the callee observes a different root identity; `inspect(borrow! x)` sees
the original; shallow legal shared children retain identity while deep
mutable children do not; `consume(take! copied)` consumes once; bare copy
temporaries to consuming formals reject; `copy!` of a unique nested mutable
child rejects with E_COPY_SHALLOW_ALIAS; failures, exceptions and cancellation
run correct loan cleanup/drop; copied temporaries cannot escape as borrowed
results; repeated arguments obey left-to-right evaluation and live-loan
conflicts. Keep separate backend statuses and exact-head guest receipts.

This rule is for the **versioned borrow-by-default profile** described by
`language/implicit-argument-borrow-v1.md`. Legacy compiler editions that
still implicitly move nonprimitive class formals must not silently claim this
behavior; reject unsupported ownership modes or require explicit edition
selection.

## Core object model and capabilities

Illustrative source syntax (the root-class declaration form and the capability requirement clause are **semantic sketches**, not claims of parser support):

~~~atto
define pub interface Copyable<T> as
    copy() -> T;
end

define pub interface DeepCopyable<T> as
    copy_deep() -> T;
end

// Object exposes both names as guarded virtual operations.
// Neither method is callable without a proved corresponding witness.
define pub class Object as
    // conceptual: copy(): new Self requires Copyable<Self>
    // conceptual: copy_deep(): new Self requires DeepCopyable<Self>
end

val a = copy! original;
val b = copy!! original;
// equivalent when the type is admitted:
val c = original.copy();
val d = original.copy_deep();
~~~

All identity-bearing Atto classes inherit the **names** copy and copy_deep from root Object. They do **not** inherit permission to use either method: the resolved receiver must have a verified Copyable<Self> or DeepCopyable<Self> witness, respectively. A bare Object-typed erased reference requires verified virtual witness dispatch or fails E_COPY_UNPROVEN; a method declaration, annotation, cast, or FFI stub is not proof. This avoids the unsound promise that arbitrary handles, actors, or native resources can always be copied.

A class/aggregate obtains its **Copyable** witness automatically if the compiler can prove a field-wise shallow plan, including inherited fields. A separate **DeepCopyable** witness is derived if the compiler can prove recursive duplication of mutable owned state. Users do not need to write implements Copyable or copy() in the common case. An explicit implements clause or positive annotation cannot grant an unproved capability; @NoCopy/NoCopy prohibits copying by default; @WarnOnCopy remains a lint.

For identity-bearing classes, the verified method returns **new Self** (a new logical root identity for the *concrete dynamic subtype*), as refined by fresh-return-types-v1.md. This does **not** imply unique ownership of all nested fields after a shallow copy. A type's copy! may be legal under shared child handles but fail a new unique Self refinement; a mutable root is independently owned while reachable children retain their authorized sharing. For scalar/identity-free values no fresh allocation is required.

## First-class copy policy and performance contract (2026-11-25)

The canonical hard opt-out is the zero-argument `@NoCopy` marker. Accept
`@NonCopyable` as an exact spelling alias, not an independent capability.
The following is a target source contract:

~~~atto
@NoCopy
define class SearchIndex as
    pub let int revision = 0;
end

define class Snapshot as
    pub let int version = 0;
    pub val Array<int> values = new Array<int>();
end

val index = new SearchIndex();
// copy! index;   // E_COPY_FORBIDDEN
// copy!! index;  // E_COPY_FORBIDDEN
val snapshot = new Snapshot();
val detached = copy!! snapshot;
~~~

- Hard denial is declaration-owned, survives imports, inheritance, upcasts,
  erased dispatch and generic specialization, and dominates positive witnesses.
  An owned field of a noncopyable type blocks any enclosing copy that would
  duplicate it, even for empty typed collections and inactive optional fields.
  A shallow copy may retain an independently authorized shared reference only
  when it does not duplicate the forbidden object itself and lifetime/authority
  proofs are explicit. No hidden bypass through methods, generated code or FFI.
- Duplicate markers (including both spellings), arguments and conflicting
  positive copy annotations are errors. `@WarnOnCopy` is the separate soft
  cost advisory; no silent fallback from shallow to deep. Moving or borrowing
  a noncopyable object is not copying it. Serializability is independent;
  encode/decode cannot be the implementation of a denied copy operation.
- A future `NonCopyable` interface, if provided, must be a compiler-recognized
  core nominal identity, not a spelling match on arbitrary user interfaces.
  It must have the same inherited negative policy and cannot be removed by a
  subtype. Do not advertise that syntax until nominal witness integration exists.
- Copy remains an explicit first-class typed IR operation with independent
  shallow/deep witnesses and fresh concrete identity. No implicit cloning on
  ordinary argument passing, assignment, actor send or return.

### Optimized lowering tiers

1. Identity-free scalars: use ordinary value transfer; no heap allocation.
2. Verified flat inline payload: generate a same-concrete-layout allocation
   followed by a bulk copy or unrolled field stores. Raw byte copy is permitted
   only for authenticated trivial representation ranges (no ownership handles,
   reference barriers, uninitialized padding, or resource/drop state).
3. Flat managed objects and scalar arrays: use a specialized field/buffer copy,
   preserve required barriers and validate exact layout; do not allocate a
   graph memo when no identity-bearing child can be traversed.
4. Acyclic owned trees: generated typed traversal; omit the identity memo only
   with a proof that no mutable identity can occur twice. Avoid constructors,
   reflection, serialization round trips, or repeated descriptor derivation on
   the hot path. Cache/precompile immutable plans by exact concrete type and
   code/layout generation, not by name or mutable address.
5. General cyclic/shared graphs: iterative worklist, one identity memo per
   top-level operation, reserve shells before outgoing edges, preserve alias
   topology, bounded work/memory, rollback unpublished state. Target expected
   linear work in reachable nodes, edges and copied payload bytes; no claim of
   measured complexity until production execution validates it.

All tiers preserve the same observable policy, fresh identity, dynamic subtype,
and failure atomicity. No graph-copy path transfers actor-private raw handles;
an actor-local allocation domain and generation must be established first.
AOT must not require runtime code generation. A backend may fuse allocation
with a subsequent transfer only after proving lifetime, identity and cleanup
equivalence.

### Performance acceptance

Benchmark actual compiled guest operations on each supported target: scalar,
flat class (small/large), flat array, deep tree, shared diamond, self-cycle,
10k-node cycle and 100k-node stress under an admitted budget. Report time/op,
bytes copied/s, allocations/op, peak live/scratch bytes, and p50/p95/p99
latency; distinguish setup, copy and cleanup. Compare against idiomatic
same-host Rust/C++ native implementations and managed-runtime equivalents,
using identical logical semantics and independent destination identities.
Require correctness and negative tests before reporting speed; no fixed speed
claim or benchmark waiver is implied by this specification.

## No implicit mutable aliasing (2026-11-25 reconciliation)

The language must not reproduce Go-style hidden mutable aliasing. This is a
strengthening of the existing shallow/deep distinction, not a change to
implicit argument borrowing or a new implicit cloning rule.

- Ordinary binding, assignment, aggregate construction, field stores, return,
  closure/task capture, argument passing and actor message admission MUST NOT
  manufacture a second owning alias to a mutable allocation. Intrinsic Copy
  values duplicate by value; nonprimitive call arguments may use the scoped
  read-loan profile. Any other alias, owning transfer or copy must be justified
  by its explicitly declared ownership mode and existing lifetime rules.
  Unproven cases reject; do not silently select an expensive deep copy.
- copy! creates a fresh shallow root, including independent outer collection
  storage. Every retained edge must be transitively immutable with proven
  lifetime, or an explicitly declared, authenticated shared capability with
  the appropriate read/write synchronization and ownership authority.
  Merely being a reference, a val binding, a Java reference, a JS object,
  a slice descriptor, a pointer or a reference-counted allocation is not proof.
  A nested exclusive mutable edge rejects with E_COPY_SHALLOW_ALIAS, even
  through imported classes, inherited fields, collection elements, erased
  types, or closures. A verified shared wrapper is visible in its type and
  is not represented as independently owned mutable state.
- copy!! detaches every reachable mutable identity, including the pointee of
  a mutable shared wrapper, or rejects if no verified reconstruction is
  possible. Only transitively immutable, lifetime-proven backing can be reused.
  No clone may retain mutable source aliases via an override or opaque FFI.
  The source and each separate clone are mutually isolated; repeated aliases
  and cycles *within* each clone preserve topology.
- Copy-on-write is an implementation optimization, not a third copy mode.
  It is allowed for either operation only if the required logical identities,
  topology, lifetime, isolation, cleanup and failure/resource contract are
  observationally preserved. Detach before any writable access, including
  nested mutation, mutable borrowing, iterators and native exposure.
  Do not turn shallow rejection into deep acceptance via COW.
- take! consumes a live owned place, without cloning. Proposed move! is an
  exact contextual spelling alias for take! (including named-place grammar,
  evaluation order, diagnostics, MIR, cleanup and invalidation); this is a
  candidate extension requiring lexer/parser/formatter and guest tests,
  not an implemented keyword. Canonical formatting remains take! until
  separately approved. Require whitespace after the full bang spelling.
- borrow! and borrow! mut are scoped loans, not copies or transfers.
  share! explicitly grants an admitted shared capability; neither copy mode
  grants implicit share authority over previously exclusive mutable state.

### Mandatory compiled conformance obligations

Each case must run through the actual backend frontend and applicable AOT or
transpiled guest path; negative cases must reject at semantic admission, not
merely crash at runtime. Keep exact-head/tree and stepful execution receipts.

| Case | Required behavior |
| --- | --- |
| Scalar assignment or flat scalar array copy! | Independent mutable slots; source unchanged |
| Nested owned Array<Array<int>>, Map values, inherited class field, closure capture | copy! rejects E_COPY_SHALLOW_ALIAS |
| Nested mutable graph copy!! | Mutating either graph leaves the other unchanged |
| Shallow explicitly shared guarded field | Retain authorized child identity; no unguarded write or ownership duplication |
| Deep explicitly shared mutable field | Reconstruct detached pointee or reject; never retain writable source alias |
| Read-only binding over mutable pointee | Does not establish transitive immutability or share proof |
| Cyclic graph and diamond graph; two successive copies | Preserve within-copy topology, isolate all three graphs |
| NonCopyable through inactive Option or empty typed collection | Copy denied where the declared owned layout requires forbidden capability |
| Erased or foreign layout without proof | Fail closed, including dynamic override and FFI |
| Ordinary assignment/return/argument/capture of affine class | No hidden clone or second owner; legal scoped loan where specified |
| take! and candidate move! | Identical ownership effects; reject later read, second move, move during conflicting loan |
| borrow! mut with live reader or escaping loan | Reject; immutable borrow does not confer write authority |
| Copy allocation failure and concurrent COW write | No partial publication, source mutation, double drop or alias leak |

No backend PASS is implied by these targets. The existing Java shallow-copy
candidate rejects nested mutable owned layouts; full recursive execution and
cross-backend enforcement remain separate gates.

## Field, array and collection rules

| Shape | copy! (shallow) | copy!! (deep) |
| --- | --- | --- |
| int, bool, number, identity-free value | Duplicate stored value | Same value (no meaningless allocation) |
| Immutable string/interned value | Reuse immutable backing | Reuse immutable backing where safe |
| struct / tuple / record / ADT with inline values | Copy immediate representation; inline values are naturally duplicated | Recursively copy owning mutable reference members |
| Class root | Fresh same-concrete-type object, copy fields one level; nested references remain the same only if legally shared | Fresh same-concrete-type object plus recursively copied owned mutable referents |
| Array<int> | New array storage containing copied integers | Equivalent result |
| Array<Array<int>> | New outer storage; inner array *references* are shared only if legally shareable; otherwise E_COPY_SHALLOW_ALIAS | New outer storage plus new inner arrays |
| List<T>, Set<T>, Map<K,V> | New container metadata/buckets; shallow element/key/value copy with alias proofs, including hash/equality invariant checks | New containers; recursively copy element/key/value with cycle/repeated-reference preservation |
| Borrowed view/slice, unique handle, actor, mutex, channel, socket | Reject without a type-specific verified capability; never copy raw ownership | Reject unless a separately proved deep reconstruction operation exists |
| Shared<T>, immutable reference | Retain same child with authorized sharing and correct refcount/lifetime | Recursively duplicate if contract calls for it; immutable backing may be reused |

A shallow copy must **not** copy a raw pointer/unique owner handle in a way that creates two independently droppable owners. For a mutable child reference that can legally be shared, preserve the reference identity and introduce exactly the checked sharing/lifetime obligations of the field type. If the child is exclusive/unshareable, fail with E_COPY_SHALLOW_ALIAS and suggest copy!! (if available), a deliberately shareable wrapper, or a resource-specific API. This is deliberate: copy! cannot promise a legal shallow copy of literally *every* object.

For arrays, copy! duplicates the **outer buffer and immediate element slots** (if element representation is inline; copy by value). Reference-typed element slots retain their referents only under share permission. A shallow array copy is not just copying the array descriptor/address, because then the outer container itself would still alias. Empty typed collections must still have an admitted element/key/value plan; no unproved generic specialization may pass only because runtime length is zero.

Shallow sharing is not actor transfer: actor-private references must not become accessible to another actor through a copy. Borrowed aliases may not be extended past their valid lifetime or out of critical regions. Shared children remain subject to read/write synchronization and borrower exclusion. A shallow copy is not a shortcut around ownership or mutation isolation.

## Deep-copy graph protocol

copy!! uses a **single copy context for the entire operation**: a source-identity-to-target map, allocation arena/domain, and rollback ledger. For an admitted mutable graph, allocate a fresh destination shell, register it **before** visiting children, and fill fields recursively with the *same* context. This preserves both repeated aliases and cycles. Each original mutable object gets one corresponding fresh object. Never expose a partially built graph; failure releases unpublished allocations exactly once. The source remains valid and unchanged.

A backend incapable of proving cycles, heterogeneous polymorphism, lazy fields, unsafe FFI, or unbounded graph depth must reject that case (E_COPY_GRAPH_UNPROVEN), rather than silently recurse forever or flatten identity. Hard-real-time profiles require bounded work and allocation, or explicit admission restrictions. Deep copy never serializes/deserializes secretly, suspends, does I/O, or migrates actor memory across domains without a separate proof.

## Overrides and Object dispatch

The compiler synthesizes no-argument copy() and copy_deep() for derivable types. Each method may be overridden **independently**; override signatures take no user arguments and retain their verified fresh-root return refinement.

~~~atto
define class Person as
    val string name = "";
    val Array<int> scores = Array.of();

    @Override
    copy(): new Self {
        val mut Self c = super.copy(); // synthesized SHALLOW baseline
        c.rebuild_shallow_cache();
        return c;
    }

    @Override
    copy_deep(): new Self {
        val mut Self c = super.copy_deep(); // synthesized DEEP baseline
        c.rebuild_deep_cache();
        return c;
    }
end
~~~

Within the corresponding override, super.copy() / super.copy_deep() are **reserved nonvirtual whole-concrete-type compiler baselines**, even when Object is the only parent. They include inherited state, never slice a derived subtype, and are invoked exactly once on every successful synthesized-baseline path. The deep baseline must reuse the operation's hidden graph context; a developer-visible optional context argument is forbidden. The override can post-process only the newly owned/root-authorized state and may not forge mutable aliases or publish an incomplete target.

A direct fresh-return override without super is allowed only when a separately verified full-copy construction plan proves the relevant mode's state/ownership obligations (e.g., concrete stateless class returning new Foo()). A signature claiming new Self alone is not proof. Overrides that silently convert shallow to deep, deep to shallow, or leak source-owned mutable children must be rejected. Custom ancestor hooks must be composable once in a deterministic order. Resource-specific reinitialization is not granted merely by implementing a copy method.

**Generic/static calls:** a type parameter T needs a proven T: Copyable<T> for copy! or T: DeepCopyable<T> for copy!!. Dynamic dispatch, imported modules, AOT interfaces, and all vtable/ABI slots must maintain the respective witnesses and concrete subtype. Intrinsic scalar Copy remains separate from these identity-bearing operations.

## Actor message fan-out: independent deep-copy domains (2026-11-17)

**Normative objective:** when one source value is copied for independent actors, each explicit copy!! operation creates a **separate mutable graph**, independent both of the source and of every other recipient's graph. A copy must not leak writable aliases via nested arrays, maps, class fields, inheritance, closures, ADTs, shared mutable smart pointers, or repeated references. Immutable data with a proven cross-actor lifetime/Sendable permission may retain an immutable backing store. A mutable Shared<T> pointee MUST be deeply cloned or fail closed; calling share! to preserve the same mutable identity is an independent operation with different contracts.

~~~atto
val original = new WorkItem();
worker_a.send(copy!! original);
worker_b.send(copy!! original);
// Both actor messages have independent owned mutable graphs.
// send(...) continues to return its ordinary admission Result.
~~~

- Every **top-level copy!! invocation** owns a fresh identity memo and rollback ledger. Do **not** reuse a graph memo across separate calls, different actors, retries, or subsequent sends. Within one invocation, use **one** memo for all fields, including superclass and subclass fields, nested containers and custom copy hooks, so duplicate internal references remain duplicated *once* and cycles preserve their topology. An object's original runtime identity is keyed together with its allocation domain, not its mutable/reused address alone.
- The typed actor send checks both the declared outgoing/incoming message contract (**sends/receives**) and the resulting **Sendable** ownership/transfer policy. **DeepCopyable does not automatically imply Sendable**, and serialization across processes/networks remains a distinct **Serializable** requirement. Actor, channel, task, lock, socket, native pointer, and capability-containing fields are denied by default until a deliberately designed type-specific transfer/copy capability exists.
- Sending a copy MUST NOT grant the recipient access to the sender's actor-private mutable allocations. First-class semantics: copy!! creates a detached owned value, and the send operation transfers the resulting value into the recipient's permitted ownership domain under its normal admission rules. An optimizer MAY fuse deep-copy allocation directly into the recipient's heap if it proves observational equivalence, the source remains unchanged, no temporary alias leaks, all effects and failure behavior are preserved, and mailbox publication is atomic. It MUST NOT silently send the sender's original through sharing.
- Multi-actor fan-out is **not** implicitly one atomic transaction. Each actor's send returns its own admission Result; if B rejects a message after A admitted its independent copy, A's message remains valid. A failed send must clean up only that unaccepted copy exactly once, without altering source or other admitted recipients. On retries, use fresh ownership or a new independent copy; never double-send a moved value.
- A manual copy!! is **not** implicit on every send. A caller chooses take!, copy!!, or an explicitly safe shared message. For hard-real-time actors, bound graph traversal, memory budget, allocation domain, and admission deadline must be proven or the operation is rejected.
- An arbitrary identity-bearing mutable graph cannot be Sendable merely because it has an unverified copy_deep override. The compiler must validate nested field policies transitively and preserve the check through type erasure, generics, FFI and AOT code generation.

## Superclass copy_deep(), field traversal and FULL AOT

**No runtime reflection/JIT is necessary.** Compile-time structural inspection is required: the compiler sees declared field layouts (including private fields), inherited base classes, generic instantiations, ADT variants and their ownership/lifetime policies, then emits **statically linked copy plans and readonly type descriptors** for each admitted concrete type. Descriptors are implementation metadata, NOT an unrestricted reflective API that lets user code read private fields.

Conceptual compiler-generated ABI (illustrative C-like pseudocode, not source Atto code):

~~~c
struct DeepCopyDescriptor {
    TypeId stable_type_id;
    LayoutId layout_version;
    size_t size, alignment;
    bool is_sendable;
    void (*copy_into)(const void *source, void *unpublished_target,
                      GraphCopyContext *ctx);
    void (*drop_partial)(void *target, GraphCopyContext *ctx);
    const FieldCopyDescriptor *fields; // includes all inherited fields
    size_t field_count;
};
~~~

The emitted descriptor need not contain a **runtime-walkable fields array**: a statically generated per-type function that directly accesses each known offset is sufficient and preferable for native/hard-RT AOT. Optional closed-world descriptors support compiled virtual dispatch and diagnostic introspection. Whether emitted as direct code or a metadata-driven static walker, the contract must be equivalent:

1. Resolve the source's **concrete dynamic type ID**, not merely its static Object/base type. Dispatch through a link-time known/registered **verified DeepCopyable witness**. For a base-typed reference pointing to Derived, allocate a Derived shell in the correct target allocation domain, never slice to Base.
2. Before following references, allocate the shell **without replaying effectful constructors, destructors or arbitrary field initializers**, memoize source identity to unpublished target, and then copy all Base and Derived instance state exactly once in deterministic layout order. Scalar fields are copied by value; nested mutable owned references recurse through their **concrete type's** emitted function with the *same* GraphCopyContext. Verify subtype/generic witnesses, private/hidden fields, overlap/union tags, weak references and resource policies before admission.
3. If Base implements/overrides copy_deep(), an inherited dispatch on Derived must still copy **Derived**. The generated whole-concrete-type baseline behind super.copy_deep() is a reserved nonvirtual compiler operation, not a virtual call back to Base.copy_deep() that recurses and not a Base-only memberwise clone. AOT-generated hook chaining includes verified base and derived user hooks at most once each in deterministic ancestor-to-descendant order. Reentrant deep-copy of a graph node consults the memo instead of creating a second shell. Reject uncomposable hooks or any hook that publishes a partially constructed target.
4. Distinguish **user-visible no-argument** copy_deep() from the **compiler-internal** helper copy_deep_into(source, ctx, destination_domain) / generated vtable entry. The hidden ctx and allocation domain can be passed by registers/ABI or specialized compile-time constants; neither becomes an optional user argument.
5. All reachable types and dispatch targets must have a compiled witness in the final AOT image or separately **precompiled**, integrity-checked registration module with a compatible layout/provenance ABI (for intentional hot loading). No runtime code synthesis, general reflection-based constructor invocation, dynamic class loading as a proof substitute, or fallback to raw memcpy on reference-bearing objects. Unknown, erased, unregistered, stale-layout, noncopyable, or open-world objects MUST reject deterministically (E_COPY_AOT_WITNESS or E_COPY_LAYOUT) rather than silently clone incomplete state.
6. Foreign/native fields need an explicit verified hook/descriptor or are noncopyable. Private fields are accessible to the generated compiler code but remain protected from user programs. Backend optimizations may elide descriptor iteration or use direct memcpy **only for representation-trivial, identity-free fields** with an established Copy proof.

Copying data into another actor's arena requires a **destination-aware allocation plan**. Cross-actor pointers to mutable data are prohibited; source pointers remain usable only within source read authority. A compiled field descriptor is *not* permission to ignore actor state sealing, borrow checker critical-read/critical-write rules or native object lifetime.

**Diagnostics:** E_COPY_AOT_WITNESS for missing concrete dynamic witness/closed-world dispatch; E_COPY_LAYOUT for unrecognized layout/version/field shape; E_COPY_ACTOR_ISOLATION for an illegal mutable cross-actor alias; E_COPY_SENDABLE for failed message transfer/Sendable proof. Preserve existing E_COPY_GRAPH_UNPROVEN, E_COPY_OVERRIDE, E_COPY_EFFECT, E_COPY_TRANSITIVE and cleanup diagnostics.

**Required AOT and actor conformance:** base-typed/erased reference to Derived with Base and Derived private fields; inherited Base copy_deep() overridden or not; mixed generic field instantiations; nested mutable Array and Map; shared child within one message but detached across two copy!! invocations; cycles, missing witness, failing custom override, failed second-recipient send cleanup, and no initializers rerun. Verify compiler-emitted dispatch and real native-AOT binaries, not just a source-only graph oracle. The independent recipient property must hold even if messages are processed concurrently on different actors. Hard-real-time compile gates must separately constrain work and allocation.


## Lexing, precedence and lowering

- Lex **copy!!** as a dedicated maximal-munch prefix token before **copy!** (not as copy! followed by logical negation). Tokens are separate from **!** / **!=**; whitespace inside copy!! is not allowed.
- Both operators occupy the same prefix-expression precedence slot as existing ownership bangs (take!, share!, borrow!) and bind their full operand according to the existing ownership-prefix grammar. Parenthesized expressions are accepted; operand is evaluated once.
- Lower to two **distinct** checked IR nodes, e.g. SHALLOW_COPY and DEEP_COPY. Preserve the source place, concrete dynamic type, ownership/lifetime, effects, and the verified witness; do not erase mode before borrow checking or AOT.
- Canonical formatter outputs copy! x and copy!! x. If compatibility rt copy exists, it retains **shallow** semantics as an alias of copy! (never old implicit deep semantics).
- Both operations are explicit, deterministic at their typed boundary, synchronous unless a separate future effectful API is introduced, and must be fail-atomic if a permitted allocator/copy hook can fail.

## Required negative diagnostics

- E_COPY_UNPROVEN: missing appropriate mode-specific witness, unresolved generic/dispatch, wrong Object virtual target.
- E_COPY_FORBIDDEN: @NoCopy, unique resource, actor-private disallowed type, or forbidden payload.
- E_COPY_SHALLOW_ALIAS: mutable nested alias is not shareable or would create two unique/droppable owners.
- E_COPY_TRANSITIVE: nested type/field/index cannot satisfy the chosen copy mode; report provenance.
- E_COPY_GRAPH_UNPROVEN: unsupported deep-copy graph topology, depth, cycles, or dynamic subtype.
- E_COPY_ALIAS: copy or deep copy returns same root identity; deep copy retains unauthorized source mutable nodes.
- E_COPY_OVERRIDE: wrong baseline, duplicate/missing baseline without direct proof, cross-mode call, forged alias or leaked target.
- E_COPY_INHERITANCE: ancestor/child cannot compose safely or would slice.
- E_COPY_VIEW: lifetime/view copy cannot satisfy contract.
- E_COPY_EFFECT: I/O, suspension, unbounded work in hard-RT profile, unsupported failure or cleanup effects.
- E_FRESH_*: see fresh-return-types-v1.md; freshness and unique ownership are separate promises.

## Execution and audit acceptance

1. Parser + formatter round-trip both bang spellings and reject copy! !x as an accidental deep copy, missing operand, and invalid user arguments to the operators.
2. Actual compiled guest tests: copy! Array<int> allocates a new outer buffer; copy! Array<Shared<Array<int>>> creates a new outer buffer but retains child references; copy!! Array<Array<int>> duplicates children; nested repeated child pointers remain repeated within the deep result, not shared with source; deep cycles succeed only with verified memoized support.
3. Actual negative guest tests: copying nested exclusive owners shallowly, unshareable actor/private handles, @NoCopy, unproved erased types, source-identity copy return, shallow alias in deep result, wrong subtype, unverified custom override, wrong effect, dangling borrowed view, and resource double-drop.
4. Test custom copy() versus copy_deep() overrides, their independent baselines, zero argument arity, once-only source evaluation, ancestor hook composition, and failure rollback.
5. Require exact-source compiler-backed parser/type/lowering/guest and native-AOT/sanitizer evidence independently from Java/GraalVM, LLVM, .NET, Wasm, Forge and Rust/JS where supported. Host-only graph tests are **not** compiler support. A zero-step Actions run is **NOT_EXECUTED**.

## Related work requiring reconciliation

- Older deep-default draft in this PR and companion fresh-return-types-v1.md; this file is the revised source of truth for mode selection.
- oreslang-source.java PRs #148, #2337, #2580; atto-source.rs #135; ownership-bang spec #67, Java frontend #3112, formatter #144.
- atto-platform-conformance PR #45 currently assumes the earlier deep-default profile; its fixtures must be revised, not recorded as passing for this change.

This remains a design and reference-test proposal. No cross-backend runtime support is claimed.
