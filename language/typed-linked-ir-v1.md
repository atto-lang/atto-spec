# Typed per-source linked IR — v1 target contract

**Status: proposed architectural contract, not currently implemented by the Rust/Wasm or Cranelift backends.** This document refines [namespaced exports v1](namespaced-exports-v1.md), without widening the currently executable bounded module subset.

## Distinct compiler stages

1. **Parse each source independently.** Preserve its canonical source path, package identity, namespace header, original source spans, locally declared modules, and explicit imports. The parser must never acquire names from a sibling source as ambient scope.
2. **Register typed interfaces.** Record exported declaration kinds, overload signatures, nominal types, module members, effects and required capabilities. Registration must not execute module initialization or assume that import order conveys authority.
3. **Bind import edges.** Every imported member reference is resolved to a unique source-owned symbol ID through an explicit dependency edge; the binding result is stored in IR. The check uses the **immediate consumer** package, not the entry point's package.
4. **Type-check source bodies against the bound interfaces.** Cross-source arguments, return values, overload resolution, ownership/borrow constraints and effects must be checked before emission. Internal helper names are never user-addressable symbols.
5. **Link checked IR, not source text.** Merge symbol graphs, relocate call targets and data/type references, and emit deterministic backend artifacts. Linking must not concatenate source files or rewrite lexical tokens to simulate an import.
6. **Verify final visibility and ABI.** Every externally reachable call/host export must retain its recorded declaration, export and capability provenance. Optimizations must not broaden visibility.

## Canonical identity and typed linkage

An imported symbol is identified by a domain-separated, collision-checked tuple:

```text
SourceUnitId = (authenticated_package_id, source_namespace, canonical_source_path)
ModuleId     = (SourceUnitId, module_declaration_path)
SymbolId     = (ModuleId or SourceUnitId, declaration_kind, declaration_name, overload_signature)
ImportEdge   = (consumer_SourceUnitId, producer_SymbolId, declared_import_path, allowed_scope)
TypedCall    = (caller_SymbolId, callee_SymbolId, argument_types, result_type, source_span, effects)
```

Tuple elements must be length-prefixed or otherwise unambiguous, and internal hashing must fail on detected collisions. Names are case-sensitive. An identical leaf module name in two separate source units is **not** an ambiguity when each call has an explicitly bound import; unqualified calls cannot select either implicitly. Path aliases and symlink spellings must not change a source's identity.

In the initial executable profile, module members are direct functions. Interface registration nevertheless records parameter and result types, and the import binder validates those types and member visibility before allowing codegen. Later class, actor, enum, generic, overload and cross-package cases require explicit conformance extensions rather than silently inheriting module-function semantics.

An IR call must reference the resolved symbol ID, never a string that the final code generator reinterprets as a globally visible function name. Backend lowering may choose physical symbol mangling only **after** authorization and type checking.

## Authorization rules

For each import edge, all of the following must hold independently:

- The producer source and package identities are authenticated and the imported declaration belongs to that source.
- The producer module or top-level symbol is exported at a scope compatible with the **immediate** consumer; `pub[pkg]` requires canonical package identity equality.
- The requested member is public to that consumer. Publishing a module never publishes a private member.
- A cross-source symbol's signature, overload, type, ownership and effects permit the requested operation.
- An explicit `external` or FFI import carries separately validated linkage and capability grants. A source export never grants a host capability.
- No import edge becomes an implicit re-export. Re-export provenance and aliasing need a separately versioned contract.

Checks must be performed before optimization and preserved after linking. The first failing stage must return a stable diagnostic and **must not produce an executable guest**.

## Dependency cycles and initialization

The currently executable browser subset rejects every import cycle. A future cycle-capable linker must separate declaration registration from execution ordering; it may admit a strongly connected component only when its initialization and effect rules have been specified and proven. It must never infer a cycle's semantics from text concatenation order.

## Snapshot trust and host boundaries

The source graph may be built from the separately trusted immutable snapshot entrypoint, but a lockfile digest originating from the same untrusted package does not authenticate that package. External package signatures, trust roots, revocation, registry identities and secure lockfile acquisition remain independent tasks. This IR contract consumes authenticated identities; it does not itself establish trust.

## Required executable conformance

Each relevant backend must produce stage-specific `passed`, `failed`, `unsupported`, or `not_executed` receipts, bound to exact source/tree Git SHAs and real artifact execution where applicable.

Minimum negative cases: two packages with the same module leaf name, ambiguous unqualified reference, private member through public module, `pub[pkg]` across package identities, forged compiler symbol ID, sibling-import authority leak, entry-local free-function capture, imported-name shadowing, wrong arity and argument type, return-type mismatch, duplicate overload signature, implicit re-export, missing source, tampered lock digest, import cycle, and link-time symbol-hash collision injection in a test harness.

Minimum positive cases: two distinct same-leaf modules imported by different files, a multi-hop public import, a same-package `pub[pkg]` import, deterministic input-order-independent output, and actual Wasm/native execution of the linked result.

The existing four executable Wasm guests and native Cranelift object fixture prove only their admitted subsets; they are not substitutes for these new scenarios or for independent Java/LLVM/.NET/Forge conformance.

## Migration from the current Rust bridge

The experimental Rust linker currently uses a checked source graph and source-owned internal names, but `qualify_bound_modules` still edits token spelling and the final phase joins source strings before calling the single-source compiler. The next implementation slices should be kept separately testable:

1. Introduce immutable `ParsedSourceUnit` and source-owned `ModuleInterface` data with typed member signatures and exact source spans.
2. Replace token-pattern authority preflight with bound symbol references and per-consumer visibility decisions in the IR.
3. Teach the existing checker and Wasm emitter to consume linked typed units without concatenation, retaining the same successful guest results.
4. Feed the same resolved IR through native Cranelift, then independently prove other backend parity.
5. Only then retire token rewriting and remove the current single-leaf-name restriction.

Do not relabel a metadata-only interface registry or parser AST as a fully typed linked IR, and do not mark this contract implemented based on host-only fixture validation.
