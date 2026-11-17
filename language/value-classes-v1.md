# Identity-free value classes v1 — AttoLang

Status: **proposed normative contract; compiler/backend implementation NOT VERIFIED** (2026-11-16).
This document records design and required executable conformance, not evidence that any backend supports the feature.

## Motivation and separation of concepts

A value class is a **nominal, identity-free, deeply immutable** product. Equality is derived from declared fields, not allocation identity. A compiler MAY keep the value in registers, a stack slot, a containing aggregate, or private temporary memory; the program cannot observe the storage decision. Flattening and no-allocation operation are optimization opportunities, **not unconditional guarantees**.

Do not conflate three independent concepts:

* `val`: a name that cannot be rebound and whose referent is read-only by default; it does **not** remove identity from a normal class (see local-binding-mutability-v1.md).
* `const`: typed compile-time-evaluable initialization, independent of value-class status (see compile-time-constants-v1.md).
* `value class`: a *type* with no observable identity and with deeply immutable state.

A `let Point p` binding MAY be rebound to another Point. Neither `let` nor `val mut` permits mutation of a value's fields. The `mut` qualifier cannot circumvent type-level immutability.

## Proposed canonical surface

~~~atto
define value class Point as
    pub final int x;
    pub final int y;
    constructor(int x, int y) {
        self.x = x;
        self.y = y;
    }
end

pub fnc main(): int {
    val Point a = Point(10, 20);
    val Point b = Point(10, 20);
    assert(a eq b);        // true: field-wise nominal value equality
    assert(a neq Point(10, 21)); // true: different field values
    // a == b and a != b are invalid: values have no reference identity.
    val Point c = copy! a; // value duplication; no fresh-identity promise
    return c.x + c.y;
}
~~~

The examples are **target .atto**, not currently executable corpus claims. Direct nominal construction `Point(...)` is canonical for values. `new Class(...)` retains its identity/freshness meaning; `new Point(...)` MUST fail until its interaction with the distinct `new T` fresh-reference type contract has been explicitly specified. A compiler must never quietly lower `Point(...)` to an identity object and claim value-class support.

The intended grammar is `define [pub] value class Name ... as ... end` with the same named constructor forms as ordinary classes, subject to the restrictions below. Formatter normalization must preserve `value`; never normalize to `class` or `struct` by silently discarding its semantics. The existing `pub define` compatibility spelling may be preserved according to the general visibility rule.

## Required semantic invariants

