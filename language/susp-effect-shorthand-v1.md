# Suspension effect spelling: `susp`, `suspends`, `⧖` and `∂` (v1)

**Decision:** `susp` is the preferred, canonical spelling of the suspension effect. `suspends`, `⧖` (U+29D6 WHITE HOURGLASS) and `∂` (U+2202 PARTIAL DIFFERENTIAL) are fully equivalent source-level aliases. `▽` is not an accepted marker. `#` is **not** a suspension marker. This contract changes spelling, **not** runtime behavior or effect permissions.

## Grammar and positions

```ebnf
susp_effect         = "susp" | "suspends" | "⧖" | "∂" ;
callable_modifiers  = [ "pub" ], [ "pure" ], [ susp_effect ] ;
named_callable      = callable_modifiers, ("fnc" | "routine"), name, signature, body ;
member_callable     = [ "pub" ], [ susp_effect ], ("mtd" | "method" | "fnc"), name, signature, body
                    | [ "pub" ], "static", [ susp_effect ], "fnc", name, signature, body ;
lambda              = [ susp_effect ], "|", [ params ], "|", [ ":", type ], "->", lambda_body ;
callable_type       = [ susp_effect ], "fnc", "(", [ types ], ")", "->", type ;
```

The word modifiers must be **whole identifier tokens**, not prefixes: `suspicious` and `suspπ` are unrelated identifiers. The two Unicode symbols are exact standalone effect tokens; never normalize lookalikes or rewrite strings/comments. Trivia and whitespace between tokens are insignificant; neither whitespace adjacency nor Markdown context changes the grammar. All four spellings map to one AST **suspending** flag. The source spelling must not affect overload resolution, ABI identity, permissions, scheduling, or code generation.

```atto
pub susp fnc fetch_data(): int { return await 42; }
pub suspends fnc old_fetch(): int { return await 42; }

define class Client as
    susp mtd read(): int { return await load_data(); }
    static susp fnc connect(): int { return await 42; }
end

const callback = susp |v| : int -> await process(v);
const callback_type: susp fnc(int) -> int;
pub susp fnc *gen values(): Generator<int> { yield 42; }
```

`*gen` and `gen*` generator spellings have their **separately defined** grammar. Suspension and generation are independent semantic dimensions: a generator does not become suspending merely from its generator marker, and `susp` does not make a callable a generator. Generator lowering must not silently drop either property.

## Canonicalization and diagnostics

* The formatter emits `susp` by default for all supported syntactic positions, including lambda literals and callable type annotations. A long-form style option may emit `suspends`. Formatting must be idempotent, preserve comments and source meaning, and ignore string literals.
* All four spellings are **mutually exclusive aliases** of one marker. Duplicate markers (including `susp susp`, `suspends susp`, `susp suspends`, `susp ⧖`, `⧖ ∂`, or `∂ ∂`) are compile errors. Do not silently deduplicate them.
* `pure` combined with any of the four spellings must be subject to exactly the same `pure`-effect compatibility rule; existing `E_PURE` restrictions must not be bypassed by the alias.
* The marker may only appear where the grammar admits a callable effect. A bare `susp`, `susp |...|` in a non-lambda position, or `susp int` in a type position is an error; do not treat it as a variable name or reinterpret it as a non-suspending callable.
* Suspension checking is unchanged: `await` requires the appropriate suspending context; invoking a suspending callable obeys the existing effect and awaiting rules, including on immediately-ready results. Do not silently erase suspension from callable types or higher-order values.
* A `susp fnc(...)->...` type is **distinct from** `fnc(...)->...` in effect identity. Accepting a source annotation does not imply executable closure lowering. Any backend without verified suspension-capable closures must reject attempted execution with a typed diagnostic, never pretend the effect is absent.
* The `#` character retains any other independently specified uses and **never** acts as this modifier. A line beginning `# ` is a Markdown heading unless fenced, which is one reason it is excluded from AttoLang suspension syntax.

## Conformance matrix

| Source | Expected |
|---|---|
| `pub susp fnc f(): int { return await 42; }` | accepted wherever long form works |
| `pub suspends fnc f(): int { return await 42; }` | same AST effect |
| `pub ⧖ fnc f(): int { return await 42; }` | same AST effect |
| `pub ∂ fnc f(): int { return await 42; }` | same AST effect |
| `pub ⧖ ∂ fnc f(): int { return 42; }` | duplicate modifier diagnostic |
| `pub pure ∂ fnc f(): int { return 42; }` | existing purity gate |
| `pub ▽ fnc f(): int { return 42; }` | rejected lookalike |
| `susp mtd f(): int { return await 42; }` | method effect |
| `static susp fnc f(): int { return await 42; }` | static method effect |
| `susp |x| : int -> await x` | lambda with suspending effect |
| `susp fnc(int)->int` | effect-bearing callable type |
| `pub susp fnc *gen g(): Generator<int> { yield 42; }` | generator marker preserved |
| `pub susp suspends fnc f() {}` | duplicate modifier diagnostic |
| `pub suspends susp fnc f() {}` | duplicate modifier diagnostic |
| `pub pure susp fnc f() {}` | existing purity gate |
| `susp int` | invalid type, no fallback |
| `suspicious` | not a keyword prefix |
| `# |x| -> x` | not suspension syntax |

## Implementation / availability boundary

The language contract is **normative**; it does not certify any backend. An implementation must verify parser/AST equality, formatter idempotence, effect diagnostics, typed callable identity, generator coexistence, positive/negative source fixtures, guest execution when supported, and compiler/backend parity separately. In particular, the Rust browser compiler's async implementation is a draft integration branch; its existing lambda implementation may be syntax-only and may reject executable closures. Do not count successful parse-only tests as suspension-capable callable execution.
