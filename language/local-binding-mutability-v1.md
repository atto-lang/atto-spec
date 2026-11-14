# AttoLang local binding mutability v1

Status: **accepted design; partial implementation** (2026-11-14).
This document defines the target semantics, not a claim of cross-backend conformance.

## Two independent capabilities

A *binding* introduces a named storage location or owned reference. A *referent* is the value/object reached through it. Name rebinding and referent mutation are different permissions. The `mut` qualifier controls writable access through the binding; `val` and `let` control whether the name may be assigned another value.

| Local declaration | May reassign binding? | May mutate writable fields through binding? |
|---|---|---|
| `val Point p = e;` | No | No |
| `val mut Point p = e;` | No | Yes, subject to ownership/field rules |
| `let Point p = e;` | Yes | No |
| `let mut Point p = e;` | Yes | Yes, subject to ownership/field rules |

**No implicit mutable referent:** unqualified `val` does not mean `val mut`. A previous compiler interpretation of `val` as an alias for `const mut` is obsolete under this decision. Existing sources that require mutable referent access must explicitly use `val mut`.

**Scalar types:** `mut` does not make an integer or another scalar's inner structure mutable. For example, `val mut int x = 1; x = 2;` is invalid because the name remains non-rebindable.

## Orthogonal compile-time requirement

`const` requires a compile-time-evaluable initializer, and the name cannot be rebound. `const mut` additionally permits mutation through a runtime materialized writable referent **when such materialization is legal**, not mutation of the constant expression itself. No backend may silently downgrade compile-time requirements.

The type-first shorthand `int x = 5;` means `const int x = 5;`; it does **not** mean `val int x = 5;` or `let int x = 5;`. Type-inferred `val` and `let` locals allow runtime initializers.

## Examples (target behavior)

```atto
define class Cell as
    pub let int value = 1;
    pub final int fixed = 9;
end

pub fnc example(): int {
    val Cell frozen_view = new Cell();
    val mut Cell writable_fixed_name = new Cell();
    let Cell replaceable_view = new Cell();
    let mut Cell replaceable_writable = new Cell();

    writable_fixed_name.value = 2;  // OK
    replaceable_view = new Cell();   // OK
    replaceable_writable.value = 3;  // OK
    replaceable_writable = new Cell(); // OK

    // Invalid:
    // frozen_view.value = 4;        // No mut
    // replaceable_view.value = 4;   // No mut
    // writable_fixed_name = new Cell(); // val
    // replaceable_writable.fixed = 4; // final field
    return writable_fixed_name.value;
}
```

## Enforcement and isolation

1. Declaring a writable referent is a *permission request*, not permission to bypass final/readonly field declarations, accessibility rules, borrowing, pinning, effects, or runtime memory safety.
2. A local object moved to another owner is not accessible through its former binding, including for writes (`E_MOVED` or equivalent).
3. `mut` never grants direct access to another actor's heap or sealed actor state. Actor fields remain accessible only through the required `handle_state(critical-read/critical-write ...)` boundary; `critical-read` remains read-only.
4. Shared frozen objects, read loans, and non-owned aliases do not become writable because a local variable is declared `mut`.
5. Implementations must enforce the two permissions during type checking/borrow checking. Inferred type, annotation position, `=`, proposed `be`, and proposed value-first `as` forms must all lower to equivalent binding capabilities.
6. Compound assignments and local object field updates must preserve the same capability checks as simple assignments. Nested field paths, index targets, arbitrary mutable borrows and actor state writes require separate proofs and may remain unsupported in partial backends.
7. Diagnostics must distinguish an illegal name rebind from a write through a read-only referent, and from a write to a final/private field.

## Implementation and conformance tracking

| Backend | Status as of decision | Evidence |
|---|---|---|
| Rust browser subset (`atto-lang/atto-source.rs`) | **Partial; isolated native test passed** | Draft PR #102, 6 local-binding tests at source commit `7339384131bd2dd5ba1e644dd0d0b84c0bd22b5a` on a verified private mirror; no full suite claim |
| Java | **Not verified** | Requires independent lexer/parser/checker/backend tests |
| LLVM | **Not verified** | Requires independent lexer/parser/checker/backend tests |
| .NET | **Not verified** | Requires independent lexer/parser/checker/backend tests |
| Wasm (independent backend) | **Not verified** | Requires independent lexer/parser/checker/backend tests |
| Forge / additional backends | **Not verified** | Requires independent backend tests |

The `as`, `be`, `:=`, and type-right declaration forms discussed during design are **separate syntax proposals**; this v1 semantic contract does not assert that all spellings are accepted by any compiler. A positive parse-only test does not prove runtime field mutation semantics, full AOT, or borrow safety.
