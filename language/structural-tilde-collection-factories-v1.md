# Structural tilde and canonical collection factories v1

**Status:** accepted language-design direction (2026-11-15); this document is a normative target, **not** proof of compiler or backend execution.

## One meaning for `~`

The tilde sigil is shorthand for the `structural` type modifier. In a
type, parameter, constraint, or `is` pattern, `~Point` is an alternative
spelling of `structural Point`. It does not call a factory, allocate a value,
or imply the nominal identity of `Point`.

```atto
fnc accept_point(~Point p) -> void { }
match value over
    on is ~Point as val p -> { accept_point(p); }
    on _ -> { fallback(); }
end
```

Distinguish type testing from structural value matching according to the
structural-pattern contract; this change does **not** redefine
`on is ~Point` versus `on ~Point`.

## Construction: Type.of only

Collection construction uses ordinary, statically resolved
`Type.of(...)` factories. For all built-in collection/aggregate families,
remove the tilde-constructor aliases:

| Accepted target form | Forbidden former shorthand |
| --- | --- |
| `Map.of(...)` | `~map(...)` |
| `Entry.of(...)` | `~entry(...)` |
| `Pair.of(...)` | `~pair(...)` |
| `Tuple.of(...)` | `~tuple(...)` |
| `Array.of(...)` | `~array(...)` |
| `List.of(...)` | `~list(...)` |
| `Vector.of(...)` | `~vector(...)` |
| `Set.of(...)` | `~set(...)` |
| `Record.of(...)` | `~record(...)` |

The old bare expression-position `~(field: value)` record and
`~(key => value)` map construction forms are also removed.
`~(ordinary_expression)` remains a separate pre-existing unary operator
where supported, and field/type matching syntax is governed by the
structural-pattern contract, not by collection factory rules.
The tilde modifier may be separated from its first operand by whitespace
(`~ Point`), including in `is ~ Point` type tests.

`on is ~Point` is the structural **type-test** spelling. Do not
silently conflate it with `on ~Point`, a potentially distinct structural
value/intersection pattern. Until a backend has a checked value-pattern
contract and lowering, that latter spelling must fail closed rather
than borrow the type-test AST/runtime.

This prohibition also covers generic factory forms such as
`~map<string,int>(...)`, `~tuple<int,bool>(...)`, ambiguous
`~<T>()`, `~()`, and extra built-in constructor aliases such as
`~slice(...)`, `~fixed_array(...)`, or `~fixed_list(...)`.
Type-position `~map<K,V>` must not be treated as a nominal Map synonym:
`~` has only structural meaning. Use `Map<K,V>` (or existing
`Map[K,V]` where required by grammar) for the nominal type.

```atto
const entries = Map.of<string,int>("a" => 1, "b" => 2);
const pair = Pair.of("age", 30);
const tuple = Tuple.of(1, true);
const numbers = Array.of(1, 2, 3);
const labels = List.of("ready", "done");
```

An unsupported factory must **fail closed** with a diagnostic, not silently
lower to another collection type or host-language collection. Static
resolution, generic witnesses, evaluation order, ownership, duplicate-key
rules, actor isolation and AOT requirements remain unchanged from the
canonical factory contracts.

## Parser, formatter and diagnostics

* The lexer does not interpret `~kind` as a factory-name token.
* A prefix `~` in type and pattern contexts enters structural parsing.
  A former `~kind(...)` value-construction path must be rejected, not
  secretly rewritten at runtime.
* Do **not** implement a generic rejection of `~` that breaks
  `~Point` in types, `is ~Point` in matching, or the independent
  pre-existing unary tilde operator if supported by that backend.
* A targeted diagnostic can say: `collection constructors use
  Map.of(...); ~ is reserved for structural typing`.
* Formatters may provide a one-time migration code action, but should not
  emit or normalize back to `~kind(...)`. No indefinite compatibility
  parser or deprecated alias is required.
* Existing `[a,b]`, `(a,b)`, `tuple{...}`,
  `Array[T]`, `Tuple[A,B]`, `Vector[T]`, fixed/repeated shapes, and
  `List.of`/`Tuple.of` **patterns** are unaffected.

## Conformance and rollout

