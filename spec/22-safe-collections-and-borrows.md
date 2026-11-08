# 22 — Safe collection access, Option and static borrow checking

**Status: normative target / NOT yet a claim of compiler support.**
This chapter refines chapters [02](02-types-and-patterns.md),
[04](04-ownership-and-memory.md) and [05](05-actors-and-state.md).
The proposed method names are **candidate APIs** pending standard-library
signature and backend admission; do not infer syntax acceptance from examples.
AttoLang should emulate the *safety properties* of Rust's ownership and
borrow model, not adopt Rust's pointer syntax or runtime implementation.

## Core invariants

1. A mutable collection has one exclusive owner (actor/region) unless it is
   behind an explicitly authenticated synchronized or atomic capability.
   An immutable variable binding is **not** a deep-frozen object.
2. Any number of immutable, rooted **READ** loans may coexist; a **WRITE**
   loan is exclusive against other READ and WRITE loans. Dynamic indices,
   map entries, iterators, nested projections and slices conservatively alias
   their entire collection root until proven disjoint. Never infer disjoint
   index or field ownership from different syntactic indices alone.
3. The compiler owns loan lifetimes and root provenance. Only a source
   operation such as `rt borrow collection` / `rt mut borrow collection`
   or a compiler-recognized access method may mint a loan. The types
   `ReadLoan<T>` and `WriteLoan<T>` below denote **intrinsic, non-owning
   capabilities**, not user-constructible structs or serializable values.
4. A projected loan cannot outlive its owner, be used after `rt take`,
   escape through a nested `Option`, `Result`, closure, tuple or field, or
   cross an actor, task, thread, FFI or durable-state boundary without an
   independently verified ownership/lifetime protocol. No implicit
   `Sync`, `Send`, `Share` or `Copy` derivation is allowed.
5. Checked access never produces raw invalid memory or traps the whole
   process. Compiler-suppressed unchecked loads are forbidden. After a
   failed bounds check there is no element read, write or loan creation.
6. Collection identity includes allocation/arena and actor domain plus
   generation/epoch. A 32-bit dense index alone is **not** a stable handle
   across swap-delete, relocation, reuse, hot reload or actor restart.
7. Every source backend must reject unsupported collection forms before
   emitting executable code. Parser-only errors are not proof that the
   semantic borrow rules are enforced.

## Access API — candidate signatures

| Operation | Intended type/effect | Safety |
| --- | --- | --- |
| `collection.get(index)` | `Option<ReadLoan<T>>` | Bounds-safe, creates a rooted READ loan only on `Some`. |
| `collection.get_mut(index)` | `Option<WriteLoan<T>>` | Bounds-safe, exclusive WRITE loan; no overlapping READ/WRITE. |
| `collection.get_copy(index)` | `Option<T>` where `T: Copy` | Explicitly materialized owned copy; not allowed for move-only values. |
| `collection[index]` | `T` projection with checked access | Invalid index is a contained, typed bounds trap for the current actor; NEVER unchecked UB. Prefer `get` for recoverable paths. |
| `vector.pop()` / `list.remove(index)` | `Option<T>` | Moves owned element out after exclusive access; empty/out-of-range is `None`. |
| `map.get(key)` | `Option<ReadLoan<V>>` | Rooted map-entry loan; mutation/rehash while borrowed denied. |
| `map.get_mut(key)` | `Option<WriteLoan<V>>` | Exclusive entry loan; conservative whole-map exclusion. |
| `iterator.next()` | `Option<ReadLoan<T>>` or owned `Option<T>` | A view iterator holds a root READ loan; mutations invalidate it and are denied while live. |

The spelling and whether `get_copy` is exposed as a method or extension
will be finalized in the `.atto` core/alloc source, not by a Java, C#,
Rust or JavaScript host shim. Array, FixedArray, Vector, List, Slice, Tuple,
Map and Set remain **distinct semantic collection kinds**; do not erase
their ABI/layout or ownership distinctions. `FixedArray` cannot remove an
element unless the type permits a hole or explicit replacement; a tuple is
not a generic resizable vector.

For signed `int` indexing, negative indices and indices `>= len` yield
`None` for `get`/removal rather than wrapping through an unsigned
conversion. An index operator may panic (within the actor) on the same
failure. Narrowing to the 32-bit dense offset must be checked using
non-overflowing wide arithmetic before dereference; slice offset + extent,
element stride, alignment and capacity also require overflow checks.
Do not use an `Option` tag as an in-band magic index.

## Explicit Option semantics

`Some(v)` and `None` are discriminated values. An empty collection has
`pop() == None`; a present element that itself contains `None` is still
`Some(None)`. `Option<Option<T>>` never flattens automatically.
`map` preserves the outer Option layer; `and_then` is an explicit
operation. `unwrap()` is an explicit potentially panicking assertion;
`unwrap_or` and `match` are the preferred recoverable accesses.
Absent entries must not be represented by `null`, a zero address, index
`-1`, or host-language exceptions.

