# AttoLang critical leases and mutable state containers (proposed v1)

Status: **proposed normative contract**. Backend conformance is not established
by this document; executable evidence must be attached per target and commit.
This candidate refines the existing [state-container contract](../spec/state-containers-and-virtual-actors.md) and [actor state chapter](../spec/05-actors-and-state.md); it does not weaken their sealed-state or ownership rules.

## Syntax and admission

A state container owns its mutable fields. The canonical proposed spelling is `state_ro` / `state_w`:

```atto
define state container Counter as
  state { let int count: 0; }

  pub increment(int amount): void {
    state_w(|s| -> {
      s.count = s.count + amount;
    });
  }

  pub read_count(): int {
    return state_ro(|s| -> s.count);
  }
end
```

* `state_ro(callback)` and `handle_state_ro(callback)` normalize to `handle_state(critical-read callback)`.
* `state_w(callback)` and `handle_state_w(callback)` normalize to `handle_state(critical-write callback)`.
* All five intrinsic names are sealed in protected actor and state-container methods. Exact direct `self.` qualification is equivalent to a bare invocation; ordinary method dispatch, first-class references, overrides, and indirect calls cannot mint lease authority. The short names are contextual, not new globally reserved keywords. Reject lexical shadowing that would obscure an intrinsic in a protected method.
* A short or long alias already specifies its authority: a second critical-mode keyword is invalid. Binder mutability is inferred from the mode. Aliases must share typed IR, admission, cleanup, diagnostics and AOT/runtime behavior; no extra dynamic dispatch is permitted.
* `critical-write` requests an exclusive write loan for one receiver instance.
* `critical` is an alias for **exclusive write**, not a shared read.
* `critical-read` requests read-only authority. It must never create a write
  ticket or mutate fields; on restricted scalar profiles the only admitted
  syntax may be limited to a by-value `s.field` projection, including the equivalent single-return block if implemented. Empty or effectful read blocks must not be admitted as write regions. Multi-field owned snapshots under one lease are the general target, not an implied property of restricted scalar implementations.
* Compound keyword tokens use contiguous ASCII spelling: `critical-read`,
  `critical-write`; `critical -read` is never a synonym.
* Direct mutable-state field access, including same-class access on another
  instance, is not a substitute for the checked lexical loan.

## General target: consistent snapshots and typed results

```atto
pub snapshot(): Tuple[int, int] {
    return state_ro(|s| -> {
        return (s.balance, s.transactions);
    });
}
```

Both projections must occur under a single shared lease, and the returned tuple must contain independently owned scalar values. No split acquisitions or borrowed state may escape. The same names and semantics apply to actors and mutable state containers; unsupported actor, tuple, graph, or expression-position profiles must reject rather than simulate. Direct method-return scalar write results must be snapshotted before release and returned only after release. General binding-position write expressions are a target obligation, not evidence of implementation.

## Safety and ownership obligations

1. Bind authority to an exact state-container instance and incarnation;
   a nominal type or class privacy grant alone does not authorize access.
2. Permit multiple readers only when the target runtime actually implements
   shared reading. A writer requires exclusive admission with no live readers;
   bare `critical` must have the same exclusivity.
3. Never silently upgrade a read loan to write. Reject read-to-write upgrades
   unless a separately specified, proven upgrade protocol exists.
4. Reject escaping aliases to protected mutable state. Scalar by-value
   projections may survive after the read lease ends.
5. Reject suspension (`await`, `yield`, or parking actor operations) inside
   a non-suspending critical region. A future suspendable region requires
   a separate syntax and lifetime contract.
6. Balance entry/exit on normal, checked-error, cancellation, and panic
   paths; revoke stale generations and prevent forged, replayed or
   double-released tickets.
7. Establish per-instance isolation, no unguarded helper-method reentrancy,
   and fail-closed type checking. An unsupported operation emits **no
   executable artifact**.
8. Immutable reads must not expose mutable `Array`, `Map`, `Set`, pointer,
   closure, or reference aliases. Support for such fields requires deep
   ownership, copy, borrow and escape rules; do not infer it from primitive
   scalar support.

A guard is not a transaction: already-performed writes are not implicitly rolled back by a checked failure. Release exactly once on all exits. The protected region includes reachable nested allocations; neither a host reference nor `share!` supplies unsynchronized write authority. Owned copy-out is allowed only after proving the value has no escaping state loan. Existing restricted scalar projection profiles remain narrower than the general target.

## Twenty executable regression scenarios (two ten-case matrices)

The [Rust compiler audit PR #172](https://github.com/atto-lang/atto-source.rs/pull/172)
initially contained four positive and six negative `.atto` fixtures for:
(1) bare critical mutation, (2) explicit write of a bool, (3) read snapshot,
(4) isolation of two mutable state containers, (5) empty read-block
escalation, (6) attempted mutation through read, (7) unguarded self access,
(8) binder escape, (9) spaced compound keyword, and (10) nested loans.

A second ten-case suite (`tests/critical_mutable_containers.rs`) adds
five positive and five negative cases for multiple protected scalar fields,
snapshot independence, per-instance and per-type ownership, duplicate
fields, illegal reference fields, type confusion and impure method calls.
The Rust audit records **20 fixture scenarios** but they remain **not
executed** until the exact compiler candidate passes native/Wasm guest CI.

Six Worker-host lease admission unit tests (including two new isolation and
upgrade/replay cases) passed in Node.js 22 on exact GitHub blob SHA copies
for compiler PR head `320aafe8e4dc682cc56daefc241067f910d84904`.
That is host-only evidence and does not imply guest-source or cross-backend
conformance.

The audited Rust-to-Wasm profile admits owned `int`/`bool` state fields
inside a **single Worker-local state container**. It has host-mediated
synchronous leases but does **not** prove cross-Worker RW admission or
arbitrary mutable collection fields. Java/LLVM/other backend claims require
their own executable guest artifacts, successful exact-commit tests and
host-lifecycle evidence. Rust-native compile-only fixtures are not runtime
or cross-backend proof.

## Acceptance requirements

For every backend and target, require exactly identified source SHA,
successful compiler diagnostics (including no-artifact negatives),
actual executable guest output, balanced lease accounting, and independent
CI receipts. Report `PASSED`, `FAILED`, `UNSUPPORTED`, or
`NOT EXECUTED` separately. Do not merge a speculative semantics change
solely on host-model simulations.
