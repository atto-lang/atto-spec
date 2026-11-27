# Type declarations and definitions (proposed v1)

Status: **normative syntax proposal; backend emission is NOT yet certified**. This contract separates parsing, linking, type checking, and runtime representation. Implementations must not report "compiles" after only parsing.

## Distinction

`declare` introduces types only, never free functions, mutable or immutable value bindings, methods or constructors. A resolved complete type-only declaration is usable as a type; a header-only nominal class can be completed by the checked namespace attachments described in the [namespace completion amendment](out-of-line-receivers-constructors-and-state-v1.md#namespace-completion-amendment-2026-11-27). A second `define class` block is not required in that profile. Neither form makes a runtime type value. The older matching declaration/definition rules below remain applicable to explicit pairs in their compatibility profile.

- `declare type NAME = TYPE_EXPR;` introduces a *signature / contract* for a type. The right-hand side is a constraint on the eventual definition, **not** a value assignment or runtime object creation. A declaration may refer to a type resolved later in the same module or from an explicit import. Standalone unresolved declarations do not prove successful linking.
- `define type NAME as TYPE_EXPR;` introduces a *definition*. The `as` token is required. The type is available to the type checker after successful name resolution and semantic validation.
- `=` MUST NOT replace `as` in a definition; `as` MUST NOT replace `=` in a declaration. No implicit mixing or normalization between the two declaration kinds.
- A single declaration and matching definition may share a name; there must be at most one of each per scope. Contract mismatch is an error. An unchecked or unlinked declaration does not count as a defined type.

## Examples (intended to be accepted by a fully conforming implementation)

```atto
define type Foo as bool | int
declare type Foo = bool | int

define type Bar as interface Z {
}

define type Bar2 as trait T {
}

declare type Star = Z;
```

The first two declarations describe the **same type contract**: `Foo` is defined, and the declared union matches its definition. Names used by the same snippet must not conflict with any other local definition.

`define type Bar as interface Z {}` introduces one nominal interface `Z`; `Bar` is an alias of **that same nominal identity**, not a second unrelated nominal type. `define type Bar2 as trait T {}` follows the same rule for a trait, with distinct trait semantics. An empty body is legal. A nominal declaration name can be referenced directly as `Z` or `T` within its visibility scope. Collisions with other types, aliases, and inline nominal declarations must be checked.

`declare type Star = Z;` only requires syntactically valid `Z`; full success additionally requires the named type to resolve at the required link boundary. A declaration is not proof that `Z` exists.

## Grammar (simplified)

```ebnf
type_decl   = "declare", "type", IDENT, "=", type_expr, [";"] ;
type_def    = "define", "type", IDENT, "as", type_expr, [";"] ;
type_expr   = type_term, { "|", type_term } ;
type_term   = type_name | inline_nominal ;
inline_nominal = ("interface" | "trait"), IDENT, "{", { member }, "}" ;
```

This v1 grammar allows a missing final semicolon **only at end of file**, or after a complete braced inline body. Between consecutive unbraced declarations, the semicolon is required. Newlines alone must not be used to guess whether a union continues. The formatter emits semicolons on unbraced declarations and keeps `define ... as` / `declare ... =` unchanged.

This grammar defines surface syntax; generic instantiations, qualified references, nested type expressions, method bodies, and other `member` forms require their own versioned sub-grammars. An implementation missing them must emit `E_UNSUPPORTED`, never silently ignore members.

## Semantic requirements

1. `|` is a **type-level union** here, not boolean OR, bitwise OR, or a lambda delimiter. Whitespace is insignificant. Its member types must be resolved before code generation.
2. Unions are semantically commutative, associative, and idempotent for type identity: `bool | int` matches `int | bool`. Duplicate source arms can be rejected for clarity as `E_DUPLICATE`; the formatter must not silently alter runtime meaning.
3. A concrete value of a multi-member union requires a discriminator/representation strategy; a browser/native backend must reject unsupported union lowering rather than returning success. Do not conflate this with enum variants or dynamic `Any`.
4. `interface` introduces a nominal interface contract (required members, no implementation bodies). `trait` introduces a nominal trait, potentially with default implementations under a future member grammar. An empty interface or trait is a valid nominal marker.
5. Duplicate nominal names, duplicate alias names, incompatible declaration/definition contracts, invalid members, unresolvable references, illegal recursive aliases, or mismatched nominal kinds must fail closed.
6. Alias resolution must not permit accidentally forged builtin identities. Defining or declaring a type with the same name as a builtin is an error.
7. The visibility and binding of inline nominal `Z` are the same lexical/module scope as `Bar`. `Bar` and `Z` denote the same nominal type identity. Cycles formed only by aliases are errors; recursive methods or explicitly supported recursive nominal types require separate validation.
8. Forward declarations are legal, but a backend must not generate executable code that depends on an unresolved declaration.

## Negative fixtures

```atto
define type Foo = bool | int;  // E_SYNTAX
declare type Foo as bool;      // E_SYNTAX
define type Foo as bool | ;    // E_SYNTAX
define type Foo as | bool;     // E_SYNTAX
define type Foo as bool || int;// E_SYNTAX
declare type A = bool; declare type A = int; // E_DUPLICATE
declare type X = bool; define type X as int; // E_SIGNATURE
define type B as interface Z { fnc f() { return 3; } } // illegal interface implementation
```

## Conformance and rollout

All backends and formatters must consume shared positive/negative fixtures. Report separate statuses: lex/parse, semantic check, link, guest/native codegen, runtime execution, and formatter round trip. A parse-only Rust/browser preflight is useful but **does not satisfy** a request that a snippet compile and execute. Rollout sequence: grammar + tests, symbol table/alias graph, union layout and conversions, interface/trait member typing, runtime and cross-backend parity.
