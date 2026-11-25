# ByteBuffer and endian-safe byte access v1

**Status:** proposed normative API/ABI contract; **no backend is certified**. This document describes required AttoLang behavior, not code already executable. Public semantics and shared fixtures are the parity boundary; each `atto-source.*` repository owns its own `.atto` implementation under the [normative library layering contract](core-alloc-std-libraries-v1.md). Guest receipts belong in `atto-platform-conformance`.

## Layer ownership

- `core`: freestanding byte/endian primitives and borrowed `ByteView` / `MutByteView` contracts; **no implicit allocator, OS, host GC or I/O**.
- `alloc`: `ByteBuffer` owned storage and explicit bounded allocator integration. The caller/actor owns the heap/region; allocation is accounted against the active tenant quota.
- `std.buffer`: hosted module exporting `ByteBuffer` and the explicit endian read/write convenience API. It MUST be implemented using the canonical `alloc`/ `core` contracts, not divergent guest-visible host-class APIs. Backend-local `.atto` implementations may differ.
- Implementations MAY expose `alloc.buffer` directly in freestanding builds and `std.buffer` as a re-export, provided the same ABI, semantics and source ownership apply. No covert host allocator is permitted.

These candidate requirements extend the finalized core -> alloc -> std layering contract. Static import v2 governs the v2 profile; the example below uses the historical v1 library selector.

## Canonical target source

```atto
import module buffer from "atto.std/buffer";

pub fnc main(): int throws Error {
  val mut bytes = buffer.ByteBuffer.allocate(8);
  bytes.write_u32_le(0, 0x12345678);
  val int header = bytes.read_u32_le(0);
  return header eq 0x12345678 ? 1 : 0;
}
```

`val mut` is intentional: a non-rebindable local with an exclusive mutable referent. Plain `val bytes` is read-only and MUST reject `write_u32_le`. `let mut` is also writable, but allows rebinding. `int` is the current signed 64-bit scalar storage/return type for v1 unsigned 32-bit payloads; `u32` must not be presumed a separately implemented primitive. When fixed-width unsigned types are adopted, they may add overloads without changing these v1 values.

## Required v1 operations

| Operation | Type / contract |
| --- | --- |
| `ByteBuffer.allocate(len: int)` | Owned zero-filled buffer, exact logical byte length; negative/too-large requests rejected with typed `BufferAllocationError` or applicable resource-quota Error |
| `length` | Read-only logical byte count |
| `read_u8(offset)`, `write_u8(offset, value)` | Unsigned 8-bit, value 0..255 |
| `read_u16_le/be`, `write_u16_le/be` | Unsigned 16-bit, value 0..65535 |
| `read_u32_le/be`, `write_u32_le/be` | Unsigned 32-bit, value 0..4294967295 returned as nonnegative `int` |
| `read_u64_le/be`, `write_u64_le/be` | **Reserved** until a portable unsigned-64 representation is specified; must fail closed, not silently truncate to signed `int` |
| `view(start, end)` | Read-only borrowed half-open view; validated, non-escaping, tied to owner lifetime |
| `view_mut(start, end)` | Exclusive mutable borrowed half-open view, subject to borrow checking |
| `try_read_u32_le`, `try_write_u32_le` | `Result<T, BufferError>`, no ordinary throw from bounds/range failures, no invented `Option` |

Every admitted variant has symmetrical `_le` and `_be` forms. No host-native-endian default or architecture-dependent byte order is allowed. Unaligned valid reads and writes must work identically. All reads/writes have no I/O effect, no suspension, and no allocations after a successful initial allocation. Allocation has an explicit allocation/resource effect, not a network/file capability.

## Byte ordering and scalar rules

`write_u32_le(0, 0x12345678)` stores exactly `[0x78,0x56,0x34,0x12]`; `write_u32_be` stores `[0x12,0x34,0x56,0x78]`. Offset is measured in **bytes**, never elements or words. A u32 read reconstructs the exact nonnegative scalar with the corresponding endian direction. For each little-endian byte at index `i`, byte = `(value >>> (8*i)) & 255`; big endian reverses those four byte positions. Implementations must not expose signed C char promotion, JS bitwise-32 truncation, signed-overflow UB, or host endian conversion as guest semantics.

Evaluate receiver, offset, and value exactly once in source order. Validate full range and mutability **before writing any bytes**: a failed write must leave every byte unchanged. For a `width`-byte access, valid iff `0 <= offset`, `width <= length`, and `offset <= length - width` (or an equivalent checked non-overflowing condition). `offset + width` must not wrap. Incorrect offsets throw `BufferBoundsError` for throwing calls, and yield `Err(BufferBoundsError)` for `try_*` calls. Incorrect value ranges throw `BufferValueError` or return `Err(BufferValueError)`. Never truncate out-of-range input unless an explicitly named wrapping operation is added later.

## Borrow, isolation, and lifetime

