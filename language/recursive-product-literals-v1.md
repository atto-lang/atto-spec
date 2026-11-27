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

Except for the explicit quoted-field candidate below, call delimiters keep their existing separate grammar: f(x = 1) is a named argument, f(x := 1) is a positional Pair, f((x = 1)) is one positional Record, and f((x := 1, y := 2)) is one positional Tuple. The expected parameter type must never reclassify those forms. Explicit spread is one level only according to #299; .apply remains positional.

## Required conformance

Parse recursively into distinct Pair, Tuple and Record expression nodes and check complete recursive types and values. Preserve left-to-right source evaluation exactly once even when Record layout is canonicalized. Carry nested ownership, lifetimes and effects; no implicit copy, move, mutable capability or deep freeze. A const declaration still requires a valid compile-time initializer. Formatter round trips must preserve constructor kind, field labels, Pair keys, tuple arity, grouping required for nonassociative chains, and argument count. Existing depth/resource limits apply; unsupported shapes fail closed before guest emission. Do not use a permissive fallback to turn any shape into a generic list or map.

The companion vectors are target fragments, not execution evidence. Require exact-head real parser/typed IR and formatter checks, executable value/shape probes with actual backend codegen, and diagnostic/no-artifact checks for negative cases. Run the same oracle across every atto-source.* backend and record NOT_EXECUTED/NOT_SUPPORTED separately from PASS. No backend certification from a spec-only test.

## Candidate quoted identifier labels and anonymous call arguments

This proposal responds to the nested anonymous Record / named-argument distinction. It supersedes #299's quoted-equals rejection only if adopted; it does not change brace Map syntax or quoted Pair keys.

In expression-position parentheses, a decoded ordinary string literal immediately followed by the single equals token is a Record field label, not an evaluated key expression. It may mix with unquoted identifier-equals fields and captures. Its decoded contents must be exactly one legal variable identifier under the same compiler lexer and identifier/reserved-word validation as the unquoted field label. Reject empty labels, leading digits, hyphens, whitespace, punctuation, reserved keywords, and any other spelling disallowed by the ordinary identifier grammar. Do not normalize, trim, case-fold, or invent a second identifier grammar. Escapes, if accepted by the ordinary string decoder, are checked after decoding; a decoded forbidden character rejects. Identical decoded labels collide with bare labels at the same Record level. No computed key expressions or runtime checks.

```atto
const r = ("outer" = ("inner" = 42));
const same = (outer = (inner = 42));
foo((outer = (inner = 42)));     // existing positional Record
foo(("outer" = ("inner" = 42))); // same positional Record
foo(outer = (inner = 42));       // named argument outer; no assignment
foo("outer" = ("inner" = 42));   // candidate: one positional one-field Record
foo(("x" = 1, "y" = 2));        // one positional two-field Record
foo("x" = 1, "y" = 2);          // candidate: two positional one-field Records
```

In the call-argument grammar only, a STRING_LITERAL followed by single equals and an ordinary RHS expression is explicit sugar for a positional one-field Record argument. It is not a named argument or assignment. Each call-level comma still separates arguments; never implicitly coalesce multiple quoted fields into one Record. Use inner parentheses or brace Record syntax for a multi-field argument. The quoted form counts as positional for the existing positional-before-named rule. Callable overload and expected types never alter this decision. The formatter may expand the direct quoted shorthand into explicit inner Record parentheses but must preserve argument count and constructor kind; it must not simply remove quotes from a direct call-level shorthand.

This is a proposed call sugar policy, not previously ratified syntax. Quoted equals in standalone expression parentheses is a Record field, not a general assignment or free-standing binary operator. Quoted colon in braces remains Map syntax under #299's inherited rules; quoted := remains a Pair with an unrestricted string key. No change to ordinary string equality operators or named-argument identifier grammar.
