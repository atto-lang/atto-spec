# ADTs at actor and supervisor boundaries — semantic contract v1

Status: **proposed target contract / no full backend-parity claim** (2026-11-16).
This contract is independent of any particular memory layout, wire encoding, or
host runtime. It does not retroactively make user-defined sum/product ADTs,
generic `ActorMail<T>`, or typed supervisor notices executable in the existing
Rust/Wasm compiler. The concrete browser profile currently permits only
`ActorMail<int>` and `ActorMail<bool>`; scalar `Option<int>`,
`Result<int,string>` and `Option<Result<int,string>>` are executable outside
actor mailboxes. New support must be demonstrated with compiled guest execution.

## 1. Type identities and construction

- A sum ADT has a closed, nominal family identity, a finite set of distinct
  variants, a stable variant identity and declared payload shape. Product
  payloads have statically known field names/types; duplicate field names and
  duplicate variant declarations are errors. A different family's same-named
  variant is **not** the same value or type.
- Generic instantiations are distinct: `Result<int,string>` is not
  `Result<bool,string>`. No implicit conversion between `Option<T>`,
  `Result<T,E>`, `T`, structural matches, or actor capabilities.
- `None` is distinct from `Some(Err(e))`; `Ok(value)` is distinct from
  `Err(value)` even for identical underlying payloads. Variant tags must
  never be inferred from payload bit patterns (including zero, empty string
  and null-equivalent representations).
- Match evaluates the subject once. Every closed sum must have exhaustive
  matching or an explicit wildcard; duplicates and unreachable arms must
  be diagnosed. Guards do not establish exhaustiveness on their own.
  Binding/moving a payload must respect its owner and borrow capability.
- Structs, records and anonymous structural products may be *matched*
  structurally where the language permits; they do not silently become
  nominal sum variants. Map keys and arbitrary class getters cannot spoof
  a sum ADT's variant identity.

## 2. Two independent actor lanes

**DATA** is application messaging. `receives M` constrains admitted inbound
message types; `sends N` constrains outbound application message types;
`emits E` is the separate pipe output contract. A `sends` declaration does
not impose a single downstream receiver. Typed `ActorRef<M>` capability
checks and admission must precede any transfer of a message's ownership.
A failed `send` must not move, leak, partially freeze, or enqueue the value.

**CONTROL** is an out-of-band, supervisor-owned notification path. An actor
must not construct, write to, or impersonate this path by sending a value
whose fields happen to say `kind: "panic"` or `lane: "CONTROL"`.
The runtime supplies provenance *outside the decoded guest payload*. Do not
trust an in-band `issued_by_runtime` boolean or payload-defined
`supervisor_id`. A valid CONTROL notice is minted after checking the current
actor incarnation and supervisor authority. Its bounded identity includes:

- supervisor identity, actor identity, positive generation/incarnation;
- a unique event identity and optional accepted message/turn identity;
- a closed runtime failure classification (panic, uncaught raise/throw
  promoted to panic, explicit STOP, or protocol/lifecycle failure);
- bounded, sanitized error data and optional captured trace metadata.

Supervisor notices are typed and **sealed**: application ADTs are not
implicitly convertible to them. Actor-local panic is not catchable by the
actor and generates a priority CONTROL notice. `throw` first visits the nearest
`catch`; an uncaught throw becomes a raise; `raise` bypasses ordinary catch
and visits the nearest defer/recover; unhandled raise becomes panic. A
*handled* error or ordinary `Err(e)` **does not** automatically notify the
supervisor. Any guest-visible failure report is DATA, not CONTROL.

## 3. Boundary-safe ADT payloads

Before admission, check transitive `Sendable` (same-host actor transfer) or
`Serializable` (transport boundary) requirements, not just the outer ADT
constructor. A nested non-sendable payload makes the entire value
non-sendable. Refs, mutable aliases, active loans, open resources, private
symbols and sealed actor state do not gain permission by being hidden inside
`Some`, `Ok`, a product field or a collection. `rt take` moves ownership;
`rt share` publishes a deeply immutable graph only after transitive alias
validation; `rt copy` requires recursively copy-safe fields or a verified
manual copy implementation. No raw actor heap pointer crosses isolates.

A receiver validates the exact declared ADT family, generic specialization,
tag, arity, field set, payload types and canonical encoding **before** invoking
application code. Unknown tags, omitted/extra fields, duplicate keys, invalid
UTF-8, illegal integer width, oversized depth/bytes and mismatched schema
versions fail closed. Do not coerce bad payloads to `None` or `Err`. A malformed
envelope is a host protocol error with explicit accounting; it must not be
reported as if the guest intentionally raised an exception.

A versioned wire format may evolve independently per backend, but it must
preserve nominal type identities, all variant distinctions, and deterministic
round-trip results. Unknown-version envelopes fail closed unless a separately
negotiated compatibility decoder proves the mapping. Bound nested ADT depth
and total payload bytes *before* allocating actor-owned memory.

## 4. Failure, restart and settlement

Admission of an application message is linearizable. Each accepted message
eventually has **exactly one** disposition: completed, failed while running,
or explicitly discarded by supervised retirement. Cancellation, panic,
restart and shutdown do not create phantom acknowledgements or replay an
already accepted message without an explicit separately specified policy.
CONTROL dispatch has priority over beginning another DATA turn even when
the DATA mailbox is full.

