# Checked owned Dyn<Interface> erasure v1

Status: **language target; bounded Rust/browser compiler draft, not executed at the current head** (2026-11-21).

This document specifies three source spellings for the same **explicit ownership transfer** into an interface-constrained existential value. It does not authorize an unchecked cast, dynamic downcast, structural duck typing, cross-TenantVM send, or implicit ownership transfer.

## Accepted target syntax

```atto
define pub interface Printable as
  describe(): string;
end

define class Greeting implements Printable as
  pub describe(): string { return "hello"; }
end

pub fnc main(): int {
  val Greeting a = new Greeting();
  val Greeting b = new Greeting();
  val Greeting c = new Greeting();

  // All three own their payload and expose only Printable.
  val Dyn<Printable> first = Dyn<Printable>(take! a);
  val Dyn<Printable> second = (take! b) as Dyn<Printable>;
  val Dyn<Printable> third = take! c;

  stdio.println(first.describe());
  stdio.println(second.describe());
  stdio.println(third.describe());
  return 0;
}
```

The unparenthesized explicit-conversion spelling `take! b as Dyn<Printable>` is also legal when the ownership operator binds to the named owner first. Parentheses make the ownership boundary clearer and are recommended when the expression is nested.

### Grammar and typing constraints

- `Dyn<I>` is a distinct, owned existential interface value; `I` must resolve to a valid nominal interface with an object-safe, verified implementation by the source concrete type. The source must be a live, exclusively transferable owned value, not a borrowed view or a forged number, record, pointer or runtime-reflected object.
- `take! owner` is required for the constructor and checked `as` forms. It consumes the original binding exactly once, preserves its provenance, and invalidates subsequent caller uses, including exceptional/control-flow paths. There is no hidden deep copy, share, borrow, or new authority.
- `as Dyn<I>` is a **checked, type-directed interface erasure**, not a cast back to the implementing class and not a general runtime type test. Compiler validation must prove the source implements `I` before lowering to any runtime representation.
- The contextual `val Dyn<I> x = take! owner;` form is accepted only because the *destination explicitly supplies* the interface constraint and the RHS explicitly transfers ownership. Ordinary `val Dyn<I> x = owner;` and implicit widening at arguments/returns are rejected.
- An erased `Dyn<I>` value permits only methods and operations in the verified `I` interface. Concrete-only methods/fields, downcasts, storage, further narrowing and cross-tenant transport require independent typed runtime proofs. Type-erasure must never silently become the underlying concrete type at source level.
- Method calls retain their ordinary argument-borrowing behavior. Holding an owned `Dyn<I>` does not mean that passing it to a function silently transfers ownership; any consuming formal still needs the explicit ownership contract.
- All three forms must have equivalent ownership and result semantics. If the runtime uses a dispatch tag/table, its provenance, lifetime, authority, and method-table relationship must be authenticated. No fake polymorphic dispatch is permitted.

## Negative examples

```atto
val Dyn<Printable> a = greeting;                         // no implicit take
val Dyn<Printable> b = (borrow! greeting) as Dyn<Printable>;  // no borrowed-to-owned forgery
val Dyn<Printable> c = (take! greeting) as Dyn<Missing>;  // unknown/unimplemented interface
val Dyn<Printable> d = 42 as Dyn<Printable>;              // no integer-to-object cast
val Dyn<Printable> e = Dyn<Printable>(42);                // no constructor forgery
val Greeting leaked = a;                                  // no implicit de-erasure
// greeting.describe();                                   // invalid after take!
```

Other required rejections include using a moved value, duplicate move, erasure with an incompatible interface, unproven compound source or alias, object-unsafe method signatures, and unverified actor/tenant/serialization boundaries. Every failure must be diagnosed before guest/artifact publication.

## Initial browser implementation restriction

[atto-source.rs draft #509](https://github.com/atto-lang/atto-source.rs/pull/509) implements only a **closed-world monomorphic** candidate: exactly one source-local implementing class; scalar-only interface method parameters/results; a matching explicitly typed local `val/let Dyn<I>` binding; named-owner `take!`; and a supported single-argument interface-function entrypoint. The candidate checks and then erases the syntax to a concrete Wasm-compatible carrier. This implementation restriction is not the intended general-language semantics. The following are not available in that browser candidate: general polymorphic runtime dispatch, multiple implementors, untyped `val x = (take! y) as Dyn<I>`, arbitrary expression-position casts, borrowed Dyn views, object-return provenance, cross-tenant transfer, or dynamically resolved vtables. They must **fail closed**, not silently compile into an unsafe concrete upcast.

An exact-head Rust native build, wasm32 compiler build, real compiled-guest execution, negative no-artifact cases, independently approved private CI and verified browser compiler pin remain release gates. **No executed support on the current compiler PR head is claimed.** [Site draft #220](https://github.com/atto-lang/atto-lang.github.io/pull/220) must remain preview-only until the certified compiler artifact is released.

## Formatter and backend compatibility

The formatter must preserve author-selected constructor, checked-`as`, and contextual spellings. It may normalize spacing and indentation but must not introduce or remove `take!`, rewrite a checked conversion to an unchecked one, change parentheses when precedence could differ, or falsely collapse distinct ownership operations. Require lexical safety, idempotence, source parse-roundtrip and independently verified guest-equivalence before any semantic rewrite.

Java, LLVM, .NET, Forge, independent Wasm, and other AttoLang backends have **no implied parity** from a Rust source branch. Track each backend as unsupported, not executed, or passing with source SHA and executed guest proof; do not equate an existing `dyn Interface` borrow view with owned `Dyn<Interface>` erasure.
