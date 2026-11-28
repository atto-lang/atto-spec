# Candidate: computed DynRecord keys and Symbol construction

Status: proposed extension to #324. The bracket spelling is a candidate, not a claim of all-backend acceptance. Keep Record identifier keys, DynRecord arbitrary string labels, and Map key domains independent.

## Computed DynRecord keys

```atto
const key = "first name";
val person = ([key] = "Alice", "age": 30);
const prefix = "content-";
const DynRecord headers = ([prefix + "type"]: "application/json");
```

The key expression is evaluated exactly once and must produce a string. Evaluate entries in source order; evaluate key before value. A statically known key produces the same structural slot and type as a literal label. A runtime key requires a checked shape construction and cannot be treated as a known static field without proof. No implicit Symbol-to-string conversion, no Unicode normalization or case folding for DynRecord keys. Duplicate decoded keys are rejected statically when proven; otherwise reject at runtime without publishing partial state. Roll back allocations/ownership on failure. Do not make insertion/removal an implicit consequence of dynamic construction. Record braces do not admit computed labels.

JS #325 executes the bounded compile-time slice only; arbitrary string expressions, runtime shape descriptors, dynamic lookup and error API remain outstanding. Existing backend-specific key budgets and escape dialects are not yet a unified language limit.

## Symbol(string)

```atto
const Symbol a = #'x y z zzz';
const Symbol b = Symbol('x y z zzz');
const Symbol c = Symbol("x y z zzz");
```

The direct constructor should accept a string value (including runtime strings) and produce the same nominal PROCESS Symbol as the corresponding literal under the existing Symbol identity contract. Never use a string as a Symbol implicitly. Reject wrong arity, generic arguments and non-string values. Do not alias stable, actor-local, or enum-symbol domains. Construction must preserve actor admission, quotas, UTF validation, ownership and existing capability checks. Existing Java OresSymbol uses bounded NFC-normalized names and does not globally intern untrusted strings; this is distinct from exact DynRecord labels. Reconcile normalization across backends before claiming canonical Symbol identity. No mandatory global interning, no unbounded permanent cache.

## Evidence

Production lexer/parser/type checking, real generated guests, invalid-input zero artifact checks and actor isolation tests. Static model tests and runtime guests must be labeled separately. Exact head/root tree, actual runner steps, independent review and private export restrictions apply. No zero-step credit.
