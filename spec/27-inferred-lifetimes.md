# 27 — Inferred lifetimes without apostrophe markers

**Status: TARGET / DESIGN PROPOSAL (2026-11-17).** This chapter defines source
syntax and proof obligations; it does **not** claim executable compiler support.
It must be reconciled with the outstanding ownership-bang syntax proposal
(PR #67), the effect/lifetime contract (PR #33), the scalar NLL compiler stack,
and the canonical Rust MIR verifier. Fail closed on unsupported backends.

## Decision

AttoLang requires Rust-grade memory and alias safety, with **inferred lifetimes
by default** and no Rust-style apostrophe identifier syntax (`'a`, `'static`).
When annotation is necessary, a compile-time generic *kind* `lifetime` and a
named lifetime argument are used:

```atto
fnc identity<T>(x: Borrow<T>) -> Borrow<T> {
    return x;
}

fnc first<T, lifetime a, lifetime b>(
    x: Borrow<T, lifetime=a>,
    y: Borrow<T, lifetime=b>
) -> Borrow<T, lifetime=a> {
    return x;
}
```

These are **target signatures** and are not yet admitted by the browser compiler.
`Borrow<T>` means a non-owning shared loan; `BorrowMut<T>` means an exclusive
mutable loan, both carrying compiler-proven provenance. Neither is an independently
owned `T`, a raw pointer, a `ref!` handle, nor a transferable actor capability.
Named `lifetime=a` is compile-time metadata; it has no runtime value and no
allocation or reclamation side effect.

`borrow! owner` and `borrow! mut owner` are the preferred *loan-creation*
operators once ownership-bang aliases are ratified. The old `rt borrow` and
`rt borrow mut` spellings remain compatibility forms under PR #67; lifetime
types must not silently reinterpret those expressions as owned values.
Compiler acceptance of `borrow!` today does not certify `Borrow<T>` types.


## Borrow-type shorthand (target, apostrophe-free)

**Preferred descriptive notation** is `Borrow<T>` and `BorrowMut<T>`.
For concise signatures, permit the following **type-only** shorthands:

| Type shorthand | Exactly equivalent descriptive form |
| --- | --- |
| `&T` | `Borrow<T>` (compiler-inferred lifetime) |
| `&mut T` | `BorrowMut<T>` (compiler-inferred lifetime) |
| `Borrow<T, a>` | `Borrow<T, lifetime=a>` |
| `BorrowMut<T, a>` | `BorrowMut<T, lifetime=a>` |

`lifetime a` remains the explicit, readable **declaration** syntax.
An unqualified `a` in a borrow type's second generic-argument position
resolves **only** if `a` is an in-scope lifetime parameter; it must not
silently be resolved as a user type, value generic, or implicit `static`.
The named spelling `lifetime=a` is useful when named arguments or
generics need disambiguation. Positional and named forms cannot both
name the lifetime in one instantiation.

```atto
// Target signatures; not currently executable in the browser compiler.
fnc inspect<T>(x: &T) -> int {
    return 1;
}

fnc get_ref<T>(x: &T) -> &T {
    return x;
}

fnc choose_left<T, lifetime a, lifetime b>(
    left: Borrow<T, a>,
    right: Borrow<T, b>
) -> Borrow<T, a> {
    return left;
}
```

**Disambiguation and grammar:**

```ebnf
borrow_type = "&" [ "mut" ] type_ref
            | "Borrow" "<" type_ref [ "," lifetime_argument ] ">"
            | "BorrowMut" "<" type_ref [ "," lifetime_argument ] ">" ;
lifetime_argument = lifetime_ident | "lifetime" "=" lifetime_ident ;
lifetime_parameter = "lifetime" lifetime_ident ;
```

The `&T` and `&mut T` tokens are shorthand **in type positions**
(parameter annotations, return types, local annotations, fields and nested
generic type arguments). In expression positions, the preferred loan
creation operations remain `borrow! x` and `borrow! mut x`.
Do **not** silently reinterpret `&x` as an ownership transfer,
`share!`, or a new unverified reference-lowering operation; any
pre-existing expression-side `&` is governed by its separate grammar
and diagnostics. The prefix `&` binds only the following type, with
generic/optional structure parsed using the normal type grammar.
The `mut` qualifier binds to the loan **mode**, not to a writable
owner or a change to the underlying `T` type.

With one unique input provenance, lifetime elision applies to `&T`
return values. With multiple borrow inputs, elision does **not** guess:
use `Borrow<T, a>` on the relevant arguments and result, or the
equivalent fully named form. Formatting may preserve the type shorthand;
both forms must resolve to identical typed lifetime constraints.

**No `'a` identifiers, `@a` suffix, `&T[a]` brackets, or new lifetime
operators are introduced.** `@` is already used for annotations and `[]`
for collection/shape syntax, so appropriating either for lifetime
annotations would create unnecessary collisions. `&` and `&mut` are
already described in chapter 16's legacy unary grammar; implementation
must explicitly distinguish type context from expression context.

**Admission status:** This is a specification target. Compiler parsing
may recognize the aliases and emit `E_UNSUPPORTED_TYPE` until
typed region constraints and backend lowering exist; mere syntactic
recognition must never emit an unproved owned reference.

## Ownership operations versus ownership-bearing types

**Target API decision.** The unary operations `take!`, `copy!`, `copy!!`,
`borrow!`, `borrow! mut` and `share!` are not generic type constructors.
Do **not** introduce `Take<T>`, `Copy<T>` or `Share<T>` as parallel
type wrappers. Those spellings would confuse an operation/trait with the
lifetime and authority of the resulting value.

| Source form | Target static result | Semantics |
| --- | --- | --- |
| `T` (ordinary owned binding) | `T` | Exclusive owned value; consuming calls move when `T` is move-only |
| `take! owner` | `T` | Move the existing ownership and invalidate the old place |
| `copy! value` | `T` | Duplicate only a type proven eligible for the ordinary `Copy` contract |
| `copy!! owner` | `T` | Explicit independent deep graph clone, with checked allocation, cycles and alias preservation as required |
| `borrow! owner` | `Borrow<T>` | Scoped immutable non-owning loan, tracked by provenance and NLL |
| `borrow! mut owner` | `BorrowMut<T>` | Scoped exclusive mutable loan |
| `share! owner` | `Shared<T>` | Consume/promote a move-only owner to an authorized shared/frozen domain |

`Copy` is an eligibility trait/contract, not `Copy<Person>` wrapping
an object. `Owned<T>` may be considered as an explicit API type qualifier
only where annotation aids readability; `T` already denotes ownership
in normal consuming positions. Type aliases, names and qualifiers must not
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
4. `lifetime a` introduces a universally quantified named lifetime variable.
   All occurrences of `lifetime=a` refer to that variable. At a call site,
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
7. `lifetime=static` is reserved for genuinely static storage proven by the
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

1. Ratify this grammar, reconcile PRs #33 and #67, and add reserved
   lifetime-name/keyword parsing without admitting unsound codegen.
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
