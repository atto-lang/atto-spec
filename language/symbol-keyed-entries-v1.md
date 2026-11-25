# Symbol-keyed Entry and Map identity — normative candidate

This contract refines the candidate `Entry<K,V>` semantics in `inline-collection-literals-v1.md` and the quoted Map/Record correction in `quoted-map-vs-record-literals-v1.md`. It does not claim a compiler already executes Symbol-keyed Maps.

> **Map/List key clarification:** [Map key expressions and Record construction](computed-map-keys-and-record-construction-v1.md) keeps `foo => 5` as the computed **value** key, and preserves `[foo] => 5` as a List key, never a scalar-unwrapping marker. Immutable List Hash/Eq must be proven before List keys are admitted; `#foo` remains a literal Symbol key.

## Standalone Entries

```atto
let entry = "foo" => 5;     // Entry<string, int>, inferred
let symbol_entry = #foo => 5; // Entry<Symbol, int>, inferred
let Entry<Symbol,int> typed = #foo => 5;
let Map<Symbol,int> status = {#foo => 5, #bar => 7};
```

`=>` in expression position constructs a nominal immutable `Entry<K,V>` and infers its K and V from the two operands; its semantics do not depend on whether K is a string, Symbol, integer, or some user-defined Hash/Eq-safe type. `=>` within braces delimits a Map initializer entry, NOT a `Record` field and NOT a standalone `Entry` AST at the top level. It is nonassociative outside explicitly grouped expressions, evaluated key first and value second, exactly once.

`#foo` is a Symbol literal, not a string, identifier reference, Record field name, or compiler-created expression such as `"#foo"`. The strings `"foo"`, `"#foo"` and the Symbol `#foo` never compare equal by implicit coercion and must produce distinct key type identities. The form `{#foo => 5}` constructs `Map<Symbol,int>`. A `Map<string,int>` expected type cannot silently accept it; mixing a Symbol and string key in a homogeneous Map literal requires an explicit legal common key type/union and a separately validated Hash/Eq policy, otherwise E_TYPE.

## Why no standalone RecordEntry v1

A Record field is a *statically named component of a Record's structural type*, not a dynamically computed key-value pair. `{bar: 5}` and `(bar=5)` construct the one-field Record directly. A standalone `bar :: 5` expression is NOT assigned a new `RecordEntry` type in v1: there is no demonstrated semantic operation that could consume it without duplicating `Record` construction or bypassing checked closed-field inventory, evaluation order, ownership and named-argument binding.

The `::` token is already used in Atto's callable-header compatibility grammar, so it is RESERVED from a new Record-entry binary operator. `bar :: 5` in ordinary expression position MUST be rejected, not treated as namespace resolution, a typed expression, a Map entry, or a Record field. If future field reflection, staged Record building, or hygienic field-spread needs a first-class descriptor, specify a distinct `Field<Name,T>` / compile-time field descriptor with a separate design, stability and security proof. A `Record` is not a `List<Entry<K,V>>`, and Map `Entry` cannot be silently used as a structural Record field.

## Symbol equality, hashing and tenant boundaries

- The compiler/resolver establishes a canonical Symbol identity within a permitted symbol domain; equality and Map Hash/Eq use that identity consistently, not string coercion, pointer addresses, a host language's `Symbol` object, or untrusted serialized integers. Repeated `#foo` in the SAME defined symbol domain refers to the same symbolic identity; `#foo` and `#bar` are distinct. Preserve exact Symbol spelling and any explicit public/private declaration visibility.
- User-defined Symbol identities are isolated by default between TenantVMs/actors in different isolation domains. The mere equality of spelling does not authorize cross-tenant key matching, capability acquisition or metadata observation. If a shared std/core Symbol domain or cross-domain transport is approved, use an explicitly validated, deterministic symbol-domain mapping; otherwise reject transfer, rather than implicitly coalescing names across tenants.
- A Symbol may be admitted as Map key only when its domain-scoped hash and equality contract is stable for the entire Map lifetime. Reject mutable or actor-state-dependent keys, moved/unowned Symbol handles, and unverified host or foreign Symbol objects. A Map lookup, insertion or upsert must not create ambient permissions or bypass tenant resource quotas.
- Constant duplicate Symbol keys within a single recognized domain must be detected before guest codegen: `{#foo => 1, #foo => 2}` is E_DUPLICATE. A literal string and Symbol of the same spelling are not duplicate keys, but a homogeneous `Map<K,V>` must then reject mixed key types without a permitted common type.
- Symbol identity/transport safety applies equally to a standalone `Entry<Symbol,V>`. Creating an Entry does not itself grant permissions to serialize the key, export it to another isolate, or use it as an untrusted actor message.

## Grammar and required tests

```ebnf
symbol_literal = "#", IDENT ;
entry_expression = expression_without_top_level_fat_arrow, "=>", expression_without_top_level_fat_arrow ;
map_item = expression, "=>", expression ;
record_field = IDENT, ":", expression ;
```

Only `#foo` is required by this milestone. Extend symbol spellings with whitespace or declaration syntaxes only through the separate canonical Symbol grammar; do not accidentally reinterpret a comment, directive or fragment marker as a Symbol.

Positive conformance: `"foo" => 5` has exact type `Entry<string,int>`; `#foo => 5` has `Entry<Symbol,int>`; `{#foo => 5}` has `Map<Symbol,int>`; two distinct Symbol keys admit distinct values; `map.get(#foo)` looks up using Symbol identity and returns the expected `Option<int>`; standalone Entry and Map `add` share Hash/Eq and ownership contracts.

Negative conformance: `bar :: 5` has no v1 expression semantics; `#foo` is NOT `"foo"` or `"#foo"`; a `Map<string,int>` cannot receive a Symbol key without a checked explicit conversion; duplicate Symbol constants reject; wrong `Entry<K,V>` type ascription rejects; missing/unimported private Symbols reject; cross-tenant Symbol admission without authorized domain mapping rejects; `Symbol`-keyed data never downgrades to a fabricated Record. Unsupported compilers MUST return precise E_UNSUPPORTED and emit zero executable guest artifacts rather than pretending that static parsing constitutes full Map/Entry support.

**Backend admission:** Rust/browser currently emits E_UNSUPPORTED for `#` symbols at the lexer; all other backends require independently pinned lexer/type/ownership/guest and formatter/conformance receipts. Do not claim `Entry<Symbol,int>` or `Map<Symbol,int>` execution until the complete compiler, runtime, and security behavior is observed at exact source SHAs.
