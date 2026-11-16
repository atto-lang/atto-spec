# Failure capability interfaces: Throwable, Raisable, Panicable (AttoLang v1 candidate)

**Status:** normative candidate; **not** a claim of executable source or backend parity. Browser Rust/Wasm currently lowers only the restricted `throw Error(string)` path. Source `raises`, `panics`, effect clauses, general class/interface resolution and recovery are not yet verified as executable.

## Core nominal contracts

The core library exposes three distinct, nominal, marker **interfaces**:

```atto
// Informative core declarations. User source imports these, never redefines them.
define pub interface Throwable as
end

define pub interface Raisable as
end

define pub interface Panicable as
end

// Built-in Error implements all three for existing source compatibility.
define pub class Error implements Throwable, Raisable, Panicable as
  // Core error identity, message and optional explicit trace capture.
end
```

No user-defined type can masquerade as these compiler/core types via a same-named local declaration. Marker interfaces carry no methods in v1; they are **not** runtime control signals. A subclass of `Error` inherits its three interfaces under normal nominal inheritance. Separate interface names allow the compiler to check each effect independently, and future library-defined families can refine the model without conflating unwind behavior.

**The Error constraint remains mandatory:** each `throw`, `raise`, or `panic` operand must be a statically known instance of `Error` or a subclass **and** implement the matching interface. Implementing the interface on an unrelated type does not make it throwable/raisable/panicable. No structural duck typing, numeric/string auto-conversions, or hidden boxing.

| Source operation | Statically required type | Control flow |
| --- | --- | --- |
| `throw value;` | `value <: Error` and `value : Throwable` | Nearest eligible `catch` or caller-side `trap`, then only if unhandled `recover` |
| `raise value;` | `value <: Error` and `value : Raisable` | Bypass `catch`/`trap`; eligible `recover` |
| `panic value;` | `value <: Error` and `value : Panicable` | Bypass `catch`/`trap`/`recover`; supervisor CONTROL / root fatal |

A successful static capability check **never changes the meaning of the operation**. A typed `raise` cannot be caught as a `throw`, and a `panic` cannot be recovered locally. Host fatal faults, allocation failures, cancellation and runtime traps are not source-level `Panicable` values and must never be relabeled as a user-supplied error.

## Effect declarations and checking

`throws(T)`, `raises(T)`, and `panics(T)` name the *upper bound(s)* of the corresponding source effect, not an instruction to convert the error. Each named `T` must resolve to an `Error` subtype satisfying the matching nominal interface; `throws(int)`, `raises(string)`, `panics(object)` and `throws(UnrelatedButThrowable)` are errors. Duplicate entries and unresolvable types are errors.

At each operation the checker must:

1. Type-check the expression exactly once without runtime coercion.
2. Require the matching interface and `Error` ancestry, including for variables, function results, unions, generic instantiations and inherited members. A union is eligible only if **every** possible alternative satisfies the requirement.
3. If an explicit effect clause exists, prove the actual emitted error type is assignable to one of that clause's listed types. Inference may supply missing clauses for functions where annotations are optional; inference must not override an explicit bound. Public APIs may choose a stricter explicit-effect policy independently.
4. Enforce `pure` and caller effect constraints transitively; unsupported generic/effect inference must fail closed.
5. Preserve the original error type, identity, message and source operation across the unwind and across actor/task boundaries.

Use a distinct `E_FAILURE_TRAIT` diagnostic for an operand missing `Throwable` / `Raisable` / `Panicable`; use `E_EFFECT_TYPE` for a malformed or violated declaration. Legacy subset compilers may continue to report `E_TYPE` or `E_UNSUPPORTED` **until they implement this profile**, but must not silently accept an invalid program.

## Example

```atto
fnc checked_value(bool valid): int throws(Error) {
  if !valid then
    throw new Error("invalid value");
  fi
  return 42;
}

fnc escalate(): void raises(Error) {
  raise new Error("escalated");
}

fnc fatal_error(): void panics(Error) {
  panic new Error("unrecoverable");
}
```

The following are **negative conformance cases**, not executable playground demonstrations:

```atto
throw "bad";                 // missing Error and Throwable
raise 123;                   // missing Error and Raisable
panic false;                 // missing Error and Panicable
// Even an unrelated class implementing Throwable is not an Error.
throws(int)                  // invalid effect declaration type
raises(Error) { throw ...; } // no implicit conversion from throw to raise
```

Future implementations should test each operation with base `Error`, an inherited `Error` subclass, a nominally conforming non-`Error`, a scalar, an unknown type, an invalid union, and a mismatched declared effect. Run positive and negative guest compile tests on the exact compiler head before claiming parity. No preview example or syntax-only test counts as a guest execution.

## Compatibility and admission

This contract refines the Error-only rule in [defer/recover/unwind v1](defer-recover-unwind-v1.md); it does **not** authorize arbitrary interface-bearing non-Error values. For current native Rust/Wasm compiler behavior, `throw Error("message")` remains the supported restricted spelling; `new Error(...)` and advanced clauses in the example are illustrative until independently admitted. Do not mark this capability as shipped in the public playground without parser, checker, ABI, guest unwind and error-supervision evidence.
