# Control-loop and actor-owned unmanaged memory v1

**Status: DRAFT TARGET / NOT IMPLEMENTED OR BACKEND CERTIFIED (2026-11-21).**
Companion to [hybrid actor memory](hybrid-actor-memory-v1.md), [primitive/object storage](primitive-object-storage-java-llvm-v1.md), and the existing actor-memory AOT proposal. This adds a **runtime control domain**; it does not silently change the actor reference ABI or introduce Atto source syntax.

## Decision: compact logical references in BOTH domains

1. The **Atto control plane** (main/root control loop, scheduler data, actor directory, mailbox descriptors and rings, timers, wake/STOP queues, supervisor routing, continuation bookkeeping) has its **own** bounded, unmanaged-memory allocation domain. Within it, use four-byte `ControlRef32` logical locators as the compact default where supported. Control refs are *never* host pointers and cannot be cast to actor-local object refs.
2. **Actor-owned object heaps** use four-byte `ActorRef32` logical locators, relative to an actor incarnation/domain. An actor's persistent heap, per-turn scratch and logical continuation-frame allocations have separately checked lifetimes and quotas. Actor state/refs cannot alias control memory merely because 32-bit words happen to be equal.
3. A **trusted native backing address** is still target native-width (e.g. 64-bit on x86-64) and can be held internally by the allocator or FFI boundary. A *logical* 32-bit locator is not a claim that the process uses 32-bit physical pointers, a 32-bit CPU, or a 4 GiB OS address space.
4. **Value widths are independent:** `i64`/`f64` may inhabit 64-bit registers or 8-byte fields; optional `i128`/`u128` inhabit 16-byte fields or multi-register/lowered operations; SIMD128/256/512 are separate gated vector types. Inlining an aggregate and register promotion are allowed only when they preserve ownership, alignment, byte order, and lifetime.
5. The **JVM / CLR managed heap is NOT the Atto language-object heap**. Language values, identity objects, actor-owned graphs and control-loop hot-path payloads/records must reside in custom unmanaged arenas under the strict profile. Host Java/.NET objects are permitted for VM bootstrapping, necessary carrier integration, diagnostics and explicitly admitted FFI bridges, but cannot become the implicit fallback allocation path for Atto guest objects.
6. **Zero tracing GC for Atto-owned objects** is the language/runtime target. **Zero managed allocations in a measured steady-state execution path** is a stronger, separately proved performance profile, not an automatic consequence of off-heap bytes. Never call an entire JVM or CLR process `zero-GC` or guarantee absence of unrelated host-runtime GC without genuine system-level evidence.

The control-plane pilot ABI ID is **`control_generation12_slot20_v1`**: the *high 12 bits are the generation* and the *low 20 bits are slot+1*. Earlier draft text used `control_generation20_slot12_v1`, reversing the bit-count names without changing the actual binary layout. That old name must **not** be emitted or admitted by current artifacts. Separately versioned actor-object prototype names may be legacy, and MUST NOT be equated with this control-domain identity.

## Unambiguous ABI registry

All four-byte words are scoped by a **typed domain + issuer/epoch witness** out of band, validated before any native access. A raw word alone is neither authority nor a network wire representation.

| ABI ID | Physical word | Meaning | Known state |
| --- | --- | --- | --- |
| `offset8_plus_one` | unsigned u32 | `0=null`; `ref=byte_offset/8+1` for 8-byte-aligned object starts | Hybrid-spec default candidate; must prove object-start, lifetime and non-ABA independently |
| `generation20_slot12` | unsigned u32 | low 20 bits are `slot+1`; high 12 bits are generation | Existing Java/LLVM host-side model candidate; distinct ABI |
| `generation16_slot16` | unsigned u32 | low 16 bits are `slot+1`; high 16 bits are generation | Existing .NET host-side candidate; distinct ABI |
| `segmented_handle32` | unsigned u32 | versioned segment/table indirection | Future extension; no implied support |

A compiler artifact and a runtime domain descriptor MUST agree on **encoding ID**, alignment, endianness, typed object layout version, domain class, allocator revision, capacity and safety policy. A mismatch rejects *before guest admission*; never reinterpret `offset8_plus_one` as a generational handle or silently cast a control ref to actor ref. Cross-backend actor messages use typed serialization, **not** these words. A representation change requires explicit relocation/marshaling under quiescence, not an in-place ABI reinterpretation.

For `offset8_plus_one`, largest encodable **object-start offset** is `(2^32-2)*8 = 34,359,738,352` bytes; actual object end must additionally pass checked `offset + length <= committed bounds`, alignment and per-domain quotas. A 64 MiB default budget is a **policy**, not an address-width ceiling. `generation16_slot16` and `generation20_slot12` are slot-count limited and must **not** be advertised as 32 GiB direct-offset encodings. Generation wrap must retire or independently invalidate the identity before reuse.

