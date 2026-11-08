# Proposed AOT compile-time typeclass witnesses (roadmap #27)

STATUS: PROPOSED, source-free semantics model, NOT compiled AttoLang execution.

Typeclasses declare named required methods without runtime reflection. A coherent typed implementation binds one nominal type to one typeclass through concrete compiler-known method symbols. Witness resolution occurs after imports and nominal types are resolved, before closed-world monomorphization and native artifact emission.

Rules of the v1 candidate:

- Typeclasses and nominal types have named owning modules. An implementation must reside in the typeclass or nominal type's owner module; unrelated orphan modules cannot silently inject behavior.
- An implementation provides exactly every required method once, with method targets statically defined by the providing module; extra methods and implicit conversion are errors.
- Visible modules are an explicit bounded set from the compiler's resolved dependency graph. Exactly one matching visible implementation is required. Zero => missing; two or more => ambiguous at compile time, with no order-dependent fallback.
- Generated witness calls are typed direct symbols, not runtime type-name lookups, reflection, dynamic proxy creation, Java class loaders, .NET runtime generic codegen or JS dynamic dispatch.
- A witness must not be sent through actor channels/pub-sub as executable code. Static, immutable compiler metadata is not a Sendable function closure.
- Generic specialization is closed-world. The compiler must enumerate all concrete applications and reject unresolved type arguments, typeclass cycles and infinite specialization expansion.

The checked-in JS resolver and 7 versioned positive/negative vectors demonstrate compile-time *model* behavior, including orphan and ambiguity mutations. It does not parse .atto declarations or prove Java/LLVM/.NET/Wasm/Forge execution. Real backend integration must typecheck source, resolve witnesses through compiler IR and NativeAOT, produce deterministic native artifacts, and reject invalid programs before output with executed exact-head test steps.
