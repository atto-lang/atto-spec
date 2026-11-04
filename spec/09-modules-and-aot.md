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

import module math from "+lib/math"
```

This documents intended spelling; the exact source ordering, grammar and executable support require backend-specific fixtures.

## Project root and resolver safety

The `+` import prefix refers to the project root resolved from the nearest applicable `.ores.pkg.toml`. `ORES_PATHS` supplies additional explicit source discovery directories under a versioned path-list contract. Existing `ORESLANG_PATH` and `.oreslangc.cfg.toml` behavior is a **legacy compatibility path** that must be reconciled rather than silently renamed.

- `./` and `../` are relative to the importing file and cannot escape their governed physical package.
- Unqualified names search declared project/source roots first, then admitted environmental paths; compiler and runtime must resolve the **same identity**.
- An explicit `foo.atto` resolves only that file; explicit `foo.ores` resolves the legacy file when permitted.
- An extensionless import with both `foo.atto` and `foo.ores` candidates is **ambiguous** and must fail rather than silently choose one.
- Symlinks, hardlinks, nested packages, case/extension aliases and package-boundary traversals must be checked before foreign source is read or compiler IR is produced.
- Import graphs can contain cycles when the language’s staged linking/initialization contract permits them; every peer in an SCC must be linked before its file initialization is run.

No source path grants additional filesystem, FFI or network authority to runtime guest code.

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
