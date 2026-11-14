# 27 — Atomics, Happens-Before and Receive-Only Serialization

**Status: TARGET, 2026-11-14.** This records the language owner's decision. An AttoLang backend is **NOT_VERIFIED** until real `.atto` guest compilation, execution and negative diagnostics are attached at an exact commit. Java host atomics or Node host models alone do not prove guest support.

## Motivation and surface

AttoLang executes ordinary actors concurrently by default. Executing the same immutable code on several carrier threads is safe; concurrently accessing mutable shared storage requires an ownership-safe synchronization boundary.

`Atomic<T>` is the portable shared-scalar abstraction. It is a standard-library/core type, **not** a new `atomic` or Java-style `volatile` keyword. Portable initial specializations are `Atomic<bool>`, `Atomic<int>` (signed i64), and `Atomic<i8/i16/i32/i64/u8/u16/u32/u64>` where the target guarantees the width. There is no implicit `Atomic<String>`, `Atomic<Pointer<T>>` or atomic aggregate. Unsupported widths must be rejected or implemented using a documented linearizable lock-based fallback, never silently downgraded to ordinary loads/stores.

Proposed guest API (snake_case). Java's first interpreter-backed i64 slice uses `Atomic.new(initial)`; other scalar widths, explicit ordering and broader sharing remain TARGET until individually tested:

```atto
val counter: Atomic<int> = Atomic.new(0)
val before: int = counter.fetch_add(1)
val after: int = counter.load()
counter.store(42)
val old: int = counter.swap(7)
val result = counter.compare_exchange(7, 9)
```

`compare_exchange(expected, desired)` is **strong**, returning a typed `CompareExchange<T>` outcome with `exchanged: bool` and `observed: T`; it must never hide spurious failure. `fetch_add` and `fetch_sub` return the previous value. Integer bitwise `fetch_and`, `fetch_or` and `fetch_xor` likewise return the previous value. Arithmetic is checked: an overflowing `fetch_add`/`fetch_sub` fails by the language's integer-overflow panic rule **without publishing** a wrapped update. Other RMW operations have one atomic linearization point.

`Atomic<T>` retains one allocation identity. Copying a handle may create another authorized reference, never another independent cell or duplicated ownership. **The initial Java i64 guest slice rejects `rt copy` and `rt share` of direct or nested Atomic cells** until the compiler/runtime can prove such reference and region lifetimes. Shared access requires an explicitly authorized shared allocation domain, valid generation and lifetime, and permitted synchronization capabilities. `Atomic<T>` does **not** make adjacent mutable data, referents, or arbitrary guest pointers thread-safe; it does not bypass sealed `state`, critical loans, tenant isolation, or the 32-bit actor-relative handle checks.

## Memory order

The default for every operation is sequentially consistent (`seq_cst`). Advanced explicit orders are **TARGET**, not required for an initial backend primitive:

| Operation | Allowed orders |
| --- | --- |
| `load` | `relaxed`, `acquire`, `seq_cst` |
| `store` | `relaxed`, `release`, `seq_cst` |
| `swap`, `fetch_*` | `relaxed`, `acquire`, `release`, `acq_rel`, `seq_cst` |
| successful `compare_exchange` | `relaxed`, `acquire`, `release`, `acq_rel`, `seq_cst` |
| failed `compare_exchange` | `relaxed`, `acquire`, `seq_cst`; no stronger than the successful order |

Proposed order arguments use named values, for example `counter.load(order: MemoryOrder.acquire)` and `counter.compare_exchange(7, 9, success_order: MemoryOrder.acq_rel, failure_order: MemoryOrder.acquire)`. Illegal combinations must fail at compile time when statically known, or fail before executing the atomic when selected dynamically. `release` is invalid for loads, `acquire` is invalid for stores, and failure orders cannot include `release`/`acq_rel`.

A release operation synchronizes with an acquire operation that reads its value through the applicable modification sequence. `seq_cst` operations participate in a single consistent global order. `relaxed` accesses provide atomicity and modification order for that cell, but do not publish unrelated non-atomic memory. Non-atomic shared mutable accesses without proven synchronization are illegal. Every backend must preserve the same guest happens-before contract, even where host atomics are stronger.

No Java-style `volatile` concurrency alias is introduced. A future `Volatile<T>` for memory-mapped device registers would not be a thread-synchronization primitive.

## Concurrent actor calls and receive-only `serial`

An ordinary actor may execute multiple `receive()` invocations **and** several receiver methods concurrently, subject to bounded scheduling, ownership, independent invocation/task stacks, and sealed-state loan arbitration.

`define serial actor X` changes **only DATA `receive()` invocation admission**: there is at most one live `receive()` invocation per actor incarnation, from start of execution through completion, cancellation or terminal failure, including its suspended time. Later DATA receives remain queued. A wake resumes the same invocation/stack; it does not admit a new receive.

**Other receiver methods remain eligible to execute concurrently with `receive()` and one another on a serial actor**, when invoked independently. They do not consume the receive-only permit. A method called synchronously *from* `receive()` is part of its existing invocation rather than another receive. An explicit attempt to invoke `receive()` through any route must obey the same serial gate and authorization rules; no dispatch bypass is allowed.

`critical-read` permits multiple compatible readers; `critical-write` is exclusive against readers/writers of its protected state. Neither ordinary concurrency nor the `serial` qualifier grants an implicit state loan. No loan may escape or silently span suspension. A serial receive may be waiting on I/O while an independently invoked `status()` method reads state under `critical-read`. The serial gate MUST NOT hold a global actor lock that blocks such unrelated methods. CONTROL notices retain their separate supervisory path, not the DATA receive gate.

