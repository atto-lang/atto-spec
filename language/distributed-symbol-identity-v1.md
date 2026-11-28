# Distributed symbol identity v1

**Status: owner-directed target, implementation and wire admission pending.** This refines chapters 02 and 22; it does not grant new tenant access or silently reinterpret existing serialized symbols.

## Identity and resolution

- Every resolved `#` symbol has a durable, immutable UUID. Baseline UUIDv4 uses 122 CSPRNG-generated random bits, version 4 and RFC variant bits. Allocate once at declaration/registry publication, never at each literal evaluation, build or process startup.
- Package/namespace authority plus declaration key resolves the spelling to a UUID through a persistent, versioned manifest. Independently built binaries consuming the same manifest resolve the same declaration to the same UUID. Identical spelling in different namespaces does not imply equality. A private symbol may have a UUID without being accessible from another tenant. Core declarations use one pinned distributed manifest.
- Aliases/renames preserve identity only through explicit authoritative manifest migration; deleted IDs are never reassigned. A change of identity is a deliberate new declaration. Do not derive identity from display spelling, host pointer, process ID, build timestamp or local table index. Missing manifest entries in reproducible builds are errors, not implicit UUID creation.
- A registry MUST reject conflicting bindings (same UUID to distinct declarations or same declaration to different UUIDs), without replacing a published binding. A UUID is not proof of authority, a capability, or an authentication token. Imports and received declarations require existing scope/permission checks.

## Shared memory and local representation

Use immutable interned entries in an admitted shared region on a host, with one owning publication authority and compatible readers. An entry contains the UUID and optionally immutable metadata; process-local handles may be compact indices, offsets or pointers. Never require identical virtual addresses. A handle's region and generation must be checked before access; indices from unrelated registries are not comparable. A local equality fast path is permitted only for live handles in the same canonical registry/generation; otherwise compare full UUIDs. String values remain distinct from Symbol. Hashing must be consistent with UUID equality within a map; hash codes are not identity.

Publication is atomic: concurrent resolution of an identical manifest binding returns one canonical entry; failed publication exposes no partially initialized record. Persistent catalog updates are crash-consistent and conflict checked before publication. Immutable snapshots may be memory mapped by separate OS processes; reclamation waits for all physical readers and leases. Bound catalog count/bytes and reject admission when exhausted without silently evicting live identities. Hot reload and process restart preserve UUIDs. Where OS shared memory is unavailable (e.g. browser workers without admitted shared memory or embedded target), use equivalent local immutable interning plus the same UUID semantics; report the storage limitation independently.

## Portable wire profile (candidate)

The symbol identity payload is exactly 16 bytes, UUID canonical octet order (not platform-specific GUID field ordering). For example UUID `00112233-4455-4677-8899-aabbccddeeff` encodes as `00112233445546778899aabbccddeeff`. This is a payload inside a separately versioned typed envelope, not a new tag assignment for any existing codec. No pointers, offsets, native struct padding or display text are transmitted as identity. Reject wrong lengths, invalid variant/version, and unresolved or unauthorized identities with typed failure and no registry mutation; discovery/import of remote declarations is a separate authorized action. Older name-based wire profiles require explicit negotiation and authoritative translation; never guess identity by spelling.

## Required evidence

Use matching manifest fixtures across independent builds, processes, machines and backends. Require positive same-declaration UUID equality and match/switch behavior; negative same-spelling different namespaces, string versus symbol, stale handles, wrong registry, denied namespace, malformed wire and unknown UUID; concurrent single-publication, catalog capacity, crash/restart, hot reload, alias/rename/tombstone and cross-endian vectors. Measure fast-path equality separately from lookup/serialization. No performance claim without measurements.

All compiler roles (Java/GraalVM, LLVM, Forge, .NET, independent Wasm, Rust, Cranelift, JS and HDL where applicable) remain NOT_EXECUTED for this contract. Host models, fixture integrity, and source-only checks do not certify compiler or guest execution. Hardware targets without a distributed runtime must explicitly report unsupported transport rather than invent a different equality rule.

A larger identity format is a separately negotiated future profile, not an alternative implicit representation of v1. Standard UUIDs are 128 bits, not 256 bits.

### Shared target vectors

[Machine-readable UUID and registry cases](../conformance/distributed-symbol-identity-v1.json) (blob `50dad96248eb8e08cf6780bf8d5512ac933f4707`) define four positive payload encodings, seven malformed payloads and seven registry/handle cases. The payload-only classifier checks byte length, then UUID version, then variant; successful payload validation alone never grants registry admission. The all-zero/random-bit extrema are format tests, not acceptable evidence of CSPRNG generation. A swapped GUID-field-order vector catches the illustrated endian mistake, but implementations must not assume every byte-order mistake can be detected by the version/variant bits. All eleven profiles remain NOT_EXECUTED; the registry cases still require concrete manifest and runtime fixtures. A source-free consistency check of the corpus is not guest conformance.

## Qualified symbol literals (owner decision, 2026-11-26)

Unquoted literals admit contiguous dot-separated identifier segments: `#xyz.foo`, `#order.payment.pending`, and `#ready`. Use the existing symbol identifier-segment grammar, without whitespace or empty segments. The complete path is one Symbol literal, not member access or a string. An adjacent period followed by a valid segment extends the literal; use parentheses for member access, e.g. `(#xyz.foo).member` (subject to member typing). Reject malformed empty segments such as `#xyz..foo` and a trailing dot in literal position. Formatter preserves the qualified spelling. Delimited-symbol and Unicode rules remain governed by canonical grammar.

Resolve the complete path under authoritative package/namespace authority; never intern only the leaf. `#xyz.foo` and `#abc.foo` are distinct declarations by default; `#xyz.foo` is distinct from `"xyz.foo"`. Same spelling under distinct authorities is distinct unless an explicit authorized identity alias applies. Namespace text is neither permission nor UUID identity. Wire remains the resolved 16-octet UUID. Preserve existing unqualified literals and negotiated wire profiles.

Guest gates: single/multi-segment parse and formatter round-trip; match/switch over full paths; same leaf/different prefix; same path/different authority; aliases; denied namespace; empty segments; parenthesized member access; cross-process transport and restore of the resolved UUID. All remain NOT_EXECUTED. This extends the grammar audit in PR #152 without replacing its unrelated changes.
