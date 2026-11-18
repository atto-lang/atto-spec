# 27 — Named-generic collection storage layouts v1

**Status: TARGET / NOT VERIFIED.** This chapter is a normative *target* for AttoLang; it does not certify any compiler, runtime, physical memory layout, or SIMD speedup. It refines the data-layout target in [chapter 10](10-dop-and-realtime.md) and the named-argument binding rules in [chapter 02](02-types-and-patterns.md).

## Separation of logical element type and physical storage

A nominal `struct` or other eligible fixed-shape element type describes a logical element; the enclosing collection decides its physical storage. The same `Particle` value model is observable in all layouts:

```atto
define struct Particle {
    x: float;
    y: float;
    velocity: float;
}

type Rows = Array<Particle, layout=aos>;
type Columns = Array<Particle, layout=soa>;
type Blocks = Array<Particle, layout=aosoa(16)>;
type EquivalentColumns = Array<layout=soa, T=Particle>;
```

`aos` (array of structures) stores complete element records together. `soa` (structure of arrays) stores one logical field column per field. `aosoa(N)` stores blocks of `N` elements as field columns, in element index order. Layout is orthogonal to the logical element's nominal identity, fields, visibility, value/equality rules, and field evaluation order.

## Named compile-time generic binding

`layout` is a **declared, named, typed compile-time generic parameter of kind `Layout`**, with default `aos`, on collection declarations that implement the contiguous-layout capability. It is not a free-form annotation, runtime argument, unrelated type argument, or automatically accepted metadata key. `T` is the element-type formal only where the resolved collection declaration actually declares `T`. No generic key may be invented on an unrelated nominal type.

- Bind positional arguments to declared formals, then named arguments by exact name, obeying the generic binding rules in chapter 02. A positional argument after any named argument is invalid. Unknown names, duplicates, collisions with a positional binding, wrong argument kinds, and missing element types fail at compile time.
- Normalize arguments by **resolved declaration formal identity and order**, not by textual order. `Array<Particle, layout=soa>` and `Array<layout=soa, T=Particle>` denote the same specialization when the declaration's first formal is `T`. `Array<Particle>` and `Array<Particle, layout=aos>` denote the same specialization.
- `aos`, `soa` and `aosoa(N)` are closed built-in `Layout` values in v1. `N` is a positive, bounded compile-time integer; a backend must publish its accepted block-size range. A nonconstant, zero, negative, overflowing, or out-of-range `N` is an error, not an implicit default. Backend-specific restrictions must fail closed and be reported as target capability limits, not silently rewritten.
- The specialization identity includes the resolved nominal collection declaration, resolved element type, canonical layout value (and AoSoA block size), and any other declared compile-time parameters. The compiler MUST NOT key identity solely by a display-name string or silently coerce between physically different layouts.
- For v1, a layout-bearing collection MUST have contiguous, owning storage semantics. `Array` is required by the target; `Vector` and `List` accept `layout` only when their resolved declarations explicitly implement the capability. A linked-node `List` cannot claim column-contiguous storage by naming `layout=soa`. Unsupported kinds reject the argument precisely.

## Struct field initialization: colon braces and equals parentheses

The following source forms are both admitted **for a resolved, eligible nominal struct with an implicit compiler-synthesized fieldwise initializer**. They construct the same logical value. The formatting policy preserves the programmer's chosen form rather than silently changing braces to parentheses or vice versa:

```atto
Particle{x: 10, y: 20, velocity: 1}
Particle(x=10, y=20, velocity=1)
```

The braces/colon form is a **typed struct field literal**. The parentheses/equals form is a **dedicated fieldwise struct initializer shorthand**, not a general named-argument call, an assignment expression, an arbitrary map literal, or a constructor invocation with effects. It is permitted only when the compiler resolves the callee to an eligible nominal struct and its generated field-initialization surface. Ordinary named function/method/custom-constructor calls retain `label: expression` (chapter 03); `label=expression` MUST NOT be silently admitted for those calls. An explicit user-defined constructor, including one with side effects, follows ordinary checked invocation syntax and is not silently bypassed or confused with the aggregate shorthand.

Both struct forms MUST check exact nominal type, field visibility and mutability, required/defaulted fields, unique field labels, static field types, ownership, and evaluation effects. Each provided field expression evaluates **once in lexical source order** before placing values into declaration-order fields; no reordering side effects, implicit aliasing, fabricated missing field values, or implicit fallback to a dynamic Map is permitted. Duplicate, unknown, inaccessible, or conflicting fields fail before guest code generation. Neither spelling changes how an enclosing `Array<T, layout=soa>` or `aosoa(N)` lays out storage.

```atto
let from_equals: Array<Particle, layout=soa> = [
    Particle(x=10, y=20, velocity=1),
    Particle(x=30, y=40, velocity=2)
];

let from_colons: Array<Particle, layout=soa> = [
    Particle{x: 10, y: 20, velocity: 1},
    Particle{x: 30, y: 40, velocity: 2}
];
```

