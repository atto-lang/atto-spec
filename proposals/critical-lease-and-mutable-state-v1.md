# AttoLang critical leases and mutable state containers (proposed v1)

Status: **proposed normative contract**. Backend conformance is not established
by this document; executable evidence must be attached per target and commit.

## Syntax and admission

A state container owns its mutable fields. The canonical spelling is:

```atto
define state container Counter as
  state { let int count: 0; }

  pub increment(int amount): void {
    handle_state(critical-write |s| -> {
      s.count = s.count + amount;
    });
  }

  pub read_count(): int {
    return handle_state(critical-read |s| -> s.count);
  }
end
```

* `critical-write` requests an exclusive write loan for one receiver instance.
* `critical` is an alias for **exclusive write**, not a shared read.
* `critical-read` requests read-only authority. It must never create a write
  ticket or mutate fields; on restricted scalar profiles the only admitted
  syntax is a by-value `s.field` projection. Read blocks in such profiles
  are an error, including empty blocks.
* Compound keyword tokens use contiguous ASCII spelling: `critical-read`,
  `critical-write`; `critical -read` is never a synonym.
* Direct mutable-state field access, including same-class access on another
  instance, is not a substitute for the checked lexical loan.

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

## Ten executable regression scenarios

The [Rust compiler audit PR #172](https://github.com/atto-lang/atto-source.rs/pull/172)
contains four positive and six negative `.atto` fixtures for:
(1) bare critical mutation, (2) explicit write of a bool, (3) read snapshot,
(4) isolation of two mutable state containers, (5) empty read-block
escalation, (6) attempted mutation through read, (7) unguarded self access,
(8) binder escape, (9) spaced compound keyword, and (10) nested loans.

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
