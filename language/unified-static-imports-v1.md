# Unified static imports (v1)

> **2026-11-24 draft amendment:** [Static imports v2](static-imports-v2.md) supersedes this chapter's conflicting selector, namespace/import spelling, automatic qualification and collision rules if adopted. Dotted built-in identifiers (bare or quoted), explicit `import namespace`, scoped package identities and URL imports are the new target. Unchanged layer, visibility, source-header, initialization and target restrictions still apply. No implementation parity implied.

**Status:** Proposed normative AttoLang grammar. Syntax acceptance, cross-file
linking, runtime execution and cross-backend parity are separate milestones.
This document does not claim that the browser compiler currently links packages.

> **Library selectors finalized (2026-11-22):** imports of the compiler-owned
> `core`, `alloc` and `std` libraries are governed by
> [core-alloc-std-libraries-v1.md](core-alloc-std-libraries-v1.md):
> canonical `import module num from "atto.core/num";` (shorthand `"core/num"`, never `ores.*`),
> reserved `atto.core/`, `atto.alloc/`, `atto.std/` roots, no `pkg` and no dotted `"std.fs"` selectors for builtins. The
> builtin-selector addenda at the end of this document are superseded by it.

## One static import verb

`import` names all static dependencies. Quoted names beginning with the reserved
`core.`, `alloc.`, or `std.` roots denote **built-in compiler libraries**
without `pkg`; relative strings denote local source files; the explicit `pkg`
selector denotes declared third-party packages. `using` is unchanged and
continues to manage scoped resources and cleanup.

```atto
import * as telemetry from "core.telemetry";
import span, tracer as create_tracer from "core.telemetry";
import foo, bar as baz from pkg "+/pkg";
import * as p from pkg "+/pkg";
import * as local from "./relative-file.atto";
import calculate, Config from "./relative-file.atto";
import telemetry.span as span, telemetry.tracer as make_tracer from "core";
import fnc sleep from "std.time";
```

A full namespace import is **not** a request to eagerly link every export.
Only reachable symbols should enter the final output when side-effect analysis
allows it. Named or dotted imports select statically declared *public exports*;
they never destructure a runtime object's properties. The local binding for a
dotted selector is its final component unless `as` explicitly renames it.

## Full namespace imports and selective module imports

Prefer the explicit, uniform `import * as alias from "identity";` for
built-in `core`, `alloc` and `std` library namespace imports.
The `*` denotes *all publicly accessible exports in one static namespace*,
not permission to use private exports, an eager runtime object, or a request
to grant capabilities. Selectively importing **named module declarations**
uses `import module name1, name2 from "identity";`. These operations
have different exported symbol contracts:

```atto
import * as http from "std.http";
import * as time from "std.time";
import * as json from "std.json";

// Only when std.http explicitly exports public modules named http and http3:
import module http, http3 from "std.http";
// Not equivalent to the wildcard import. Names must exist and be public.
```

Public module selection requires an **explicit public declaration** in
the supplying Atto source:

```atto
// Inside a compiler-owned library's .atto source:
define pub module http as
  define pub fnc status_valid(int status): bool {
    return status >= 100 && status <= 599;
  }
end

define pub module http3 as
  define pub fnc version(): int { return 3; }
end

// The consumer may then select exactly those public module exports:
import module http, http3 from "std.http";
```

`define module hidden as ... end` is private by default and MUST NOT be
selectable across source units using `import module hidden`. For compiler
backends that cannot yet preserve public/private module visibility in AST,
linker, ABI digests and runtime exports, public selective-module imports MUST
fail closed rather than defaulting all modules to public. The source-format
canonical spelling is `define pub module`; `pub define module` is tolerated
as compatibility syntax only when it has identical parsed visibility and
public-export behavior.

The `std.http` library may instead expose public file-root functions such
as `get` and types such as `HttpResponse`; in that case,
`import * as http from "std.http";` is valid and
`import module http, http3 from "std.http";` is rejected unless those named
modules are declared and exported. Importing an entire namespace is
independent of whether the source declares `use namespace http;`.
Future built-ins `std.time` and `std.json` must have registered,
backend-owned implementations before imports of those identities are
executable.

