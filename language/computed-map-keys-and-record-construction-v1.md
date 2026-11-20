# Computed Map keys, standalone Entries and Record construction — candidate v1

This chapter extends [Symbol-keyed Entries](symbol-keyed-entries-v1.md) and [quoted Map versus Record literals](quoted-map-vs-record-literals-v1.md). A computed-key bracket is a *key-position marker* and never introduces ambient Map permissions. Exact guest Map allocation, Entry execution, and cross-tenant Symbol identity remain separate admission gates.

## Map key position and type inference

```atto
pub fnc main(): int {
    const string foo = "bar";
    let literal_entry = "foo" => 5;    // Entry<string,int>
    let symbolic_entry = #foo => 5;   // Entry<Symbol,int>
    let computed_entry = [foo] => 5;  // Entry<string,int>, reads foo once
    let entry_alias = foo => 5;       // compatibility form: same Entry<string,int>
    let Map<string,int> m = { [foo] => 5, "other": 7 };
    let Map<Symbol,int> symbols = { #foo => 5 };
    return 0;
}
```

`[expr] => value` explicitly marks a **computed Map key**, rather than constructing an Array/List key. This rule applies to standalone Entry expressions and to Map `=>` items in `{ ... }`. The key expression is evaluated once before the value, in source order. If a `const string foo = "bar"` binding is in scope, `[foo] => 5` infers `Entry<string,int>`. With `const Symbol key = #foo`, `[key] => 5` infers `Entry<Symbol,int>`. No string coercion, hidden reflection, actor-state read or ambient permission is implied.

**Compatibility decision:** The existing `foo => 5` expression-key syntax remains accepted and semantically identical to `[foo] => 5`; the explicit brackets are the recommended formatter output for computed keys. This preserves current first-class `Entry<K,V>` and Map grammar while offering an unmistakable computed-key marker. New code SHOULD use `[foo] => 5`. A future mandatory-bracket migration needs independent versioning and migration support, not silent reinterpretation.

Literal Map keys do not require brackets: `"foo" => 5`, `'foo' => 5`, `` `foo` => 5 ``, `#foo => 5`, `42 => 5`, and the quoted-string colon aliases retain their current semantics. The `#foo` spelling is a Symbol *literal*, while `[foo]` is a value expression resolving a binding named `foo`: neither can be mistaken for the other.

### Bracket precedence and no Array confusion

- An ordinary expression `[foo]` with **no immediately following entry `=>`** remains the existing one-element Array/List literal. `[foo] => 5` is one Entry with the value of `foo` as key, not `Entry<Array<T>,int>`.
- To deliberately use an Array/List value as a key, group the Array expression: `([foo]) => 5`. This will normally fail `E_MAP_KEY` unless the collection type has an explicitly validated stable Hash/Eq implementation.
- The computed-key bracket must enclose **exactly one expression**. `[] => 5` and `[foo, bar] => 5` reject `E_MAP_KEY`; nesting, expression depth and source size limits apply.
- When a Map literal uses bracketed computation, it is an initializer key position: `{[foo] => 5}` is `Map<string,int>` for a string `foo`; `{[foo]: 5}` is invalid, never a Record field.
- Arrow is nonassociative: `a => b => c` rejects unless deliberately grouped. An Entry's `key` and `value` retain immutable nominal identity; a Map literal is a Map, not a record or List of Entries.
- Contextual typing cannot magically make an unresolved variable hashable. The compiler MUST resolve `foo` with lexical scope and ownership checks; in the initial Rust/browser static profile only previously declared, immutable, direct-scalar `const` bindings are eligible for early type inference. Mutable, moved, escaped, untrusted, or unknown computed key expressions must fail closed until the full checked binder is available.

## Record construction and field inventory

A Record is a structural collection with compile-time identifier-named fields, not a keyed Map. The following forms have equivalent structural Record types (when their values have the same types):

```atto
let first = {bar: 5, active: true};
let second = (bar=5, active=true);
let one = {bar: 5};
let one_alt = (bar=5);
// If a variable `bar` is already in scope, the explicit copying/borrowing form is:
let from_variable = {bar: bar};
let from_variable_alt = (bar=bar);
```

Closed Record type identity is independent of declaration order. Field initializers always execute in source order, exactly once. Duplicate fields reject (`{bar:1,bar:2}` and `(bar=1,bar=2)`); mixed quoted Map keys and identifier Record fields reject (`{bar:1,"bar":2}`); Record fields may not be computed via `[foo]`. The string key `'bar'` and Symbol `#bar` belong to Maps, not to the Record field inventory.

**No standalone RecordEntry operator in v1.** The expression `bar :: 5` remains invalid; `::` is already used as a callable header marker. An isolated field is written directly as `{bar: 5}` or `(bar=5)`, both yielding a one-field Record. This avoids an unneeded `RecordEntry` value and extra field-ownership/capability semantics.

**Reserved shorthand for further review:** `{bar}` could eventually mean `{bar: bar}`, provided the binder proves the source variable and its value category. Do NOT enable this shorthand by silently treating `{bar}` as a Map or assuming an implicit copy or borrow. Parenthesized `(bar)` MUST continue to mean grouping, and `(bar,)` a one-element Tuple. Any future shorthand requires an explicit source-version rule, per-field move/borrow semantics, formatter tests and a dedicated conformance milestone.

## Executability and security

Stable Hash/Eq is a checked property of Map key type `K`. A `Symbol` key compares by authorized Symbol identity, never by a string conversion; repeated `#foo` in one symbol domain is the same key, but the literal spelling alone cannot authorize cross-TenantVM equality or transport. Record field access is a static layout operation, never a Map hash lookup. Computed keys must not escape mutable borrows or read sealed actor state without the required state access capability.

Before declaring a backend conformant, test the full compiler's **real guest execution** for `Entry<string,int>`, `Entry<Symbol,int>`, `Map<string,int>`, `Map<Symbol,int>`, key evaluation order, hash/equality collision behavior, lifetime, replacement cleanup, and cross-tenant domain isolation. Syntax/type acceptance in a Rust host test is NOT guest execution. Backends lacking a verified guest Map/Entry runtime must return E_UNSUPPORTED and emit no executable artifact.

## Test matrix

| Case | Required static result | Guest gate |
| --- | --- | --- |
| `"foo" => 5` | Entry<string,int> | Separate runtime proof |
| `#foo => 5` | Entry<Symbol,int> | Separate runtime/domain proof |
| `const string foo="bar"; [foo] => 5` | Entry<string,int> | Separate runtime proof |
| `{[foo] => 5}` | Map<string,int> | Separate runtime proof |
| `foo => 5` | Same Entry as computed key (compatibility) | Separate runtime proof |
| `[foo]` | Array/List, never Entry | Existing Array/List gate |
| `([foo]) => 5` | Entry with collection key, ordinarily E_MAP_KEY | Reject if unhashable |
| `[] => 5`, `[foo,bar] => 5` | E_MAP_KEY | No artifact |
| `#foo => 5 => 7` | E_LITERAL_KIND (unparenthesized chain) | No artifact |
| `{bar:5}`, `(bar=5)` | One-field Record | Separate fixed-slot guest proof |
| `{bar}` | Reserved; no implicit binding shorthand yet | No artifact |
| `bar :: 5` | Invalid in expression position | No artifact |
| `{bar:5, "bar":7}` | E_LITERAL_KIND | No artifact |
| `{#foo => 1,#foo => 2}` | E_DUPLICATE in same Symbol domain | No artifact |

