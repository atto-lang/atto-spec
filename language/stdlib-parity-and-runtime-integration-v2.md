# Library parity, cross-file compilation and runtime integration (v2 roadmap)

**Status: PROPOSED ROADMAP (2026-11-23).** It builds on the normative
[core/alloc/std libraries v1](core-alloc-std-libraries-v1.md) (selectors,
layering, platform units) and the target architecture in
[typed linked IR v1](typed-linked-ir-v1.md). Nothing here claims backend
parity; the status columns record what each compiler ships on `main` today.

## 1. Goal

AttoLang's compiler-owned libraries, and their tests, should be on par with
the standard libraries programmers already rely on:

| Reference | What we take from it |
| --------- | -------------------- |
| Rust `core` / `alloc` / `std` | The three-layer split, zero-GC ownership APIs, `Option`/`Result` idioms, iterator adapters, collections, `io`/`fs`/`path`/`process`/`thread`/`sync`/`net`/`time`. |
| Kotlin stdlib (+ `kotlinx.coroutines`) | Rich collection and sequence operations (`map`/`filter`/`fold`/`groupBy`/`chunked`/`windowed`/`zip`/`partition`/`sortedBy`), ranges, text, `Duration`, structured concurrency, `Flow` and `Channel`. |
| Erlang/OTP | `lists`/`maps`/`sets`/`queue`/`array`/`binary`/`string`, `timer`/`calendar`, `ets`-style tables, and the behaviours: `gen_server`, `gen_statem`, `gen_event`, `supervisor`, `application`, process registries and monitors, hot code upgrade. |
| C++ standard library | `<algorithm>`/`<numeric>`/`<ranges>`, `span`/`string_view`, `optional`/`variant`/`expected`, `<bit>`/`<charconv>`/`<limits>`, `<chrono>`, `<filesystem>`, `<format>`, `<random>`, `<atomic>`/`<thread>`/`<mutex>`/`<condition_variable>`/`<latch>`/`<barrier>`/`<semaphore>`. |

The library stays AOT- and zero-GC friendly: no hidden global heap, no
reflection, deterministic release (arenas, actor heaps, owned buffers).

## 2. Catalog (v2) and status on `main`

Status letters: **L** LLVM, **J** Java, **R** Rust, **N** .NET.
A letter in **Have** means the unit is registered and exercised by tests on
that backend; *legacy* means it exists only in the pre-v1 registry or under
another name. Units that do not exist anywhere are marked "—".

### 2.1 `core` (freestanding: no heap, OS or scheduler)

