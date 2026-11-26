# Enforced no-allocation and no-copy callable guarantees v1

**Status: accepted annotation syntax; proposed normative proof contract, not backend certification (2026-11-26).**

These annotations are checked guarantees, not optimization hints. Default safe escape analysis, scalar replacement and copy elision apply independently of annotations. No JIT or runtime code generation may be required.

## Canonical syntax

The following are alternative declarations of the same callable, never five overloads:

~~~atto
@noalloc
@nocopy
define fnc Buffer • process(Buffer data) { return data; }
~~~

~~~atto
@noalloc
@nocopy
define fnc Buffer <- process(Buffer data) { return data; }
~~~

The same annotations compose with name-first `define fnc process(Buffer data) -> Buffer`, `: Buffer`, and `: Buffer ->` brace forms. Normalize annotations to independent typed obligations, irrespective of order. Reject duplicates, arguments on these markers, and unsupported placements. No backend may silently ignore a recognized guarantee.

## Proof scope

* noalloc: zero dynamic guest storage admissions, including guest-managed arenas, pools when a new logical allocation occurs, boxes, closure/continuation frames and hidden runtime helpers attributable to this invocation. Reusing already-owned storage and bounded stack/register storage is allowed. Host process allocation/GC is a separate metric; guest-induced host allocation must be accounted for, not hidden behind the host boundary.
* nocopy: zero physical duplication of guest aggregate payload bytes or logical mutable storage. Scalar register/ABI moves, handle transfers, immutable sharing and proven in-place operations are permitted. Copy-on-write detachment counts if actually performed. Serialization that materializes a payload copy counts. Never elide a logically required independent mutable value merely to satisfy this marker.
* Both guarantees include reachable normal, error, panic, cleanup, cancellation and suspension paths, with transitive calls, finite dynamic dispatch, instantiated generics and runtime/FFI helpers. Unknown effects fail closed. Recursive SCCs require a sound fixed point; an unresolved cycle is not proof.
* Proof is required after ownership/type/effect checking and verified lowering, before executable publication. No guarantee changes ownership, borrowing, actor isolation, allocation failure observability, drop behavior, quota or generation fencing.
* A returned Buffer is legal only if the existing ownership/lifetime contract proves the returned value is valid (e.g. owned transfer or a permitted lifetime-bound result). An unadorned borrowed formal must not become an escaping owned alias. The displayed syntax is accepted; actual acceptance of a body depends on this proof. This amendment does not settle borrow-default or copy!/copy!! semantics.

## Evidence and diagnostics

Proposed stable diagnostics E_NOALLOC / E_NOCOPY for proven violations or unproven obligations; ordinary syntax/type/ownership failures retain their own diagnostics. Annotated functions cannot silently fall back to unverified code. Unannotated functions may retain a safe baseline when optimization cannot be proven. Exact source tree, compiler artifact, emitted guest or rejection, and proof scope are required; counters corroborate but do not prove all paths. Runtime counters distinguish guest allocations/bytes and payload copies/bytes from host-only activity. No counter data means NOT_MEASURED, not zero. HDL requires separate synthesis-specific equivalence. All 11 backend profiles remain unverified for this amendment.
