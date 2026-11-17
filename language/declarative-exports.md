# Declarative file-level exports

**Status:** Proposed normative AttoLang language contract. The Rust browser
frontend implementation is being reviewed separately in
[atto-source.rs PR #85](https://github.com/atto-lang/atto-source.rs/pull/85).
Do not treat this document as evidence of native-backend parity.

## Syntax

Both an inferred target kind and an explicit kind are valid:

```atto
define class Foo as
end

define class Bar as
end

export pub Foo;
export pub[pkg] class Bar;
```

The same exports may also appear at the **start of the file** (or between
top-level declarations):

```atto
export pub Foo;
export pub[pkg] class Bar;
export pub fnc compute;

define class Foo as
end

define class Bar as
end

fnc compute(int value): int {
  return value + 1;
}
```

```ebnf
export_decl = "export", export_visibility, [ export_kind ], identifier, ";" ;
export_visibility = "pub", [ "[", "pkg", "]" ] ;
export_kind = "class" | "fnc" | "actor" | "enum" | "module" ;
```

Named module exports obey the [namespace and module visibility contract](namespaced-exports-v1.md). `use namespace Name;` is a file identity header, not an exportable target; a public module does not implicitly publish its private members. Module-aware linker conformance is a **target**, not browser-backend proof.\n\nOther declaration kinds (for example `struct`, `record`, `trait`,
`interface`, or `type`) can join the `export_kind` set only when supported
by the corresponding declaration grammar and symbol-table contract. An
explicit `class` or `fnc` is **not required** when the named local
declaration can be unambiguously resolved.

## Semantics

1. Export directives are compile-time declarations, not statements or
   definitions. They are accepted anywhere at **top level** in a source file.
2. The compiler first builds the file's symbol table from *all* declarations,
   then resolves *all* exports. This permits forward exports and makes an
   export at the top semantically equivalent to one at the bottom.
3. `export pub Symbol;` uses the resolved declaration kind.
   `export pub class Symbol;` or `export pub fnc symbol;` checks the given
   kind against that declaration. Kinds must not be silently coerced.
4. `pub` exposes a symbol to importing packages; `pub[pkg]` exposes it only
   within the **same package identity**, regardless of physical file path.
   A file-level export supplies the exported visibility independently of the
   declaration's source position or its members' access modifiers.
5. Functions with several valid arity overloads export the full overload set
   under that name. Arity and type checking still happen at call sites.
6. Export names must refer to declarations in the owning compilation module
   scope. Imported symbols are not implicitly re-exported. Namespaces must
   not grant visibility into unrelated namespaces by unqualified name lookup.
7. Multiple exports of the same symbol within a scope are an error, including
   repeated exports with identical visibility; contradictory visibility
   declarations must not be silently merged.
8. Missing export targets, wrong explicit kinds, malformed visibility
   brackets, and illegal nested exports are compile errors. Diagnostics
   should identify the source position of the export.
9. `export` directives cannot be executable expressions and must not
   introduce hidden runtime initialization or reorder class/function bodies.
10. A compiler/linker targeting Wasm, native LLVM, Java/GraalVM or .NET must
    enforce `pub[pkg]` when resolving imports. Merely emitting an unguarded
    public Wasm export is *not* package visibility enforcement.

## Required conformance checks

| Case | Expected |
|---|---|
| `export pub Foo;` before `define class Foo` | Accept |
| The same export after `define class Foo` | Accept, identical resolved export |
| `export pub class Foo;` targeting a class | Accept |
| `export pub[pkg] class Foo;` targeting a class | Accept, package-visible |
| `export pub fnc foo;` targeting a function | Accept |
| `export pub foo;` targeting overloaded functions | Accept, preserve overload set |
| `export pub class foo;` targeting only a function | Reject: kind mismatch |
| `export pub Missing;` | Reject: unresolved symbol |
| Exporting the same symbol twice | Reject: duplicate export |
| `export pub[other] Foo;` | Reject: invalid visibility |
| Export inside a function or class body | Reject: invalid scope |
| Different package imports `pub[pkg]` symbol | Reject at link/import stage |
| Same package imports `pub[pkg]` symbol | Accept if otherwise valid |

## Multi-backend implementation criteria

A backend passes **syntax** when it parses the forms above. It passes
**semantic** conformance when forward resolution and negative diagnostics
are correct. It passes **linker** conformance only after cross-file and
cross-package visibility checks execute on actual compiled Atto source.

All test receipts should distinguish `passed`, `failed`, `unsupported`,
and `not executed`; parser-only or host-only tests are not native guest
execution proof.
