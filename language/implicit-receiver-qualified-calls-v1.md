# Implicit instance calls and explicit callable namespaces — v1

**Status:** Proposed normative lookup contract (2026-11-15). Existing Java drafts #2155, #3010 and #3013 are independent implementations under review. This specification and its host-only oracle do **not** prove a compiler, GraalVM, or Native AOT execution pass.

## Core rule

Inside an instance method, a *direct* unqualified call `name(args...)` resolves as `self.name(args...)` when no lexical binding owns that name and the current lexical receiver type has an accessible instance-method family with that name. Explicit `self.name(...)` remains supported. This is a static resolution rule, not runtime reflection or first-class method binding.

```atto
import fnc handle_state as remote_state from "./state_helpers.atto";

fnc handle_state(): int { return 40; }

define actor Counter as
    state { let int count = 0; }
    increment(): void {
        handle_state(critical-write |s| -> { s.count += 1; }); // compiler-owned self intrinsic
        self.handle_state(critical-read |s| -> { stdio.out << s.count; });
        imports::remote_state(); // named imported fnc (not the intrinsic)
        // pkg::handle_state() selects this file's root fnc where actor policy permits it
    }
end
```

The sealed-actor `handle_state` examples are **language targets**, not proof that the Java main compiler lowers `state { }` today. No frontend may translate them into ordinary unprotected field access or an unverified free-function fallback.

## Deterministic lookup for `name(args...)`

1. A lexical local, parameter, or captured callable/value binding named `name` owns the spelling. A noncallable shadow is a compile error, **not** a reason to search another scope. An unresolved arity/type mismatch also does not fall through.
2. Inside an instance method only, select the **entire effective instance-method family** of the lexical receiver type before file-root functions or imports. Do not choose a free function because the method family lacks the requested arity. Inherited methods must resolve with checked override/diamond-inheritance rules. The final implementation dispatch may remain virtual.
3. Otherwise select an accessible local file/module function using its statically proven declaration identity. Multiple imported packages or ambiguous flat module names must not be searched by source order.
4. Compiler-provided builtins/intrinsics are resolved by explicitly reserved rules, not as opportunistic userland fallback. `init`, actor `receive` ingress and other restricted lifecycle operations remain forbidden as direct guest calls.

The `handle_state` actor intrinsic is a special protected exception to (1): within a sealed actor, its bare and `self.` call spellings refer to one compiler-owned receiver-capability operation. The language rejects attempts to declare or shadow `handle_state` locally in such an actor; users cannot define a method, parameter, field, or local function value that forges state authority. Outside an eligible actor, a free function named `handle_state` remains an ordinary callable.

A static method, free function, constructor body, field initializer, or closure without an admitted lexical receiver cannot acquire an implicit `self` merely because a variable named `self` exists. An explicitly permitted lexical closure may call an instance method only when the receiver capture and lifetime are independently checked. A bare identifier `name` used as a *value* does not synthesize a bound method value; direct calls only.

## Reserved explicit qualifiers

- `pkg::name(args...)`: selects the **current source unit's file-root** callable family, regardless of local or method shadowing. This v1 spelling does not search every source in a package or an ambient filesystem. A future pinned package-wide namespace requires a separate versioned admission contract.
- `imports::name(args...)`: selects only an explicitly named `import fnc` binding from the current source unit, using the local alias when `as` is present. Wildcard imports, transitive dependencies and type-only imports do not gain an implicit callable binding.
- Other statically authorized namespace/type aliases may use `alias::name(...)` only when a verified namespace/type identity exists. `object.name(...)` remains ordinary member dispatch, not this namespace operation.

`pkg` and `imports` are compiler-owned `::` selectors, not runtime variables. A local variable named `pkg` or `imports` cannot redirect `pkg::` or `imports::`. A missing name, wrong arity, invalid export, hidden declaration, mismatched type/effect/ownership or absent import fails closed without searching a different namespace. The source spelling and resolved declaration identity should remain distinct in AST/MIR and AOT symbol provenance.

`imports::name` used as a value (for example `val cb = imports::name;`) is **not admitted** until a linked, first-class function signature establishes parameter, return, effect, ownership and lifetime contracts. An unchecked AST must also be rejected at the evaluator boundary rather than yielding an opaque imported callable. Direct `imports::name(...)` may be admitted only after the normal source/linker and capability checks.

## Actor security and compiler parity

- `handle_state` is recognized and lowered only with the compiler-owned sealed-actor receiver, selected critical read/write mode and checked state-loan callback. Preserve reader/writer exclusion, nonescape, anti-suspension and nested-borrow restrictions.
- An actor's existing same-file dependency-isolation rules are **not** waived by `pkg::`. Where this rule rejects actor access to file-root functions, the diagnostic must identify the explicit dependency boundary; use a separately authorized imported callable instead. A future policy change needs a capability proposal, not a namespace-lookup workaround.
- The parser must preserve `::` versus `.` provenance. Do not desugar a static qualifier to arbitrary runtime property access or rely on late string matching to detect it.
- The type checker, ownership/capture checker, evaluator, MIR/AOT linker and async/suspending call implementation must agree on the resolved declaration identity. Reject the call rather than running with different resolution in any one layer.
- Test full AOT call-site lowering (method vtable slot or direct symbol with verified receiver, and exact import/package target), not only interpreter name lookup.

## Required conformance

The checked-in `conformance/implicit-receiver-qualified-calls-v1.json` is a host-only resolution oracle and compiler fixture queue. Its `expected_binding` entries are **desired outcomes** and are not evidence that a backend accepts the syntax. For Java, LLVM, Wasm, .NET Native AOT, Forge and Rust, report four distinct statuses: passed, failed, unsupported and not executed, with exact source/tree/compiler SHAs and nonzero guest execution/test steps. In particular the sealed-state intrinsic requires actual owned-state lowering and may remain unsupported while ordinary implicit instance calls pass.

Do not merge overlapping Java drafts #2155, #3010 and #3013 without reconciling their collision precedence and carrying the namespace qualifiers into the selected implementation.