A restart advances the actor incarnation. Late DATA, CONTROL notices,
callbacks, reply futures, and message-settlement receipts from the old
incarnation may be logged as stale but must not mutate or satisfy the new one.
A unary reply `Future<Result<T,E>>` and a streaming/multi-response reply
are different protocols; neither a late `Ok` nor `Err` may count as a
supervisor CONTROL notice. Actor references are capabilities, not raw ids.

## 5. Required conformance matrix

| Category | Positive proof | Rejection / adversarial proof |
|---|---|---|
| Sum variants | `Some(0)`, `None`, `Ok(0)`, `Err("")` kept distinct | wrong family, missing tag, duplicate tag |
| Nested ADTs | `Some(Ok(1))`, `Some(Err("x"))`, `None` round-trip distinctly | unexpected extra wrapper, wrong inner payload |
| Products | zero-field and multi-field immutable variants | duplicate, missing, extra or reordered fields where canonical |
| Generics | two nominally distinct specializations | substitute `Result<bool,E>` for `Result<int,E>` |
| Matching | exhaustive arms, wildcard, nested guards | duplicate arm, guard-only non-exhaustiveness |
| Ownership | owned `take`, proven deep `share`, checked `copy` | borrowed, mutably aliased, private symbol or resource nested in ADT |
| Admission | valid DATA with capacity and generation | full, stopped, stale generation, invalid transport |
| CONTROL | priority runtime-minted panic notice | forged guest DATA `Panic` and duplicate CONTROL |
| Exceptions | caught throw and `Err` stay local | uncaught throw/raise promoted to exactly one panic notice |
| Restarts | new generation accepts new DATA | old callbacks, replies or CONTROL mutate new actor |
| Fault recovery | bad encoding rejected before handler | unknown tag/version, too-large, depth, invalid UTF-8 |
| Portability | same semantic fixture on each backend | explicit `UNSUPPORTED`/not-executed instead of false success |

## 6. Adoption / evidence gates

1. **Parser/checker:** closed variant/type graphs, exhaustive matching,
   negative typing/ownership tests, explicit supported-profile gates.
2. **Codec and host:** versioned schemas, deterministic round trips,
   corruption/mutation tests, verified runtime-only CONTROL minting.
3. **Compiled guest:** actually instantiate actors and supervisors, send
   each variant, provoke panic/throw/raise, observe priority CONTROL,
   settled DATA, and old-generation rejection. Host-only model tests
   never substitute for this.
4. **Five+ backends:** require independent exact-source-tree guest
   execution, including Java, LLVM, .NET, Rust/Wasm and Forge. Record
   `PASS`, `FAIL`, `UNSUPPORTED` or `NOT_EXECUTED` per case and
   retain compiler/runtime SHA, toolchain, test commands and stepful CI.

The portable finite-model and mutant vectors in
`atto-platform-conformance` are a **reference gate**, not evidence of
production serialization, protected CONTROL authority or backend parity.


## 7. ATAD transport-profile candidate (bounded DATA-only slice)

The three current Java/LLVM/.NET host implementations are independently
reviewable candidate codecs for only \`Option<Result<int,string>>\`.
They are **not a universal ADT ABI** and not evidence of compiled actor guest
support, generic nominal sums, or supervisor-notice delivery.

Binary layout: four literal ASCII bytes \`ATAD\`, one byte version \`01\`,
one byte nominal family \`01\`, and one byte variant tag:

| Tag | Meaning | Tail |
|---|---|---|
| \`00\` | \`None\` | No bytes |
| \`01\` | \`Some(Ok(i64))\` | Exactly eight little-endian signed i64 bytes |
| \`02\` | \`Some(Err(string))\` | Two little-endian unsigned length bytes and exactly that many strict UTF-8 bytes |

The string byte length is 0–256; the total wire budget is at most 265 bytes.
Unknown version/family/tag, malformed or overlong UTF-8, UTF-8 surrogate,
trailing bytes, or length mismatch is a hard decode error. The format preserves
negative signed i64 bits, Unicode round trips, empty Err strings and all three
variant distinctions. There is no implicit conversion from \`Some(Err(e))\` to
\`None\`, no tag inference from a zero payload, and no extensible fallback.

Examples:

- \`None\`: \`41544144010100\`
- \`Some(Ok(42))\`: \`415441440101012a00000000000000\`
- \`Some(Err("é"))\`: \`415441440101020200c3a9\`

**Crucial authority separation:** these bytes are always application DATA.
There is no CONTROL wire tag or CONTROL constructor. Matching a forged
\`kind: Panic\` payload or sending an invalid tag is never sufficient to
authenticate a supervisor event. A real CONTROL notice must be constructed
through host-owned runtime authority with a checked actor generation and
accepted message identity on an independent priority lane.

Versioned executable byte and adversarial mutation cases live in
\`atto-platform-conformance/contracts/actor-adt-data-wire-v1.json\`.
The initial codec implementations and isolated host tests are in
\`oreslang-source.java\`, \`oreslang-source.llvm\`, and \`oreslang-source.net\`.
The Java and C++ tests can be locally executed on the reviewed Git source
blobs; .NET 10 and compiled AttoLang guest execution require funded runner
admission. No host-only test is to be promoted as compiler/backend parity.
