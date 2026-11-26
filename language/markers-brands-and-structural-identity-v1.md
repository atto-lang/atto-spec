# Markers, brands and structural identity v1

**PROPOSED — owner-approved direction, detailed grammar and backend implementation not yet ratified.** No compiler, guest execution, ABI or performance certification. Extends [structural tilde](structural-tilde-v1.md), [member witnesses](structural-member-witness-v1.md) and [anonymous shapes](anonymous-structural-shapes-v1.md); preserves [value versus instance identity](../proposals/equality-value-vs-identity.md) and [object storage](primitive-object-storage-java-llvm-v1.md).

## Separate identities

- Marker: nominal declaration identity for an opt-in semantic classification; multiple unrelated types may attach a marker. User markers are not compiler proofs of Sendable, Copyable, immutability, effects or permissions.
- Brand: nominal declaration identity with a restricted attachment and construction policy. Identical payloads/shapes do not imply the same brand.
- TypeId: canonical declared nominal type (including instantiated generic arguments); ShapeId: canonical accessible structural member contract (including typed effects and ownership). Shape identity alone does not encode brand/marker obligations; a full structural constraint key includes those obligations.
- ObjectId: opaque logical instance identity for identity-bearing classes; distinct live allocations differ even if values are equal. Aliases preserve it, copies create fresh identities for copied objects; move/relocation preserves it. No address identity, lifetime extension or dereference authority. Ordinary structs/records/value classes have no instance ID. Actor identity remains independently incarnation-fenced.

## Candidate grammar (illustrative, not currently executable)

```atto
define pub marker #entity;
define pub marker #auditable;
define pub brand #user_id;
define pub brand #order_id;

define struct UserId
    with brand #user_id
as
    pub int value;
end

define struct OrderId
    with brand #order_id
as
    pub int value;
end

define class Customer
    with marker #entity, #auditable
as
    pub int id;
    pub string name;
end

fnc get_id(~{id: int} with marker #entity obj): int {
    return obj.id;
}

fnc read_user(~UserId id): int {
    return id.value;
}

fnc read_value(structural {value: int} obj): int {
    return obj.value;
}
```

```ebnf
tag_decl       = "define", ["pub"], ("marker" | "brand"), symbol_ref, ";" ;
tag_clause     = "with", ("marker" | "brand"), tag_ref, {",", tag_ref} ;
tag_ref        = symbol_ref | qualified_tag_ref ;
tag_constraint = structural_type, {tag_clause} ;
```

Tag declarations use # spelling but reside in a typed declaration namespace; ordinary Symbol values are never proof of marker or brand membership. Qualified references use the existing module resolution rules; exact qualification syntax follows the module grammar. Multiple clauses compose conjunctively. Reject duplicates, unresolved/wrong-kind tags and conflicting declarations. Proposed generic constraint: `T: ~{value: int} with brand #user_id` or `T with marker #entity`. Keep marker and brand contextual. No new overload operator.

## Structural admission

`structural T` and `~T` produce identical checked witness AST/IR. For a named target, require every accessible member plus the target's effective declared marker and brand obligations. Additional accessible source members and tags are allowed for a read-only projection; source nominal identity stays intact. A different nominal source may satisfy a branded view only with an independently authorized matching brand. A missing marker or brand fails even if the field layout is identical. A bare anonymous shape has no implicit brand/marker requirement and may read branded data without manufacturing branded values. Structural views expose only evidence in their contract; an erased brand cannot be restored by a cast, generic inference, structural reconstruction or copying the payload. Preserve exact concrete type when a generic retains it. Do not reinterpret source pointers using target offsets.

Existing field and method witness rules, effects, visibility, ownership, exclusive access, lifetime, union and map presence checks remain mandatory. A marker does not grant permissions or access to sealed actor state. Read-only structural admission is a loan; do not silently copy, allocate, move, retain or extend it. An explicit independently checked scalar snapshot optimization is allowed only under the existing narrow ABI rules. No implicit nominal or branded cast.

## Attachment, construction and mutation

Package/module/declaration identity, not spelling, governs tag resolution. Import aliases preserve identity; unrelated packages declaring the same spelling are distinct. A public brand is publicly referenceable, not publicly attachable. Default attachment authority belongs to the defining module. Cross-module attachment requires an explicit future delegation contract; until then reject it. Public ordinary markers may be attached by other modules; private markers are inaccessible outside their visibility. Built-in compiler-verified markers cannot be spoofed by a same-named user declaration.

