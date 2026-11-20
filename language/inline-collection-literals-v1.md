# Inline records, maps, sequences and tuples — v1 candidate

**Status:** candidate language contract. This document defines intended portable semantics; no backend is considered conformant without successful guest execution and negative cases at an exact commit. It does not reinstate removed \`~map(...)\`, \`~array(...)\`, \`~record(...)\`, or other tilde-prefixed constructors.

> **Normative correction (2026-11-20):** [Quoted Map keys versus identifier Record fields](quoted-map-vs-record-literals-v1.md) **supersedes all conflicting quoted-Record grammar, examples, bracket-write descriptions and conformance clauses below**. Quoted string keys (double, single, or backtick) with `:` or `=>` now construct **Maps**; only identifier `:` or `(name=value)` constructs Records. Old examples treating `{"content-type":1}` as a Record are obsolete and must NOT be used as conformance evidence. Migration and formatter coverage are required.

## Spelling and grammar

The core generic type constructor names \`Record\`, \`Map\`, \`List\`, \`Array\` and \`Tuple\` also accept the exact lowercase aliases \`record\`, \`map\`, \`list\`, \`array\` and \`tuple\`. These spellings have the **same** type identity and generic arity; this rule is contextual to type positions and does not lower-case arbitrary identifiers, modules, namespaces or user types. Formatter canonical output is upper-cased built-in type names, never renamed user identifiers.

\`\`\`ebnf
inline_expression = record_or_map | list_or_array | tuple_or_group | named_record ;
record_or_map    = "{" [ (record_field | map_field), { separator, (record_field | map_field) }, [","] ] "}" ;
record_field     = IDENT, ":", expression ;
map_field        = STRING, ":", expression | expression, "=>", expression ;
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

## Contextual typing and identity

- A \`{ field: value }\` literal is a **record**, using field names (identifiers or quoted string keys) as named fields. A \`{ key => value }\` literal is a **map**. A single brace literal may not mix \`:\` and \`=>\`. A duplicate static record field is a compile-time error.
- A map's keys must satisfy the language's equality/hash contract. Duplicate compile-time constant map keys are rejected; **a later dynamically computed equal key replaces the earlier value** (last value wins). Evaluation of each key/value expression is source-ordered and exactly once. Replacement must correctly release the displaced value and cannot bypass borrow/ownership checks.
- An empty \`{}\` must have an unambiguous expected \`Record\` or \`Map<K,V>\` type (or a future explicit typed factory). An untyped \`{}\` is rejected as ambiguous.
- \`[]\` becomes a \`List<T>\` or \`Array<T>\` only in an expected-type position. Without a target type, a nonempty \`[...]\` may be inferred as a List when all elements have a valid common type; an empty untyped \`[]\` must not silently choose a mutable/aliased runtime collection.
- \`List<T>\` is a growable logical collection. \`Array<T>\` has a fixed element count and contiguous array semantics when supported by a target. No implicit conversion between them is permitted, despite sharing brackets. Every \`Array<T>\` item must be assignable to \`T\`.
- Bare \`Record\` is an open record supertype of record values with different field sets. Thus \`Array<Record>\` can contain \`{job:1}\`, \`{car:"str"}\`, and \`{x:true}\` without inventing fields or assuming that all elements have the same layout. Access to an absent field is rejected or must first be guarded by presence/type checking. A specialized closed record type remains eligible for AOT layout optimization.
- A bare \`List\` or \`Map\` annotation with an initializer may infer its type arguments from its elements; empty bare declarations require a future explicitly specified default or contextual type and cannot silently invent \`Any\` storage. **Exception for this v1 compatibility syntax:** \`let List x = []\` is valid as a zero-element list with an as-yet-unconstrained element type; later writes must resolve the element type or fail at compile time. No runtime-dependent widening.
- Tuple values preserve order, length and per-position types. \`()\` is an arity-zero tuple (a unit-like value), distinct in type from \`void\`. A tuple may not be silently flattened by a comma operator or used as an automatic multi-return.

## Parenthesized named Records, arity-zero Tuples, and named-argument boundaries (v1)

**Normative candidate decision:** `(foo=1, bar=true)` constructs a **Record**, with the same structural type, checked field inventory, field access, canonical shape and source-order evaluation as `{foo:1, bar:true}`. The compiler may preserve a distinct syntax-origin span for diagnostics/formatting, but the typed expression is the ordinary `Record`; it is never a Tuple, Map, function-call argument list or anonymous nominal Struct. No new runtime Record/Map representation may be invented for parentheses.

- A parenthesized Record starts only when the first token inside `(` is a legal, non-reserved identifier immediately followed by the assignment token `=` (whitespace permitted). The separator between entries is a comma. Only identifier field labels are accepted in this parenthesized spelling. A quoted/nonidentifier Record field must use the brace form `{"content-type": "json"}`; its name is not a callable parameter name.
- `(foo=1)` and `(foo=1,)` are one-field Records; `(foo=1, bar=2,)` is a two-field Record. Field order is not part of structural type identity; value initializers are evaluated once in the original source order. Duplicate fields, including Unicode-identical decoded names, reject `E_DUPLICATE`.
- `(foo=1, 2)`, `(foo=1, bar:2)` and `(foo=1, "bar"=2)` reject `E_LITERAL_KIND`; there is no mixture of positional Tuple items and named fields. An assignment expression `(x = 1)` is never silently created by this rule. `(foo==1)` still groups a comparison expression when valid.
- `()` is **always** `Tuple` of arity zero, with unit-like value but distinct from `void`. It is **never** an empty Record or function argument list in expression position, even with an expected Record type. `(x)` is grouping; `(x,)` is a one-element Tuple; `(x,y)` is a two-element Tuple. Empty tuple construction uses `()` with optional expected `Tuple` type; do **not** invent an unsupported `Tuple<>` generic spelling. The syntax of a zero-argument **call** `f()` is independently determined by call context.
- Bare `{}` has no default interpretation and requires a known expected `Record` or concrete `Map<K,V>` type; bare `[]` requires contextual typing when empty to distinguish `Array<T>` from `List<T>`. Neither `()` nor `{}` may be guessed from a globally searched nominal Struct of identical shape. An anonymous zero-field Struct uses explicit `infer struct {}` and a nominal Struct initializer uses `T{...}` or contextually typed `infer struct {...}`, subject to the separate checked Struct contract.
- A Struct field must use its declared identifier name; serializable aliases do not become bracket index or named-argument identifiers. The form `let struct<T> v = {...};` is **not** a new type declaration/constructor rule; use `let v: T = infer struct {...};` or `let v = T{...};` once that target has guest support.
- Generic type-close immediately followed by a binding assignment is unambiguous **in type context**: `let m: Map<string,int>={};` means `Map<string,int>` followed by `=`, despite the adjacent source characters `>=`. The lexer/parser must preserve a separate initializer assignment and precise source positions; ordinary expression `x>=y` retains its greater-or-equal operator. Nested generics like `Map<string,List<int>>={}` obey the same contextual rule. This is not an implicit cast or a general reassociation of comparison operators.

**Callable argument distinction:** `f(foo=1)` is a proposed *named argument* in **call context**; `f((foo=1))` passes one **Record value** positionally; `f(r)` never auto-expands a Record. `f(...r)` explicitly expands a statically known Record's identifier-named fields to named arguments, subject to the callable's resolved parameter signature. The call site must reject unknown, duplicated, inaccessible or type-incompatible arguments; defaulted parameters may be omitted. Positional arguments may precede named arguments, but positional arguments after named ones reject. Nested expansion, an open Record without proven fields, and quoted nonidentifier keys have no ambient reflection fallback. No duplicate can arise from `f(foo=1, ...r)`, even if its values are equal. Evaluate arguments/fields left-to-right exactly once; reject unsafe ownership transfer, mutable borrowed graph escapes, actor state access and any tenant boundary bypass. `...` is not implicit general spread or host `Map` iteration.

```atto
let tuple_value = ("5", 3, true);      // Tuple<string,int,bool>
let named = (foo="star", abc=5);       // Record with identifier fields
let braced = {foo:"star", abc:5};      // structurally same Record
let empty_tuple = ();                 // Tuple of zero elements
let empty_record: Record = {};        // Record; context required for {}
let empty_map: Map<string,int> = {};  // Map; context required for {}

describe(name="Atto", count=5);       // named call args, proposed distinct feature
describe((name="Atto", count=5));     // one Record positional arg
describe(...named);                   // explicit checked Record expansion, proposed
```

**Admission stages:** The Rust/Wasm narrow compiler may first lower parenthesized, fully scalar closed Records through the *existing* compiler-authenticated fixed-field Record ABI. That is real guest support only after execution at an exact compiler SHA. Named calls, Record spread, dynamic Map, nominal Struct and general Tuple allocation/indexing remain independent, fail-closed stages; a grammar or static typing pass cannot certify their runtime execution. Canonical formatter output for parenthesized named Records is `(foo=1, bar=2)` (do not rewrite user syntax to a call). Both accepted Record surface forms must have parse-equivalent typed shapes, and formatting must be idempotent.

## Map, Record and Struct: keys, fields, and layout

| Type | Key language | Type discipline | Runtime model |
| --- | --- | --- | --- |
| `Map<K,V>` | Checked expression key of type `K`; quoted strings may use all three delimiters | Homogeneous keys and values with Hash/Eq | Dynamic keyed storage |
| `Record` | Identifier-only fields, `{foo:1}` or `(foo=1)` | Heterogeneous structural fields | Static known shape and authenticated slots |
| `Struct` | Declared identifier-only fields | Nominal fields | Statically declared layout |

**Quotation determines Map status.** `{"foo":5}`, `{'foo':5}`, `{`foo`:5}`, and `{"foo"=>5}` are Maps, never Records. `{foo:5}` is a Record. Quoted keys may include punctuation, spaces, embedded quotes, Unicode or the empty string. Map `:` and `=>` entries may coexist; an identifier-colon Record entry cannot be mixed with Map entries (`E_LITERAL_KIND`). Distinct quote styles yielding the same decoded string key are duplicates (`E_DUPLICATE`), with no case folding or Unicode normalization.

Single and double quoted strings share existing escape decoding. Backticks are **literal and non-interpolating**: `${...}` is text, not code; ordinary backslashes are retained and only backslash-backtick escapes the delimiter. This first compiler profile disallows raw newlines inside backticks, enforces 4,096 decoded UTF-8 bytes, and rejects unterminated literals. See the [authoritative quoted Map-key correction](quoted-map-vs-record-literals-v1.md).

```atto
let Map<string,int> counts = {"retry-count": 3, 'active' => 1};
let Map<string,string> headers = {
    "content-type": "application/json",
    'x-user-id': "42",
    `"foo"`: "includes interior quotes in key"
};
let Record response = {status_code: 200, ok: true};
let Record response2 = (ok=true, status_code=200);
// headers.get("content-type") is a dynamic Map lookup, not a Record slot.
// response.status_code and response["status_code"] refer to the same Record slot.
```

### Access, ownership and runtime admission

- Record fields are statically known identifiers; a closed Record has a compiler-authenticated canonical field layout independent of declaration order. Source initializers still execute exactly once in lexical order. A known `foo` slot may be accessed by `r.foo`, `r["foo"]`, `r['foo']` or `r[`foo`]` when static string-literal projection is implemented.
- Record static indexed **writes** update an existing field only with verified referent mutability, type/borrow ownership, lexical receiver provenance, safe failure/cleanup and no fabricated Map operation. `let` permits rebinding but not an unqualified field write. A missing field is E_NO_FIELD; an open Record requires a proof of shape/presence. Computed keys and nominal Struct bracket access are not implicitly static Record fields.
- Map lookups use the Map Hash/Eq contract and explicit missing-key handling (e.g., `get` returning `Option`). Duplicate compile-time constants reject; dynamic equal-key replacement must have ownership-safe cleanup. Map allocation/lookup, transport and mutation require independent guest runtime proof and are NOT provided by parser/typed-IR admission.
- No implicit Map↔Record conversion, no static Record field offset for a Map key, no ambient named-call expansion, and no cross-TenantVM capability/actor-state privilege from a quoted literal.

### Serialization and conformance

- JSON serialization of Records uses declared identifier fields. String Map keys retain exact decoded strings including punctuation, interior quotes, backticks, empty names and Unicode. Non-string Map keys require an explicit codec; no silent lossy JSON property conversion.
- A nominal Struct may have external serialization aliases but they do not become source-visible members. Duplicate serialized names require a defined validation failure.
- Test all six quoted Map forms (`:` and `=>` with double/single/backticks), mixed quoted separators, cross-delimiter key collisions, escaped Unicode, literal interior quote marks, bounded backtick strings, noninterpolated `${...}`, Record/Map mixing in both orders, mutable Record slot checks, and unsupported Map guest operations with zero output artifacts.
- Each backend and formatter must establish independent exact-source guest/conformance and parse–format–parse results. A host parser test cannot be promoted as runtime implementation.

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
