# Record delimiter key domains and recursive values — canonical candidate

Owner direction 2026-11-27: brace Record literals require unquoted identifier keys; parenthesized Record literals require quoted string keys. Both forms construct the same structural Record. This supersedes conflicting Record examples in recursive-product-literals-v1, record-mixed-entries-extension-v1 (#306) and contextual Product work (#323) for the canonical grammar, without reclassifying independent Map, Tuple, Pair, named-argument or block syntax. Historical evidence is not evidence for this revision.

## Grammar and classification

* In Record field-entry position in braces, accept ordinary identifier labels, not quoted labels. In a parenthesized Record, accept double-quoted string labels, not unquoted labels. Recognize explicit colon fields at the current delimiter depth; never scan inside a nested expression to decide the outer kind.
* Preserve explicit Map syntax and typed Map context: a quoted-key brace Map is not a Record and must not be implicitly coerced into one. Existing standalone Pair and Tuple-of-Pair syntax remains distinct. Existing named call arguments remain distinct from an extra parenthesized Record argument.
* Empty `const Record r = ();` and `const Record r = {};` denote empty Record. Do not reinterpret a required block, or change the existing contextual Tuple/unit decision for untyped ().
* Decode string labels once, compare exact decoded names, reject duplicates before evaluation; no Unicode normalization or implicit case folding. Quoted arbitrary names such as "content-type" are accessed by checked string-key indexing. Dot access requires an ordinary field identifier. Keep existing lexer escape validity; do not introduce a new escape dialect.
* Preserve existing brace field separators (:, =, :=) where admitted by the canonical Record grammar. The owner explicitly illustrated colon and identifier := forms; quoted = and := admission in parentheses, capture shorthand and quoted control-character/empty-label policy are separate reconciliation decisions, not silently promoted by this change. Preserve standalone Pair grouping and tuple behavior.
* The formatter preserves chosen delimiters, quoting, exact decoded label and nested structure. Do not convert a quoted-key brace Map into a Record; no quote removal if label is not a valid identifier.

## Recursive value semantics

```atto
const Record r = {x: [1,2,3]};
const Record s = {x: [{a:1},{b:2},{c:3}]};
const Record t = ("x": [{a:1},("b":2),{c:3}]);
const Record u = {meta: ("content-type": "json"), x: [1,2,3]};
```

r.x is an array of integers, not a Tuple or synthetic Record. s.x is an array of Records with differing shapes. The implementation may preserve a structural union or a checked common Record element representation; no mandatory homogeneous field set, invented fields, implicit coercion or unchecked projection. A statically proven projection yields the actual element value; unknown index/shape requires proof or a checked access mechanism. Preserve array ordering, bounds checks, left-to-right initializer evaluation exactly once, recursive ownership, const/deep immutability, and allocation/cleanup on failed initialization. Empty arrays obey existing contextual element inference. Reject missing field access when statically impossible. Record equality uses value equality (eq), not reference identity (==); no forced identity result for distinct literals under an unspecified interning model.

## Verification gate

The companion vectors are target fragments, not executed tests. Use production lexer/parser, typed AST/IR, actual guest outputs, negative no-artifact checks, formatter round trips, and cross-backend native/AOT/Wasm execution. Keep parser-only or reference-model evidence distinct. Require independent review, exact head/root tree and nonzero runner steps. A source-free canary or partial snapshot is not full-tree proof. When authorized, mirror the exact tree to a suitable isolated funded carrier; verify repository visibility, root tree identity and runner execution before reporting success. No cross-org secrets or tokens.
