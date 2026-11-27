# Recursive products and declaration-local Record initializers — v1

Status: TARGET_NOT_EXECUTED. User-approved revised syntax supersedes conflicting earlier recursive-product, #299 and #246 rules only in this target profile. No compiler execution or release admission is claimed.

## Delimiter and declaration rules

The syntactic site, not inferred/expected types, determines constructor identity. Parentheses normally group expressions or construct Tuples. Direct binding initializers have the following declaration-local exception:

| Source | Meaning |
|---|---|
| const x = (); | empty Tuple |
| const x = (five := 5); | grouped Pair |
| const x = (five := 5,); | singleton Tuple of Pair |
| const x = (five := 5, six := 8); | Tuple of Pairs |
| const x = (five: 5, six: 8); | inferred Record |
| const Record x = (five := 5, six := 8); | Record |
| const Record x = (five: 5, six: 8); | Record |
| const Record x = (five = 5, six = 8); | Record |
| const Record x = (); | empty Record |
| const Record x = {}; | empty Record |
| const x = {}; | error: ambiguous empty aggregate |
| const Map<string,int> x = {}; | empty typed Map |

In a direct untyped binding, a leading label-colon or :IDENT capture selects parenthesized Record items; every item must use colon or capture. A leading pair or positional item selects ordinary grouping/Tuple; later field-colon or field-equals rejects. An inferred parenthesized label-equals initializer rejects. Explicit builtin Record declarations admit parenthesized colon, equals, colon-equals and capture, including mixed separators, and both empty delimiters. Empty typed Record () and {} are the same Record AST and runtime shape, never Tuple conversion. A normal Record-valued expression may initialize a Record binding; a preexisting Tuple or Pair cannot implicitly convert.

Only the direct initializer grammar has this privilege. No propagation into nested expressions, calls, assignments, returns, casts or overload resolution. A user-defined type or alias named Record must not silently acquire builtin authority; resolve the canonical builtin identity before executable admission. Other declared types do not activate parenthesized Record syntax. Parenthesized colon at ordinary expression sites is not Record construction; unrelated independently specified ascription syntax retains its own rules and cannot be used to construct a Record. Use braces for nested or anonymous Records.

## Brace literals

At an ordinary expression site, a nonempty brace literal is either a Record (static identifier or validated ordinary double-quoted identifier followed by :, = or :=; or :IDENT capture) or a Map (evaluated key expression followed by =>). The first complete delimiter-local item selects the kind; mixed Record and Map items reject regardless of expected type. Record separators may mix. Colon-equals is one adjacent lexer token, not colon followed by a separate equals token. Nested delimiters and string/comment contents do not participate in the outer classification. A bare identifier before => is evaluated as a key, not treated as a lexical string. All Map keys must obey existing compatible Hash/Eq and ownership requirements. Quoted colon is Record, not Map; arbitrary string keys require =>. Untyped {} rejects, including anonymous arguments. An explicitly declared builtin Record admits {}, and an explicitly typed builtin Map admits {} with a complete key/value witness. Do not infer empty literal kind from a call signature.

## Calls and factories

```atto
foo(x = 42);            // named
foo("x" = 42);          // same named
foo(x: 42);             // legacy named
foo(x := 42);           // positional Pair
foo((x := 42));         // grouped Pair, not Record
foo((x := 42,));        // singleton Tuple of Pair
foo((x := 42, y := 5)); // Tuple of Pairs
foo({x: 42});           // positional Record
foo({x = 42});          // same Record
foo({x := 42});         // same Record
foo({x: 42}, {y: 5});   // two Records
foo({x: 42, y: 5});     // one Record
foo(x = {inner: 42});   // named with Record RHS
```

Anonymous Record literals use braces, including nested fields, call arguments and return expressions. Quoted equals at call level is named, not a Record. Quoted colon at call level remains unadmitted. Calls never reclassify based on parameter types; named labels resolve to static parameter identity, duplicate slots reject, positional after named rejects, and no implicit coalescing or spreading occurs. Explicit spread and .call/.apply retain #299 rules; .apply is positional typed Tuple only. Record.of may consume validated named fields or identifier-proven Pair inputs per its authenticated constructor contract; Map.of accepts compatible Pair/Entry per its existing factory contract. These factory contracts do not change brace literal rules. A standalone Pair key is lexical or decoded string, unrestricted; Entry keys are evaluated. No implicit payload extraction or Pair/Tuple/Record/Map conversion. Ungrouped repeated or mixed := and => association chains reject; grouping or Record field delimiters do not count as association operators.

## Recursive composition

```atto
const pair_tuple = coordinates := (10, 20);
const tuple_pairs = (x := 10, y := 20);
const record_tuples = {position: (10, 20), velocity: (30, 40)};
const tuple_records = ({x: 10, y: 20}, {x: 30, y: 40});
const record_pairs = {first: (x := 10), second: (y := 20)};
const pair_record = position := {x: 10, y: 20};
const pair_pair = outer := (inner := 42);
const tuple_tuple = ((1, 2), (3, 4));
const record_record = {outer: {inner: 42}};
```

Preserve nested kinds, exact types, positions, names, arity and ownership without flattening. Repeated Pair keys in positional tuples are allowed; duplicate Record fields and named parameter slots reject. Labels may repeat at independent nesting levels. Field RHSs evaluate once in written order, even with canonical field layout; no implicit copy, move, freeze or mutable authority. Const requires ordinary compile-time evaluability. No change to name-derived Pair binding sugar.

## Static label validation

Ordinary non-interpolated double-quoted labels are decoded then checked by the same complete ordinary identifier validator and reserved-name rules as bare labels. Require full-string consumption; reject empty, whitespace, punctuation, hyphens, leading digits, comments within label, NUL, controls, malformed Unicode and reserved names. No trimming, normalization or case folding independent of ordinary identifier policy. Duplicate labels compare decoded identifier identity, including captures and named argument slots. Quoted Pair and Map keys are not subject to identifier rules. No runtime key lookup, computed Record label, templates or alternative string spellings admitted by this delta.

## Formatter and verification

Canonical Record output may use braces and colon, even for a declaration-local parenthesized Record, only if constructor identity is proved. Never rewrite a grouped Pair or Tuple of Pairs to Record, or an empty Tuple to Record. Preserve typed empty Record vs untyped empty Tuple. Preserve call argument counts, named vs positional distinction, comments, decoded labels and all semantically necessary grouping; invalid input must not be silently repaired. Reparse formatted output and compare typed AST and ordered effects; textual idempotence alone is insufficient.

Require production parser and type/ownership checks, formatter equivalence, actual compiled guest values/effect traces and precise diagnostic/no-artifact negatives with matched positive controls at exact compiler heads. Unsupported errors do not count as semantic negative passes. Apply existing resource limits and fail closed without host stack overflow. Host contract tests are reference tests only, not production lexer, parser, typechecker, formatter or guest parity.
