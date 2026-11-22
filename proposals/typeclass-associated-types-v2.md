# Proposed typeclass witnesses v2: associated types and typed static calls

Status: **PROPOSED**, source-free reference and adversarial fixtures only. v1 proposal and its existing source-free tests remain valid. See atto-source.rs PR #510 for the first deliberately restricted browser/Wasm compiler implementation; it is not evidence for v2's general module coherence.

## Contract

1. Each typeclass has a unique fully-qualified owning module, a finite set of uniquely named associated types, and named required methods with exact parameter, return and effect signatures. Associated types are **types**, not runtime slots or dynamic values.
2. An implementation is eligible only if its defining module owns the typeclass or the nominal concrete type (or a deliberately specified, non-orphan built-in exception). The fully resolved/linked closed-world graph must contain **at most one** implementation per (typeclass, concrete nominal type). Import order and visibility must not select between competing instances. Required instance visibility is checked explicitly.
3. An implementation must bind every associated type and method exactly once. Associated bindings must be valid, finite closed types. Self-recursive and mutually recursive aliases without a finite canonical form are errors. Unknown types and extra or missing bindings are errors.
4. A method witness binds to one named compiler-known function whose complete **monomorphized** signature matches the method requirement after substituting Self, associated types and generic parameters. No implicit conversion, overload ranking, method-name search or extension-method fallback is permitted. Method calls lower to a directly referenced AOT symbol after static typechecking.
5. Typeclasses do not generate method dispatch objects or runtime reflection. No dynamic proxy, runtime dictionary/vtable, JIT specialization, string-based lookup, symbol fallback or actor-channel transmission of executable witnesses. Generic specialization and recursive associated-type projections must be bounded and cycle-checked.
6. Compile-time method dispatch does **not** authorize arbitrary method or operator overloading. Intrinsic operators remain explicitly typed by language rules; only named witnessed methods can be selected by the coherent solver. Typeclass constraints cannot bypass ownership, effects, capabilities, suspension or visibility checks.
7. A build fails **before publishing an artifact** if any reachable generic specialization lacks a uniquely resolved instance, associated type or exact target. Source-independent metadata plans are not proof of compiler execution.

## Source sketch

    define typeclass Mapper
        type Item;
        fnc map(Self, Item): Item;
    end

    define impl Mapper for int
        type Item = int;
        bind map = map_int;
    end

    fnc map_int(int receiver, int item): int {
        return receiver + item;
    }

    pub fnc main(): int {
        val result: Mapper::Item<int> = Mapper::map<int>(2, 40);
        return result;
    }

This restricted explicit-scalar spellings sketch is implemented by the new Rust/Wasm prelowerer. General generic constraints and associated projections such as T.Item are **future syntax work** and are not claimed executable by the model or any other backend. Bare top-level generic functions still require explicit return according to the AttoLang language rule.

## Reference vectors

The v2 JSON fixture, reference resolver and Node tests validate owner/coherence, method signature equality, associated-type substitution, recursive alias rejection, foreign/ambiguous instances, hidden metadata and no dynamic dispatch. They declare compilerExecutable=false and authenticated=false. Every backend must independently integrate real .atto parsing, typed HIR/MIR, import ownership, monomorphization, and direct symbol codegen, with actual compiled guest execution and no-artifact negative cases. Confirm exact Git SHAs and actual executed CI steps.

Open implementation gates:
- Rust/browser: inspect PR #510, bind source-local scalar witness IR into compiler and prove native-vs-browser byte and execution parity; then add module-aware scope and constrained generics
- Java/GraalVM and .NET NativeAOT: compile constrained generic calls into static method symbols, with reflection and runtime codegen prohibited
- LLVM and Forge: lower same typed witness to direct LLVM/native symbols with deterministic closed-world specialization
- Wasm/JS/other backends: do not claim parity from source-free catalog tests or parse-only acceptance

No changes to unrestricted overloading or generic implicit conversion policies are proposed.