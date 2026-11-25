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

import namespace math from "+/lib/math";
```

The namespace-first spelling follows the latest static-imports v2 target (#227). Both `import * as math from "+/lib/math";` and the older `import module math from "+lib/math"` are migration spellings; no source resolver or linker support is implied. Preserve explicit typed module selection where admitted.

## Compiler-owned libraries

`core`, `alloc` and `std` are reserved library roots with Rust-like layering
(freestanding core, allocator-backed alloc, hosted std). Selectors, import
forms, platform variants and the v1 unit catalog are normative in
[language/core-alloc-std-libraries-v1.md](../language/core-alloc-std-libraries-v1.md).

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

## Live runtime instrumentation: JIT versus full AOT (v1 target)

Instrumentation is native **compiler/runtime functionality** with a
host-authorized, budgeted control plane; neither application monkey-patching,
Java agents, runtime reflection hooks nor arbitrary source-code rewriting is
required.

- **Already compiled probes:** a trace-capable build may retain dormant,
  statically typed boundary/function probe sites while tracing is off.
  Enabling recording at runtime does not require restart, new executable
  code, or weakening the program's security profile. `--instrument=none`
  emits no **static** optional probe sites and cannot enable those precompiled
  sites through a flag. This does **not** preclude a separately admitted JIT
  dynamic-attach feature if the runtime retained tagged AST/bytecode metadata;
  strict stripped builds with no such metadata cannot add probes.
- **Truffle guest JIT:** a registered trusted Atto Truffle instrument may
  dynamically attach execution-event nodes/listeners to tagged Atto
  functions or activate a predeclared Bytecode DSL instrumentation table
  while execution continues. Existing optimized code is invalidated or
  re-tiered at safe points and **future** function entries become observable.
  This requires real instrumentable Atto nodes/bytecode, stable source
  descriptors and runtime support; the mere use of GraalVM is not proof.
- **Independent Forge/other JITs:** optional, conditioned on evidence of
  retained IR/tags, safe deoptimization, backend-verified lifecycle and
  authorized instrumentation control. Do not assume Java's implementation
  transfers to Forge, LLVM, Wasm or Native AOT.
- **Sealed guest full AOT:** no arbitrary JIT or runtime generation of new
  guest code. Only previously compiled probes can be activated in place.
  A separately authorized **precompiled and validated** module generation
  might be hot-loaded where the program's explicit deployment profile
  permits it; this is a new artifact, not magic reinstrumentation of an
  opaque existing native binary. Old call frames remain generation-fenced.
- **Wasm and .NET Native AOT:** statically admitted probes and, where
  explicitly supported, separately validated new module instances; no
  browser JS monkey patching, unrestricted managed JIT or imported
  reflection-codegen fallback.

Live activation controls MUST be authenticated/authorized, audited,
rate-limited and budgeted by class of probe. A target must report its
actual coverage: precompiled probes enabled, JIT probes attached, new
module generation deployed, or instrumentation unavailable. It may not
promise retroactive spans for already-entered frames or infer lost
timestamps. Deopt, recompilation, exporter backlog and dynamic filters
are bounded; actor supervisor CONTROL, borrowing and data-plane
nonblocking invariants remain unchanged.

An explicitly requested [`using` span](03-functions-and-effects.md#existing-using-keyword-deterministic-scoped-resources-v1-target)
can be created in any profile that admits `ores.std.telemetry`. Its source
spelling and cleanup rules are the same across execution profiles.

| Deployment | Scoped span behavior |
| --- | --- |
| Full AOT | Lower explicit and macro-generated `using` scopes before linking. The sealed artifact can record at the sites it includes when the host enables them. |
| JIT instrumentation | A supported host can add automatic call probes to checked code with retained instrumentation metadata. Explicit `using` still has its ordinary lexical meaning. |
| Hybrid | Keep an independently executable AOT baseline and permit governed JIT call probes. Both paths use the same logical trace context and the same identity for each lexical site. |

When a backend admits statement macros, a macro may emit a `using` span
scope and its binding. Expression macros may supply operands accepted by
the backend's span scope, such as a compile-time name. Recheck expanded
code for the same resource provenance, effects, ownership, and cleanup as
handwritten code. Preserve expansion provenance when assigning lexical
site identities. The macro expansion is complete before guest execution
in AOT, JIT, and hybrid deployments.

In a hybrid version, one entry into a lexical `using` site produces at
most one recorded span for that site. An automatic call probe may create a
distinct parent or child span with its own site identity. A scope admitted
for recording keeps its cleanup obligation through policy changes,
detachment, and code-generation changes. New recording policy applies to
subsequent admissions.

Verify AOT and live JIT independently for `atto-source.java`,
`atto-source.llvm`, `atto-source.net`, `atto-source.rs`,
`atto-source.cranelift`, and `atto-source.forge`. Each backend needs a real
guest built and run with its runtime compiler disabled or absent for AOT
credit. JIT credit requires execution of newly instrumented code, and
hybrid credit requires both paths in the same workload with parentage and
exactly-once cleanup verified.

Release evidence requires real exact-head .atto compiler and guest tests, separate
`none/off/on` measurements, actor cancellation/hot-reload traces and
independent per-backend evidence.
