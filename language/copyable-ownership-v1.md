# Copyable and DeepCopyable — shallow/deep ownership-safe copying (v2 draft)

**Status: candidate language contract; NOT implemented across compilers. Updated 2026-11-17.** This revision supersedes the earlier deep-by-default interpretation of copy! in this draft PR. Existing host-only oracle tests and prior CI reports are **not** evidence of compiled AttoLang behavior. Reconcile the older Java and Rust copy contracts before implementation.

## Decision

- **copy! expression** means *shallow copy*. Evaluate its operand exactly once. For an identity-bearing class, construct a **fresh concrete root object** and copy every immediate field without recursively copying referenced objects. Embedded value fields are copied by value. Immutable references may be reused; mutable descendants may be retained only by a verified, transactional conversion to transitively read-only sharing across every alias. Unfreezable or unproved edges reject.
- **copy!! expression** means *deep copy*. Evaluate its operand exactly once. Construct a **fresh mutable graph**, recursively duplicating owned mutable reachable objects, while preserving internal repeated references and cycles where the backend admits a verified graph copier. Proven immutable interned data may be shared.
- **obj.copy()** corresponds to copy! obj and **obj.copy_deep()** corresponds to copy!! obj, subject to the same static witness and dynamic subtype obligations.
- The two public methods accept **zero arguments**. Implementation-specific allocation/graph context is an **invisible compiler/runtime parameter**, not a user-visible argument. Application-specific variants may have named methods like copy_with(options), but operators NEVER forward arguments.
- copy! and copy!! require separate capabilities. DeepCopyable does not imply Copyable: a type with uniquely owned mutable descendants may support a deep copy but not a shallow copy. Do not automatically change copy! into copy!! when shallow copying is unsafe.
- take! (equivalently move!) transfers ownership of the original. share! shares the original identity with separately verified permissions. Neither is an alias or fallback for either copy operator.

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
child without proven read-only loan admission rejects with E_COPY_SHALLOW_ALIAS; failures, exceptions and cancellation
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

A class/aggregate may obtain a **Copyable** shallow witness only after proof of safe field-wise shallow copying, including inherited fields. **DeepCopyable is explicitly opt-in for nominal classes and structs** (owner decision 2026-11-25). The declaration must explicitly implement the compiler-recognized core DeepCopyable<Self> interface/trait (illustrative spelling below); an inferred layout, ordinary Copyable, Object method, annotation, cast, or structural lookalike is not consent. After opt-in the compiler may synthesize the complete verified deep-copy implementation without handwritten methods. Explicit consent alone is insufficient: recursively verify all owned mutable nominal nodes, inherited fields, generic instantiations, container elements, and possible concrete dynamic types. Intrinsic scalars and standard structural containers use compiler/core-defined witnesses constrained by their elements; they cannot bypass missing nominal consent even when empty or an ADT variant is inactive. @NoCopy/@NonCopyable overrides opt-in; @WarnOnCopy remains a lint. Shallow admission is independently governed by the read-only sharing rule below; explicit nominal deep opt-in remains unchanged.

~~~atto
define class Snapshot implements DeepCopyable<Snapshot> as
    pub let int version = 0;
    pub val Array<int> values = new Array<int>();
end

define struct Point implements DeepCopyable<Point> as
    int x;
    int y;
end

define class NotOptedIn as
    pub let int value = 0;
end

val source = new Snapshot();
val detached = copy!! source;  // verified generated plan
val other = new NotOptedIn();
// copy!! other;               // E_COPY_OPT_IN_REQUIRED
// other.copy_deep();           // same rejection
~~~

The snippets specify the target nominal interface contract, not existing parser support. Each concrete nominal subtype that can introduce owned state must explicitly opt in; an inherited method or a base witness cannot authorize a new concrete layout automatically. Import and erased dispatch must preserve the authenticated declaration witness, and recursive opted-in SCCs must be verified together, never by assuming an unfinished proof. A class/struct without deep-copy opt-in remains usable by ordinary lawful value/loan/transfer operations; this does not disable intrinsic scalar copies or verified shallow copy. No reflection, serialization round-trip, generic fallback or compiler optimizer may bypass the permission check.

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

