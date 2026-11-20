# Quoted Map keys versus identifier Record fields — normative v1 correction

**Authority:** This correction supersedes conflicting quoted-Record portions of `language/inline-collection-literals-v1.md`, including its historical quoted-field examples, while the latter document still governs unaffected Array/List/Tuple/Record semantics. The compiler and formatter MUST apply these rules based on syntax, not inferred expected type.

## Syntax and static meaning

| Source | Kind | Notes |
| --- | --- | --- |
| `{foo: 5}` | Record | Identifier field `foo` |
| `(foo=5)` | Record | Parenthesized identifier field |
| `{"foo": 5}` | Map<string,int> | Quoted key, even though `foo` is a valid identifier |
| `{'foo': 5}` | Map<string,int> | Equivalent decoded key |
| ``{`foo`: 5}`` | Map<string,int> | Non-interpolating backtick key |
| `{"foo" => 5}` | Map<string,int> | General Map-entry spelling |
| `{'foo' => 5}` | Map<string,int> | Equivalent key and value |
| ``{`foo` => 5}`` | Map<string,int> | Equivalent key and value |
| `{'"foo"': 5}` | Map<string,int> | The decoded key contains two double-quote characters |
| ``{`"foo"` => 5}`` | Map<string,int> | The decoded key contains two double-quote characters |
| `{foo => 5}` | Map | `foo` is an expression; requires checked Hash/Eq |
| `{foo: 5, "bar": 6}` | INVALID | E_LITERAL_KIND: cannot mix Record field and Map entry |
| `{"foo":5,'foo' => 6}` | INVALID | E_DUPLICATE: duplicate constant Map key after decoding |
| `{}` | Contextual | Record or Map<K,V>, never guessed |
| `()` | Tuple | Arity zero, never Record/Map |

### Grammar (disambiguated by the token kind)

```ebnf
brace = "{" [ entry, { ("," | NEWLINE), entry }, [","] ] "}" ;
entry = record_field | map_key_colon | map_key_arrow ;
record_field = IDENT, ":", expression ;
map_key_colon = STRING, ":", expression ;
map_key_arrow = expression, "=>", expression ;
paren_record = "(", IDENT, "=", expression, { ",", IDENT, "=", expression }, [","], ")" ;
```

Only the lexer-proved identifier-colon form is a Record field. Quoted colon and `=>` entries are both Maps and MAY coexist within one Map literal. A mixed Record/Map brace literal fails E_LITERAL_KIND before any allocation, even if its field values or inferred key/value types happen to match. The formatter MUST NOT reclassify based on context; its preferred canonical Map entry is `=>` and it must retain decoded key content and evaluation order.

## Quoting and escapes

- Double and single quotes use the current string-literal escape contract, including `\n`, `\r`, `\t`, escaped quotes and `\u{HEX}`. Both produce the same `Str` value for the same decoded characters.
- Backticks delimit a non-interpolating literal string: `${expr}` remains literal text, not a code expression; ordinary backslashes are retained. Only backslash followed by backtick escapes the delimiter; the decoded value contains a literal backtick.
- To include double quotes literally in a Map key, write `{'"foo"':5}` or ``{`"foo"`:5}``; to include a single quote use `{"it's ok":5}`; to embed a backtick use an escaped backtick inside the backtick literal.
- The first Rust/browser profile disallows raw newlines in backtick strings, rejects unterminated/backtick literals with E_STRING, and applies the existing 4,096-byte decoded UTF-8 string limit (E_SOURCE_LIMIT). It never performs interpolation, template evaluation or ambient host reflection.
- Exact decoded string identity determines duplicate constant Map key detection across all three quote styles, including escaped Unicode. The compiler must not NFC/NFD normalize, case-fold, discard interior quote marks or merge distinct keys. `{"foo":1,'foo'=>2}` is E_DUPLICATE.

## Type, ownership and guest admission

Map<K,V> is homogeneous; inference applies common key/value typing and Hash/Eq checks, with incompatible key/value or unhashable key rejected before emission. `Record` is structural, potentially heterogeneous, with statically known identifier-named fields. `r.foo`, `r["foo"]`, `r['foo']` and ``r[`foo`]`` refer to the SAME existing Record field only when the compiler admits static-literal Record indexing. `map.get("foo")` is a dynamic Map lookup; a Map string key is not a fixed Record slot. No implicit Record↔Map conversion, named-parameter expansion, or synthetic AOT static layout is allowed.

All key and value expressions execute once in source order. Duplicate constant keys reject before guest execution; runtime equality collision/upsert and ownership-safe release are separate Map runtime obligations. A parser/typed-IR PASS is **not** compiled guest Map execution: targets without authenticated runtime Map allocation/lookup MUST fail with E_UNSUPPORTED and emit zero guest artifacts.

## Required conformance examples

```atto
let headers = {
  "content-type": "application/json",
  'x-user-id': "42",
  `"foo"`: "quoted",
}; // inferred Map<string,string>, parser/type support only until guest Map runtime exists

let row = {name: "Ada", age: 25}; // Record
let row2 = (name="Ada", age=25); // same Record type
```

Positive lexer/parser/type examples: all 3 delimiters paired with `:` and `=>`, embedded quotes, distinct Unicode spellings, interpolated-looking text kept literal, cross-spelling Map key type identity, source-order typed child sequence. Negative examples: Record/Map mixed forms in both orders, cross-quote duplicate keys, malformed escapes/unterminated strings, oversize backtick keys, Map-as-Record annotation and Record-as-Map annotation, computed key without `=>`, and all unimplemented guest Map operations producing no artifacts.

**Security boundary:** A quote spelling never grants static field access, actor-state authority, a mutable reference, dynamic I/O permission or cross-TenantVM access. All independent `atto-source.*` compilers and both formatters must pass separate exact-head conformance and parse–format–parse tests before parity is claimed.
