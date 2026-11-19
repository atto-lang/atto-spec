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
import module telemetry from pkg "core.telemetry";
import * as telemetry_compat from pkg "core.telemetry";
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

## Explicit module namespace binding

`import module assert from pkg "std.assert";` is the **canonical named-module import** for static namespace imports. It binds the module identity as `assert`; it does **not** instantiate a class, grant dynamic member access, or load an arbitrary runtime object. `import * as assert from pkg "std.assert";` remains an allowed namespace-import equivalent for compatibility and source code using that spelling. Named callable imports retain comma syntax. A module binding must resolve to a module export table at compile/link time; unresolved packages fail closed, and an imported module alias cannot be redefined as a local class, value, or second import.

## Grammar

```ebnf
import_decl     = "import", ( "module", identifier | import_clause ), "from", [ "pkg" ], string, ";" ;
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
canonicalized to `import * as telemetry from pkg "core.telemetry";`.
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