Pending receives, independently invoked methods and tasks have separately accounted live frames. A receive gate permit is released only on terminal completion and correct physical retirement for its incarnation; stale wake/cancel tickets cannot release a newer permit. Restarts fence old generations. Serial admission is not a guarantee of single-threaded actor execution.

## Staged implementation status (Java, 2026-11-14)

The Java/GraalVM draft now has a compiler/evaluator binding for `Atomic.new(0)` as `Atomic<int>`, checked sequentially consistent host operations, and a compiler-generated CAS result projection. It prohibits unproven atomic sharing in actor signatures, `SharedMutex`, and `rt copy`/`rt share`, including nested typed containers. This is a **verified Java interpreter slice**, not a native-AOT or cross-backend parity claim: its checked-in positive/negative `.atto` guest/compiler tests executed on an independently SHA-verified full Java implementation subtree in [athlet-o run 43646372081](https://github.com/athlet-o/athleto-docs/actions/runs/43646372081), with **31/31 focused tests passing**.

The draft `ActorRuntime.ActorCell` now retains an incarnation-scoped receive permit from dispatch through synchronous completion or source-Future settlement, and holds the permit until physical cleanup for stopped actors. `SourceActorState` and compiler-sealed regions carry the explicit `serialReceive` flag. A nonblocking host-only read/write arbiter permits multiple logical readers and excludes all writers; it fences stale views at STOP without reclaiming live lexical tickets.

**Important limitation:** the existing ActorCell physical single-writer carrier remains enabled, so neither ordinary actors' parallel `receive()` execution nor independent receiver-method concurrency is currently verified or enabled. The receive permit is conservatively limited to one live invocation for both actor kinds until independent stacks/continuations and actor-state ownership are proven. The implementation must not claim full user-requested concurrency merely because parser flags and host permit tests exist.

The exact Java host primitives passed local Java 21 stress checks for atomic updates, overflow/CAS, receive permits, and multi-reader/exclusive-writer loans. Earlier token-free private CI carrier runs in voxletra and akrion-sim failed with zero steps. A later approved private carrier **athlet-o** passed real runner [host primitive checks](https://github.com/athlet-o/athleto-docs/actions/runs/43644399436) and [all 21 exact Java PR-delta blob checks plus host tests](https://github.com/athlet-o/athleto-docs/actions/runs/43644857767). Subsequently, the private carrier reconstructed and verified the **entire 289-file `src/main/java` tree SHA**, full `src/main/resources` and `stdlib` tree SHAs, plus the checked-in `.atto` fixtures. It successfully compiled the compiler and executed [31 focused compiler/guest JUnit tests](https://github.com/athlet-o/athleto-docs/actions/runs/43646372081) and [104 existing source actor/state lifecycle regression tests](https://github.com/athlet-o/athleto-docs/actions/runs/43646666902), with zero failures or skips. This is **135 test executions**, not a full mirror of the unrelated files in the 2,250-blob repository. Physically concurrent actor invocation dispatch, Native Image sealed guest AOT, and LLVM/.NET/WASM/Forge parity remain **NOT_EXECUTED**.

**Native-host guest execution evidence (not sealed guest AOT):** [athlet-o run 43647843652](https://github.com/athlet-o/athleto-docs/actions/runs/43647843652) used matching GraalVM 25.3.4.1/Truffle 25.3.4.1 to build the exact-source Java host as an x86-64 native-image executable, then **executed** the checked-in `atomic_i64_guest.atto` source with its output byte-for-byte matching `42:42:44`. The executable's `--build-info` reported `build_mode=aot` and `guest_execution=interpreter-no-jit`. This proves a native **host** running guest source without JIT compilation; it does *not* prove ahead-of-time machine-code lowering of the guest AttoLang program, zero process GC, the target parallel actor scheduling, or non-Java backend parity.

## Backend lowering and conformance

- **Java/GraalVM:** `AtomicLong`/VarHandle or stronger host primitives, explicit guest `Atomic<T>` binding, checked RMW, Native Image compatibility.
- **LLVM:** typed atomic load/store/RMW/CAS, explicit ordering, correct overflow-without-publication CAS loops and sanitizer-backed native execution.
- **.NET Native AOT:** Interlocked/Volatile lowerings with checked CAS loops, no dynamic reflection dependencies.
- **Wasm:** feature-gated shared-memory atomics or an explicitly approved linearizable fallback; no unsupported shared-memory mode silently compiles.
- **Forge:** independently implemented atomic lowering, scheduling permit and visibility tests.

Required `.atto` acceptance/negative cases: concurrent atomic increments; compare-exchange success/failure and observed value; overflow leaves the cell unchanged; release/acquire publication; invalid order combinations; unapproved shared-domain access; non-atomic shared mutable data rejected; overlapping concurrent `receive()` calls on ordinary actors; receive-only serialization across `await`; concurrently invoked non-`receive` method during a serial receive; compatible critical readers and exclusive writer; stale-generation cancellation/retirement cannot admit two receives. Each backend must report compiler SHA, fixture blob SHA, compiled guest execution or exact compile-time diagnostic, and status PASS/FAIL/UNSUPPORTED/NOT_EXECUTED.

See [chapter 05](05-actors-and-state.md), [chapter 22](22-concurrency-and-shared-ownership.md) and [chapter 25](25-receive-invocation-stacks.md). A host-only model is useful design evidence, not guest runtime certification.
