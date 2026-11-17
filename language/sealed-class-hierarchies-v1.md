# Sealed-class hierarchy contract v1 (proposal)

**Status:** proposed language semantics. This file does **not** claim backend parity, runtime subtype dispatch, cross-module linker enforcement, or executable sealed-pattern exhaustiveness.

## Canonical declarations

```atto
define sealed class Shape permits Circle, Rectangle as
    pub describe(): string { return "shape"; }
end

define final class Circle extends Shape as end
define non-sealed class Rectangle extends Shape as end
define class Square extends Rectangle as end
```

The canonical order is `define [pub] [sealed | final | non-sealed] class Name [extends Bases] [implements Contracts] [permits Children] as ... end`. The existing equivalent `pub define` placement may be accepted, and a formatter should normalize it. `non-sealed` is one hyphenated modifier, never a subtraction expression or two independent annotations. Modifiers apply to **classes**, not actors, traits, interfaces, records, fields, or methods; sealed *actor state* is a distinct security mechanism.

An ordinary unmodified class is open unless restricted by its own direct sealed parent. `final` prohibits inheritance. `sealed` requires an explicit nonempty `permits` set of **direct** subclasses; it is not synonymous with `final`. Every direct subclass of a sealed class must explicitly be `final`, `sealed`, or `non-sealed`. `non-sealed` is valid only for a direct permitted child of at least one sealed class. It restores extension permission for descendants, subject to other parents' restrictions.

## Mandatory compiler and linker checks

1. Build an authenticated nominal declaration graph keyed by resolved package/module identity, declaration, version and hot-loading generation where applicable. Never trust spelling, user-provided type labels, or reflection to establish identity.
2. Reject unknown, duplicate, self-referential, unbound, inaccessible or non-class `permits` entries. Every listed child must name a real direct subclass; every actual direct child must be listed. An empty list, implicit wildcard, or missing list on a sealed parent is not allowed in v1.
3. Check *each* direct parent in multiple inheritance; a permitted edge on one parent cannot waive a final or sealed restriction on another. Reject final parent extensions, cycles, ABI-incompatible method overrides and unsupported inherited layout.
4. Reject a direct sealed child with no explicit `final`/`sealed`/`non-sealed` decision. Reject `non-sealed` on a class not directly extending a sealed parent.
5. Never treat compile-unit visibility as proof that a cross-file or cross-package subclass is authorized. Before a linker-authenticated permits graph exists, restrict admitted sealed hierarchies to a single compiler-owned compilation unit, and reject imports or unavailable definitions rather than assuming a closed world.
6. Preserve exact inherited method signatures and visibility; no silent overload ambiguity, private-to-public state leak, unchecked covariant return rewrite, or constructor/base-layout guess. In particular, sealed classes do **not** grant access to sealed actor state.
7. AOT subtype metadata, if needed, must be generated from checked declarations and stable identities; hot reload invalidates the prior subtype proof and requires epoch/version fencing. Dynamic code cannot introduce an unauthorized subclass after the graph has been accepted.

## Exhaustive pattern matching

A sealed root supplies a closed set of *direct branches*, not necessarily a finite set of concrete values. Exhaustive `match`/type-switch checking requires a compiler-proven recursively closed graph: every reachable branch is either `final` or itself `sealed` with fully checked descendants. A reachable `non-sealed` branch is open and therefore requires a wildcard/default or another proven complete guard. Branch type coverage must use authenticated nominal identity and subtype relationships, respect multiple inheritance, and reject unreachable/duplicate arms.

Until that proof and actual polymorphic guest execution are implemented, backends must **not** label a sealed `match` exhaustive solely from this declaration contract.

## Required negative tests

`E_SEALED` for unlisted or missing direct children, unbound/duplicate/wrong-kind entries, absent modifiers, invalid non-sealed, or illegally used permits. `E_FINAL` for extending a final class. Existing `E_CYCLE`, `E_OVERRIDE_REQUIRED`, `E_SIGNATURE`, `E_PRIVATE`, and `E_UNSUPPORTED` rules still apply. Reject before emitting a guest artifact.

## Current implementation boundary

Rust/Wasm draft PR [atto-source.rs#270](https://github.com/atto-lang/atto-source.rs/pull/270) implements the **source-local** declaration-graph guard before existing method-copying lowering. It is not a runtime subtype or sealed-pattern implementation. Authored Rust tests require executed exact-head CI before accepting any pass claim. Independently audit Java/GraalVM, LLVM, .NET Native AOT, Forge, JavaScript/browser, formatter and common conformance; no target inherits another target's evidence.
