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


## Trusted single-level pointer normalization (2026-11-27 direction)

This is a proposed normative successor for the **trusted local-place** pointer lane, not an admission grant and not a claim of current backend support. It supersedes the v1 unary operator denial only for that independently verified lane. Retain v1 denial everywhere else, including untrusted actors. The preexisting OwnedRegion, CheckedRef and reusable RawPointer slot authority states are not interchangeable; their lifetime and cleanup rules remain distinct.

### Static types and expressions

Let P(T) denote the compiler-intrinsic local pointer type. For a non-pointer referent T, `T*` and `Pointer<T>` are equivalent surface types. P(P(T)) = P(T), including generic substitution and transparent aliases; canonicalize before overload identity, ABI layout and code generation. Explicit repeated star suffixes (`int**`, etc.) are errors, not an alternate nesting notation. A user-defined type cannot impersonate the builtin. Normalization is shallow at the outer constructor: `Pointer<Record>` does not recursively remove pointer-valued fields; such fields must independently pass ownership and escape checks. Preserve nominal referent identity, authority kind, read/write rights, provenance, domain, generation and lifetime; never flatten across distinct authority families or discard qualifiers. Reject ambiguous or unsupported authority cases.

| Form | Typed meaning in trusted local-place profile |
| --- | --- |
| `&x`, `ref! x` | Acquire checked pointer to addressable initialized T place |
| `&p`, `ref! p` | For a live local pointer, preserve its target and authority; never address the pointer slot |
| `*p`, `deref! p` | Checked access to T; Copy result or bounded loan for non-Copy |
| `*x`, `*(*p)` | Reject if operand is not a pointer |
| `&(*p)` | Preserve target identity when validity, lifetime and rights are proven; retain required dereference checks |
| `unref! p` | End the named handle or detach the reusable slot according to its own authority contract, never free the referent |
| `Pointer<Pointer<T>>` | Normalize only the same local-place constructor |
| `T**`, address of pointer storage | Reject in ordinary source |

Unary syntax must be resolved by grammar and typing, not a text rewrite. Binary multiplication, bitwise AND, logical AND, generator delegation and return-signature separators retain their meanings. An operand is evaluated exactly once; normalization cannot discard side effects, trapping checks or required loan events. Nonaddressable values and temporaries lacking a stable lifetime reject.

### Identity versus authority

Idempotency concerns the pointer's referent and canonical type, not permission to duplicate a capability. Repeated acquisition of a live pointer in an expression is identity (no new lease). A separately retained read-only binding can point to the same place only if the compiler establishes its own bounded read lease, or proves a scoped alias of the original lease that cannot outlive it. For the initial independently detachable read-only binding profile, each retained binding has its own release obligation; release of one does not revoke other independently established leases. Reject duplication of exclusive, owning or noncopyable authority; do not silently reinterpret an empty or detached slot as a valid address. This explicit distinction is a proposed integration decision, not a change to the linear v1 handle rules without a new admitted profile.

Trusted admission must be derived from authenticated compiler/runtime policy, not a source annotation or caller-supplied flag. Reject raw/local pointer syntax, types and capability escape in untrusted actor contexts, including through generic instantiation, imported calls, aggregate fields, closures, serialization and FFI. Safe borrow operations remain separate. No cross-actor/tenant pointers. Recheck lifetime, generation, rights, and revocation at dereference unless independently proven redundant. Do not add implicit null assignment or free-via-pointer behavior. FFI out-parameters requiring native T** remain a separate restricted ABI proposal, not ordinary source support.

### Required evidence

New versioned positive cases: symbolic/keyword equivalence; repeated acquisition; alias and generic normalization; exact target identity; independent read lease release and referent survival; exactly-once evaluation; preserved binary operator meanings. Negatives: explicit **, strict dereference of nonpointer, address of pointer storage, detached acquisition, forged capability, qualifier escalation, exclusive duplication, shorter lifetime escape, untrusted indirect acquisition, cross-domain export, stale generation, and pointer-to-pointer ABI artifacts. Run positive compiled guests and negative no-artifact tests on each backend; host-only models are not parity.

Inspect typed HIR/MIR and optimized IR/native or Wasm output: no pointer-slot address or added indirection; no mandatory allocation or copy merely due to redundant acquisition; retain mandatory ABI moves, guards and lease effects. Report exact source head/tree, toolchain, executed steps, artifact and guest receipts separately for each backend. Until those gates pass, unsupported profiles must reject before artifact creation.