**Implementation status:** the Rust/Wasm browser compiler's restricted source-local scalar product lowering currently recognizes the braces/colon form. This spec does not certify the equals-parentheses shorthand or actual SoA array guest execution. Both require dedicated positive and negative guest evidence.

## Contextual literals, views and mutation

A collection literal `[p1, p2, p3]` in an expected `Array<Particle, layout=soa>` context constructs an SoA representation while evaluating element/field expressions exactly once in source order. If no expected type can determine the collection kind, element type, and physical layout, inference must use separately documented rules or require an explicit type. It cannot choose a layout based on guessed runtime profiling.

```atto
fnc make_particles() -> Array<Particle, layout=soa> {
    return [Particle(x=1, y=2, velocity=3),
            Particle(x=4, y=5, velocity=6)];
}
```

`particles[i]` represents the *logical* element at checked index `i`, independent of layout. Element access may be a borrow-backed proxy for SoA/AoSoA; the compiler must not invent an addressable, contiguous `Particle*` or silently materialize a detached mutable copy. `particles[i].x += 1` must affect `particles.columns.x[i]` and vice versa, when mutation is permitted.

`particles.columns.x` is a layout-aware field view subject to visibility, bounds, lifetime, and ownership checks. A column is contiguous under SoA, strided under AoS, and segmented under AoSoA; it MUST NOT masquerade as a contiguous slice when it is not. Mutable row and column borrows to overlapping cells conflict. Disjointness is only admitted with a proof from the borrow checker; no unsafe reborrow or alias may escape the owning collection or actor domain. A column must not outlive the collection or remain valid across a resize that relocates its storage.

## Conversion and transport

`to_layout<soa>()` is an **explicit** layout transformation target. It may allocate and transpose, must preserve logical element order and values, must respect ownership and fallible allocation semantics, and must not introduce duplicate mutable aliases. A layout mismatch at a call, assignment, or return boundary is a type error unless an explicit conversion is performed. Further method naming/return-error conventions are resolved by the standard collection API specification.

`take!` transfers the owning collection, preserving its layout and invalidating the source capability. `copy!!` produces a logically independent deep-copied mutable object graph; a layout change cannot weaken cross-actor isolation. Network wire encoding and actor transports use logical values or an explicitly versioned representation contract, never assumed raw native SoA pointers or padding.

## Physical shape and backend safety

SoA inversion is **shallow by default**: top-level eligible declared fields become columns. Nested records, variable-length payloads, references, dynamically sized fields, identity-bearing class instances, inheritance, polymorphism, drop order and nullable fields require separately proven support or explicit rejection. A backend MUST NOT silently flatten or share nested mutable state. Struct layout and inline structural `Record` layouts remain distinct from physical collection transposition.

AoSoA requires checked lane/block addressing and exact length semantics. The final block may be partially filled; padded/inactive lanes are not elements and must never be read, dropped, serialized or exposed as live records. Integer arithmetic for size, offset, stride, alignment, and total allocation must be overflow-checked. All backends must preserve bounds, field types, source initialization order and deterministic destruction requirements. SIMD/vector/GPU eligibility is a separate target-specific optimization, **never** evidence of runtime support merely because a type was parsed.

A source-level `@preferred_layout(...)` annotation, automatic profile-guided selection, custom layout plugins, and recursive inversion are **not included in v1**. Absent an explicit layout parameter, the concrete storage default is `aos`.

## Compiler and conformance admission

Adoption proceeds in order: (1) parser and canonical named-generic binding, (2) typed layout-aware IR and storage/borrow representation, (3) actual guest layout allocation/index/mutation/cleanup, (4) explicit conversion and actor transport, (5) multi-backend and SIMD/GPU qualification.

- Positive syntax: default AoS; positional element plus named layout; all-named reordered parameters; `aosoa(16)`; expected-type `[]`; field reads and writes; partial final blocks.
- Negative syntax/type: duplicate `layout`; unknown layout or argument names; incorrect argument kinds; positional-after-named; zero/nonconstant/overflow AoSoA size; unsupported collection capability; incompatible layouts without conversion; invalid nested/identity-bearing field representations; unsupported pointer projections.
- Dynamic: a row mutation and a column read must agree; `to_layout` preserves order and values; last-block padding is invisible; bounds and overflow are checked; `copy!!` and `take!` preserve actor isolation; independent backend results match.
- Evidence: use **actual source-compiled guest execution** and compile-failure evidence with exact source head/tree, fixture blob SHAs, compiler SHA, jobs and nonzero executed steps. A parser-only check, host planning model or source-free unit test is **NOT_EXECUTED** for runtime conformance. Every unsupported backend MUST fail closed before emitting an artifact.

See [chapter 11](11-conformance.md) for evidence and the portable `collection-layout-v1` candidate contract in the AttoLang platform-conformance repository.
