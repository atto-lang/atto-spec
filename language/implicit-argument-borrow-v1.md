# Implicit argument borrowing v1 — ownership-safe call sugar

Status: **TARGET / DESIGN PR, not implemented or certified** (2026-11-18).
Scope: AttoLang `.atto` function, class-method and actor-method *argument* ownership semantics. This proposal is source-breaking for existing implicitly consuming class formals; do not enable globally before a compatibility audit and executable compiler conformance.

## Motivation and default

A nonprimitive reference-backed argument should not require redundant `borrow!` at every ordinary synchronous call site or `Borrow<T>` in every formal declaration. **The omission changes syntax only, never the borrow-checker proof obligations.**

```atto
define class Foo as
  pub let int value = 1;
end

fnc inspect(Foo f): int { return f.value; }
pub fnc main(): int {
  val foo = new Foo();
  val n = inspect(foo);         // implicit shared loan, owner remains valid
  val m = inspect(borrow! foo); // explicit spelling, same rights and lifetime
  return n + m;
}
```

By default, an ordinary nonprimitive formal `Foo f` is a *non-owning* parameter. It is **not** an implicit move, clone, `share!`, `rt share`, deep copy or cross-actor transport permit. For primitive/value-copy scalars (e.g. `int`, `bool`, `float`), preserve value passing. Nonprimitive collections, aggregates, generics and opaque types follow the same target intent only after their representation and provenance are proven; unsupported targets reject instead of falling back to an owned handle.

An explicit `Borrow<Foo>` formal remains legal as a readonly, lifetime-constrained spelling; it must not become a separate ABI that permits weaker checks. Explicit `borrow! foo` remains useful to disambiguate intent and make a loan boundary visible. The formatter does **not** have to insert it at unambiguous call sites.

## Mutable calls without hidden aliasing

```atto
fnc adjust(Foo f): void { f.value += 1; }
pub fnc main(): int {
  val mut Foo foo = new Foo();
  adjust(mut foo); // exclusive temporary loan
  // adjust(foo);   // E_BORROW_MUT_REQUIRED, no emitted guest
  return foo.value;
}
```

The compiler must analyze the callee body and the **transitive**, statically resolved method/call effects to determine whether `Foo f` needs an exclusive mutable loan. This effect is sealed into typed signature metadata *before* call lowering, cross-module linking and AOT; neither overload resolution nor runtime observation may guess the effect. A public/external/interface/abstract/indirect callable with no verifiable body requires an explicit reviewed parameter effect contract (proposed spelling `mut Foo f`), or is rejected as ambiguous. A method with apparently read-only outer operations but unproven mutating callbacks is **not** readonly by default.

`mut` on the argument requests exclusive access; it does not rebind the caller's name or grant mutation of `final` fields, readonly referents, sealed actor state, other actors' heaps or foreign capabilities. The caller must possess writable referent permission and there may be no incompatible active loan. The callee cannot move or retain the borrowed object.

## Resolution, inferred loans and explicit ambiguity

1. Resolve receiver/callee, overload, generic instantiation, named-argument binding and checked parameter modes **before** selecting an ownership action. Prefer no ownership-sensitive overload selection: an owned vs borrowed variant with identical nominal signature must not silently dispatch differently.
2. Type-check and evaluate receiver and supplied arguments exactly once, in lexical source order. An implicit loan starts at its argument evaluation and remains active through subsequent argument evaluation and the synchronous call, ending no sooner than the callee's proven last use. Named labels, defaults, spreads and pipelines do not reorder effects or shorten loans.
3. Materialize borrow operations with the **same typed loan/provenance and CFG facts** as explicit `borrow!`: exact place/root, origin, allocation domain, exclusivity, lifetime and exceptional cleanup. Every use, move, mutation, reborrow and drop edge must be accounted for, including branches, exceptions, cancellation and closures. No `Borrow<T>` to owned-`T` erasure that grants drop/move authority.
4. Reject and require explicit ownership/lifetime clarification when provenance is ambiguous, e.g. unverified aliases, borrowed-return relationships, escaping references, temporary aggregate projections, multiple unresolved candidate owners, borrowed generic substitutions, FFI/dynamic calls or uncertain effect summaries. **An explicit `borrow!` documents intent but cannot bypass a missing proof.**
5. Loan checks must be at least as strong as the existing explicit-borrow checker: shared readers coexist, exclusive writers exclude all other access, owners cannot be moved while loaned, no dangling return/capture or unproven `await`/select/actor-boundary escape. Failure must happen before artifact emission.
6. A proven ordinary loan needs no heap allocation, deep copy, reference-count increase or new long-lived owner. Borrowed formals have no destructor/drop/transfer authority.

## Explicit ownership actions remain explicit

