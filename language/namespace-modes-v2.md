# Source namespace modes v2 — file-local default and explicit folder aggregation

**Owner-directed TARGET, 2026-11-27; NOT_EXECUTED.** This amendment supersedes the folder-default and folder-suffix derivation in unified static imports v1, the older default namespace roadmap, and conflicting header/identity rules in static imports v2. It extends the namespace completion amendment for declared nominal types. It is not evidence of compiler or runtime support.

## Five spellings, three identity kinds

| First source header | Effective mode | Canonical scope key within authenticated package P |
| --- | --- | --- |
| `use namespace x;` | Named | (P, NAMED, x) |
| `use default namespace;` | File | (P, FILE, canonical logical source-unit ID) |
| Omitted | File | (P, FILE, canonical logical source-unit ID) |
| `use file namespace;` | File | (P, FILE, canonical logical source-unit ID) |
| `use folder namespace;` | Folder | (P, FOLDER, canonical logical parent-directory path) |

File/default/omission are exactly equivalent for the same source unit, including symbol identity, ABI, resolution and incremental cache identity. None makes a package-wide or folder-wide ambient scope. A file's spelling is retained for formatting and diagnostics, not type identity.

Named mode accepts existing valid dotted names; participating files anywhere in the same pinned package and exact named namespace form one closed compilation scope. Child or sibling names are distinct. Folder mode opts a file into its immediate containing folder's scope; only other files explicitly opting into folder mode in that exact folder participate. No recursion into subfolders, no implicit inclusion of default/named files, no directory walking. Derive the full package-relative logical folder path, not its leaf name or a suffix. At package root use the empty path as a valid distinguished root-folder key. Same-named folders in different paths/packages are distinct. Named and folder scopes are tagged separately: `use namespace net.util;` does not merge with a folder key for net/util. Contextual header words default, file and folder do not create names.

## Grammar and context

```ebnf
source_unit = [ namespace_header ], { import_decl }, { top_level_decl } ;
namespace_header = "use", "namespace", qualified_name, ";"
                 | "use", "default", "namespace", ";"
                 | "use", "file", "namespace", ";"
                 | "use", "folder", "namespace", ";" ;
```

At most one header, first top-level item before imports or declarations; whitespace/comments may precede it. Preserve source spelling when formatting. Reject duplicate/mixed/misplaced headers, malformed names and missing delimiters using the existing grammar. New profile rejects `use default namespace(N);` for all N; the old folder-suffix grammar and old meaning of bare default survive only under an explicitly selected legacy edition/profile. Migration of old folder-derived sources is explicit: use folder namespace for intentional exact-folder aggregation or a named header to preserve intended suffix grouping. Do not silently reinterpret an existing legacy build, rewrite headers without semantic proof, or auto-select legacy based on a parse failure.

The resolver assigns canonical logical source IDs and folder keys from a manifest-pinned immutable source snapshot. Reject duplicate path aliases, absolute/traversal paths, ambiguous normalization and unauthenticated package claims; never derive identity from host cwd, absolute machine path, leaf filename or symlink target. Do not silently sanitize folder names. Folder keys are logical path identities, not dotted identifier expressions. An isolated source-only API may assign a unique build-local virtual unit ID to a single file/default/omitted input; it must not merge separate inputs or publish unstable cross-build ABI. Folder mode requires verified logical path context; multi-file linking requires authenticated package/source identities. Named mode does not require deriving names from paths, but still requires package provenance for cross-file aggregation.

## Visibility, attachments and imports

For every nominal owner, bind constructors/mtd/layout contributions only from the exact same scope key and owning module path. In file mode the attachment must be in that same file; other files may import an exported type but cannot complete it. Named and folder modes collect from all and only participating source units in the pinned snapshot; no ambient import or attachment authority for unrelated files. Even within one scope, enforce member visibility, ownership, constructor initialization, inheritance, implements, actor ingress and sealed-state rules. All concrete owners must be complete before executable emission/tree shaking. Same-spelled declarations in distinct scopes are different nominal types, not duplicate declarations. Duplicate owner/slot in one scope fails. Public/package visibility never grants authority to attach methods. Namespace mode does not make the header a runtime value or publish private declarations.

Imports still require normal resolved export/visibility checks across distinct scopes. Explicit file imports can bind the verified export view of any file mode, not merge its scope. Same-scope declaration visibility follows existing language rules; import aliases do not affect the scope key. For named hierarchy import roots, preserve static imports v2's self/super rules; file-local modes have no named namespace parent and cannot use those namespace-path roots. Folder mode may resolve self/super only through an explicitly admitted logical namespace graph, never a filesystem walk or implicit enrollment of parent files. Unsupported path roots must fail closed.

## Completion and incremental guarantees

The declaration index key includes (package, tagged scope key, module path, nominal kind, nominal name, generic identity). Completion, duplicate detection, lookup, layout and interface checks are independent of file order. No attachment after closure. In file mode moving a source to a different canonical logical ID changes its owner identity; in folder mode moving between folders changes identity and both membership sets; moving a named file within the same scope does not itself rename its types. Changing between file spellings is identity-preserving; changing effective mode/name/folder invalidates dependent typed IR, layout/ABI, negative lookups and cache witnesses. Clean/incremental equivalence is mandatory. A legacy profile must use a separate cache/ABI profile key.

## Acceptance cases (all NOT_EXECUTED)

- The same guest with omitted, default, and file headers produces equal typed identities and expected output 42; same-file declare/constructor/mtd completes for each.
- Two file-mode sources in one folder can each declare Foo with distinct identities; cross-file attachments rejected in every pair of file spellings. Public import remains valid without attachment.
- Named participants split across directories complete one Foo; different names, child names and packages fail attachment; duplicates within one named scope fail.
- Folder participants in one direct directory complete one Foo; same leaf in different parent directories, nested folder, root vs child, named vs folder and nonparticipating default/file siblings are distinct; reject cross-scope attachments.
- Folder root path is valid; absent logical path, traversal, alias collision and forged package provenance reject. Single-file virtual context cannot masquerade as a multi-file namespace.
- Reject duplicate/misplaced headers, malformed names and legacy depth in new edition; exercise explicit legacy migration; formatter preserves all five forms and header position.
- Reverse source order, remove/move contributor, change mode, change visibility/ABI, stale cache, invalid unused owner; clean-vs-incremental compiler behavior must agree.
- Compile actual positive guests and negative cases with no emitted executable; report parser, binder, type checker, link and guest results separately for each backend. Source-only contract/schema validation is not guest evidence.