| Unit | Have | Rust | Kotlin | Erlang | C++ |
| ---- | ---- | ---- | ------ | ------ | --- |
| `num` (checked/saturating/wrapping, min/max, pow) | L J R N | `core::num` | `kotlin.math` | `erlang` int BIFs | `<limits>`, `<numeric>` |
| `cmp` (ordering, min/max/clamp, comparators) | L J R N | `core::cmp` | `kotlin.comparisons` | `erlang:min/max` | `<compare>` |
| `option` / `result` (helpers; types are prelude) | L J R N | `core::option`, `core::result` | `Result`, `?.` | `{ok,_}`/`{error,_}` | `optional`, `expected` |
| `mem` (size/align, swap/replace/take) | L J R N | `core::mem` | — | — | `<memory>` utilities |
| `range` | L J | `core::ops::Range*` | `kotlin.ranges` | `lists:seq` | `<ranges>` `iota` |
| `cell` | L J(+legacy) N | `core::cell` | — | — | — |
| `slice` (borrowed views, search, compare) | L N, J legacy | `core::slice` | `List` views | `lists:sublist` | `span` |
| `iter` (adapters, folds) | L N, J legacy | `core::iter` | `Sequence` | `lists:map/foldl` | `<algorithm>`, `<ranges>` |
| `hash` | L N, J legacy | `core::hash` | `hashCode` | `erlang:phash2` | `std::hash` |
| `math` (float) | L N, J legacy | `f64` methods | `kotlin.math` | `math` | `<cmath>` |
| `contracts` | J | `debug_assert!` | `require`/`check` | guards | `assert`, contracts |
| `char` / `ascii` / `str` (borrowed text) | — | `core::char`, `core::str` | `Char`, `String` | `string`, `unicode` | `string_view`, `<cctype>` |
| `bits` (count, rotate, byte order) | — | integer bit methods | `Int.countOneBits` | `binary` | `<bit>` |
| `fmt` (format into caller buffer) | — | `core::fmt` | — | `io_lib` | `<format>`, `<charconv>` |
| `convert` (`From`/`TryFrom`) | — (J candidate held: java#1791) | `core::convert` | `toInt()` etc. | `list_to_integer` | `<charconv>` |
| `ptr` / `atomic` | J legacy | `core::ptr`, `core::sync::atomic` | `AtomicInt` | `atomics` | `<atomic>` |
| `time` (`Duration` only) | — | `core::time` | `kotlin.time` | `timer` units | `<chrono>` durations |
| `error` (error trait/protocol) | J legacy | `core::error` | `Throwable` | `{error, Reason}` | `<system_error>` |
| `algo` (sort, binary search, partition, dedup) | — | slice methods | collection ops | `lists:sort` | `<algorithm>` |

### 2.2 `alloc` (core plus an explicit allocator provider)

| Unit | Have | Rust | Kotlin | Erlang | C++ |
| ---- | ---- | ---- | ------ | ------ | --- |
| `arena`, `region`, `heap`, `pool`, `slab`, `allocator`, `aligned`, `secure`, `stats` | J (all); L arena/region/heap/aligned/secure/stats; R N arena | `alloc::alloc`, bump crates | — | per-process heaps | `<memory_resource>` |
| `vec` | L N | `alloc::vec` | `MutableList` | `array` | `vector` |
| `string` / `text` builder | — | `alloc::string` | `StringBuilder` | `iolist` | `string` |
| `box`, `arc`, `weak`, `drop` | J | `Box`, `Arc`/`Rc`, `Weak` | — | — | `unique_ptr`, `shared_ptr`, `weak_ptr` |
| `deque`, `linked_list` | J | `VecDeque`, `LinkedList` | `ArrayDeque` | `queue` | `deque`, `list` |
| `map` / `set` (ordered) | J | `BTreeMap`, `BTreeSet` | `sortedMapOf` | `gb_trees`, `ordsets` | `map`, `set` |
| `heap_queue` (priority queue) | — | `BinaryHeap` | `PriorityQueue` | — | `priority_queue` |
| `bitset` | J | — | `BitSet` | — | `bitset` |
| `actor_heap` | J | — | — | per-process heap | — |
| `fmt` (format to `String`) | — (J candidate held: java#1791) | `format!` | string templates | `io_lib:format` | `std::format` |

### 2.3 `std` (hosted)

| Unit | Have | Rust | Kotlin | Erlang | C++ |
| ---- | ---- | ---- | ------ | ------ | --- |
| `io` | L J R N | `std::io` | `kotlin.io` | `io` | `<iostream>` |
| `path` (posix/windows variants) | L J R N | `std::path` | `java.nio.file.Path` | `filename` | `<filesystem>` paths |
| `fs` | — | `std::fs` | `File` | `file`, `filelib` | `<filesystem>` |
| `env` | J legacy | `std::env` | `System.getenv` | `os:getenv` | `getenv` |
| `process` | — (java#1759 held) | `std::process` | `ProcessBuilder` | `os:cmd`, ports | — |
| `time` (`Instant`, wall clock) | — (java#1785 held) | `std::time` | `TimeSource` | `erlang:monotonic_time` | `<chrono>` clocks |
| `sync` (mutex, rwlock, condvar, once, barrier, latch, semaphore) | L | `std::sync` | `Mutex` (coroutines) | — (actors) | `<mutex>`, `<latch>`, `<barrier>`, `<semaphore>` |
| `channel` | — (java#1783 held) | `std::sync::mpsc` | `Channel` | mailboxes | — |
| `task` (structured concurrency) | — (java#1781 held) | async runtimes | `coroutineScope`, `Job` | `spawn_link` | `<future>`, `jthread` |
| `thread` / `pool` | — | `std::thread` | `Dispatchers` | schedulers | `<thread>` |
| `net` (tcp/udp), `http` | J `http_wire`; http held (java#1754) | `std::net` | `java.net` | `gen_tcp`, `inets` | — |
| `random` | — | `rand` crate | `kotlin.random` | `rand` | `<random>` |
| `collections` (hash map/set) | — | `std::collections` | `HashMap` | `maps`, `sets` | `unordered_map` |
| `telemetry` / `trace` / `log` | L J | `tracing` crates | — | `logger` | — |
| `testing` / `assert` | J legacy | `#[test]`, `assert!` | `kotlin.test` | `eunit` | — |

### 2.4 `std/otp` (actors and behaviours)

| Unit | Have | Erlang/OTP | Kotlin | Rust |
| ---- | ---- | ---------- | ------ | ---- |
| `otp/supervisor` (strategies, intensity, restart) | J legacy | `supervisor` | `supervisorScope` | actor crates |
| `otp/server` (call/cast/state) | — | `gen_server` | — | — |
| `otp/statem` | — | `gen_statem` | — | — |
| `otp/event` | — | `gen_event` | `SharedFlow` | — |
| `otp/registry` (names, groups, monitors, links) | — | `global`, `pg`, `erlang:monitor/link` | — | — |
| `otp/table` (actor-owned tables) | — | `ets` | — | — |
| `otp/timer` | — | `timer`, `erlang:send_after` | `delay` | — |
| `otp/app` (start order, config, hot upgrade) | — | `application`, `code`, `sys` | — | — |

## 3. How parity is tested

1. **Shared corpus first.** Every catalog unit gets guest programs in
   `tests/atto_libraries/` (identical across `atto-source.*`) and in
   `atto-platform-conformance/libraries/`. Each program states its expected
   exit code or stdout, plus reject cases with expected diagnostics.
2. **Behaviour vectors, written clean-room.** Edge cases are derived from the
   *documented behaviour* of the reference library (for example Rust's
   `checked_*` overflow rules, Kotlin's `windowed(partialWindows=…)`, Erlang's
   `lists:sublist/3` bounds, C++ `std::midpoint`). We do not copy reference
   test code.
3. **Per-backend unit tests stay.** JUnit, ctest, cargo and the .NET harness
   keep their own tests. A unit counts as **Have** only once the shared corpus
   passes on that backend.
4. **Baselines by test name.** Every change is gated by running the full suite
   on base and change and comparing per test name. A change may fix tests but
   never add a failure.

## 4. Phase 1: cross-file type checking and incremental compilation

Libraries larger than single-function helpers need cross-file typing. Java,
for example, today only types cross-file calls whose signatures use scalars,
`String`, or `Option`/`Result` of those. Generic, async, borrowing and
class-typed functions stay opaque, which blocks `std/task`, `std/process` and
`std/channel` (java#1781, #1759, #1783).

Target model (implements [typed linked IR v1](typed-linked-ir-v1.md)):

* **Package** = a manifest root (`.atto.pkg.toml`). It is the unit of
  distribution and of `pub[pkg]` visibility. Other packages see it only
  through its pinned public interface.
* **Namespace** = a tagged compile-time scope within a pinned package, as specified by [namespace modes v2](namespace-modes-v2.md). Omission, default and file headers select a file-local scope; named headers join the exact named scope across directories, and folder headers explicitly join participating files in the same direct logical folder. Full paths and kind tags prevent collisions. No implicit folder enrollment or cross-package attachment.
* **File** = the parse and cache unit, inside a namespace.
* Each namespace produces a typed **interface** and an **interface hash**:
  exported declarations, overload signatures with generics, nominal types,
  effects such as async/suspends, and borrow modes. Each package produces a
  package interface (its `pub` exports) and hash.
* Bodies are type-checked against imported interfaces, never against
  concatenated source. Cross-file generics are instantiated at the call site
  from the interface. Async functions keep their `Future<T>` type across
  files. Borrow parameters keep their loan mode.
* **Incremental, at namespace and package level:**
  1. Editing a file re-parses that file and re-checks its namespace.
  2. If the namespace's interface hash is unchanged, nothing else is
     re-checked.
  3. If it changed, only namespaces that import it re-check, stopping at any
     namespace whose own interface hash stays the same.
  4. Other packages re-check only when the package interface hash changes,
     and then only their importing namespaces.
  5. Compiler-owned library units are pre-checked interfaces pinned to the
     compiler build, so they never re-check.

Rollout: Java first, since `IncrementalCompiler` already has per-unit ABI
hashes and dirty propagation. Then Rust (`linker.rs`,
`package_resolver.rs`), LLVM (`PackageNamespaceGraph`,
`VerifiedNamespaceGraphV2`) and .NET (`StructuredModuleLinking`). A shared
multi-file corpus (`tests/multi_file/`: packages, namespaces, generic, async
and borrow signatures across files, interface-change invalidation) gates
each backend.

## 5. Phase 2: `core` and `alloc` to Rust/C++ parity

Fill §2.1/§2.2 on all four primary backends: text (`char`/`str`/`string`),
`bits`, `fmt`, `convert`, `algo`, `iter` adapters, ordered collections,
priority queue and the smart pointers. Kotlin-style collection operations live
in `core/iter` (lazy) and `alloc/vec` (eager) under one naming scheme.

## 6. Phase 3: `std` and `std/otp` to Kotlin/Erlang parity

Land the held std PRs once phase 1 is in. Then `fs`, `thread`/`pool`,
`random`, `collections`, and the OTP behaviours in §2.4.

## 7. Phase 4: integrating `core` with the runtime

The runtimes currently implement policy in host code (Java `OresVM`,
`OresScheduler`, `NioReadinessGroup`, `OtpSupervisor`; LLVM `ores_vm`; .NET
`OresVm`). Phase 4 moves the portable decisions into checked `core`/`std` units
that every backend runs. The host keeps only the trusted mechanism (syscalls,
memory mapping, thread creation).

| Runtime component | Portable policy to move into AttoLang units |
| ----------------- | -------------------------------------------- |
| Tenant VM (`OresVM`, `ores_vm`) | admission budgets, isolate quotas, source budgets (`std/source_budget_policy` exists in Java) |
| Scheduler | run-queue fairness, cooperation quanta (`cooperation_policy`), CPU budgets (`cpu_budget_policy`), deadline admission |
| NIO reactor | readiness-set bookkeeping, backpressure and admission windows, timer wheel arithmetic |
| Actor supervisors | restart strategies and intensity windows (`otp/supervisor`), monitors and links |
| Main control loop | phase ordering, shutdown and drain state machine (`otp/statem`) |
| Thread pools | sizing (`cpu_budget_policy`), work-stealing thresholds, parking policy |

Each move needs a differential test: the AttoLang unit and the existing host
policy must agree on generated vectors before the host code is retired.

## 8. Order of work

1. Record per-test baselines on every backend (done for 2026-11-23 `main`).
2. Phase 1 in Java, then Rust, LLVM and .NET, with the multi-file corpus.
3. Land the held Java std PRs.
4. Phase 2 unit by unit, shared corpus first.
5. Phase 3 and phase 4 interleaved: each OTP behaviour lands with the
   runtime component that consumes it.