| Expression | Required semantics |
| --- | --- |
| `inspect(foo)` | implicit read loan for a nonprimitive read-only parameter |
| `inspect(borrow! foo)` | explicit read loan, same proof and duration |
| `adjust(mut foo)` | explicit exclusive writable loan to statically mutating parameter |
| `adjust(borrow! mut foo)` | explicit exclusive loan (legacy/long spelling) |
| `consume(take! foo)` | intentional ownership transfer **only when the resolved formal is explicitly consuming** |
| `consume(copy!! foo)` | independently owned deep graph copy only where supported by the typed copy contract |
| `retain(share! handle)` | explicit shared-owner handle duplication, not borrowed-object promotion |
| `rt share foo` | explicit unique-to-readonly-shared conversion within verified domain, not ordinary call lowering |

The compiler MUST NOT quietly interpret `take!`/ `copy!!` / `share!` as an implicit borrow to suppress a type error. Conversely, passing `foo` to an ordinary `Foo` formal MUST NOT consume it. Explicit owned-formal syntax and migration strategy (candidate `take! Foo f`) need grammar review in a separate patch; no backend may invent an ABI convention or continue silently moving class values under this v1 mode.

## Lifetime inference and borrowed results

Ordinary nonprimitive `fnc inspect(Foo foo)` or `class M { read(Foo foo) }` inputs have an **inferred lifetime tied to the actual caller owner**, just as `Borrow<Foo>` would. The default hides *notation*, never lifetime constraints.

1. **Ordinary synchronous nonescaping call:** infer a short read loan for each argument. Track its origin, exclusivity, full argument-evaluation window, body last use, cleanup and NLL end. The formal remains permanently tagged `borrowed` even after its active loan ends; expiry does not grant drop/move authority.
2. **Borrowed result, single input:** require return type `Borrow<Child>` (to distinguish from an owned `Child`). If every returned view is provably rooted in the sole borrowed parameter or method `self`, elide the result lifetime by associating it with that input. On return the *input's* loan survives as needed for all caller uses; callee's stack cannot be the owner.
3. **Borrowed result, multiple inputs:** require an explicit owner-to-result lifetime relation when it cannot be independently and unambiguously proven from the exported signature. Canonical `lt! a` binder and `lt=a` named reference; `lifetime! a` is a source alias. Never accept Rust apostrophes or positional lifetime arguments. `Borrow<T>` remains available for such formal annotations.
4. **Stored/escaping borrows:** require a containing type/closure/task lifetime contract and a proven outlives relationship. Without it, return, field-store, callback capture, FFI export, `await`, actor messaging, or detached task escape rejects with no output artifact. `borrow!` cannot override this.
5. **Public signature metadata:** preserve the borrowed-formal mode, origin/region, mutable effects and quantified lifetime relationships across compilation units, virtual/interface dispatch, closed-world AOT and error/unwind paths. Unknown effects are not treated as read-only.

```atto
// A) Ordinary borrowed parameter: no Borrow<T> required.
fnc inspect(Foo foo): int { return foo.value; }

// B) Explicit borrowed result, but the lifetime is elided because there
//    is exactly one unambiguous origin: the borrowed Parent argument.
fnc get_child(Parent p): Borrow<Child> { return p.child; }

// C) Explicit source/result relationship where multiple roots exist.
fnc choose_left<lt! a, lt! b>(
  Borrow<Foo, lt=a> left,
  Borrow<Foo, lt=b> right
): Borrow<Foo, lt=a> { return left; }
```

The grammar **does not** introduce `Foo<lt=a>` for ordinary formals. `Borrow<Foo, lt=a>` is the accepted target for explicit lifetime-bearing parameter types. Neither target signature above is claimed to compile yet. See [lifetime proposal #78](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/pull/78) and the separate [fifteen-case conformance registry #74](https://github.com/atto-lang/atto-platform-conformance/pull/74).

## Scope, compatibility and staged implementation

This is a **breaking ownership default** for code that currently treats `fnc consume(Foo f)` as an owned/moving formal. Preserve old semantics only in an explicit versioned compatibility profile; no mixed silent behavior in one module. Compiler admission should (a) report unsafe ambiguous/legacy owned calls with a migration diagnostic, (b) require an explicitly consuming formal plus `take!` at the site, and (c) reject unsupported positions rather than inferring ownership from the caller.

Implementation order:
- Reconcile draft Rust compiler class-call-loan PR #332 and lifetime PR #311; stop treating bare `Foo` top-level formals as owned once the versioned feature is enabled.
- Add lexical `mut foo` argument grammar and body/transitive-call effect-sealing; use deterministic E_BORROW / E_BORROW_MUT_REQUIRED / E_BORROW_AMBIGUOUS diagnostics, all with zero emitted guest.
- Preserve `Borrow<T>` surface for explicit read loans while fixing typed IR so argument and formal provenance cannot become an owned class handle; verify slots, drop glue and signatures.
- Prove methods, constructors, lambdas, generics, named arguments, suspend/actor boundaries and separate Java, LLVM, .NET NativeAOT, Forge and Wasm backends before calling this feature general.

**No compiler, backend, runtime or CI success is asserted by this contract.** Conformance targets and receipts belong in `atto-platform-conformance`, with exact source/tree SHA, executed positive and negative guests, no-artifact checks and separate backend states.