## Mandatory control-domain security and lifecycle

- Establish disjoint domain capabilities for `ControlRef32`, `ActorRef32`, broker/shared memory, foreign handles and OS/native pointers in typed HIR/MIR, codegen and runtime entrypoints. A control handle is never guest-reachable without a separately authorized operation. Reject integer-to-ref fabrication.
- Bind every access to an immutable, trusted **domain-instance identifier, incarnation/epoch, type, object-start, size, alignment, generation/lifetime and permission**. An actor A and B, or an actor and the control heap, may legitimately have equal numeric words; this confers **no** cross-domain authority.
- Preallocate or explicitly quota metadata (slot table, generation table, object layout, mailbox ring entries, timer nodes, free lists, continuation records). Sidecar metadata that grows as ordinary Java/C# objects **on each send/allocate/turn** violates strict no-managed-allocation mode. Runtime initialization and cold-path integrations must be accounted separately, not hidden.
- Authenticate all admission/free/borrow/drop transitions before modifying storage. Use checked unsigned arithmetic and fail atomically at quota, index, overflow or allocation errors; no partially published control task or dangling mailbox payload.
- Distinguish control-plane priority STOP/panic/supervisor notifications from guest message queues. Apply bounded admission, backpressure, generation-fenced wakeup tickets, concurrency-safe publication and orderly shutdown. A guest actor must never forge a control-plane memory reference or priority control message.
- STOP of an actor must not free the control heap or another actor's arena. Runtime shutdown must close new admissions, quiesce outstanding workers/callbacks/FFI pins and mailbox leases, invalidate epochs, scrub as required, then free all unmanaged domains exactly once. Failures must not corrupt sibling domains. All process-finalization and OOM paths need explicit accounting.
- Nonserial actor receivers may run simultaneously, and scheduler carriers may migrate. Separate per-turn scratch/frame storage, acquire/release publication and checked RW state loans; never mistake a Java FFM shared arena or C# `lock` for a proof of correct actor ownership or data-race safety.

## JVM/GraalVM and .NET NativeAOT lowering

**Java (JDK 25):** Pre-create bounded native memory segments with FFM `Arena`/`MemorySegment`, use checked access layouts and explicitly close owned native memory when quiescent. `Arena.ofShared()` permits cross-thread access under its lifetime policy but does *not* prevent actor/data races. Avoid constructing one Java object, `MemorySegment` slice, boxed payload, lambda, future, or exception per control-loop event in the strict hot path. Measure using allocation/GC counters on the actual compiled guest + carrier path. Treat JVM-internal memory and diagnostics as separate host overhead.

**.NET (strict NativeAOT):** Use `NativeMemory.Alloc`/`AlignedAlloc` with matching free and checked `unsafe`/`Span<T>`/unmanaged `struct` views for the runtime's owned arenas. Make sure `T` contains no managed references. Avoid per-operation `class` wrappers, boxing, captured closures, `Task` allocations, heap-backed arrays and exception construction on the strict hot path. CLR GC remains present; `GC.TryStartNoGCRegion` is an optional measurement/latency mechanism, **not** a substitute for an allocation-free implementation nor a general GC-off switch.

For **both**, the allocator may retain a limited, auditable set of managed bootstrap/carrier metadata. Keep control-loop payloads and guest object graphs out of the managed heap; measure warm steady-state `allocated_bytes_per_turn`, `allocated_bytes_per_send`, host GC collection deltas, unmanaged committed/live/peak bytes and deterministic cleanup. A PASS requires **zero measured managed allocation in the audited hot path under stated conditions**, not just a quiet collector during a short run. Full end-to-end zero GC of the host process is NOT certified by this profile.

## Coherent 128-bit control values over Ref32 (incremental host target)

The four-byte **control reference** locates an object; it does not constrain the size of a value within that object. For a statically declared 16-byte `i128`/`u128` field, store the **least significant 64 bits** at field offset 0 and the **most significant 64 bits** at offset 8, both in little-endian byte order. Preserve all bits for signed two's-complement and unsigned values; targets without a single 128-bit general-purpose register lower to multiple registers or memory.

An operation that reads or writes the full 128-bit field MUST be **coherent** against competing accesses to that same field: never expose half the old value plus half the new value. The initial Java, .NET and LLVM **host** implementations acquire one arena lock across the two limbs. Ordinary independent 64-bit fields remain valid, but a typed compiler MUST NOT mix separate `i64` accesses with an `i128` field or permit an untyped caller to reinterpret a 128-bit field as two unrelated counters. Provenance, generation, issuer, object bounds, alignment and native lifetime checks precede access, and failed reads/writes must not partially publish a value.

