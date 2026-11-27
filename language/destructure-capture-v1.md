# Recursive destructuring and aggregate capture v1

Status: TARGET_NOT_EXECUTED. Candidate binding-pattern contract, not compiler admission. Builds on callable aggregate patterns (#260) and recursive products (#303); supersedes their conflicting local declaration rules only in this profile.

## Syntax
```atto
const (a,b,c) as r = foo();
const {a,b,c} as r = foo();
const [a,b,c] as r = foo();
const [a,mut b,c] as r = foo();
const [a,b,let c] as r = foo();
[const a,let mut b,val c] as r = foo();
const (a,b,c) as Record r = foo();
const ({name,age} as person,[x,let mut y,z] as coordinates) as result = foo();
```

Tuple (), Record {}, Array [] are distinct pattern kinds in this profile. The RHS must have the corresponding kind unless an explicitly specified conversion is supported; do not silently reinterpret a Pair, Entry, Map, Tuple, Record or Array. Existing legacy sequence destructuring profiles retain their versioned behavior. Parentheses here are pattern delimiters, not ordinary expression grouping. Exact arity is required for positional patterns without rest. Record field selection uses statically resolved identifier identity; unmatched fields remain in the captured original record. Unknown fields, duplicate names/paths and incompatible leaf types reject. Array length must be statically proven or checked before any move, publication or mutation; a failing dynamic length check leaves no partial bindings. Empty patterns require an explicit aggregate capture and matching empty shape in the initial profile.

## Per-leaf policy
An outer const/val/let plus optional mut provides an inherited default for each leaf and capture independently. Each override applies to that leaf/subtree only, never following siblings. Without a default, every non-discard leaf requires its own binding kind; capture defaults to const. Bare mut inside a pattern means the inherited kind with writable referent (not rebindable by itself); without inherited kind it rejects. val means const mut, val mut rejects. Explicit const and let reset referent permission to readonly unless followed by mut. Mutability grants no ownership or capability upgrade. Nested pattern inherits its nearest explicit default. Capture may explicitly override the binding policy using as let r, as val r or as const mut r.

```text
pattern := leaf | tuple_pattern | record_pattern | array_pattern
leaf := [binding_kind] [mut] [ownership_operation] IDENT | _
capture := as [binding_kind [mut]] [canonical_aggregate_type] IDENT
```

The ownership-token placement in this grammar is a candidate to reconcile with the existing bang-keyword grammar; do not silently accept a new ordering in unrelated profiles. Rest, renamed Record fields, typed leaves and callable/match patterns require explicit profile-specific admission; do not silently alter existing meanings. No implicit runtime type lookup.

## Capture and conversions
An untyped capture retains the original aggregate kind, layout and ownership; it is not rebuilt from the selected leaves. Explicit as Record on a Tuple pattern is a deliberate conversion whose field names come from the top-level binding identifiers; require unique statically valid labels and an exact fixed shape. Explicit as Array requires homogeneous compatible elements and a supported allocation/ownership path. Other conversions require explicit checked conversion contracts; no cast through Any, no implicit deep copy. For conversions, extract leaf paths from the source once, construct the target exactly once; the capture must not introduce a second owner. Nested conversions obey the same rules. Reject a conversion with discard/rest or missing static names until defined. Record field ordering for a positional conversion follows written pattern order, not runtime iteration.

## Ownership and atomic binding plan
Evaluate RHS once, reserve an owned temporary or stable source place, resolve all paths and prove shape, ownership, loans, region/lifetime and conversion before publishing bindings. Borrowed RHS cannot confer ownership; const alone is not a freeze operation. Copyable scalar leaves are independent values, reassigning a let leaf does not update the captured slot. Non-Copy leaves use existing explicit take!/borrow!/copy!/share! semantics; no implicit deep clone. A capture shares the same place/provenance, not an independently owning alias. A moved path is inaccessible via every alias, and a whole-value operation requiring the moved path rejects until lawful reinitialization. Mutable loan excludes overlapping access through capture, siblings, parent, nested captures and aliases until loan ends; disjoint paths may remain usable when proved. A readonly capture does not grant mutation through a readonly source. Escaping borrows, suspension, actor transfer and destructor obligations use existing ownership rules. When a backend cannot prove path loans or partial move/drop state, it must reject with an unsupported diagnostic, never lower to uncontrolled copies.

Binding plans are transactional: reject duplicate names including captures, overlapping exclusive loans and invalid shape before publication; on failure release initialized temporary owned slots exactly once. A dynamic shape check must precede moves. No RHS re-evaluation, no reordered effects, no hidden constructor call. Capture name visible only after successful declaration. No new runtime named-argument value; explicit spread of statically known Pair/Record keys remains a call-site operation.

## Parity gate
Every backend reports parser, type, ownership, generated artifact and actual guest observations separately. Unsupported is not a passing semantic negative. Verify exact heads, scalar and non-Copy controls, same RHS effect count, disjoint/overlapping loans, partial drops and nested alias provenance. Native backends use sanitizers where available. Formatting preserves delimiter, per-leaf overrides, capture kind, ownership spelling and AST semantics. Do not claim full support from host-only tests.