- The buffer is owned by its creating actor/tenant. `val mut` does not bypass exclusive-loan checks, sealed actor state, `take!`, `drop!`, pinning, or the current shared-ownership rules.
- A writable view excludes concurrent readable/writable aliases; readonly views cannot mutate. Invalidation, move or drop makes stale accesses invalid. A borrow may not escape across suspension or actor boundaries without an independently checked pinned/transfer contract.
- `share!` on writable storage does **not** grant multi-actor mutable access. Cross-actor zero-copy is an explicit ownership transfer or separately proven frozen share; never return unrestricted host pointers.
- Allocation respects per-tenant memory and object quotas, including overflow/fragmentation accounting. Failure never leaks uninitialized stale-tenant data; allocate zero-initialized bytes and scrub newly exposed storage on growth.
- Backend buffer storage may use native arenas, Wasm linear memory, JVM arenas, .NET AOT memory, or other verified mechanisms. Such choices are private and do not alter the guest-visible contract.
- Bounds failures are ordinary typed errors, not uncatchable host traps, panic, silent truncation, or memory corruption; resource exhaustion behavior must be explicit.

## Parsing and formatting

`buffer.ByteBuffer.allocate(8)`, chained method calls, `val mut`, hexadecimal integer literals, `eq`, and `condition ? 1 : 0` must be parsed and formatted without changing evaluation semantics. In particular, conditional `? :` and postfix `Result?` have distinct parse roles. A compiler unable to admit any required construct must emit a specific unsupported diagnostic and no executable artifact instead of performing host fallback.

## Cross-backend acceptance

Each `atto-source.*` backend, including Java, LLVM, Wasm, Rust/browser, .NET, Forge, Cranelift, JS, native Atto, and HDL where applicable, must publish independent **compiled Atto guest** evidence for the exact source and codegen SHA. HDL target applicability is to be decided explicitly rather than assumed. At minimum run: 8-byte zero-init; LE and BE u8/u16/u32 round trips; unaligned offsets; boundaries at 0, `length-width`, `length-width+1`, negative and max-int offsets; failed write atomicity; invalid unsigned input; immutable binding compile rejection; mutable borrow exclusivity; actor transfer/stale view; tenant quota failure; no extra effects. Compile-negative cases must emit no executable artifact. Run on real guest artifacts, not host-only reference models or parser-only success; record PASS / FAIL / UNSUPPORTED / NOT_EXECUTED per backend and case.

**Conformance source:** `atto-platform-conformance/contracts/byte-buffer-v1.json`.
**Implementation home:** each `atto-source.*` compiler/runtime owns its backend-local `.atto` library source. Shared contracts and examples may live in `atto-common-source`; no byte-identical common implementation is required.
**Migration overlaps:** `atto-common-source#10/#23`, `atto-spec#7/#42`, and legacy `oreslang-source.java#2934` require integration/compatibility review but do not certify this API.

## Source-first sealed storage ABI (implementation milestone)

A reference source is staged at `atto-common-source/stdlib/std/buffer.atto`, with pure helpers under `stdlib/core/`. The current implementation is **not yet compiled**. It requires a minimal compiler-sealed `OwnedBytes` type in the `alloc` layer, not a public host buffer class. The versioned contract is `atto-common-source/contracts/owned-bytes-runtime-abi-v1.json`.

- Primitive surface: `OwnedBytes.empty()`, `OwnedBytes.allocate_zeroed(int)`, `length`, `read_byte(int)` returning 0..255, and exclusive `write_byte(int,int)` accepting only 0..255. The primitive alone does not expose raw pointers, arbitrary object memory, foreign host APIs or untrusted owner tokens.
- Backend runtime allocates and owns storage; **the endian and offset algorithms remain .atto source within each backend's admitted library subset**. Compiler/frontend/linker must reject unresolved sealed intrinsics, forbidden direct guest calls, and any invalid import/effect boundary before code emission.
- The primitive must enforce trusted TenantVM/actor/generation identity, quota accounting and zeroization; no cross-tenant transfer is admitted in v1. Capacity and in-flight loans remain valid for the entire non-suspending checked multi-byte write.
- `ByteBuffer.allocate(0)` is permitted as an empty owned buffer; every nonzero-width read/write rejects. This differs from a fixed-buffer **pool** requiring nonzero slot capacity (`atto-common-source#10`).
- If the frontend cannot type-check private `OwnedBytes` or `mtd (mut self: ByteBuffer)` and `pub static fnc allocate`, emit deterministic `E_UNSUPPORTED` with no artifact, rather than falling back to an implicit host byte-array implementation.
- The current staged source intentionally does not include borrow-checked `view`/`view_mut`, `try_*` Result methods or u64 operations. These remain mandatory future API/ABI gates, not claims about current support.

Verification is still `NOT_EXECUTED` for all compilers. Source-only SHA/Node tests and host Rust bit-model tests are not compiled Atto guest evidence.
