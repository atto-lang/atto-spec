# Pointer<T> safety and full-AOT lowering contract — v1 draft

**Status: proposed normative target; NOT a claim that any backend implements Pointer<T>.** This contract concerns AttoLang source, not Rust/C++ implementation pointers.

## Source syntax

- Pointer<T> is a **compiler-known nominal class**, invariant in T. A user-defined class named Pointer cannot shadow or imitate the builtin. No pointer value is an integer, raw address, arbitrary byte string, or implicitly convertible to one.
- The proposed API uses explicit typed methods: Pointer.alloc<T>(count), p.read_at(index), p.write_at(index, value), p.close(). Its exact fallible allocation return type must be finalized before claiming executable support.
- **Address-of via unary & and dereference via unary * are forbidden.** Binary * remains multiplication; contiguous yield* remains generator delegation. The -> token used in function signatures is never pointer member access.
- The ownership operations borrow!, copy!, take!, and share! must be checked by the compiler, not treated as casts. Backends recognizing rt ownership spellings must implement the same ownership rules, not unchecked aliases.
- An absent pointer is Option<Pointer<T>>, never an untyped null address. A zero-sized region may exist but may not be dereferenced.
- No implicit pointer arithmetic, integer-to-pointer conversion, reinterpretation, arbitrary address construction or serialization of pointer bytes.

Illustrative TARGET syntax (not yet accepted by the browser backend):

~~~atto
pub fnc use_pointer(): Result<int, PointerError> {
    let cells: Pointer<int> = Pointer.alloc<int>(4)?;
    cells.write_at(0, 42)?;
    val n: int = cells.read_at(0)?;
    cells.close()?;
    return Ok(n);
}
~~~

The illustrated PointerError and Result-returning method signatures, plus mutation-receiver syntax, are proposed and must be verified in the final type checker. read_at returns a copied value only when T is Copy. Non-Copy element access uses a proved loan or ownership move.

## Local checked-pointer aliases: `rt ref` and `ref!` (TARGET, not compiler-certified)

In addition to `Pointer.alloc<T>(count)`, AttoLang proposes a **nonallocating, checked,
local-place capability**. These two source programs MUST be type-equivalent and
produce the integer exit result `42` on each conforming compiler backend:

```atto
pub fnc main(): int {
  let value: int = 42;
  val Pointer<int> ptr = rt ref value;
  val answer = rt deref ptr;
  rt unref ptr;
  return answer;
}
```

```atto
pub fnc main(): int {
  let value: int = 42;
  val Pointer<int> ptr = rt ref value;
  val answer = deref! ptr;
  unref! ptr;
  return answer;
}
```

### Required typing and effects

- For an addressable named local `value: T`, `rt ref value` makes a compiler-minted
  `Pointer<T>` to the *existing* place. It MUST NOT expose a raw stack address,
  copy an allocation, silently create a heap allocation, move a primitive `int`,
  or treat the handle as an untyped integer. The referent must remain alive and
  stable until the last handle release. `ref! value` is its canonical operator
  alias when the contextual result type is `Pointer<T>`; token boundaries and
  one-time operand evaluation match the ownership-bang grammar.
- `rt deref ptr` and `deref! ptr` have the same read semantics. For
  `Pointer<int>` they return a fresh `int` **value copy**. For non-`Copy`
  referents they yield an explicitly checked readonly loan, not an implicit
  ownership copy. Read requires a live authenticated region, correct generation,
  domain, access rights and initialized referent.
- `rt unref ptr;` and `unref! ptr;` both consume the unique **handle** and
  end its loan. They return `void` in the `Pointer<T>` case and **do not free**
  the original stack local or invalidate the already-copied `answer`. A
  non-`mut` `val` binding may be consumed exactly once. Neither spelling
  means unsafe reference-count decrement or arbitrary memory reclamation.
- Existing `CheckedRef<Class>` / ownership-moving `ref!` prototypes are a
  **different checked-handle family**, with different `unref!` ownership-restoring
  result semantics. They must not be silently treated as `Pointer<Class>` or
  substituted for a local-place pointer. Type-directed resolution must be
  unambiguous; an unsupported/ambiguous combination fails closed.
- While the local pointer is live, reject unsafe referent writes, moves, drops,
  escape/return of the pointer, aliasing mutable loans, stale or forged handles,
  double unref, use after unref, cross-actor/tenant transport, and unproved
  suspension/exceptional exits. The initial `pointer-ref-local-v1` profile requires explicit `unref`
  on every reachable normal exit and rejects a missing release. A future
  automatic cleanup profile must be independently specified and proved for
  all normal, exceptional and cancellation exits before relaxing this gate.
- Both spellings must lower to the **same typed HIR/MIR ownership events** and
  backend effect checks; formatter normalization must preserve their meaning,
  and may retain `rt` as a compatibility spelling. A parser-only match, a host
  oracle, or an unexecuted fixture is NOT implementation parity.

Conformance authority: the target-only `atto-platform-conformance`
`pointer-ref-local-v1` fixtures. Promoting any backend to PASS requires an
actual compiled Atto guest returning 42, equivalent artifact/behavior for
both forms, and compiled negative rejection with no output artifact.
This candidate extends the separately staged `Pointer.alloc` capability
work; it is **not** a claim that any present compiler supports these programs.