As an optional compatibility spelling, a single bare identifier followed
immediately by `from` is a **static namespace alias**, not a named import. This includes compiler-owned `core`,
`alloc`, and `std` libraries and explicitly relative source files.

```atto
import http from "std/http.atto";
import web from "std/http.atto";
import task from "std/task.atto";
import util from "./util.atto";

// Exactly equivalent to the corresponding `import * as alias from ...`.
pub fnc is_healthy(): bool {
  return http.status_valid(200);
}
```

This is compile-time aliasing of an explicitly verified source/export table,
**not** a first-class runtime namespace object, dependency injection, eager
module evaluation, ambient import or capability grant. Imported public functions
and types are accessed as `http.status_valid` and `http.ResponseMeta`.
The local alias need not equal the source file's explicit namespace header;
a source file may use `use namespace http;` or no namespace at all. An
explicit source namespace affects the source's identity; the alias only
affects the importing unit's local binding. Neither implies package aggregation
across unrelated packages.

Because an unqualified `import name from "source";` is now a namespace binding,
**single-symbol imports must be unambiguous**: use a kind-qualified selector,
such as `import fnc sleep from "std/time.atto";`, or an explicitly selective
form already admitted by the compiler, rather than guessing whether `name`
is an export or a namespace. The formatter must not silently reinterpret
previously compiled single-name imports. An edition migration must check the
resolved import kind before rewriting.

The reserved source roots `core/`, `alloc/`, and `std/` with `.atto`
suffixes are supported by compiler-owned legacy registries. A compiler may
also support dotted canonical identities such as `std.http`; both spellings
MUST resolve through a **closed registered built-in table**, without falling
back to the filesystem, an external package or untrusted host language.
Unknown paths and missing public exports fail closed. The current Java
implementation resolves `std/http.atto` in its explicit hosted std registry;
other compilers must prove that identity independently.

Namespace imports must reject invalid identifiers, binding collisions,
private or `pub[pkg]` export leakage and cross-tenant capability escalation.
They preserve the same static visibility, effect, ownership, dead-code
elimination and SCC semantics as `import * as alias from source`. In
particular, HTTP imports never authorize network or DNS access.

## Package namespace shorthand

`import pkg 'z';` is a **canonical first-class static package-namespace
import**, equivalent in binding and public-export lookup to
`import * as z from pkg 'z';`. It does not create a source-file
`use namespace` declaration, re-export package members, or flatten exports
into the importing scope.

```atto
import pkg 'z';                   // local namespace z
import pkg 'z' as zed;            // local namespace zed
import pkg 'vendor.telemetry';    // local namespace telemetry
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
import_decl     = package_namespace_import | source_namespace_import | selective_import ;
package_namespace_import = "import", "pkg", string, [ "as", identifier ], ";" ;
source_namespace_import = "import", identifier, "from", [ "pkg" ], string, ";" ;
selective_import = "import", import_clause, "from", [ "pkg" ], string, ";" ;
import_clause   = "*", "as", identifier
                | import_kind, import_spec, { ",", import_spec }
                | import_spec, ",", import_spec, { ",", import_spec }
                | export_path, "as", identifier
                | dotted_export_path ;
import_kind     = "fnc" | "class" | "actor" | "type" | "trait" | "interface" | "module" ;
import_spec     = export_path, [ "as", identifier ] ;
dotted_export_path = identifier, ".", identifier, { ".", identifier } ;
export_path     = identifier, { ".", identifier } ;
```

The right-hand string denotes (1) a built-in module identity under reserved
`core`, `alloc`, or `std` roots, (2) an explicitly relative source file such
as `"./a.atto"` or `"../a.atto"`, or (3) a third-party package identity
or rooted package reference when preceded by `pkg`. The `+/...` selector is
permitted with `pkg`. These are mutually exclusive resolver categories.
Dotted selectors traverse statically exported
**module/namespace declarations**, not values or fields of a runtime object.
No braces are required or accepted in the canonical grammar. The named-import
list has no trailing comma.

The declaration `use namespace name;` is a distinct **source namespace
header**, not a dependency import, and must not be rewritten to
`import namespace name;`. The `use namespace` spelling remains canonical
for source identity. Likewise, `using`, `with`, trait/inherited-member
aliasing, and ordinary uses of the English verb "use" are not import directives.

