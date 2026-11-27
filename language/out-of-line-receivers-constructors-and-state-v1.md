# Out-of-line class/struct receivers, constructors and guarded state v1

**Status: TARGET DESIGN / NOT EXECUTED.** This contract specifies new AttoLang `.atto` grammar and observable safety obligations. It is not proof of parser, checker, guest Wasm, native AOT or cross-backend execution. Existing actor receiver syntax and the limited executable immutable class receiver subset remain independently gated.

## Unified declarations and receivers

```atto
declare class Counter;

define state on class Counter as {
    let int count = 0;
}

pub constructor (Counter)(int initial): self {
    self.handle_state(critical-write |s| -> { s.count = initial; });
}

pub mtd (Counter self) get_count(): int {
    return self.handle_state(critical-read |s| -> s.count);
}
pub mtd (Counter self) increment(): void {
    self.handle_state(critical-write |s| -> { s.count += 1; });
}
```

- `declare class C;`, `declare struct S;` and existing `declare actor A;` introduce **nominal forward owners**, not values, allocations or executable exports. A class must acquire an exactly-one concrete storage/layout definition (an attached state definition qualifies for a state-only class); a stateless class can be defined by `define class C as end`. A struct needs a complete nominal field declaration. No forward-only owner can be constructed or lower to a guessed zero-size instance.
- `pub mtd (C self) name(...): R { ... }` and `pub mtd (S self) name(...): R { ... }` declare ordinary instance methods associated with their **exact** nominal owner, regardless of lexical location. `(self: C)` is an accepted typed alias; `(mut self: C)` requests an exclusive mutable ordinary-object loan. A receiver is not a separate explicit runtime argument, and callers use `object.name(...)`. Actor receivers keep their isolation and mailbox rules; these class/struct rules do not grant synchronous ActorRef dispatch.
- Methods are private by default, `pub` is externally visible, and package-scoped modifiers (where implemented) obey the existing visibility system. Use snake_case names. Overload selection is by owner, method name, then arity and permitted nominal type distinctions; receiver mutability alone does not create an overload. Inline/out-of-line duplicate implementations are errors.
- Forward declarations, definitions, state attachments, constructors and out-of-line methods may appear in source order independent of each other after imports. Linking is based on the resolved namespace/module and nominal ID, **not** text coincidence or type-shape equivalence. Reject unresolved, duplicated, imported-inaccessible and conflicting owner declarations.

## Constructors: shared declaration syntax, different allocation behavior

Canonical out-of-line declaration:

```atto
pub constructor (Counter)(int initial): self {
    self.handle_state(critical-write |s| -> { s.count = initial; });
}
val counter = new Counter(7);
```

### Lexically equivalent constructor headers

All of the following are **identical constructor declarations** once completed with the same `: self` and body:

```atto
constructor (Counter)(int initial): self { }
constructor (Counter) (int initial): self { }
constructor(Counter) (int initial): self { }
```

The grammar uses the token sequence `constructor ( type_name ) ( parameter_list ) : self body`. Spaces, tabs, and newlines **between tokens** are insignificant, including after the `constructor` keyword and between the two adjacent parenthesis groups. No extra argument, currying, overload, different nominal owner, or altered effects arise from spacing. The formatter SHOULD canonicalize these forms to `constructor (Counter)(int initial): self` (one space after `constructor`, no space between the two parenthesized groups). Comments between tokens remain semantically inert but MUST be preserved, never deleted to enforce canonical spacing. Whitespace within identifiers or keyword spellings is **not** permitted. The standalone header without a `: self` marker and valid body is an incomplete declaration, not an executable constructor.

The **first** `(Counter)` identifies the owning nominal type and supplies no value parameter; the **second** parenthesis list contains explicit constructor arguments. `: self` is the construction-result marker, not the type of a caller-supplied receiver, and no explicit `return self` is required. The constructor has a compiler-owned under-construction `self` capability; it is never callable as `counter.constructor(...)`, and returning a partially constructed self, publishing it, taking/sharing it, or allowing it to escape is an error. Class allocation and field/state initialization happen exactly once, before publication. Every control-flow exit must prove required initialization; any throw/raise/panic must unwind only the initialized subobjects exactly once. As with ordinary methods, named constructor **call** arguments use `name: expression` where admitted, never `name=expression`.

