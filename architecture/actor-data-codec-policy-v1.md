# Actor DATA codec policy v1 — grammar-neutral first slice

Status: DESIGN_ONLY_NOT_EXECUTED. Supplements actor-data-codec-selection-v1.md on the parent draft; not a new guest grammar or an ABI revision.

## Source syntax
Existing source declarations, import resolution, typed calls and ownership semantics remain unchanged. No new `serialization:` actor/supervisor clause, `use serialization` directive, generic syntax variant, or special send statement is admitted by this change. Those illustrative spellings are NOT language syntax. Configuration is trusted launch/endpoint-registration metadata resolved before first send; the specific public library API will be reviewed against the existing compiler grammar before introduction. Codec names below are metadata values, not guest identifiers or keywords.

Current source contracts: [explicit callable returns](../language/explicit-callable-return-types-v1.md), [implicit argument borrowing](../language/implicit-argument-borrow-v1.md), [namespace/module imports](../language/namespaced-exports-v1.md), [Atto Theater](atto-theater-v1.md). Use canonical .atto, snake_case, concrete named-callable return annotations with -> or :, explicit return in brace bodies. Do not copy migration-era .ores signatures using => or bare borrow as proof of accepted grammar. Use the existing ownership profile; no implicit transfer or escaping loan.

## Registry and selection
For the initial host policy slice use exact case-sensitive configuration labels messagepack, protobuf, cbor, flatbuffers. These are NOT on-wire numeric IDs and not a promise of support. No alias, fallback, negotiation from incoming bytes, or automatic transcoding. Explicit requested codec (or default messagepack) must be in supervisor allowed mask AND target verified-supported mask. Endpoint binds a single selected codec, positive wire version, schema identifier, and shape hash from trusted registration; compare incoming fields to this immutable binding, never dispatch based on incoming fields. Legacy MessagePack versions and envelopes are unchanged; new profiles require separately ratified wire IDs. FlatBuffers requires verified immutable backing and is unsupported until proof exists.

Sendable remains a compiler proof of recursively data-only values. Format-specific Serializable plus trusted shape/schema and permission is required for serialized DATA. Do NOT serialize ActorRef or capability-bearing objects in this initial slice (existing serde_boundary_v1 forbids them). Future explicit logical-reference resolution requires separate spec approval; no authority from data. CONTROL stays sealed, never configurable via DATA codecs.

An initial policy helper may validate selection and reject mismatched labels/version/schema/shape without touching payload. It is not authorization, decoder, mailbox admission or support proof. Runtime must authenticate peers, validate generation and capability, reserve quotas, enforce bounded decode, recheck generation and atomically enqueue with exactly-once cleanup. Reject unsupported versions/shapes before decode; no untrusted data can construct a trusted binding. Do not publish a guest API until syntax, compile-fail and guest tests pass.

## Release gates
Pin exact parent spec/contract, preserve MessagePack existing behavior, compare host policy tests against shared vectors and actual .atto guests separately. No claim of grammar parity from a host model. Independent security review and actual target evidence required.