1. **Nominal identity.** `Point` and `Coordinate` with identical fields are different static types; no implicit structural conversion or identity equality. Instances have no identity hash, monitor, address-observable reference, or user-visible object ID.
2. **Immutable complete initialization.** Every stored field is final and initialized exactly once before escape (declaration or constructor, never both). Constructors may perform field initialization but cannot leak partial `self`, capture mutable aliases, access another actor's state, or invoke unsafe effects. After construction, no field mutation, interior mutability, or mutable borrow is permitted. Public fields are still read-only.
3. **Transitive value safety.** The initial portable profile admits `int`, `bool`, `string`, nominal enums, and recursively proven value fields. Reject identity-class, actor, channel, mutable collection, raw pointer, mutable reference and open resource fields unless an explicit future approved deep-freeze proof exists. Recursive inline cycles and unproven generics reject. Floating-point fields await a signed-zero/NaN equality+hashing decision.
4. **Equality.** Only `a eq b` performs same-type, field-wise recursive value comparison; `a neq b` is its logical negation. `a == b` and `a != b` are **compile-time identity errors** (`E_VALUE_IDENTITY`) because a value class has no reference identity. This follows [value-versus-identity equality PR #62](../proposals/equality-value-vs-identity.md) and must not silently reinterpret identity syntax as value comparison. Members are compared in declared order; values with no fields are all equal. The operation compares each operand once, left-to-right; it must not introduce allocations, call arbitrary user equality overrides, or compare hidden object pointers. The initial profile has no float fields. `===` or other identity tests, monitors, identity hashes and `self` address escape are invalid.
5. **Hashing.** The compiler derives a deterministic value hash when every field has proven hash semantics. Equal values MUST hash identically across executions of the same target profile; backend-specific randomized table hashing must not be the portable derived value hash. The hash function may collide, but cannot inspect storage addresses. The concrete public hash API remains to be finalized; no backend may invent one as proof of this v1 feature.
6. **Copying.** `copy! v` for a value preserves its contents without promising a new identity, and is distinct from `copy! reference` requiring a fresh graph under the proposed Copyable contract (atto-spec PR #39). `take!` and `borrow!` obey existing ownership and use-after-take rules. A value type is trivially copyable only when every component is, and no action may smuggle a mutable pointer through such a copy.
7. **Actor boundary.** Identity-free does not imply permission-free: sending a value between actors still requires `Sendable` and ownership/lifetime checks. Serialization and cross-isolate transport require separate `Serializable`/wire contracts. No actor heap or sealed state is exposed.
8. **AOT representation.** Compilers must produce fully linked, ahead-of-time artifacts. Compile-time layout has a sound alignment/size/ABI proof and may specialize generics statically. The first profile must not require runtime reflection, JIT, class loading or a tracing GC. Storage flattening, memcpy lowering, escape elimination and vectorization require separate measured per-backend evidence.
9. **ABI/FFI.** Value passing across C/host ABI, native returns, Wasm component boundaries, network serialization and foreign languages is not automatically ABI-compatible with a same-shaped C struct. A documented target ABI or explicit adapter is required; reject unsupported boundary transfers.
10. **Type compatibility.** Value classes cannot extend ordinary identity classes or actors and cannot carry stateful instance finalizers. Pure interfaces may be implemented only when dispatch, ownership and full-AOT layout remain statically proven. Other inheritance, cyclic fields, reflection and dynamic proxy paths fail closed.

## Relationship to existing `struct` and `record`

Do **not** add a second uncoordinated value runtime. Reuse the existing product checker/layout and structural aggregate paths only when the semantics agree. `struct` and `record` may retain source-level typing and construction differences; `value class` is the explicit nominal identity-free contract. The current Rust/browser shape lowerer converts a limited struct/record syntax to ordinary heap class objects: that **does not establish** identity-free value classes, flattened arrays or zero allocations. A compiler must either implement the contract or issue `E_VALUE_UNSUPPORTED` with no guest output.

## Diagnostics (required categories)

* `E_VALUE_MUTABLE`: mutable field, mutable reference or attempted interior field update
* `E_VALUE_IDENTITY`: identity operation or forbidden `new`/identity-bearing inheritance
* `E_VALUE_FIELD`: unsupported identity/resource field, recursive inline field, nontrivial float field or unproven generic
* `E_VALUE_CONSTRUCTOR`: missing/duplicate initialization or escaping partially initialized self
* `E_VALUE_UNSUPPORTED`: feature recognized but a backend cannot compile it with correct semantics
* `E_TYPE`: nominal type mismatch (existing checker diagnostic may be retained)

Diagnostic positions must reference source spans. No unsupported feature may silently pass through ordinary class lowering.

## Conformance / proof requirements

Canonical registry: `atto-platform-conformance/contracts/value-classes-v1.json`; all rows initially `NOT_EXECUTED` until actual compiler-backed runs provide evidence.

* Positive: same-type same-value equality, unequal field, negative inequality, binding rebind, immutable copy semantics, immutable nested values, actor Sendable transfer, deterministic AOT output, and whole-program execution with the expected return.
* Negative: mutated field, identity operator, `new Point`, identity-class field, actor/channel/resource field, recursive inline field, inherited identity class, duplicate/missing field, nonportable float, attempts to share mutable alias, unsupported FFI boundary, and nominal mismatch.
* Verify each compiler's parse, resolution, type-check, effect/borrow-check, lowering, binary execution, full-AOT output where applicable, and diagnostics. If only a parser or reference oracle ran, mark HOST_ONLY / PARSE_ONLY and do not claim guest success.
* Save exact source commit and Git-tree/blob SHA, test runner id, toolchain and command, observed exit/diagnostic, allocated bytes where claimed, and sanitizer results for native backends.

## Staged implementation

Stage A: canonical grammar and conformance registry, negative fail-closed parser admission, no executable value-class claim.
Stage B: bounded scalar nominal value class (int/bool/string/enum fields), generated recursive equality, immutable construction, safe `copy!`, executable compiler+guest tests.
Stage C: nested values and static layout, LLVM/GraalVM/.NET/Wasm/Forge/Rust full-AOT parity, actor transport and ABI gates.
Stage D: verified optional flattening/SIMD/SoA and explicit performance receipts.

**Non-goals:** promise that every value is stack-allocated, that all arrays are flattened, that a value automatically becomes serializable, that floating-point NaN comparisons are already solved, or that Java Valhalla bytecode must be emitted by Atto.
