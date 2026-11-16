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
