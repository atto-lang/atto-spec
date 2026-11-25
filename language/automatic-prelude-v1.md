# Automatic prelude and globally visible names (v1)

**Status:** Target language contract; browser-compiler subset integration is separately tracked. An automatic prelude is **lexical name binding**, never mutable process-global storage or a runtime side effect.

## Profiles

Each source file is compiled with one explicit profile:

- `core` (always): `Option<T>`, `Result<T,E>`, their variants `Some`, `None`, `Ok`, `Err`; `Error`, `Array`, `Slice`, tuples, `Pair`, `Range`, `Iterator`, and foundational comparison/conversion/formatting traits where implemented. Primitive scalar keywords/types are available independently of imports.
- `alloc` (only with a real allocator and ownership support): additionally `String` (owned UTF-8 string), `List`, `Vec`, `Map`, `Set`, `Box`. A backend MAY preserve an existing no-allocator `string` or `String` scalar/view spelling as a documented compatibility subset; it MUST NOT misrepresent that view as an owned, allocator-backed `String`.
- `std` (hosted): builds on `alloc` but does not implicitly grant FS, network, process or other capabilities. Specialized `HashMap`, `HashSet`, `Entry`, `LinkedList`, `Deque`, `Channel`, `Mutex`, `ActorRef`, `Path` and similar types require explicit imports or an independently specified intrinsic syntax.

`Object` is **not** a universal ancestor type. `Any` is a separately checked opt-in erased/dynamic representation, never an implicit boxing operation. The tuple syntax and the `Tuple` type denote exact, static product shapes, never heap allocation by default.

The frontend MUST select the effective prelude **before** resolving user type references, by target/manifest/profile admission. Selection is deterministic, independent of host filesystem search order and compiler process state. Missing modules, allocator support or source-to-AOT lowering do not become available simply because a name is listed above: reject with a capability/unsupported diagnostic before artifact emission. Compiler-specific `.atto` library bodies may differ across `atto-source.*` repositories; public contracts and conformance fixtures should agree.

## Core Type Registry

Every compiler MUST maintain one compiler-owned Core Type Registry (or an equivalent immutable representation) from which its implicit prelude, type resolver, borrow checker, Copy/Send analysis, and drop analysis derive canonical identities. A second, independently maintained list of "builtins" is not authoritative. A frontend facade such as `AutomaticPrelude` may filter registry entries by the target profile, but it MUST NOT redefine their ownership or canonical identity.

Each registry entry records at least: source spelling, canonical identity, scope (`core`, `alloc`, or explicit-only), kind (value type, constructor, or trait), generic arity, ownership category, allocation requirement, drop policy, actor-transfer/Send policy, and backend lowering status. Source aliases that denote the same primitive MUST point to the same canonical identity. Unknown identities fail closed; a matching short name is never sufficient proof.

Ownership categories are:
- `Copy`: compiler-proven bitwise/value copy with no owned payload or loan.
- `PayloadDependent`: recursively derived from every possible live payload/member; a sum/tuple/array is Copy/Send only when its contained values prove that property.
- `BorrowedView`: non-owning access tied to a source lifetime; never becomes owned, Copy, or transferable merely by being named.
- `Owned`: owns storage/resources and requires deterministic destruction.
- `Trait`: compile-time contract, not a runtime value.

For `Option<T>` and `Result<T,E>`, the registry records exact arity (1 and 2 respectively), payload-dependent ownership, and active-variant destruction. `Some`, `Ok`, and `Err` move their payload into the new carrier; `None` contains no payload. Destruction MUST visit only the active payload and do so exactly once. Copy/Send/Sync/Share facts are computed recursively from the contained payloads, not copied from the carrier name.

Generic arity is checked against registry metadata after the parser has preserved named-argument and sequence-shape syntax. A type with a wrong generic arity MUST fail before lowering. Named layout metadata and fixed-product shape dimensions are not generic type parameters and MUST be validated by their own channels.

The registry's backend-lowering field is an evidence/status distinction, not a permission to guess. A `CONTRACT_ONLY` or otherwise unsupported entry may be documented or listed, but the backend MUST reject its use before artifact emission. An old host scalar implementation for `string`/ `String` MUST NOT be reported as proof of an owned allocator-backed `String`.

## Name resolution

1. Recognize syntax keywords and compiler-owned primitive/intrinsic identities first; they may not be shadowed or forged.
2. Collect and validate the file's explicit local declarations and import aliases. Duplicate local/import aliases are errors as defined by [unified static imports](unified-static-imports-v1.md).
3. Resolve a use against local declarations, then explicitly imported bindings, and finally the prelude. A non-intrinsic convenience name may be shadowed intentionally (with a lint), but canonical compiler-owned identities (`Option`, `Result`, `Array` and their constructors) MUST NOT be rebound, even by a package export or alias. An explicit conflicting import must be rejected rather than silently rebound.
4. A prelude lookup returns a statically typed, package-qualified symbol identity (for example `core/result/Result` or `alloc/map/Map`), not a lookup in a global runtime object. Explicit qualified access retains that same identity.
5. Prelude names are **not automatically re-exported** by importing modules. Generic argument binding, visibility, module versions, AOT specialization keys, and tree shaking use the resolved canonical declaration, never only the short spelling.

