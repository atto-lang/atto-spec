# Static imports, package identities and namespace resolution (v2)

**Status:** owner-directed target, 2026-11-24; DRAFT. Not implementation or guest evidence.

This amendment supersedes conflicting import grammar, selector, binding and collision rules in [unified static imports v1](unified-static-imports-v1.md), [core/alloc/std v1](core-alloc-std-libraries-v1.md) and [file/module constants v1](file-module-const-v1.md). Unchanged: public visibility, package isolation, library layering, target admission, initialization, source-file header rules and capability checks. Rationale: standard recognizable names for humans, documentation and AI training; aliases only when useful; no JavaScript-style star alias required.

## 1. Resolver domains

```atto
import namespace http from std.http;
import namespace math from core.math;
import namespace collections from alloc.collections;
```

Single quotes, double quotes and bare dotted built-in selectors denote the **same registered library identity**:

```atto
import namespace http from 'std.http';
import namespace math from "core.math";
import namespace collections from 'alloc.collections';
```

These are independent examples, not repeated declarations in one unit. Canonical user-facing identities are dotted, without `pkg`. A known old registered `atto.std/http`, `std/http` or `std/http.atto` selector can be supported as a compatibility spelling only if it resolves to the same compiler-owned unit. Do not revive `ores.*`, or guess that a different unit (e.g. num versus math) is an alias. A missing registered identity fails closed; these examples specify syntax, not availability of every unit. Existing layer, allocator and target gates remain in force. Built-in namespace view is independent of whether its implementation uses file-root declarations or a declared module; preserve public ABI via a registered export table. `import module` still selects actual public module declarations.

```atto
import namespace http from pkg '@std/network/http';
import namespace math from pkg '@core/math/math';
import namespace collections from pkg '@alloc/data/collections';
import namespace std.http from pkg '@std/network/http';
import namespace core.math from pkg '@core/math/math';
import namespace alloc.collections from pkg '@alloc/data/collections';
```

The external names and dotted lexical bindings are allowed even if they resemble built-ins. Trust is attached only to authenticated resolved identity, never lexical spelling. Earlier two-component examples such as `@std/http` are legacy compatibility candidates, not canonical new publication names. `pkg 'std.http'` is external if admitted by the legacy registry; it must never resolve to the builtin. Quoted relative paths (`./utils.atto`, `../utils.atto`) select local files; existing explicit project-root `+/` compatibility remains confined to its project. No fallback among domains; no filesystem search for an unknown built-in, registry fallback for missing local file or reinterpretation of failed URL imports.

## 2. Syntax and binding

```atto
import namespace http from std.http; // preferred
import http from std.http;           // namespace shorthand, not a function
import std.http from std.http;       // explicit qualified namespace
import namespace std.http;          // same qualified built-in binding

import fnc sleep, now from std.time;
import const PI from core.math;
import module http, http3 from std.http;
import class Path from std.fs;
import actor Worker from pkg '@acme/jobs/worker';
import enum Status from std.http;
import trait Readable from core.io;
import interface Writable from core.io;

import namespace utils from './utils.atto';
import * as legacy from "std.http";  // compatibility only
```

Examples show alternative forms, not a single conflict-free file. Typed selectors must match public declarations of the indicated kind; named modules must exist, and must not be synthesized from a namespace. No braces or trailing commas in unbracketed from-lists; sections 2.1–2.2 define separate delimited mixed-list and import-tree forms. A bare single dotted selector followed by `from` is namespace shorthand in v2, not a selective value import. Existing untyped comma-separated selectors remain compatibility forms; migration of older single/dotted selectors requires semantic proof.

```ebnf
import_decl = "import", ( package_import | namespace_import |
              typed_import | mixed_import | direct_import | compatibility_import ), ";" ;
package_import = "pkg", string, [ "as", qualified_name ] ;
namespace_import = [ "namespace" ], namespace_spec,
                   { ",", namespace_spec }, "from", source
                 | "namespace", builtin_name ;
namespace_spec = qualified_name, [ "as", qualified_name ] ;
typed_import = import_kind, export_spec, { ",", export_spec },
               "from", source ;
import_kind = "fnc" | "module" | "const" | "class" | "actor" |
              "enum" | "type" | "trait" | "interface" ;
export_spec = qualified_name, [ "as", identifier ] ;
source = builtin_name | string | "pkg", string ;
qualified_name = identifier, { ".", identifier } ;
builtin_name = ("core" | "alloc" | "std"), ".", identifier ;
```