- JVM host: use caller-owned reusable two-limb output storage, without allocating a Java `BigInteger`, array or wrapper per access.
- .NET host: return limbs through `out` values or a value-type snapshot without boxing or managed heap buffers.
- LLVM native host: pass two `uint64_t` limbs and writable caller-owned outputs; reject null/aliased output destinations, stale refs and foreign domains.
- A coherent pair of **native actor-runtime counters** is useful host integration evidence, not source-compiled Atto `i128` object lowering and not a whole-process zero-GC proof. Each target needs independently executed compiled `.atto` actor-object fixtures and an allocation/GC receipt before full parity is asserted.

## Required backend and conformance gates

- Same compiled Atto fixture stores `i64`, optional `i128`, and `Ref32` fields with correct alignment in control and actor domains. A 32-bit reference must not truncate a 64/128-bit value. Reject absent i128 profile cleanly.
- Reject equal-word cross-domain collisions, wrong encoding ID, stale wake ticket, actor reincarnation ABA, free/realloc ABA, slot exhaustion, misaligned/one-past-end accesses, fake control refs, wrong field kind/type, wrong endianness and source-controlled domain ID.
- Test mailbox full/cancel/STOP failure atomicity, actor death without control-domain corruption, parallel sends/wakeup races, quiescent disposal with retained FFI pin and double-free/zeroization.
- Run compiled `.atto` guests on each supported backend, Java JVM + Graal Native Image and .NET Linux/Windows NativeAOT where claimed. Include real warm hot-path managed allocation/GC measurements, heap/RSS peak and failure evidence. Model-only checks, static spec JSON and `steps=[]` CI mean `NOT_EXECUTED`, not PASS.
- Report each of the eleven `atto-source.*` repositories independently, with `UNSUPPORTED` for feature profiles genuinely absent, never inferred parity. Pin exact source SHA, test fixture SHA, target/toolchain, executable SHA, actual executed step count and result.

## Integration plan, without breaking existing work

1. Specify separate control-domain typed IR and ABI negotiation in `atto-common-source` and borrow checker; preserve extant offset and generational host adapters.
2. Add/control instrumented unmanaged control-storage implementation in Java and .NET; keep existing actor-memory adapters as-is until their layout/provenance admission is reconciled.
3. Add real AOT guest fixtures and perf counters; only then consider turning on strict zero-managed-allocation by default.
4. Audit LLVM, Wasm, Forge, Rust, Cranelift, JS, self-hosted, realtime and HDL independently; fail closed on unsupported combinations.

**This document is a proposal and test target, not executed backend proof.**

## Current JVM and CLR opt-in native-root integration candidates (2026-11-21)

These internal host APIs are **not** proposed AttoLang source grammar and do not establish compiled guest parity. They are bounded, optional runtime implementation evidence to advance the control-domain ownership design:

- Java/GraalVM: `ActorRuntime.enableNativeControlCounters()` creates a single FFM root after strict supervisor/empty-runtime admission; the 32-byte record and 12-byte native metadata are charged to the existing aggregate policy. Atomic actor-slot reservations, failed-spawn rollback and physically quiescent deregistration publish a checked native count, and full runtime shutdown closes the root only after carrier/actor retirement. See [Java implementation #1273](https://github.com/atto-lang/atto-source.java/pull/1273).
- .NET: `ActorRuntimeOptions.UseNativeControlCounters` (default false) creates a single `NativeMemory` root at boot; 32 bytes of data plus 16 bytes of padded metadata are charged before actor budget admission. The existing actor dictionary remains authoritative, while native live-actor and monotone completed-message summaries are updated on genuine Spawn/dispatch/FinalizeCell paths. See [.NET implementation #173](https://github.com/atto-lang/atto-source.net/pull/173).
- Both use `control_generation12_slot20_v1` only for trusted root control storage. Neither runtime exports root control words as guest `ActorRef<T>`, actor-object `Ref32`, serializable data or host FFI pointers.
- Java JDK25 JUnit and .NET CLR/Linux NativeAOT *runtime host* tests are authored but not independently executed on those exact source PR heads; their source repos have no authorized cross-org private CI destination. The host still allocates managed scheduler, mailbox, context and lifecycle objects. Do not claim zero managed allocations per actual message, all-guest tracing elimination, full process zero GC, or certified eleven-backend runtime parity.

The [11-backend memory ledger](https://github.com/atto-lang/atto-platform-conformance/pull/550) records these implementations as `SOURCE_AUTHORED_NOT_EXECUTED`, separately from narrower LLVM/JS/Forge/Wasm host-only tests and from compiled Atto guest evidence.