Brand attachment authorizes a type to carry the brand; it does not prove every payload invariant. Branded construction must use permitted constructors/factories; invariant-bearing brands require private or checked construction and mutation. The public field example above is a domain distinction, not an invariant-validation claim. No raw cast, structural copy-and-update, unchecked FFI, reflection, deserialization or tag string may mint a brand. A copy of an existing branded value preserves the brand only if its checked copy contract preserves validity. Inherited markers/brands follow explicit validated declaration contracts; v1 rejects unproved brand inheritance, dropping required inherited tags or incompatible overrides. No multiple-brand implication unless explicitly declared and proved.

## Matching and metadata

```atto
match candidate over
    on is ~UserId as const id -> read_user(id),
    on is ~OrderId as const id -> read_value(id),
    on is ~{value: int} as const v -> read_value(v),
    on _ -> 0
end
```

A type test checks shape AND required tags; value patterns retain their distinct AST and cannot invent brand proof. First match wins; successful narrowing is arm-scoped and subject evaluated once. A runtime test uses compiler-produced trusted reified metadata, or fails closed if that ABI is absent. A shape-only erased view is not runtime brand evidence. No reflection fallback.

Candidate core opaque APIs: Type.id_of<T>(), Type.shape_of<T>(), Type.brands_of<T>(), Type.markers_of<T>(), Object.id_of(obj). API names/types remain subject to core review. Type/brand/marker identities derive from compiler/linker-resolved package identity plus declaration identity; aliases preserve them. Stable across a compatible rebuild only under an explicit package identity/version policy; never hash display names alone. Canonical shape keys normalize field order, generic substitutions and member contracts; equality checks canonical descriptors, not unchecked hashes. Hash collisions cannot unify distinct identities. IDs are not authority, globally persistent identifiers or portable serialization tokens by default.

Object identity is scoped to a runtime identity domain and survives movement. No slot reuse may equate a stale object ID to a new object; use checked incarnation/generation or an equivalent scheme, fail on exhaustion rather than wrap unsafely. ObjectId does not keep an object alive. Do not make object ID acquisition a prerequisite for ordinary allocation. Current `is` identity and `eq` value comparison remain unchanged.

## Tilde disambiguation (candidate reconciliation)

In type annotations and structural patterns, `~` is structural. In ordinary value expressions, `~int_value` is integer bitwise complement. Explicit projected argument `structural obj` is unambiguous; short `~obj` is admitted only in a checked call-argument projection context with a known structural formal and a noninteger operand. If a call has competing viable interpretations, diagnose ambiguity and require `structural obj` or an explicitly parenthesized integer complement. No whitespace-dependent rules, runtime overload selection or retry after a failed brand/visibility/ownership check. Evaluate receiver and arguments once in source order. Until common frontend resolution supports this rule, reject ambiguous shorthand before codegen. Reconcile both existing tilde documents before ratification; this proposal does not silently replace their current behavior.

## AOT, wire and optimization

Static tags are compiler metadata; no per-value bytes or allocations required. Statically proven branded structs retain their underlying payload layout; dynamic tests may need a bounded reified descriptor in a separately admitted ABI. Do not add universal object headers or claim process-zero-GC. Sealed full guest AOT uses finite linked descriptor tables, no runtime compiler or arbitrary reflection. Hot loading authenticates descriptors, checks compatibility including tag authority/invariants, fences generations, and invalidates affected caches. Wire decoding validates schema and construction policy; never trust tag names or foreign metadata. No actor or tenant permission granted by ID or tag; Sendable and Serializable require independent proofs.

## Acceptance and rollout

Use [target vectors](../conformance/markers-brands-structural-identity-v1.json). Each backend independently needs parser/formatter parity, checked type identity and shape witnesses, negative-before-IR evidence, compiled positive guest fixtures, runtime ID/brand tests if admitted, exact commit/fixture SHA and artifact/test execution. Cover Java, LLVM, Forge, Wasm, .NET, Rust, Cranelift, JS, HDL, self-hosted Atto and realtime profiles where applicable; unsupported features must fail closed with an explicit diagnostic. HDL may support static tags without runtime object identity. Static checks and unchanged payload size are optimization targets, not measurements. No backend is certified by this proposal.
