# Struct field equals initializer — disambiguation contract v1

**Status: TARGET / NOT EXECUTED.** This candidate reconciles the existing `StructName{field: expr}` form with a narrowly scoped `StructName(field=expr)` field-initializer shorthand. It **does not** introduce `=` named arguments for general functions, methods, class/actor constructors, lambdas or dynamic calls.

## Existing contracts and provenance

- [canonical AttoLang language specification](https://github.com/atto-lang/atto-spec) reserves `label: expression` for named callable arguments; `T=Type` belongs to declared named type generics.
- Rust/Wasm `atto-source.rs` main currently supports a restricted nominal `StructName{field: literal}` form via `src/shape_lower.rs`, lowered to a checked class constructor; its parser's `parse_args` does not accept equals-labeled calls. These facts **do not** imply generalized struct literal or array support.
- [atto-source.rs PR #300](https://github.com/atto-lang/atto-source.rs/pull/300) proposes ordinary named calls using `label: value` with a restricted scalar-literal reorder until explicit source-order temporaries are implemented.
- [atto-source.rs PR #281](https://github.com/atto-lang/atto-source.rs/pull/281) changes nominal inference. Equal field sets do not justify guessing a declaration or bypassing scope resolution.
- [atto-spec PR #69](https://github.com/atto-lang/atto-spec/pull/69) separates inline `{field: expr}` structural records from maps and nominal structs. This proposal must preserve that distinction.
- [AttoLang target profiles](https://github.com/atto-lang/atto-target-profiles) connects these values to AoS/SoA/AoSoA collections without changing element syntax.

## Grammar and name-resolution gate

```atto
define struct Particle as
    int x;
    int y;
end

val p = Particle{x: 10, y: 20};  // existing field literal form
val q = Particle(x=10, y=20);    // proposed explicit struct field shorthand
```

The tokens `IDENT (` alone must **never** authorize aggregate construction. The compiler first resolves the identifier in the exact expression scope to an eligible **nominal struct type declaration with compiler-generated field initializer** (including module-qualified types when supported). It must prove no shadowing local/parameter/function/constructor/callable, imported alias ambiguity, competing overload, user-defined constructor, or visibility conflict changes the meaning. A local value named `Particle` must not silently fall back to the struct after an invalid call. A class, actor, record, enum, `Map`, `Tuple`, static function, FFI binding, callable value or dynamic target is not eligible.

**Compatibility with existing Java frontend forms:** `infer struct{...}` and `struct{field: Type}{field: value}` already have separate semantics in the Java language/grammar. This shorthand MUST NOT rewrite either to `StructName(...)`, infer a nominal struct from field-name coincidence, or accept a compiler-generated *lexical inferred-type alias* as a globally callable constructor. Transparent type aliases do not introduce new constructors. Module qualification and alias traversal are allowed only after the resolved declaration graph proves the same eligible nominal initializer and visibility; an unresolved import is never an implicit constructor.

For a proven field-initializer, accept only comma-delimited `name = expression` pairs, with at least one named pair for nonempty struct (zero-field `Particle()` is a separate, existing-constructor question). Do not mix positional operands, `name:` entries, spreads, calls or destructuring as field selectors inside this spelling. Field names are statically declared identifiers, never runtime strings or arbitrary expressions. No syntactic fallback to assignment expressions (`x = 10`), record field labels, `=>` map entries, equality `eq`/`==`, or named generic arguments.

Ordinary call binding, even for an explicitly declared `constructor`, remains `name: expression` where named calls are supported; `new Particle(x=10)`, `make_particle(x=10)`, `obj.update(x=10)`, `fn_ref(x=10)` and `spawn Worker(x=10)` are **not** new named-argument spellings. If ambiguous or unsupported, reject before invoking any argument or producing guest IR. A parser may preserve an unresolved candidate syntax node, but checker resolution must fail closed. A lexer-token text substitution from `name=` to `name:` is prohibited.

## Evaluation and type/ownership discipline

For both `Particle{x: expr, y: expr}` and `Particle(x=expr, y=expr)`, resolve fields by exact nominal declaration; reject duplicates, unknown, private/inaccessible, missing required, and wrong-type fields. Defaults are allowed only if a validated struct declaration actually declares supported field defaults; never fabricate zeros or reorder default evaluation. Preserve source spelling and each expression's source span. Evaluate supplied expressions **once and in lexical source order** into checked temporaries, then move values into declaration-order storage. Never sort expression evaluation by field name. If expression effects, ownership moves, borrow lifetimes, exception unwinding, or default initialization order cannot be preserved on a backend, return an explicit unsupported diagnostic and emit **no artifact**.

```atto
// Must evaluate next_y() before next_x(), while still storing in x/y fields.
val item = Particle(y=next_y(), x=next_x());
```

Both spellings have identical logical struct values, nominal identity, field visibility and actor ownership. They do not alter outer `Array<T, layout=soa>`, storage ABI, padding, serialization, drop order or identity. Avoid using the existing literal-only `shape_lower` BTreeMap ordering as a proof that arbitrary effects are safe.

## Regression matrix and admission

Positive targets: known nominal struct `Particle{x:1,y:2}`; `Particle(x=1,y=2)`; reordered fields with side effects evaluated in original order; nesting inside `Array<Particle, layout=soa>` once executable; module-qualified unambiguous struct; formatter token-preserving round trip.

Negative targets: ordinary function/method/class constructor/actor spawn/closure with equals; a local `Particle` value shadowing a nominal type; ambiguous same-name import; `Particle(x=1,x=2)`; unknown/missing/private fields; `Particle(x=1,2)`; `Particle(x:1,y=2)`; `new Particle(x=1)`; `x=1` inside an ordinary call; value `Particle(x=1)` when the name resolves to a nonstruct; duplicate after type aliases; source-expression effect or ownership gate failure.

The formatter MUST NOT rewrite `x=1` inside parentheses to `x:1` or vice versa without independently proven semantic equivalence and round trip; default policy is **preserve spelling**. The parser must distinguish the three uses of `=`: assignment/declaration in appropriate grammar slots, **declared** named generic binding, and statically checked struct field shorthand.

Do not claim successful implementation until exact-head real compiler parse/type-negative tests, actual compiled guest execution of the scalar form, original evaluation-order oracle, and independent compatible backend evidence. A test whose runtime is blocked by unimplemented SoA storage is `NOT_EXECUTED`, not `PASS`. No automatic merge or rewriting of the draft named-call PR is authorized by this contract.
