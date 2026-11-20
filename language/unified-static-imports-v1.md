# Unified static imports (v1)

**Status:** Proposed normative AttoLang grammar. Syntax acceptance, cross-file
linking, runtime execution and cross-backend parity are separate milestones.
This document does not claim that the browser compiler currently links packages.

## One static import verb

`import` names all static dependencies. Whether a dependency is a source file
or a package is expressed by the source selector (`pkg`), **not** by using
another keyword such as `use`. `using` is unchanged and continues to manage
scoped resources and cleanup.

```atto
import * as telemetry from pkg "core.telemetry";
import span, tracer as create_tracer from pkg "core.telemetry";
import foo, bar as baz from pkg "+/pkg";
import * as p from pkg "+/pkg";
import * as local from "./relative-file.atto";
import calculate, Config from "./relative-file.atto";
import telemetry.span as span, telemetry.tracer as make_tracer from pkg "core";
import sleep from pkg "std.time";
```

A full namespace import is **not** a request to eagerly link every export.
Only reachable symbols should enter the final output when side-effect analysis
allows it. Named or dotted imports select statically declared *public exports*;
they never destructure a runtime object's properties. The local binding for a
dotted selector is its final component unless `as` explicitly renames it.

## Package namespace shorthand

`import pkg 'z';` is a **canonical first-class static package-namespace
import**, equivalent in binding and public-export lookup to
`import * as z from pkg 'z';`. It does not create a source-file
`use namespace` declaration, re-export package members, or flatten exports
into the importing scope.

```atto
import pkg 'z';                   // local namespace z
import pkg 'z' as zed;            // local namespace zed
import pkg 'core.telemetry';      // local namespace telemetry
import pkg '@scope/math' as math; // explicit alias required
import module math from pkg 'utils';
import * as helpers from './helpers.atto';

pub fnc main(): int {
  z.http.create_server();
  zed.logging.info("ready");
  return 0;
}
```

The implicit binding is the final dot-delimited component of the *resolved
package identifier* when that component is already a valid, non-reserved Atto
identifier. An invalid component (for example `my-lib`, a scoped `@scope/lib`
identifier, a rooted `+/lib` selector, an empty segment, or a keyword)
requires an explicit `as identifier` alias. Never sanitize, truncate,
case-fold, or mangle package names to manufacture a local identifier.
The explicit alias must itself be valid and non-reserved.

Package identity and version are chosen by the governed project manifest,
lockfile and static resolver, not the implicit alias. The resolver must load
the **declared public package export table**: it may not walk the filesystem
and make every sibling file importable, expose `pub[pkg]` or private exports,
execute foreign source as a package discovery hook, or give a package additional
guest capabilities. The same package may be imported with two different
local aliases without changing its dependency identity. Collisions between
imports and other local top-level bindings are compile errors, even when the
identities happen to match; explicit renaming is the remedy.

A package namespace import denotes a static namespace, not a first-class
runtime object; `z.math.square(7)` is resolved through public export
metadata. Importing does not itself request eager compilation of every
package member. Reachability and the source language's specified
initialization/side-effect semantics still govern linking. A compiler that
does not implement package namespace linking MUST fail closed with an explicit
unsupported-feature diagnostic, rather than pretending that parsing or
formatting proves executable linking.

## Grammar

```ebnf
import_decl     = package_namespace_import | selective_import ;
package_namespace_import = "import", "pkg", string, [ "as", identifier ], ";" ;
selective_import = "import", import_clause, "from", [ "pkg" ], string, ";" ;
import_clause   = "*", "as", identifier
                | import_spec, { ",", import_spec } ;
import_spec     = export_path, [ "as", identifier ] ;
export_path     = identifier, { ".", identifier } ;
```

The right-hand string denotes a source file without `pkg` and a package
identity/rooted package reference with `pkg`. A project-rooted `+/...`
selector is permitted with `pkg`. A file import normally uses a quoted
relative path such as `"./a.atto"`. Dotted selectors traverse statically exported
**module/namespace declarations**, not values or fields of a runtime object.
No braces are required or accepted in the canonical grammar. The named-import
list has no trailing comma.

The declaration `use namespace name;` is a distinct **source namespace
header**, not a dependency import, and must not be rewritten to
`import namespace name;`. The `use namespace` spelling remains canonical
for source identity. Likewise, `using`, `with`, trait/inherited-member
aliasing, and ordinary uses of the English verb "use" are not import directives.

## File-level namespace placement

Each `.atto` source file has **zero or one** namespace declaration. If present,
the namespace header must be the first top-level declaration, before **every**
import and before any callable, class, module, actor or other declaration.
Whitespace and comments may precede it. The namespace is file-scoped; a file
must not declare multiple namespaces, even if the names are identical.