Disambiguation: a comma-separated namespace list requires the explicit `namespace` keyword; untyped comma lists are legacy selective imports. A bare single namespace selector can be dotted. Compatibility star-as always binds a source's public export view. Strings are static literals, no interpolation or computed imports. Semicolons follow existing source grammar. Built-in units remain flat in this amendment; nested exported namespaces inside a unit are not new library units. `use namespace` and `use default namespace` remain distinct optional first source headers; `using` is a resource scope, not import.

### 2.1 Mixed-kind selectors with explicit delimited groups

An outer pair of parentheses or square brackets may introduce a heterogeneous selection list. An outer delimiter is not required when every top-level item specifies its kind. Same-kind groups may use either kind-first spelling, such as `class (C, D)` or `class [C, D]`, or the earlier kind-inside spelling, such as `(class C, D)` or `[class C, D]`. Parentheses and square brackets are interchangeable at each grouping position independently; each opening delimiter must match its own closing delimiter. All are static syntax, not runtime tuple, array, call or destructuring expressions.

```atto
import class (C, D), fnc (f, g), module m, namespace (z) from pkg '@a/b/c';
import
    class [C, D as Data],
    fnc [f as fetch, g],
    module (m, n),
    namespace (z)
from pkg '@a/b/c';
import ([class C, D], fnc [f, g], module m, namespace [z]) from pkg '@a/b/c';
import (class C, fnc f, (module x, y, z)) from pkg '@foo/bar/baz';
import [class C, fnc f, (module x, y, z)] from pkg '@foo/bar/baz';
import (class (C, D), fnc (f, g), module m, namespace (z)) from pkg '@a/b/c';
import class C, fnc f, module m from pkg '@a/b/c';
```

The first example selects two classes, two functions, one module and one namespace. It is equivalent to:

```atto
import class C, D from pkg '@a/b/c';
import fnc f, g from pkg '@a/b/c';
import module m from pkg '@a/b/c';
import namespace z from pkg '@a/b/c';
```

Every mixed-list item is either a kind-qualified single selector or an explicitly delimited same-kind group. Kind inheritance is confined to the group and never crosses a top-level comma. All group spellings permit a single selector: `namespace (z)`, `namespace [z]`, `(namespace z)` and `[namespace z]` introduce exactly the same binding as `namespace z`. Empty groups, kind changes within a group, further inner nesting, missing kinds, mismatched delimiters and leading/double commas are errors. A single trailing comma is allowed in an outer delimited list only; no trailing comma inside a same-kind group or an undelimited list.

The pre-existing unbracketed homogeneous shorthand `import class C, D from source;` remains valid. If an undelimited list contains a new kind or an explicit group, it is a mixed list and every item must satisfy the mixed-item grammar. In particular `import class C, fnc f, module x, y, z from source;` is invalid; use `module (x, y, z)`, `module [x, y, z]`, `(module x, y, z)`, `[module x, y, z]` or repeat the kind. Namespace selections use namespace_spec and section 3; other kinds select actual public declarations of that kind. Aliases apply individually. Resolve the source once, check all selections and introduce bindings atomically. All source domains follow section 1.

```ebnf
mixed_import = ( "(", mixed_items, [ "," ], ")"
               | "[", mixed_items, [ "," ], "]"
               | mixed_items ), "from", source ;
mixed_items = mixed_item, { ",", mixed_item } ;
mixed_item = import_kind, export_spec
           | "namespace", namespace_spec
           | import_kind, "(", export_list, ")"
           | "namespace", "(", namespace_list, ")"
           | "(", import_kind, export_list, ")"
           | "(", "namespace", namespace_list, ")"
           | import_kind, "[", export_list, "]"
           | "namespace", "[", namespace_list, "]"
           | "[", import_kind, export_list, "]"
           | "[", "namespace", namespace_list, "]" ;
export_list = export_spec, { ",", export_spec } ;
namespace_list = namespace_spec, { ",", namespace_spec } ;
mixed_kind = import_kind | "namespace" ;
```

