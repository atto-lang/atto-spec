# Namespaced exports and module boundaries — v1 target contract

**Status: Proposed normative AttoLang semantics, not a claim of compiler/linker parity.**
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
kind, but two separate `export` directives of the same symbol are always a
duplicate error, even when their scopes are identical. A package/private
versus public conflict is a diagnostic. The compiler MUST not broaden a
private member when exporting the enclosing module.

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

Required failures: unresolved local module, explicit wrong kind, duplicate
module exports, malformed `pub[pkg]`, nested export, namespace header in the
middle of the file, exporting a namespace header, dotted/private-member
export, unqualified imported re-export, two namespaces with the same leaf
name, cross-package `pub[pkg]`, private module member through a public
module, and import-alias collisions.

The executable fixture registry is
[conformance/namespaced-exports-v1.json](../conformance/namespaced-exports-v1.json).
A result must separate parser, binder, linker, and guest stages, with explicit
`passed`/`failed`/`unsupported`/`not executed` receipts and exact
source/tree SHAs. Host JSON checks do not establish compiler support.
