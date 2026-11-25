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


## Parentheses and Record constructor interoperability (v2 proposed)

Status: TARGET / NOT_EXECUTED. This section proposes a narrowly scoped extension to v1; ordinary Entry expressions and named calls retain their existing semantics. Do not silently enable this in older profiles.

In expression-primary position, classify at the current delimiter depth using tokens, not whitespace, regex, or expected type: `()` is an empty Tuple, `(expr)` is grouping, `(expr,)` and `(expr, expr, ...)` are Tuples, and `(identifier=expr, ...)` is a Record. Each record item must have an identifier and a single assignment token; `==`, nested delimiters, strings and comments do not trigger this classification. One trailing comma is legal; leading/double commas, unbalanced delimiters and mixed positional/field items reject. Parentheses preserve nested shape, type, ownership, effects and source-order evaluation; they neither flatten tuples nor introduce assignment, argument expansion or extra evaluation. `(5,6.true)` is not the spelling of a three-item tuple; use `(5,6,true)`. Ordinary valid member access remains unchanged.

The authenticated compiler-owned `Record.of` constructor admits four equivalent static field sources:

```atto
let Record r1 = (a=5, b=6);
let Record r2 = Record.of(a=5, b=6);
let Record r3 = Record.of(a => 5, b => 6);
let Record r4 = Record.of(Entry.of("a", 5), Entry.of("b", 6));
let Record r5 = Record.of(Pair.of("a", 5), Pair.of("b", 6));
let Tuple t = (5, 6, true);
```

The direct bare-label arrow in this specific intrinsic is a static field descriptor, not a general Entry expression; `a => 5` elsewhere still evaluates binding a. Only the authenticated builtin, not a user-defined or shadowed Record/of, receives this grammar. For Entry.of/Pair.of, require a compile-time-proven valid identifier string, and authenticate constructor identity. Reject dynamic keys, duplicate names across all admitted forms, invalid identifiers, unproven shape, incompatible field types and unsupported ownership before emitting an artifact. No implicit stringification or Map-to-Record conversion. Normalize to the same typed Record construction; preserve the original expression spans and source evaluation order independently of canonical field ordering. Ordinary calls still use label: expression for named arguments; `f(a=5)` does not become a named call. A grouped Record argument `f((a=5))` is one value. `f((5,6))` is one Tuple argument; `f(5,6)` is two arguments.

Grouping overrides the existing operator precedence without changing its tiers (see [bitwise and stream operators](bitwise-and-stream-operators-v1.md)). Preserve short-circuiting, checked arithmetic, ownership unary operators, postfix call/index/member/cast binding and nonassociative Entry arrows. Grouped import selectors are a separate static declaration grammar under [static imports v2](static-imports-v2.md), including its distinct delimiter/trailing-comma rules, atomic binding, and visibility checks. No expression evaluation or aggregate allocation in import clauses.

### Required independent conformance

| Source fragment | Expected |
| --- | --- |
| `2 + 3 * 4` / `(2 + 3) * 4` | 14 / 20 |
| `20 - 5 - 3` / `20 - (5 - 3)` | 12 / 18 |
| `(5)` / `(5,)` / `()` | scalar / tuple arity 1 / tuple arity 0 |
| `(5,6,true)` | ordered heterogeneous tuple |
| `((a=5),6)` / `(a=(5,6))` | nested tuple/record, no flattening |
| `(a==5)` | grouped comparison |
| `(a=5,6)`, `(5,,6)`, `(a=5,a=6)` | reject, no artifact |
| All five Record constructions above | same shape, field values and source-order effects |
| `Record.of(Entry.of(dynamic_key,5))` | reject if key not statically proved |
| `Record.of(a=5, a => 6)` | duplicate rejection |
| `false && (trap_expression)`, `true || (trap_expression)` | right operand not evaluated (with bool-typed trap expression) |
| `(key) => 5` | ordinary evaluated Entry key |
| `import (class C, fnc f) from pkg 'x';` | static mixed selector, no tuple |
| `import class (C, D) from pkg 'x';` | static same-kind group |
| `import class (C,) from pkg 'x';` | reject under import v2, unlike tuple trailing comma |

Add actual compiler/guest tests for left-to-right side effects, exactly-once construction, static and dynamic key rejection, shadowed constructors, nested groups, strings/comments, malformed delimiters, resource-bounded nesting and parse-format-parse equivalence. Test JVM/Graal Native Image, .NET NativeAOT, LLVM native, Rust/Wasm, standalone Wasm, JS, Forge, Cranelift and the Atto bootstrap independently; distinguish parser-only, host-only and compiled guest evidence. No unsupported feature may silently emit an artifact. Pin exact head/tree, steps and toolchain. This proposal has no execution receipts yet.
