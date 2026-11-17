# Record versus Struct — optimized, separate data contracts (candidate v1)

**Status:** candidate contract stacked on `inline-collection-literals-v1`.
These are semantic and optimizer requirements, **not** evidence of completed
guest allocation, field access, ABI, or backend parity.

## Definitions

- **Closed Record:** structural value with a finite, statically known set of
  names and types. Fields may be identifiers or quoted UTF-8 strings, including
  punctuation or whitespace. `{a:1, "content-type":"json"}` is a Record.
  Its *type identity* is the canonical set of (field name, field type) pairs:
  **field order does not distinguish two otherwise identical closed Records**.
  A closed Record never requires a hash table for access to a known field.
- **Open Record:** the bare `Record` supertype; it admits distinct closed
  shapes, including `Array<Record>`. Field presence and value type are not
  inferred solely from the supertype. Open-Record access requires an explicit
  shape/presence/type proof, or a checked dynamic lookup API. Never assume
  missing fields have a default. Open Records may carry a runtime shape
  descriptor; implementation strategy is target-specific.
- **Struct:** a *nominal*, declared product/value type with an exact fixed
  schema. Its type identity includes a stable module-qualified declaration
  identity, not only a field set. A Struct field name is a valid identifier,
  not a quoted dynamic key. Declared fields and types are known at compile
  time. `define struct` examples here are **candidate syntax**; this
  contract does not assert that any current frontend parses Struct.
- **Map<K,V>:** a runtime key/value collection. String map keys may be
  arbitrary strings; keys may also be other explicitly hashable/equatable
  types. A dynamic key lookup needs the Map key semantics. Converting a
  Record or Struct to Map is explicit; no implicit shape erasure.

## Proposed examples (not verified guest syntax)

```atto
let Record headers = {
    "content-type": "application/json",
    "x-request-id": "123",
    status_code: 200
};

let Map<string, string> metadata = {
    "content-type" => "application/json",
    "header name" => "value"
};

// Candidate Struct declaration: the parser/runtime do not yet support this.
define struct ResponseHeader as
    string content_type;
    int status_code;
end
```

`headers.status_code` is a statically known field. The proposed
`headers["content-type"]` is a **constant-name Record field projection**
and can lower to direct access when the closed shape is known; this spelling
and its open-Record presence-check counterpart still need a dedicated
parser/type-checker contract. A dynamic `headers[key]` cannot silently
become a Map lookup, nor may it bypass type/presence checks.

If a Struct must serialize a field as `"content-type"`, use a future
explicit external-name/serialization annotation. Do not encode arbitrary
quoted field names into the Struct's internal type identity.

## Layout and optimization invariants

1. **Two orderings for Records:** initializers evaluate exactly once in
   **source order**, but closed-Record *type identity and layout shape*
   use a canonical bytewise UTF-8 field-name ordering. Keep an explicit
   source-field-to-canonical-slot permutation when lowering. Never reorder
   effects to achieve a compact memory layout. No Unicode case folding or
   implicit normalization; a bare `name` and quoted `"name"` are the same
   field name and duplicates reject.
2. **No map allocation for closed shapes:** compile-time-known Record fields
   may be stored in compact inline/stack/arena memory according to target
   ownership, escape and alignment rules; access becomes a constant slot or
   checked constant offset, not a per-access hash lookup. Intern equivalent
   shapes once per compilation unit; prevent duplicate descriptors for
   source-order permutations.
3. **Struct nominal identity and ABI:** each distinct declaration remains a
   distinct type, even if two Struct declarations have identical fields.
   Struct slots follow declaration order for this v1 ABI (no implicit field
   packing/reordering). Offset/alignment/endianness are target ABI decisions,
   and cross-target serialization must use an explicit wire format, not
   raw memory copies. A Struct has no dynamic field dictionary or hidden
   open-row extension.
4. **Open Record is not a Map:** a value erased to bare `Record` may need
   a descriptor plus shape-checked access, but it retains the underlying
   field values, types, and ownership. Open-record resolution can cache
   shape-specific offsets or specialize operations, without promising that
   every lookup is constant time. Field absence must not be masked.
5. **Type safety:** closed-Record compatibility is field-set-and-type based,
   **not source-order based**. For mutable records, do not add unsafe width
   subtyping: this candidate permits exact closed shapes and explicit upcast
   to open Record, not automatic extra-field writes through a narrower view.
   Struct is nominal; Record-to-Struct conversion requires an explicit,
   checked constructor/copy/move (never a no-cost unchecked transmute).
6. **AOT resource safety:** size/field count/nesting and allocation are
   bounded. A type with unresolved `Bottom`, dynamic `OpenRecord` field
   storage or unverified layout must not receive a fabricated static byte
   offset. Compiler may emit a deferred/unsupported plan, but not code.
   Compile-time shape caching is bounded, deterministic and checked for
   overflow; no unbounded recursion or attacker-controlled hash collision
   path as part of static field resolution.
7. **Ownership and actors:** a Record/Struct holding mutable references
   remains subject to the same borrow and actor-isolation rules.
   `copy!!` must preserve independent mutable graphs; `take!` consumes
   ownership; `share!` is explicitly capability checked. Reusing an
   interned *shape descriptor* does not share mutable *field data*.
   No `await`/select/actor send proof can be inferred from layout alone.

## Required conformance and performance evidence

- Closed Records `{a:1,b:true}` and `{b:true,a:1}` have identical static
  structural type and a single canonical layout shape; their evaluation
  order stays source-ordered.
- `{"content-type":"x", status_code:200}` permits the quoted label in
  Record and rejects duplicate `status_code` or `"status_code"`.
  Two distinct label spellings that differ in UTF-8 bytes do not collide.
- A nominal Struct `S1` is distinct from `S2` despite matching fields,
  and a Struct's declaration order is retained in its stable layout plan.
- A closed Record known field resolves directly to a static slot; an
  unknown field is rejected. An open Record requires a checked presence/type
  path; a Map uses dynamic key semantics. A collection of open Records
  maintains per-element shape metadata.
- Golden shape-interning tests across field permutations, nested records,
  Unicode labels, many shapes and budget overflow. Physical offset/layout
  tests must be parameterized by a real target ABI and measured; do not
  claim fixed byte sizes or perf gains based solely on parser tests.
- Execute native/Wasm guest positive/negative tests, GC/arena/ownership
  adversarial tests, AOT artifact checks and cross-backend parity with
  exact SHA evidence. **Host-only optimizer-plan tests are not proof of
  executable runtime layout or speedups.**

## Implementation-stage evidence

The Rust browser frontend on `atto-source.rs#274` currently has syntax and
contextual literal types, but guest collection values still fail closed with
`E_UNSUPPORTED`. Optimized closed Record layout and Struct runtime support
are staged objectives, not available production features. This contract
does not change those admission gates.
