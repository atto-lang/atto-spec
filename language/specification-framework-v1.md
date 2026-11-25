# Executable language specification framework v1

**Status: proposed specification governance and formatter/conformance protocol; NOT compiler, formatter or formal-verification certification.** Existing language documents retain their recorded target/ratified status. This addition does not silently promote an existing proposal or change runtime behavior.

## Normative authority and precedence

1. The canonical, editioned AttoLang rules are owned by atto-lang/atto-spec. This repository's language clauses define intended syntax, static and dynamic semantics, actor behavior, and explicitly accepted compatibility spellings. The machine-readable registry in contracts/specification-rules-v1.json indexes these documents; its summaries do **not** supersede their full text.
2. A conflicting compiler, compiler test, formatter, legacy Oreslang document or host reference implementation does NOT independently amend a language rule. Conflicts require a reviewed specification change with a migration and compatibility decision.
3. Canonical formatting is an additional specification surface, not an alternative syntax authority. The Atto-named formatter (atto-lang/atto-format) and legacy counterpart (ores-truffle-oreslang/oreslang-format) are separately implemented conformance consumers. Similar repo names do not establish migrated commits or parity.
4. Application/toolchain edition and platform profile must be declared before testing. An extension or historical spelling is supported only when explicitly admitted by that edition/profile. A source file's logical package-relative path is part of the parse context for derived namespaces.
5. The normative registry is deliberately *declarative*: a JSON rule description is not executable semantics, a generated parser, a proof, or a compiled guest. Execution/evidence must be independently produced.

## Required rule fields

A new or changed language feature SHOULD have a stable ATTO-<DOMAIN>-NNN rule identifier, a versioned authoritative source clause, its edition/profile applicability, acceptance and rejection examples, a compiler diagnostic category where the language requires one, formatter behavior, executable conformance cases, and explicit proof obligations. Each MUST distinguish **design target** from **observed backend evidence**. A semantic change without observable evidence remains a target.

Rule IDs are never silently recycled. Superseded rules need an explicit supersedes/superseded_by link and migration notes, retaining the old rule for historical editions. Tests refer to rule IDs rather than duplicating normative prose. Reorganizations may change file paths but preserve IDs.

## Concrete alignment rules

- **ATTO-SYN-001:** One optional namespace header at the start of a source file; it must precede imports and other declarations. The formatter MUST NOT repair an out-of-order or duplicate namespace by moving, dropping or interpreting it as an import. Derived folder namespaces must preserve the same logical source path before/after formatting. See language/unified-static-imports-v1.md.
- **ATTO-SYN-002:** Imported module selectors are *static* names, not runtime property lookups; syntax rewrites need name-resolution equivalence rather than regex resemblance.
- **ATTO-TYPE-001:** Named callable results require declared result types or admitted explicit inference; formatters must not synthesize a missing return type or change an effect.
- **ATTO-OWN-001/002/003:** Implicit borrow is scoped readonly, take!/drop! are consuming, and copy!! is distinct from copy!. No formatter rewrite may alter ownership operators or access rights. Contextual lifetime! to lt! rewrites need actual lifetime-binder syntax, not string matching.
- **ATTO-CONST-001:** File/module define const accepts proven constexpr or the narrowly scoped direct os.read_env static initializer. The latter reads startup environment at runtime, not from the compiler host. Formatting may normalize only proven-equivalent initializer spelling and must preserve static effects and type.
- **ATTO-RUN-001:** Trap/Result/Option layering is semantic; the formatter does not flatten it.
- **ATTO-ACTOR-001:** A logical virtual actor reference is not a physical actor incarnation or proof of delivery; formatting must not alter identity or mailbox semantics.

The individual source documents remain authoritative for detailed preconditions and diagnostic choices. These rules do not grant a backend unimplemented syntax or relaxation of a capability check.

## Required formatter laws (per edition E, source context C)

Let P(E,C,s) be a conforming parser/typecheck result, S(E,C,s) its canonical semantic representation where valid, and F(E,C,s) either a formatted source string or a safe rejection.

1. **Idempotence:** if F(s)=t, then F(t)=t in the same E,C.
2. **Positive admission and semantic preservation:** if P(s) is valid and F(s)=t, then P(t) is valid and S(s) is equivalent to S(t), including ownership, effects, namespace identity, evaluation order, actor state, and static initializer classification.
3. **Negative admission:** if P(s) rejects for syntax or static semantics, F(s) must reject or produce t for which P(t) still rejects with an equivalent forbidden condition. A formatter cannot turn a rejected program into an accepted one by dropping/rearranging tokens.
4. **Literal and comment safety:** do not reinterpret words/operators inside comments, strings or raw literals. Preserve significant source strings and errors rather than guessing at malformed input.
5. **Contextual canonicalization:** changes to symbols such as lifetime! -> lt!, method spelling, modifier order, final/const or initializer separators require a positively established valid syntactic context and semantic equivalence; otherwise preserve or reject.

Parser acceptance is not execution. Even semantic AST equivalence is not full guest-runtime observational equivalence for I/O, concurrency, lifecycle, or resource isolation. If an implementation cannot provide a genuine semantic parser, report NOT_EXECUTED for the AST part rather than passing a lexical approximation.

## Contracts, conformance and evidence

- The machine-readable source index is contracts/specification-rules-v1.json. Its formatter_cases are **proposed shared test vectors**, not claimed passing tests or complete parser fixtures.
- atto-platform-conformance owns executable positive/negative fixtures, multi-backend target results and provenance receipts. Its existing language contracts for ownership, const and actor registry are linked from the registry. Unlinked rules need companion cases before full conformance can be claimed.
- atto-common-source owns cross-backend portable API contracts where applicable; it cannot change language grammar through an API schema.
- Results must be passed / failed / unsupported / not_executed **per case, per exact source/target SHA**, with compiler, toolchain, edition, runtime profile, fixture blob digest, executed commands/steps and genuinely observed outputs. An empty step log, source-only validator, host model or fake AST adapter must never be marked compiled_guest.
- A cross-repository check must compare a pinned spec commit and registry blob; a formatter cannot simply copy a rule and claim ongoing sync. Detect missing/renamed IDs, incompatible statuses and unsupported positive fixtures.

## Formal methods and change governance

See formal/specification-refinement-obligations-v1.md for grammar, type soundness, ownership, actor and formatter proof obligations. TLC/model-checker or Rust host-model results are scoped to their model assumptions, not guest execution. Security claims require independent implementation validation and adversarial tests.

For every normative PR: identify all affected rules/editions/profiles, survey overlapping ready/draft PRs and historical counterpart repositories, update acceptance AND rejection vectors, check formatter and conformance implications, label supported/unsupported targets, provide formal proof or open proof debt, and retain the organization's authenticated review/CI/hold policy. Never bypass repository protections or auto-merge without actual required evidence.

**Ownership of changes:** normative grammar and semantics live here; shared conformance tests and evidence live in atto-platform-conformance; formatter implementations/fixtures live in atto-format and legacy oreslang-format. A rule is not implemented merely because downstream tracking files were added.
