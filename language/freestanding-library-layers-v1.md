# AttoLang freestanding library layers — core / alloc / std (v1)

Status: **proposed normative language/ABI contract; not implemented or cross-backend verified** (2026-11-16). This contract defines the intended boundary, not evidence that a compiler can produce a bare-metal image. Canonical portable source belongs in `atto-common-source`; target capability metadata in `atto-target-profiles`; executable fixtures in `atto-platform-conformance`.

## Required dependency DAG

```text
std (hosted OS/adapters) --> alloc (optional provided heap) --> core (freestanding)
         |                         |                         ^
         +-------------------------+-------------------------+
```

- `core` depends **only** on language intrinsics and a target-defined primitive ABI, with **no mandatory OS, libc, heap allocator, file descriptors, thread runtime, network service, wall clock, WASI host import, process/environment service, or host GC**.
- `alloc` may depend on `core` and an **explicitly supplied allocator ABI** (allocation/deallocation/alignment/OOM policy). It must not require an OS, libc, system malloc, scheduler, or hidden host heap. The application/platform owns allocator selection and memory bounds.
- `std` may depend on `alloc` and `core` and provides OS/host-backed facilities when available. A browser/worker, WASI, JVM or embedded RTOS adapter is **not** implicitly equivalent to a Unix/POSIX host: `std` APIs are capability-gated and target-specific.
- No reverse dependency is allowed: `core -> alloc/std` and `alloc -> std` are **compile/link errors**, including indirect, re-exported, generated, macro-expanded, foreign and initialization dependencies. A transitive dependency on a forbidden layer is equally invalid.
- A private implementation shim does not legalize a forbidden dependency. For all modes, unknown imports, implicit host hooks or linker symbols must fail closed.

## Types and operations

| `core` (no heap) | `alloc` (allocator required) | `std` (host/OS capability required) |
| --- | --- | --- |
| integers, floats, bool, chars, borrowed string/slice views, fixed-size value arrays | owned growable `String`, dynamic `Array<T>`, `List<T>`, `Map<K,V>`, `Set<T>` | stdin/stdout/stderr channels; files, sockets, DNS, processes |
| `Option<T>`, `Result<T,E>`, tuples, enums, checked arithmetic, pure iteration and formatting into caller-provided buffers | `Box<T>`, `Arc<T>`, growable buffers, heap-backed Error payloads | host thread/process launch; network/reactor integration; timers, environment, OS randomness |
| ownership/borrow and `Copyable`/equality traits; pure actor/message/async **type contracts** | optional actor-owned arenas and dynamic mailboxes subject to explicit allocator policy | actor executor/scheduler, host async reactor, filesystem and platform adapters |
| target-supported atomic primitives, volatile/MMIO *primitives* only where explicitly supported | no implicit global allocator; no silent OS fallback on OOM | host panic logging/stack traces only when capability is present |

These are **placement rules**, not a declaration that every item is currently implemented. `Array<T>` is classified as heap-backed only when it has growable/dynamic storage; any future fixed-array syntax and layouts must be specified separately. Pure Error *codes/data* may be core; exceptions that allocate an object or capture a stack trace must require alloc or std. `Future<T>` as a type and `susp` effect grammar need no OS; actually scheduling a suspension requires an explicitly supplied executor. Do not turn `std` into a dependency merely because a target supports atomics or a hardware interrupt.

## Modes, startup, and linking

