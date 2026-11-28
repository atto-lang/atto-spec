# Namespaced exports and module boundaries — v1 target contract

**Status: Proposed normative AttoLang semantics, not a claim of compiler/linker parity.**

The per-source type-checking and linking boundary is specified separately in [typed linked IR v1](typed-linked-ir-v1.md); that architecture is a **target**, not an executable backend claim.
This extends [declarative file-level exports](declarative-exports.md), without changing
its existing `export pub` and `export pub[pkg]` forms. Backend implementations
MUST fail closed when they cannot establish namespace, package, or member visibility.

## Terminology and canonical examples

A **source namespace** is the identity of the source file's declarations. A
**module** is a named, importable declaration that introduces a separate
member scope. They are not synonyms.

```atto
use namespace storefront;     // File header; not an exported declaration.

export pub fnc build_receipt;
export pub module Arithmetic;
export pub[pkg] module Internal;

fnc build_receipt(int quantity): int { return Arithmetic.double(quantity); }

define module Arithmetic as
  pub fnc double(int value): int { return value * 2; }
  fnc secret(int value): int { return value + 1; }
end

define module Internal as
  pub fnc check(int value): int { return value; }
end
```

The namespace header, when admitted, MUST occur before imports and declarations.
It identifies the owning namespace, and MUST NOT inject imported names into
unqualified lookup. The module export may precede or follow its declaration.

The canonical inline-public module form remains `define pub module Name as ... end`.
The file-level `export pub module Name;` is its declarative export equivalent
when the declaration is otherwise private. Both express the *same* effective
public module visibility; a matching inline modifier and one explicit export
are not two explicit export directives. Conflicting inline/export visibility
MUST be diagnosed, not resolved by source order. Module members still have
their own visibility: the module's public status does not publish `secret`.

An imported module remains qualified:

```atto
use namespace client;
import module Arithmetic from "./arithmetic.atto";

pub fnc main(): int { return Arithmetic.double(21); }
```

This import spelling is the target contract; browser single-file Wasm compilation
does not prove cross-file import/link support.

## Export grammar and symbol binding

```ebnf
export_decl       = "export", "pub", [ "[", "pkg", "]" ],
                    [ export_kind ], identifier, ";" ;
export_kind       = "fnc" | "class" | "actor" | "enum" | "module" ;
namespace_header  = "use", "namespace", identifier, ";" ;
```

A file export is resolved only against declarations **owned by that source
namespace and direct file/module compilation scope**. Nested module members
are not file declarations. An unqualified export is never resolved via an
import, implicit prelude, sibling namespace, parent module, or inherited
member. An explicit kind must match the resolved declaration. A name collision
across declaration kinds requires kind qualification only where that is
otherwise legal; a compiler MUST reject ambiguous binding rather than select
an arbitrary candidate.

**No dotted targets in v1:** `export pub module A.B;`,
`export pub fnc Math.double;`, and `export pub namespace storefront;` are
rejected. The namespace header is not a value, module, or exportable symbol.
Explicit re-exports (including rename/alias) require a separately versioned
grammar and validated provenance; `export pub imported_name;` cannot
silently re-export an imported declaration.

Functions are exported as an overload set by one name, with overload identity
and call checking preserved. The exported module name is one declaration;
its visible members are selected at qualified lookup, not recursively
flattened into the importer's namespace.

## Visibility intersection

Access to `Module.member` from a different source requires **all** gates:

1. The owning namespace/package is the one selected by the canonical import
   resolver; no alternate path or package identity can bypass it.
2. The module is exported to the consumer (`pub` globally, `pub[pkg]` only
   for the same canonical package identity).
3. The member itself is visible to the consumer. Members are private by
   default; `pub` exposes an admitted member through the exported module.
4. The member's signature, overload, type and capabilities are valid for
   that call. Exporting the module conveys *no runtime capability*.

An unexported module cannot be imported from another source merely because
its members say `pub`. Same-namespace visibility is still subject to
declaration/member rules; a namespace match is not a package-equality or
public-visibility bypass. `pub[pkg]` never becomes public host Wasm exports.

`define pub module` and `export pub module` select the same visibility
kind. Repeated `export` declarations with identical resolved owner,
local symbol, external name, kind and effective visibility are idempotent,
producing one source binding. A compatible implicit `pub` and explicit
export of the same module also agree. Conflicting scopes, kind/alias/target
collisions and private-member disclosure must fail deterministically: the
compiler MUST not broaden a private member merely because its containing
module is public.

## Linkage, identity, and AOT requirements

The canonical exported symbol key is the tuple
`(package_identity, source_namespace, owning_module_path, declaration_kind,
declaration_name, overload_signature)` where applicable. Names are compared
case-sensitively and cannot be deduplicated using leaf spelling alone.
Module/file exports and imports must use the exact canonical source-unit
identity established by package root and path validation. Root `+` imports,
relative imports, symlinks and alternate names cannot alter visibility.

A linker must separately validate the **namespace owner**, **module export**,
**member visibility**, and **consumer package identity** before binding, even
when all files compile independently. Cyclic imports require staged declaration
registration and no premature initialization. A compiler without such a
linker must report `unsupported` or reject at compile/link time; it may not
emit a guest artifact that bypasses these gates.