An implementation may represent the prelude as compiler-synthesized imports, an immutable symbol table, or statically pre-bound intrinsic symbols, provided resulting diagnostics, semantics and no-allocation behavior agree. Do not physically splice text into user source, reassign source locations, or eagerly execute library initializers.

## Constructors and inference

`Some(v)`, `None`, `Ok(v)`, and `Err(e)` are **variant constructors/patterns**, not generic user functions named `Some` and `Err`. Their variant identity is scoped to `Option<T>` or `Result<T,E>`. A constructor's omitted generic type arguments require a contextual expected type or uniquely solvable inference; otherwise reject ambiguous uses. `None` is not `null`; `Err(e)` does not throw.

```atto
fnc success() -> Result<int, Error> :: return Ok(42) end
fnc missing() -> Option<int> :: return None end
```

Generic shapes and collection syntax (`List<T>` vs `List[T]`, `Array<T, layout=...>`, tuple shapes and named generic arguments) MUST retain their own declared semantics. Prelude visibility MUST NOT silently normalize distinct shape/generic channels.

## Ownership, AOT, and permissions

Prelude inclusion never creates an allocation, clones an owning value, disables the borrow checker, or loads a host bridge. `Option<T>` and `Result<T,E>` preserve the contained payload's ownership/lifetime; moving a variant moves its owned payload, and borrowed variants must not outlive that payload. `List`, `Map`, `Set`, `Box` and owned `String` use explicit allocator/actor-owned heap contracts, deterministic cleanup and correct failure unwinding. Only valid `Sendable` values cross actor domains; prelude names confer no permission to transfer non-sendable values.

An unavailable `alloc` prelude must produce a compile-time error for `List`/`Map`/`Box` rather than substituting a host list or allocating secretly. A target with no `std` may still compile core-only code. No compiler may mark an unsupported operation as executable merely because the source name resolved.

## Compiler-enforced core borrow contracts

The built-in `Option<T>` and `Result<T,E>` variant types have **payload-dependent** ownership. Their constructors are not ordinary, user-redefinable functions and cannot be reassigned to dynamic host references by import aliases. `Some(owned)`, `Ok(owned)`, and `Err(owned)` transfer ownership into the new carrier; `None` contains no payload. The inactive variant MUST never be read or dropped as if live.

Source-defined `.atto` helpers in `core/option`, `core/result`, `core/convert`, and `core/fmt` do not bypass compiler MIR ownership admission. A read-only helper must declare a shared loan and cannot manufacture an owned affine `T`/ `E` from it. Consuming helpers (`flatten`, `transpose`, `map`, `and_then`, `map_err`, `zip_with`, `unwrap_or_else`) must prove a consuming source formal, unique carrier ownership, exact once-only movement or disposal of the active payload and rollback/drop correctness for exceptional returns. An unannotated generic parameter is not proof of consumption.

The compiler MUST reject use-after-take, double-drop, shared-and-exclusive overlapping loans, reference escape, unpinned borrowed frames across `await`/suspension, and transfer of unsendable payloads across actors. For mutable collections, loans must also be fenced against reallocation, hash-table rehash, mutation, actor shutdown and arena reset. `Slice<T>` is a view tied to its source lifetime and never becomes owned storage merely through an implicit import.

Until a backend proves those contracts, it MUST fail closed on the unsupported borrow/affine instantiation; parser-only rejection is not equivalent to implementation support. Scalar-only Copy or immutable-view profiles can be tested separately but cannot certify the affine profile. The compiler's checked owner/borrow facts, not a user-callable `cell` borrow-state counter or a TypeScript/Java host shim, are the source of memory authority.

## Conformance matrix

Each backend should prove:
1. `Some`, `None`, `Ok`, and `Err` in typed context work without import, and equivalent explicit module imports designate the same variants.
2. No-context `None`/`Err` ambiguity fails with an accurate compile-time diagnostic.
3. A duplicate or spoofed intrinsic constructor/type is rejected; explicitly imported non-intrinsic alias precedence is deterministic.
4. All core names resolve in core-only builds without allocator allocation or host imports.
5. Alloc types are available only when the allocator and verified ownership lowering exist; no-alloc builds reject them.
6. Generic arity and named argument errors, use-after-move, borrowed escape and actor transfer diagnostics are identical for implicit and explicit imports.
7. Compile-only tests and **actual guest-executed tests** distinguish recognition from runtime implementation. Report each backend's exact head SHA, guest result and remaining unsupported profiles.

This contract extends [chapter 17](../spec/17-primitives-and-core-types.md) and [unified static imports](unified-static-imports-v1.md); it is not itself proof of runtime implementation.