define class Snapshot implements DeepCopyable<Snapshot> as
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
  storage. Every retained mutable descendant must become transitively read-only
  through ALL aliases in the same verified ownership domain. This includes
  the original owner, the new root, earlier aliases, loans, iterators, method
  receivers and erased or imported references. Existing unique ownership may
  be converted only with a proven scoped read-loan or separately authorized immutable sharing transition; unfreezable edges,
  outstanding exclusive loans and opaque resources reject E_COPY_SHALLOW_ALIAS.
  Merely being a reference, a val binding, a Java reference, a JS object,
  a slice descriptor, a pointer or a reference-counted allocation is not proof.
  The source and target root slots remain independently writable where their
  declarations permit mutation, unless the root itself is a shared descendant.
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
- take! consumes a live owned place, without cloning. **move! is an
  approved exact contextual spelling alias for take!** (owner decision
  2026-11-25), including named-place grammar, evaluation order, diagnostics,
  MIR, cleanup and invalidation. It grants no new ownership capability.
  Canonical formatting remains take!; both source spellings are accepted
  in the target profile. Require whitespace after the full bang spelling.
  Bare move remains an ordinary identifier; no rt move alias or move!!
  operator is introduced. Backend support requires actual guest evidence.
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
| Nested owned Array<Array<int>>, Map values, inherited class field | copy! admits only with verified lexical read loans; otherwise E_COPY_SHALLOW_ALIAS |
| Nested mutable graph copy!! | Mutating either graph leaves the other unchanged |
| Shallow explicitly shared guarded field | Retain authorized child identity; no unguarded write or ownership duplication |
| Deep explicitly shared mutable field | Reconstruct detached pointee or reject; never retain writable source alias |
| Read-only binding over mutable pointee | Does not establish transitive immutability or share proof |
| Cyclic graph and diamond graph; two successive copies | Preserve within-copy topology, isolate all three graphs |
| Nominal class/struct without explicit DeepCopyable | copy!! and copy_deep() reject, even for flat layouts; opted-in safe equivalents succeed |
| Generic/nested/derived nominal node lacks opt-in | Reject through empty containers, inactive variants, inherited or erased dispatch |
| NonCopyable through inactive Option or empty typed collection | Copy denied where the declared owned layout requires forbidden capability |
| Erased or foreign layout without proof | Fail closed, including dynamic override and FFI |
| Ordinary assignment/return/argument/capture of affine class | No hidden clone or second owner; legal scoped loan where specified |
| take! and move! | Identical ownership effects; reject later read, second move, move during conflicting loan |
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

A shallow copy must **not** duplicate a raw unique owner handle. Preserve the descendant identity, convert every path to read-only authority transactionally, and enforce lifetime/retention independently. Unproved transitions reject E_COPY_SHALLOW_ALIAS. A backend lacking this capability must retain its existing conservative rejection, not allow writable aliases.

For arrays, copy! duplicates the **outer buffer and immediate element slots** (if element representation is inline; copy by value). Reference-typed element slots retain their referents only under share permission. A shallow array copy is not just copying the array descriptor/address, because then the outer container itself would still alias. Empty typed collections must still have an admitted element/key/value plan; no unproved generic specialization may pass only because runtime length is zero.

Shallow sharing is not actor transfer: actor-private references must not become accessible to another actor through a copy. Borrowed aliases may not be extended past their valid lifetime or out of critical regions. Shared children remain transitively read-only until exclusive ownership and absence of conflicting loans are proved; synchronization alone is not permission to write. A shallow copy is not a shortcut around ownership or mutation isolation.

## Read-only shallow sharing: executable semantic profile (2026-11-25)

- A fresh root owns its independent slots, including map entries, array slots,
  class fields and record fields. Mutation of scalar slots, replacement/removal
  of references and insertion of newly owned values is legal under the normal
  declaration and collection rules. Closed records do not gain undeclared fields.
- A retained mutable identity shared between independent roots is transitively
  read-only. Replacing a reference detaches that path; it does not mutate the
  shared referent. Adding a new slot that points at an already shared identity
  does not grant write permission. Key hash/equality invariants remain mandatory.
- Write recovery requires proof of one remaining owning domain/path group and
  no live conflicting loans, including read loans. Multiple paths within a
  single owner need not permanently freeze data. Multiple independent copies
  must each release their rights before recovery. No automatic thaw of
  permanently immutable values or previously freed/stale references.
- Cycles matter: if the new root retains a path to the original root itself,
  the original root is also read-only until that shared reachability ends.
- Before publication, verify every required type capability, domain, generation,
  conflicting loan, and budget. Failed copy must leave original rights unchanged.
  Atomic admission/retirement is required; no check-then-write races, no cross-
  actor private heap sharing, no mutation through FFI or indirect callbacks.
  Statically reject known forbidden writes (E_COPY_READONLY); dynamically
  uncertain access requires a verified guarded capability or compile rejection.
- No implicit copy-on-write. Explicit copy!! of shared backing creates a fresh
  mutable graph only if all deep opt-in and ownership proofs are present.

The host oracle `tests/copy-readonly-sharing-v1.test.mjs` independently
recomputes root reachability for every access. This deliberately slow oracle
is not a runtime implementation or a claim of compiled guest support. It
uses a conservative phase-1 hard denial of noncopyable descendants and
abstracts away typed layout, real allocation/reclamation, scheduling and
nominal deep-consent checks. Production needs efficient read-only capability
tracking, generation fences and verified write barriers rather than graph
rescanning on every write. The older v2 explicit mutable-share oracle is
historical only where it conflicts with this profile.