Disambiguate an initial parenthesis or bracket containing a kind followed by an unmarked comma-separated name list as a single kind-inside group when the complete clause matches that form; otherwise parse as an outer mixed list. Thus `import (class C, D) from source;` is a single class group, whereas `import (class C, fnc f) from source;` is an outer mixed list; the square-bracket counterparts have identical semantics. Existing homogeneous lists and direct-path imports keep their semantics. Formatter preserves delimiter and group placement, including singleton parentheses or brackets, and aliases; any semantic rewrite requires proven equivalent bindings.

### 2.2 Direct qualified paths and Rust-style import trees

Use import rather than use and a single dot rather than Rust's double colon. These forms are complementary to from-imports and lower to the same static typed binding IR.

```atto
import std.collections.HashMap;
import std.collections as col;
import class std.collections.HashMap;
import fnc std.time.sleep;
import const core.math.PI;
import namespace std.collections;

import std.{
    collections.{HashMap, HashSet},
    io.{Read, Write},
};

import std.{
    collections.{class HashMap, class HashSet as Set},
    io.{trait Read, trait Write},
    time.{fnc sleep, fnc now},
};

import std.collections.{self as col, HashMap, HashSet};
```

Examples are alternatives, not one scope. An untyped direct leaf selects a unique static public declaration, inferring its kind from the authenticated export table, not the runtime type of an expression. A typed leaf asserts its declaration kind. Ordinary leaves bind the final component or an explicit alias; the previously specified special form import namespace std.collections; preserves its exact qualified binding. A direct unaliased builtin namespace leaf may expose its natural and full name as in section 5. The self leaf binds the current group prefix itself (natural final name or explicit alias), not a runtime receiver. A group expands recursively into explicit leaves, with no implicit import of every other member or automatic runtime initialization. Each leaf kind is independent in a brace tree (as with top-level mixed-list items; only explicitly delimited same-kind groups inherit a kind). Nonempty nested brace groups permit one trailing comma. Braces are only import-tree syntax after a dotted prefix, never destructuring in a from-list. No new flattened wildcard import (import std.collections.*;) in this draft; retain legacy star-as namespace compatibility only.

```atto
use namespace network.http;

import pkg.network.http;    // current package's logical export hierarchy
import pkg.config;
import super.config;        // parent namespace
import super.super.config;  // grandparent
import self.utils;          // current namespace
```

The contextual roots pkg, self and super are namespace paths only in this import grammar; pkg followed by a string remains the external dependency selector. Root paths use the pinned current package's declared namespace graph, not a physical directory walk. They do not modify the separate pkg:: / imports:: callable lookup semantics. self/super require an explicit or derived source namespace; no invented implicit namespace for headerless units. Reject traversal above package root. Apply existing same-package and private visibility rules; no access to another package via super. Do not treat a group self leaf as a lexical self root.

```atto
import pkg '@atto-lang/network/http';
import http.HttpClient;
import atto_lang.network.http.{HttpRequest, HttpResponse};
```

A direct path may start with an already admitted dependency or alias, subject to the same suffix ambiguity and collision rules; no external dependency discovery or installation from a bare path. Establish explicit source/package imports before resolving dependent direct paths (independent of textual ordering), reject cyclic alias resolution, and do not let a member's existence disambiguate an ambiguous package prefix. Builtin root paths resolve through the registered builtin catalog and target admission when not explicitly rebound; lexical rebinding never authenticates a compiler-owned symbol. Group imports are all-or-error. The syntax does not grant capabilities or bypass effects, ownership, visibility or AOT reachability.

```ebnf
direct_import = [ mixed_kind ], direct_tree ;
direct_tree = direct_path, [ "as", qualified_name ]
            | direct_path, ".", import_group ;
direct_path = import_root, { ".", identifier } ;
import_root = identifier | "pkg" | "self" | "super" ;
import_group = "{", group_leaf, { ",", group_leaf }, [ "," ], "}" ;
group_leaf = [ mixed_kind ], ( direct_tree | "self", [ "as", identifier ] ) ;
```

This is a target grammar sketch: parser must distinguish a terminal dot followed by a group from a dotted identifier; repeated super components are contextual only at the root, and self as a group leaf is special. Typed group prefixes are not required: specify kinds on individual leaves. Reject use as the import verb and :: as an import-path separator. Validate all new names before publishing bindings; duplicate explicit declarations and ambiguous automatic candidates follow sections 5–6.