The existing `atto.exports.v1` binary metadata knows class=1, fnc=2,
actor=3, enum=4. **Do not silently assign `module` a v1 kind byte.**
Any cross-file namespace/module record needs a versioned extension with its
owner namespace, package scope, member lookup provenance and overload keys.
Legacy readers must reject unknown versions rather than guessing visibility.
The intermediate `atto.visibility.profile.v1` browser metadata is not
equivalent to linked package visibility proof.

## Diagnostics and reproducible evidence

Required failures: unresolved local module, explicit wrong kind, conflicting
duplicate module exports (identical resolved bindings are idempotent), malformed `pub[pkg]`, nested export, namespace header in the
middle of the file, exporting a namespace header, dotted/private-member
export, unqualified imported re-export, two namespaces with the same leaf
name, cross-package `pub[pkg]`, private module member through a public
module, and import-alias collisions.

The executable fixture registry is
[conformance/namespaced-exports-v1.json](../conformance/namespaced-exports-v1.json).
A result must separate parser, binder, linker, and guest stages, with explicit
`passed`/`failed`/`unsupported`/`not executed` receipts and exact
source/tree SHAs. Host JSON checks do not establish compiler support.

## Executable browser subset: checked local-package and multi-hop linking

The current experimental Rust/Wasm browser compiler exposes the in-memory
`linker::compile_linked(entry_path, &[LinkUnit])` API. Each source unit
supplies a canonical project-relative path, an explicitly verified package
identity, and its source. It resolves an **acyclic multi-hop import graph**
deterministically, with `./file.atto` imports relative to the importing file
and `+lib/file.atto` imports relative to the canonical package root.

Every edge checks the *immediate consumer's* package ID, not the entry file's.
Imported files may only use their own modules or names they explicitly import;
sibling imports cannot grant ambient authority. Imported code cannot capture
entry-only free functions. Each requested imported module must be locally
declared and exported; private members, wrong-kind exports, duplicate module
names, cycles, missing files and re-exports fail without guest artifacts.
Current symbol mangling requires module names to be unique across the linked
guest rather than silently aliasing conflicting namespaces. This is an
**implementation subset**, not the full namespace-aware target ABI.

The host-only `package_resolver::compile_package(root, entry)` and native
`attoc --package-root DIR --entry src/main.atto` use a bounded strict
`.atto.pkg.toml` subset consisting of:

```toml
[package]
name = "storefront"
version = "1.2.3"
```

The resolver verifies the canonical local root, rejects symlink components and
paths outside that root, loads only reachable sources, and supplies the
same-root package identity to the in-memory compiler.
The opt-in `compile_discovered(entry)` and `attoc --package entry.atto`
locate the nearest ancestor manifest, reject supplied symlink/traversal
components, and apply the same checks. Ordinary `compile(source)` does not
implicitly discover packages. This does **not**
authenticate external registry packages or implement dependency lockfiles.
The strict parser is not a general TOML dependency implementation.

**Filesystem threat boundary:** pre-read symlink and canonical-path checks
cannot establish security against concurrent malicious directory replacement.
Use only on stable trusted source trees until descriptor-based `openat2` or
capability-backed filesystem traversal and immutable source snapshots are
implemented and tested. The separately exposed in-memory API continues to
require package identities authenticated by its caller.

Import aliases, transitive *re-exports*, external dependency resolution,
type-only cycles, arbitrary module initializers, package/namespace-qualified
AOT metadata, and Java/LLVM/.NET/Forge parity remain future work. The
standalone `compile(source)` function deliberately remains single-file.
Neither runtime guest results nor JSON fixture schema tests establish the
unimplemented features. See the compiler's
[checked package-linking notes](https://github.com/atto-lang/atto-source.rs/blob/hardening/module-export-visibility-20261117/docs/package-linking.md).

Compiler evidence: exact-source token-free mirrored carrier
[run 44169061743](https://github.com/quaestor-ledger-test/atto-ci/actions/runs/44169061743)
executed 84 Rust tests and four Node WebAssembly guest tests. This is a
*selected test subset*, not the entire Rust repository suite or native
cross-backend conformance.

## Authenticated immutable source snapshots (browser subset)

An embedding host may compile an already-acquired immutable source graph with
`package_resolver::compile_locked_snapshot(entry, manifest, lockfile,
expected_lock_sha256, inputs)`. This mode does **not** read from the
filesystem. The caller must independently authenticate the expected lock
digest; the lockfile binds the package manifest and every source file by
canonical relative path and SHA-256. Duplicate, missing, altered and
unreachable-extra sources are rejected before linking.

This is distinct from package-registry authentication: the browser compiler
does not itself verify registry signatures, publish a signed lockfile, or
safely derive trust from a digest stored beside untrusted package files.
The Linux filesystem path uses descriptor-relative, symlink-rejecting file
handles; other platforms still require independent hostile-FS hardening.

Exact browser-crate source-mirror verification at
[run 44196885802](https://github.com/quaestor-ledger-test/atto-ci/actions/runs/44196885802)
included 609 original Git blobs, `cargo test --locked --all-targets`
(387 Rust tests in 54 suites) and four executed linked-Wasm guests.
Native Cranelift, other compilers, general registry integration, and
per-source typed linked IR remain separate admission gates.
