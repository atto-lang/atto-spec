# Typed Map.of_entries and nominal Structs v1

> **Proposed v2 constructor boundary (2026-11-25):** [Pair/Record and Entry/Map interoperability](entry-expression-and-record-literals-v1.md#parentheses-and-record-constructor-interoperability-v2-proposed) makes `Map.of` accept both Pair and Entry items (including mixed items with compatible K,V) in the new profile; `Map.of_entries` remains an explicit Entry-only spelling. Flat alternating positional `Map.of(k,v,k,v)` is historical compatibility only, not new-profile admission. Pin the source profile; never silently reinterpret legacy calls. `Pair` is string-keyed in v2, so any Map.of consuming Pair has K=string; arbitrary key types use Entry. `Pair` is not `Entry`; `Record.of` accepts static named fields or identifier-proven Pair values, not Entries.


**Status:** proposed normative language target (2026-11-20). This is not
a claim of compiler, guest execution, or cross-backend parity.

## A dedicated Entry constructor

A Map can be constructed from a typed sequence of Entry<K,V> values using:

```atto
const m = Map.of_entries<int, bool>(
    5 => true,
    8 => false,
    9 => true,
);
```

`Map.of_entries<K,V>(entries...)` constructs `Map<K,V>`. A `key => value`
argument is shorthand for `Entry.of(key, value)` **within this argument
list**. The factory also accepts explicit `Entry.of(key,value)` values with
an exactly compatible `Entry<K,V>` type. `Pair<K,V>` is *not* an Entry,
and alternating `key, value, key, value` arguments are NOT admitted by
this dedicated factory. Those positional pairs belong to `Map.of(...)`.

This chapter focuses on the explicitly typed `of_entries` spelling. The [general factory contract](map-of-entries-and-nominal-structs-v1.md) also admits uniquely inferred or contextual K,V. Check individual entry expressions against the resolved K and V types; never infer a dynamic erased container or reinterpret
an Entry as a Pair. The key type must have stable checked Hash + Eq
semantics. The first bounded guest profile accepts only int, bool and
string keys and scalar values; an unsupported type is an explicit rejection,
not a host Map fallback.

Duplicate compile-time constant keys are errors, including equivalent integer keys such as 0 and -0. Dynamically computed equal keys use the existing Map last-value-wins rule with verified cleanup. When arbitrary expressions are supported, evaluate each entry
left-to-right, evaluating key before value, once. Do not sort by key before
evaluating effects or allow duplicated side effects. The final Map is
immutable unless the declared Map API explicitly supports safe mutation.
Scalar `get` returns Option<V> under the Map mutation contract; do not invent a default value, trap, or raw pointer.

### Const constructor contract

In a `const m = Map.of_entries<K,V>(...)` declaration, the **entire**
key/value set must be compile-time evaluable and contain no effects,
mutable references, dynamic key witnesses or unowned capabilities.
A verified frozen Map ABI is mandatory; absent that proof, const initialization rejects E_UNSUPPORTED. The result is a logically immutable constant Map value; the compiler may
lower constant data to a private, checked guest storage header but may not
run arbitrary expressions or alter observable constant values. This is a
narrow compile-time constant-data exception, not a rule that all runtime
Map allocations or `Map.of(...)` calls qualify for `const`.

Reject a `const` entry with a dynamic or nonliteral expression until a
verified constant evaluator establishes its safety. An empty
`Map.of_entries<K,V>()` is valid because K and V remain explicitly known,
and has zero logical entries (never a null/invalid object).

### Accepted and rejected examples

```atto
val a = Map.of_entries<string, int>("x" => 40, "y" => 2);
val b = Map.of_entries<int, bool>(Entry.of(5,true), 8 => false);
const empty = Map.of_entries<int,bool>();

// rejected: of_entries is Entry-only, not flat alternating Map.of
val wrong = Map.of_entries<int,bool>(5, true);
// rejected: Pair is not Entry
val wrong2 = Map.of_entries<int,bool>(Pair.of(5,true));
// rejected: duplicate keys
val wrong3 = Map.of_entries<int,bool>(5 => true, 5 => false);
// rejected: inferred boolean value is not an int
val wrong4 = Map.of_entries<int,int>(5 => true);
```

Every rejected case must fail before guest code emission. The formatter
must retain the explicit `of_entries` name and its K,V witness, and
normalize whitespace/trailing commas without changing Entry identity.

## Nominal struct/Struct types

The established source-local declared form is:

```atto
define struct Point as
    int x;
    int y;
end

val Point p = Point{y: 2, x: 40};
```

A declared struct has a **nominal identity**, including its module-qualified
name and declared field types; different structs with identical field names
and types are **not** assignment-compatible merely by structural shape.
Declaration order defines the struct's logical fields. Explicit named
construction accepts any source field order, but every required field must
be present exactly once, no extra fields are allowed, and each value must
match its declaration type.

Construction must evaluate field expressions once in source order **before**
mapping their values to declaration-order slots. The initial scalar
compile-to-Wasm profile accepts only literal scalar fields, where
reordering physical constructor arguments cannot alter observable effects.
Extending that profile to effectful expressions MUST first preserve lexical
evaluation order through typed temporaries.

`infer struct{x:40,y:2}` requires a statically resolved nominal expected type and matching required fields and types. Missing, mismatched or duplicate fields reject. Without a resolved expected type, fail closed; never search visible declarations by shape or select by declaration order, package traversal, or host reflection.

Closed `Record` is different: a Record's structural identity depends on
field names and field types, not on a declared nominal name, and its
canonical slot order may be name-sorted. A `Map` is not a Record or
Struct, and `Pair`/`Entry` are separate typed two-slot products.
A `class` remains an identity-bearing reference object; a future native
inline value-type Struct ABI must separately prove ownership, copy/move,
destructor and cross-tenant isolation rules.

In the current Rust/Wasm implementation, source-local scalar structs are
**lowered into compiler-generated classes** with bounded, checked guest
allocation. This proves neither a general inline stack-allocated Struct
representation nor native backend layout equivalence. Unsupported nested
fields, dynamic initialization, reference aliasing, packed fields, unsafe
casts and anonymous structural-to-nominal conversions must fail closed.

### Structural type-checking hardening

- Duplicate declared fields and duplicate initializer keys: reject.
- Missing or extra required fields: reject; no implicit zero-fill.
- Wrong scalar field type: reject; no implicit numeric coercion.
- Duplicate declared nominal name or an ambiguous infer-struct match: reject.
- Distinct qualified struct names with identical field layouts: distinct
  TypeIds and cannot be interchanged.
- Full source-order initializer evaluation, exact once, even when the
  static physical layout follows declaration order.
- No unchecked reflection-generated field offsets, host-side dynamic casts,
  cross-TenantVM shared mutable structures or erased ownership.
- Explicit limits for maximum field count, nested type depth, code size and
  constructor memory; stable diagnostics for invalid cases.
- Formatter acceptance and canonical output must be parse-equivalent under
  the spec in atto-format and oreslang-format; neither formatter can make a
  rejected program valid by reinterpretation.

## Conformance and rollout

Each independent backend needs the same grammar, typed-entry rules,
nominal Struct distinction, stable duplicate/type/ambiguity diagnostics and
a validated implementation respecting the target's ownership/security model.
For each backend, run real compiled guests, negative no-artifact cases and
exact SHA/provenance checks. Source-level parser tests, shape descriptors
or CI jobs that never began execution do NOT establish a pass.

A bounded Rust compiler draft is being staged on top of
atto-source.rs #429 and its Map, List, Tuple/Array and Record ancestors.
The conformance registry remains NOT_EXECUTED for every backend until a
successful actual native/browser compiler and guest run is recorded.