Additional NOT_EXECUTED acceptance cases: mixed lists (equivalent outer parentheses, brackets and explicit undelimited lists, kind-first and kind-inside groups using either delimiter independently, mixed delimiters, singleton groups, parenthesized x/y/z module group, explicit repeated kinds, no cross-item inheritance, aliases, wrong-kind, mismatched delimiters, malformed and excessive-nesting negatives), all source domains, duplicate names and no partial binding; direct leaf inferred/typed kind, nested group expansion, self leaf aliases, current/parent/grandparent lookup, root escape and headerless negative, external suffix ambiguity and no discovery, cyclic alias graph, private exports, invalid/empty groups, trailing comma behavior, and flattened-star denial. Compare equivalent from/direct/group/mixed guests and formatter round-trips at exact compiler heads.

### 2.3 Equivalent built-in namespace spellings and exact binding sets

The following are independent alternatives, not a single source file:

| Declaration | Static namespace bindings |
| --- | --- |
| `import namespace num from core.num;` | `num`, `core.num` |
| `import num from core.num;` | `num`, `core.num` |
| `import core.num from core.num;` | `core.num` only |
| `import core.num as num;` | `num` only |
| `import core.num as core.num;` | `core.num` only |
| `import core.num;` | `num`, `core.num` |

All resolve the same registered compiler-owned identity; aliases do not change identity or acquire new privileges. Explicit `as` replaces automatic candidate names even when the alias equals a natural or canonical name. `import namespace core.num;` is the explicit qualified-only namespace form. The natural/full binding pair is automatic for unaliased short-from and direct namespace imports. Quoting the builtin source after from does not change semantics. The full static export graph determines collision and shadowing behavior under sections 5–6. No first-class namespace values, runtime reflection or implicit alias leakage from lowering are permitted. Legacy module syntax retains its distinct module-kind semantics.

Acceptance tests must prove both allowed and denied binding paths for every form, plus duplicate/ambiguous imports, alias conflicts with lexical declarations, private/missing members, wrong kinds and identical nominal identities across equivalent spellings. For executable direct calls, compile real guests and check results, not only token acceptance. Bounded backend subsets must reject unresolved cases without generating artifacts.

## 3. Packages, manifests and subpaths

New registry publication identity: `@org/project/package`. Each component is a nonempty registry-validated name. `@org` is an organization scope, project is a product/project family and package is the independently versioned unit. Additional slash components denote a public exported subpath, never another inferred package root. Existing unscoped or two-component identities may retain edition-gated legacy resolution; no silent identity migration. The `pkg` keyword selects the external resolver.

```atto
import pkg '@atto-lang/network/http';
import pkg '@atto-lang/network/websocket';
import pkg '@canonical/cloud/telemetry';
import pkg '@acme/database/postgres';
```

These bind public static package trees, naturally accessible as http, websocket, telemetry and postgres, respectively, when unambiguous. No exports are flattened into the lexical scope; no package object is allocated. A package can expose root functions/types and multiple public namespaces.

Preferred namespace import selects an exported namespace by name from the package manifest, independent of physical source layout:

```atto
import namespace c from pkg '@org/project/package';
import namespace http, http3, c from pkg '@org/project/package';
import namespace c from pkg '@org/project/package/a/b/c';
```

Illustrative proposed .atto.pkg.toml extension (schema to be reconciled with the actual package manager before implementation):

```toml
[package]
name = "@org/project/package"
version = "1.0.0"

[namespaces]
c = "src/a/b/c/"
http = "src/network/http/"
http3 = "src/network/protocols/http3/"

[exports]
"a/b/c" = "src/a/b/c/"
```

Namespace paths map to declared public namespace export tables, not every file in a directory. Public subpaths must be expressly exported; path traversal, symlink escapes, private modules and ambiguous/missing exports fail closed. Resolve public namespace by exact selector first; for a dotted requested binding, a final-component match is permitted only if unique in the manifest (e.g. `std.http` binding selecting exported `http`). If no such selector exists, allow a matching natural package basename to bind its root public tree; an explicitly exported subpath or direct source supplies one static namespace view and may be bound under any valid requested name. For other renaming use `as`. Never silently select a different namespace or invent exports. This exact-match/final-component/root selection rule is a draft implementation clarification, subject to review. The manifest and lockfile pin package identity, version, source digest and dependency graph. No implicit re-export.

## 4. URL dependencies

```atto
import namespace c from pkg 'https://foo.com';
import namespace http from pkg 'https://foo.com/network/http';
import namespace utils from pkg 'https://foo.com/utils.atto';
import namespace remote.http from pkg 'https://foo.com/v1.2.0/http.atto';
```

