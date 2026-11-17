# Inline records, maps, sequences and tuples — v1 candidate

**Status:** candidate language contract. This document defines intended portable semantics; no backend is considered conformant without successful guest execution and negative cases at an exact commit. It does not reinstate removed \`~map(...)\`, \`~array(...)\`, \`~record(...)\`, or other tilde-prefixed constructors.

## Spelling and grammar

The core generic type constructor names \`Record\`, \`Map\`, \`List\`, \`Array\` and \`Tuple\` also accept the exact lowercase aliases \`record\`, \`map\`, \`list\`, \`array\` and \`tuple\`. These spellings have the **same** type identity and generic arity; this rule is contextual to type positions and does not lower-case arbitrary identifiers, modules, namespaces or user types. Formatter canonical output is upper-cased built-in type names, never renamed user identifiers.

\`\`\`ebnf
inline_expression = record_or_map | list_or_array | tuple_or_group ;
record_or_map    = "{" [ (field_entry | map_entry), { separator, (field_entry | map_entry) }, [","] ] "}" ;
field_entry      = (IDENT | STRING), ":", expression ;
map_entry        = expression, "=>", expression ;
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

## Contextual typing and identity

- A \`{ field: value }\` literal is a **record**, using field names (identifiers or quoted string keys) as named fields. A \`{ key => value }\` literal is a **map**. A single brace literal may not mix \`:\` and \`=>\`. A duplicate static record field is a compile-time error.
- A map's keys must satisfy the language's equality/hash contract. Duplicate compile-time constant map keys are rejected; runtime collisions between dynamically calculated keys require a documented insertion/overwrite policy. Evaluation of each key/value expression is source-ordered and exactly once.
- An empty \`{}\` must have an unambiguous expected \`Record\` or \`Map<K,V>\` type (or a future explicit typed factory). An untyped \`{}\` is rejected as ambiguous.
- \`[]\` becomes a \`List<T>\` or \`Array<T>\` only in an expected-type position. Without a target type, a nonempty \`[...]\` may be inferred as a List when all elements have a valid common type; an empty untyped \`[]\` must not silently choose a mutable/aliased runtime collection.
- \`List<T>\` is a growable logical collection. \`Array<T>\` has a fixed element count and contiguous array semantics when supported by a target. No implicit conversion between them is permitted, despite sharing brackets. Every \`Array<T>\` item must be assignable to \`T\`.
- Bare \`Record\` is an open record supertype of record values with different field sets. Thus \`Array<Record>\` can contain \`{job:1}\`, \`{car:"str"}\`, and \`{x:true}\` without inventing fields or assuming that all elements have the same layout. Access to an absent field is rejected or must first be guarded by presence/type checking. A specialized closed record type remains eligible for AOT layout optimization.
- A bare \`List\` or \`Map\` annotation with an initializer may infer its type arguments from its elements; empty bare declarations require a future explicitly specified default or contextual type and cannot silently invent \`Any\` storage. **Exception for this v1 compatibility syntax:** \`let List x = []\` is valid as a zero-element list with an as-yet-unconstrained element type; later writes must resolve the element type or fail at compile time. No runtime-dependent widening.
- Tuple values preserve order, length and per-position types. \`()\` is an arity-zero tuple (a unit-like value), distinct in type from \`void\`. A tuple may not be silently flattened by a comma operator or used as an automatic multi-return.

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