```ebnf
source_unit     = [ namespace_decl ], { import_decl }, { top_level_decl } ;
namespace_decl  = "use", "namespace", identifier, { ".", identifier }, ";"
                | "use", "default", "namespace", [ "(", positive_integer, ")" ], ";" ;
```

The explicit header uses a fixed, potentially dotted namespace, e.g.
`use namespace commerce.storefront;`. The derived header takes source-path
components: `use default namespace;` is the containing folder and
`use default namespace(2);` is `parent.folder`. Depth must be an integer
from 1 to 32. Resolution is compile-time, requires a **logical package-relative
source path** ending in `.atto`, and must never include an absolute host path,
parent-traversal component or symlink-resolved machine path. Reject insufficient
depth and invalid/reserved folder identifiers; never sanitize them silently.
The host source-only API (including browser snippets without a virtual file path)
must diagnose missing context instead of guessing. The resulting namespace has
the same static identity as its explicit spelling; it is not a runtime global.
The file position rule applies equally to explicit and derived headers.

Valid:

```atto
// Optional license header
use namespace storefront;
import module math from "./math.atto";
import sleep from pkg "std.time";

pub fnc main(): int { return 0; }
```

For `src/commerce/storefront/main.atto` under the source root, the following
headers resolve to `storefront`, `commerce.storefront`, and
`src.commerce.storefront`, respectively:

```atto
use default namespace;
use default namespace(2);
use default namespace(3);
```

These are alternative headers in **separate** files, not declarations that
can appear together in one source file.

A source file without a namespace is also valid. An import before the namespace,
a repeated namespace, or a namespace after any declaration is a compile-time
error. The formatter must preserve valid header ordering and must not silently
repair invalid source by moving or deleting namespace declarations. This is a
syntax contract only; acceptance of a header does not prove a linked module
or an executable package import.

## Static binding and visibility

1. Resolve the import path against the declared file/package kind before
   evaluating its export table. Never interpret a path as executable code.
2. Named selectors must correspond to statically declared public exports;
   a missing export or inaccessible `pub[pkg]` binding is a compile error.
3. Renaming with `as` affects the local binding, not the exported identity.
4. All local import bindings must be unique and must not silently shadow
   declarations. Duplicate local names are errors even if reached by
   different dotted export paths.
5. Imported symbols are not implicitly re-exported.
6. Namespace member lookup and dotted selective binding must remain statically
   typed, without dynamic reflection or import-time object property reads.
7. Cyclic imports, module initialization, package identity, root resolution,
   and path traversal must be accounted for by the module resolver. Parsing
   alone is not proof of safe linking.
8. Dependency reachability and *side-effect-preserving* dead-code elimination
   determine tree-shaking; selector syntax alone must not be used as evidence
   that a module can be safely dropped.

## Migration and compatibility

The former package-import spelling `use core.telemetry;` should be
canonicalized to `import pkg "core.telemetry";` when its implicit binding is
valid, or to `import pkg "core.telemetry" as telemetry;` otherwise.
The former `import pkg p from "+/pkg1";` may remain a temporary compatibility
spelling; format it as `import * as p from pkg "+/pkg1";`.

The older `import module math from "./math.atto";` can be parsed temporarily,
but its canonical spelling is `import * as math from "./math.atto";`.
Do not claim successful compiled linking merely because the grammar accepts
any of these forms.

## Conformance requirements

- Parse zero or one explicit or folder-derived namespace header before imports
  and declarations; reject duplicates and declarations appearing after an import
  or other declaration. Derivation is deterministic from a package-relative
  logical path; reject missing path, reserved components, invalid/deep depths.
- Parse namespace and named imports with and without `pkg`.
- Admit `import pkg 'z';` and `import pkg 'z' as alias;` as canonical forms;
  enforce deterministic implicit basenames, reserved-name/invalid-name
  rejection, aliasing and duplicate-binding errors. Check package-root public
  export lookup, private-export denial and imported namespace isolation.
- Parse comma-separated single and multiple names, aliases, and dotted
  static export paths such as `telemetry.span as span`.
- Reject empty selections, leading/trailing commas, missing `from`, unquoted
  selectors, brace-destructuring, invalid aliases, duplicate local names and
  unbounded dotted paths.
- Reject attempts to import private/package-scoped exports across boundaries,
  or to select instance/runtime object fields statically.
- Reject unresolved module files and package paths without executing them.
- Verify reachability for both `import * as` and named imports, preserving
  required side effects and actor/reflective entrypoints.
- Run compiler + *guest* execution on a real multi-file/package fixture
  before marking imports executable in the browser playground.
