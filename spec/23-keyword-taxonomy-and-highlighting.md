# 23 — Keyword Roles and Syntax Highlighting Taxonomy

**Status: DRAFT; PROPOSED editor/tooling taxonomy.** This chapter adds metadata and editor guidance; it does **not** reserve new words, change parsing or formatting, or assert compiler/backend implementation. The recorded lexer inventory and admission caveats remain in [chapter 16](16-lexical-and-grammar-reference.md); [chapter 01](01-source-and-syntax.md) describes target syntax. Every example marked TARGET must be independently compiler-tested before being called implemented.

## Two independent classifications

AttoLang keyword documentation SHOULD distinguish:

1. **Linguistic role**: an explanatory analogy to natural-language parts of speech, useful for reading declarations.
2. **Grammar/semantic role**: the parser and type checker's actual use of a token in a particular syntactic context. This role governs syntax highlighting.

These axes must not be conflated. A word's linguistic role does not decide whether it is reserved, contextual, an operator, a normal identifier, or a supported construct. A lexeme may have multiple grammar roles depending on parser context. The parser and resolved symbol information are authoritative; an editor's word list is only a fallback.

For example, in the **TARGET** form `declare actor Worker implements Runnable;`, `actor` acts like a noun (entity kind), `declare` is an action verb (declaration introducer), and `implements` is a relational verb (type-contract clause). `Worker` and `Runnable` are **identifiers**, not keywords. The presence of `declare` in this design example is **not** an assertion that the Java lexer reserves it or that this spelling compiles across backends.

## Linguistic role families

| Linguistic role | What it explains | Representative spellings | Grammar and status caveats |
| --- | --- | --- | --- |
| **Nouns / entity kinds** | What is being declared | `actor`, `class`, `interface`, `trait`, `struct`, `module`, `namespace`, `fnc`; TARGET/contextual `singleton`, `enum`, `supervisor` | The first group appears in chapter 16's documented Java keyword inventory; the latter words are **not** reserved in that inventory |
| **Action verbs** | Introduce declarations or actions | `define`, `spawn`, `return`, `await`, `throw`, `raise`, `panic`; TARGET `declare`; ownership operations `borrow`, `take`, `copy`, `share` | Ownership spellings are a design/grammar family, **not** asserted standalone Java lexer keywords |
| **Relational verbs** | Connect types or expressions | `implements`, `extends`, `conforms`, `is` | Semantics differ: implementation/inheritance clauses versus identity/type tests |
| **Adjectives / qualifiers** | Constrain a declaration, binding, or access | `pub`, `private`, `static`, `const`, `mut`, `abstract`; TARGET/contextual `final`, `sealed` | `final` and `sealed` are not reserved by the documented Java lexer; validity depends on grammar context |
| **Adverbs / execution qualifiers** | Specify execution or access mode | `async`, `suspends`, `rt`, `nb`; compound `critical-read`, `critical-write`, `nb-select` | `critical-read`/`critical-write` are context-handled by the parser; `nb-select` is a lexer-recognized compound |
| **Connectives / prepositions** | Introduce clauses and relations | `as`, `from`, `of`, `over`, `then` | Different grammar productions; `as` can occur in more than one role |
| **Control / structural words** | Form branching and syntactic boundaries | `if`, `ifnot`, `unless`, `else`, `elif`, `fi`, `match`, `switch`, `select`, `do`, `done`, `end`, `while` | These are structural tokens, not uniform nouns or verbs |
| **Comparatives / logical relations** | Compare or join expressions | `eq`, `neq`, `is`, `matches` | `\|>` is a pipeline **operator**, not a keyword; current `,` and `\|` in conditions are operators, not reserved words `and` and `or` |
| **Pronouns / references** | Refer to the receiver or inherited context | `self`, `super` | Reserved lexemes with expression-specific roles |
| **Literal / sentinel words** | Denote built-in values or markers | `true`, `false`, `null`, `void` | These belong to literal/type-marker scopes; `null` is lexed but a standalone null value is rejected (chapter 16) |
| **Effects / failure markers** | Mark or initiate error behavior | `trap`, `try`, `catch`, `recover`, `defer`, `throw`, `raise`, `panic` | Crosscuts the linguistic roles: e.g. `throw` is also an action verb |

An entry appearing in two rows is intentional: this is a set of *explanatory* facets, not a partition of mutually exclusive reserved tokens.

