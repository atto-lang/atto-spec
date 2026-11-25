# Read-only structural projection v1 — bounded i64 witness

This is **an executable host-side proof target**, not a claim that the
AttoLang source form or inter-backend guest ABI works. The goal is to
converge Java, LLVM/C++ and .NET on a safe **compiler-owned field-offset
witness** before integrating guest codegen. Rust/Wasm already has
[readonly witness groundwork](https://github.com/atto-lang/atto-source.rs/pull/221)
and verified [class-only matching](https://github.com/atto-lang/atto-source.rs/pull/187).

## Required semantics

- An open structural row `{x: int}` accepts an immutable public `x: int`
  field in any statically known ordinary class/record/struct; it may have
  additional fields.
- The plan records the **actual source type and field offset**, never an
  offset inferred from the structural target type. Thus class A has `x`
  at scalar slot 0 and class B at slot 1; reading each must produce 42.
- Plans retain positive source layout generation and scoped loan identity.
  A stale/expired loan must never be used, and a view is immutable only.
- Private, mutable, missing, wrongly typed, duplicate, overlapping fields
  and sealed actor state fail closed. Maps require a separate stable
  atomic snapshot/key-presence design and remain unsupported here.
- No widening to mutable views, copying/sending actors, invoking getters,
  reinterpreting native pointers, escaping borrow scope or suspension.
- This first stage covers **i64 scalar fields only**. String literals,
  unions, nested rows, nominal methods, named-call evaluation, map runtime
  adapters and actor-supervisor behavior are *future* ABI milestones.

The 16 case IDs in `cases.json` are shared by the three backend host proof
tests. A compiler's tests **MUST NOT** claim guest parity unless both a
source program and actual generated JVM/LLVM Native/.NET NativeAOT execution
are recorded from an immutable exact-source tree.

## Example target (not yet supported in every compiler)

```rust
fnc read_x(p: {x: int}): int { return p.x; }
define class A as pub val int x = 42; end
define class B as
    pub val int padding = 10;
    pub val int x = 42;
end
```

Target `read_x(new A()) + read_x(new B()) == 84`.
