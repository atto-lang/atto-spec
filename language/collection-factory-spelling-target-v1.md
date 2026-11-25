# Canonical collection factory spelling — historical target

**TARGET / not backend certified.** This preserves the November 15 factory decision without settling the still-open literal and Entry proposals (#128–#136). Their checked key semantics and named-factory contracts need separate reconciliation. Do not interpret this document as a ban on accepted literals or as implementation evidence.

**2026-11-15 collection-factory target:** in structural type contexts, `~` is shorthand for `structural`, not a collection value factory. The separately specified integer bitwise complement remains unchanged. `Map.of(...)`,
`Tuple.of(...)` and other canonical `Type.of(...)` names are the
canonical named collection-factory spelling; this rule does not prohibit separately specified literals or additional checked named factories. This is a target
contract, not proof of executed backend support.

| Canonical factory | Distinct result type |
| --- | --- |
| `Map.of(k => v, ...)` | `Map<K,V>` |
| `Entry.of(k, v)` | resolved `Entry<K,V>` |
| `Pair.of(a, b)` | resolved `Pair<A,B>` |
| `Tuple.of(a, b, ...)` | exact-arity `Tuple[A,B,...]` |
| `Array.of(a, b, ...)` | `Array[T]` with checked elements |
| `List.of(a, b, ...)` | `List[T]` |
| `Vector.of(a, b, ...)` | `Vector[T]` |
| `Set.of(a, b, ...)` | `Set[T]` with checked uniqueness |
| `Record.of(field: value, ...)` | readonly named record |

Former collection shorthand forms `~map(...)`, `~entry(...)`,
`~pair(...)`, `~tuple(...)`, `~array(...)`, `~list(...)`,
`~vector(...)`, `~set(...)`, `~record(...)`, and their typed
variants are **syntax errors**, never compatibility aliases. Likewise,
`~<T>()` is not a typed empty factory. Structural notation such as
`~Point` and `is ~Point` continues to mean
`structural Point` and `is structural Point`. Do not lower
type-position `~tuple<A,B>` or `~map<K,V>` into **nominal**
tuple/map types.

Additional factories, including the separately proposed `Map.of_entries` in #131/#132, may be registered only with an explicit core type
declaration, reviewed canonical type identity, checked construction, and
cross-backend conformance evidence. Do not infer an API from capitalization
or route `Type.of` through unrestricted member lookup / foreign interop.
`Map.of` constructs an AttoLang Map, **not** a Java host Map.

Type witnesses use the **existing** generic and shape channels:
`Map.of<String,bool>(...)`, `Entry.of<String,bool>(...)`,
`Array<T>` (type), `Vector[T]` (shape), `Tuple[A,B]`
(heterogeneous positional shape). Preserve `[A,B]`, `(a,b)`,
`tuple {a,b}`, `Array[T]`, `Vector[...(A,B)]`,
`FixedArray[N of T]`, and other legacy collection declarations and
literals. These are **not** permissions to accept tilde constructors.

For `Map.of()` without explicit witnesses, contextual construction is
admitted only when the compiler **already proves** the expected concrete
`Map<K,V>` type. Bare `~()` is invalid and cannot guess a Map or
record type. Nonempty map constructors must detect duplicate *logical*
keys, reject unsupported domains and spreads, stage writes transactionally,
and never publish a partially constructed Map. Entry does not impose map
key uniqueness. Set uses its own reviewed value-equality/uniqueness
semantics; it is not a Map or list alias.

`Entry`, `Pair`, `Tuple` and `Record` may have different identity
and projection contracts. `Pair` follows its **resolved declared type
or explicit transparent alias**, never an implicit conversion to Entry or
a two-element Tuple. A record with `key` and `value` fields does
not become an Entry by shape. Factory results retain ownership,
read-only projection, move/copy and actor transport rules. Missing
implementations fail deterministically at compile time, never via a
host-interop fallback.

Constructor arguments evaluate once in source order. Static checks that
can be performed without running guest code happen before evaluation.
Failed allocation, duplicates, domain errors, and ownership violations
must not leak partially built containers; expression effects are not
retroactively rolled back.

**Promotion:** require real parser/type/ownership tests, actual compiled
guest evaluation, negative diagnostics, actor isolation tests, and exact-head
Native AOT where applicable. Source-only manifests and zero-step CI are
not compiler certification.

