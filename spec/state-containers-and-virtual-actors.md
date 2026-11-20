# State Containers and Virtual Actors — proposed Oreslang contract

**Edition:** 0.1-candidate (2026-11-01)  
**Status:** SPEC_PENDING for compiler and runtime admission. This document is a portable implementation target, **not** evidence that any backend accepts the syntax.  
**Toolchain targets:** Java/GraalVM, LLVM, Wasm, Cranelift/Forge, .NET Native AOT.

## 1. Declaration grammar and identity

The two declaration heads are exactly:

```ebnf
state_container_decl = "define", ["pub"], "state", "container", Ident,
                       [generic_params], ["implements", type_list], "as", members, "end" ;
virtual_actor_decl  = "define", ["pub"], "virtual", "actor", Ident,
                       [generic_params], ["implements", type_list], "as", members, "end" ;
```

Canonical formatter order is `define pub state container` and `define pub virtual actor`; `pub define` MAY be accepted as a compatibility spelling. `state` and `virtual` are **contextual declaration words**, not globally reserved identifiers. `grain` is **not** an alias or declaration kind; `define grain` MUST NOT be silently interpreted as `define virtual actor`. A declaration AST/HIR MUST retain distinct `STATE_CONTAINER` and `VIRTUAL_ACTOR` kinds rather than masquerading as ordinary class/actor nodes. Unsupported targets reject before emitting artifacts.

## 2. State container

```ores
define state container Counter as
  state {
    let int count: 0;
  }

  increment(int amount) -> int ::
    return handle_state(critical-write |s| -> {
      s.count = s.count + amount;
      s.count
    });
  end

  get_count() -> int ::
    return handle_state(critical-read |s| -> s.count);
  end
end
```

The declared `state { ... }` block contains mutable referents reachable from the state root, **including nested heap allocations**. It is private and sealed. No caller may access `counter.state`, `counter.count`, or equivalent paths directly. Only container methods can acquire their own `handle_state(critical-read |s| -> ...)` / `handle_state(critical-write |s| -> ...)` capabilities. Guarded state is not an ordinary public member or constructor argument.

- **Default ownership:** one exclusive owner. Exclusive access may be optimized without locks after ownership proof. Moving a container invalidates the source owner. Copying is forbidden unless the type provides an explicitly proved deep-copy operation.
- **Actor ownership:** a container owned by an actor belongs to that actor's ownership domain. Sending the container by `rt take` transfers authority; copying a host reference or sharing a raw address never does.
- **Shared ownership:** requires an explicit checked, synchronized capability; `rt share` alone must NOT grant unsynchronized mutable access. Shared critical reads may overlap; critical writes exclude all other critical reads and writes. No upgrade/downgrade that could deadlock is implicit.
- **Borrowing:** mutable or state-backed references, pointers, closures and nested collections MUST NOT escape a guard. An owned result may be returned only if its region is proven disjoint, immutable/frozen, deep-copied, or moved out of state with state validity restored. `await`, `select` and any suspension are forbidden within guards until a separately specified suspend-critical protocol is implemented.
- **Failure:** a language-level `throw`/`raise`/`panic` must release the access capability exactly once, with normal cleanup. A guard is not automatically a transaction: partial writes made before a failure are visible unless the method separately provides transactional semantics. No host exception may leak a lock or leave a forged capability.
- **Lock scope:** locking is at the declared state-root region by default, not per-field, until disjoint-field proofs are specified. Multiple instances have separate ownership domains.
- **Lifecycle:** explicit disposal closes acquisition and rejects stale handles; reference/address reuse MUST NOT resurrect authority. Deinitialization must not race active callbacks.

A plain `class` does not gain these guarantees merely by including a field named `state`. `@Inject(MutableStateContainer())` is separate dependency-injection design, and MUST NOT bypass container ownership or invent shared mutable authority.

## 3. Virtual actor

```ores
define virtual actor ShoppingCart as
  state {
    let int quantity: 0;
  }

  add(int n) -> int ::
    return handle_state(critical-write |s| -> {
      s.quantity = s.quantity + n;
      s.quantity
    });
  end
end
```

