# Field-sensitive borrowing, last-use lifetimes and method effect footprints (v1)

**Status: TARGET / NOT CERTIFIED ACROSS BACKENDS (20 November 2026).**
This document specifies the desired static semantics; it does not claim a
frontend, backend, formatter, or compiled guest already implements them.
It extends [ownership and memory](../spec/04-ownership-and-memory.md) and
[implicit argument borrowing](implicit-argument-borrow-v1.md). Existing
`borrow!`, `take!`, `share!`, `copy!`, `copy!!`, and `mut` retain
their established spellings. No new surface syntax is required for basic
field-sensitivity or non-lexical loan expiration.

## Required semantics

**1. Prove *places*, not just variable names.** A place is a canonical
allocation/alias root followed by statically resolved projections, e.g.
`person`, `person.name`, `person.age`, `person.contact.email`.
Two places overlap when they are the same place, one is an ancestor of the
other, or independent analysis cannot prove otherwise. Different sibling
fields of a proven nonoverlapping nominal/structural object are disjoint.
A whole-object operation overlaps all its descendants. A copied handle,
reference, opaque pointer or alternate path to the same allocation must
retain the same canonical alias root. A compiler must **not** infer
disjointness from different source identifiers alone.

**2. Track exact rights and uses.** Multiple read loans to one place can
coexist; a live exclusive loan excludes all overlapping read/write loans.
An ordinary write to `person.age` is permitted while a read loan of
`person.name` remains live *only* if the fields are proven disjoint and
the whole owner is not moved, dropped, transferred, or invalidated.
Writes to `person.name` or a whole-object replacement conflict with that
loan. Field-level reference invalidation, destructors, drop glue and
interior-mutable descendants must be represented as effects.

**3. End a loan after its last possible use (NLL).** This is CFG/dataflow
analysis, not an end-of-lexical-block rule. A loan can end earlier when
the compiler proves there is no later use through any reachable edge,
including loops, closures, exceptions, deferred cleanup, cancellation,
returns, and suspension. An unreferenced *binding* is not enough: any
escaping alias, deferred observer, destructor or shared capability that
could use or invalidate the borrowed storage preserves the appropriate
obligation. Ending a loan does **not** grant ownership to the borrower,
erase provenance, or permit use after move.

**4. Model method calls through verified effects.** For each resolved
method/function and parameter or receiver, the typed signature must
identify a conservative read/write/move/drop/escape/suspend footprint
expressed in canonical places. Exact summaries may be inferred from
closed-world typed bodies and sealed with the build; summarize transitive
calls, recursion, generics, callbacks, overrides and dynamic dispatch
using a safe fixed point or conservative union. A proven method which
reads/writes only `self.age` may coexist with a live loan of
`self.name`. If the footprint is unknown, treat the receiver or parameter
as **whole-object** accessed at the requested rights, and reject any
conflict. No assertion or runtime observation supplied by source code may
manufacture a trusted effect summary.

**5. Fail closed on uncertain projections.** Unresolved/dynamic indices
(including array/map indexing), unions or overlapping layout variants,
pointer arithmetic, unsafe/FFI code, interior-mutability pathways, alias
roots from external modules, polymorphic or reflection dispatch with
unverified targets, and unproved field layout must conservatively
overlap. Statically distinct collection indices may be treated as disjoint
only with a separately validated region/slice separation proof; differing
index expressions alone are not sufficient. Persist verified effects in
cross-module metadata and invalidate them when definitions/ABI change.

**6. Respect isolation and suspension.** No field-sensitive inference may
bypass TenantVM, actor-state sealing, capability checks, synchronization,
Sendable/Serializable distinctions, or actor mail transfer. A loan crossing
`await`, `select`, actor turns, task capture or cancellation requires the
separate pinned-frame/outlives/cleanup proof. A disjoint sibling field is
not authorization to access another actor's or tenant's memory.

## Source-level acceptance examples (target, not current compiler evidence)

The following pseudocode illustrates outcomes, **not a claim that every
frontend currently parses `borrow! person.name`**.

