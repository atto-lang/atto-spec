# Linkage, local visibility, inheritance access and final fields

**Status:** Normative target semantics, not cross-file or foreign ABI
execution proof. Complements [namespaced exports](namespaced-exports-v1.md)
and [declarative exports](declarative-exports.md). A backend that cannot
enforce a modifier's meaning MUST reject the construct; it MUST NOT silently
lower it to a weaker modifier or treat metadata as an access-control proof.

## `internal`: file/module scope, not package publication

```atto
internal fnc local_answer(): int { return 42; }
pub fnc answer(): int { return local_answer(); }
```

An `internal` declaration is accessible inside its **own lexical source
module** and is not included in the export surface. It does not become
automatically visible in every file of a `use namespace` namespace.
`export pub fnc local_answer;` and
`export pub[pkg] fnc local_answer;` MUST be diagnosed as conflicts, not
promotions. `pub internal` and `internal pub` are contradictory.

Only `internal fnc` is admitted by the initial browser frontend. General
internal class, actor and module declarations require a separate grammar and
checked binder before they are executable.

`pub[pkg]` is the *package visibility* mechanism: the canonical package ID
must match at link time. `internal` is narrower and is not an alias.

## `external`: foreign linkage, never implicit public visibility

```atto
external fnc host_clock_ns(): int;
```

This is a **prototype**, not a definition. A foreign call is legal only when
a separately approved FFI manifest/linker binds its exact namespace, symbol,
signature, calling convention, target and capabilities. Symbol availability
on the host cannot grant a runtime permission or bypass AOT.

The browser frontend may parse an unused, bounded prototype but MUST reject
calls and attempted first-class references until the foreign ABI is actually
implemented. The prototype does not satisfy a file-level `export`, and
`pub external fnc` is not an accepted public-export shorthand.
Duplicate foreign prototypes are errors; an imported or foreign name cannot
forge a file-local declared export. A validated FFI may eventually require
explicit `export` for a *separately defined Atto wrapper* but not automatic
re-export of the foreign function.

## `protected`: inheritance access, never `private`

```atto
// Target after nominal inheritance and protected access checking are implemented.
define class Base as
  protected final int id: 7;
end
```

`protected` should permit only the controlled inheritance access specified
by the nominal class/subclass checker. It does not make the field public,
grant namespace-wide access, or grant actor-state access. A derived class
must satisfy the correct inheritance and receiver proof. No `protected`
symbol may be exposed by merely exporting the class.

Until the compiler has a checked subclass relationship, it MUST fail closed.
Lowering `protected final` to `private final` changes semantics and is
not a valid implementation.

## `final`: assignment discipline, not visibility or constant folding

```atto
define class Receipt as
  final int number: 7;
end
```

A final field may be initialized once and cannot be overwritten by methods,
constructors, aliases or imported code. `final` does **not** imply `pub`,
`protected`, package-visible, or compile-time constant. `const` adds an
independent compile-time-constant requirement. `final const` may be
formatter-canonicalized to `final` only when the constant check has
already established equivalence; unsupported spellings fail closed.

`final class` (non-inheritable nominal type) is a separate potential
declaration-level extension, not implemented by field `final` support and
not a synonym for `sealed class`, whose permitted-subclass set must be
statically checked.

## Required gates

| Attempt | Required result |
|---|---|
| Call file-local `internal fnc` from same lexical file | Accept in supported frontend |
| Export `internal fnc` as `pub` or `pub[pkg]` | Reject |
| Mark `internal` and `pub` together | Reject |
| Declare unused `external fnc` prototype | May accept in bounded frontend |
| Call or export unlinked `external fnc` | Reject with no guest artifact |
| `protected final` without subclass checker | Reject, never rewrite to `private` |
| Read initialized `final` field | Accept in supported frontend |
| Reassign `final` field in constructor or method | Reject |
| Grant protected or package access through exported class | Reject |

The [test registry](../conformance/visibility-linkage-final-v1.json) must
report separately lexical, binder, linker, and compiled-guest statuses.
Source receipts must include exact commit and tree SHAs; a failed or
not-started runner is `not executed`, never `passed`.