## Lexical shallow-copy loans (owner clarification, 2026-11-25)

For a shallow copy that retains owned mutable descendants, the initial
profile uses a scoped read loan, not permanent freezing or a second
owner. The fresh root has independent slots, but the retained graph has
read-only authority through both roots and every pre-existing alias.

~~~atto
let Person a = new Person();

block {
    val b = copy! a;
    stdio.println(b.scores);
    // a.scores.add(42); // E_COPY_READONLY
    // b.scores.add(42); // E_COPY_READONLY
}

a.scores.add(42); // legal if no other loan survives
~~~

- Use explicit block {} for standalone lexical scopes. The compiler records
  the source ownership origin, each retained mutable identity or a proven
  conservative region, and the dependent result lifetime. A reference
  slot in the shallow root is a read-loan capability, not a duplicated
  owner. Existing immutable backing requires only its usual lifetime proof.
- While a dependent copy or derived read view survives, neither the source
  nor the copy can write, take!, move!, drop!, or mutably borrow the retained
  graph. A conflicting write through an earlier alias, iterator, method,
  capture or FFI must also reject. Independent scalar/root slots may be
  changed when permitted. A root that is itself reachable through a retained
  cycle is subject to the same loan.
- For phase 1 use conservative lexical lifetimes: dependent copies stay in
  their source's proven region, cannot return as owned values, be stored in
  longer-lived objects, cross actor/task boundaries or survive suspension
  without separate proof. A copy of a loan-backed copy must preserve the
  original provenance and must not extend its lifetime. Reject taking or
  dropping the source owner while dependent loans survive. Explicitly
  moving the dependent root within its region does not erase its loan.
- Replacing a copy's reference slot with a newly owned value does not
  mutate the borrowed descendant. Releasing that loan early is allowed
  only when all paths and derived views for that loan are proved dead;
  otherwise retain it until lexical cleanup. Source replacement must not
  destroy or transfer borrowed backing.
- Restore exclusive write authority only after the last overlapping loan
  ends and the source remains live and unique. On normal block exit, early
  return, break, continue, exceptional unwind or cancellation, release
  admitted loans exactly once in reverse lifetime order. Never thaw frozen
  backing. Admission is transactional: a failed copy cannot strand a loan
  or publish a partially initialized root.
- copy!! is distinct: require explicit DeepCopyable nominal consent and
  recursively proven capabilities; detach the graph or reject. Do not
  silently convert copy! into copy!! or automatic copy-on-write.

The additional host-only lexical-loan oracle
tests/copy-lexical-loan-v1.test.mjs checks these state transitions. It is
not a compiler, a runtime allocation proof, or a replacement for guest
execution.

### Symmetric field permissions and fresh additions (owner clarification, 2026-11-26)

- For a successful `copy! a`, neither `a` nor its copy has write authority over a retained shared referent, directly or transitively. The source has no privileged writer role. Assignment into a nested member, in-place collection operations, compound mutation of shared storage, mutable method receivers and mutable borrows are all writes to that storage, not whole-slot replacement.
- Either independently writable root may completely replace its own mutable field with a fresh or independently owned value; subsequent reads and writes of that replacement are permitted under ordinary type, mutability, lifetime and ownership rules. Inline identity-free fields are independently copied values, not shared referents. A replacement must not confer write access to the other root or to a still-shared descendant of the replacement graph.
- Either root may add a genuinely new field/entry/slot when its declared type and collection or structural-shape rules permit addition. Fresh independently owned backing is immediately readable and writable there; a new slot holding an existing shared reference remains transitively read-only. Adding a field to a retained shared child is itself a forbidden write. Closed nominal classes and records do not gain arbitrary fields; use a separately admitted shape-changing construction where applicable.
- `copy!!` continues to produce independently owned mutable storage, subject to nominal deep-copy consent and verified graph-copy obligations. Neither operator grants mutation of intrinsically immutable fields.
- Require symmetric positive guest cases for fresh additions and whole-slot replacement on both source and copy; negative cases for new aliases to shared descendants, additions inside a shared child, and mutation through earlier aliases or mutable methods. A backend without the relevant structural/collection feature must report it unsupported, not treat parser rejection as successful ownership enforcement. Preserve the existing multiple-copy, loan retirement and transactional failure cases.

### Whole-slot replacement and transactional detachment

A slot's write permission and the referenced identity's write permission are
independent. A shallow copy may retain a read-only referent in a writable slot.
Both original and copy may replace the whole slot with a separately admitted
value, provided the containing object is writable and the slot declaration,
element/key type and lifetime rules allow replacement. In particular:

- Evaluate the receiver, slot selector and replacement expression once in the
  prescribed order. Validate type and ownership, including a prospective
  move and all affected sharing/loan rights, before publishing the replacement.
  A failed replacement must not release the old path or consume a donor owner.
- Overwriting a slot is not a write through its old reference. Replacing with
  a fresh owned graph, an admitted move, a scalar, or None where typed permits
  is legal. Replacing with another shared reference does not grant mutation.
  Immutable slots, writes inside a shared containing object and undeclared
  closed-record fields remain forbidden.
- Release only the replaced path's retention after successful publication.
  Repeated references, cycles, other roots, outstanding read loans and
  permanently immutable backing can all prevent write recovery.
- Map key hash/equality restrictions, collection shape, bounds, drop/finalizer
  ordering, concurrent access and actor generation fencing remain independent
  obligations. No implicit deep copy or copy-on-write occurs.

Candidate source example (compiler-backed verification still required):

~~~atto
define class Person as
    let Array<int> scores = Array.of(10, 20);
end
let Person original = new Person();
let Person copied = copy! original;
copied.scores = Array.of(40, 50);
copied.scores.add(60);
// Original scores regain write access only if no other paths/loans forbid it.
original.scores.add(30);
~~~

The Java ShallowSlotDomain draft (#1881) exercises an opaque identity-based
runtime substrate with transactional replacement and bounded root reachability
accounting. It is not integrated guest execution or a production performance
claim; the real compiler must emit typed slot operations and preserve all
mutability/loan constraints.

## Deep-copy graph protocol

copy!! uses a **single copy context for the entire operation**: a source-identity-to-target map, allocation arena/domain, and rollback ledger. For an admitted mutable graph, allocate a fresh destination shell, register it **before** visiting children, and fill fields recursively with the *same* context. This preserves both repeated aliases and cycles. Each original mutable object gets one corresponding fresh object. Never expose a partially built graph; failure releases unpublished allocations exactly once. The source remains valid and unchanged.

A backend incapable of proving cycles, heterogeneous polymorphism, lazy fields, unsafe FFI, or unbounded graph depth must reject that case (E_COPY_GRAPH_UNPROVEN), rather than silently recurse forever or flatten identity. Hard-real-time profiles require bounded work and allocation, or explicit admission restrictions. Deep copy never serializes/deserializes secretly, suspends, does I/O, or migrates actor memory across domains without a separate proof.

## Overrides and Object dispatch

The compiler synthesizes no-argument copy() for admitted shallow types and copy_deep() only after explicit nominal opt-in and verified derivation. Each method may be overridden **independently**; override signatures take no user arguments and retain their verified fresh-root return refinement.

~~~atto
define class Person implements DeepCopyable<Person> as
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
// WorkItem explicitly implements DeepCopyable<WorkItem>.
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
3. If Base implements/overrides copy_deep(), dispatch on Derived requires Derived's own explicit opt-in and verified concrete witness, then must still copy **Derived**. The generated whole-concrete-type baseline behind super.copy_deep() is a reserved nonvirtual compiler operation, not a virtual call back to Base.copy_deep() that recurses and not a Base-only memberwise clone. AOT-generated hook chaining includes verified base and derived user hooks at most once each in deterministic ancestor-to-descendant order. Reentrant deep-copy of a graph node consults the memo instead of creating a second shell. Reject uncomposable hooks or any hook that publishes a partially constructed target.
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

- E_COPY_OPT_IN_REQUIRED: nominal class/struct lacks explicit core DeepCopyable consent, including reachable concrete subtypes and nested nominal fields.
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
3. Actual negative guest tests: copying nested owners without a verified read-only transition, writing shared descendants through either root or earlier aliases, unshareable actor/private handles, @NoCopy, unproved erased types, source-identity copy return, shallow alias in deep result, wrong subtype, unverified custom override, wrong effect, dangling borrowed view, and resource double-drop.
4. Test custom copy() versus copy_deep() overrides, their independent baselines, zero argument arity, once-only source evaluation, ancestor hook composition, and failure rollback.
5. Require exact-source compiler-backed parser/type/lowering/guest and native-AOT/sanitizer evidence independently from Java/GraalVM, LLVM, .NET, Wasm, Forge and Rust/JS where supported. Host-only graph tests are **not** compiler support. A zero-step Actions run is **NOT_EXECUTED**.

## Related work requiring reconciliation

- Older deep-default draft in this PR and companion fresh-return-types-v1.md; this file is the revised source of truth for mode selection.
- oreslang-source.java PRs #148, #2337, #2580; atto-source.rs #135; ownership-bang spec #67, Java frontend #3112, formatter #144.
- atto-platform-conformance PR #45 currently assumes the earlier deep-default profile; its fixtures must be revised, not recorded as passing for this change.

This remains a design and reference-test proposal. No cross-backend runtime support is claimed.
