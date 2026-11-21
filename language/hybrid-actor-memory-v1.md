# Hybrid actor memory and extensible address capabilities v1

**Status: TARGET / DRAFT ONLY — NOT BACKEND OR GUEST CERTIFIED (2026-11-21).** This document is an additive extension to [primitive/object storage v1](primitive-object-storage-java-llvm-v1.md) and does **not** replace the existing ref32 heap growth, Pointer<T>, bounded buffers, shared ownership, or realtime contracts. All code examples naming internal types are explanatory ABI notation, **not new AttoLang grammar**.

## Architecture decision

AttoLang must distinguish **language value width**, **native machine address width**, **actor-relative object-reference encoding**, **logical actor heap size**, **physical backing**, **capability authority**, and **SIMD register width**. These are independent properties.

* Keep a compact **unsigned 32-bit actor-relative word** as the default object-reference storage ABI where the target supports it. The current proposed v1 format is `0 = null`, otherwise `word = logical_byte_offset / 8 + 1`; object starts are eight-byte aligned, so the largest encodable start offset is **34,359,738,352 bytes**. This is approximately 32 GiB of logical offsets; it is **not** a requirement to reserve or physically commit that much RAM. It does not encode generation, type, actor authority, permissions or a native pointer.
* Preserve the observed language-level `int` semantics from the scalar-storage contract (signed i64 in that profile). Do **not** silently turn `int` into i32 for heap efficiency. Explicit i8/i16/i32/i64, u8/u16/u32/u64 and optional i128/u128 types, when individually supported, must retain their specified width and overflow semantics. UTF-8 byte storage remains compact; Unicode scalar values are not 128-bit by default.
* Normal native-host addresses and FFI pointers use **native target address width**, typically 64-bit on 64-bit systems. A native pointer, a logical actor reference, and a message `ActorRef` are three distinct kinds of authority.
* Define an **opt-in extended actor-memory profile** for heaps or allocations whose logical objects cannot be represented in the v1 32-bit-offset domain. Allowed implementations include segmented allocations with a 32-bit **handle-table index** (a different, explicitly versioned encoding) or wide references/handles in a separately versioned ABI. No transparent reinterpretation of an offset word as a table index, and no silent widening of existing object fields. A backend that cannot safely lower the selected profile must **fail closed**.
* Reserve **optional 128-bit data, SIMD, software/hardware capabilities** as separate target features. No requirement to store scalar chars, integers or ordinary object references in 128-bit cells. A software 128-bit token is not a CHERI capability; hardware tags/bounds/permissions and deployment requirements need an explicit CHERI-capable target.

## Internal representation taxonomy

| Internal ABI concept | Width | Content and permitted authority |
| --- | --- | --- |
| `Offset32` | 32 bits | Unforgeable compiler/internal aligned byte offset, only meaningful inside a proven actor-owned region; not a public pointer, not an owning token |
| `Ref32` (v1) | 32 bits | 8-byte-scaled, non-null actor-relative logical object start; must be checked against out-of-line owner/incarnation/object-generation, type, object-start table, bounds, and loan metadata |
| `Handle32` (future profile) | 32 bits | Compact table index **only if distinct ABI-tag/profile negotiated**; generation/owner authority lives in a protected table and reuse cannot admit stale handles |
| `Handle64` | 64 bits | Explicit typed opaque extended locator; may contain slot/generation or table key, but actor/incarnation/domain validation remains mandatory; no universal prescribed bit split |
| Native address / `usize` | Target-specific | Host-only backing/FFI address under scoped checked lifetime; never a serialized `Ref32` or `ActorRef` |
| `Capability128` | Optional 128 bits | Versioned trusted authority envelope with bounds, permissions, domain, revocation and anti-replay; software token requires authenticated metadata, hardware form requires target proof |
| SIMD 128/256/512 | Optional | Lane-packed vector arithmetic; orthogonal to pointer/object width |

The existing v1 `Ref32` representation is a **compressed offset**, **not** a generational handle. A live object-start lookup, protected generation/epoch and owner/incarnation context are required at every unsafe dereference boundary. `Ref32` alone is never a security credential. A free/reuse that could revalidate a stale exposed word must be prevented using nonreuse, quarantine, a verified surrounding generation, or a separately versioned indirection scheme. On generation wrap, retire the slot/identity instead of accepting ABA.

