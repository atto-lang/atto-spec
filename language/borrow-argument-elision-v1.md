# Borrow-aware argument elision — BAE-v1 (candidate)

**Status:** performance contract / draft. This does not change AttoLang
ownership semantics, authorize general pointer reuse, or certify any backend.
It applies to the versioned borrow-by-default profile defined in
[implicit-argument-borrow-v1.md](implicit-argument-borrow-v1.md).

## The semantic invariant

For a nonprimitive, nonconsuming parameter, `f(x)` and
`f(borrow! x)` issue the same readonly loan; `f(mut x)` and
`f(borrow! mut x)` issue the same exclusive loan when admitted. The
compiler must produce equivalent observable behavior for either spelling.
Neither spelling allocates an owned object, performs a deep or shallow copy,
implicitly shares a capability, or transfers ownership.

**Passing a handle physically is not a semantic object copy.** Ordinary
parameter passing may still require a register move or a stack write.
BAE does **not** demand that the compiler avoid these necessary ABI transfers.
In particular it must not replace one pointer-sized value with an extra
pointer-to-pointer dereference just to describe a no-copy optimization.

## Eligible zero-copy / no-wrapper lowering

Baseline: checker-only call-loan records, not runtime-class objects. An
ordinary borrow passes the existing guest object handle, preserving ownership,
origin, generation/domain information and lifetime in typed IR. Do not create
a heap borrow wrapper or extra owned class slot to model an implicit loan.

A backend MAY omit a redundant reference movement by register coalescing or
SSA propagation, or erase the whole boundary by inlining, when it proves
equivalent ordering, effects, exceptional cleanup and observability.
Wasm reference handles can remain i32 values even when the guest object itself
lives in linear memory; they are not publicly forgeable raw pointers.

### BAE-v1 candidate executable subset

A resolved, monomorphic **top-level** synchronous function may be inlined at
a borrow-by-default call only if all are true:

1. Exactly one class formal is explicitly tracked in typed IR as BorrowRead
   (not BorrowWrite, Take, Share, or an unversioned legacy owned formal).
2. The entire typed callee body is exactly a direct read of one **public
   ordinary** scalar `int`, `bool`, or `float` field on formal slot 0,
   returned immediately. No locals, second statement or control flow.
3. The read is ordinary FieldGet, not sealed actor state, a protected field,
   FFI, computed property, virtual call, interception hook, or an access with
   unproven authority.
4. Argument expression is evaluated **exactly once** and remains subject to
   the original borrow-checker call-loan and conflict checks, including
   argument order and live loans. The optimized read uses the same receiver
   and field offset as the original typed callee.
5. The implementation cannot bypass instrumented/observable tracing,
   cooperative-scheduler accounting, runtime safepoints, checked exceptions,
   profiler semantics where required by profile, or function hot-reload
   semantics. If any apply or cannot be proved equivalent, use the original
   call. Do not emit a new raw pointer or unverified lifetime.
6. Preserve the callable's normal function body and ABI for all other callers
   (including external/exported uses); the call-site optimization is optional.

This is deliberately narrower than general-purpose inlining. It is a
proof-gated optimization, not a new `borrow!` variant or new user keyword.

## Distinguish read and write authority

- Two BorrowRead references **may alias**. Do not mark readonly loans
  `noalias` merely because they are borrowed. Readonly does not itself
  establish immutability across mutable aliases, threads, FFI or callbacks.
- BorrowWrite requires proven exclusivity over its whole region; only then
  may a backend exploit suitable alias metadata, and it must preserve
  trap/exception/unwind behavior and all reborrows.
- Take transfers authority; it cannot be turned into a readonly loan.
- `copy! x` makes a new shallow root (with proved sharing of child
  references); `copy!! x` makes an independent mutable graph where proved.
  BAE cannot simply reuse `x` for either observable copy operation.
- Actor state, cross-domain messages, async suspensions, pinning, generation
  fencing, closure escape and FFI all require their own checked boundaries.

## Compiler conformance and acceptance

1. For the candidate pure getter, compile `inspect(x)`,
   `inspect(borrow! x)`, and direct `x.value` with the **same**
   definitions. When the optimizer is enabled, the caller function machine
   instructions should be equal (Wasm may be compared byte-for-byte if the
   deterministic module still contains the unchanged callee body).
2. Prove exactly one owner class local in the caller; no synthetic guest
   borrow-wrapper local, allocation, refcount or memcpy. Preserve the
   borrowed formal in typed IR and metadata.
3. Reject elision for a mutable formal or a callee with a side effect,
   additional statements, protected state, unknown effects, dynamic dispatch,
   unsupported lifetime or unknown actor/FFI boundary. Execute relevant
   positive guests and verify no artifacts for invalid ownership programs.
4. Separately measure generated code and benchmark before claiming a speedup.
   Elision may be neutral or worse in the face of code size, register
   pressure, instruction cache or missed runtime optimization.
5. Pin compiler source commit/tree and actual guest output; a zero-step
   GitHub Actions run or a source-only oracle is NOT_EXECUTED, not PASS.

## Backend staging

- **Rust/browser/Wasm:** candidate codegen slice in
  [atto-source.rs borrow-getter-elision-v1 branch](https://github.com/atto-lang/atto-source.rs/tree/feat/borrow-getter-elision-v1-20261122),
  stacked on borrow-default and mutable-borrow drafts; requires executed
  compiler and guest verification before promotion.
- **Java/GraalVM, LLVM, Forge, .NET Native AOT, independent Wasm and other
  atto-source.* targets:** audit existing optimization and alias metadata;
  preserve the common semantic contract and add equivalent guarded tests.
  Their implementations are NOT asserted by this document.

BAE has no mandatory user-visible syntax and must never change the
versioned compatibility profile. Fallback to ordinary checked calling
conventions is always correct when proof is unavailable.
