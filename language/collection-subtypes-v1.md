# Behavior-only collection subtypes v1 (candidate)

Owner-approved direction: user-defined Map and Record types with methods, no required wrapper or per-instance dispatch overhead. This candidate must be reconciled with aggregate constructor #246, record grammar #303/#306, namespace completion #311, copy policy #300, and existing ownership rules. It does not claim any implementation.

## Surface

Proposed declaration forms (grammar integration required):

```atto
define class Scores extends Map<String, int> as
    passed(int score): bool {
        return score >= 60;
    }
end

define record Person extends Record as
    String name;
    int age;
    is_adult(): bool {
        return self.age >= 18;
    }
end

define record Employee extends Person as
    String department;
end
```

External `declare ...` / `mtd (T)` definitions follow closed namespace completion rules, not unrestricted extension methods. Generic parent substitution is static; detect cycles, missing/extra type arguments, duplicate fields and methods, incompatible inherited members and uncompleted declarations. Sealed ancestors cannot be extended except for the explicitly authorized built-in public collection surface.

## Phase 1 admission

* Map descendants add methods only; reject added instance fields, overrides of builtin storage/mutation/drop/hash operations, custom invariant claims, and dynamic dispatch requirements. Record descendants may add statically named fields without shadowing inherited fields, preserving existing closed-row checking. No multiple concrete bases.
* A nominal type ID is distinct from its base and unrelated siblings even when representation matches. A type alias is not a new nominal identity. Method lookup resolves against static receiver identity; plain maps/records never gain subtype methods implicitly. No name-string runtime dispatch. Receiver capabilities, effects, visibility, and lifetimes are checked exactly as for ordinary methods.
* No extra instance allocation or vtable is required merely by adding behavior. This is an incremental representation requirement, not a guarantee that a map itself needs no allocation. Record layout uses the same backend-specific closed-row ABI; inherited logical field order is preserved. Do not bitcast a larger Record to a smaller owned Record: use a checked borrowed projection or an explicit owned conversion under existing rules.
* Contextual literals can construct the expected nominal type only after validating all underlying fields/entries and ownership, with no coercion from an already constructed unrelated value. Use existing canonical literal grammar; do not introduce a competing separator or change Pair/Map disambiguation. Explicit construction from base is a separately checked operation, not an implicit downcast. No unchecked reconstruction from bytes.
* Base views are subject to normal move/borrow rules; mutable Map views require invariant key/value parameters and exclusive authority. Structural Record width views are read-only unless existing field-sensitive mutable rules prove safety. A base view may not manufacture subtype identity on return. No extra aliases or lifetime extension. No custom invariants in phase 1: later invariant-bearing descendants must close every mutation path (including indexing, aliases, iterator loans, deserialization and base views) before being admitted.
* Methods are not serialized fields or structural shape members. Nominal casts and typed equality retain existing nominal/structural rules; no new cross-nominal implicit coercions. Deserialization must explicitly name and validate the target subtype.
* copy! duplicates immediate slots and shares nested identities only under symmetric transitive read-only authority, preserving the nominal type; copy!! follows checked deep copy rules. Move retains identity. Generic transformation/filter results default to base collection unless explicitly typed preservation is proven. No implicit COW or ownership weakening.
* No new automatic Sendable/Serializable derivation beyond existing checked contracts.

## Conformance acceptance matrix

Each entry is a target behavior, NOT_EXECUTED. Use real compiled guest output or intended semantic rejection without artifact. Parser-only or host-only results are distinct.

| ID | Scenario | Expected |
|---|---|---|
| M01 | Scores custom method and inherited lookup on contextual Map literal | correct guest values |
| M02 | generic StringMap<V> then Scores extends StringMap<int> | correct substitution |
| M03 | plain Map calling Scores-only method | reject |
| M04 | implicit base-to-Scores or sibling-to-Scores assignment | reject |
| M05 | exclusive base Map loan then subtype use after loan ends | accept, shared alias mutation rejected |
| M06 | override put/hash/storage or add Map instance field | reject |
| M07 | mutable Map key/value variance | reject |
| R01 | Person field and custom method | correct guest values |
| R02 | Employee fields, inherited method and borrowed Person/structural view | correct guest values |
| R03 | repeated inherited field or wrong literal field type | reject |
| R04 | width-changing mutable structural view or escaping borrowed projection | reject unless existing checked rules prove it |
| R05 | extra method does not appear as serialized field | same data schema |
| T01 | inheritance cycle, unknown parent, bad generic arity | reject |
| T02 | external method within completed owning namespace | accept |
| T03 | external method in unrelated namespace or incomplete declaration | reject |
| O01 | move and copy!! preserve subtype, moved source use rejected | correct result / rejection |
| O02 | copy! retained nested value cannot mutate through any alias; root slot replacement safe | correct result / rejection |
| O03 | filter or map_values without preservation contract | base return type |
| A01 | behavior-only subtype representation/allocation compared with base | no mandatory extra allocation or storage |
| A02 | unsupported target dynamic Map | explicit capability diagnostic, no artifact |

Test Java JVM and Native Image, LLVM native, independent Wasm browser/Node, Forge JIT/AOT, .NET NativeAOT, Rust, Cranelift and JS; self-hosted Atto, HDL and realtime report supported profiles separately (static Records and dynamic Maps are distinct capabilities). Record exact source and compiler head/tree, actual job steps, guest output and negative diagnostics. Never promote skipped, queued, source-free or metadata checks to guest parity.

Phase 2: other built-in collection types, invariant-bearing subtypes, and optional extension methods only after phase 1 soundness and parity.
