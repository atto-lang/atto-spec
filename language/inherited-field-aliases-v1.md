# Inherited field aliases v1 — dot-qualified members

**Status: DRAFT TARGET / NOT VERIFIED BY ANY COMPILER.** This records the AttoLang design decision for multiple state-bearing inheritance; it does not lift existing Rust/Wasm or other backend restrictions on inherited fields, constructors, actor state, or base layouts.

## Canonical syntax

```atto
define class Dog as
    pub int age: 5;
end

define class Cat as
    pub int age: 10;
end

define class Hybrid extends Dog, Cat as
    use Dog.age as dog_age;
    use Cat.age as cat_age;
end
```

Only **dot** qualifies a member: `Dog.age`. The C++-style `Dog::age` form is **not** AttoLang member syntax, including for static members. Existing `::` callable-body separators, where admitted, are unrelated.

Proposed class-body production (distinct from imports or expression-level `use`):

```ebnf
inherited_field_alias = "use" ancestor_type "." field_name "as" alias_name ";" ;
ancestor_type         = type_reference_resolving_to_ancestor ;
field_name            = identifier ;
alias_name            = identifier ;
```

A formatter preserves the `.` member separator, the chosen ancestor path, and the alias name. The example uses `as ... end`; equivalent outer class-brace spelling, if independently admitted, must have the same semantics. `use` is contextual in this member-declaration position.

## Semantics

1. Resolve `ancestor_type` by **nominal identity**, not by spelling or structural shape; it must denote an actual reachable ancestor of the containing class. Resolve `field_name` to an accessible **instance field**, not a static field, method, property synthesis, constructor, module export, or symbol. Static access continues to use `Type.member` in its ordinary context; static-member alias declarations are outside v1.
2. Bind the alias to the **existing inherited field slot** (declaring field identity plus selected inheritance path). It is not a declaration of new storage, deep/shallow copy, independent property getter, implicit forwarding closure, field merge, or initializer. Reads/writes through the alias and a qualified route to that same slot must observe the same value, subject to ownership rules.
3. Distinct fields of `Dog.age` and `Cat.age` remain distinct even when their names and types agree. `Hybrid.age` is ambiguous and must not silently select either. A concrete class with a same-name inherited collision must resolve each conflicting visible origin explicitly, here through two aliases, before admission; aliases do not silently promote either field to the original name.
4. Source member access uses `hybrid.dog_age` and `hybrid.cat_age` when visibility permits. An alias cannot expand visibility or bypass private/protected access, `final`/mutability restrictions, affine ownership, borrow lifetimes, move state, read/write capabilities, or actor isolation. Aliases to private ancestor fields must be rejected absent independently authorized access.
5. Aliases are unique within the resulting class member namespace. Duplicate alias names and clashes with local fields, methods/properties (where member namespaces overlap), inherited public names, and existing aliases are errors. No implicit shadowing.
6. A plain alias does not resolve a *method-body* collision. Competing inherited implementations still require an explicit valid override; method aliases are a **separate future extension**, not enabled by this v1 field contract.
7. Generic ancestor bindings must resolve type arguments and field type before alias publication; an alias carries the resolved field's type, layout/ABI identity and effects. Hot-load generation and package identity may not be dropped from the symbol/slot key.
8. A shared-grandparent diamond is *not* automatically coalesced or duplicated by an alias. For example, if `Dog` and `Cat` inherit `Animal.age`, the compiler needs a separately specified, checked shared-versus-independent ancestor layout and initialization policy. Until that exists, reject the construction before executable IR; never invent `Animal.age` identity from textual equality.
9. Base constructors and per-field initialization must execute according to the independently specified layout policy, exactly once per actual state-bearing subobject. An alias performs no additional initialization. Destruction/copy/serialization must use physical slot identity, never count an alias as extra storage.
10. Actor state is sealed. Inheriting/aliasing an actor's state does not create an alternate access path around critical-read/critical-write and the associated borrow/suspend rules. An implementation lacking a proof of those rules must fail closed.

### Required diagnostics (proposed categories)

- `E_AMBIGUOUS_MEMBER`: unresolved unqualified inherited field collision.
- `E_ALIAS_TARGET`: unknown/non-ancestor/ambiguous ancestor route, missing member or wrong target kind.
- `E_ALIAS_VISIBILITY`: private/inaccessible inherited field.
- `E_ALIAS_DUPLICATE`: duplicate alias or collision with class member namespace.
- `E_ALIAS_OWNERSHIP`: alias use would violate move/borrow/mutability/actor authority.
- `E_UNSUPPORTED`: inherited state/constructors/layout not yet implemented on a backend. Existing backend diagnostic categories can differ until conformance migration.

Diagnostics must be positioned at the offending alias or member access and must prevent guest code emission. No backend may quietly desugar an unsupported inherited-field alias into a fresh local field.

## Scope and evidence

This is a **source-language target**. The current `atto-lang/atto-source.rs` source-local nominal lowerer explicitly rejects inherited fields and constructors with `E_UNSUPPORTED`; its successful method-diamond preview tests are **not** evidence for this feature. No full-Java, LLVM, .NET, Forge, native AOT, or Wasm guest parity claim is made.

The companion `conformance/inherited-field-aliases-v1.json` enumerates positive and negative source cases, all `NOT_EXECUTED`. A source-free registry check can verify that those authored cases are internally consistent, but only real pinned compiler/guest executions can advance their evidence status.

### Admission milestones

1. Parser + formatter AST round-trip and exact diagnostic spans; ensure `Dog.age` is accepted in this declaration position and `Dog::age` rejected.
2. Nominal member origin, protected visibility, generic substitution, duplicate aliases, and diamond path tracking at static check time.
3. Verified base-object layout, initialization/destruction, ownership/moves, and callable method-override consistency.
4. Execute two-independent-slot guest fixture and rejected-case matrix on exact source heads for each advertised backend, including an AOT run when AOT is claimed.
