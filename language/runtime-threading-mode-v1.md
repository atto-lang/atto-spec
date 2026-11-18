# AttoLang single-threaded per-memory-space runtime mode v1

**Status:** TARGET / PROPOSED; no backend guest-runtime parity is certified by this document. This is a runtime/CLI configuration, **not** a source-language keyword and not a compiler optimization guarantee.

## CLI surface

Canonical spelling:

```sh
atto run --single-threaded app.atto
atto run --max-threads-per-space=1 app.atto
atto run --mode=single-threaded,trace app.atto
atto build --single-threaded app.atto
```

All three `run` forms request the same **per-memory-space execution bound**. The `build` form embeds that execution policy into a compiled artifact when its backend supports policy-controlled AOT startup; it MUST NOT merely set a compiler worker-thread count. Build/run support is not claimed for backends that have not implemented the CLI. `--single` and `--mode=max1` are intentionally **not** aliases: their meaning is ambiguous.

`--max-threads-per-space=N` is the extensible integer form; `N` must be a positive decimal integer without sign, whitespace, fractional part or exponent. `--single-threaded` is an exact alias for `--max-threads-per-space=1`. For now only `N=1` is portable; requests for other values require an explicitly documented backend capability or an unsupported diagnostic.

`--mode` is a comma-separated **set of named settings**, not a raw bag of opaque strings. Values are case-sensitive, trimmed neither implicitly nor by the backend, nonempty, and unique. A parser must reject unknown modes, empty elements, repeated names, conflicting settings and unsupported mode combinations. `single-threaded` is a defined runtime mode; `trace` here is illustrative and is valid *only if that particular CLI implements trace*. Unknown `--mode` values never silently disappear. Duplicate equivalent requests for single-threaded mode via different flags are allowed if the configuration is otherwise compatible; `--single-threaded --max-threads-per-space=2` is a conflict. Source code and application arguments are not parsed as runtime switches after the CLI's explicit argument boundary.

CLI entrypoints MUST normalize these spellings to the same typed runtime policy prior to allocating guest memory, initializing top-level runtime state, starting actors or invoking user code. The normalized policy must be delivered to subprocess launchers, runtime hosts and AOT startup by explicit, versioned configuration, not a mutable ambient global. A compiled executable that lacks the required scheduler controls MUST reject the single-threaded policy rather than ignore it.

## Normative execution invariant

A *memory space* is a region of mutable guest-visible addressable storage that two runtime execution agents could concurrently access, including through aliased buffers or host/FFI pointers. It is **not** necessarily an actor, mailbox, process or module. Memory aliases MUST map to the same scheduling domain. Shared memory regions bridging otherwise separate isolates join the relevant domains or are rejected by the single-threaded profile. The one-thread rule is about guest-visible **execution and access**, not the number of kernel threads that merely exist.

When single-threaded mode is active, at most **one OS thread at a time** may execute AttoLang guest instructions or access mutable guest-visible memory in any one memory space. This includes runtime callbacks, actor receives, host/FFI callbacks, GC finalizers touching guest memory, foreign import callbacks, timer callbacks, and async I/O completions. All such work MUST be serialized through the owning space's scheduler lane; a host's unrelated I/O thread may still exist provided it does not enter or mutate that space. A same-thread nested callback does not create another concurrently executing OS thread but remains subject to ordinary reentrancy, critical-region and borrow rules.

In ordinary native processes, where actor instances share one host address space and can access common writable runtime data, this normally means only **one guest-executing thread per process**. Distinct workers/processes/isolates with genuinely separate, non-shared memory may each run one thread concurrently. The mode does not assert one total OS thread across all independent processes.

Actors, bounded mailboxes, supervisors, async tasks, `await`, `select`, cancellation, backpressure, timers, and cooperative scheduler yields MUST continue to work as specified. One actor's suspended operation must not stall unrelated ready actors. No busy-wait or blocking lock acquisition may freeze the sole execution lane; use event-loop integration and asynchronous handoff. Do not silently disable actors or replace actor isolation/ownership semantics with mutable shared access.

A host thread MUST NOT call into guest code or inspect/mutate guest memory while the lane belongs to another thread. Foreign libraries that spawn threads or retain mutable guest pointers MUST be statically ruled out, marshaled through a checked owner-lane proxy, or rejected at runtime **before** unsafe access. Unverifiable native/unsafe callbacks and shared-memory imports require an explicit unsupported diagnostic; a mutex around actor dispatch alone is insufficient proof. Correctness must not depend on a racy "no more than one worker usually runs" heuristic.

## Interaction with language safety and other modes

- Single-threaded mode is a **debugging/execution policy**, not a weakening of borrow checking, Sendable/Serializable checks, tenant/actor isolation, or `critical-read`/`critical-write` rules.
- It does **not** guarantee deterministic scheduling, identical timing, no data races with external processes, or reproducible I/O. A future deterministic scheduler/record-replay mode is orthogonal.
- It does **not** allow a non-thread-safe FFI library to be used without validating the callback and pointer-access contract.
- Process creation and external services are outside the process memory-space bound, but parent-owned shared memory mapped into a child must obey the same alias/coordination rule or be rejected.
- Memory ownership, CONTROL notice priority, supervisor restart fencing, poison/failure cleanup and cross-actor deep-copy/transfer semantics remain unchanged.
- A runtime MUST expose the resolved mode to diagnostics (e.g., startup metadata and test execution receipts); any requested unsupported mode or policy must return a nonzero, explanatory error before guest execution.
- A build that bakes in a strict single-threaded policy cannot be relaxed at runtime. A runtime override may tighten a multithread-capable artifact only when the backend proves it is supported.

## Backend requirements

Every compiler/runtime entrypoint, including Rust/Wasm browser compiler and the Java, LLVM, .NET, Forge, Cranelift, JS, Wasm and other Atto compiler targets, must either implement the exact contract or explicitly reject requests. No silent flag acceptance, no best-effort worker limit, and no unsupported feature disguised as compiler success. Wasm guest memory and the surrounding host worker model must be assessed separately: disjoint worker memories may execute concurrently, but `SharedArrayBuffer`/shared Wasm memory require proven serialization or rejection.

## Required evidence before claiming implementation

1. Parser matrix: canonical/alias/mode forms, conflict, unknown, empty, duplicate, `N=0`, negative, overflow and malformed values; no application-argument interception.
2. Runtime parallel-load stress: two CPU-bound actor handlers sharing one memory space never overlap on distinct OS threads, including foreign callbacks; an instrumented active-thread counter must never exceed one. Separate nonshared isolates may progress independently.
3. Nested callback, actor spawn/restart, supervisor CONTROL, cancellation, hot loading, destructors/finalizers and shutdown cannot bypass the gate.
4. `await`, timer, I/O completion and `select` yield to independent actors without blocking the sole executor.
5. Shared-memory alias, native FFI-created thread, dynamic plugin thread, unsafe import, and unverified host callback MUST be rejected or marshaled onto the lane; tests must catch a deliberately broken concurrent callback.
6. Explicit evidence of a compiled Atto guest program, exact source and artifact SHA, execution target/toolchain and OS-thread observation. CLI parser tests or host-only simulators do **not** establish the invariant.
7. Failure to enforce must be an explicit unsupported/error state, never `PASSED`. Zero-step, skipped, queued and billing-blocked CI is `NOT EXECUTED`.

See `contracts/runtime-threading-v1.json` for a SOURCE_FREE test matrix. Every backend should link an independent execution receipt to the same contract.