`blocking` in an API name such as `read_blocking` is **not** thereby a standalone keyword. `suspends` is the documented effect modifier; do not silently substitute a hypothetical `suspend` keyword. Likewise, `pipe` is a target/contextual actor connection word in chapter 01, not a documented reserved Java keyword; `|>` remains a separate operator. An ordinary hyphenated word is not an identifier: only grammar-enumerated compound spellings may include ASCII `-`.

## Semantic categories for editors

These are **proposed descriptive scopes**, not mandatory colors and not a replacement for standard LSP token types. A TextMate implementation may use scopes like the right-hand column; an LSP server SHOULD expose standard semantic token types (especially `keyword`, `type`, `class`, `interface`, `enum`, `function`, `method`, `variable`, `parameter` and `namespace`) plus supported standard modifiers when appropriate. Custom categories may be advertised as extensions with a fallback to standard token types.

| Grammar/semantic category | Examples | Suggested TextMate scope |
| --- | --- | --- |
| Declaration introducers | `define`, TARGET `declare` | `keyword.declaration.atto` |
| Entity-kind keywords | `actor`, `class`, `trait`, `interface`, TARGET `singleton` | `keyword.entity.atto` |
| Relationship introducers | `implements`, `extends`, `conforms` | `keyword.relationship.atto` |
| Visibility and binding qualifiers | `pub`, `private`, `static`, `const`, `mut`, TARGET `sealed`/`final` | `storage.modifier.atto` |
| Control and structure | `if`, `ifnot`, `unless`, `match`, `select`, `return`, `fi`, `end` | `keyword.control.atto` |
| Concurrency and scheduling | `spawn`, `await`, `suspends`, `nb-select` | `keyword.concurrency.atto` |
| Ownership operations | `rt` with context-proven ownership constructs such as `borrow` or `take` | `keyword.ownership.atto` |
| Effects and failure | `trap`, `throw`, `raise`, `panic`, `recover` | `keyword.effect.atto` |
| Grammar connectives | `as`, `then`, `over`, `from` | `keyword.grammar.atto` |
| Literal tokens | `true`, `false` | `constant.language.atto` |

These scopes are a design vocabulary; no theme is required to adopt a particular color. An editor can group roles visually (for example entity words blue, relational words purple, modifiers teal) without making color an AttoLang language guarantee.

**Context overrides naive lexical coloring.** Chapter 16 permits `worker.stop()`, `do()`, and `done()` as callable names, while a local declaration such as `val stop = 1` is disallowed. A static highlighter may supply only an approximation and MUST NOT claim the same accuracy as parser/LSP classifications. `new` is a construction operator, not a binding declaration. `#ready` is a Symbol literal, `|>` is an operator, and `read_blocking` is an identifier with a naming suffix, not a compound keyword. Unicode `critical–read` (en dash) must not be treated as ASCII `critical-read`.

**Identifiers must remain identifiers.** In `declare actor Foo implements Runnable;`, the parser identifies `actor` and `implements` as keywords; semantic resolution can classify `Foo` as an actor type and `Runnable` as a contract/interface name. A lexical regex must not style either name as a keyword. String contents, comments, quoted Symbols such as `#"with spaces"`, and template literal text must not be keyword-highlighted just because they contain a matching spelling. Interpolation, where admitted, needs its own parse context.

## Canonical keyword registry (staged contract)

The [versioned catalog](../contracts/keyword-taxonomy-v1/catalog.json) now stores a **documentation-derived snapshot** of the 93 words in chapter 16's recorded Java reserved-keyword table, all 12 words chapter 16 explicitly names as non-reserved, four recognized compounds, 10 additional *candidate/contextual* spellings, and special-case/non-keyword examples. Its status is `DRAFT_TOOLING_METADATA_NOT_COMPILER_VERIFIED`.

The catalog's `reserved_groups` provide grouped metadata (`id`, `linguistic_role`, `semantic_role`, `highlight_scope`, `lsp_fallback`, `lexical_status`, and `words`). A group is a compact representation of per-word classification, **not** evidence of a compiler AST node or proof that every occurrence of a member has the same syntactic role. Context-sensitive spellings remain separately recorded. The catalog distinguishes:

- `documented_java_reserved`: words in the chapter 16 historical inventory, **not** words newly verified against a current lexer.
- `documented_java_not_reserved`: words chapter 16 specifically says are not reserved; parser admission must be determined contextually.
- `documented_lexer_compound`: `nb-select` as singled out in chapter 16.
- `documented_parser_contextual_compound`: `critical-read`, `critical-write`, and `transform-pipe`, which must never turn ordinary subtraction into hyphenated identifiers.
- `not_listed_in_documented_java_reserved_inventory`: target/contextual candidates such as `declare`, `sealed`, and `singleton` whose presence in the catalog **does not** assert recognition.

