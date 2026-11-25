# 27 — Inferred lifetimes without apostrophe markers

**Status: TARGET / DESIGN PROPOSAL (2026-11-17).** This chapter defines source
syntax and proof obligations; it does **not** claim executable compiler support.
It must be reconciled with the outstanding ownership-bang syntax proposal
(PR #67), the effect/lifetime contract (PR #33), the scalar NLL compiler stack,
and the canonical Rust MIR verifier. Fail closed on unsupported backends.

## Decision

AttoLang requires Rust-grade memory and alias safety, with **inferred lifetimes
by default** and no Rust-style apostrophe identifier syntax (`'a`, `'static`).
When annotation is necessary, a compile-time generic *kind* introduced by `lt!` (long form `lifetime!`) and a
named lifetime argument are used:

```atto
fnc identity<T>(x: Borrow<T>) -> Borrow<T> {
    return x;
}

fnc first<T, lt! a, lt! b>(
    x: Borrow<T, lt=a>,
    y: Borrow<T, lt=b>
) -> Borrow<T, lt=a> {
    return x;
}
```

These are **target signatures** and are not yet admitted by the browser compiler.
`Borrow<T>` means a non-owning shared loan; `BorrowMut<T>` means an exclusive
mutable loan, both carrying compiler-proven provenance. Neither is an independently
owned `T`, a raw pointer, a `ref!` handle, nor a transferable actor capability.
Named `lt=a` is compile-time metadata; it has no runtime value and no
allocation or reclamation side effect.

`borrow! owner` and `borrow! mut owner` are the preferred *loan-creation*
operators once ownership-bang aliases are ratified. The old `rt borrow` and
`rt borrow mut` spellings remain compatibility forms under PR #67; lifetime
types must not silently reinterpret those expressions as owned values.
Compiler acceptance of `borrow!` today does not certify `Borrow<T>` types.


## Explicit reference and pointer types (target, no sigils)

**Reconciliation boundary:** the current canonical ownership and lexer contracts do not yet ratify ref!/deref!/unref!. The checked-handle spelling discussion below is a separately gated proposal, not a change to that decision. Existing rt ref/deref/unref are checked-handle operations; no compiler may infer acceptance of the bang aliases. Named lifetime binders and loan proofs are independent of that spelling question.

**Decision:** AttoLang spells borrowed and pointer types by name. There are no
pointer or borrow type sigils, and no dereference/borrow operators based on
`*` or `&`. These characters retain unrelated uses, such as multiplication
(`a * b`) or logical conjunction (`a && b`), where already specified.

| Type | Semantic capability |
| --- | --- |
| `T` | Context-dependent: ordinary nonprimitive function/method **formal** is a loan by default; an owning local or result can still be owned |
| `Borrow<T>` | Shared immutable loan, lifetime inferred by default |
| `BorrowMut<T>` | Exclusive mutable loan, lifetime inferred by default |
| `Shared<T>` | Explicitly authorized shared/frozen ownership |
| `Pointer<T>` | Pointer-like address or checked handle, **not** a safe borrow and **not** an owned `T` |

A `Pointer<T>` value must never automatically confer read, write, drop,
actor-transport, or ownership rights. Construction, pointer conversion,
dereference and lifetime validity require separately checked runtime/FFI
capabilities and provenance. The proposed checked-handle operations
are `ref! value`, `deref! handle` and `unref! handle`;
`rt ref`, `rt deref` and `rt unref` are compatibility forms.
These must lower identically to their legacy checked-handle operations,
and never imply that any `Pointer<T>` is automatically borrowable
or dereferenceable. A verified `deref!` returns only the access/view
allowed by the handle's actual rights and original owner lifetime;
`unref!` consumes it exactly once, not necessarily an allocation
decrement. If a live dependent view exists, retirement is forbidden.
An owned value may be returned from `unref!` only when its particular
checked-handle contract proves safe ownership restoration.
The operations must preserve exactly-once operand evaluation, domain,
actor/arena, allocation extent, generation, alignment, bounds,
permissions, cleanup, unwind and cancellation conditions.
Unsupported backends reject **both** spellings before guest emission.
Their exact result types and safety preconditions must be independently
verified per backend; `Pointer<T>` is **not** a new spelling for
`Borrow<T>` and is not a portable raw wire address.
Additional pointer access qualifiers, if ever needed, must be separately
specified; do not silently infer mutability from `Pointer<T>`.

### Checked-handle admission and anti-erasure audit

By default, a backend without a **verified, typed, explicitly
bounded checked-handle profile** rejects every `ref!`, `deref!`,
`unref!` or legacy `rt` counterpart with a dedicated diagnostic
and no guest bytes. A backend **may** admit only an independently
checked subset, such as source-minted non-reused local class handles
with all-path lifetime proof. This does not confer wider pointer,
actor transport, allocation-reuse or FFI permissions. The
single-worker Wasm compiler's bounded checked-handle guest profile
is described in [compiler PR #264](https://github.com/atto-lang/atto-source.rs/pull/264);
the conservative NLL frontend's all-reject profile is in
[compiler PR #311](https://github.com/atto-lang/atto-source.rs/pull/311).
Reconciliation must be profile aware, never a blind gate merge.

The fail-closed scan runs on the complete parsed source AST **before**
lambda lifting, optimizer dead-code elimination, generated methods,
CFG planning, or other rewriting that might erase a handle occurrence.
It must account for nested expressions, match guards, condition arms,
loops, lambda bodies, error/defer/recover cleanup, function bodies,
class field initializers, constructors, class/actor methods,
actor-state field initializers, and receive handlers. Parser and
programmatic AST entry points must be covered. Unknown traversal
effects, excessive nesting, or work-budget exhaustion are rejection
conditions, not a reason to assume an omitted handle is safe.
The scanner must not recursively inspect diagnostic positions before
applying its depth bound.

Candidate `ref! value` and legacy `rt ref value` spellings must
resolve to the same checked-handle AST operation; combining them
as `rt ref! value` (likewise deref/unref) is a syntax error.
An attached bang marker is required for candidate spelling;
`ref !value` is not an alias. Use a single evaluation of each
operand and disallow an extra `mut` qualifier. Once true codegen
exists, the lifetime and generation verifier still must prove
exactly-once retirement and cancellation/exception safety: a
**successful syntax test does not authorize handle execution**.

### Generational arena and owner-preserving failure obligations

A future general checked-handle arena must validate **arena, actor,
domain, allocation slot, generation and access permissions** before
returning a view. A reused slot must advance generation; when the
generation representation is exhausted, the slot must be retired,
never wrapped to a previously valid capability. Copying a handle
token cannot create or duplicate ownership. `unref!` must fail
while any dependent checked view remains active, and a second
`unref!` or stale `deref!` must always fail.

**Creation failures must preserve ownership.** If `ref! owner` cannot
admit a handle (e.g. bounded capacity or unavailable domain authority),
its failure result must make the original owned value recoverable or
otherwise preserve an explicitly proven cleanup obligation; it must
never silently drop a still-live owner during a failed conversion.
Precise guest `Result`/error spelling remains subject to typed
effects integration.

The Rust-side generational arena foundation is currently in
[compiler #264](https://github.com/atto-lang/atto-source.rs/pull/264)
and [compiler #311](https://github.com/atto-lang/atto-source.rs/pull/311).
Its unit tests have been **authored but not executed** at the new
source head because private Actions carriers failed at admission
with zero job steps. Its `CheckedArena<T>` is a host-memory model,
**not** a wired guest ABI or authenticated actor scheduler. Earlier
executed guest tests prove only the restricted, non-reusing local
class profile. Do not use this host module as evidence of native/
Wasm/actor-domain parity, cancellation safety, or a general
`Pointer<T>` contract.

### Canonical named lifetimes: `lt! a` and `lt=a`

Default lifetime elision is the shortest notation: `Borrow<T>` or
`BorrowMut<T>`. When provenance is ambiguous across multiple inputs,
declare a named lifetime parameter using **`lt! a`**. The long form
`lifetime! a` is a source-compatible alias; formatters emit `lt! a`.
Reference it by the **named** generic argument `lt=a`, never a positional
`a`: this prevents silent confusion with type/value generic parameters.
The `!` must be attached to the declaration keyword (`lt!`, not `lt !`).

| Source type | Equivalent full spelling |
| --- | --- |
| `Borrow<T>` | `Borrow<T>` with an inferred lifetime |
| `BorrowMut<T>` | `BorrowMut<T>` with an inferred lifetime |
| `Borrow<T, lt=a>` | Shared loan tied to named lifetime `a` |
| `BorrowMut<T, lt=a>` | Exclusive loan tied to named lifetime `a` |

```atto
// Target signatures, NOT executable compiler conformance yet:
fnc inspect<T>(person: Borrow<T>) -> int {
    return 1;
}

fnc identity<T>(person: Borrow<T>) -> Borrow<T> {
    return person;
}

fnc choose_left<T, lt! a, lt! b>(
    left: Borrow<T, lt=a>,
    right: Borrow<T, lt=b>
) -> Borrow<T, lt=a> {
    return left;
}
```

```ebnf
borrow_type = "Borrow" "<" type_ref [ "," lifetime_argument ] ">"
            | "BorrowMut" "<" type_ref [ "," lifetime_argument ] ">" ;
pointer_type = "Pointer" "<" type_ref ">" ;
shared_type  = "Shared" "<" type_ref ">" ;
lifetime_argument  = "lt" "=" lifetime_ident ;
lifetime_parameter = ("lt!" | "lifetime!") lifetime_ident ;
lifetime_ident     = identifier ;
```

`lt!` and `lifetime!` are contiguous lexical prefixes, not `lt` followed
by an arbitrary `!` expression. Generic lifetime arguments always use `lt=`.
Declarations of the same lifetime in one parameter scope are errors; a named
reference requires an in-scope lifetime, and omitted lifetimes are inferred.
Lifetime names are identifiers resolved in a **separate namespace** from
ordinary type and value names. `lt` and `lifetime` are reserved in binder
positions; neither an apostrophe spelling nor a positional lifetime argument
is accepted. A standalone `lt! a;` is a lifetime declaration only in a grammar
scope that permits lifetime parameters; a runtime statement cannot manufacture
a valid lifetime.

The lifetime parameter namespace is separate from type/value parameters.
A missing lifetime argument introduces an inference variable; an explicitly
named lifetime never manufactures validity. If an exported return borrow
could originate from several inputs, require a named relation or an
independently proven equivalent contract rather than guessing.

**No `&T`, `&mut T`, `*T`, `*const T`, `*mut T`,
`&x`, `&mut x`, or `*p` borrow/pointer notation is part of
AttoLang's target grammar.** Do not add Rust-style apostrophe names,
`@a` annotations or `[a]` lifetime suffixes. Expression-side loans
remain `borrow! owner` and `borrow! mut owner`; ownership transfer and
sharing remain `take!` and `share!`. Checked handles use `ref!`,
`deref!` and `unref!`, subject to their own safety contract.
Raw-pointer manipulation uses separately validated explicit operations,
never implicit reference-to-pointer or pointer-to-owner conversion.

**Admission status:** This is a target language contract. A frontend can
recognize `Borrow<T>`, `BorrowMut<T>`, `Shared<T>` and
`Pointer<T>` but MUST reject unsupported lowering with
`E_UNSUPPORTED_TYPE` and emit no guest bytes. Discarded `&` or `*`
borrow/pointer syntax is a syntax error, not a planned shorthand.
Neither syntax recognition nor a copied runtime handle proves
returned-borrow safety, cross-actor transport, or native pointer validity.

## Ownership operations versus ownership-bearing types

**Target API decision.** The unary operations `take!`, `copy!`, `copy!!`,
`borrow!`, `borrow! mut` and `share!` are not generic type constructors.
Do **not** introduce `Take<T>`, `Copy<T>` or `Share<T>` as parallel
type wrappers. Those spellings would confuse an operation/trait with the
lifetime and authority of the resulting value.

| Source form | Target static result | Semantics |
| --- | --- | --- |
| `T` (ordinary local or owned result) | `T` | The value may be uniquely owned; ownership is determined by binding and return semantics, **not** an ordinary nonprimitive argument |
| `take! owner` | `T` | Move the existing ownership and invalidate the old place |
| `copy! value` | `T` | Duplicate only a type proven eligible for the ordinary `Copy` contract |
| `copy!! owner` | `T` | Explicit independent deep graph clone, with checked allocation, cycles and alias preservation as required |
| `borrow! owner` | `Borrow<T>` | Scoped immutable non-owning loan, tracked by provenance and NLL |
| `borrow! mut owner` | `BorrowMut<T>` | Scoped exclusive mutable loan |
| `share! owner` | `Shared<T>` | Consume/promote a move-only owner to an authorized shared/frozen domain |

`Copy` is an eligibility trait/contract, not `Copy<Person>` wrapping
an object. `Owned<T>` may be considered as an explicit API type qualifier
only where annotation aids readability. In the new target call model, a bare
nonprimitive parameter `T x` denotes an **implicit non-owning loan**, not an
implicit consuming/owned formal; explicit transfer requires `take!` at the call
site **and** an explicit consuming formal contract in the opt-in profile. Existing
compiler code that moves objects into bare `T` formals is legacy behavior and
must migrate under a versioned compatibility profile. Type aliases, names and
qualifiers must not
silently turn a borrowed handle into ownership.

`Shared<T>` is the only proposed shared-ownership capability type here;
it is *not* `Borrow<T>`. For move-only objects, `share! owner` consumes the
exclusive owner **only if** the object graph is proven share-safe and the
runtime can promote/transfer it atomically to the appropriate shared
domain. It must reject while conflicting loans are live; old owner aliases
must become invalid. Publication is read-only/frozen by default. Any
interior mutation requires separate synchronized, capability-checked
authority and must obey actor/tenant isolation and generation fencing.
A default class is **not automatically shareable**. A `Shared<T>`
reference cannot be fabricated from a raw pointer, actor-local offset or
an ordinary `Borrow<T>`. Until this admission path exists, backends
reject object `share!` rather than returning an unsafe generic `T`.

The current browser compiler supports a restricted scalar `share!` profile
that behaves like a copied scalar; this is a compatibility baseline,
**not** evidence that `Shared<Person>` is already implemented.

### Illustrative target (not executable compiler conformance)

```atto
val source = new Person("Atto");
val independent = copy!! source;   // separate owned object graph
val reader = borrow! source;       // Borrow<Person>
// reader loan must end before promotion:
val published = share! source;     // Shared<Person>, source consumed
// using source after promotion is a compile error
```

The compiler must preserve **two separate facts** for each borrowed binding:
(1) permanent provenance/borrowed-identity until its binding ends and
(2) its currently live loan interval. Non-lexical lifetime expiration
only ends (2), and **never** turns the borrowed binding back into an owned
`T`. Both facts must reach typed MIR and cleanup/drop lowering. This is
mandatory before class-loan NLL can be treated as general memory-safe
lowering.

## Implicit parameter lifetime elision (2026-11-18 reconciliation)

This is a **normative target amendment**, reconciling this pre-existing lifetime proposal with the new [implicit argument borrowing contract](https://github.com/atto-lang/atto-spec/pull/89) and [language amendment #80](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/pull/80).

**A parameter's surface type is not an ownership grant.** A nonprimitive `fnc inspect(Foo foo)` or ordinary method `inspect(Foo foo)` is equivalent, for nonescaping call access, to an explicit read-only `Borrow<Foo>` formal with its lifetime inferred. `inspect(foo)` and `inspect(borrow! foo)` must issue **identical, checked** source-provenance loan facts. `inspect(mut foo)` creates an exclusive borrow only when an exported, proven callee parameter effect requires mutable access. Unverified transitive effects must fail closed. The ordinary spelling must neither move the object nor silently `share!`, copy, or retain it.

### Three lifetime cases

```atto
// (A) No escaping alias: nothing to annotate, call loan expires at last use.
fnc inspect(Foo foo): int { return foo.value; }

// (B) Borrowed return from exactly one input: infer return lifetime from foo.
// Borrow<Child> distinguishes a borrowed result from an independently owned Child.
fnc get_child(Parent p): Borrow<Child> { return p.child; }

// (C) Multiple source owners: give the returned loan an explicit relationship.
fnc choose_left<lt! a, lt! b>(
    Borrow<Foo, lt=a> left,
    Borrow<Foo, lt=b> right
): Borrow<Foo, lt=a> { return left; }
```

These examples describe target semantics; none of the above new generic/returned-loan signatures is asserted to compile in the current Rust browser subset.

**One-input return rule:** for an ordinary `fnc get_child(Parent p): Borrow<Child>`, the compiler may elide the lifetime if every possible return path has exactly one proven input owner, the returned reference is a view into that owner, and no conflicting transient borrow or shorter-lived local contaminates the result. A method's `self` can serve as the sole origin. The caller's borrow must stay live for every use of the returned alias, but **the returned alias never owns or drops the parent**.

**Multiple-input rule:** whenever more than one borrowed root could produce the returned alias, the exported signature must have an explicit or independently equivalent verified provenance relation. `lt! a` declares the lifetime and `lt=a` ties borrowed input/output positions together. `Borrow<T>` remains available for explicit parameters in these cases. Bare `T<lt=a>` on a formal is **not** specified as accepted syntax; do not invent it in a backend.

**Do not infer a return loan from the result type alone.** `fnc make(): Child` returns an owned `Child` if admitted; `fnc view(Parent p): Borrow<Child>` returns a borrowed `Child` bounded by the input. A bare `Child` return must not silently become `Borrow<Child>`, or a returned view could be mistaken for a newly owned object.

### Proof obligations and ambiguity

- Create typed, compiler-owned loan IDs for implicit and explicit arguments with the same place/owner provenance, borrowing mode, region, actor generation and NLL constraints. Last-use expiry ends the *active* loan interval but never turns the borrowed formal or alias into a movable/droppable owner.
- At a call, immutable ordinary loans are checked against every subsequent argument in lexical evaluation order and held for the complete synchronous invocation; mutation/transfer through a later argument while the loan is live rejects. The callee cannot retain or return the loan without a proven result-lifetime contract.
- Field projections, reborrows, closures, interprocedural result aliases, trait/interface/virtual calls, exceptions, cleanup, recursion and dynamic calls must retain verified provenance. If the compiler cannot resolve the root or effect summary, `borrow!` makes the intent explicit **but cannot invent a missing lifetime proof**.
- `lt! a` and `lt=a` affect compile-time constraints only; they cannot lengthen an owner, coerce a read-only loan to mutable, authorize actor/isolate transport or make a local reference `lt=static`.
- Borrowed results crossing `await` or actor/critical boundaries require proven pinning, quiescence and generation/authority fences. Until these exist, reject and emit no artifact.
- A public signature must export a stable, independently checked lifetime/effect contract so separate compilation and AOT can check a call without inspecting the callee implementation. If the source body changes, metadata is revalidated.
- The migration from implicit owned `Foo` formal to default borrowed `Foo` formal is a **source-breaking target change**. Until an explicit consuming formal grammar and feature/version migration are approved, compilers must not silently switch legacy code without diagnostics.

**Implementation boundary:** [Rust compiler #336](https://github.com/atto-lang/atto-source.rs/pull/336) supports only checked `Borrow<Class>` synchronous call loans with named local owners, not bare `Foo` default, result lifetime inference or method/actor/async parity. See [conformance #74](https://github.com/atto-lang/atto-platform-conformance/pull/74) for the target matrix. Keep compiler admission gated until verified guests and the canonical typed checker agree.

## Lifetime elision and inference

1. Every loan carries a unique issuance identity, original place identity,
   loan mode, owner region/domain/generation, and an inferred lifetime variable.
   A place includes field projections; sibling fields may be disjoint only if
   their layout and alias independence are established.
2. Source omitted lifetime arguments introduce fresh inference variables.
   Local last-use points are derived from a typed CFG and a conservative
   source-to-IR-to-emitted-operation census, not textual reachability alone.
3. For an exported function, an elided return lifetime can be inferred only
   when the contract has one unambiguous input provenance (including a proven
   borrowed receiver). For multiple possible originating inputs, require a
   named relationship unless the compiler generates an equivalent, separately
   verified public signature contract. Never assign a result to the lifetime
   of a fresh local, temporary, or callee-owned result.
4. `lt! a` (or source alias `lifetime! a`) introduces a universally quantified
   named lifetime variable. All occurrences of `lt=a` refer to that variable. At a call site,
   the instantiated lifetime must satisfy *all* input and output constraints;
   sharing one variable does not extend either caller's loan.
5. Lifetime subtyping, shared/unique reborrow permissions, and outlives
   relationships are checked by the typed verifier. `BorrowMut` may temporarily
   reborrow with appropriate exclusivity and restoration of access to its
   parent; mutable pointee types are invariant. Unknown provenance rejects.
6. A stored borrowed field must give its containing type an explicit or
   inferred lifetime bound and must never outlive the referenced owner.
   This includes collections, tuples, closures, iterator elements and
   dynamically selected projections.
7. `lt=static` is reserved for genuinely static storage proven by the
   compiler; annotations alone cannot upgrade a loan to static authority.
   No apostrophe-prefixed spelling is introduced as an alias.

## NLL and control-flow obligations

Use the shortest lifetime justified by all reachable uses, not automatically
the enclosing lexical block. Analysis must be monotone and convergent across
CFG cycles, branch joins and exception/cancellation/drop edges.

For every read/write/loan-transfer point `p` and loan `L`, prove:

- `live(L,p)` implies its owner is initialized, not moved or retired; the
  original allocation/actor generation is valid at `p`.
- Shared loans exclude overlapping writes; unique loans exclude every
  conflicting owner/loan access, including nested referents.
- Result/field/closure aliases retain the original loan identity and an
  upper bound on its lifetime, not a new owner.
- Exceptional exits, `throw`, `raise`, `panic`, cancellation, `defer` and
  `recover` revoke/release outstanding loans without freeing resources still
  in use; an unresolved control effect must not be treated as a safe loan end.

## Async, actor, and isolation rules

A loan crossing `await`, `select`, `nb`, actor turn re-entry or cancellation
requires a proven pinned continuation and owner retention across its full
physical lifetime, with exclusive/shared permissions and generation fencing.
Until that proof exists, reject the operation. A critical state read/write
loan cannot escape its protected scope by returning a `Borrow` wrapper.

Normal cross-actor messages carry `take!` ownership, independently owned deep
`copy!!` graphs, or explicit separately validated immutable/shared-domain
capabilities. Borrowed actor-local pointers are not `Sendable` merely because
the runtime can encode an offset. `Sendable` is distinct from
`Serializable` and from lifetime validity.

## Minimum executable conformance matrix

Run all of the following against exact pinned compiler heads, with positive
**compiled and executed** guests and negative **compiler diagnostics with no
guest artifact**, plus independent canonical Rust verifier comparisons:

| Case | Required outcome |
| --- | --- |
| shared/read then unique/write after provable last use | Accept |
| unused local loan then owner move | Accept when no implicit destructor/capture escapes |
| shared/read then unique/write with a later read | Reject `E_BORROW` |
| outer loan used after nested block | Reject conflicting write inside block |
| disjoint field borrows with proven nominal layout | Accept |
| overlapping/unknown-index projections | Reject unless independence proved |
| safe reborrow within bounded parent lifetime | Accept |
| reborrow outlives parent, returned local, stored escape | Reject `E_LIFETIME` |
| one-input return lifetime inferred | Accept |
| ambiguous multi-input return without contract | Reject `E_LIFETIME` |
| named multiple-input lifetime relation and valid caller | Accept |
| unpinned await / critical-state escape / actor message loan | Reject |
| safe pinned continuation, cancellation, retire proof | Accept only after implemented |
| forged region, stale actor epoch, raw pointer cast | Reject |

Do not mark cases as passed if a parser rejects syntax before the semantic
checker intended by the test. Keep source-only fixtures separate from compiled
guest evidence. Report backend, source SHA, tree/blob verification, diagnostic
stage, executed steps, and source->typed-MIR->emission proof coverage.

## Implementation phases

1. Ratify `lt! a`/`lt=a`, reconcile PRs #33 and #67, and add bounded
   lexer/parser lifetime binder recognition without admitting unsound codegen.
2. Add typed `Borrow`/`BorrowMut` provenance, region constraints and
   same-scope NLL last use. Preserve existing rejection of returned borrows
   until actual result-lifetime constraints are checked.
3. Implement nested reborrows, field-sensitive loans, loops/CFG joins, named
   function contracts, generic variance and instance storage bounds.
4. Prove pinned async/actor lifetimes, cleanup, generation fencing and
   isolation. Make semantic parity tests mandatory across backends.

**Compiler status:** The existing AttoLang Rust frontend admits bounded lexical
class loans and has a separate unmerged scalar NLL stack. Neither constitutes
general Rust-equivalent lifetime inference. Unknown cases remain unsupported.