Classes have identity and may allocate. Their ordinary fields remain as supported by `define class`; `define state on class` is a distinct guarded member domain, not a source rewrite into ordinary public fields. Ordinary mutable class field writes require a checked `mut` receiver / exclusive loan; guard-protected state uses the separate checked guard authority described below.

```atto
define struct T as {
    pub foo: string;
    bar: int;
}

pub constructor (T)(string value): self {
    self.foo = value;
    self.bar = 0;
}

pub mtd (T self) star(): string {
    return self.foo;
}
val t = T("hello");
```

Structs are **nominal value types**, not implicitly boxed identity-bearing classes. During a struct constructor, `self.field = expr` is a write-only, compiler-owned initialization place; each required field must be definitely initialized exactly once on all successful paths before any read, return or escape. No implicit default, zeroed uninitialized memory, shallow copy, reference identity or heap allocation is authorized. A struct method receives a readonly borrow by default; mutable struct methods require a checked exclusive borrow (`mtd (mut self: T)`). A struct cannot acquire an attached `define state` domain; explicit `RwLock<T>` composition is the separate synchronized option.

Without an authored constructor, a fully defined nominal struct retains compiler-proven field initialization `T{foo: "hello", bar: 42}`. The optional shorthand `T(foo="hello",bar=42)` is **only** the already-separately-proposed generated field-initializer form, guarded by exact nominal resolution; it is not ordinary named arguments. Once a custom constructor exists, `T(...)` routes to that constructor using positional/`name:` arguments, and the equals-field shorthand must not ambiguously override it. External direct `T{...}` bypass of user-defined constructor invariants is forbidden; a checked constructor body may initialize its own fields. `new T(...)` is invalid for value structs. A class constructs via `new C(...)`; `C{...}` is not a class factory.

## Struct declaration attachments (owner-approved syntax target, 2026-11-26)

A named declaration `define struct Point { ... } with { ... }` (and existing `type Point = struct { ... }` spelling where admitted) attaches behavior to the exact nominal struct owner at compile time. It is not a transparent structural alias with methods that leak to other aliases of the same shape. The owner is inferred from the declaration; no explicit receiver or `: self` constructor result marker is required in an attached header.

```atto
define struct Point {
    int x;
    int y;
} with {
    constructor(int x, int y) {
        self.x = x;
        self.y = y;
    }

    mtd int • sum() {
        return self.x + self.y;
    }

    mtd int <- product() {
        return self.x * self.y;
    }

    mtd is_origin() -> bool {
        return self.x == 0 && self.y == 0;
    }
}
```

Within the permitted visibility scope, `let p = Point(10, 20);` constructs a value; `p.sum()`, `p.product()`, and `p.is_origin()` return 30, 200, and false respectively. Existing visibility rules remain in force; use `pub` on a constructor or method intended for external callers.

The chained spelling is equivalent:

```atto
define struct Point {
    int x;
    int y;
} with constructor(int x, int y) {
    self.x = x;
    self.y = y;
} with mtd int • sum() {
    return self.x + self.y;
} with mtd int <- product() {
    return self.x * self.y;
} with mtd is_origin() -> bool {
    return self.x == 0 && self.y == 0;
}
```

