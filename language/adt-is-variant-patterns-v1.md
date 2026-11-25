# Nominal ADT constructor patterns with `on is` — v1 target

**Status: proposed grammar/type-checking contract, not proof of cross-backend execution.** This chapter is constrained to the existing sealed built-in `Option<T>` and `Result<T,E>` ADTs. It adds an alternative **pattern spelling**, not new runtime type reflection, generic instantiation, Scala-style extractors, dynamic dispatch, or an implicit result unwrap.

## Grammar

```ebnf
adt_arm             = "on", ( old_adt_pattern | new_adt_pattern ),
                      [ "when", expression ], "->", arm_body ;
old_adt_pattern     = "None" | "Ok" | adt_ctor, "(", pattern_binder, ")" ;
new_adt_pattern     = "is", ( "None" | "Ok" |
                       adt_ctor, "<", pattern_binder, ">" ) ;
adt_ctor            = "Ok" | "Err" | "Some" ;
pattern_binder     = source_binding_name | "_" ;
```

The productions above are illustrative of the local pattern grammar; `is` is consumed **once**, before a constructor. The required accepted spellings are:

| New spelling | Existing equivalent | Subject type |
| --- | --- | --- |
| `on is Ok<value>` | `on Ok(value)` | `Result<T,E>`, `T` non-void |
| `on is Ok<_>` | `on Ok(_)` | `Result<T,E>`, including `T=void` |
| `on is Err<error>` | `on Err(error)` | `Result<T,E>` |
| `on is Some<item>` | `on Some(item)` | `Option<T>` |
| `on is None` | `on None` | `Option<T>` |
| `on is Ok` | `on Ok` | `Result<void,E>` only |

The angle brackets are **pattern binder delimiters**, **not generic type arguments**. `on is Ok<line>` binds `line: T`, without asserting that the payload has the nominal type `line`. The binder `_` discards a payload without creating a variable or erasing an enclosing `Result`. For a void success payload, `Ok<_>` is a permitted discard spelling, but `Ok<value>` is an arity error.

There is no `Ok<Some<item>>` support in this v1 syntax: use nested matches for `Result<Option<T>, E>`. A `Result<Option<string>, IoError>` read never becomes a bare string, and `None` (EOF) is not `Some("")` (empty line).

## Exhaustiveness, evaluation and security

- Exactly one scrutinee evaluation, left-to-right first-matching-arm semantics, sealed nominal variant identity (never a user-defined `Ok` constructor with side-effecting `unapply`), and type-checked binding only after successful tag match.
- Duplicate `Ok`, `Err`, `Some`, or `None` arms are unreachable regardless of spelling. Guards do not establish coverage unless unguarded arms also cover every possible tag. A complete unguarded two-tag match is exhaustive.
- Reject unsupported constructors, wrong ADT families, wrong payload arity, empty binders, tuples/multiple binders, nested angle extractors, destructuring via dynamic reflection, or type-test impersonation. Diagnostics must be deterministic; invalid source must not emit a guest artifact.
- Binders do not cross arm boundaries and cannot circumvent ownership, borrowing, suspension, or TenantVM capability rules. `on is` changes syntax only; no host capability is granted by a match arm.

## Checked stdin nested example

```atto
pub suspends fnc next_text(): string using io, suspend {
  val input = stdio.in;
  val output = stdio.out;
  val prompted = writech output, "prompt";
  return match prompted over
    on is Ok<_> -> match << input over
      on is Ok<line> -> match line over
        on is Some<item> -> item,
        on None -> "",
      end,
      on is Err<error> -> "",
    end,
    on is Err<error> -> "",
  end;
}
```

The first `Ok<_>` checks a `Result<void,IoError>` write. The second `Ok<line>` checks the read's `Result<Option<string>,IoError>`; `line` is still `Option<string>`. `on is Some<item>` extracts the string only after the inner `Option` match. The example explicitly chooses `""` for EOF/error as an application fallback; this does **not** mean stdin returns empty text on EOF or errors.

Equivalent `readch input` and `<< input` spellings must produce the same typed outcomes and runtime behavior. Cross-backend acceptance requires real source compiler and guest receipts, not only this document or source-level parser recognition.
