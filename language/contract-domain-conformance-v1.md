# Contract domains and conformance admission v1

**PROPOSED reconciliation; compiler/guest evidence NOT_EXECUTED.** This is an additive review target, not a replacement grammar or a claim that all backends implement contracts.

## Existing authority and overlap

- [Namespaced exports](namespaced-exports-v1.md): source namespace identity, qualified module visibility and canonical source-unit provenance.
- [Receiver conformance](implements-receiver-conformance-v1.md): nominal actor/class/struct `implements` interface/trait.
- [Structural member witnesses](structural-member-witness-v1.md): explicit `~` / `structural` projection, not a nominal implementation.
- [Design by contract](design-by-contract-v1.md): callable preconditions/postconditions and class/actor invariants; inherited behavioral variance remains a separate proposal.
- Java [#1536](https://github.com/atto-lang/atto-source.java/pull/1536) stages namespace source-set checks; [#1586](https://github.com/atto-lang/atto-source.java/pull/1586) stages actor witnesses. Both are stacked; neither PR description proves current-head execution.
- Java [#908](https://github.com/atto-lang/atto-source.java/pull/908), [#1061](https://github.com/atto-lang/atto-source.java/pull/1061) and [#1116](https://github.com/atto-lang/atto-source.java/pull/1116) overlap on static/module contracts. #908 permits inherited static methods and includes storage; #1061/#1116 deliberately require local static functions and reject static fields. Reconcile before merging; the narrower local-callable-only slice is the proposed portable admission floor, not a decision to discard wider work.

## Domain table

| Domain | Target owner | Admission | Witness scope |
| --- | --- | --- | --- |
| Namespace | Canonical package + source namespace | namespace contract header (staged spelling in #1536) | Complete manifest-selected linked source set |
| Module | Nominal module declaration | `conforms` module contract | Accessible members of that module |
| Interface/trait | Nominal class/actor/struct | `implements` | Unique compatible instance methods and declared requirements |
| Static class contract | Nominal class | `implements static` | Public local static callables in initial portable slice |
| Structural projection | Explicit `~T` / `structural T` | Checked witness | All required accessible members; no implicit nominal membership |
| Behavioral contract | Callable/class/actor state | Existing requires/ensures/invariant proposal | Checked entry, normal return and state publication boundaries |

Do not add another conformance keyword. Do not confuse namespace labels with globally unique package identities, a namespace with a module object, a type marker with a structural shape, or a static callable with an instance receiver.

## Required compiler pipeline

1. Resolve canonical package identity, source unit, owner path, declaration kind and generic specialization before checking slots. Aliases are bindings, not identity changes. A namespace obligation may only use the complete explicitly selected source set from the verified package graph. A partial file set, duplicate owner, conflicting declaration/definition, missing required unit or unresolved ancestry must not certify it.
2. Construct a typed obligation graph. Reject cycles and cross-domain inheritance unless an independently specified rule permits it. Resolve inherited obligations transitively; diamond duplicates collapse only if the same canonical declaration and specialization are proven. Conflicting requirements/defaults require a checked explicit resolution.
3. Validate every obligation, including unused concrete definitions before tree shaking. For module/namespace members require effective export and member visibility; for instance methods resolve the exact nominal receiver. Match full arity, permitted overload identity, parameter labels/types, generic bounds, return type, borrow/ownership modes, receiver mutability and declared effects. A public member in an inaccessible module is not externally accessible. Unknown proofs are rejection, never success.
4. An unqualified readable field requirement grants no write authority. Explicit binding capabilities must match existing contract rules; writable types are invariant. A static method, constructor, free function or unrelated receiver cannot discharge an instance obligation. An interface or empty marker remains nominal even if its required slot set is empty.
5. Emit immutable compiler-owned witnesses only after all obligations pass. Store origin identities, effective visibility, resolved dispatch and specialization, ownership and effect facts. No name-only witness, reflection fallback, implicit cast, or new runtime authority. An unsupported dispatch/layout/profile rejects before emitting guest artifacts.
6. The proposed behavioral override rule is conservative: an override must prove its preconditions are no stronger and its postconditions/invariants no weaker. Exact equality or a sound implication proof suffices; unknown implication fails closed in a profile claiming behavioral substitutability. Do not silently erase predicates or turn unchecked assumptions into optimizer facts. This extends, rather than declares implemented, design-by-contract v1.
7. Canonical ABI fingerprints cover the contract domain, full owner identity, required slot signatures, effects, visibility, binding capabilities, transitive ancestry and declared behavioral obligations. Rebuild affected importers/namespace peers on changes; keep import initialization order separate from semantic invalidation edges. Failed builds cannot reuse a stale successful witness or publish a partial artifact.

## Acceptance and evidence

The companion host reference tests exercise conservative domain and slot admission; they are not parser, linker, guest, or AOT evidence. Required production fixtures must be complete source sets, not fragments. For each of java, llvm, net, wasm, forge, rs, js, cranelift, hdl, atto and realtime report positive compile+dispatch, negative compile+diagnostic/no artifact, incremental invalidation and applicable full-AOT/profile tests. Unsupported profiles must report an explicit rejection; that is not feature parity. Bind each receipt to exact compiler commit/tree, source-set digest, toolchain, artifact or no-artifact observation and nonzero executed test steps. Do not claim parity from the host-only oracle, filenames or CI admission alone.

Every backend is NOT_EXECUTED for this new combined contract. Existing independently verified narrower slices retain their own evidence.

## Nominal method spelling clarification

For class, actor, struct, interface and trait instance methods, bare names, compatibility `fnc` and explicit contextual `mtd` denote the same method obligation/implementation. Default formatting removes instance `fnc`; explicit `mtd` is preserved. Free, module, namespace and static contract functions keep `fnc`; out-of-line receiver `mtd` remains explicit. The only explicit instance method declaration introducer is `mtd`. The obsolete `method name(...)` form is a syntax error, not a compatibility alias or formatter rewrite. Ordinary identifiers `method()` and `mtd()` are not declaration prefixes; `mtd method()` is a valid explicitly marked method named `method`. Reject combined prefixes and do not silently reinterpret receiver/static/field declarations. The compiler must accept formatter output before releasing normalization. [39 candidate source cases](../conformance/nominal-method-spelling-v1.json) require matching syntax or semantic diagnostics for negative cases and real guest execution for positive cases on every supported backend. Related candidates: Java #1982, Rust #503, LLVM #840 and formatter #96. The latter two compiler scopes may be narrower than these nominal signatures; no cross-backend execution is certified.