1. **Freestanding core mode:** no implicit `std` prelude, no implicit allocator, no OS entrypoint, no synthetic `main` wrapper, no hidden process/stdio imports, and no automatic actor scheduler or host runtime initialization. Target/platform defines reset/entry ABI and trap/panic termination policy. `Option` and `Result` remain usable.
2. **Freestanding alloc mode:** same as core, but the application/platform explicitly supplies a bounded allocator with verified alignment, deterministic OOM behavior and no hidden system malloc. Merely using a dynamic collection without such an allocator is an error; silent on-demand heap allocation is forbidden.
3. **Hosted std mode:** may provide allocator, entrypoint, clock, logging, reactor, process I/O and scheduler adapters, each subject to target capabilities and permissions. A hosted binary must not cause its core library implementation to acquire a host dependency.
4. Compiler and linker must take an explicit **library/host profile**, including the host ABI, supported atomics, memory budget, whether allocation is permitted and whether an executor exists. The exact CLI/manifest spelling is a separate implementation decision; no new source keyword or Rust `#![no_std]` syntax is introduced here.
5. Core intrinsics and compiler-emitted memory operations must be linked from freestanding compiler builtins or separately declared target primitives. An external `memcpy`, `libgcc`, allocator, libc or other symbol is **not automatically permitted**; the final binary's unresolved symbol/import list is an admission gate.
6. Panic is an effect in the language but `core` must not print, unwind through a foreign runtime, allocate a backtrace or assume a supervisor is present. The platform must define an explicit halt/trap/termination handler. A bare-metal actor supervisor is optional and requires a separately provisioned runtime.
7. `using io`, `stdio.*`, `process.*`, filesystem/network imports, host effects, dynamic loading, foreign host imports and implicit OS clocks must fail to compile/link in core and freestanding alloc modes, **even if the unused code could later be dead-code eliminated**. A target may provide explicit non-OS device I/O under its own capability interface, not by smuggling it in as `std`.
8. Bare-metal eligibility is not implied by AOT compilation, import-free WebAssembly, running in a browser worker, GraalVM Native Image, .NET Native AOT, or absence of garbage-collector events. Each target needs its own linked-guest proof.

## Diagnostics

Stable categories (exact wording can vary):
- `E_FREESTANDING_FORBIDDEN_IMPORT`: a direct or transitive dependency on a disallowed layer.
- `E_FREESTANDING_HOST_EFFECT`: OS/host facility in a freestanding profile.
- `E_ALLOCATOR_REQUIRED`: dynamic allocation with no explicitly provided allocator.
- `E_FREESTANDING_RUNTIME`: implicit scheduler, panic, entry or host runtime dependency.
- `E_FREESTANDING_UNRESOLVED`: final image has an unapproved import or undefined symbol.
- `E_TARGET_UNSUPPORTED`: target lacks mandatory primitives or ABI.

## Executable acceptance gates

- **Positive core:** compile + link + execute a real Atto `Option/Result`, checked-i64, fixed-buffer and ownership fixture on a documented freestanding target; assert no alloc, OS, libc or host imports/symbols and a deterministic entry/exit/trap. QEMU Cortex-M or equivalent target is acceptable when the image and execution trace are retained.
- **Positive alloc:** same target with a platform-provided bounded allocator; test alignment, exhaustion, deallocation, deterministic OOM and no fallback to libc.
- **Negative core:** imports of `alloc`/`std`, `stdio`, network, process, direct and transitive host modules, source-level unused forbidden imports, re-exports, and implicit panic/trace/allocator hooks must all produce diagnostics and **no output binary**.
- **Negative alloc:** reject `std` and missing/invalid allocator contracts; verify no host allocator fallback. Reject unsupported atomics/host executor even if syntax parses.
- **Target matrix:** compiler/runtime commits and Git trees, target triple, full linked image, map/import/undefined-symbol analysis, exact toolchain, executed guest counts and negative no-artifact checks, plus verified run provenance. Distinguish PASS/FAIL/UNSUPPORTED/NOT_EXECUTED across LLVM, Java/Graal, .NET, Forge, Rust/Wasm and embedded adapters. Host-only JSON/unit validation is **not** guest conformance.
- New core library source must be byte-pinned and dependency-audited; **source validation alone is not proof of a freestanding executable**.

## Compatibility and migration

Keep existing `stdlib/core/...` canonical source paths as repository storage layout if needed; this does **not** mean that `core` inherits the hosted `std` runtime. Reserve clear public namespaces `core`, `alloc`, `std`, with hosted `std` re-exporting portable APIs only when imports remain explicit and legal. Migrate existing files by auditing imports, transitive dependencies, allocations, implicit host initialization and emitted symbols, not merely renaming directories. Existing hosted behavior is unchanged until a particular backend implements profile admission.