A virtual actor is an **actor specialization**, retaining ordinary actor isolation, mailbox admission, supervisor CONTROL, exception semantics, Sendable checks, cancellation and actor-safe trait rules. It differs from `spawn Actor()`: it has a **stable logical key** and a runtime-managed *activation incarnation*. The runtime resolves a logical key to at most one active local incarnation at a time. An application may hold a logical handle without requiring an active instance.

- Logical identity is `(application-domain, declaration-id, key)` with canonical encoding and equality. The key MUST be immutable, bounded, and stable across backends. Actor instances have separate incarnation IDs; stale incarnation capabilities cannot authorize a newer activation.
- **Activation** is demand-driven and may occur more than once over the lifetime of a logical identity. One successful activation is published atomically after initialization. Concurrent lookups for a key must not create two admitted live activations in the same placement/ownership domain.
- **Storage** is explicitly configured: without durable storage, deactivation discards state and subsequent activation starts with declared initial state. No implicit crash recovery, distributed placement, exactly-once processing, or durable mailbox guarantee is made.
- **Placement:** local-only is the mandatory baseline. Remote placement, persistence, migrations and failover are optional adapters whose capabilities must be explicit and must not change message admission semantics.
- **Handles:** `VirtualActorRef<T,Key>` is a logical reference, not a raw pointer to a live actor. A provisional standard-library lookup spelling is `get_virtual_actor<T>(key)`. It does NOT spawn an ordinary actor. The exact API signature remains subject to standard-library ratification.
- **Delivery:** send returns an admission `Result`, not completion or durability. Lifecycle/deactivation must be linearized against accepted messages and active callbacks. Mailboxes have bounded backpressure and close behavior; no accepted message can silently vanish. If an adapter cannot guarantee preservation during deactivation, it must reject/admit only within its explicitly documented capability profile.
- **Supervision:** panic is delivered to the supervisor priority CONTROL lane, never caught inside the failing actor. Restart/activation requires incarnation fencing. A stable logical key does not imply that caller-held actor-incarnation capabilities remain valid after restart.
- **Type rules:** same actor-compatible interfaces and superclass lattice as ordinary actors, with added stable-key and lifecycle proof obligations. It MUST NOT extend a mutable ordinary class or be implicitly cast to an ordinary live actor instance.

## 4. Compiler implementation boundary

Parser: recognize two-word declaration heads, preserve source ranges, reject duplicate/unknown modifiers and invalid nesting.  
HIR: retain `DeclKind.STATE_CONTAINER`, `DeclKind.VIRTUAL_ACTOR`, owner domain, state root/alias regions, and logical-key/activation effects.  
Borrow checker: reject direct state access, escaping aliases, mutable/shared overlaps, use after take, suspension within critical guard, and stale capabilities.  
MIR: add verified `state_acquire_read`, `state_acquire_write`, `state_release`, `virtual_resolve`, `virtual_activate`, `virtual_admit`, and `virtual_deactivate` families (semantic names only).  
Runtime: implement acquire/release cleanup on all exits, scoped linearizable admission, single-live-activation fencing and explicit storage mode.  
Backends: no desugaring to an unguarded `class`, unmanaged actor spawn, raw Java reference, native pointer, Wasm index or CIL object. NativeAOT and Native Image paths must require no hidden dynamic compiler.

## 5. Required compile-negative gates

- Direct external state reads/writes and exposing the `state` root.
- Guard callback escape of nested mutable aliases, pointers or closures; suspension under a guard.
- Shared container mutation without synchronization; use after `rt take`.
- Invalid virtual actor inheritance, mutable key, or ambiguous key equality.
- Duplicate local activation publication, stale capability use, deactivation racing an accepted message.
- `define grain` and malformed two-word declaration heads must **not** be accepted as alternate declarations.

Every compiler must report its own evidence as NOT_IMPLEMENTED/NOT_EXECUTED until it actually compiles and runs the relevant corpus. For the machine-readable candidate fixtures see `oreslang-platform-conformance/contracts/state-container-virtual-actor-v1.json`. Source-only fixture validation does not establish compiler or runtime equivalence.

## 6. Open decisions before runtime promotion

Stable key encodings and size limits; allocator/accounting budgets; local activation eviction thresholds; persistent-storage adapter APIs; writer fairness, recursive critical-region semantics; and exact diagnostic codes. These must not be supplied by undocumented backend defaults.