- In type-declaration context, an attachment is either `with` followed by one member declaration or `with { ... }` containing member declarations. Chained and grouped attachments normalize to the same owner/member AST. Ordinary statement bodies, field-update expressions and arbitrary expressions are not attachment members. The existing expression-level `value with {field: expr}` remains a distinct grammar; no change to trait composition or copy-and-update semantics.
- In method headers `mtd R • name(...)`, `mtd R <- name(...)`, `mtd name(...) -> R`, and existing `mtd name(...): R` are equivalent return-type declaration spellings. The first two are prefix forms; arrow and colon are postfix. The canonical example uses the postfix arrow. The bounded compiler profile currently rejects `mtd R * name(...)`; this example correction does not resolve broader asterisk admission. Preserve other independently admitted callable signature forms and formatter spelling; these four forms normalize to the same signature. Constructor headers use `constructor(args)` with no return separator and implicit under-construction self.
- Existing callable modifiers and effects apply according to the ordinary method grammar; readonly receiver is the default, checked exclusive receiver authority is required for mutation, and static members have no instance self. Overload selection ignores separator spelling; duplicate normalized signatures (including out-of-line definitions) reject. Do not manufacture visibility or receiver capabilities by using an attachment.
- Constructors select overloads statically, evaluate call arguments once in source order, and initialize each required field before read/escape. On failure destroy only initialized subobjects once; no implicit zero/default synthesis. Once a custom constructor exists, direct external aggregate syntax must not bypass it, including field-equals shorthand and unverified copy-and-update reconstruction. Ordinary checked copying of already valid values remains governed by the ownership contract.
- The attached declaration lowers to the same static member and constructor representation as out-of-line declarations, without per-instance method storage, required vtables, boxing, JIT, reflection or mandatory heap allocation. A value constructor may initialize its final destination directly if effects and lifetime semantics are preserved.
- Explicit owned heap placement of value structs and destructor attachment require reconciliation with the existing prohibition on `new T(...)` and separate lifecycle/capability rules. This syntax amendment does not silently change those rules or admit unsafe destruction.

### Required conformance (all TARGET_NOT_EXECUTED)

| Case | Expected |
| --- | --- |
| Exact grouped Point source above | Accept; guest outputs 30, 200, false |
| Equivalent chained Point source | Same typed result and observable behavior |
| Each of the four return-type forms (`•`, `<-`, postfix `->`, postfix `:`) | Same return type, name and dispatch |
| `mtd bool * is_origin()` | Reject in the existing bounded profile; broader spelling decision unresolved |
| Two methods differing only in separator | Reject duplicate signature |
| Attached and out-of-line duplicate member | Reject duplicate signature |
| Constructor overload by distinct arity/type | Accept with static resolution |
| Missing constructor field on a successful path | Reject incomplete initialization |
| Reading uninitialized field or escaping self | Reject before code generation |
| Direct field literal or equals shorthand bypassing authored constructor | Reject |
| Mutation through readonly receiver | Reject |
| Private member used outside its visibility scope | Reject |
| Expression-level copy-update and existing trait with syntax | Unchanged |
| Formatter round-trip for grouped/chained and all separator spellings | Preserve normalized AST and comments |
| Failure during partial construction | No published value; initialized fields dropped once |
| AOT value construction and method call | No mandatory per-instance allocation or dispatch table; measure separately |

No case is backend-certified by this text. Exact-head positive guest runs, semantic negative diagnostics, formatter round trips and layout/ownership evidence are required independently for each compiler.

### Nested nominal values and construction

```atto
define struct Rectangle {
    Point top_left;
    Point bottom_right;
} with {
    constructor(Point a, Point b) {
        self.top_left = a;
        self.bottom_right = b;
    }

    mtd area() -> int {
        return (self.bottom_right.x - self.top_left.x)
             * (self.bottom_right.y - self.top_left.y);
    }

    mut mtd shift(int n): void {
        self.top_left.x = self.top_left.x + n;
    }
}
```

Resolve all complete by-value nominal definitions before computing a layout. Declaration order does not determine type identity. Reject an unresolved owner, a direct or indirect by-value cycle, and a layout or expansion that exceeds the backend's documented resource limits. Do not substitute a pointer, class identity, implicit allocation or zero-filled storage to break a cycle. Explicit indirection follows separate pointer/ownership rules.

