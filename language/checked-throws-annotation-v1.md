# AttoLang checked failure declarations — Java-style clauses and annotations (v2 proposal)

**Status:** proposed normative grammar, not verified compiler/parser acceptance. This revises v1 to accommodate unparenthesized Java-style typed clauses, PascalCase annotations, return-type placement, and newline-delimited `end` bodies. Do not infer Java/Scala semantics were implemented in Atto. Browser Rust draft [atto-source.rs#301](https://github.com/atto-lang/atto-source.rs/pull/301) currently handles a narrower lowercase, parenthesized subset on an unmerged effect-checker branch; all additions here must fail closed until implemented.

## Three independent failure kinds

- `throws` is an ordinary, catchable `throw` effect. A matching `try/catch`, caller-side `trap` to must-handle `Result`, or a compatible caller declaration accounts for it.
- `raises` is an escalation (`raise`), bypasses ordinary `catch` and `trap`, and is discharged only by an eligible `recover` or a compatible `raises` declaration. Unrecovered raise escalates to panic according to its enclosing execution boundary.
- `panics` denotes panic effects; an actor must not intercept its own panic, and the supervisor receives CONTROL notification. A `panics` signature is **not** permission to catch or suppress panic.

For each kind, a declaration publishes a typed **upper bound on the effects that may escape**, not a claim that the callable handled those failures. `Result<T,E>` and `Option<T>` are return *values*, distinct from effects. `?` propagates checked returned errors, not ordinary exceptions. `trap` only transforms ordinary throws; it must not swallow raise/panic. These rules are independent of purity and suspension effects.

## Canonical syntax and equivalence

Canonical new source spells annotation names `@Throws`, `@Raises`, `@Panics` (PascalCase) and declares suffix effects as **unparenthesized** Java-style type lists. All are case-sensitive, compiler-owned resolved identities. Preserve v1 lowercase `@throws` / `@raises` / `@panics` and `throws(Error)` / `raises(Error)` / `panics(Error)` as **legacy accepted input only where already implemented**; the formatter normalizes them when semantic equivalence has been established. Do not allow a user annotation to shadow compiler-owned names.

```atto
@Throws(IOError, ParseError)
@Raises(RecoveryError)
pub fnc load_config(string path) -> Config {
    return parse_config(read_file(path));
}

pub fnc load_config(string path) -> Config
    throws IOError, ParseError
    raises RecoveryError {
    return parse_config(read_file(path));
}

pub fnc load_config(string path)
    throws IOError, ParseError
    raises RecoveryError -> Config {
    return parse_config(read_file(path));
}
```

All three are expected to normalize to one typed callable effect summary:

```text
returns: Config
throws: {IOError, ParseError}
raises: {RecoveryError}
panics: {}
```

An annotation applies to the *next* callable declaration, not a class, overload set, following method, local variable, or constructor. Free `fnc` and `routine`, inline and out-of-line instance methods (`mtd`, `method`, bare), class statics and typed actor `receive` map to their precise AST targets. Caller-visible effect checking of actor receives is allowed **only** when the backend implements the required runtime supervisor boundary; otherwise fail closed with no artifact.

### Explicit empty annotations

`@Throws()` / `@Raises()` / `@Panics()` declare an **empty permitted effect set for that specific kind**. They are not "effect unknown", wildcard, suppression, or permission grants. For example:

```atto
@Throws()
@Raises()
pub fnc safe_operation() -> int {
    return 42;
}
```

An escaping `throw` or `raise` in this function is a compile-time error. A panic is not ruled out by either annotation; only `@Panics()` would explicitly assert no escaping panic, within the modeled and statically checkable panic domain. An absent clause on a public API is **not** equivalent to an explicit empty proof. Private helpers may use bounded effect inference; public exported signatures require a checked explicit upper bound or an explicit no-effect assertion according to the published-profile policy.

### Failure types and subtype checking

Each listed error must be a nominal `Error` subclass satisfying the corresponding `Throwable`/`Raisable`/`Panicable` contract. Type aliases, generics, nested generic type constructors and imports must be resolved before checking ancestry and type arguments. The listed types are upper bounds; an escaping subtype is covered by its declared supertype. Canonicalize duplicate types **within one kind** by identity only after validation (diagnose duplicates or redundancy according to formatter policy); never merge `throws` and `raises`. Multiple declarations **of the same kind** (annotation + clause, two clauses, alias spellings) are errors even when identical. Different kinds can coexist.

When overriding an inherited method or implementing a callable interface, the override's checked failure upper bound must not be wider than the base contract for **each** kind. The same rule applies to callback/function values (contravariant effect requirements): a callback with more escaping failure effects cannot silently satisfy a context expecting fewer. A generic callback may use explicit effect variables, erased capabilities and scoped proofs, but a capability inferred inside catch/recover scope cannot escape in a retained lambda or task. No implicit universal "can throw anything" capability is allowed in verified/sandbox profiles.

## Deterministic signature grammar

The following is abstract grammar; `type` must be parsed by the **existing balanced, grammar-aware type parser** rather than a regex (nested generics, function arrows, union types and parentheses are legal where otherwise supported).

```ebnf
failure_kind        = "throws" | "raises" | "panics" ;
failure_type_list   = error_type, { ",", error_type } ;
failure_args        = "(", [failure_type_list], ")" ;
failure_clause      = failure_kind, (failure_type_list | failure_args) ;
failure_annotation  = "@", ("Throws" | "Raises" | "Panics"
                         | "throws" | "raises" | "panics"), failure_args ;
return_before       = ":", type | "->", type ;
return_after        = "->", type ;
callable_signature  = callable_head, [return_before],
                      {failure_clause}, [return_after] ;
explicit_body       = "{", statements, "}"
                    | "begin", statements, "end"
                    | "as", statements, "end" ; (* existing Atto form *)
shortcut_body       = HARD_NEWLINE, statements, "end" ;
```

`return_after` is permitted **only** if no `return_before` or prefix `T•` return type is present. Otherwise diagnose `E_RETURN_TYPE_CONFLICT`. A signature can have at most one declared result type and each failure kind occurs at most once. Any `return_after` must be **the last header construct**: reject `throws`, `raises` or `panics` after it with `E_EFFECT_ORDER`. A return type before the effect list may be `: T`, `-> T` or the independently specified prefix `T•` syntax. A return type after the effect list always uses `-> T`.

Any signature may use an explicit `{...}`, `begin ... end`, or existing valid `as ... end` body. In the *new* inline-effect forms, an unadorned `... end` body **without** `begin` is admitted **only** if the signature ends in a trailing `return_after` and is separated from its first statement by a hard newline outside all balanced type delimiters. Comments and blank lines may intervene. The newline must be tokenized even when normal whitespace is discarded elsewhere. `{` and `begin` unambiguously take precedence over this shortcut; a newline cannot turn an incomplete return type into a body.

Legacy declarations **without** any new inline effects keep their preexisting body syntax and formatting. A formatter may not remove `begin` or `as` based on indentation guesses.

## All of these are valid design-intent forms

```atto
// A: prefix type, explicit begin/end
pub Config• load_config(string path)
    throws IOError, ParseError
    raises RecoveryError
begin
    return parse_config(read_file(path));
end

// B: prefix type, braces
pub Config• load_config(string path)
    throws IOError, ParseError raises RecoveryError {
    return parse_config(read_file(path));
}

// C: return-before effects, braces
pub fnc load_config(string path) -> Config
    throws IOError, ParseError raises RecoveryError {
    return parse_config(read_file(path));
}

// D: return-after effects, no begin (HARD_NEWLINE mandatory)
pub fnc load_config(string path)
    throws IOError, ParseError
    raises RecoveryError -> Config
    return parse_config(read_file(path));
end

// E: return-after effects, explicit begin
pub fnc load_config(string path)
    throws IOError, ParseError
    raises RecoveryError -> Config
begin
    return parse_config(read_file(path));
end

// F: annotation-only; old non-inline body forms remain available
@Throws(IOError)
@Raises(RecoveryError)
pub fnc load_config(string path) -> Config {
    return parse_config(read_file(path));
}

// G: generic nominal failure types, generic returned Result value
pub fnc load_config<T: Serializable>(string path)
    throws IOError, ParseError<T>
    raises RecoveryError -> Result<T, ConfigError>
    const data = read_file(path);
    return parse_config<T>(data);
end
```

The generic example is syntactic intent; `ParseError<T>` must actually extend `Error` under all admitted substitutions. A `return Err(ConfigError())` path does **not** count as `throws ConfigError`.

## Mandatory negative gates

1. `@Throws(X) fnc f() throws X` and `@throws(X) @Throws(X) fnc f()`: duplicate same-kind effect, even when identical.
2. `@Throws() fnc f() { throw X(); }`: effect bound violation (or incomplete proof). Likewise for `@Raises()` and `raise`.
3. `@Throws(string)`, unknown error types, confusing user-defined `atto.core.Throws`, malformed generics, nonconstant annotation arguments: fail before emission.
4. Any `throws ... raises ... -> T throws ...`: `E_EFFECT_ORDER`; multiple return types: `E_RETURN_TYPE_CONFLICT`.
5. `fnc f() throws X` followed by unbraced body without `begin`: `E_BODY_DELIMITER`. An implicit shortcut missing `HARD_NEWLINE`: `E_BODY_NEWLINE`.
6. Absent effect proof for an imported/foreign/virtual call: reject or explicitly require a trusted effect contract. Do not presume purity.
7. Overrides widening throws, raises, or panics beyond the base method: fail before lowering.
8. Nonexecutable actor receive, foreign unwinding, and continuous pipeline support must reject rather than silently claim semantics.

## Propagation and verified boundaries

`Γ ⊢ expr : T ! {throws: E, raises: R, panics: P, suspends: S}`. A typed ordinary catch removes covered `throws` variants only; `trap` converts ordinary throw effects into `Result<T,E>` and does not erase raise or panic. `recover` removes covered `raises` variants only; a panic never becomes ordinary throw. Cleanup (`defer` / `finally`) is effect-checked too, including masking/ordering and suppressed failures if the runtime supports them. All returned `Result.Err`/`Option.None` and asynchronous pipeline completion outcomes carry independent must-handle obligations.

For `|>` and `<|`, union callable/callback effects; for `pipe` / `rpipe`, check stage setup **and** completion `await get_done()`, preserving actor supervisor CONTROL notices. For asynchronous tasks and actor messages, keep capability lifetime and ownership/borrow rules; a local catch or permission does not authorize a callback to escape its region.

A public entrypoint must discharge residual ordinary throws and raised faults through declared runtime boundary policy; an actor panic is delegated to supervisor CONTROL. "Every error handled" means every **modeled error accounted for** under a stated trusted FFI/host/runtime assumption set; it does not prove arbitrary recovery correctness or prevent hardware failures.

## Compiler and test rollout

- Implement lexer/header parser with newline spans, clause/annotation alias resolution, return position tracking and precise diagnostics. Verify parse/format/reparse equivalence and equality of resulting typed signature rows.
- Expand Rust compiler draft #301 from parenthesized lowercase effects to canonical Java-style and PascalCase forms. Integrate with latest `Result`/`trap` and checked callable-value/actor contracts before release.
- Execute positive **real compiler** native/Wasm guest fixtures and negative no-artifact cases for multiline generic types, prefix/colon/arrow returns, methods, statics, annotated empty sets, errors in pipelines and actor boundaries. Extend to Java JVM/Graal Native Image, LLVM native, .NET Native AOT and Forge on verified source commits; unsupported cases stay NOT_EXECUTED/UNSUPPORTED.
- Source-only JS or Python reference tests may validate structural grammar, but **must not be counted as production parser tests, compiler checks, full proof or backend parity**. Run alternate private SHA-exact Git mirror CI if the source org cannot admit real Actions job steps.
