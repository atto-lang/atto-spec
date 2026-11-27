# Inline records, maps, sequences and tuples — v1 candidate

> **v3 syntax correction (2026-11-27):** [Pair literals and name-derived bindings](pair-literals-and-bindings-v3.md) governs the new profile: `Pair<V>` is string-keyed, `:=` always constructs Pair, `=>` constructs Entry in key/value expressions, and `const y := 5;` declares a Pair. Named calls accept `=` and `:`. Conflicting older examples below are historical-profile only.

**Status:** candidate language contract. This document defines intended portable semantics; no backend is considered conformant without successful guest execution and negative cases at an exact commit. It does not reinstate removed \`~map(...)\`, \`~array(...)\`, \`~record(...)\`, or other tilde-prefixed constructors.

> **Normative quoted-key correction (2026-11-20):** Identifier-colon and parenthesized identifier-equals fields construct Records. Quoted string keys with `:` or `=>` and expression arrows construct Maps; mixed Map/Record items fail closed. See [quoted Map keys versus Record fields (atto-spec #133)](quoted-map-vs-record-literals-v1.md) and [Record layout #72](https://github.com/atto-lang/atto-spec/pull/72) for downstream implementation constraints.

## Spelling and grammar

The core generic type constructor names \`Record\`, \`Map\`, \`List\`, \`Array\` and \`Tuple\` also accept the exact lowercase aliases \`record\`, \`map\`, \`list\`, \`array\` and \`tuple\`. These spellings have the **same** type identity and generic arity; this rule is contextual to type positions and does not lower-case arbitrary identifiers, modules, namespaces or user types. Formatter canonical output is upper-cased built-in type names, never renamed user identifiers.

\`\`\`ebnf
inline_expression = record_or_map | list_or_array | tuple_or_group | named_record ;
record_or_map    = "{" [ (field_entry | map_entry), { separator, (field_entry | map_entry) }, [","] ] "}" ;
field_entry      = IDENT, ":", expression ;
map_entry        = STRING, ":", expression | expression, "=>", expression ;
list_or_array    = "[", [expression, {",", expression}, [","]], "]" ;
tuple_or_group   = "()" | "(", expression, "," [expression, {",", expression}, [","]], ")"
                 | "(", expression, ")" ;
named_record     = "(", named_field, { ",", named_field }, [","], ")" ;
named_field      = IDENT, "=", expression ;
separator        = "," | NEWLINE ;
\`\`\`

A parser may accept a newline as an entry separator **only at the same brace nesting level** after a completed entry, never in the middle of its key/value expression. A same-line sequence of entries needs commas. A trailing comma is allowed. Array/list entries require commas, including across lines. Bare \`(x)\` groups; \`(x,)\` is a one-element tuple; \`()\` is an empty tuple, **not** null, void, or an empty argument list when used as an expression. Blocks continue using \`block { ... }\`; a bare expression-position \`{ ... }\` is never a statement block.

## Examples

\`\`\`atto
let Record foo = {bar: [1, 2]};
let Map<string, int> lookup = {
    "1" => 1,
    "2" => 3
};
let List<int> entries = [];
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

- `{foo: value}` and `(foo=value)` construct structural Records with **identifier fields**; `{"foo": value}`, `{'foo': value}`, backtick quoted colon keys and `{foo => value}` construct Maps. A Map can mix quoted `:` and `=>` items, but never with an identifier-colon Record item. Duplicate identifiers and static duplicate Map keys reject.
- A map's keys must satisfy the language's equality/hash contract. Duplicate compile-time constant map keys are rejected; **a later dynamically computed equal key replaces the earlier value** (last value wins). Evaluation of each key/value expression is source-ordered and exactly once. Replacement must correctly release the displaced value and cannot bypass borrow/ownership checks.
- An empty \`{}\` must have an unambiguous expected \`Record\` or \`Map<K,V>\` type (or a future explicit typed factory). An untyped \`{}\` is rejected as ambiguous.
- \`[]\` becomes a \`List<T>\` or \`Array<T>\` only in an expected-type position. Without a target type, a nonempty \`[...]\` may be inferred as a List when all elements have a valid common type; an empty untyped \`[]\` must not silently choose a mutable/aliased runtime collection.
- \`List<T>\` is a growable logical collection. \`Array<T>\` has a fixed element count and contiguous array semantics when supported by a target. No implicit conversion between them is permitted, despite sharing brackets. Every \`Array<T>\` item must be assignable to \`T\`.
- Bare \`Record\` is an open record supertype of record values with different field sets. Thus \`Array<Record>\` can contain \`{job:1}\`, \`{car:"str"}\`, and \`{x:true}\` without inventing fields or assuming that all elements have the same layout. Access to an absent field is rejected or must first be guarded by presence/type checking. A specialized closed record type remains eligible for AOT layout optimization.
- A bare `List` or `Map` annotation may infer generic parameters from nonempty contents if type checking is unambiguous. An empty `[]` requires a concrete contextual List/Array element type; `{}` requires a concrete expected Record shape or `Map<K,V>`. The old `let List x = []` untyped inference exception is **not valid** in this corrected contract.
- Tuple values preserve order, length and per-position types. \`()\` is an arity-zero tuple (a unit-like value), distinct in type from \`void\`. A tuple may not be silently flattened by a comma operator or used as an automatic multi-return.

## Parenthesized named Records, arity-zero Tuples, and named-argument boundaries (v1)

**Normative candidate decision:** `(foo=1, bar=true)` constructs a **Record**, with the same structural type, checked field inventory, field access, canonical shape and source-order evaluation as `{foo:1, bar:true}`. The compiler may preserve a distinct syntax-origin span for diagnostics/formatting, but the typed expression is the ordinary `Record`; it is never a Tuple, Map, function-call argument list or anonymous nominal Struct. No new runtime Record/Map representation may be invented for parentheses.

- A parenthesized Record starts only when the first token inside `(` is a legal, non-reserved identifier immediately followed by the assignment token `=` (whitespace permitted). The separator between entries is a comma. Only identifier field labels are accepted in this parenthesized spelling. Quoted keys in braces construct Maps, never Records.
- `(foo=1)` and `(foo=1,)` are one-field Records; `(foo=1, bar=2,)` is a two-field Record. Field order is not part of structural type identity; value initializers are evaluated once in the original source order. Duplicate fields, including Unicode-identical decoded names, reject `E_DUPLICATE`.
- `(foo=1, 2)`, `(foo=1, bar:2)` and `(foo=1, "bar"=2)` reject `E_LITERAL_KIND`; there is no mixture of positional Tuple items and named fields. An assignment expression `(x = 1)` is never silently created by this rule. `(foo==1)` still groups a comparison expression when valid.
- `()` is **always** `Tuple` of arity zero, with unit-like value but distinct from `void`. It is **never** an empty Record or function argument list in expression position, even with an expected Record type. `(x)` is grouping; `(x,)` is a one-element Tuple; `(x,y)` is a two-element Tuple. Empty tuple construction uses `()` with optional expected `Tuple` type; do **not** invent an unsupported `Tuple<>` generic spelling. The syntax of a zero-argument **call** `f()` is independently determined by call context.
- Bare `{}` has no default interpretation and requires a known expected `Record` or concrete `Map<K,V>` type; bare `[]` requires contextual typing when empty to distinguish `Array<T>` from `List<T>`. Neither `()` nor `{}` may be guessed from a globally searched nominal Struct of identical shape. An anonymous zero-field Struct uses explicit `infer struct {}` and a nominal Struct initializer uses `T{...}` or contextually typed `infer struct {...}`, subject to the separate checked Struct contract.
- A Struct field must use its declared identifier name; serializable aliases do not become bracket index or named-argument identifiers. The form `let struct<T> v = {...};` is **not** a new type declaration/constructor rule; use `let v: T = infer struct {...};` or `let v = T{...};` once that target has guest support.
- Generic type-close immediately followed by a binding assignment is unambiguous **in type context**: `let m: Map<string,int>={};` means `Map<string,int>` followed by `=`, despite the adjacent source characters `>=`. The lexer/parser must preserve a separate initializer assignment and precise source positions; ordinary expression `x>=y` retains its greater-or-equal operator. Nested generics like `Map<string,List<int>>={}` obey the same contextual rule. This is not an implicit cast or a general reassociation of comparison operators.

**Callable argument distinction:** `f(foo: 1)` is a named argument in **call context**; ordinary `f(foo=1)` is rejected except for the separately specified nominal Struct initializer; `f((foo=1))` passes one **Record value** positionally; `f(r)` never auto-expands a Record. `f(...r)` explicitly expands a statically known Record's identifier-named fields to named arguments, subject to the callable's resolved parameter signature. The call site must reject unknown, duplicated, inaccessible or type-incompatible arguments; defaulted parameters may be omitted. Positional arguments may precede named arguments, but positional arguments after named ones reject. Nested expansion, an open Record without proven fields, and quoted nonidentifier keys have no ambient reflection fallback. No duplicate can arise from `f(foo: 1, ...r)`, even if its values are equal. Evaluate arguments/fields left-to-right exactly once; reject unsafe ownership transfer, mutable borrowed graph escapes, actor state access and any tenant boundary bypass. `...` is not implicit general spread or host `Map` iteration.

```atto
let tuple_value = ("5", 3, true);      // Tuple<string,int,bool>
let named = (foo="star", abc=5);       // Record with identifier fields
let braced = {foo:"star", abc:5};      // structurally same Record
let empty_tuple = ();                 // Tuple of zero elements
let empty_record: Record = {};        // Record; context required for {}
let empty_map: Map<string,int> = {};  // Map; context required for {}

describe(name: "Atto", count: 5);      // named call arguments
describe((name="Atto", count=5));     // one Record positional arg
describe(...named);                   // explicit checked Record expansion, proposed
```

**Admission stages:** The Rust/Wasm narrow compiler may first lower parenthesized, fully scalar closed Records through the *existing* compiler-authenticated fixed-field Record ABI. That is real guest support only after execution at an exact compiler SHA. Named calls, Record spread, dynamic Map, nominal Struct and general Tuple allocation/indexing remain independent, fail-closed stages; a grammar or static typing pass cannot certify their runtime execution. Canonical formatter output for parenthesized named Records is `(foo=1, bar=2)` (do not rewrite user syntax to a call). Both accepted Record surface forms must have parse-equivalent typed shapes, and formatting must be idempotent.

## Map, Record and Struct: keys, fields, and layout

| Type | Name/key language | Type discipline | Primary optimization |
| --- | --- | --- | --- |
| `Map<K,V>` | Any runtime key expression of type `K` satisfying hash + equality; strings may contain arbitrary Unicode, punctuation and the empty string | Homogeneous key/value types; entries added/removed dynamically | Hash table / backend-specific keyed storage |
| `Record` | Compile-time identifier-only field names (`{foo:1}` or `(foo=1)`), never quoted brace keys | Structural, potentially heterogeneous fields; closed shape or explicitly open shape | Closed Record may use an AOT field layout / interned shape |
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
response.status_code;
response["status_code"]; // static Record projection, once guest verified
headers.get("content-type"); // checked Map lookup, not a Record offset
```

Quoted keys in braces construct **Maps**, whether `"content-type": v` or `"content-type" => v`; identifier-colon `{field: v}` and parenthesized `(field=v)` construct Records. `Map<K,V>` may use independently hashable key types other than strings, but this is a candidate contract, not Rust/Wasm runtime proof.

### Access and presence (candidate syntax/semantics, not implemented guest execution)

- `record.field` selects an existing identifier field. `record["field"]` may select that same field by a **constant string-literal projection**, once independently verified; it does not imply `{"field": value}` constructs a Record. `{a: 1, "a": 2}` rejects `E_LITERAL_KIND`, not duplicate Record fields. Map key comparisons use decoded exact strings without case folding.
- A **closed record** with no matching field is a compile-time missing-field error (`E_NO_FIELD`). Two closed record shapes with the same decoded names and compatible types have the same structural field set **regardless of declaration order**. Evaluation of initializers and any destructors still follows the specified source order; canonicalizing a type's field set cannot reorder effects.
- For the **open** bare `Record` supertype, an unguarded field read is rejected with a presence/type diagnostic (`E_FIELD_PRESENCE`) unless the checker has proved and narrowed the required field. A presence guard must refine both field existence and type. No speculative raw AOT offset reads are allowed.
- `record[key_expression]` where the key is not a compile-time string is **not** silently converted into a map operation. This candidate only commits to literal-key record indexing; computed record lookup needs a separately typed dynamic-reflection API.
- A missing map key is different from a missing record field: map lookup must expose explicit absence (the safe `get` family uses `Option`), rather than manufacturing a default or returning an unchecked value. The exact `map[key]` indexing return/throw behavior is reserved for the map API contract and is **not** fixed by this record-bracket-access proposal.
- Map key equality uses `eq`/hash-compatible value semantics, not object-identity `==`. Equal keys must hash identically, `hash`/equality must remain stable while inserted, and a replacement for a duplicate runtime key must not create a second live slot. Compile-time duplicate constants are errors, including positive/negative zero when equal by key semantics.

### Static Record bracket mutation (candidate; requires separate guest proof)

**Decision:** A closed, owned, writable `Record` may update an **existing identifier-named field** using `record["field_name"] = value;` when statically resolved. This is a checked Record field assignment, not a Map upsert. `r["foo"]` and `r.foo` select the same verified Record slot. A quoted brace key (including nonidentifier text, punctuation or Unicode string data) creates a Map, **not** a Record field; arbitrary dynamic Record fields are not created by bracket assignment.

```atto
pub fnc main(): int {
    let mut Record r = {foo: 1, status_code: 2};
    r["foo"] = 3;          // same existing identifier field as r.foo
    r["status_code"] = 4;  // another known identifier field
    return r["foo"] + r["status_code"]; // expected: 7
}
```

- A mutation requires mutable write authority over the **owned referent**: `val mut Record r` and `let mut Record r` may update where ownership/loans permit; `val Record` and `let Record` must reject writes (`E_IMMUTABLE`). `let` by itself permits rebinding, not a field write. Active shared loans, moved owners, sealed actor state and final/readonly fields remain protected.
- Only a compile-time **quoted string literal** `r["foo"]` is admitted for indexed Record assignment in this version. `r[key]`, interpolated/computed strings and numeric indexes are **not** treated as static field access (`E_UNSUPPORTED`). The compiler must resolve `r` to a proven closed structural Record after lexical scope and type checking, never by variable name alone. A bare open `Record` lacking a proven narrowed shape is not eligible for offset writes (`E_FIELD_PRESENCE` or a precise unsupported diagnostic).
- A missing field in a **closed** Record is `E_NO_FIELD` for reads and writes. `r["new_field"] = 1` does not add a field; an incompatible RHS rejects `E_TYPE` without changing the structural type. A future `r with {new_field: value}` must be independently specified/implemented and cannot treat a quoted Map key as a Record field.
- `r["foo"] = expr` evaluates the receiver once and the RHS once, in left-to-right order. The compile-time field lookup uses the shape's established slot/layout; the guest write is checked against that exact slot, preserves the original shape and other fields, and never invokes Map hashing. If evaluating `expr` fails, the previous field value is preserved. Replacing an owned value requires validated move/borrow/drop ownership before commit, with safe cleanup on failure.
- A nominal **`Struct` is deliberately NOT bracket-indexable**: `s["foo"]` and `s["foo"] = v` are invalid (`E_UNSUPPORTED` or the target's dedicated index diagnostic), even for an existing declared `foo`. `s.foo` and admissible `s.foo = v` remain the nominal field API. External JSON aliases do not become extra member names.
- The compiler must preserve the `Index`/indexed-lvalue AST until type resolution distinguishes `Map`, `Record`, `Struct` and unsupported classes; no lexically guessed `index -> member` rewrite. Index writes are nonescaping assignments and require the same actor/borrow checks as dot field writes.
- This extension does **not** assert that static Record guest writes, generic nested mutable Records or arbitrary Struct guest code are already implemented. Existing limited closed-Record **reads** are not sufficient evidence.

Required cases: positive statically known identifier Record field updates and brace/parenthesized shape equivalence; negative immutable writes, missing fields, mismatched types, computed indices, open shapes, lexical shadowing, moved/borrowed aliases, attempted Struct bracket access, and Map/Record delimiter mixing. Guest execution, no-artifact negative checks and formatter equivalence require exact source-SHA evidence for each backend.

### Serialization and layout boundaries

- Record JSON property names are declared identifier fields. String-Map JSON keys preserve exact decoded UTF-8 keys, including spaces, punctuation, empty strings and Unicode. Non-string Map keys need an explicit codec/entry-array representation; no lossy implicit stringification.
- Struct JSON external names follow declared serialization metadata; internal field names, static typing and AOT offsets remain unchanged. A duplicate **serialized** name (including collisions between aliases and unaliased fields) is a compile-time error when metadata is static.
- JSON object property order must not affect semantic equality. A deterministic/canonical serializer may sort names, but must not change the **source-order evaluation** of initializers. Duplicate JSON input properties need an explicit decoder policy and must never bypass schema validation or ownership rules.
- Closed records may share an interned structural layout; `Record` open values require runtime shape/presence metadata if dynamically accessed; structs retain nominal layouts; maps retain keyed lookup semantics. These are distinct IR/runtime representations even when the surface braces look similar.

### Additional conformance cases

1. `{"content-type": 1, status_code: 2}` mixes a Map key with a Record field and rejects `E_LITERAL_KIND`; `{"": 1}` is a Map with an empty-string key, not an empty-name Record field.
2. `{a: 1, "a": 2}` rejects `E_LITERAL_KIND`, while `{a: 1, a: 2}` rejects duplicate Record fields. Record shape identities ignore declaration order; initializer evaluation does not.
3. Closed missing fields reject `E_NO_FIELD`; open Record reads reject `E_FIELD_PRESENCE` absent a verified narrowing guard.
4. `response["status_code"]` addresses a known identifier Record field; `headers.get("content-type")` is a Map lookup. Neither may manufacture the other's representation.
5. Dynamically equal Map keys replace earlier values with ownership-safe cleanup; static duplicates reject. Non-string hashable keys need independent backend proof.
6. Round-trip identifier Record fields and arbitrary string Map keys through JSON with checked serialization; reject non-string Map keys without a codec and conflicting Struct aliases.

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

> **Symbol-keyed Entry clarification:** [Symbol-keyed Entries v1](symbol-keyed-entries-v1.md) specifies `#foo => 5` as a candidate `Entry<Symbol,int>` and `{#foo => 5}` as `Map<Symbol,int>`; `bar :: 5` is not a RecordEntry operator. Guest parity is not certified.

> **Further Entry/Record syntax:** [Map key expressions and Record construction](computed-map-keys-and-record-construction-v1.md) keeps `foo => 5` as an evaluated key and `[foo] => 5` as a collection-valued key subject to stable Hash/Eq. Record fields are identifier-only.

> **Expression-key clarification:** [Entry expression keys and Record syntax](entry-expression-and-record-literals-v1.md) specifies contextual List/Array-valued Entry keys, independent Map key admission, and no bracket-based computed-key marker.

## Nominal Entry literal and mutable Map operations (candidate extension, 2026-11-19)

The binary `=>` token has two **context-dependent** uses:

1. In an expression (outside a brace-map entry), `key_expression => value_expression` constructs one **nominal, immutable** `Entry<K,V>`. It is sugar for `Entry.of(key_expression, value_expression)`, retaining the same type, lifetime, ownership, and actor-boundary validation; it is **not** a two-element Tuple, anonymous Record, or user-overloadable operator.
2. Inside a `{ key_expression => value_expression }` Map literal, the arrow separates a Map **initializer item**. The brace expression remains a `Map<K,V>`, not a `List<Entry<K,V>>`. The parser stops the key expression before the top-level map-entry arrow. Parenthesized Entry expressions are allowed as values or keys only when their static types permit them.

```ebnf
entry_expression = value_expression_without_unparenthesized_fat_arrow, "=>",
                   value_expression_without_unparenthesized_fat_arrow ;
entry_type       = "Entry", "<", type, ",", type, ">" ;
```

The arrow is lower precedence than arithmetic, comparison, and ordinary calls. It is non-associative (`a => b => c` is rejected unless explicitly grouped). Lambda-head `=>` uses its established lambda grammar, never silently constructs an Entry. Both operands are evaluated **left to right, exactly once**. Contextual `Entry<K,V>` typing must reject incompatible or ambiguous types; otherwise K and V are inferred from the operands. The canonical type spelling is `Entry`; no structural impostor is assignable, and `new Entry<K,V>(...)` remains prohibited. Entry value projections are read-only.

```atto
let Entry<string, int> entry = "foo" => 5;

pub fnc main(): int {
    let mut Map<string, int> x = {
        "foo" => 5
    };

    x.set("foo", 6);
    x["foo"] = 3;
    x.add(entry);
    return x.get("foo").unwrap(); // 5
}
```

For this example, **module-scope `let`** is a per-module, per-tenant/isolated-runtime binding, not a mutable process-wide singleton. Evaluation/initialization must occur once per isolation domain, before a permitted module consumer reads it; actor state and other tenant modules must not alias its writable storage. This extends the local-binding rule without overriding `define const` semantics. Any backend without proven module initialization and isolation must reject the global binding explicitly rather than silently reinterpreting `let` as `const`.

**Portable Map API target (v1):**

| Operation | Contract |
|---|---|
| `map.set(K key, V value)` | Insert or replace; requires exclusive mutable Map authority |
| `map[key] = value` | Same checked insert-or-replace operation as `set`; key is evaluated once before value |
| `map.add(Entry<K,V> entry)` | Insert or replace using Entry's immutable key/value, identical collision/replacement semantics to `set` |
| `map.try_add(Entry<K,V> entry): bool` | Insert only; returns `false` without replacing when key exists |
| `map.get(K key): Option<V>` | Explicit absence; `unwrap()` returns the present V or follows the canonical `Option.unwrap()` failure contract |
| `map.has(K key): bool` | Presence test using the same key equality/hash rules |

`set`, `add`, and indexed assignment are **upserts**; the example returns `5` (initial 5, then 6, then 3, then the entry's 5). `try_add` is distinct and cannot silently overwrite. This is a proposed API contract, not a claim of existing `set`/`add` guest implementation. These operations must use the *same* typed key codec, hash/equality, replacement cleanup, quota checks, and transactional admission; a failed allocation/type/ownership/capability check leaves the map unchanged. Do not expose host Java/JS Map objects to bypass these checks. Required mutation is valid only for `let mut` / `val mut` (or an authorized exclusive mutable borrow), never an immutable-view `let Map`, ordinary `val`, shared frozen Map, or sealed actor state outside `critical-write`.

Entry argument ownership follows existing default borrowing: a Copy-safe scalar Entry may be read and snapshotted by `add(entry)`, preserving `entry`; move-only/non-Copy payloads require explicit, statically checked ownership transfer (for example `take! entry`) and must not silently escape a loan. An immutable Entry does not make its recursively contained mutable resources safe for sharing between actors or tenants.

**Required positive conformance:** standalone `Entry<string,int>` literal and `Entry.of` semantic equivalence; expression precedence/grouping; mutable typed Map literal; chained `set`, bracket assignment and `add(entry)` yielding 5; `get` returning `Some(5)`; `try_add` duplicate false; distinct `Entry` vs Record/Tuple; per-tenant isolated module initializer. Check compiler-generated guest execution and both successful and failing branches at exact backend SHAs.

**Required negative conformance:** bare `a => b => c`; invalid `Entry<int>` generic arity; mismatched `Entry<string,int> = 1 => "x"`; assignment to `entry.key` or `entry.value`; insert wrong K or V; mutation through non-`mut` Map view; unhashable/unstable key; use-after-`take!`; borrowed mutable values escaping in an Entry; quotas/collision rollback; unguarded cross-tenant mutable alias; missing-key `unwrap()` failure; literal duplicate constant map keys. A parser accepting the token is **not** evidence of executable guest Map mutation.

**Migration and interoperability:** the legacy Java Entry model recognized only `Entry.of(key,value)` and older Map APIs used `put`/required-read indexing. This addition makes a deliberate new-source sugar and upsert API choice. Implementations should retain explicitly supported legacy aliases without confusing required-read indexing `map[key]` with write-place `map[key] = value`; they require different checking and diagnostics. The formatter preserves `=>` and Map brace context and proves parse-equivalent, idempotent round trips. Track this staged contract alongside atto-source.rs#274 and atto-platform-conformance; do not claim backend parity before executable tests.

### Whole-Entry type ascription (two equivalent spellings)

The following are **equivalent** nominal `Entry<string,int>` declarations:

```atto
let entry1 = ("foo" => 5) as Entry<string, int>;
let entry2 = "foo" => 5 (as Entry<string, int>);
```

Both annotate the **entire** `Entry` value, never only the right-hand operand, and normalize to a single checked `EntryExpr(key, value, expected_type=Entry<K,V>)` typed expression. The second spelling is a narrowly reserved trailing `(as Entry<K,V>)` suffix, *only for a completed Entry expression*. This does not enable general `x as T` unchecked casts, redefine `as val` conditional captures, or override the separate type-conversion proposal. The first spelling requires the ordinary Entry expression to be grouped; an arbitrary Record, Struct, Map, Tuple or scalar cannot be reinterpreted into `Entry` by a cast.

```ebnf
whole_entry_ascription =
    "(", entry_expression, ")", "as", "Entry", "<", type, ",", type, ">"
  | entry_expression, "(", "as", "Entry", "<", type, ",", type, ">", ")" ;
```

Both spellings must statically verify exact `K` and `V` compatibility and generic arity, and preserve source-order, exactly-once evaluation and checked ownership. They produce the same semantic typed IR; only diagnostic source spans can differ. The formatter's canonical output is `(key => value) as Entry<K,V>`, and both spellings must round-trip without changing behavior.

For a file-scope `let entry = ...;`, v1 admission is limited to **pure, immutable, runtime-independent, statically evaluable Entry expressions with recursively frozen/COPY-safe components**, instantiated privately per module/tenant. General mutable global `let` initialization or effectful module evaluation is **not** approved by this Entry syntax. The compiler must reject impure or non-isolated initializers until a separately verified module lifecycle is available.

```atto
let entry1 = ("foo" => 5) as Entry<string, int>;
let entry2 = "foo" => 5 (as Entry<string, int>);

pub fnc main(): int {
    let mut Map<string, int> x = {"foo" => 5};
    x.set("foo", 6);
    x["foo"] = 3;
    x.add(entry1);
    x.add(entry2);
    return x.get("foo").unwrap(); // 5: both adds are upserts
}
```

`set`, indexed Map assignment, and `add(Entry)` all replace an existing key by this contract. `try_add(Entry)` is the insert-only operation and returns `false` for a duplicate; the dedicated Map mutation proposal must agree. Distinct module-scope Entries do not alias mutable Map storage or import host objects.

Required negative cases include malformed `(as Entry<K,V>)`, `Entry<T>` wrong arity, mismatched key/value types, a scalar/Record ascribed as Entry, `Entry` ascribed as Map, ambiguous arrow nesting, a suffix that captures only the RHS, `as val` erroneously treated as a cast, and impure module-scope initializers. Static compiler checks and formatter golden cases are **not** a claim of backend guest support.
