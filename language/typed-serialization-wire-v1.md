# Typed serialization and portable wire formats — candidate v1

**Status: DRAFT / NOT IMPLEMENTED as an AttoLang guest feature.** This is a semantic contract and an acceptance plan, not a claim of compiler, runtime, or cross-backend parity. It complements [inline collections #69](https://github.com/atto-lang/atto-spec/pull/69), [Record/Struct layouts #72](https://github.com/atto-lang/atto-spec/pull/72), and the host-only [tagged JSON reference #4](https://github.com/atto-lang/atto-serialization-and-validation/pull/4). Existing legacy Result/Option binary bytes must not be silently reinterpreted as this proposed envelope.

## API boundary (proposed, all failures typed)

```atto
let Result<bytes, EncodeError> a = json.encode(value);
let Result<User, DecodeError> b = json.decode<User>(a?);
let Result<bytes, EncodeError> c = messagepack.encode(value);
let Result<User, DecodeError> d = messagepack.decode<User>(c?);
let Result<bytes, EncodeError> e = atto_binary.encode<User>(value, schema_id);
let Result<User, DecodeError> f = atto_binary.decode<User>(e?, schema_id);
```

The namespace/method names above are **proposed API shapes, not verified syntax**. Every decoder requires a caller-supplied expected type/schema. A failed operation returns `Result<T,E>`; no decoder silently returns `Option` or panics on malformed/untrusted bytes. An existing `Result` is not automatically double-wrapped by a `trap` operation. Failure must not publish partially initialized objects.

### Format obligations

| Format | Wire representation | Status / constraint |
| --- | --- | --- |
| JSON (RFC 8259) | UTF-8 JSON text with strict typed schema | Candidate; reject duplicate object keys and nonfinite numbers |
| JSON Lines | UTF-8 JSON objects separated by LF, individually budgeted | Candidate streaming adapter; no implicit multiline JSON |
| MessagePack (official spec) | Standard MessagePack values, not renamed JSON bytes | Candidate; preserve binary-versus-text distinction; reject duplicate keys and unsupported extensions |
| Atto Binary v1 | Explicit framed, schema-bound MessagePack profile below | Candidate design only; not an alias for native object layouts |
| CBOR (RFC 8949) | Standard CBOR with an explicitly negotiated deterministic profile | Future adapter; reject duplicate semantic keys |
| Protocol Buffers | Schema-generated fields with stable field numbers | Future adapter; do not infer field numbers from memory offsets |
| Raw binary | Explicit format/endianness/alignment or an opaque byte stream | Not general object serialization; never `memcpy` an aggregate as a portable wire contract |

All cross-format equivalence assertions compare **typed logical values**, not byte equality between different formats. Byte-for-byte golden fixtures are mandatory **within** deterministic format profiles.

## Typed value model

1. Primitive values: `bool` is distinct from integer; integers have declared widths and signedness; overflow and unintended precision loss fail. JSON numbers do not become 64-bit floating point by default when decoding an integer schema. Floating-point NaN/Infinity are rejected by the JSON profile; other profiles must explicitly define treatment and canonicalization before claiming support. Strings are Unicode scalar text encoded as valid UTF-8, without invisible case-folding or normalization. Opaque `bytes` are distinct from text.
2. `Record`: a closed structural set of uniquely named fields, preserving exact decoded names (including `""`, `"content-type"`, and Unicode). Logical equality and deterministic serialization order are independent of initializer order. An open `Record` retains presence/type information; a decoder may not fabricate a missing field or assume a closed shape.
3. `Struct`: nominal schema identity, identifier-only internal fields, external serialization names only through explicit metadata. Field alias collisions, including alias versus unaliased field, fail at schema compile time and again at dynamic schema load. Host-memory offsets and field declaration order are **not** the portable wire layout.
4. `Map<string,V>`: JSON object names are exact string keys. `Map<K,V>` with non-string `K` uses an explicitly negotiated, typed **array of two-element entries** for JSON, not implicit `str(key)` conversion. The JSON schema must distinguish such an entry array from an ordinary List/Array. Duplicate decoded keys under Atto's `eq` + `hash` value semantics reject; no last-write-wins when decoding untrusted maps. MessagePack/CBOR native non-string-key maps are permitted only after a key codec and duplicate-equality profile has been specified and tested.
5. `List<T>` and `Array<T>` serialize as ordered sequences, but the schema determines variable versus fixed length and rejects inappropriate widths/lengths. `Tuple<T...>` is positional with exact arity, including `()` (zero entries), and is not an untyped list in the decoded type system. Distinguish omitted, `null`, empty, and zero values.
6. `Option<T>` and `Result<T,E>` need explicit, unambiguous variant discriminants. `None` and `Some(null)` must differ, as must `Ok(null)` and `Err(e)`. The existing tagged JSON reference is a **host prototype**, not the canonical serialization for all formats. A binary profile must assign exact discriminants with golden vectors **before** parity claims.
7. Enums, tagged sums, and Error subclasses encode stable, registered variant/type identifiers, not raw JVM/.NET/Rust class names. Unknown variants are errors unless a versioned forward-compatible sum explicitly declares an unknown case; constructors may not be selected by untrusted type names.

### Field-name/schema evolution

- Default decoder policy: **reject missing required fields, unknown fields, duplicate fields, wrong types, and unknown variants**. Schema opt-ins may permit unknown additive fields; they must never silently discard authorization, ownership, identity, or security-sensitive fields.
- Renames use explicit old-name aliases with a documented migration interval; both old and new names appearing in the same payload are a collision/error, not a precedence rule. Defaults for missing fields are schema-declared, pure, bounded and never host-effectful.
- Schema version, type identity, field/variant identifier and numeric width are pinned. Breaking changes require version negotiation, migration or new schema IDs. Open Records do not provide automatic schema compatibility.
- Encoders validate alias collisions **before** evaluating output and decoder field collisions **before** constructing typed values. Quoted Record fields are not Struct field aliases and cannot be normalized silently.
- Deterministic JSON sorts property names by **UTF-8 bytes** after field aliases are resolved, and retains sequence order; encoders must evaluate source expressions according to language semantics before serialization. Determinism is a profile choice and does not imply JSON RFC canonical signing without a separate full numeric/string specification.

## Explicit Atto Binary v1 framing candidate

This is a proposed *new* envelope for typed, schema-bound, already-validated MessagePack payloads. It is not the internal ABI, not a frozen replacement for existing `Result` wire vectors, and not a claim of zero-copy actor transfers.

| Offset | Length | Meaning |
| --- | --- | --- |
| 0 | 4 | Magic ASCII `ATB1` (`41 54 42 31` hex) |
| 4 | 1 | Format version = `01` |
| 5 | 1 | Feature flags = `00` in v1; all unknown bits reject |
| 6 | 2 | Reserved = `0000`, big-endian; nonzero reject |
| 8 | 32 | Opaque schema ID, supplied/validated from negotiated schema registry |
| 40 | 4 | Unsigned payload byte count, big-endian |
| 44 | N | Exactly N bytes of deterministic MessagePack v1 *typed payload* |

A decoder validates the minimum 44-byte header, supported version/flags, nonzero registered schema ID, exact caller-expected schema identity, bounded N, available bytes, and **no trailing bytes** before constructing any value. The schema registry must eventually standardize digest generation; until then different backends cannot claim automatically generated schema-ID parity. A hash/checksum is **not** an authentication mechanism; transport integrity and authentication are separately required. Compression/encryption are not implicit in this envelope. Signed or externally exposed wire formats need a separately ratified canonicalization/signing profile.

## Decode and ownership safety

- Per-input budgets must cover total bytes, nesting depth, total elements, field count, string/bytes lengths, integer magnitude, allocation count and CPU/work units. Defaults in a reference implementation can be 64 KiB, depth 32, 4096 total entries, but configurable limits must be enforced **during** parsing, not only after materialization. Check lengths/overflow before allocation; deny quadratic duplicate-key or adversarial hash behavior.
- Reject invalid UTF-8 (including unpaired surrogate scalars in JSON), invalid/overlong lengths, unexpected EOF, extra frames, nonfinite JSON numbers, unsupported MessagePack ext types, malicious CBOR tags, and undeclared schema polymorphism. Never instantiate arbitrary host classes, closures, actor references, handles, pointers, file descriptors, capabilities, or privileged error traces from untrusted payloads.
- Decoding produces fresh, owned, initialized values. It must not create mutable aliases with the input buffer, previously decoded messages, other actors or unexpected external object graphs. A buffer borrow/zero-copy view requires explicit immutable lifetime checking; the view may not outlive the backing input or cross actor/await boundaries without a proven pinned ownership arrangement.
- `copy!!` is an explicit deep graph-copy operation, `take!` an explicit ownership transfer, and immutable sharing requires separate transitive freeze/capability proof. Serialization itself is a **value snapshot** and never grants those powers. Cyclic object graphs are rejected in tree-only codecs; an optional future graph-ID profile must preserve sharing/cycles without cross-actor mutable aliasing.
- On any failure, release all temporary allocations, undo partially constructed values, and leave borrowed/consumed ownership exactly as promised by the API. Error text must be sanitized and bounded; diagnostics may report a safe field path and class of problem, never trusted input as executable code.
- Streaming decoders keep bounded, cancellable states and explicitly distinguish `need_more_data` from `invalid_data` and `end_of_stream`. A partial frame may not be published as a successful value; backpressure and actor mailbox credits still apply.

## Required acceptance matrix

Each fixture must record `source_sha`, `source_tree_sha`, backend, compiler/toolchain, mode (host reference / parser / checked compiler / guest runtime), format, input vector bytes, expected typed result or exact diagnostic, executed job URL, and status `PASSED` / `FAILED` / `UNSUPPORTED` / `NOT_EXECUTED`. Zero-step runners and parser-only results **must not** count as serialization support.

1. Positive: primitive boundaries; UTF-8 and quoted field labels; order-permuted closed Records; nominal Struct aliases; open Records with explicit checks; `List` / `Array` / `Tuple` arity; `Some(null)` versus `None` and `Ok` versus `Err`; fixed MessagePack and framed-binary byte vectors; decode-encode round trips.
2. Negative: duplicate JSON/MessagePack keys, alias versus raw field collision, unknown schema/field/variant, integer overflow, invalid UTF-8, nonfinite JSON numbers, untrusted type tags, truncated/oversize frames, trailing bytes, unsupported extensions, bomb nesting, mismatched tuple/array lengths, implicit non-string map key stringification, malformed entry pairs, duplicate typed map keys.
3. Ownership/actor: nested mutable graphs share **no storage** across independent decoded actor messages; `copy!!` deep isolation, `take!` sender invalidation and rollback, immutable borrows cannot escape, failed decode cleans up; no capability/pointer/closure deserialization.
4. Parity: run the **same golden corpus** on Rust/Wasm, Java/GraalVM, LLVM, .NET Native AOT, Forge and any additional applicable backend, with real guest executions and exact-source/tree evidence. Measure allocations and throughput separately; host-only reference execution is not guest support.

**Dependency order:** finish typed Record/Struct/Map checked access and allocation; implement schema/field-name validation and strict JSON reference; implement MessagePack reference and golden vectors; implement framed Atto Binary only after the schema registry and variant discriminants are approved; then guest execution, fuzz/adversarial tests, actor isolation and multi-backend parity.
