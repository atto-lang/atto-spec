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
import { span, tracer as create_tracer } from pkg "core.telemetry";
import { foo, bar as baz } from pkg "+/pkg";
import * as p from pkg "+/pkg";
import * as local from "./relative-file.atto";
import { calculate, Config } from "./relative-file.atto";
import { telemetry: { span, tracer as make_tracer } } from pkg "core";
```

A full namespace import is **not** a request to eagerly link every export.
Only reachable symbols should enter the final output when side-effect analysis
allows it. Named and nested imports are statically bound *public exports*,
never dynamic object-property destructuring.

## Grammar

```ebnf
import_decl     = "import", import_clause, "from", [ "pkg" ], string, ";" ;
import_clause   = "*", "as", identifier
                | "{", import_spec, { ",", import_spec }, [ "," ], "}" ;
import_spec     = identifier, [ "as", identifier ]
                | identifier, ":", "{", import_spec, { ",", import_spec },
                  [ "," ], "}" ;
```

The right-hand string denotes a source file without `pkg` and a package
identity/rooted package reference with `pkg`. A project-rooted `+/...`
selector is permitted with `pkg`. A file import normally uses a quoted
relative path such as `"./a.atto"`. Nested selectors traverse exported
**module/namespace declarations**, not values or fields of a runtime object.

The declaration `use namespace name;` is a distinct, legacy **source
namespace header**, not a dependency import, and must not be blindly rewritten
to `import namespace name;`. It needs a separate namespace-declaration
migration. Likewise, `using`, `with`, trait/inherited-member aliasing, and
ordinary uses of the English verb "use" are not import directives.

## Static binding and visibility

1. Resolve the import path against the declared file/package kind before
   evaluating its export table. Never interpret a path as executable code.
2. Named selectors must correspond to statically declared public exports;
   a missing export or inaccessible `pub[pkg]` binding is a compile error.
3. Renaming with `as` affects the local binding, not the exported identity.
4. All local import bindings must be unique and must not silently shadow
   declarations. Duplicate nested leaves are errors even if reached by
   different export paths.
5. Imported symbols are not implicitly re-exported.
6. Namespace member lookup and nested selective binding must remain statically
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

- Parse namespace and named imports with and without `pkg`.
- Parse statically nested export selections and renames.
- Reject empty selections, missing `from`, unquoted selectors, malformed
  braces, invalid aliases, duplicate bindings and unbounded nesting.
- Reject attempts to import private/package-scoped exports across boundaries,
  or to select instance/runtime object fields statically.
- Reject unresolved module files and package paths without executing them.
- Verify reachability for both `import * as` and named imports, preserving
  required side effects and actor/reflective entrypoints.
- Run compiler + *guest* execution on a real multi-file/package fixture
  before marking imports executable in the browser playground.
