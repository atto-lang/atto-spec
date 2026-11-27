# Explicit pointer slot lifecycle — proposed extension

Status: DRAFT. This extends [pointer-aot-safety-v1](pointer-aot-safety-v1.md); it does not change the existing linear Pointer<T> or CheckedRef<Class> contracts. No backend implementation or verification is claimed.

## Direction and proposed spelling

User direction: do not clear a pointer with `ptr = null;`. Use an explicit detach operation, preferably `unref! ptr`; reserve `deref!` for access. Empty reusable pointer slots, binding, and placement construction are targets; spelling/type names below remain proposals.

```atto
let mut RawPointer<Person> p = RawPointer.empty<Person>();
ref! p to alice;
val view = deref! p;
// end view's loan before detach
unref! p;
ref! p to bob;
unref! p;
```

A RawPointer<T> slot is a checked, non-owning, non-copyable capability, never an unchecked integer or native address. Empty does not allocate T. Binding is not ownership transfer and does not allocate/copy T. Ordinary null assignment cannot clear a slot; ordinary assignment cannot forge or overwrite a binding. Rebinding requires an empty slot. A failed bind leaves the slot empty. A successful unref detaches only the slot's lease, preserves the object and returns void. Double unref, deref of empty, unref during live derived loan and rebinding while bound reject. The slot is reusable, unlike the consumed linear handle in v1. Immutable slots cannot be rebound. Keep distinct typed IR events for v1 handle consumption, checked class owner restoration, and reusable slot detachment.

## Placement construction (separate proposal)

```atto
let Storage<Person> s = alloc! Person;
new Person("Alice") at s;
destroy! s;
new Person("Bob") at s;
destroy! s;
free! s;
```

Storage<T> owns sized/aligned reserved bytes; it is not a non-owning pointer slot. `new ... at` initializes that storage with no second allocation for the object itself; nested allocations are not forbidden. Constructor receives the storage's self location; no external reference escapes before commit. Check allocation identity, alignment, capacity, initialized state and unique construction authority. Constructor failure rolls back initialized fields exactly once; storage remains uninitialized or is disposed by the owner under the specified failure contract. Destroy ends object lifetime without deallocating; free requires no live object, loans or in-flight operations. Reconstruction changes object generation and invalidates all old references; generation wrap must retire storage. Never free through RawPointer<T>. `new ... into p` remains unresolved: require separate explicit ownership authority before admitting it.

## Required checks and lowering

- Local actor-incarnation/tenant ownership, region lifetime, slot identity, object generation, read rights and alignment are preserved through typed IR. Do not export pointers as bytes, numeric addresses, actor mail or FFI arguments.
- Deref copies Copy values and yields a bounded readonly loan for non-Copy values. A mutable access mode requires separate exclusive authority; do not infer it from a mutable slot binding.
- Reject referent move/drop, incompatible write, scope escape, live-loan detach and unproved suspend/cancel/exception edges. Track CFG joins; Empty and Bound cannot be conflated. Preserve existing v1 all-exit proof obligations. Do not silently upgrade RawPointer<T> to OwnedRegion<T>.
- AOT native targets may erase proven nonescaping slots or lower to actor-relative handles; Wasm/JS use checked offsets/indices, not raw host pointers. JVM/.NET managed objects are not placement-constructible at arbitrary native addresses; require verified arena-backed representation or reject. No required JIT or tracing GC; pointer width does not alter semantics.

## Target conformance (not executed)

| ID | Case | Expected |
| --- | --- | --- |
| RPS-001 | Empty, bind existing scalar 42, read, detach, owner reads 42 | exit 42 |
| RPS-002 | Bind/detach/rebind different locals, read both | exact values and owner survival |
| RPS-003 | Empty creation and exit without object allocation | no T allocation |
| RPS-004 | Deref empty | reject |
| RPS-005 | Assign null to bound slot | reject |
| RPS-006 | Bind over live slot | reject |
| RPS-007 | Double detach | reject |
| RPS-008 | Detach with live derived loan | reject |
| RPS-009 | Move or drop referent while bound | reject |
| RPS-010 | Copy/serialize/send slot to actor or tenant | reject |
| RPS-011 | Branch join with unproved bound state, await or exceptional escape | reject |
| RPS-012 | Forge pointer from integer or bytes | reject |
| RPS-013 | Construct/destroy/reconstruct at same storage identity | two lifetimes, distinct generations |
| RPS-014 | Read uninitialized storage or double construct/destroy/free | reject |
| RPS-015 | Constructor failure with partially initialized fields | exact cleanup, no publication |
| RPS-016 | Old reference after reuse or generation exhaustion | reject or deterministic fault; no wrap |
| RPS-017 | Free via non-owning slot or while loans live | reject |
| RPS-018 | Placement constructor self/field writes target supplied storage | no second object allocation |

Each backend must compile actual positive Atto guests and execute their oracles, reject invalid programs without emitting an executable artifact, prove dynamic generation and cleanup paths where admitted, and preserve prior v1 and ownership suites. Unsupported-profile rejection is not semantic parity. Host-only models are not compiler evidence. Exact PR head/tree, nonzero executed jobs, independent review and source export authorization remain required. No private source mirroring without a private approved destination and exact-tree verification.
