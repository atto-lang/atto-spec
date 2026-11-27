# Recursive Pair, Tuple and Record literals — v1

Status: TARGET_NOT_EXECUTED; candidate extension of Pair literals and name-derived bindings v3 (#299), which is stacked on aggregate constructors v2 (#246). No compiler support or merge is claimed.

## Recursive composition

Pair<V> accepts a tuple, closed structural Record, or another Pair as V. Tuple elements and Record field values accept any of these products, including mixtures and heterogeneous payloads, subject to ordinary type, ownership, constexpr and representation checks. No implicit flattening, spreading, scalar extraction, Map/Entry conversion or shape coercion. The following nine combinations are valid without expected types:

```atto
const pair_tuple = coordinates := (10, 20);
const tuple_pairs = (x := 10, y := 20);
const record_tuples = (position = (10, 20), velocity = (30, 40));
const tuple_records = ((x = 10, y = 20), (x = 30, y = 40));
const record_pairs = (first = (x := 10), second = (y := 20));
const pair_record = position := (x = 10, y = 20);
const pair_pair = outer := (inner := 42);
const tuple_tuple = ((1, 2), (3, 4));
const record_record = (outer = (inner = 42));
```

A pair retains the decoded string key and complete typed value, a tuple retains positions and arity, and a Record retains its closed named field shape. Identical labels at different Record levels are permitted; duplicate labels in a single Record reject. Repeated Pair keys in a tuple are allowed as values; explicit named spread or Record conversion retains its existing duplicate-key rejection. Record fields holding Pairs do not inherit their payload keys. Record aliases and tuples remain distinct even if their representation could be optimized to the same storage.

## Delimiter-local classification

At each expression parenthesis, inspect the first item at that delimiter level only (respect nested expressions, strings, comments, and lexer tokens). An IDENT or STRING_LITERAL followed by the single equals token, or :IDENT capture, selects Record items (quoted labels are subject to the candidate rule below); all items at that level must then be fields or captures. Otherwise parse ordinary expressions: zero items is the empty Tuple, one item without comma is grouping, one item with a trailing comma or multiple comma-separated items is a Tuple. Equality operators, :=, and => are not Record-field separators. Nested fields cannot select a Record at an outer tuple delimiter. A mixed top-level field/positional list rejects in either order, without backtracking into a different aggregate. Ordinary Record field RHS expressions may contain ungrouped Pair literals, so (first = x := 10, second = y := 20) has the same shape as the parenthesized version above. Braces continue to use the distinct existing Record/Map classification; nested Pair/Tuple/Record values do not affect the brace-level choice.

Pair literals use an IDENT or quoted string key and one adjacent := token; the RHS is an ordinary expression. Pair and Entry association chains remain nonassociative: repeated or mixed ungrouped := / => chains reject. Explicit grouping allows nested associations, e.g. outer := (inner := 42). No change to the existing declaration-only name-derived binding sugar. Pair key spelling is lexical (or decoded string); it is not variable lookup.

```atto
const p = (x := 1);       // Pair<int>, grouping only
const t = (x := 1,);      // singleton Tuple of Pair<int>
const r = (x = 1,);       // singleton Record
const tr = ((x = 1),);    // singleton Tuple of Record
const tt = ((1, 2),);     // singleton Tuple of Tuple
const pr = x := (1,);     // Pair of singleton Tuple
const mixed = (x := 1, (y = 2), (3, 4), true);
const deep = root := (items = ((id := 42),), info = (ok = true));
```

Call delimiters keep their separate grammar: f(x = 1) and f("x" = 1) are named arguments, f(x := 1) is a positional Pair, f((x = 1)) is one positional Record, and f((x := 1, y := 2)) is one positional Tuple. The expected parameter type must never reclassify those forms. Explicit spread is one level only according to #299; .apply remains positional.

## Required conformance

Parse recursively into distinct Pair, Tuple and Record expression nodes and check complete recursive types and values. Preserve left-to-right source evaluation exactly once even when Record layout is canonicalized. Carry nested ownership, lifetimes and effects; no implicit copy, move, mutable capability or deep freeze. A const declaration still requires a valid compile-time initializer. Formatter round trips must preserve constructor kind, field labels, Pair keys, tuple arity, grouping required for nonassociative chains, and argument count. Existing depth/resource limits apply; unsupported shapes fail closed before guest emission. Do not use a permissive fallback to turn any shape into a generic list or map.

The companion vectors are target fragments, not execution evidence. Require exact-head real parser/typed IR and formatter checks, executable value/shape probes with actual backend codegen, and diagnostic/no-artifact checks for negative cases. Run the same oracle across every atto-source.* backend and record NOT_EXECUTED/NOT_SUPPORTED separately from PASS. No backend certification from a spec-only test.

## Quoted identifier labels and explicit anonymous Record arguments

User clarification: quoting a label never changes named argument into positional Record. This revision supersedes the earlier direct quoted positional shorthand in this draft. Within the recursive-product-v1 target profile, its narrow quoted-equals rule takes precedence over #299's quoted-equals rejection and the earlier inline-collection literal grammar. Historical profiles retain their old expectations; no silent change to a released language profile. It does not change brace Map syntax or quoted Pair keys.

In expression-position parentheses, a decoded ordinary string literal immediately followed by the single equals token is a Record field label, not an evaluated key expression. It may mix with unquoted identifier-equals fields and captures. Its decoded contents must be exactly one legal variable identifier under the same compiler lexer and identifier/reserved-word validation as the unquoted field label. Reject empty labels, leading digits, hyphens, whitespace, punctuation, reserved keywords, and any other spelling disallowed by the ordinary identifier grammar. Do not normalize, trim, case-fold, or invent a second identifier grammar. Escapes, if accepted by the ordinary string decoder, are checked after decoding; a decoded forbidden character rejects. Identical decoded labels collide with bare labels at the same Record level. No computed key expressions or runtime checks.

```atto
const r = ("outer" = ("inner" = 42));
const same = (outer = (inner = 42));
foo((outer = (inner = 42)));     // existing positional Record
foo(("outer" = ("inner" = 42))); // same positional Record
foo(outer = (inner = 42));       // named argument outer; no assignment
foo("outer" = ("inner" = 42));   // named argument outer, same as bare label
foo(("x" = 1, "y" = 2));        // one positional two-field Record
foo("x" = 1, "y" = 2);          // two named arguments
```

At the call delimiter, bare and quoted identifier-equals labels both denote named arguments. They resolve to the same static parameter identity and never construct a Record or assign a variable. An anonymous parenthesized Record must have its own inner parentheses, even for one field. The outer call commas separate argument slots; never implicitly coalesce named arguments or infer a Record from the parameter type. An independently admitted brace Record is also a positional expression.

Quoted equals in standalone expression parentheses denotes a Record field, not a free-standing binary operator. Quoted colon in braces remains Map syntax; quoted := remains a Pair with an unrestricted string key. Legacy identifier-colon named arguments remain unchanged; quoted colon at call level is not admitted. No change to ordinary equality operators.

### Hardened grammar and lowering boundaries

The following grammar is a local delta to #299, not a replacement for its general expression or call grammar. DQ_STRING means an ordinary non-interpolated double-quoted string token; no character literal, template, adjacent-string concatenation, constant expression or raw identifier escape is admitted by this delta. The normal lexer handles whitespace/comments and maximal-munch operators before classification. Label validation occurs on the entire decoded string, not on a token prefix.

```ebnf
record_label = IDENT | DQ_STRING ;
record_item = record_label, "=", expression | ":", IDENT ;
named_arg = record_label, "=", expression | IDENT, ":", expression ;
call_arg = named_arg | "...", expression | expression ;
```

Dispatch at the beginning of an ordinary call argument by token pair: IDENT + single "=" or ":" -> named_arg; DQ_STRING + single "=" -> named_arg; ellipsis -> existing spread; otherwise ordinary expression. The decision is committed: invalid quoted labels and malformed RHS are errors, not a retry as a positional string, Record or Map key. A colon following a quoted string is NOT a named argument. Equality (==), association (:=, =>), and compound operators retain their original meanings. Missing RHS, doubled commas, missing close delimiters, or extra tokens reject. No free-standing quoted assignment, no new assignment expression, and no reassignment side effect on a same-named variable.

A quoted named argument lowers before overload resolution to the same NamedArg node as its bare spelling. Explicit inner parentheses instead produce an ordinary positional Record expression. The RHS is parsed with the normal call-level delimiter stop set; nested commas belong to their own productions. Named argument ordering, duplicate decoded labels (including mixed bare/quoted and spread slots), defaults and callable identity are checked by the existing call planner. Methods and function-value calls follow the same rule; .call follows the existing callable contract, .apply requires its single typed tuple operand and does not accept named labels or spread. Intrinsic Record.of admits validated quoted equals named fields on the same terms as bare equals fields; Map.of does not admit named fields. Quoting never bypasses intrinsic input-kind checks or implicitly spreads an aggregate.

Use the ordinary declaration identifier validator in its field/parameter context, with full-string consumption and the same reserved-name checks. Never accept a token prefix, lexer trivia, comments, NUL, control characters, malformed Unicode, or a decoded string with leading/trailing whitespace. The ordinary identifier policy is authoritative for legal Unicode and case sensitivity; this delta does not create a Unicode normalization or confusable policy. Duplicate detection uses exactly the canonical identity of the corresponding bare identifier (not a separate string-key normalization); if the base identifier policy rejects a spelling, quoting cannot admit it. A decoded label may not be resolved as a runtime variable; capture remains the explicit :IDENT production. The proposed double-quoted-only initial admission avoids treating string interpolation or alternate literal syntaxes as label syntax by accident; other literal forms need separate grammar admission.

Formatter: f("x" = expr) may become f(x = expr) only after proving decoded identifier identity; never insert inner parentheses that would change it to a Record. Conversely f(("x" = expr)) may become f((x = expr)) but must retain the inner Record delimiters. Preserve comments and source spans under ordinary formatter rules; never repair invalid labels. Reparse and compare typed aggregate/argument kinds, count, ordered RHS nodes and labels.

For backend admission, require independent positive controls for each negative cluster and diagnostic category/span on the offending construct; unsupported-feature errors do not count as successful negative tests. Require no executable artifact on rejection; real guest positives must observe nested values and once-only effect traces. Resource exhaustion follows existing parser limits with controlled diagnostics, not host stack overflow or unbounded backtracking. Host contract tests are not the production parser, type checker, formatter or guest.