## Memory spaces, growth, and limits

1. Each actor owns private arenas/segments with independently accountable logical address reservations, committed backing, live bytes, pinned bytes, shared leases, stack/continuation bytes and allocator metadata. Quotas apply to actor **and** tenant/process aggregates.
2. A typical dynamic actor may begin with zero payload backing, then physically commit on demand within its admission quota. The frequently discussed **64 MiB** budget is a selectable policy, not the 32-bit reference limit. No unbounded growth or guaranteed 32 GiB allocation is implied.
3. A growth or relocation is failure-atomic: validate checked arithmetic, quota, addressability and type/layout; reserve **old backing + complete new backing** against the peak physical budget; prepare/copy/scrub; publish only after success; refund old backing only after proven release. On failure preserve prior references, contents, accounting, and sibling actors.
4. No backing relocation while raw native views, FFI loans, pinned async tasks or writable loans remain live, unless the backend proves stable-address indirection. A new segment cannot be published with overlapping live object starts or stale table generations.
5. A large actor may consist of multiple segments but a v1 `Ref32` cannot directly point outside its representable actor-relative logical offset range. Reachability beyond that requires an explicitly selected handle-indirection/extended profile and verified lowering, not merely concatenating 32-bit segments.
6. `realtime-prefault` actors reserve, commit and prefault their bounded working set **before admission**. No page faults, memory growth, relocating allocations, blocking cleanup or unbounded handle lookup in an admitted hard-real-time turn. Reject unsupported resource demands before running guest code.
7. Freed actor-private payload must be invalidated, eventually scrubbed and returned deterministically **after** all admitted turns, outstanding callbacks, continuations, FFI pins, transferable leases and shared references quiesce. Logical STOP must not be confused with immediate physical reclamation.

## Actor transport and capabilities

* `take!` is an exclusive **two-phase transfer**: stage ownership/memory/quota, check sender and receiver actor-incarnation/domain, then atomically commit admission or abort with sender ownership unchanged. Revoke sender dereference authority only at successful commit. No torn move on mailbox full, cancellation or STOP.
* `share!` permits frozen, transitively immutable, same-authority-domain access only with bounded lifetime accounting. Ordinary shared memory is not automatically writable or `Serializable`. Cross-tenant transport requires authorization and a brokered copy/serialization unless a stronger independently proven capability contract applies.
* Raw `Ref32`, `Offset32`, native addresses, backing views, `Pointer<T>` and generation-free handles cannot be sent across actor boundaries, serialized to the network, interpreted as `ActorRef<T>`, or fabricated from integers.
* `Pointer<T>` retains the separate built-in opaque typed and provenance-checked contract; capability width **never** grants permissions absent the sealed issuer/authority check. Access requires object-start validation, bounds, alignment, initialization, owner-incarnation, effective permissions and live lifetime.
* Capabilities for shared buffers, cross-domain FFI, DMA/GPU or hardware-tagged memory require separate feature negotiation, permission validation, revocation, anti-replay, device-fence and accounting tests. `Capability128` by itself does not prove any of those properties.

## Target portability and feature negotiation

The semantic ownership and fault-containment obligations are portable. Storage layouts are intentionally **not** a cross-backend wire ABI. A backend may use compact Ref32, an equivalent checked handle representation or an explicit unsupported diagnostic for features it does not implement. Cross-backend messages use the typed message serialization/transfer protocol, never raw internal reference bits.

| Backend | Initial 32-bit path | Future extension admission |
| --- | --- | --- |
| Java/GraalVM | Actor-private native segments; managed runtime control objects accounted separately | Native Image/AOT and genuine compiled guest proof; pin FFM lifetime; report host GC honestly |
| LLVM | 32-bit logical refs with native 64-bit backing where available | Checked segmented/extended ABI; ASan/UBSan and true pre-fault hard-RT evidence |
| .NET NativeAOT | Unmanaged arena with checked refs | NativeAOT guest execution; managed metadata is **not** zero-GC proof |
| Forge | Actor-private native arenas and checked object-start descriptors | Independently compiled/native guest, AOT/runtime profile proof |
| Wasm | wasm32 actor memory with checked bounds, or host-only prototype while guest lowering is unsupported | Explicit `memory64` target and host/browser support, fresh views after memory.grow; never assume wasm32 >4 GiB |
| Rust/Cranelift/JS/self-hosted/HDL and future targets | Conformance-gated per target; unsupported actor heap paths reject | Separate target capability profile and compiled guest evidence |