Constructor overload selection uses the original nominal argument types, not the flattened leaf signature. Assigning a complete nested value to an under-construction field establishes initialization only after its entire value is available. Copyable nested values have independent logical mutable state; copying an enclosing value must not alias its original or the source constructor arguments. Repeated or missing initialization and reads before initialization remain errors. A readonly receiver cannot mutate any nested field; a mutable receiver requires exclusive authority over its projected storage.

Scalar replacement and flattening are allowed when they preserve this behavior and observable evaluation order. Compiler-private leaf slots are not a source-level ABI, a promised object size, or evidence of allocation-free execution for resource-bearing values. A bounded initial executable profile can support scalar leaves (int/bool), local complete owners, whole-field constructor snapshots and checked leaf writes; it must reject unsupported generic, resource, cross-module, actor-transfer and lifetime cases without an artifact. General ABI alignment, destructor ordering, partial-resource cleanup, visibility and cross-suspension ownership require separate proof. No implementation cap from a bounded backend is a language-wide type limit.

Required differential fixtures include distinct nested nominal identities with equal shape, two- and three-level nested copies, forward owner resolution, mutation of original constructor inputs and copied receivers, direct and mutual cycles, incomplete initialization, wrong nested types, immutable nested writes and adversarial expansion limits. See the portable registry `contracts/struct-with-members-conformance-v1.json` in atto-platform-conformance. Diagnostic codes must be verified separately from simple no-artifact rejection.

### Physical layout and lifetime proof boundary (candidate)

This refines [record versus struct layout](record-struct-layout-v1.md),
[recursive layout graphs](recursive-layout-graph-wire-v1.md) and
[explicit C layout](compile-time-reflection-ffi-layout-v1.md); it is not a
new C ABI, placement syntax approval or language-wide resource cap.

- Resolve each fully instantiated nominal owner and construct its inline
  storage dependency graph before assigning offsets. A by-value cycle is
  invalid regardless of finite constructor inhabitation. A separately
  approved reference or handle may cut an inline edge; never insert one
  implicitly. Preserve distinct module-qualified nominal identity even for
  equal physical layouts.
- A target layout descriptor must include the target ABI identity, scalar
  size/alignment facts, ordered field identities, offsets, total size,
  alignment, tail padding and ownership/drop metadata. Logical scalar
  replacement need not materialize a physical object. When a materialized
  value is required, use checked alignment rounding, checked addition and
  bounded graph traversal. For ordinary declaration-order storage, align
  each field offset to its field alignment, then round the final size up
  to the aggregate alignment. Reject missing target facts, invalid
  alignments, overflow and exceeded target/actor quotas before allocating.
  Zero-sized and over-aligned types require separately admitted policies.
- Do not infer a universal bool representation, pointer width, padding
  value, cross-target ABI or wire format from a single scalar backend.
  Explicit C interoperability requires the separate target header witness
  and calling-convention proof. Padding is not a source field; never read
  it as initialized payload or serialize it.
- A stack/heap placement plan must bind the storage capability to the
  exact owner, tenant/actor, generation, size, alignment and lifetime.
  Construction publishes no initialized value until the required fields
  are initialized; failure destroys only initialized resource subobjects
  in reverse completion order, exactly once. Mutable authority is
  exclusive over overlapping projected storage. Disjoint-field loans are
  admissible only with a field-sensitive proof. A live loan prohibits
  destruction, relocation or reuse of overlapping storage. Detachment of
  a pointer is not destruction or deallocation. Retire a generation before
  reusing its storage; stale capabilities must not regain access.
- The bounded Cranelift Point placement lane provides an implementation
  example of a 16-byte, 8-aligned explicit slot containing two i64 fields
  at offsets 0 and 8. It is not general heap placement, runtime pointer
  escape, arbitrary resource destruction or actor-owned allocation proof.