The [source-only Node contract tests](../tests/keyword-taxonomy-contract.test.mjs) compare the recorded reserved and non-reserved sets to chapter 16, reject duplicates and accidental promotion of proposed words, and check classification exceptions. The [20 reference lexical fixtures](../tests/fixtures/keyword-taxonomy-lexical-v1.json) and [test-only reference scanner suite](../tests/keyword-taxonomy-lexical-model.test.mjs) add executable checks for whole-word boundaries, capitalization, reserved/candidate separation, lexer compounds, parser-contextual compounds, quoted strings and Symbols, nested comments, callable-name ambiguity, and Unicode dash rejection. The scanner intentionally models lexical boundaries **only**, not parser interpretation or semantic highlighting. The [CI workflow](../.github/workflows/keyword-taxonomy-contract.yml) runs both Node suites when their inputs change. **These tests validate documentation and source-only reference-model consistency, not the live Java lexer, compiler correctness, editor output, or any backend parity.**

Tooling SHOULD eventually consume one versioned, machine-readable registry maintained with the language specification rather than independently guessed keyword lists in each backend/editor. At minimum each expanded word entry needs:

Tooling SHOULD eventually consume one versioned, machine-readable registry maintained with the language specification rather than independently guessed keyword lists in each backend/editor. At minimum each entry needs:

- `spelling`: exact, case-sensitive lexeme (including ASCII-hyphen compounds).
- `linguistic_roles`: an array of explanatory facets; not necessarily unique.
- `grammar_roles` and `semantic_role`: parser-defined contexts and meaning.
- `lexical_status`: separately indicate documented reserved lexer token, parser-contextual spelling, TARGET-only proposal, or non-keyword/operator.
- `highlight_scope` and `lsp_fallback`: editor classification with standard-token fallback.
- `evidence`: the grammar/lexer revision or conformance contract used to assert admission. Backend acceptance must remain separate from design status.

Illustrative **expanded per-word metadata record**; the staged catalog stores shared category metadata instead:

~~~json
{
  "spelling": "implements",
  "linguistic_roles": ["relational_verb"],
  "grammar_roles": ["implementation_clause"],
  "semantic_role": "type_contract_relation",
  "lexical_status": "documented_java_reserved",
  "highlight_scope": "keyword.relationship.atto",
  "lsp_fallback": "keyword",
  "evidence": "spec/16-lexical-and-grammar-reference.md"
}
~~~

The staged catalog is exhaustive **only against chapter 16's documented reserved-word table**, not against today's compiler source. To claim an authoritative lexer registry, generation or direct comparison against the lexer/grammar at exact immutable compiler revisions is still necessary. Neither this contract nor its source-only tests may auto-promote TARGET/contextual words to reserved tokens or serve as five/six-backend implementation parity.

## Highlighting and conformance gates

The following are **tooling acceptance criteria**, not claims of currently passing compiler tests:

1. Parse/context highlighting must distinguish `actor` (entity keyword), `implements` (relation), and the declared names (symbols) in an admitted actor declaration. The example using `declare` is TARGET; test admitted `define actor` forms separately.
2. Track contextual words independently from reserved words: `singleton`, `enum`, `supervisor`, `final`, `sealed`, `pipe` and parser-handled compounds must not be indiscriminately highlighted in non-keyword contexts.
3. Recognize only enumerated ASCII hyphen compounds; `a-b` remains subtraction, and Unicode dashes are not substitutes. Test `nb-select` separately from `critical-read`/`critical-write` because their documented lexer/parser handling differs.
4. Do not highlight keyword-like text inside comments, ordinary strings, raw template text or quoted Symbols. Highlight interpolation based on a parsed interpolation grammar, not a blanket regex.
5. Preserve callable-name contexts where reserved spellings are legal (`worker.stop()` and `stop()`) rather than assuming every such spelling is an entity keyword; see chapter 16.
6. Keep ownership/effect distinctions clear: `rt` is documented; `borrow`/`take`/`copy`/`share` require grammar-context evidence; `suspends` is not interchangeable with `suspend`.
7. For each required compiler backend, compare token classification and parser admission at exact immutable revisions; maintain positive, negative, formatter round-trip, and LSP semantic-token fixtures. Read-only/editor validation is not a substitute for executable guest conformance.

**Status boundary:** The catalog, documentation-drift tests, test-only lexical model, reference fixtures, and CI workflow are authored as staged tooling artifacts. They do not establish actual parser admission, language-server semantic-token correctness, editor behavior, compiler execution, or cross-backend parity.