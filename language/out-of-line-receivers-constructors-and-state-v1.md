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

- `declare class C;`, `declare struct S;` and `declare actor A;` introduce **nominal owners**, not values, allocations or executable exports. Under the namespace completion profile below, a class can be completed by its owned attachments without a second `define class` block. A struct still needs a complete nominal field/layout declaration, and an actor still needs its checked lifecycle, state and message contracts. No unresolved owner can be constructed or lowered to a guessed layout. The prior explicit-define profile remains versioned for migration.
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

The grammar uses the token sequence `constructor ( type_name ) ( parameter_list ) : self body`. Spaces, tabs, and newlines **between tokens** are insignificant, including after the `constructor` keyword and between the two adjacent parenthesis groups. No extra argument, currying, overload, different nominal owner, or altered effects arise from spacing. The formatter SHOULD canonicalize these forms to `constructor (Counter)(int initial): self` (one space after `constructor`, no space between the two parenthesized groups). Comments between tokens remain semantically inert but MUST be preserved, never deleted to enforce canonical spacing. Whitespace within identifiers or keyword spellings is **not** permitted. A body is mandatory. Under the namespace completion profile, `constructor (Counter) (int initial) { ... }` also admits an implicit `: self` marker; explicit `: self` remains equivalent. No other return annotation is admitted. The older explicit-marker profile remains versioned for migration.

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

Compiler/borrow-checker obligations: attach bodies only to authenticated nominal owners and check completion before codegen, validate constructor coverage by CFG including throw/raise/panic, enforce visibility and private state, distinguish initialized self from an ordinary borrow, ensure the receiver's lifetime remains live across calls, prohibit moves while borrowed, reject invalid guard/alias sharing, and verify layout ABI does not silently turn structs into identity classes. Report unsupported features **before** codegen; no guest artifact on rejection.

Testing requires positive and negative source fixtures for each case in `contracts/receivers/constructors-and-state.v1.json`, real compiler and guest execution (not only syntax scans), Wasm/native parity where applicable, and a documented exact source SHA/toolchain/runner with executed steps. Until then case statuses are `TARGET_NOT_EXECUTED` regardless of structural fixture validation.

Related contracts: [struct field equals](struct-field-equals-v1.md), [implicit argument borrowing](implicit-argument-borrow-v1.md), [local binding mutability](local-binding-mutability-v1.md), and [shared ownership/guards](shared-ownership-and-guards-v1.md).

## Namespace completion amendment (2026-11-27)

**Owner-directed target, NOT_EXECUTED.** This section supersedes the requirement for a second `define class` in the distributed class profile. Inline and distributed source forms elaborate to the same checked nominal IR; neither form introduces a runtime type object.

```atto
use namespace example;

define interface Bar as
    xyz(): void;
    abc(): void;
end

declare pub[pkg] class Foo implements Bar;

constructor (Foo) () {
}

pub mtd (Foo) xyz(): void {
}

pub mtd (Foo) abc(): void {
}
```

The first parenthesis in `constructor (Foo) ()` is an owner selector, not a runtime argument; its omitted result marker is implicitly `: self`. The owner-only receiver `mtd (Foo)` introduces implicit readonly `self` and is equivalent to `mtd (Foo self)`; explicit named and mutable receiver forms retain their existing checked semantics. No implicit exclusive borrow. Method visibility remains independent of owner visibility; public interface obligations need visible matching implementations. Constructors have their own visibility, private by default. Both the compact and explicit forms must round-trip without changing visibility, ownership or body.

### Closed namespace completion

The [five namespace spellings](namespace-modes-v2.md) resolve to tagged file, named or folder scope keys. Omitted/default/file are equivalent and completion is confined to the current file. Only explicitly enrolled same-package named or folder participants may contribute across files. All following references to namespace identity mean this exact scope key, not a textual name or ambient directory.

- `declare` is for types, not standalone functions, runtime variables, constructors or methods. A fully specified type-only alias/contract is distinguished from an incomplete nominal owner; no runtime type value is created.
- A full `define class Foo as ... end` contains its complete implementation in the new profile. A distributed `declare class Foo;` instead collects owned member and layout attachments across authenticated source units in the same namespace, independently of file and declaration order. Do not require an empty `define class Foo as end` as a completion token. Legacy mixed inline/attached forms require the existing versioned compatibility profile; never silently reinterpret a mixed definition.
- The canonical nominal owner key includes authenticated package identity, exact namespace, enclosing module (if any), nominal kind, and name with generic declaration identity. Source paths/provenance are retained but do not make one same-namespace owner per file. A same-spelled namespace in another package, child/sibling namespace, imported alias or dependency is not attachment authority. Ordinary imports grant lookup, not mutation of another type. Reject duplicate owners, conflicting visibility/kind/extends/implements/generic contracts and attachments to imported or builtin types. This is closed-world assembly, not an extension-method mechanism.
- Collect all source units from a manifest-pinned immutable source set; do not scan arbitrary unrelated files or let imports introduce foreign attachments. Build the nominal header index first, resolve and collect attachments second, finalize storage, constructor and method tables third, then validate inheritance/implements, bodies, initialization, effects and ownership. No textual-order dependence, partial publication or post-codegen attachment. Rebuild dependents when signatures or layout change.
- A declared class with an explicit checked constructor or concrete attached method and no storage declarations has an explicitly determined empty own-field layout at namespace closure (base layout and any protected state remain accounted for). A header alone is incomplete in this profile; use an inline empty definition if intentionally empty. This is a proposed conservative completion witness, not a rule that a method body alone proves all obligations. No synthetic constructor or implicit initialized fields beyond existing construction rules. Ordinary out-of-line field syntax is not introduced here; existing attached state syntax retains its separate guarded semantics. Stateful classes need complete checked layout and initialization. Struct/actor completion must honor their existing kind-specific requirements; no class-only empty-layout shortcut for them.
- Validate every concrete declared owner, even unused, before optimization/tree shaking. Require exactly one implementation per legal slot, check contract visibility and generic/receiver/effect/ownership signatures, and reject duplicate constructors, missing requirements, illegal layout cycles and initialization escapes. Constructor `self` may not escape before successful completion; actor hooks and protected state do not become ordinary public methods. Failure produces no executable artifact.
- Freeze a deterministic typed descriptor and layout/ABI at namespace closure. File order, import order and body placement must not affect nominal identity, observable dispatch, layout or AOT behavior. No runtime reflection discovery, mutation of method tables or open-world extension.

### Proposed acceptance gates (all NOT_EXECUTED)

Positive: inline and distributed class both produce 42 using a real constructed instance and a public method; split header/constructor/methods across files; reverse file and declaration order; compact vs explicit receiver and constructor markers; package-scoped class visible to same-package consumer; recursive method signatures; complete type-only alias; state-only class with checked protected state; inherited and trait-default obligations.

Negative: header only; missing interface method even unused; wrong return/ownership/effects; private implementation of a public obligation; duplicate method/constructor across files; conflicting owner kind/visibility/generics; wrong namespace/package or imported alias attachment; mixing inline and distributed forms in the new profile; unauthorized field layout mutation; uninitialized or escaping constructor self; malformed receiver/constructor; ordinary free function with declare; declaration used as runtime value; actor ingress bypass; order-dependent duplicate resolution.

Compiler gates: parser/formatter round trip, authenticated namespace binder, typed layout and conformance, ownership/initialization, emitted IR and actual native/JVM/Wasm guest execution. A negative fixture must fail in the intended phase and emit no executable. Require exact head/tree, real runner steps and expected output/diagnostic receipts per backend. Until then no implementation or parity claim.