## Built-in library selector and isolation

The built-in library roots `core`, `alloc`, and `std` are reserved by the
language and use **no** `pkg` selector. Both namespace and named exports use the
same static import grammar:

```atto
import * as result from "core.result";
import * as arena from "alloc.arena";
import * as fs from "std.fs";
import * as http from "std.http";
import fnc read_text from "std.fs";
import * as util from "./util.atto";
import * as vendor from pkg "vendor.files";
```

A quoted bare `"std.fs"` is a reserved compiler-library identity, **not** a
search for `./std.fs`, a filesystem path, or a package from a third-party
manifest. Compile-time resolution uses the target/compiler's explicitly
registered built-in module table, which may point to backend-owned native
`.atto` sources and adapters. The public API and security contract is shared
where specified; implementation bytes need not be identical across backends.

No fallback to project-relative files, current working directory,
`ORES_PATHS`, implicit package installation or third-party registries is
permitted for reserved names. If the compiler does not provide the named
built-in module, it must issue a deterministic unsupported/unresolved diagnostic
without creating an output artifact; do not silently resolve to a dependency
named `std.fs`. A built-in module is not automatically imported into scope:
explicit imports are still required.

For `pkg` imports, package identities beginning with a reserved root
(`core.`, `alloc.`, `std.`) cannot masquerade as built-ins. Existing source
may be migrated by the formatter after **verified built-in identity** only;
avoid changing external package semantics. Project-root `+/...` and scoped
third-party package forms retain their existing explicit `pkg` rules.

The `core -> alloc -> std` layering applies regardless of spelling.
Importing `std.fs` does not grant filesystem read/write rights, native file
handles, path-root authority or async runtime support. Permission admission
happens independently at the privileged host boundary.

### Required conformance

- Accept built-in wildcard and named imports for all three roots, with
  static public-export lookup, aliasing and duplicate-binding checks.
- Accept relative source imports and explicit third-party `pkg` imports
  without treating either as a built-in.
- Reject an unregistered `std.missing`, spoofed local `std.fs`, and
  forged package names colliding with reserved roots; no fallback or
  host filesystem read on a denied reserved import.
- Ensure non-hosted targets reject `std.fs` with a deterministic no-artifact
  error, while permitted compiler backends resolve only their own registered
  module and still enforce permissions at runtime.
- Formatter must output `import * as fs from "std.fs";` as canonical and
  preserve `pkg` for third-party imports.

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
import sleep from "std.time";

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

The former built-in import `use core.telemetry;` should be canonicalized to
`import * as telemetry from "core.telemetry";`. Old spellings using
`from pkg "core.telemetry"` or `from pkg "std.fs"` must not be introduced in
new source; a transition formatter may rewrite them only when their resolved
identity is already proven to be the reserved built-in module, never from a
third-party dependency with a coincidentally similar name.
The former `import pkg p from "+/pkg1";` may remain a temporary compatibility
spelling; format it as `import * as p from pkg "+/pkg1";`.

The older `import module math from "./math.atto";` can be parsed temporarily,
but its canonical spelling is `import * as math from "./math.atto";`.
Do not claim successful compiled linking merely because the grammar accepts
any of these forms.

## Conformance requirements

- Verify `import * as http from "std.http";` exposes only the
  validated public export table through a static alias; missing built-ins
  and private members must fail closed.
- Verify `import module http, http3 from "std.http";` binds **two
  named exported modules**, not a namespace over arbitrary functions/classes;
  require a missing-module diagnostic for a `std.http` implementation
  without those module declarations.
- Verify all three forms preserve distinct import AST semantics and
  cannot be swapped by the formatter without semantic proof:
  wildcard namespace, named-module selection, legacy compact alias.

- Parse `import http from "std/http.atto";` as the **same static alias**
  binding as `import * as http from "std/http.atto";`, not a selected
  symbol named `http`; verify actual guest lookup of public exports.
- Reject malformed bare imports, alias collisions, private export selection
  and unregistered builtin source identities. Test a file with
  `use namespace http;` and with no explicit namespace header.


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