```atto
define class Person as
  pub let string name = "Alice";
  pub let int age = 30;
end

pub fnc main(): int {
  val mut Person person = new Person();
  val name_view = borrow! person.name;  // TARGET: field projection loan
  person.age += 1;                      // ACCEPT: disjoint sibling write
  use_name(name_view);                  // last use
  person.name = "Bob";                  // ACCEPT after proven loan end
  return person.age;
}
```

Required negative cases: writing `person.name` before the last use;
replacing or `take!`-moving `person` under a live field loan; borrowing
`person.contact` and writing `person.contact.email`; calling an opaque
`mut self` method while `name_view` is live; or retaining the
`name_view` through a suspension without the separate proof.

**Method effects:** A direct call whose sealed summary says
`reads={self.age}, writes={self.age}` may proceed during a live
`self.name` read loan. The same call without an authenticated summary
must conservatively borrow `self` as a whole and conflict. Unknown
callbacks, setters, destructors and foreign calls invalidate narrowed
summaries unless explicitly modeled and independently verified.

## Projected actor receiver footprints (TARGET; not executable yet)

Actor method receivers may declare **which sealed user-state fields they are
permitted to mutate**, without acquiring a mutable borrow of the actor identity.
The selected canonical spelling is **type-first** and uses a brace projection:

```atto
use namespace workers;
declare actor Foo;

// Actor identity and runtime capabilities only; send/end do not require mut self.
mtd (Foo self) receive(ActorMail<String> mail): void {
  self.send(41);
  self.end();
}

// Whole user-state write effect (still requires an authorized guard).
mtd (Foo mut self.state) reset(): void { /* guarded writes */ }

// Exactly one mutable field, or a set of two disjoint mutable fields.
mtd (Foo mut self.state.counter) increment(): void { /* guarded write */ }
mtd (Foo mut self.state.{counter, xyz}) update(): void { /* guarded writes */ }
```

**Grammar (contextual in the `mtd` receiver position only):**

```ebnf
actor_receiver = nominal_type, "self"
               | nominal_type, "mut", "self", ".", "state", state_projection? ;
state_projection = ".", field_name
                 | ".", "{", field_name, { ",", field_name }, "}" ;
```

In this grammar `Foo mut self.state` means the whole sealed user-state
region; `Foo mut self.state.counter` means one field; and
`Foo mut self.state.{counter, xyz}` means the unordered set of **distinct**
fields. The singleton braced form may be accepted and formatter-normalized
to `self.state.counter`. The square-bracket variants
`Foo mut [self.state.counter, self.state.xyz]` and
`Foo mut [self.state.{counter, xyz}]` are **not part of this grammar**:
they misleadingly resemble expression lists/array literals.

**Crucial separation:** `Foo self` is a receiver of actor identity and
permitted actor runtime operations, **not** a promise that no interior actor
runtime bookkeeping changes. `self.send`, `self.end`, `get_done`, etc.
require their normal actor capabilities and admission/lifecycle checks,
not `mut self` or `mut self.state`. Ordinary `mut self` on a class/struct
continues to mean a whole ordinary-object mutable borrow; this proposal
does not reinterpret class receivers. Existing `(mut self: Foo)` actor
spelling is legacy compatibility until migration, **not** a shortcut to
field-scoped state permissions.

**Static obligations and dynamic guards are separate.**

1. Receiver projections are *effects/permission ceilings*, not first-class
   arrays, references, destructuring, addressable expressions or borrow tokens.
   They do not implicitly enter a critical region or extend a loan's lifetime.
2. All referenced fields must exist in that actor's resolved, sealed state
   schema, have independently proven place identities and permit mutation;
   duplicates, empty groups, trailing commas, unknown fields, inaccessible
   fields and unsupported nested/index projections are errors. A non-state
   field can never be smuggled through this syntax. Bound the group length
   and nesting in parsers before allocation.
3. Writes through `self.handle_state(critical-write |s| -> { ... })` must be
   statically within the declared write set; `critical-read` never writes.
   Direct `self.state.field` access remains forbidden outside validated
   guarded scopes. This spelling grants no direct state access.