The companion `conformance/structural-tilde-collection-factories-v1.json`
contains negative constructor candidates, positive canonical forms and
structural-syntax preservation targets. Entries are **source expectations**,
not executed tests. For each supported compiler and profile, confirm
parser diagnostics, typed and ownership-positive factories, and genuine
compiled guest execution. Preserve exact-commit provenance and report
`NOT_EXECUTED`, `UNSUPPORTED`, `FAIL`, and `PASS` distinctly.

Tracked historical drafts to revise/supersede:
`oreslang-common-source#257`,
`oreslang-platform-conformance#641`,
`oreslang-source.java#2734` and `#2735`.

## Generic `.of` factory resolution and Record shapes

**Normative portable TARGET; not an implementation claim.** This section extends the
canonical factory contract and must be reconciled with inline-literal typing
(atto-spec#69), Record/Struct layouts (atto-spec#72), Entry/Map contracts and
the language's named-argument grammar. Syntax marked **NEW TARGET** needs
explicit parser/type-checker/runtime evidence before being called supported.

### Builtin factory signatures

These are *compiler-known generic constructors*, not arbitrary dynamic
reflection or ordinary unchecked static methods:

| Factory | Static result | Inputs |
| --- | --- | --- |
| `Tuple.of(a,b,...)` | `Tuple<T0,T1,...>` | Heterogeneous positional values, preserving arity |
| `Array.of(a,b,...)` | `Array<T>` | Homogeneous, fixed-length indexed storage |
| `List.of(a,b,...)` | `List<T>` | Homogeneous, growable logical sequence |
| `Map.of(k0,v0,k1,v1,...)` | `Map<K,V>` | **NEW TARGET:** even number of alternating key/value arguments |
| `Map.of(k0 => v0, k1 => v1,...)` | `Map<K,V>` | Existing Entry-arrow spelling |
| `Record.of(field=value,...)` | closed structural `Record` | **NEW TARGET:** named field-value expressions |
| `Record.of(field: value,...)` | closed structural `Record` | Existing field-entry spelling |

`Entry.of(k,v)`, `Pair.of(a,b)`, `Vector.of(...)` and `Set.of(...)`
retain their independent contracts. Do not silently equate Pair with Tuple,
Array with List, Map with Record, or Record with nominal Struct.
Lowercased aliases, where admitted as *type spellings*, do not create
unrelated dynamic factory names.

Type arguments may be inferred from expressions and expected-type context,
or supplied explicitly in the language's normal generic argument syntax.
Homogeneous factories must find a valid, checked common assignable type
under the language's numeric and ownership rules: do not invent a
`dynamic`, `Any`, boxing conversion, float widening or lossy cast.
Tuples retain each element's independent type. For an untyped empty
`Array.of()`, `List.of()` or `Map.of()`, reject unresolved element types
(`E_TYPE_INFERENCE`); accept a fully known expected type or explicit
`Array.of<T>()`, `Map.of<K,V>()`, etc. `Tuple.of()` is the zero-arity tuple.
`Record.of()` is a *closed zero-field Record*, not an untyped Map.

The two Map forms are overloads selected from **syntax shape**, not by
trial-and-error runtime evaluation: all Entry-arrow arguments or all
alternating positional arguments; no mixed forms. An odd positional
argument count is `E_FACTORY_ARITY`. Duplicate constant keys reject
with `E_DUPLICATE`, including equal keys with distinct literal spelling.
Runtime-equal dynamic keys follow the existing Map last-value-wins
contract. Every key/value expression is evaluated once, left to right;
hash/eq, drop, borrow and transaction safety remain mandatory.

### `Record.of`: field names are compile-time schema, values are generic

```atto
val pair = Tuple.of(10, 20);                 // Tuple<int,int>
val numbers = Array.of(1, 2, 3);             // Array<int>
val names = List.of("Atto", "Lima");         // List<string>
val scores = Map.of("a", 10, "b", 20);        // Map<string,int>
val item = Record.of(name="Atto", count=3);  // closed: name:string, count:int
val headers = Record.of("content-type": "text/plain", status: 200);
```

The names on the left of `=` or `:` are **static record field
declarations**, not ordinary formal-parameter names and not variables
whose values are fetched or evaluated. Identifier fields support
`field=expr` (canonical call-style syntax) and `field: expr` (the
already-proposed record-field spelling). A quoted string literal label
uses `"arbitrary-name": expr`; a computed expression / interpolated
name cannot become a closed Record field. Both spellings produce the same
structural field slot; formatter canonicalization must preserve strings
and evaluation order. Detect duplicate *decoded* field names, including
`x=1, "x": 2`. Field names are UTF-8 and case-sensitive and have the
same validation/budgets as inline structural Record literals. Ordinary
named arguments to user methods must continue to work; `Record.of`
is resolved by builtin identity after name resolution, **not** by
guessing from source text ending in `.of`.

The compiler constructs a **closed structural row** from each
`(field-name, inferred-value-type)` pair. Layout identity is independent
of field declaration order; initializer expressions run in source order,
then lower into the canonical field-slot permutation. It is an error to
coerce a closed Record to a different closed shape or treat it as a Map
just because field names resemble string keys. Record field selection
must prove field presence and field type; open `Record` values require
guards/narrowing. Do not silently allow mutable width subtyping, record
escape of borrows, fabricated AOT field offsets, or cross-TenantVM
sharing. The generated row is compile-time information; the guest
representation must still respect actual ownership and lifecycle rules.

### Explicit shape types and generic code — NEW TARGET

A `Record` *without* a type argument remains the existing **open Record
supertype**. To express a closed structural row at an API boundary, add
the proposed **type-position** syntax `Record<{field: Type, ...}>`.
Here the brace is a *type-level shape*, never a runtime map/record
literal, and the fields are statically named (quoted fields permitted
per the same label rules). It is a single shape argument, not an
ordinary list of positional generic types:

```atto
val Record<{name: string, count: int}> item =
  Record.of(name="Atto", count=3);

fnc wrap<T>(T value): Record<{value: T}> {
  return Record.of(value=value);
}

fnc display_name<R: Record<{name: string, ...}>>(R item): string {
  return item.name;
}
```

`Record<{name: string, ...}>` is a *read-only required-field bound* for
generic row-polymorphic code: additional fields are permitted, but their
presence does not confer unsafe mutable shape narrowing. An exact
`Record<{name:string}>` value type is closed (no extra fields).
A generic `R` is instantiated with a statically proved row witness;
no runtime-computed field name, unchecked cast, shape erasure or implicit
Map conversion may satisfy the bound. Normal type parameters in field
positions (`value: T`) are resolved at instantiation or from the
expected type, not inferred from string labels. Explicit constructor
generic arguments, if exposed later, must refer to **types/row witnesses**,
never to unvalidated runtime field sets.

**Staging:** existing Rust/parser work in atto-source.rs#274 deliberately
does not admit `Record<...>` type arguments. Accordingly the new
`Record<{...}>` spelling and `field=value` factory grammar are
not advertised as existing support. A compiler must either implement
the contract end-to-end or reject the syntax with a precise
unsupported/inference diagnostic; no host-language object fallback.
Generic code whose field set is truly unknown at runtime must use a
typed Map or a separately defined, schema-validated dynamic-record API.
Do **not** make `Record.of` accept unchecked dynamic keyword spreads.

### Evaluation, diagnostics, security and parity

- Parse named/positional arguments unambiguously. Do not evaluate a
  receiver or any argument twice. Preserve source order even if the
  backend sorts Record fields for layout.
- `E_FACTORY_ARITY`: odd flat Map arguments; malformed entry argument
  sequence; invalid fixed arity. `E_TYPE_INFERENCE`: unresolved empty
  homogeneous factories or non-unifiable element types. `E_DUPLICATE`:
  duplicate constant keys or decoded Record field labels.
- `E_UNSUPPORTED` (or dedicated syntax diagnostic) for arbitrary
  dynamic Record keys, unsupported factory families/profiles and the
  yet-unimplemented type-level row syntax; reject rather than
  reinterpret expressions as unchecked foreign objects.
- Enforce bounded field counts, source size, generic instantiation depth,
  actor-message `Sendable` checks, tenant capability boundaries, and
  serialization schema/version validation. Generated shape descriptors
  and caches must be tenant-safe; untrusted guests may not forge shapes,
  TypeIds, offsets, or host descriptors.
- A backend earns **PASS** only after exact-head positive and negative
  front-end checks, compiled guest result tests, ownership/aliasing
  checks, AOT or Wasm memory-layout tests as applicable, and no-host-
  fallback isolation tests. Otherwise report `NOT_EXECUTED`,
  `UNSUPPORTED` or `FAIL` explicitly, independently per backend.