Remote package roots use authenticated manifest metadata; remote subpaths obey its export map; direct .atto URLs supply an individual checked source unit. A remote root URL without a suffix is not guessed to be an arbitrary file. Require HTTPS, explicit dependency acquisition/update, lockfile content hashes including transitive dependencies, pinned redirect provenance, bounded fetches, offline/frozen compilation from verified cache and no build or runtime script execution to discover exports. Reject unsupported schemes, insecure redirects, local/private-network access unless separately authorized by dependency acquisition policy, hash drift and unresolved dependencies. Never send credentials across origins automatically. Relative imports in remote sources are resolved in the pinned remote package/source graph, never against the consumer's local filesystem. URL origin is not a capability grant or a trusted compiler identity. Bare URL package import needs an explicit alias or a pinned manifest package identity with a valid natural name; do not invent a name from the host.

## 5. Automatic suffix qualification

For an unaliased registry package, generate candidate bindings for every valid suffix of the three logical components, with the leading @ removed and ASCII hyphen mapped to underscore in source identifiers only. Never change the underlying identity or case-fold. A candidate containing an invalid/reserved identifier is not usable; require an explicit alias if none are usable. Example:

```atto
import pkg '@atto-lang/network/http';

http.get(url);
network.http.get(url);
atto_lang.network.http.get(url);
```

All refer to the same export identity. The following pair of imports is valid:

```atto
import pkg '@atto-lang/network/http';
import pkg '@acme/network/http';

atto_lang.network.http.get(url); // valid
acme.network.http.get(url);      // valid
// http.get(url);                // ambiguous
// network.http.get(url);        // ambiguous
```

If projects differ, network.http and cloud.http can disambiguate. Do not eagerly reject overlapping automatic candidates just because they exist; diagnose an ambiguous use. Detect normalization collisions (atto-lang versus atto_lang) even at full qualification; require explicit aliases if the requested path remains ambiguous. Do not use import order, argument types, overload matching, available member names or successful resolution of a longer expression to pick among ambiguous package prefixes.

```atto
import pkg '@org/project/package' as p;
import pkg '@org/project/package' as org.package;
```

Each explicit alias is an exact qualified binding, replacing automatic suffix candidates for that import. An alias does not change dependency identity. Duplicate exact explicit aliases or a non-namespace prefix obstructing an explicit qualified alias are declaration errors. Qualified paths may share a prefix if their bindings can coexist; synthetic prefix nodes are not runtime objects. Detect exact-path and member-prefix overlaps instead of silently selecting a longest or shortest match; if different viable public bindings would interpret the same reference, report ambiguity. For unaliased builtin short namespace imports, register the natural short and canonical dotted path; explicit qualified binding registers only that path; custom alias registers the exact alias. An explicit selective namespace from a package binds its selected namespace at the requested local path, not all package suffixes.

## 6. Precedence and collisions

For a given lexical scope/path resolve the highest populated tier:

1. Explicit lexical declarations and explicit `as` aliases (including namespace aliases).
2. Deliberate unaliased imports and their generated candidates, including explicitly imported built-in namespaces.
3. Implicit compiler-provided namespace/prelude candidates **only where the target/profile admits them**. This amendment does not make every hosted std unit ambient or bypass an explicit admission requirement.

Equal-tier distinct candidates are ambiguous; never fall back to a lower tier on ambiguity or missing members. Duplicate explicit declarations/aliases at the same exact binding path are errors. Ordinary lexical scope, privacy and type rules continue to apply. Full built-in names remain available when admitted and not explicitly rebound. The following cases assume a profile admits std.http implicitly:

| Imports | http | network.http | std.http |
| --- | --- | --- | --- |
| none | builtin | unresolved | builtin |
| @atto-lang/network/http | external | external | builtin |
| both Atto and Acme network/http | ambiguous | ambiguous | builtin |
| both plus explicit import namespace http from std.http | ambiguous | ambiguous | builtin |

```atto
import pkg '@atto-lang/network/http';
import pkg '@acme/network/http';

std.http.get(url);               // official, if admitted
atto_lang.network.http.get(url); // external Atto
acme.network.http.get(url);      // external Acme
```

Qualified lexical bindings resembling built-ins remain legal:

```atto
import namespace std.http from pkg '@std/network/http';
```