4. Read effects are **not** erased: any additionally read field is tracked by
   the authenticated method effect summary. Narrower write permissions do not
   imply all unrelated reads are free. Calls through other methods, generic
   specializations, interfaces, virtual dispatch, closures, FFI and callbacks
   must have a sealed transitive read/write/escape/suspend summary; otherwise
   conservatively conflict on the whole state or reject.
5. Disjoint write *footprints* may coexist in static borrowing analysis, but
   actors still obey the real synchronization granularity. Existing
   `critical-write` guards are whole-state exclusive, so this proposal
   alone **does not** make two critical writers run concurrently. Finer
   guard partitioning requires a separately verified runtime implementation.
6. A method body may request less than its declared permission but never
   more. Overrides, conformances and dynamic dispatch cannot widen write
   effects beyond the declared interface contract. Receiver mutability or
   write-set alone must not introduce an overload.
7. Unverified alias roots, state layouts, unknown callee effects, escapes,
   moves, cross-actor access, suspension or cancellation invalidate a
   narrowed proof. All unsupported backends must reject compilation with
   diagnostics, not silently lower a whole-state mutable receiver.

**Required source-level positive/negative cases (target outcomes):**
accept `(Foo self)` calling `send/end` without state writes; accept one
or two statically resolved distinct writable state fields in declared
projections; accept a guarded write exclusively to `counter` with
`mut self.state.{counter, xyz}`. Reject an unknown field, duplicate
`{counter, counter}`, empty group, trailing comma, square-bracket receiver,
direct `self.state.counter` access, a guarded write to undeclared
`s.other`, and a call whose unverified effect may write `other`.
Reject overlapping live loans and guard/suspension escape even if the
declared field names are disjoint. Every accepted guest requires a real
compiler/borrow-checker/runtime proof, not a successful token preflight.

## Implementation and evidence requirements

1. Frontends must emit **typed place identities** with verified class/record
   layout, alias root, projection and ownership rights. Do not reinterpret
   runtime offsets as trusted places.
2. Compute CFG liveness and loan end points with backedges, branches,
   cleanup/unwind and exceptional paths; validate generated loan-end
   operations against an independent use/escape inventory.
3. Independently enumerate all call effects. Seal summaries at a typed,
   instantiated signature; compare them against every lowering and emitted
   field write/call. Missing events or unsupported categories reject before
   artifact emission.
4. Run both positive and negative compiled guest cases per backend:
   disjoint simultaneous loans; sibling writes while a read loan survives;
   overlapping writes; NLL after last use; CFG joins/loops; narrowed and
   unknown method calls; aliasing through nested projections; suspension;
   actor/tenant isolation. A negative must provide a borrow/ownership
   diagnostic **and no emitted guest**.
5. Record exact source SHA, tree SHA, compiler/guest artifact hashes,
   compile and guest commands, real outcomes, and verifier output.
   A passing MIR oracle or parser-only fixture is not a compiler result.

## Current bounded evidence and gaps

- The independent `atto-borrow-checker.rs` `cyclic_v1` oracle represents
  canonical roots, field projections, overlapping prefixes, live loans and
  CFG flow. Its regression suite covers these restricted **typed-IR**
  behaviors, but cannot authenticate frontend identities, method summaries
  or generated guest execution.
- The `atto-source.rs` mainline class-loan checker currently tracks class
  loans by owner slot and restricts explicit class borrowing to a named
  owner. Its NLL work is under review in draft PR #311. Neither a method
  field-effect summarizer nor source-projection borrow support has been
  demonstrated here as an exact-head compiled guest.
- Other compiler repositories may have related branch-level work; do not
  infer Java, LLVM, .NET, Forge, Wasm, Cranelift or other backend parity
  from this document or from a verifier unit-test run.

**Release rule:** Until these source-to-MIR, summary-authenticity,
compiled-guest and cross-backend gates pass, any more precise borrowing
claim is **UNVERIFIED**, and ambiguous programs must fail closed.
