# Shared ownership and explicit synchronized mutation v1

**Status: TARGET / DESIGN CONTRACT — NOT COMPILER OR RUNTIME CERTIFIED (2026-11-18).**
Scope: canonical AttoLang `.atto` source and every backend. This document ratifies the intended distinction between ownership aliases, temporary loans, and guarded access. Syntax for library `Shared<T>`, `RwLock<T>`, and callback methods below is **proposed**, not an assertion of executable support.

Related work: [ownership bang aliases](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/pull/67), [implicit argument borrowing](https://github.com/atto-lang/atto-spec/pull/89), [conformance registry](https://github.com/atto-lang/atto-platform-conformance), [chapter 04](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/blob/main/spec/04-ownership-and-memory.md), [chapter 22](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/blob/main/spec/22-concurrency-and-shared-ownership.md).

## Rule

`share! value` is explicit shared **ownership**, not an implicit mutable borrow, an exclusive-writer privilege, a deep copy, or an implicit mutex. It is the canonical spelling of legacy `rt share value`; both require the *same* authorization, provenance, runtime identity, and backend lowering. Shared handles point to the same logical allocation / object graph. An ordinary shared handle grants only readonly traversal of all reachable ordinary object data. Multiple concurrent readers are permitted.

A shared handle **cannot** directly mutate ordinary fields, even if every reader is currently idle. Only a proven unique-owner recovery or an *explicitly synchronized* interior-mutable object permits writes; absence of readers is not a sufficient proof of unique ownership.

| Operation | Permissions | Effect |
| --- | --- | --- |
| `borrow! x` or implicit readonly `fnc f(Foo x)` loan | Temporary readonly, not owning | No clone, owner remains live |
| `borrow! mut x` or checked `f(mut x)` | Temporary exclusive write loan of writable place | No aliasing writer or reader during loan |
| `take! x` | Exclusive ownership transfer | Old owned place invalidated |
| `copy!! x` | Independent deep graph copy, where supported | No nested mutable alias to original |
| `share! x` / `rt share x` | Shared ownership of frozen view or protected container | No implicit mutable alias and no object deep copy |

The ordinary call-site borrowing default **never** inserts `share!`, reference counting, a lock, a freeze, actor transport, or a heap allocation.

## Conversion, aliases, and deep freezing

1. **Unique to shared**: `share! owned` consumes the unique *writable capability* of `owned` and returns a shared handle; it does not copy or duplicate the underlying payload. The old unique owner is no longer usable through its original exclusive place. An implementation may reuse the same allocation or relocate it to a validated shared region, but may not leave a live writable alias behind.
2. **Shared to shared**: `share! handle` creates another owner of the *same allocation*, subject to valid ownership domain and refcount/handle-capacity checks. All shared owners keep identical readonly rights; no owner obtains direct exclusive writes merely by being the last active reader.
3. **Transitive read-only**: freezing covers all ordinary mutable edges reachable from the shared root, including arrays, collection elements, nested objects, closures/captures and cycles. A mutable alias to the reachable graph that predates freezing blocks conversion unless the compiler proves it retired. A readonly view of a mutable graph is **not** sufficient to manufacture a frozen shared owner.
4. **Explicit interior mutability exception**: a trusted synchronization container such as `RwLock<T>` can be referenced by a frozen shared handle. Its own fields remain inaccessible as arbitrary mutable aliases; only its verified guard API can access protected `T`. A user-defined type may claim equivalent behavior only through a reviewed capability/unsafe boundary with enforced implementation obligations.
5. **Never infer unsafe authority** from `ref!`, `deref!`, `unref!`, FFI/raw pointers, casts, reflection, actor references, or a narrow checked handle. Provenance includes allocation identity, lifetime, actor/arena/isolate domain, generational validity and destruction rules.
6. Refcount/owner-retirement operations must be memory-safe, overflow-checked, race-free where supported, and balance drops exactly once. Cyclic graphs need an explicit deterministic ownership strategy; a cycle must not silently leak forever or be double-freed. No universal GC-free guarantee is implied.

If the backend cannot prove the deep freeze or represent the shared ownership lifecycle, reject the program before guest emission. Do **not** silently fall back to mutable aliases, shallow copies, or host-managed unrestricted references.

## Guarded shared mutation — library contract (TARGET)

`Shared<RwLock<T>>` is an illustrative generic type spelling; the canonical ownership expression remains `share! RwLock(value)`. Library APIs use snake_case, e.g. `with_read` and `with_write`. No new language keyword is required.

```atto
val state = share! RwLock(Counter());
val a = share! state;
val b = share! state;
val n = a.with_read(|counter| -> counter.value);
b.with_write(|mut counter| -> { counter.value = 42; });
```

This is **proposed source** and not an executable fixture on existing backends. Required semantics:

- `with_read` may admit many simultaneous readonly guards; `with_write` holds exactly one exclusive writable guard, excluding **all** overlapping readers and writers of the same protected object for its lifetime. A writer is **not** an appointed permanent owner; any authorized shared holder may request a writer guard sequentially.
- Borrow checker enforces guard-provenance, nonescape and exclusivity, including nested closures, method calls, early return, throw/raise/panic, cancellation, and drop. A guard cannot be returned, stored, sent, or retained by a callback. Returning detached owned scalars/data is allowed; returning a reference into the protected storage is not.
- The guard lifetime begins only after lock acquisition and ends on all supported exits. No user callback may suspend (`await`, `select`, task spawn with escaping capture), yield, re-enter the same non-reentrant lock, or cross actor turns while holding a guard. Any unknown indirect call effect must fail closed.
- Contention handling must never silently block an actor scheduler/reactor thread. Backends may use task parking / a safe suspension-aware acquisition *before* guard entry, or reject the feature on runtimes lacking such support. Cancellation of a waiter cannot retain, leak or duplicate a guard.
- Failed acquisition, poison/unwind, fairness/starvation and lock ordering must have specified, testable library policies. Do not claim `RwLock` automatically prevents deadlock or starvation; a guard may never be duplicated as a mutable alias.
- A separate `Mutex<T>` or `Atomic<T>` may provide narrowly typed interior mutability through similarly checked APIs. `share!` itself remains lock-free in language semantics (an implementation's reference-count atomics are not an application data lock).

**Uniqueness recovery** may later be exposed as an explicitly checked operation on a shared handle only if its allocation/domain/reference state is provably unique, no outstanding borrow or interior capability conflicts, and the operation invalidates/consumes the previous shared access path. There is no implicit downgrade from shared to exclusive based on observed reader count.

## Actor, domain, and serialization boundary

- Local `share!` does **not** imply `Sendable`, `Serializable`, network transport, shared linear memory, or crossing a runtime isolate. Cross-actor `share!` is permitted only for deeply immutable, explicitly admitted shareable objects in a proven shared domain, or a separately authorized cross-domain synchronized capability. An actor's sealed state and actor arena remain sealed.
- Default actor messages are owned via `take!` or independently copied via `copy!!`; they may not smuggle raw borrowed pointers, mutable reachable aliases, ordinary `RwLock` host objects, FFI handles, or actor-local references as a purported immutable share.
- `Sendable` (safe ownership transfer/share within supported execution domains) is distinct from `Serializable` (portable wire encoding). No arbitrary pointer or lock is serialized by sharing it.
- Java/GraalVM, LLVM, .NET, Forge, independent Wasm, and Rust/browser compiler paths must converge on observable owner/guard semantics; physical layouts and runtime mechanisms may differ. Wasm without shared memory must reject unavailable cross-worker sharing rather than manufacture a fake shared lock.

## Required compiler checks, error behavior, and rollout

Maintain typed rights in HIR/MIR: `OwnedUnique<T>`, `BorrowRead<T,lt>`, `BorrowWrite<T,lt>`, `SharedFrozen<T>`, and a separately verified protected synchronization capability. These are *semantic categories*, not required new user-visible spelling or runtime layouts.

Reject at type-checking/lowering time (zero emitted guest artifact):
- Direct or nested mutation through ordinary shared handles; making a mutable loan from shared `T`.
- Unique-to-shared conversion with any proven live mutable alias, escaped raw pointer, unresolved graph/provenance, or unsupported clone/drop domain.
- Using original exclusive owner after freezing; claiming `copy!!` deep-copy separation from a shallow alias.
- Storing, returning, capturing, moving, double-dropping, or carrying a guard across suspension / actor isolation.
- Shared or guarded access in unsupported backends, cross-worker/arena sharing without explicit `Sendable` and proven memory capabilities, and unknown effect summaries.

Suggested stable diagnostic families for conformance: `E_SHARED_MUTATION`, `E_SHARE_ALIAS`, `E_SHARED_OWNER_MOVED`, `E_GUARD_ESCAPE`, `E_GUARD_SUSPEND`, `E_GUARD_REENTRANT`, `E_SHARE_DOMAIN`, `E_SHARE_UNSUPPORTED`. Backend aliases must map to canonical results explicitly; no silent acceptance.

### Staged implementation

1. **Stage A:** implement frozen-only `share!`, correct typed ownership/provenance, deep-freeze checks and owner lifetime; test same allocation identity and readonly access. All unsupported patterns reject.
2. **Stage B:** add trusted `RwLock<T>` / `Mutex<T>` guards with nonescaping, effect-checked callbacks, exception/cancellation-safe cleanup and scheduler-friendly contention. No direct shared writes.
3. **Stage C:** admit explicitly proven cross-actor shared immutable regions, platform-specific synchronized capabilities and optional uniqueness recovery; keep `Sendable` vs `Serializable` separate.

This is a source-level **target contract only**. A source-only fixture registry or CI that never executes a compiler cannot prove AttoLang guest behavior. Full parity needs exact source+carrier tree/blob SHA, real compiler+guest positives, compiler negatives with no guest bytes, sanitizer/race and cancellation tests, and nonzero-step jobs per backend. Tests must be reviewed before promotion from draft.
