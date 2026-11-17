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
