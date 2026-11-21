# Record versus Struct — optimized, separate data contracts (candidate v1)

**Status:** candidate contract stacked on `inline-collection-literals-v1`.
These are semantic and optimizer requirements, **not** evidence of completed
guest allocation, field access, ABI, or backend parity.

## Superseding literal grammar and implementation boundary

This proposal defines **layout**, not an independent literal grammar.
[atto-spec #133](https://github.com/atto-lang/atto-spec/pull/133) is the
newer, authoritative candidate for the quoted-key correction: only
identifier-colon `{field: value}` or parenthesized `(field=value)`
constructs a structural Record field. A quoted brace key constructs a Map
item with either `:` or `=>`; a dynamic expression key uses `=>`.
The literal `record["field"]` projects an **identifier-named** Record
field when statically proven; it is not a constructor grammar rule.
Mixed Map/Record entries reject and there is no implicit conversion.

Older compiler tests that accepted quoted brace fields as Records are
**historical behavior**, not current-grammar conformance. Re-run guest
evidence on exact source SHAs before asserting parity, layout savings, or
cross-backend behavior.

## Definitions

- **Closed Record:** structural value with a finite, statically known set of
  names and types. Fields are identifier-named: `{a:1, status_code:200}` and
  `(a=1, status_code=200)` construct Records. Quoted string keys in braces,
  whether separated by `:` or `=>`, construct Maps, not Records. A single
  brace literal cannot mix Map and Record entries.
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
  the executable Rust/browser frontend already recognizes a **restricted**
  `define struct Name as ... end` scalar-product form and lowers it through
  checked nominal classes, not a dedicated value-layout ABI. This document
  does not claim that the full Struct contract is implemented.
- **Map<K,V>:** a runtime key/value collection. String map keys may be
  arbitrary strings; keys may also be other explicitly hashable/equatable
  types. A dynamic key lookup needs the Map key semantics. Converting a
  Record or Struct to Map is explicit; no implicit shape erasure.

## Proposed examples (not verified guest syntax)

```atto
let Record response = {
    status_code: 200,
    ok: true
};
let Record response_paren = (ok=true, status_code=200);

let Map<string, string> headers = {
    "content-type": "application/json",
    "x-request-id": "123",
    'header name' => "value"
};

// Candidate Struct declaration: the parser/runtime do not yet support this.
define struct ResponseHeader as
    string content_type;
    int status_code;
end
```

`response.status_code` is a statically known Record field.
`response["status_code"]` is a **constant-name Record field projection**
that may lower to direct access when its closed shape is known; it does not
make `{"status_code": 200}` a Record initializer. Open-Record
presence-checking requires independent parser/type-checker proof.
`headers.get("content-type")` is a checked **Map lookup** with Hash/Eq and
explicit absence, not a constant Record offset. Dynamic `response[key]`
cannot silently become a Map lookup or bypass type/presence checks.

If a Struct must serialize a field as `"content-type"`, use a future
explicit external-name/serialization annotation. Do not encode arbitrary
quoted field names into the Struct's internal type identity.

## Layout and optimization invariants

1. **Two orderings for Records:** initializers evaluate exactly once in
   **source order**, but closed-Record *type identity and layout shape*
   use a canonical bytewise UTF-8 field-name ordering. Keep an explicit
   source-field-to-canonical-slot permutation when lowering. Never reorder
   effects to achieve a compact memory layout. No Unicode case folding or
   implicit normalization. Duplicate identifier Record fields reject.
   Quoted Map keys never become Record field aliases: a mixed
   `{name: 1, "name": 2}` rejects `E_LITERAL_KIND`, rather than being
   accepted as a Record or inferred Map.
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
- `{status_code:200, ok:true}` and `(ok=true, status_code=200)`
  canonicalize to the same closed Record shape independently of source order;
  a duplicate identifier field rejects `E_DUPLICATE`.
- `{"content-type":"x", "status_code":"200"}` is a typed Map with
  decoded string keys; `{"content-type":"x", 'other' => "y"}`
  may mix quoted Map delimiters. `{status_code:200, "content-type":"x"}`
  rejects `E_LITERAL_KIND`; dynamic Map key expressions never resolve
  through Record field offsets or bypass stable Hash/Eq.
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

## Implementation-stage evidence (2026-11-17)

The parser and contextual collection-type preflight are staged in
[`atto-source.rs#274`](https://github.com/atto-lang/atto-source.rs/pull/274);
the compiler-owned canonical logical slot planner is in
[`atto-source.rs#277`](https://github.com/atto-lang/atto-source.rs/pull/277).

A first **executable, restricted closed-scalar Record** profile now exists
in [`atto-source.rs#284`](https://github.com/atto-lang/atto-source.rs/pull/284).
It accepts direct local bindings with **1–8 statically typed, owned scalar**
int/bool/float/string fields. Historical guest receipts from before the
quoted-key correction are **not** proof that the revised grammar accepts
quoted brace fields as Records. The compiler checks the canonical type/slot
inventory, interns equivalent field-name/type sets, evaluates the field
initializers in original source order and passes those values to a generated
private constructor in canonical slot order.

The current guest implementation reuses the existing **checked nominal
class Wasm allocation and 8-byte field slot layout**, including constant
field offsets and typed loads. A direct local closed Record supports
`record.field` and `record["literal-field"]` (for known identifier field names) via
checked static field lookup. Missing names produce `E_NO_FIELD`.
Computed Map key lookup and dynamic Record reflection remain unsupported
until independently verified guest lowering. There is **no Map hash-lookup
fallback**. Unproven nested data/effectful field expressions, open Record
runtime fields, mutable borrowing of the generated storage, unsafe aliases,
actor transport, value-equality semantics and general Record/Struct
conversion remain unimplemented or checked by existing restrictive gates.

Existing `shape_lower` also supports **restricted declared**
`define struct` and `define record` scalar products through nominal
classes. This does not silently make those declared records structural,
nor does it prove packed/unboxed Struct values or target-independent ABI.

**Executed validation:** exact-head private [Actions run #44174750860](https://github.com/atto-poc/atto-nats-clone.atto/actions/runs/44174750860)
passed 61 Rust tests, strict Clippy, native and browser wasm32 compiler
release builds, 4 real guest executions and 5 no-artifact negatives, with
9 native/browser decisions and byte-identical admitted Wasm modules.
The carrier verified **37 individual source blobs by SHA**, not the
complete 723-blob source tree.

Static field slots are currently **not a memory-size or speed advantage
over the pre-existing class layout**. An independent packed Struct ABI,
full typed/effectful Record initialization, open-record shape checks,
cross-actor copying and measured performance comparisons remain future
work. No multi-backend parity is claimed.