Required independent evidence: mixed alignment and tail padding; nested
inline field offsets; array stride where admitted; forward declarations;
mutual/self inline cycles; overflow/invalid alignment/budget denial;
distinct nominal owners with equal layouts; projection-specific loan
overlap and move/destruction denial; constructor failure at each field;
drop order and exactly-once cleanup; stale-generation denial after reuse;
allocation-failure rollback and actor/tenant quota isolation. Compare
materialized native memory observations against the declared target
descriptor, not only a host reference model or scalar guest result.

## Protected class state and containership

`define state on class C as { ... }` is an exactly-once **per-instance** attached state schema with its own private, exclusive storage identity and independent lifetime under the containing instance. State fields use ordinary typed field declarations and initializers and are private regardless of receiver method visibility; the state attachment is not a public field or a static singleton. An initializer is evaluated per instance with checked effects, and every state field is initialized before constructor code receives a usable state guard. Missing initializer or field validity may be admitted only when the compiler can prove definite initialization.

`self.handle_state(critical-read |s| -> expr)` creates a scoped readonly view; `self.handle_state(critical-write |s| -> { ... })` creates an exclusive mutable view. Multiple readers can coexist, but a writer excludes every other reader/writer for that instance. Checked synchronization may enable a write through a readonly *ordinary receiver* because the protected state is verified interior mutability; it does **not** permit ordinary field mutation, writable aliases to frozen data, or bypass of `share!` graph-freeze rules. Backend implementations may use guard/capability lowering without a heavyweight mutex only when exclusivity is mechanically proven.

- A state guard and its binder cannot escape via return, storage, closure capture, `share!`, `take!`, `copy!`, pointer cast, FFI, actor message or reentrant method call; returning independently owned copyable data is allowed.
- No suspension, await, select, yield, spawn, arbitrary unknown effects, recursive guard acquisition or cross-actor turn is permitted while a guard is live. Acquisition must not block a scheduler thread if the backend cannot park a waiter safely. Guards release on *every* normal and exceptional exit, including cancellation and panic.
- `self.count` does not access attached state; `self.state.count` is not an escape hatch. Only guard scopes access the protected layout. Ordinary class fields with the same name as protected state fields must not silently resolve to one or the other.
- State attachment does not confer `Sendable`, `Serializable`, cross-actor sharing or an unsafe pointer right. A stateful class may be transferred/shared only when its domain, protected storage and guard runtime satisfy existing ownership and transport contracts. `share!` cannot manufacture a second mutable alias.
- Every class instance owns exactly its attached state; copying or cloning an instance must specify whether it deep-copies that state and must **never** alias mutable storage accidentally. The allocation/state/guard is destroyed exactly once, after all guards are retired.

## Migration and implementation gates

Existing inline class constructors, class methods, scalar struct literals and actor receivers must continue to parse with their existing semantics; this change adds out-of-line attachments, **not** alternate meanings for old syntax. Existing `define struct S as ... end` remains valid; the braced `as { ... }` is an additional normalized body style, not a different kind of type. Formatter should preserve or canonicalize to `constructor (T)(args): self`, `mtd (T self)`, and snake_case callable names without inventing `::`.

Compiler/borrow-checker obligations: attach bodies only to proven owner definitions, validate constructor coverage by CFG including throw/raise/panic, enforce visibility and private state, distinguish initialized self from an ordinary borrow, ensure the receiver's lifetime remains live across calls, prohibit moves while borrowed, reject invalid guard/alias sharing, and verify layout ABI does not silently turn structs into identity classes. Report unsupported features **before** codegen; no guest artifact on rejection.

Testing requires positive and negative source fixtures for each case in `contracts/receivers/constructors-and-state.v1.json`, real compiler and guest execution (not only syntax scans), Wasm/native parity where applicable, and a documented exact source SHA/toolchain/runner with executed steps. Until then case statuses are `TARGET_NOT_EXECUTED` regardless of structural fixture validation.

Related contracts: [struct field equals](struct-field-equals-v1.md), [implicit argument borrowing](implicit-argument-borrow-v1.md), [local binding mutability](local-binding-mutability-v1.md), and [shared ownership/guards](shared-ownership-and-guards-v1.md).
