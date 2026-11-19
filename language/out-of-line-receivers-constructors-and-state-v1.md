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
