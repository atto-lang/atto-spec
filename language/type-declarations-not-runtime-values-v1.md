# Type declaration/value separation (v1)

**Status:** normative source-language rule. No claim of independently verified backend parity until exact-head compiler tests execute.

## Rule

Class, trait, interface and type-alias declarations inhabit the compile-time **type namespace**. A declaration itself is not a runtime value, a heap object, a callable, or a transferable actor capability. This applies equally to `fnc`, `routine`, methods, lambdas, actor messages, generic value arguments, returns, fields, containers, and inferred local bindings. No backend may silently materialize a host-language `Class`, reflection handle, witness registry, descriptor pointer, dynamic proxy, or untyped object in those places.

**Crucial distinction:** `Person` in a type position denotes the class type, while `new Person()` is a runtime **instance** of that class. Consequently `fnc make(): Person { return new Person(); }` and `fnc read(Person person): int { ... }` are valid subject to ordinary ownership/visibility checks. This rule must not be misimplemented as a ban on class-typed parameters or returns.

A trait/interface name denotes a type-level constraint/contract. Implementations can be used through statically admitted generic bounds or concrete types. A *bare declaration* is not a value. Ordinary bare trait-typed runtime values are not implicitly dynamic existential/trait objects; an explicit, separately specified trait-object representation would need a proved dispatch ABI, ownership, sendability, lifetime, and backend lowering before admission.

Allowed type-only uses: signatures, bounds, aliases, type arguments, `is`/type tests and static type metadata as governed by their own syntax. A class name may act as the **compiler-only static-member receiver** in `Person.create()` or `Person.factory`, if the selected member is separately admitted as a runtime callable. The receiver itself never escapes as a value.

## Positive cases

```atto
define class Person as
  pub static fnc answer(): int { return 42; }
end

fnc create_person(): Person { return new Person(); }
fnc consume(Person person): int { return Person.answer(); }
fnc main(): int { return consume(create_person()); }
```

## Rejected cases

```atto
fnc bad_return(): Person { return Person; } // TYPE_NOT_VALUE
fnc bad_argument(): int { return consume(Person); } // TYPE_NOT_VALUE
fnc bad_inferred(): void { val object = Person; } // TYPE_NOT_VALUE
fnc bad_statement(): void { Person; } // TYPE_NOT_VALUE

define trait Printable as end
fnc bad_trait(): void { val escaped = Printable; } // TYPE_NOT_VALUE
```

## Required diagnostics and enforcement

1. Resolve each identifier in its correct namespace, respecting lexical **value** shadowing. A class/trait/alias spelling by itself is never proof of a runtime value.
2. Type-check **all** runtime-value sinks: ordinary arguments (including unknown/generic), returns, inferred/annotated bindings, assignments, aggregate elements, actor messages, closures and builtin/variadic calls.
3. Reject type declarations as runtime values with stable category `TYPE_NOT_VALUE` before backend IR, optimization, bytecode, native AOT or Wasm output. Never treat `Unknown` / `Any` as a bypass.
4. Preserve permitted class static-member dispatch and construction; do not reject valid class-typed instances.
5. For traits, interfaces and aliases, never silently invent reflection, dynamic-witness or existential values; fail closed for still-unimplemented trait-object profiles.
6. Check that source diagnostics are consistent through `fnc`, `routine`, lambdas and method bodies. Run actual compiler-positive and compiler-negative tests per backend, not just textual contract checks.

This rule is orthogonal to type-first callable syntax, explicit return requirements, generic specialization and checked ownership/borrowing.
