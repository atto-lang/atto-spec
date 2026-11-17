# `with` — immutable record/struct copy-and-update (candidate v1)

**Status:** candidate semantics and staged compiler admission; not a claim of executable guest support. This proposal depends on inline collection typing (#69), Record/Struct layout (#72), and shallow/deep copy discipline (#39).

## Purpose and spelling

```atto
const original = {name: "Alice", age: 30};
const birthday = original with {age: 31};
const enriched = original with {age: 31, active: true};
const retagged = original with {age: "thirty"};
const nested = (enriched with {"content-type": "json"}) with {active: false};
```

`with` is a contextual expression operator: `with_expression := operand, "with", "{", [field, {separator, field}], "}"`, with `field := (IDENT | STRING), ":", expression` and the same comma/newline/trailing-comma rules as Record literals. Its right side is **only** a static field-update list, not an arbitrary Record expression, statement block, Map literal, or lambda body. No spread or dynamic key syntax is introduced in v1. `with` is left-associative; parenthesize complex operands to make precedence explicit; the parser must not accidentally consume a following statement block. The formatter uses `source with {field: value}` and preserves user field spellings, otherwise canonicalizing as with ordinary Record fields.

The receiver is evaluated **exactly once**. Each override expression is evaluated **exactly once, left to right, in source order**. Field names are identified by decoded UTF-8 bytes (identifier `x` and string `"x"` denote the same field). Duplicate update names are compile errors; two different update lists in a chain are not duplicates. An update expression is evaluated against lexical bindings, **not** an implicit `self` or partially built receiver.

### Record result type

A known closed `Record<{name:string, age:int}>` with `{age:31}` yields the same closed shape, while `{active:true}` adds a field and `{age:"thirty"}` **replaces its field type**. In type notation only:

- `{name:string, age:int} with {age:int}` → `{name:string, age:int}`
- `{name:string, age:int} with {active:bool}` → `{name:string, age:int, active:bool}`
- `{name:string, age:int} with {age:string}` → `{name:string, age:string}`

The result type is computed statically as **source fields minus overwritten names plus update names/types**, then canonicalized in UTF-8 field-name/type order. Initializer evaluation order must not be reordered to match the canonical layout. Quoted names may be non-identifiers, including empty UTF-8 strings, and are projected with checked quoted bracket syntax.

A bare/open `Record` does **not** expose a known field set or a statically known result shape. Updating a bare open Record is **E_WITH_OPEN_RECORD** in v1 unless a prior checked narrowing produces a known closed Record type. Do not assume hidden fields, erase them, fabricate defaults, or silently turn it into Map. No automatic mutable width-subtyping.

The destination's explicit type annotation is an ordinary assignability constraint: a type-changing `with` cannot be silently coerced back to the old closed shape. `infer` (where otherwise valid) infers from the new result, not from the original.

### Nominal Struct result type

For an ordinary nominal Struct, `with` may replace **declared writable-in-constructor fields** with type-compatible values and returns **the exact same nominal Struct type**. It cannot add an undeclared field, change any declared field's type, bypass visibility, replace a fixed/invariant/protected field lacking a verified reconstruction capability, or pretend an unrelated Struct with the same shape is equivalent. Diagnostics: `E_WITH_FIELD`, `E_WITH_TYPE`, `E_WITH_ACCESS`. Existing custom construction invariants must be preserved by a verified generated constructor-free reconstruction plan or a type-authorized rebuilding mechanism. A backend without such a plan must reject `E_UNSUPPORTED`, not shallow-memcpy class storage.

`with` is not v1 syntax for changing a nominal Struct into a different Struct or implicitly converting a Record into a Struct. Use an explicit checked constructor/conversion for that operation. Map key insertion/replacement remains a separate dynamic Map operation (`=>` entries are rejected in a `with` update). Ordinary identity-bearing classes, actors, runtime resources, bare Any and unverified polymorphic subclasses are not automatically copyable with this operator.

### Ownership, sharing and failure

`with` constructs a **new logical root value** and never mutates or implicitly consumes its source. It is **not** `copy!!` and is **not** permission to share mutable child references. For each **retained** source field the compiler must prove a valid by-value/Copyable duplication, immutable sharing or explicit checked share-capability. Unique owned non-Copy storage may not be shallow-aliased: reject `E_WITH_OWNERSHIP`. Replacement fields are evaluated with ordinary ownership/borrow/effect rules; an active exclusive borrow cannot be evaded via `with`. Replacing a field does not copy the old field unnecessarily, but the source remains valid. Explicit deep graph independence is obtained by `copy!! source` before `with`, subject to the separate deep-copy witness and actor-transfer proofs.

A parser/typechecker-only implementation must **not** turn a `with` into an ordinary mutable `field = value`, raw memory copy, or transient published partially initialized object. After prechecks, evaluate receiver once, then update expressions in order into temporary values; validate and construct all required retained/override fields, publish only on success, and clean up temporary owned values on failure. Side effects performed by update expressions are **not** generally rolled back; the source value and destination publication are atomic with respect to these updates. Compiler-generated AOT plans must honor cycle/alias and per-actor copy rules rather than silently treating an interned shape descriptor as shared field storage.

### Operator and parser safety

`with` binds to an already-parsed receiver; `x.field with {a:1}` updates the field's value, while `(x with {a:1}).field` selects the newly built result. `with` is not valid by itself as a variable, field-update key or expression. This operator must not be confused with import/context-manager forms if those are introduced later. Nested `with` chains and compound expressions are depth- and budget-checked before recursion/allocations; no exponential type-shape cloning is permitted.

### Required positive and negative validation

**Positive (after guest lowering exists):** same-shape replacement, field addition, type change and contextual expected type; quoted labels; empty `with {}`; chained updates; nested fields explicitly updated; receiver and override effects exactly once/source-order; original unchanged; canonical shape interning and source-to-slot permutation; UTF-8 label distinction; return values; `infer` from result; Struct same-type checked reconstruction; explicit deep copy followed by update with independent actor recipient graphs.

**Negative:** duplicate update keys (including quoted-vs-bare), `=>` Map syntax, arbitrary expression right operand, missing separator/delimiter, open Record, absent Struct fields, incompatible Struct update type, class/actor resource, retained unique-owned field without copy/share capability, exclusive outstanding loan, move-after-use, absent required shape descriptor, invalid computed key, invalid/overflowed shape budget, runtime allocation failure without published destination, and source mutation/alias leaks.

Compiler and CI must separately report **syntax**, **scoped type/ownership preflight**, **native/Wasm guest execution**, **formatter round trip**, and **Java/LLVM/.NET/Forge/other parity**. No unexecuted case may be recorded as PASSED.