## Versioned feature manifest (target)

Every backend should eventually declare these **independently**, never infer one from another:

`actor_ref32_v1`, `actor_arena_dynamic`, `actor_arena_realtime_prefault`, `actor_segments`, `actor_handle32_table`, `actor_handle64`, `actor_extended_heap`, `native_pointer_width`, `wasm_memory64`, `actor_transfer_take`, `actor_frozen_share`, `buffer_zero_copy`, `pointer_checked`, `capability128_software`, `capability128_hardware`, `simd128`, `simd256`, `simd512`, `integer128`, `gpu_dma_pinning`.

An absent feature is `UNSUPPORTED` or `NOT_EXECUTED` with provenance, not an implicit fallback to insecure host pointers, a tracing GC, or a dynamic JIT. A profile's descriptor must include target triple, ABI revision, actor logical limit, hard quota, peak physical budget, alignment, handle-generation policy, capability support, GC policy and tested toolchain.

## Required executable acceptance evidence

**Positive compiled guests:** scalar/UTF-8 compactness where observable; ref32 unsigned high-bit and last-valid-offset roundtrip; two actors with identical word and separate authority; stable offset across arena growth; multi-segment access through an explicitly selected ABI; transactional buffer move; frozen share and quiescent cleanup.

**Negative compiled guests/runtime gates:** invalid or misaligned logical offset; one-past-end, overflow, invalid object start, stale slot or actor incarnation, generation exhaustion, cross-actor raw ref, integer→pointer cast, unpinned borrow across suspension, relocation under a pinned view, quota exhaustion, rollback on receiver rejection, wrong-width target selection, 128-bit token forgery, hardware capability on non-capability target, realtime page-fault/growth path and unsafe wasm32 address overflow.

**Evidence:** exact commit and tree, fixture blob SHAs, compiler/artifact digests, toolchain, nonempty executed steps, actual guest outcome, negative no-artifact proof, sanitizer/native AOT/perf/GC metrics where applicable. Track `PASSED`, `FAILED`, `UNSUPPORTED`, `NOT_EXECUTED` separately for each backend. Host-only reference tests, source-only manifests and zero-step CI cannot certify actor heap behavior.

## Control-loop storage and zero-managed-allocation target

The main/root runtime control loop has its **own** unmanaged allocation domain with compact four-byte **ControlRef32** internal logical locators; it is not actor-owned guest memory. All actor and control locators require out-of-band authority, domain-instance, epoch, type, generation/lifetime and bounds checks. Neither is a native process pointer, and equal numeric words cannot authorize aliasing across domains. See [control-loop and actor unmanaged memory v1](control-and-actor-unmanaged-memory-v1.md).

The v1 **offset8_plus_one** ref and the host prototypes' **generation20_slot12** (Java/LLVM) and **generation16_slot16** (.NET) formats are **distinct ABI IDs**. A compiler/runtime ABI mismatch must fail closed before guest admission. The 32 GiB logical-offset math applies only to offset8_plus_one, not slot-handle encodings. JVM/CLR may retain bounded managed host metadata, but strict Atto runtime hot paths must instrument managed allocation rate and host GC independently. Zero tracing GC for Atto-owned objects is not a claim that the host process runs no GC.

## Reconciliation / existing work (not superseded)

* Storage and objects: atto-spec PR #91; `Pointer<T>`: #18; bounded pooled buffers: #7; shared ownership: `shared-ownership-and-guards-v1.md`.
* Reference encoding: atto-platform-conformance PR #426 (and previously atto-common-source #13). Demand-backed growth and peak-budget accounting: stacked conformance PR #461.
* Runtime staging, release and real-time must reconcile with the existing Java/LLVM/.NET/Forge/Wasm actor-arena work. No new grammar or host pointer dependency is authorized by this design document.

**Migration rule:** legacy `Ref32` object-field ABI remains byte-for-byte stable within its own target profile. An extended ABI is a **new** incompatible layout version selected at compilation/runtime admission with explicit cross-version marshaling; it cannot silently change a live heap.
