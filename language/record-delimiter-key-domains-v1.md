# Record delimiter key domains and recursive values — canonical candidate

Owner direction 2026-11-27: brace Record literals require unquoted identifier keys; parenthesized Record literals require quoted string keys. Brace fields construct Record; nonempty quoted parenthesized fields construct DynRecord, a distinct string-keyed structural product, not Map. Quoted colon and equals are equivalent (owner confirmation 2026-11-27). This supersedes conflicting Record examples in recursive-product-literals-v1, record-mixed-entries-extension-v1 (#306) and contextual Product work (#323) for the canonical grammar, without reclassifying independent Map, Tuple, Pair, named-argument or block syntax. Historical evidence is not evidence for this revision.

## Grammar and classification

* In Record field-entry position in braces, accept ordinary identifier labels, not quoted labels. In a parenthesized DynRecord, accept double-quoted string labels, not unquoted labels. Recognize explicit colon or equals fields at the current delimiter depth; never scan inside a nested expression to decide the outer kind.
* Preserve explicit Map syntax and typed Map context: a quoted-key brace Map is not a Record and must not be implicitly coerced into one. Existing standalone Pair and Tuple-of-Pair syntax remains distinct. Existing named call arguments remain distinct from an extra parenthesized Record argument.
* Retain previously admitted explicitly typed empty `const Record r = ();` and `const Record r = {};` as contextual empty Record; `const DynRecord r = ();` denotes empty DynRecord. Do not infer cross-kind conversion from nonempty delimiters. Do not reinterpret a required block, or change the existing contextual Tuple/unit decision for untyped ().
* Decode string labels once, compare exact decoded names, reject duplicates before evaluation; no Unicode normalization or implicit case folding. Quoted arbitrary names such as "content-type" are accessed by checked string-key indexing. Dot access requires an ordinary field identifier. Keep existing lexer escape validity; do not introduce a new escape dialect.
* Preserve existing brace field separators (:, =, :=) where admitted by the canonical Record grammar. The owner explicitly illustrated colon and identifier := forms; quoted = is now admitted in parentheses; quoted := admission, capture shorthand and quoted control-character/empty-label policy are separate reconciliation decisions, not silently promoted by this change. Preserve standalone Pair grouping and tuple behavior.
* The formatter preserves chosen delimiters, quoting, exact decoded label and nested structure. Do not convert a quoted-key brace Map into a Record; no quote removal if label is not a valid identifier.

## DynRecord and named arguments

```atto
val person = ("name" = "Alice", "age" = 30);
val equivalent = ("name": "Alice", "age": 30);
val mixed = ("first name" = "Alice", "age": 30);
foo(name = "Alice", age = 30); // named arguments
foo(("name" = "Alice", "age" = 30)); // one DynRecord argument
```

Both separators yield the same DynRecord kind and structural shape. Reject bare identifier labels and mixed quoted/unquoted explicit labels in parentheses. Reject duplicate decoded labels across separators. An extra pair of parentheses does not turn named arguments into a tuple of assignments. Brace Record retains identifier keys; quoted brace Map remains distinct. DynRecord can retain closed, independently typed fields and direct slot access when the shape is known; no mandatory Map representation. Nested literals infer their own kind. Explicit conversion/widening, computed-key syntax and runtime lookup result type require separate verification/design; do not infer them from this separator change.

## Recursive value semantics

```atto
const Record r = {x: [1,2,3]};
const Record s = {x: [{a:1},{b:2},{c:3}]};
const DynRecord t = ("x": [{a:1},("b":2),{c:3}]);
const Record u = {meta: ("content-type": "json"), x: [1,2,3]};
```

r.x is an array of integers, not a Tuple or synthetic Record. s.x is an array of Records with differing shapes. Mixed Record/DynRecord arrays require a checked common product or union representation; do not erase the key domain. The implementation may preserve a structural union or a checked common Record element representation; no mandatory homogeneous field set, invented fields, implicit coercion or unchecked projection. A statically proven projection yields the actual element value; unknown index/shape requires proof or a checked access mechanism. Preserve array ordering, bounds checks, left-to-right initializer evaluation exactly once, recursive ownership, const/deep immutability, and allocation/cleanup on failed initialization. Empty arrays obey existing contextual element inference. Reject missing field access when statically impossible. Record equality uses value equality (eq), not reference identity (==); no forced identity result for distinct literals under an unspecified interning model.

## Verification gate

The companion vectors are target fragments, not executed tests. Use production lexer/parser, typed AST/IR, actual guest outputs, negative no-artifact checks, formatter round trips, and cross-backend native/AOT/Wasm execution. Keep parser-only or reference-model evidence distinct. Require independent review, exact head/root tree and nonzero runner steps. A source-free canary or partial snapshot is not full-tree proof. When authorized, mirror the exact tree to a suitable isolated funded carrier; verify repository visibility, root tree identity and runner execution before reporting success. No cross-org secrets or tokens.
