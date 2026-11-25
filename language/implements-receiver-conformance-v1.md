# Interface/trait `implements` and receiver conformance v1

**Status: NORMATIVE TARGET / NOT BACKEND-CERTIFIED.** This contract defines intended AttoLang language behavior, **not** evidence that Java, LLVM, Rust/Wasm, .NET, Forge, Cranelift or JS compilers implement it. No compiled guest result is implied by these examples. Related design: [out-of-line receivers](out-of-line-receivers-constructors-and-state-v1.md); existing Rust class-only draft [atto-source.rs#137](https://github.com/atto-lang/atto-source.rs/pull/137).

## One keyword, two contract kinds

`implements` is the **only canonical conformance clause** for both `interface` and `trait` types on concrete `actor`, `class` and `struct` declarations. Do not add a parallel `with`, `uses`, `conforms`, `impl` or `traits` keyword for type-declaration conformance. `extends` expresses legal nominal base-type inheritance; it is not a substitute for `implements`. A class may have both clauses, with `extends` first.

```atto
declare actor FooActor implements IFoo, Logging;
declare class FooClass extends BaseClass implements IFoo, Logging;
declare struct FooValue implements IFoo, Logging, Serializable;
```

These are **forward declarations**, not complete executable definitions. Each must link to a compatible, complete `define` for its own nominal kind before the linked concrete type can be used. A declaration alone never proves conformance; unresolved executable owners or incompatible declaration/definition clauses are compile/link errors. This does not require unused forward declarations to materialize runtime objects, but **every defined concrete owner** must be checked before codegen or tree shaking, even if otherwise unused.

`Foo implements Foo` is not a way to implement an interface and a separate actor or class both named `Foo`: those collide in the same nominal type namespace. Reuse a name only for the allowed matching forward/definition pair, never for two different type identities.

Interface members are required signatures (including declared visibility, mutability/ownership and effect bounds), not bodies. Traits may include compatible default method bodies **and** required signatures; defaults are genuine checked implementations, not proof that missing abstract obligations disappeared. Empty interfaces and empty traits are valid nominal marker contracts.

## Definition and method linkage

```atto
define interface IFoo as
    ping(): int;
end

define trait Logging as
    log_message(string message): void { /* allowed trait default */ }
end

declare struct Sensor implements IFoo, Logging;

define struct Sensor implements IFoo, Logging as
    pub value: int;
end

pub mtd (Sensor self) ping(): int {
    return self.value;
}
```

The checker must resolve a `mtd (Owner self) method(...): Return` by **the exact nominal owner ID**, not a text match or structural shape. Methods written in an inline owner body, in a valid linked out-of-line `mtd`, inherited from a supported concrete base, or provided by a unique applicable trait default form one effective method table. Declaration order must not change conformance. Duplicate inline/out-of-line implementations of the same slot are errors. Static methods, constructors, top-level `fnc`, unbound similarly named methods, inaccessible private methods and overloads of the wrong arity do **not** satisfy a public instance obligation.

Actors use exactly the same interface/trait conformance validation, but a satisfying `mtd (Actor self)` retains actor isolation, supervisor behavior, sealed state and mailbox/effect restrictions. An interface cannot grant direct synchronous foreign-actor method calls or turn `ActorRef` into an ordinary class reference. Struct receiver methods retain value semantics, checked borrow/mutability and initialization rules; no implicit boxing or identity inheritance arises from implementing a contract.

## Mandatory fail-closed semantic phase

Before emitting **any** executable artifact, perform:
1. Parse and retain all `implements` entries on forward declarations and definitions of actors, classes and structs; preserve source locations. Resolve names and kind/visibility across imports and matching forward/definition pairs, detect duplicate names and duplicate conformance entries.
2. Fully resolve inherited base methods, transitive interface/trait obligations, trait defaults, local inline methods and linked out-of-line `mtd` declarations. Detect cycles and ambiguous competing default implementations; do not choose by declaration order.
3. For **every** required instance method slot, require a unique concrete, accessible implementation. Resolve overloads by name and arity first, then permitted nominal parameter differences (per existing overloading policy), **not** structural coincidence. Check full parameter and return types, generic specialization, visibility, receiver mutability, ownership/lifetimes, suspension and failure effects and any declared contract bounds. Neither an untyped declaration nor a stub body counts as compiled implementation.
4. If multiple traits/concrete bases provide distinct same-slot defaults, require an explicit valid resolution/override; a named `mtd` can resolve it once its signature, body and owner are checked. Verify no weaker visibility, effect or ownership guarantee is substituted. Inherited implementation or unique trait default may satisfy an interface without a redundant local body.
5. Fail with a deterministic located diagnostic for any missing, incompatible, ambiguous, unresolved, inaccessible or unsupported obligation. **Do not** silently drop `implements`, accept a target-only AST as an executable implementation, emit partial Wasm/native code, or allow tree shaking to hide a broken concrete type.

Recommended diagnostic families: `E_IMPL_MISSING`, `E_IMPL_SIGNATURE`, `E_IMPL_VISIBILITY`, `E_IMPL_CONFLICT`, `E_IMPL_UNRESOLVED`, `E_IMPL_KIND`; existing class-only `E_INTERFACE` may be temporarily mapped to the corresponding specific family without changing failure semantics. An unsupported backend must explicitly fail with `E_UNSUPPORTED` and produce **no executable artifact**, never report success.

### Negative examples (all must fail)

```atto
define interface IFoo as ping(): int; end
define actor Missing implements IFoo as end // E_IMPL_MISSING
```

```atto
define interface IFoo as ping(): int; end
define struct Wrong implements IFoo as
    pub ping(): string { return "not an int"; }
end // E_IMPL_SIGNATURE
```

```atto
define interface IFoo as ping(): int; end
define class Hidden implements IFoo as
    ping(): int { return 3; }
end // E_IMPL_VISIBILITY
```

```atto
define trait A as pub ping(): int { return 1; } end
define trait B as pub ping(): int { return 2; } end
define class Conflict implements A, B as end // E_IMPL_CONFLICT
```

## Cross-backend release gate

Portable regression fixtures live in `atto-platform-conformance`; at least one accepted and one rejected fixture per nominal owner kind, and inherited/default/conflict, signature, visibility, wrong-owner and declaration-mismatch cases are mandatory. Record parsing, type checking, linking, emitted guest status and actual guest execution separately. Positive tests require actual guest compilation and run; negative tests require the expected diagnostic and **no executable artifact**. Native-hosted Rust compiler tests alone do not prove browser-hosted Rust compiler, Java, LLVM, independent Wasm, .NET, Forge, Cranelift or JS parity. An exact-commit cross-org carrier must prove Git tree/blob identity and real job-step execution; a queued or zero-step run is `NOT_EXECUTED`.



The checked-in host reference suite `tests/implements-receiver-reference.test.mjs` exercises selected semantic invariants only; it does not compile Atto source or certify backend parity.
