# Expression keys, sequence keys and Record syntax — normative candidate

**Authority:** This addendum refines `symbol-keyed-entries-v1.md`, `quoted-map-vs-record-literals-v1.md`, and `inline-collection-literals-v1.md`. It resolves the potential `[foo] => 5` computed-key ambiguity without changing the existing `[...]` Array/List expression grammar. It is a language design contract, **not** an assertion of current compiler or guest runtime support.

## Entry keys are ordinary expressions

```atto
const string foo = "bar";

let string_entry = foo => 5;           // Entry<string, int>; foo is evaluated
let grouped_entry = (foo) => 5;        // same entry type and decoded key
let literal_entry = "foo" => 5;       // Entry<string, int>
let symbol_entry = #foo => 5;         // Entry<Symbol, int>; distinct from "foo"
let list_entry = ["foo"] => 5;        // Entry<List<string>, int> if nonempty [] infers List
let bool_list_entry = [true] => 5;     // Entry<List<bool>, int> under the same default
let Entry<Array<string>,int> array_entry = ["foo"] => 5; // Array context, not List
```

The left operand of `=>` **always supplies the expression's value and type**. `foo` means the value of the bound variable named `foo`; `#foo` is a Symbol literal; `"foo"` is a string literal; `[foo]` is a one-element List/Array containing the current value of `foo`; `(foo)` is a grouped variable read. `[...]` is NEVER a special computed-key marker. No key expression is implicitly stringified or converted to a Symbol.

**Standalone `Entry<K,V>` construction is distinct from Map admission.** An Entry is a typed, nominal, immutable *pair wrapper*. The `Entry` itself may hold a List/Array key, but its mere construction does not prove that key has stable Hash/Eq. Inserting into a `Map<K,V>` requires K to satisfy the Map's stable, secure equality and hashing contract for the entire storage lifetime. Mutable/growable Lists/Arrays, or Lists with transitively mutable elements, are NOT automatically valid Map keys; an explicitly frozen/snapshotted immutable hashable key type may be admitted only after its lifecycle and hash semantics have been standardized and verified. There is no implicit pointer-identity hashing or identity-by-address fallback.

### List of Entries is different from Entry whose key is a List

```atto
let one = ["foo"] => 5; // Entry<List<string>,int>
let many = ["foo" => 5, "bar" => 6]; // List<Entry<string,int>> when Arrow is implemented
```

`many` contains two Entry elements. `one` contains one List-valued key and one integer value. The formatter and type checker MUST retain these different AST types. `let entries = [foo] => 5` MUST NOT be reinterpreted as a List of Entries, nor as `foo => 5`.

## Inside Map and Record braces

```atto
const string foo = "bar";
let from_variable = {foo => 5};       // Map<string,int>, key evaluates to "bar"
let from_string = {"foo": 5};         // Map<string,int>, key is "foo"
let from_symbol = {#foo => 5};        // Map<Symbol,int> when Symbol runtime supported
let from_list = {["foo"] => 5};      // Map with List key: MUST check Hash/Eq, likely reject

let record = {foo: 5};                // Record with static field named foo
let same_record = (foo=5);            // equivalent one-field Record
let record2 = (foo=5, bar=true);      // two-field Record, heterogeneous
```

`{foo: 5}` names the **static Record field** `foo`, independent of the variable `foo` in the surrounding scope. `{foo => 5}` evaluates `foo` as a **Map key expression**. `{"foo": 5}` or `{'foo': 5}` or a backtick-quoted key is a Map regardless of whether the decoded string is a legal identifier. A brace literal must not mix Record and Map entry kinds. A computed Record field name (for example `{[foo]: 5}`) is not part of the current static Record grammar; use a Map for dynamic keys.

## Record syntax, grouping and tuple boundaries

| Expression | Meaning |
| --- | --- |
| `(foo)` | Grouped expression, **not** a one-field Record or Tuple |
| `(foo,)` | One-element Tuple containing the value of variable `foo` |
| `()` | Empty Tuple |
| `(bar=5)` | One-field Record with compile-time field name `bar` |
| `(foo=1, bar=true)` | Two-field Record |
| `{bar:5}` | One-field Record; same structural type as `(bar=5)` |
| `{bar => 5}` | Map whose key is the runtime value of `bar` |
| `[bar]` | One-element List/Array, depending on expected type |
| `{}` | Context-dependent empty Record or typed Map; never guessed |

Record field identifiers are fixed by the syntax and checked against the canonical identifier grammar; duplicate fields reject before guest execution. Field expression evaluation remains left-to-right even when the compiler canonicalizes the structural shape by field name. A Record can itself be a normal value passed to functions and, after checked callable binding is implemented, explicitly expanded with `...record`. This is the supported alternative to creating a first-class `RecordEntry` for each field.

**No standalone `bar :: 5` in v1.** `::` has callable-header compatibility syntax and no approved binary Record-entry meaning. A future first-class field descriptor would need a new separately standardized type, e.g. `Field<Name,T>`, with compile-time name identity and ownership checks; it must not silently be a Map Entry or a reflection escape.

## Evaluation, ownership and diagnostic gates

- Standalone `=>` has lower precedence than arithmetic and ordinary indexing; it does not associate (`a => b => c` rejects unless grouping explicitly constructs a nested Entry). Inside braces, the top-level `=>` separates a Map entry; inside brackets, a completed `=>` expression can be one List item. The compiler must not greedily absorb a Map delimiter into a standalone Entry.
- Keys evaluate exactly once before their corresponding values, in source order; neither grouping nor canonical Record shape order may reorder expressions. `foo` reads a binding; it is never the string literal `"foo"`, the Symbol `#foo`, or a Record field name except in the `foo:` syntax.
- A standalone `Entry<List<T>,V>` may exist without a Map, but Map insertion of an unsafe collection key fails with a precise type/hash diagnostic and emits no artifact. A `const` binding or read-only borrowing alone is not proof of recursive immutability if mutable aliases remain.
- Key equality must not leak host pointer addresses or depend on mutable contents; native backends must keep keys within the actor/TenantVM memory and capability policy. For Symbols, hashing and equality are domain-scoped; cross-TenantVM spelling alone never authorizes identity sharing.
- Current Rust/browser compiler does not yet implement standalone Entry expression parsing or `#foo` symbols in its verified guest path. Unsupported syntax/runtime MUST fail closed with stable diagnostics and no output artifacts. This specification sets expected semantics only; do not count host lexer/preflight tests as real guest execution.

## Required conformance cases

Positive once implemented: `foo => 5` with `foo:string` infers `Entry<string,int>`; `(foo) => 5` identical; `#foo => 5` infers `Entry<Symbol,int>`; `["foo"] => 5` infers `Entry<List<string>,int>` without Map insertion; `[true] => 5` infers `Entry<List<bool>,int>`; contextual `Array<string>` changes the key collection type, not the arrow semantics; `["foo" => 5, "bar" => 6]` infers a List of Entries. `({foo:1})` and `(foo=1)` remain Records, not collection entries.

Negative cases: `bar :: 5` standalone, duplicate Record field names, `{"foo":1,bar:2}` mixed Map/Record, computed Record `{[foo]:5}`, unsafe mutable List/Array Map key insertion, wrong `Entry<K,V>` generic ascription, Map value type mismatches, unhashable nested key contents, moved/borrowed alias escape, source-order side effects duplicated or reordered, and any unproven Symbol/key identity crossing a TenantVM boundary. Track results per compiler with an exact source SHA and distinguish `PARSED`, `TYPE_CHECKED`, `COMPILED_GUEST_EXECUTED`, and `REJECTED_NO_ARTIFACT`.
