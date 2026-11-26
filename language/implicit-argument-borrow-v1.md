# Implicit argument borrowing v1 — ownership-safe call sugar

Status: **Design target with bounded Rust/browser compiler evidence, not general language certification** (2026-11-19).
Scope: AttoLang `.atto` function, class-method and actor-method *argument* ownership semantics. This proposal is source-breaking for existing implicitly consuming class formals; do not enable globally before a compatibility audit and executable compiler conformance.

## Motivation and default

The intended AttoLang language default is a scoped read-only borrow for every ordinary nonprimitive argument to fnc and mtd. Versioned opt-in modes are migration mechanisms for existing compiler implementations, not the intended permanent language default. Unmigrated implementations must explicitly reject unsupported ownership semantics under the new profile rather than silently consume the argument. Primitive value scalars remain by-value; explicit consuming formals and `take!` calls are separate. The [Pointer<T> receiver and argument contract](pointer-explicit-methods-v2.md#borrow-by-default-for-all-function-and-method-boundaries) applies this same rule to pointer capabilities, with distinct mutating and consuming receiver effects.


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

## Explicit parameter rebinding v1

**Status: TARGET, opt-in borrow-default profile; guest execution unverified.** Parameter bindings are fixed by default in the borrow-default profile. A function or method implementation can opt an individual parameter into local assignment with `rebind`. `mut` governs writes through the binding. `take!` independently governs ownership transfer at entry.

```atto
define class Foo as
  pub let int foo = 5;
end

fnc handle_foo(rebind mut Foo f): void {
  block {
    val z = borrow! mut f;
    z.foo = 8;
  }
  f.foo = 6;
  f = new Foo();
  f.foo = 9;
}

pub fnc main(): int {
  val mut Foo foo = new Foo();
  handle_foo(mut foo);
  return foo.foo; // 6
}
```

- **Syntax.** `rebind` is contextual in a named formal with a body. The canonical type-first form is `rebind mut Foo f`. The equivalent name-first form is `rebind f: mut Foo` where name-first formals are supported. A copied scalar can use `rebind int n`. Parse a single marker before the existing formal and preserve it through formatting. Existing identifiers spelled `rebind` remain valid. An implicit receiver and bodyless signature have no local parameter binding eligible for this modifier.
- **Call contract.** The call ABI, argument evaluation, parameter label, and entry ownership and access mode follow the ordinary formal rules. `rebind` belongs to the implementation and does not participate in overload selection, interface matching, or override compatibility. An effect inferred from the body must still reflect actual access to the incoming argument. A write proven to target only a locally owned replacement does not imply a write to that argument.
- **Assignment.** The binding keeps its declared type and access permissions. A scalar assignment replaces the local copy. A reference-backed binding may receive a compatible, lifetime-checked loan or an owned value under the usual ownership rules. In particular, `new Foo()` produces a locally owned replacement. Assigning a loan cannot promote the borrowed object to ownership. A formal explicitly typed `Borrow<T>` still accepts only values assignable to `Borrow<T>`. Reassigning any fixed parameter is a compile error, independent of field-write permission.
- **Loan checking.** Track the current value's origin, access and ownership across assignments and control-flow joins. A reassignment that invalidates a live loan or reborrow is illegal. A replacement loan must outlive its uses. A consuming use requires ownership on every reaching path. Borrowed results and captures use the actual current origin, so an owned replacement cannot escape as a borrow tied to the original argument. Existing cross-actor, suspension and cancellation checks apply to both the incoming value and the replacement.

### Zero-GC lowering and cleanup

Evaluate the right-hand side once using normal checked assignment order. Keep the old binding in force until the right-hand side succeeds. On replacement, end access through the old binding, release its loan when permitted by liveness, or retire the previous value exactly once if the binding owned it. If evaluation fails, unwind using the current ownership state and ordinary temporary cleanup. A live owned replacement must be moved onward or cleaned up exactly once on normal exit, unwind, or supported cancellation. Releasing the incoming loan never destroys the caller's object.

Use compile-time ownership and drop facts where a path is known. At control-flow joins that need a runtime distinction, a frame-local drop flag or equivalent control flow is sufficient. The binding itself must introduce no heap box, reference-count operation, or tracing requirement. `new Foo()` retains its ordinary allocation semantics. On a [zero-GC target](../spec/24-aot-zero-gc-controlled-dynamism.md), admit this form only when allocation provenance and destruction or reclamation are proven under the target's ownership and region rules. A backend with unproven cleanup or lifetime tracking must reject the affected case before artifact emission.

### Conformance cases

- Compile and execute the example for both a free function and a method. Verify that the caller still holds the same object with field value `6` and that writing through the replacement affects only that replacement. Check scalar reassignment and type-first/name-first formatter round trips.
- Reject assignment to a formal without `rebind`, writes through a read-only current value, an invalidated live reborrow, a dangling replacement loan, consuming a borrowed value, and returning a replacement as a borrow tied to the incoming argument. Reject overloads distinguished only by `rebind`.
- Execute both arms of a borrowed/owned join, repeated replacement, RHS failure, and all admitted exits including unwind and cancellation. Instrument guest allocations and cleanup to verify that the original survives, owned replacements retire exactly once, and repeated calls reclaim their storage under the target's region rules. Inspect lowered IR for the absence of boxing, tracing and reference counting introduced by the rebinding operation. Run the same semantic cases across admitted backends and record compiler, target, exact revision, and executed results.

Rust separates reassignment of a local binding from writes through a mutable reference. Kotlin fixes parameter bindings while allowing mutable object fields to be updated. C# demonstrates local reassignment of a class-reference parameter to a newly constructed object. Swift removed its former `var` parameter after confusion with `inout` write-back. The Atto rule combines explicit local reassignment with checked ownership of the replacement. [Rust variables](https://doc.rust-lang.org/reference/variables.html), [Rust mutable references](https://doc.rust-lang.org/std/keyword.mut.html), [Kotlin functions](https://kotlinlang.org/docs/functions.html), [C# method parameters](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/method-parameters), [Swift Evolution SE-0003](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0003-remove-var-parameters.md).

## Resolution, inferred loans and explicit ambiguity

1. Resolve receiver/callee, overload, generic instantiation, named-argument binding and checked parameter modes **before** selecting an ownership action. Prefer no ownership-sensitive overload selection: an owned vs borrowed variant with identical nominal signature must not silently dispatch differently.
2. Type-check and evaluate receiver and supplied arguments exactly once, in lexical source order. An implicit loan starts at its argument evaluation and remains active through subsequent argument evaluation and the synchronous call, ending no sooner than the callee's proven last use. Named labels, defaults, spreads and pipelines do not reorder effects or shorten loans.
3. Materialize borrow operations with the **same typed loan/provenance and CFG facts** as explicit `borrow!`: exact place/root, origin, allocation domain, exclusivity, lifetime and exceptional cleanup. Every use, move, mutation, reborrow and drop edge must be accounted for, including branches, exceptions, cancellation and closures. No `Borrow<T>` to owned-`T` erasure that grants drop/move authority.
4. Reject and require explicit ownership/lifetime clarification when provenance is ambiguous, e.g. unverified aliases, borrowed-return relationships, escaping references, temporary aggregate projections, multiple unresolved candidate owners, borrowed generic substitutions, FFI/dynamic calls or uncertain effect summaries. **An explicit `borrow!` documents intent but cannot bypass a missing proof.**
5. Loan checks must be at least as strong as the existing explicit-borrow checker: shared readers coexist, exclusive writers exclude all other access, owners cannot be moved while loaned, no dangling return/capture or unproven `await`/select/actor-boundary escape. Failure must happen before artifact emission.
6. A proven ordinary loan needs no heap allocation, deep copy, reference-count increase or new long-lived owner. Borrowed values have no destructor/drop/transfer authority. An explicitly rebindable formal may hold an independently owned replacement; the incoming loan never becomes owned.

## Explicit ownership actions remain explicit

| Expression | Required semantics |
| --- | --- |
| `inspect(foo)` | implicit read loan for a nonprimitive read-only parameter |
| `inspect(borrow! foo)` | explicit read loan, same proof and duration |
| `adjust(mut foo)` | explicit exclusive writable loan to statically mutating parameter |
| `adjust(borrow! mut foo)` | explicit exclusive loan (legacy/long spelling) |
| `consume(take! foo)` | intentional ownership transfer **only when the resolved formal is explicitly consuming** |
| `consume(take! clone)` | explicit transfer of a named, independently owned value (e.g. `val clone = copy!! foo;`), requiring a matching `take! T` formal |
| `retain(share! handle)` | explicit shared-owner handle duplication, not borrowed-object promotion |
| `rt share foo` | explicit unique-to-readonly-shared conversion within verified domain, not ordinary call lowering |

For the borrow-by-default call profile, `inspect(copy! foo)` creates a
fresh *shallow* root and lends that temporary root to the non-owning callee.
`inspect(copy!! foo)` lends a fresh deep graph. Neither transfers ownership
to the ordinary callee, and neither means just duplicating the original
pointer. Only proven shareable nested references may remain aliased in the
shallow copy. The backend may physically pass a pointer to the *new* root,
but must keep the logical owner and lifetime separate from the original.

An explicitly consuming `take! T` formal does not accept bare `copy! foo`
or `copy!! foo` rvalues in phase 1. Bind the copy to a live named owner
first, then invoke `consume(take! clone)`. This is intentional: the phase-1
grammar only admits named live owning places as take! operands. In particular,
`consume(copy!! foo)` must NOT be presented as a valid implicit owned
handoff. Borrowed temporaries cannot escape through a retained parameter,
return value, task, actor send, or deferred callback without a separately
verified lifetime/ownership transfer contract.

The compiler MUST NOT quietly interpret `take!`/ `copy!!` / `share!` as an implicit borrow to suppress a type error. Conversely, passing `foo` to an ordinary `Foo` formal MUST NOT consume it. Explicit owned-formal syntax and migration strategy use the separate grammar
review in this patch: `take! Foo f` (type-first) and `f: take! Foo`
(name-first) indicate a consuming parameter. A backend must never invent an
implicit transfer ABI or continue silently moving plain class parameters.

## Explicit consuming class formals (versioned phase 1)

```atto
define class Foo as
  pub let int value = 42;
end

fnc identity(take! Foo owned): Foo { return owned; }
fnc read_once(owned: take! Foo): int { return owned.value; }

pub fnc main(): int {
  let foo = new Foo();
  let moved = identity(take! foo); // explicit transfer on both sides
  // identity(foo);               // E_OWNERSHIP
  // foo.value;                   // E_MOVED
  return read_once(take! moved);
}
```

A formal marked `take!` is **owned**, and it may consume, return, or otherwise
transfer the class handle according to normal ownership/move rules. In contrast,
an unmarked `Foo f` is a read-only loan in the versioned borrow-default profile.
The marker must have an attached `!`; `take ! Foo`, scalar `take! int`,
mutable `take! Foo mut`, `take! Borrow<Foo>`, and unproven
class/actor/method/constructor transport are not valid phase-1 consuming
contracts. No consuming contract can be reconstructed from runtime behavior.

A caller targeting a consuming formal **must** supply `take! live_owner`,
where the expression is a named live owning class place. Bare `foo`,
`borrow! foo`, `take! make()`, and a borrowed alias are invalid. The
typechecker must propagate the effect through the resolved signature,
type-check every argument in order, retain an earlier shared loan while later
arguments are checked, forbid transfer under a live loan, and enforce
use-after-move. Reversing a mixed `borrow/take` argument order must reject
the already-moved owner as well. Only the callee receiving the transferred
handle may assume ownership.

**Implementation status (19 November 2026 UTC):** Both type-first `take! Foo owned` and name-first `owned: take! Foo` consuming **class** formals are implemented in the *bounded opt-in, synchronous top-level Rust/browser compiler* draft `atto-source.rs#346`, now at head `113c67300da901dd3654eb3da651ab90cb7df094`, full source tree `14ff215da67fa52db6a7c244a0693fc19d1b1462`. [Successful source-exact CI #44468194359](https://github.com/gha-indie-worker/atto-ci/actions/runs/44468194359) verifies that tree, pinned Rust tests, native and wasm32 compiler builds, **570 compiled guest assertions** and **522 native/wasm32 compiler-host comparisons**, zero failures (Java skipped). The suite includes name-first consuming-positive compiled guest, missing-transfer and duplicate-mode typed negatives, and five new whitespace/comment adjacency negative cases. The stacked mutable-loan compiler `atto-source.rs#347` at head `104c0bcd76163c127c06f93986708d28a3af70d3`, exact tree `0e79c4a974ca1c738c3bcf1367c2b4ca1de71d9c`, **also passed** [source-exact private CI #44468335941](https://github.com/gha-indie-worker/atto-ci/actions/runs/44468335941): **586 guest conformance assertions**, **538 native/wasm32 compiler comparisons**, zero failures, plus all four targeted BCV1 dual-compiler positive/negative checks. Independent review remains required for both compiler drafts.

**Lexical adjacency proof (bounded Rust/browser compiler):** The compiler now checks recorded lexical token line/column and emits `E_SYNTAX` before consuming a separated `take !` marker. Executed exact-head #346 native/Wasm tests reject spaces in both formal spellings and call arguments, newline-separated arguments, and comment-separated formals; these compile-fail fixtures emit no guest artifact. The grammar restriction is proven for this compiler subset, **not** for Java/LLVM/.NET/Forge or every syntax surface.

This specification does not assert general Java/LLVM/.NET/Forge parity or full lifetime inference. Compatibility requires the explicit versioned opt-in profile; source marker, CLI/package selection precedence, formatter policy and cross-module exported ownership metadata are not fully ratified. Legacy unversioned compilers must reject newly annotated consuming formals rather than silently interpreting them as legacy moves, until a reviewed source/module compatibility migration is approved.



## Lifetime inference and borrowed results

Ordinary nonprimitive `fnc inspect(Foo foo)` or `class M { read(Foo foo) }` inputs have an **inferred lifetime tied to the actual caller owner**, just as `Borrow<Foo>` would. The default hides *notation*, never lifetime constraints.

1. **Ordinary synchronous nonescaping call:** infer a short read loan for each argument. Track its origin, exclusivity, full argument-evaluation window, body last use, cleanup and NLL end. The incoming value remains tagged `borrowed` even after its active loan ends; expiry does not grant drop/move authority. Any replacement has separately tracked origin and ownership.
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

The grammar **does not** introduce `Foo<lt=a>` for ordinary formals. `Borrow<Foo, lt=a>` is the accepted target for explicit lifetime-bearing parameter types. Neither target signature above is claimed to compile yet. Consult [current AttoLang specification and lifetime contracts](https://github.com/atto-lang/atto-spec) and the separate [fifteen-case conformance registry #74](https://github.com/atto-lang/atto-platform-conformance/pull/74).

## Scope, compatibility and staged implementation

This is a **breaking ownership default** for code that currently treats `fnc consume(Foo f)` as an owned/moving formal. Preserve old semantics only in an explicit versioned compatibility profile; no mixed silent behavior in one module. Compiler admission should (a) report unsafe ambiguous/legacy owned calls with a migration diagnostic, (b) require an explicitly consuming formal plus `take!` at the site, and (c) reject unsupported positions rather than inferring ownership from the caller.

Implementation order:
- Reconcile draft Rust compiler class-call-loan PR #332 and lifetime PR #311; stop treating bare `Foo` top-level formals as owned once the versioned feature is enabled.
- Add lexical `mut foo` argument grammar and body/transitive-call effect-sealing; use deterministic E_BORROW / E_BORROW_MUT_REQUIRED / E_BORROW_AMBIGUOUS diagnostics, all with zero emitted guest.
- Preserve `Borrow<T>` surface for explicit read loans while fixing typed IR so argument and formal provenance cannot become an owned class handle; verify slots, drop glue and signatures.
- Prove methods, constructors, lambdas, generics, named arguments, suspend/actor boundaries and separate Java, LLVM, .NET NativeAOT, Forge and Wasm backends before calling this feature general.

**No general cross-backend, actor/async, package ABI or formatter certification is asserted here.** The bounded Rust/browser native-versus-wasm compiler evidence is linked above; language-wide conformance targets and execution receipts belong in `atto-platform-conformance`, with exact source/tree SHAs, executed positive/negative guests, no-artifact checks, and separate backend states.