Here std.http is the external binding, shadowing an implicit builtin only; its identity is still external. To access the official unit simultaneously, give it a distinct explicit alias, e.g. `import namespace http as official_http from std.http;`. The right-hand source resolves in the builtin domain independently of lexical shadowing. If the official std.http is explicitly admitted under the same qualified name, report a collision/ambiguous reference rather than choose a winner. No import grants network, filesystem, allocator or privileged intrinsic rights. Compiler-owned privileged operations must check authenticated symbol identity and target/capability policy.

## 7. Compile-time namespace aliases

```atto
import pkg '@atto-lang/network/http';
import pkg '@acme/network/http';

define alias atto_http = atto_lang.network.http;
define alias acme_http = acme.network.http;

atto_http.get(url);
acme_http.get(url);
```

The canonical `define alias name = qualified_name;` declaration may bind a statically resolved package/namespace reference, including an interior public namespace. It is an immutable lexical alias, not a first-class runtime value; it allocates no object, adds no initialization, cannot be passed or returned as a runtime value, mutated, reflected into runtime data or used to bypass public exports. Forward aliases are legal: `define alias first = second; define alias second = core.num;` resolves both names to the already imported namespace. Collect all alias declarations in a lexical scope before resolving their RHS paths. Treat references to pending aliases, including qualified references through their first component, as dependency edges. Reject self-cycles and indirect cycles (including unused aliases) before publishing any alias binding or emitting an artifact. Diagnose the cycle with a deterministic path, e.g. `a -> b -> c -> a`; never break cycles by falling back to another import or an implicit prelude binding. Use bounded nonrecursive graph traversal and enforce aggregate declaration/binding limits. Reject unresolved/ambiguous references, duplicate declarations and attempts to alias runtime object members as namespaces. Original imports remain available; `define alias` does not remove their candidate suffixes. A namespace alias is not a value for `import const`; namespace re-export is governed separately by public export rules, not implicitly enabled by this draft. Existing typed constexpr and startup-once env-backed static constants keep their existing type and initialization rules. The declaration is distinct from constant and module grammar: `define const` remains for value constants; `define namespace const` and the earlier untyped namespace-constant spelling are not accepted as alias declarations. No type-alias or general runtime value-alias semantics are implied by this amendment. Grammar: `namespace_alias = "define", "alias", identifier, "=", qualified_name, ";" ;`. The alias is file-scoped, not public or re-exported by default.

## 8. AOT, tooling and evidence

One static export graph after authenticated source resolution. Nominal identity includes resolved package instance/version/source identity plus declaration identity; normalized spelling and aliases do not merge separate types. Preserve overload sets, effects, ownership/borrow constraints, actor capabilities, initialization/SCC and side-effect-safe reachability. Selective compilation by file/namespace/package; no runtime downloads, dynamic module lookup or namespace object. Target unsupported import kinds fail before artifact emission. Formatter prefers explicit `import namespace` without stars or manufactured aliases, preserves author quote choice and meaningful qualification; no identity-changing migration without resolved proof. LSP should report ambiguous candidate identities and offer shortest unambiguous or explicit qualified alternatives, never silently rewrite. Diagnostics must be deterministic across import order and backends.

Required acceptance matrix (all NOT_EXECUTED): quoted/bare builtin identity equivalence for all three layers; actual registered exports and denied unknown names; local vs package vs URL domains; namespace vs fnc/const/module kind checks; public manifest lookup and exported subpath; hidden/traversal/symlink rejection; alias and suffix equivalence; two-package and three-way explicit builtin collisions; different project suffixes; normalization collisions; implicit vs explicit priority; no fallback on ambiguity/missing members; qualified external builtin-like name and authenticated intrinsic denial; namespace aliases, chains, cycles, runtime misuse; URL lock/hash/redirect/offline negatives; file namespace header rules; same resolved nominal type across aliases and distinct type across dependencies; identical AOT results and no runtime networking. Test import permutations, prefix conflicts, target layering and side effects.

Implementation follow-up: reconcile spec #217 (const imports) and #114 (assert module), package/common-source export contracts, formatter, LSP, all compiler backends and conformance. Add executable positive/negative .atto guests with exact head/tree receipts, independent review and stepful CI. Parser acceptance, source checks and zero-step runner runs do not establish linker or guest parity. Do not mark ready or merge based on this document alone.