An `Option<ReadLoan<T>>` retains the same loan root and lifetime as the
`ReadLoan<T>` it may contain. Wrapping or unwrapping it must not
launder the borrow into an owned value. Using `Some` in a pattern does
not extend the loan beyond its verified lexical or CFG lifetime.

```atto
// Target spelling only: positive guest compiler/runtime fixture required.
pub fnc choose() -> int {
  val values = [12, 42];
  val found = values.get_copy(1);
  return found.unwrap_or(0);
}
```

## MIR ownership proof

Before lowering to Java/GraalVM, LLVM, .NET, Wasm, Forge/Cranelift,
Rust/Cranelift or JavaScript, a typed control-flow MIR must track:
`(allocation identity, owner/actor, generation, root place, projection,
loan kind, origin, lifetime interval, mutability, suspension effect)`.
Alias analysis is conservative unless a disjointness proof is recorded.
Required checks:

- Move/consume of an owner with an outstanding loan is a compile-time
  error. A move invalidates prior owner aliases; deterministic drop happens
  exactly once even under exception, cancellation and actor retirement.
- Grow, shrink, insert, erase, rehash, sort, swap-delete, reserve that
  relocates, or another layout-changing operation is forbidden with any
  live loan/view/iterator of that root. A provably no-op `reserve` may
  leave loans valid without epoch advancement.
- A WRITE loan cannot be nested into or created alongside an active READ
  loan. READ loans cannot mutate. Reborrow and disjoint-slice splitting
  require separate proven rules; unsupported forms fail closed.
- A collection loan may end at a proven last use (non-lexical lifetime);
  inferred release is not an observable guest side effect. All CFG edges
  including throws, returns, defer/recover, generator yield, cancellation
  and panic must discharge or fence the same loan. Merely ending a scope
  syntactically is not proof if captured continuations remain eligible.
- For v1, `await`, `select`, task launch, a yield, or actor-turn
  completion with a live collection loan is rejected unless a *specific*
  backend-independent pinning/quiescence capability is proven. A
  `critical` guard must be non-suspending and guarded views cannot escape
  its scope; a mutex protects a referent, not an implicit compound
  transaction across multiple calls.
- Borrowed views cannot enter `rt share`, messages, pub-sub, channels,
  actor heap migration, durable serialization or task/closure captures
  by being hidden inside `Option`, `Result`, ADTs or nominal wrappers.
- No runtime borrow checker or tracing-GC fallback may substitute for the
  mandatory compile-time ownership admission. Runtime epoch/generation
  checks are additional defense against stale native/FFI/ABI handles.

## Containment, concurrency and native layout

A failed dynamic index or quota may trap **the offending actor**, without
freeing another actor's arena or corrupting unrelated stacks. Exception
and cancellation cleanup must release the actor's owned resources exactly
once and observe supervisor quiescence before heap teardown. Mutable
actor state stays actor-owned, and guarded shared mutable collections
require explicit `critical`/synchronization capability.

Inside 32-bit-offset actor-local arenas, validate both the offset word
and the separately stored owner/arena identity and generation. No pointer
arithmetic can escape the actor region; a 32-bit compressed reference is
not an authority to reconstitute a 64-bit host pointer. Where allocated
buffers grow, old views must not silently dereference relocated storage.
Heap, stack and layout exhaustion must fail within the actor/quota
boundary, not silently wrap.

## Diagnostic and evidence floor

| Candidate semantic category | Violation |
| --- | --- |
| `E_INDEX_BOUNDS` | Checked index trap; recover with `get` rather than unchecked load |
| `E_LOAN_CONFLICT` | READ/WRITE overlap, structural mutation under borrow, or move under borrow |
| `E_LOAN_READ_ONLY` | Mutation through a READ loan |
| `E_LOAN_ESCAPE` | Borrow hidden in an owned-looking wrapper or escaping its owner |
| `E_LOAN_SUSPEND` | Loan crossing unsupported suspension or actor turn |
| `E_STALE_LOAN` | Generation/epoch/revocation mismatch at a trusted runtime boundary |
| `E_SHARE_NOT_FROZEN` | View used as proof of deep immutable Share |
| `E_COPY_REQUIRED` | Materializing a move-only element as an implicit copy |

The [candidate conformance contract](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/tree/main/contracts/v1/safe-collection-access-v1)
has source-free READ/WRITE/Option/actor-boundary checks and proposed
positive/negative `.atto` fixtures. Neither that model nor a backend
which rejects the grammar with `E_UNSUPPORTED` constitutes implementation
evidence. Each target must execute positive guest cases and **semantically
reject** negative cases with no executable output; pin exact head/tree,
executed CI steps, compiler diagnostics and native/Wasm artifacts. Treat
zero-step hosted CI as `NOT_EXECUTED`. Require independent review and
the applicable security authorization before any private-source transfer.
