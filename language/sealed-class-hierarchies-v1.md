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

## Staged source-local metadata and qualified prelink policy

The Rust/Wasm draft implementation serializes compiler-validated class graph
data into a **deterministic WebAssembly custom section** named
`atto.nominal.hierarchy.v1`, appended only after successful parsing, type
checking, and code emission. Its payload starts with a one-byte identity-domain
flag, currently **0 = source-unit-local, NOT linker-authenticated**, followed by
unsigned LEB128 record count and lexicographically ordered class records.
Each record includes length-prefixed UTF-8 nominal name, modifier
(`0=open`, `1=sealed`, `2=non-sealed`, `3=final`), visibility
(`0=private`, `1=public`, `2=package`), and bounded lists of direct parent
and permitted-child names. All list lengths use unsigned LEB128 encoding.
These are **local names**, never linkable qualified identities by themselves.

A separate bounded **prelink policy checker** operates on explicitly
resolved `(package, namespace, class)` identities, not on bare `class`
spellings or import aliases. It verifies graph closure, each sealed parent's
exact permitted edges, final/non-sealed rules, multiple inheritance, visibility,
duplicates, missing identities, and cycles. Build-assigned source-unit IDs
must be immutable within the relevant compile/link transaction.

**Security boundary:** Any actor can edit an arbitrary Wasm custom section.
The mere presence of `atto.nominal.hierarchy.v1` **does not authenticate its
contents** or authorize any cross-unit inheritance. A future executable
linker must verify source-to-artifact provenance (including exact source/
compiler identity), bind permitted names to immutable qualified declarations,
revalidate the complete graph, check ABI/layout/method overrides, and reject
forged or stale identities. The prelink policy checker alone does not link
foreign method bodies, enable runtime polymorphic dispatch, or permit hot-loading.
Until then, attempts to compile foreign sealed-class edges remain unsupported
and must fail without an executable guest artifact.

## Bounded executable cross-source profile (Rust/Wasm draft)

The initial executable source linker uses build-owned unit identities of the
form (package, namespace, module), with classes identified by the full tuple
(package, namespace, module, class name). Input sources use a deliberately
restricted top-level import:

```atto
import class Animal from "animals/core/base";
import class Dog as SelectedDog from "animals/pets/dog";
```

The build caller supplies exact source bytes for those unit keys; neither the
quoted target string nor the imported alias is proof of provenance by itself.
The resolver must bind each import to an actual declaration in the supplied
build catalogue and check that it is visible. A sealed root can import its
permitted child while that child imports its parent; the complete type graph
is evaluated before code generation.

The Rust implementation supports a bounded set of source units and an entry
unit whose top-level functions are compiled together with dependency classes.
Each class gets a deterministic compiler-reserved relocation symbol; the
qualified source identity is retained for link-policy decisions. The complete
sealed graph is checked for reciprocal permitted edges, accessibility, final
parents, malformed identities, cycles and duplicate aliases. The existing
class compiler then validates method signature overrides and rejects inherited
field or constructor layouts that it cannot safely lower. Successful links
produce one executable WebAssembly guest. This is **closed-program source
relocation**, not an arbitrary binary-Wasm linker or virtual base-object ABI.

The native attoc-linked tool takes --root, --entry and repeated --unit
arguments with explicit relative paths. It rejects absolute/traversal paths,
and checks each path component for symbolic links. This path check is a
defensive boundary, **not a cryptographic package signature** or a general
race-free filesystem sandbox. A trusted build resolver must supply and pin
the actual bytes and module identities.

The existing atto.nominal.hierarchy.v1 section continues to mark its
identity domain as source-local (0). A future independent module linker must
not treat that custom section as authenticated evidence of inheritance rights.
This source-link slice does not support hot-loading, arbitrary imported
functions, trait/interface cross-unit ABIs, inherited field/constructor
layouts, polymorphic runtime upcasting, or sealed-pattern exhaustiveness.
Those remain separate compiler and runtime work.
