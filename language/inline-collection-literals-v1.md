# Inline records, maps, sequences and tuples — v1 candidate

**Status:** candidate language contract. This document defines intended portable semantics; no backend is considered conformant without successful guest execution and negative cases at an exact commit. It does not reinstate removed \`~map(...)\`, \`~array(...)\`, \`~record(...)\`, or other tilde-prefixed constructors.

> **Quoted-key correction (2026-11-20):** [atto-spec #133](https://github.com/atto-lang/atto-spec/pull/133) supersedes the older rule assigning quoted brace keys to Records. Identifier-colon fields and parenthesized identifier-equals fields construct Records; quoted brace keys and expression arrows construct Maps. This branch stages the corrected language contract so the Record-layout proposal cannot be misread as supporting the obsolete rule.

## Spelling and grammar

The core generic type constructor names \`Record\`, \`Map\`, \`List\`, \`Array\` and \`Tuple\` also accept the exact lowercase aliases \`record\`, \`map\`, \`list\`, \`array\` and \`tuple\`. These spellings have the **same** type identity and generic arity; this rule is contextual to type positions and does not lower-case arbitrary identifiers, modules, namespaces or user types. Formatter canonical output is upper-cased built-in type names, never renamed user identifiers.

\`\`\`ebnf
inline_expression = record_or_map | list_or_array | tuple_or_group ;
record_or_map    = "{" [ (field_entry | map_entry), { separator, (field_entry | map_entry) }, [","] ] "}" ;
field_entry      = IDENT, ":", expression ;
map_entry        = STRING, ":", expression | expression, "=>", expression ;
list_or_array    = "[", [expression, {",", expression}, [","]], "]" ;
tuple_or_group   = "()" | "(", expression, "," [expression, {",", expression}, [","]], ")"
                 | "(", expression, ")" ;
separator        = "," | NEWLINE ;
\`\`\`

A parser may accept a newline as an entry separator **only at the same brace nesting level** after a completed entry, never in the middle of its key/value expression. A same-line sequence of entries needs commas. A trailing comma is allowed. Array/list entries require commas, including across lines. Bare \`(x)\` groups; \`(x,)\` is a one-element tuple; \`()\` is an empty tuple, **not** null, void, or an empty argument list when used as an expression. Blocks continue using \`block { ... }\`; a bare expression-position \`{ ... }\` is never a statement block.

## Examples

\`\`\`atto
let Record foo = {
    bar: []
};
let Map lookup = {
    "1" => 1
    "2" => 3
};
let List entries = [];
let Array<Record> rows = [
    {job: 1}, {car: "str"}, {x: true}
];
let Tuple empty = ();

let tuple also_empty = ();
let array<record> lower = [
    {job: 1}, {car: "str"}, {x: true}
];
\`\`\`

The equivalent \`let name: Type = literal;\` binding form is valid.

**Record vs Struct layout contract:** see
[record-struct-layout-v1.md](record-struct-layout-v1.md). A closed Record
has a canonical field-name/type shape independent of source ordering,
while initializer expressions still run in original source order.
Nominal Struct uses declaration-order fields, has no dynamic key table,
and is distinct from structural Record. Both can have fixed, directly
indexed fields when types are resolved. This remains a candidate
optimizer contract; no guest Struct parser or physical ABI is implied.

## Contextual typing and identity

- `{foo: value}` and `(foo=value)` construct structural Records with statically named identifier fields. `{"foo": value}`, `{'foo': value}`, backtick quoted `:` keys, and `{foo => value}` construct Maps. Map `:` and `=>` items may mix, but no Map item may mix with an identifier-colon Record field. Duplicate Record identifiers and constant Map keys reject.
- A map's keys must satisfy the language's equality/hash contract. Duplicate compile-time constant map keys are rejected; **a later dynamically computed equal key replaces the earlier value** (last value wins). Evaluation of each key/value expression is source-ordered and exactly once. Replacement must correctly release the displaced value and cannot bypass borrow/ownership checks.
- An empty \`{}\` must have an unambiguous expected \`Record\` or \`Map<K,V>\` type (or a future explicit typed factory). An untyped \`{}\` is rejected as ambiguous.
- \`[]\` becomes a \`List<T>\` or \`Array<T>\` only in an expected-type position. Without a target type, a nonempty \`[...]\` may be inferred as a List when all elements have a valid common type; an empty untyped \`[]\` must not silently choose a mutable/aliased runtime collection.
- \`List<T>\` is a growable logical collection. \`Array<T>\` has a fixed element count and contiguous array semantics when supported by a target. No implicit conversion between them is permitted, despite sharing brackets. Every \`Array<T>\` item must be assignable to \`T\`.
- Bare \`Record\` is an open record supertype of record values with different field sets. Thus \`Array<Record>\` can contain \`{job:1}\`, \`{car:"str"}\`, and \`{x:true}\` without inventing fields or assuming that all elements have the same layout. Access to an absent field is rejected or must first be guarded by presence/type checking. A specialized closed record type remains eligible for AOT layout optimization.
- A bare `List` or `Map` annotation may infer generic arguments from a nonempty initializer if types resolve unambiguously; empty `[]` requires an explicit/concrete expected element type (and expected List versus Array kind), while `{}` requires an expected Record shape or concrete `Map<K,V>`. Do **not** infer an unconstrained Any-like mutable collection from `let List x = []`.
- Tuple values preserve order, length and per-position types. \`()\` is an arity-zero tuple (a unit-like value), distinct in type from \`void\`. A tuple may not be silently flattened by a comma operator or used as an automatic multi-return.

## Map, Record and Struct: keys, fields, and layout

| Type | Name/key language | Type discipline | Primary optimization |
| --- | --- | --- | --- |
| `Map<K,V>` | Any runtime key expression of type `K` satisfying hash + equality; strings may contain arbitrary Unicode, punctuation and the empty string | Homogeneous key/value types; entries added/removed dynamically | Hash table / backend-specific keyed storage |
| `Record` | Compile-time **identifier-only** fields (`{foo:1}` or `(foo=1)`), never quoted brace keys | Structural, potentially heterogeneous fields; closed shape or explicitly open shape | Closed Record may use an AOT field layout / interned shape |
| `Struct` | Declared **identifier-only** field names in this candidate | Nominal, statically declared heterogeneous fields | Predictable AOT offsets and unboxed fields where safe |

The `Struct` rule describes the intended distinction from records; this proposal does **not** add a new struct declaration grammar. A serializer may attach an external field-name alias (for example `content-type`) to a struct's ordinary identifier field `content_type`. The alias is serialization metadata, **not** an additional member, and never makes `s["content-type"]` an implicit struct lookup.

```atto
let Map<string, int> settings = {
    "retry-count" => 3,
    "" => 0
};
let Record response = {status_code: 200, ok: true};
let Record response_paren = (ok=true, status_code=200);
let Map<string, string> headers = {
    "content-type": "application/json",
    'x-request-id' => "abc123"
};
// Intended static Record selection once verified by an exact guest test:
response.status_code;
response["status_code"];
// Dynamic Map access is never a Record slot shortcut:
headers.get("content-type");
```

A quoted key in braces creates a **Map** item, not a Record field, whether written `"content-type": v` or `"content-type" => v`. Record fields use identifiers with `:` or `(field=value)`. `Map<K,V>` is not restricted to `string` keys; e.g. `Map<int,string>` or `Map<Symbol,int>` are targets only when Hash/Eq and ownership proofs exist. Parser/type acceptance is not guest Map-runtime proof.

### Access and presence (candidate syntax/semantics, not implemented guest execution)

- `record.field` accesses a statically known identifier field; `record["field"]` may select the **same existing identifier** using a compile-time string-literal projection when that target verifies it. `{a:1, "a":2}` is `E_LITERAL_KIND` (Record/Map mixture), not a duplicate Record; `{"a":1, 'a' => 2}` is a Map with duplicate decoded keys and requires `E_DUPLICATE`.
- A **closed record** with no matching field is a compile-time missing-field error (`E_NO_FIELD`). Two closed record shapes with the same decoded names and compatible types have the same structural field set **regardless of declaration order**. Evaluation of initializers and any destructors still follows the specified source order; canonicalizing a type's field set cannot reorder effects.
- For the **open** bare `Record` supertype, an unguarded field read is rejected with a presence/type diagnostic (`E_FIELD_PRESENCE`) unless the checker has proved and narrowed the required field. A presence guard must refine both field existence and type. No speculative raw AOT offset reads are allowed.
- `record[key_expression]` where the key is not a compile-time string is **not** silently converted into a map operation. This candidate only commits to literal-key record indexing; computed record lookup needs a separately typed dynamic-reflection API.
- A missing map key is different from a missing record field: map lookup must expose explicit absence (the safe `get` family uses `Option`), rather than manufacturing a default or returning an unchecked value. The exact `map[key]` indexing return/throw behavior is reserved for the map API contract and is **not** fixed by this record-bracket-access proposal.
- Map key equality uses `eq`/hash-compatible value semantics, not object-identity `==`. Equal keys must hash identically, `hash`/equality must remain stable while inserted, and a replacement for a duplicate runtime key must not create a second live slot. Compile-time duplicate constants are errors, including positive/negative zero when equal by key semantics.

### Serialization and layout boundaries

- Record JSON property names are identifier field names. String-Map JSON property names preserve decoded UTF-8 keys, including punctuation, spaces, Unicode and empty strings. JSON objects cannot faithfully encode arbitrary non-string-key `Map<K,V>` without an explicit codec or entry-array representation; no silent lossy stringification.
- Struct JSON external names follow declared serialization metadata; internal field names, static typing and AOT offsets remain unchanged. A duplicate **serialized** name (including collisions between aliases and unaliased fields) is a compile-time error when metadata is static.
- JSON object property order must not affect semantic equality. A deterministic/canonical serializer may sort names, but must not change the **source-order evaluation** of initializers. Duplicate JSON input properties need an explicit decoder policy and must never bypass schema validation or ownership rules.
- Closed records may share an interned structural layout; `Record` open values require runtime shape/presence metadata if dynamically accessed; structs retain nominal layouts; maps retain keyed lookup semantics. These are distinct IR/runtime representations even when the surface braces look similar.

### Additional conformance cases

1. `{"content-type": 1, status_code: 2}` mixes a quoted Map key and an identifier Record field and must reject `E_LITERAL_KIND`; `{"": 1}` is a Map with an empty string key, not an empty-name Record field.
2. `{a: 1, "a": 2}` must reject `E_LITERAL_KIND`, rather than reporting a duplicate Record field. `{a:1, a:2}` rejects `E_DUPLICATE`. Record shape identity is independent of identifier field declaration order; initializer evaluation remains source ordered.
3. A missing field on a closed Record rejects with `E_NO_FIELD`; open-record reads reject with `E_FIELD_PRESENCE` unless a verified presence/type guard narrows the field.
4. `response["status_code"]` selects the statically known identifier Record field `status_code` when supported, while `headers.get("content-type")` performs a dynamic Map key lookup. `response[some_runtime_string]` may not fabricate a static field access.
5. Dynamically duplicate Map keys replace the prior value with ownership-safe cleanup; static duplicate Map keys reject. Hashable non-string keys require independent backend conformance.
6. Round-trip identifier Record field names and string Map keys through JSON, including quoted key punctuation/Unicode; reject non-string Map-key JSON encoding without an explicit codec; detect conflicting serialized Struct aliases.

**Staging rule:** the Rust compiler's parser/typed-IR acceptance is not proof of field indexing, Map operations, Struct layout or any guest serialization. Track separate parser, type-checker, guest allocation, guest access and codec statuses.

## Ownership, security and implementation requirements

Literal fields/items are evaluated left to right, once. Allocation may fail explicitly; no item may be dropped, duplicated or partially published on failure. An inline record/array/map/list containing mutable nested references **does not** make cross-actor messaging safe merely by being a literal: messages must use the checked copy/transfer/share contract (including \`copy!!\` for independent mutable graphs and \`take!\` for exclusive transfer). Whole-container and nested-borrow lifetimes must remain valid across \`await\` and actor boundaries.

All frontends must agree on parse tree shape, contextual type inference, diagnostics, bounded literal size/depth and formatter round-trip behavior. Runtime support requires guest-level allocation, layout and cleanup tests, plus equality/identity and serialization cases. Parsers may recognize the syntax before code generation, but must explicitly reject unsupported lowering (\`E_UNSUPPORTED\`) and never generate a placeholder object/array or quietly change List into Array.

## Required negative tests

1. Mixed \`{a: 1, "b" => 2}\`, and duplicate \`{a: 1, a: 2}\`.
2. Missing same-line separator \`{"a" => 1 "b" => 2}\`; missing closing delimiter; excessive nesting/entries.
3. Generic arity errors \`Array<int,string>\`, \`Map<int>\`, \`Record<int>\` and \`List<>\`.
4. \`Array<int>\` containing strings; \`Map\` with unhashable key; duplicate constant keys.
5. Untyped \`{}\` ambiguity, invalid untyped empty \`[]\`, missing-field access from an open Record, immutable/nested alias escapes, and cross-actor shared mutable storage.
6. \`(x)\` versus \`(x,)\` versus \`()\`, formatter idempotence, and upper/lower type alias equivalence.

**Evidence matrix:** record the source tree SHA, target/toolchain, exact positive and negative **guest** cases, and statuses PASSED / FAILED / UNSUPPORTED / NOT_EXECUTED for Java/GraalVM, LLVM, .NET AOT, Rust/Wasm and other Atto backends separately. Parse-only or host-only tests cannot be reported as guest parity.