## Logical representation and integrity

Every pointer capability identifies a T layout, its owning actor incarnation and tenant/memory domain, a live region plus **generation**, a byte length and initialized-element range, a checked offset, its access rights (read, exclusive write, own/drop, frozen share), and revocation epoch. The compiler can choose inline metadata or bounded region-table entries, but **never** omit the semantic checks.

The AOT ABI is opaque: compiled Wasm can use a 32-bit guest handle plus checked linear-memory region table. Native code can use real machine addresses *internally* only after provenance/lifetime/bounds checks, without exposing raw T-star addresses as guest capabilities. The existing closed-world target profile currently models 32-bit guest handles.

For each read_at/write_at:
1. Validate live region, generation, correct actor/domain, access rights, initialized state and incompatible loan exclusions.
2. Require index < element_count; calculate index * size_of(T), offset + width and allocation bytes with **checked arithmetic before pointer addition**; validate alignment.
3. Never load or store after close, take, actor retirement/restart, cancellation or revocation; overwrite of an owned T calls statically selected drop glue exactly once.
4. Reject statically provable mistakes at compile time. Runtime-dependent violations must become a typed contained pointer failure (or documented actor-local panic and supervisor CONTROL notice), **not undefined behavior**.

## Ownership and actor safety

- The unique owner drops its region once, including normal return, throw, raise, panic, cancellation, supervisor STOP/restart and partially initialized graph cleanup.
- borrow! creates a scoped read loan, or a proven exclusive write loan when mutable access is required. No loan escapes a shorter-lived region or crosses await/select, critical access, actor restart or FFI unless frame-pinning plus effect proofs establish safety.
- copy! cannot copy a mutable *capability*. Copy data into a new independent region, or copy a legitimately immutable shared handle with the same lifetime/domain restrictions.
- take! revokes sender ownership **only on successful atomic mailbox admission**; full/closed/denied/canceled admissions preserve sender ownership and generation.
- share! requires a proven permanently, transitively frozen object graph with no writable alias. The region must remain live while any shared handle or loan exists: deterministic bounded reference accounting or a proven scoped lifetime must prevent premature close. Explicit close with outstanding loans/shares fails or is statically rejected; retirement releases the last share exactly once. Arc, Box, Atomic, Send and any wrapper do not automatically establish Sendability, tenant authority, freeze, or FFI safety.
- No raw pointer capability traverses tenant/isolate/web-worker or network boundaries. An authorized broker may copy/serialize *values*. Same-domain zero-copy moves require a proven matching arena and generation revocation.
- Foreign memory needs explicit privileged FFI effects, pinned lifetime, transfer/copy rules, a closed-world import manifest, and teardown rules. A source-level Pointer cannot turn unchecked foreign addresses into safe capabilities.

## Full ahead-of-time code generation (mandatory)

The compiler specializes every reachable Pointer<T>, size/alignment, load/store/drop glue, actor-entry/callback/resume edges, and permitted foreign ABI imports before producing the artifact. Runtime region tables and guards are allowed; an interpreter, JIT, runtime compilation, eval, runtime code generation, mandatory reflection, or open-world unspecialized generic dispatch are not.

Pin exact source commit/tree, compiler binary SHA-256, target triple, artifact digest, static specializations and imports. Emit actual executable native binaries (LLVM, GraalVM Native Image, .NET Native AOT, Forge native) or compiled Wasm and execute compiled guest tests. Hard-real-time profiles require bounded allocation, reclamation and guard cost, with precharged actor arenas or explicit allocation failure. Runtime compiler invocation count must be zero.

A structural proof model and a Wasm-only pass do **not** certify native AOT. Report Java/JVM and browser host GC separately from guest ownership guarantees.

## Mandatory release tests

**Compiled positive guests:** alloc/read/write/close; last valid index; multi-element bounds; alignment; deterministic partial drop; scoped read/write loans; successful same-domain move; failed mailbox admission rollback; frozen share; actor restart revocation; native AOT binary executes directly.

**No-artifact negatives:** address-of &x; unary *p; integer-to-pointer cast; user class named Pointer; unimplemented Pointer<T>; uninitialized read; use-after-take, loan escape, borrow across await/select, aliasing write, illegal copy/share, cross-tenant pointer transport, unchecked FFI, unsupported open-world type.

**Adversarial runtime guests:** zero-length read, u32::MAX sizes and overflow, one-past-end, stale generation and ABA reuse, alignment faults, repeated close, unexpected cancellation/panic, hostile cross-domain token replay and transfer races. Require ASan/UBSan where native and deterministic contained faults for Wasm.

Track each backend as PASS, FAIL, UNSUPPORTED or NOT_EXECUTED with exact-head executable evidence. This document itself does not mark any backend pointer-ready. Related: atto-target-profiles/docs/CLOSED_WORLD_AOT_PROOF_V1.md and atto-platform-conformance/contracts/pony-reference-capabilities-atto-v1.json.
