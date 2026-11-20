# 09 — Modules, Packages, Import Resolution and AOT

**Status: DRAFT.** Source/manifest discovery is a security-sensitive compiler operation.

## Modules and visibility

A source file can contain namespaces, imports, functions, classes, actors and module declarations. A module is a named namespace. Imports identify what is selected (`class`, `actor`, `fnc`, `module`, `type` and other admitted types), not arbitrary permission to execute host code. Module exports use `pub`; source APIs are private by default.

```atto
define pub module math as
  pub fnc add(int a, int b) -> int ::
    return a + b
  end
end

import * as math from "+/lib/math";
```

This is canonical unified static-import syntax. The old `import module math from "+lib/math"` is migration-only. Exact source ordering, safe resolution and executable linking still require backend-specific fixtures.

## Project root and resolver safety

The `+` import prefix refers to the governed package root. Canonical AttoLang packages use the nearest applicable `.atto.pkg.toml`; `.ores.pkg.toml` is a migration-only fallback where permitted. An invalid canonical manifest MUST fail closed even if a legacy sibling exists. `ATTOLANG_PATH` is the canonical extra-root environment setting in compilers that implement it; legacy `ORESLANG_PATH`, `ORES_PATHS`, and `.oreslangc.cfg.toml` must be admitted only through separately documented compatibility modes. An explicitly present but empty canonical setting must not silently enable legacy roots. No environmental path list may grant capabilities to the guest.

- `./` and `../` are relative to the importing file and cannot escape their governed physical package.
- Unqualified names search declared project/source roots first, then admitted environmental paths; compiler and runtime must resolve the **same identity**.
- An explicit `foo.atto` resolves only that file; explicit `foo.ores` resolves the legacy file when permitted.
- For a canonical `.atto` importer, extensionless `foo` resolves `foo.atto` **only** within the selected search root. The presence of `foo.ores` or `foo.java` beside `foo.atto` cannot change the result; if `foo.atto` does not exist, fail closed instead of falling through to legacy siblings. Explicit `foo.ores` remains a migration-only spelling when permitted.
- A legacy `.ores` importer may use an explicitly versioned legacy resolver policy, but it must not silently change canonical `.atto` import behavior. Within a resolution tier, multiple distinct canonical candidates with equal priority must be diagnosed deterministically, not chosen by directory enumeration or filesystem race.
- Symlinks, hardlinks, nested packages, case/extension aliases and package-boundary traversals must be checked before foreign source is read or compiler IR is produced. The linker, macro expander, formatter and incremental cache MUST consume the same canonical logical source-unit identity, with root/package authority attached. Host absolute paths (including drive letters, network shares and symlink aliases) may only be translated through a verified selected package root; they are not valid public import or macro source-unit IDs. An import cannot gain a new identity or a different permission set by spelling an alternate host path.
- Import graphs can contain cycles when the language’s staged linking/initialization contract permits them; every peer in an SCC must be linked before its file initialization is run.

No source path grants additional filesystem, FFI or network authority to runtime guest code.

### Canonical import conformance examples

| Importer | Import | Files present in the selected root | Required result |
| --- | --- | --- | --- |
| `main.atto` | `import ... from "./value"` | `value.atto`, `value.ores` | Resolve `value.atto` |
| `main.atto` | `import ... from "./value"` | `value.ores` only | Reject (no implicit legacy fallback) |
| `main.atto` | `import ... from "./value.ores"` | `value.ores` | Admit only in explicit legacy compatibility mode |
| `main.atto` | `import ... from "+/value"` | Governed project root has `value.atto` | Resolve using the validated nearest canonical package root |

Resolution, parsing, macro expansion and linked guest execution must each consume the **same selected file identity**. Tests must include symlink escape, malformed canonical/valid legacy manifest collision, case-fold collisions, root-import traversal and chained imported macros. A parser-only success is not a linked-execution receipt.

## Compilation modes

| Mode | Intended meaning |
| --- | --- |
| Interpreter/JIT | Guest may be interpreted/tier-compiled at runtime |
| Hybrid | AOT runtime with explicitly governed guest tiering, if platform admits it |
| Full AOT | All reachable guest application code precompiled with no interpreter/JIT fallback in production |
| Embedded | Freestanding profile with explicitly bounded runtime/stdlib subset |

A **GraalVM Native Image of a guest-language interpreter is not itself full guest AOT**. LLVM may compile an admitted subset to native code while still lacking general-language AOT coverage. .NET Native AOT, Wasm and Forge require their own proof of static code, linker reachability and supported dynamic features. Unimplemented full-AOT features must fail at build time rather than silently invoke a source evaluator at runtime.

Tree shaking preserves reachable code, types, effect metadata, static reflection registries, actor messages and dynamic dispatch edges. An AOT build must not discard functionality merely because it is reached via a compiler-known registration rather than a literal call.

## Introspection and hot loading

Runtime reflection is not a mandatory prerequisite for language features. Reflection/introspection APIs must remain full-AOT-compatible through compiler-generated static metadata and explicit capability-gated registries. Closed-world full-AOT artifacts must not silently use runtime host reflection or emit arbitrary executable code.

Hot loading can introduce validated source/IR into a new code generation in explicitly dynamic profiles, with new permissions checked and old handles generation-fenced. The existence of that mechanism does **not** mean a closed-world full-AOT artifact can JIT new arbitrary guest methods.

## Version stability

Do not change historical `oreslang` CLI, binary/wire protocol, package coordinates, ABI, code-unit identities, manifest formats, or persistent keys merely for the AttoLang brand. Version the migration and test old/new filenames against each selected backend.
