# Map key expressions, List keys, and Record construction — candidate v1

This chapter refines [Symbol-keyed Entries](symbol-keyed-entries-v1.md) and [quoted Map versus Record literals](quoted-map-vs-record-literals-v1.md). **A square-bracket expression ALWAYS constructs a List/Array literal, even when followed by `=>`.** It never silently unwraps the list to extract its only item. Map/Entry guest execution and stable collection-key Hash/Eq are separate admission gates.

## Map and Entry key expressions

```atto
const string foo = "bar";
let variable_entry = foo => 5;          // Entry<string,int>: read variable foo
let string_entry = "foo" => 5;         // Entry<string,int>: string literal
let symbol_entry = #foo => 5;          // Entry<Symbol,int>: Symbol literal
let list_entry = ["foo"] => 5;        // would infer Entry<List<string>,int>
let bool_list_entry = [true] => 5;     // would infer Entry<List<bool>,int>
let Map<string,int> m = { foo => 5, "other": 7 };
let Map<Symbol,int> symbols = { #foo => 5 };
```

The bracketed examples are *syntactically* valid Entry key expressions but require verified stable hashing/equality of the List key type before semantic admission. In the current narrow Rust/browser profile, they reject E_MAP_KEY and produce no guest artifact. They do NOT create a Map entry whose scalar key is the only list element. If a List type is mutable, its identity/value must be frozen and hash-stable before it can be admitted as a key; mutable Array values are not automatically hashable.

**No special computed-key bracket marker.** A name `foo` used as an expression key is simply `foo => 5`, and the key is evaluated once before the value. The redundant variant `(foo) => 5` groups the expression. By contrast `[foo] => 5` means a List containing the value of `foo` used as the key, not the value of `foo` alone. `{foo:5}` is a Record; `{foo=>5}` is a Map using variable `foo` as key. A literal `#foo` is a Symbol key, never an identifier lookup or quoted string.

### Bracket and expression precedence

- `[foo]` alone denotes an Array/List expression; `[foo] => 5` denotes an Entry whose key is that List, not a computed-value escape hatch. A Map item `{[foo] => 5}` similarly uses a List key.
- `[] => 5` denotes an Entry with an empty List key, subject to contextual element type inference; unannotated empties need explicit context, and keys still require Hash/Eq.
- `[true] => 5` would infer `Entry<List<bool>,int>` after List-key Hash/Eq admission, not `Entry<bool,int>`. The scalar boolean key is `true => 5`.
- `("foo",) => 5` is a Tuple key (subject to Hash/Eq), not a List; `("foo") => 5` is a grouped string key.
- Existing `foo => 5`, `"foo" => 5`, `'foo' => 5`, `` `foo` => 5 ``, `#foo => 5` and literal expression keys remain source-compatible.
- Arrow is nonassociative unless explicitly grouped. The `key` and `value` each execute exactly once in source order. Map literals do not implicitly allocate standalone `Entry` objects for each brace item.

## Hash/Eq, ownership, and safety for composite keys

A Map key type `K` must have a stable, deterministic equality and hashing contract, with no hidden mutable state or authority. In the initial profile, scalar Int/Bool/String and Symbol are the only candidate key types in static inference. List and Tuple keys MUST fail E_MAP_KEY unless a versioned implementation proves deep immutability/frozen snapshot semantics, element-wise Hash/Eq, canonical equality (including nested types), bounded hash traversal, cycle handling, resource quotas, no post-insertion mutation, and appropriate tenant/symbol-domain isolation. No fallback to pointer identity, stringification, or hashing a mutable object's address is allowed.

The fixed meaning of `[foo]` makes syntax context-independent: changing the following operator cannot silently change a List into a scalar, alter ownership, or bypass the Hash/Eq obligation. An explicit `freeze`/persistent immutable collection conversion may be specified in a later milestone but is not invented by this chapter. Unsupported collection keys must fail before emitting executable artifacts.

## Record construction and field inventory

```atto
let first = {bar: 5, active: true};
let second = (bar=5, active=true);
let one = {bar: 5};
let one_alt = (bar=5);
const int bar = 5;
let from_variable = {bar: bar};
let from_variable_alt = (bar=bar);
```

Records have compile-time identifier fields, structurally canonical types independent of field declaration order, and source-order exactly-once initialization. They cannot have computed keys, quoted Map-key labels, or Symbol key expressions. A one-field Record is already `{bar:5}` or `(bar=5)`; `bar :: 5` is not a standalone `RecordEntry` in v1 because `::` is reserved for callable headers.

**Possible future Record shorthand:** `{bar}` could mean `{bar: bar}` after an ownership-aware binder proves the source variable, copy/borrow/move mode, and evaluation order. This shorthand is NOT enabled yet. `(bar)` always groups the expression and `(bar,)` is a one-element Tuple; no ambiguous reinterpretation is permitted. Mixing quoted Map keys with identifier Record fields is E_LITERAL_KIND.

## Conformance matrix

| Source | Key interpretation | Static acceptance now |
| --- | --- | --- |
| `"foo" => 5` | String, Entry<string,int> | Typed-only; guest runtime gated |
| `#foo => 5` | Symbol, Entry<Symbol,int> | Typed-only; guest Symbol-domain runtime gated |
| `const string foo="bar"; foo => 5` | Evaluated string variable | Typed-only for a verified immutable scalar binding |
| `["foo"] => 5` | List<string> key | Parse; E_MAP_KEY until immutable List Hash/Eq proof |
| `[true] => 5` | List<bool> key | Parse; E_MAP_KEY until immutable List Hash/Eq proof |
| `true => 5` | Bool key | Typed-only; guest runtime gated |
| `{["foo"] => 5}` | Map with List<string> key | Parse; E_MAP_KEY until Hash/Eq proof |
| `foo => 5` | Evaluated key | Lexical type/ownership must be proved |
| `[foo]` | List expression | Existing collection typing |
| `{bar:5}`, `(bar=5)` | Record with named field | Existing closed Record subset |
| `{bar}` | Reserved Record shorthand | Not enabled |
| `bar :: 5` | Invalid RecordEntry syntax | E_SYNTAX |
| `{bar:5, "bar":7}` | Mixed Record/Map syntax | E_LITERAL_KIND |
| `{#foo => 1,#foo => 2}` | Duplicate Symbol key | E_DUPLICATE in one identity domain |

**Verification boundary:** The Rust/browser compiler's frontend parsing, static typed-IR, and no-artifact guest rejection do not prove composite-key hashing, Map/Entry guest allocation, or runtime Symbol transport. Independent backends and formatters need pinned tests for the precise context-free square-bracket semantics and full source-order/ownership guarantees.
