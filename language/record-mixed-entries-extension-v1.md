# Mixed Record entries, anonymous literals and shape extension — candidate v1

Status: TARGET_NOT_EXECUTED. Companion to recursive-product-literals-v1 (#303), not a replacement of historical profiles. Owner requested these forms on 2026-11-27. The separator, collision and inferred binder details below are candidate rules for review; no backend support is asserted.

## Delimiter-local syntax
In an expression brace, an unquoted identifier followed by single colon, single equals, or adjacent colon-equals selects the Record entry grammar. A spread operand may select a Record only if statically a Record; preserve the existing Map syntax for quoted colon keys and explicit Map forms. No expected type is needed for the listed brace forms or parenthesized colon/equal fields. Do not reinterpret a block in a syntactically required block position. Empty braces in expression position are a candidate empty Record; preserve existing explicit empty Map constructors. Quoted identifier equals follows #303. Quoted colon remains Map in braces; do not silently convert a Map or Entry into a Record.

A parenthesized level containing explicit identifier-colon or identifier-equals entries selects Record, including a mixture with inline Pair entries. A parenthesized list consisting entirely of Pair expressions remains a Tuple (single item without comma is grouping). Classification scans only the current delimiter level, using lexer tokens, not text or expected type; no retry on failure. A standalone Pair still has a literal string key. Call delimiters remain separate: f(x = 1) and f(x : 1) are named arguments, f(x := 1) is a positional Pair, and f({x = 1}) / f({x := 1}) are positional Records. The latest owner clarification distinguishes f(x = 4, y = 8) (two named arguments) from f({x = 4, y = 8}) (one positional Record). f((x = 4, y = 8)) is unresolved; f((x : 4, y : 8)) is a clearer candidate, not a ratified portable call form. These grouped call spellings must not be guessed from overloads or rewritten to braces; standalone parenthesized literals remain a distinct proposal. See #299 and #307. A Record field holding a Pair does not flatten the Pair.

```atto
const x := 5;
const y = x := 5;
const Record r = (bar := 6, foo = 5);
const a = {name := "Alice"
age := 30};
const b = {name = "Alice", age = 30};
const c = {name : "Alice", age : 30};
const d = {name := "Alice"
age = 30, active : true};
process({name : "Alice", age : 30});
process((name : "Alice", age : 30)); // candidate only, not portable
process({name := "Alice", age := 30});
```

Candidate separator rule: a comma (including optional final comma) separates any entry. A physical newline after a *complete* inline := entry may replace the comma in braces; = and : entries and spreads require a comma when followed by another entry. No interior semicolons. Parenthesized records require commas between entries for the initial profile. Newlines within strings, comments, nested delimiters or syntactically unfinished RHS do not terminate entries; line continuation obeys normal expression precedence. Reject missing RHS, missing comma after =/:/spread, doubled commas, and mixed positional scalars. No assignment to outer bindings from a field initializer. Reject duplicate explicit labels across operators using canonical decoded identifier identity.

Only inline identifier-key Pair entries are admitted in the initial closed-shape slice; a first-class Pair operand can contribute a field only with a statically proven key, otherwise reject. Preserve unrestricted standalone Pair keys and do not silently admit arbitrary string-key fields as identifier projections.

## Shape and extension
```atto
const r = {name : "Alice", age : 30};
const T v = r with {bar : true};
const T w = {...r, bar : true};
const Record<T> u = infer {...r, bar : true};
```
The first two T uses require a previously declared compatible type; the third proposes a fresh lexical type binding when T is unbound, otherwise validate an existing T. Resolve before codegen. No implicit global type creation. Reconcile with existing Record<infer T> and infer<T> syntax (#255) rather than replacing either. A fresh binder becomes visible only after successful initializer inference, never within its own initializer; reject collisions with existing non-type bindings and type parameters that cannot be inferred in this context. Scope and export follow existing lexical type alias rules.

with and spread construct a fresh readonly structural Record, not mutate the operand. Type identity is canonical by field names/types and independent of evaluation order (candidate; preserve existing ABI layout version). Each operand and RHS is evaluated exactly once in source order, including overridden RHS, with ordinary failure and cleanup semantics. Explicit fields following a spread may override; duplicate explicit fields reject even across operators; overlapping spread fields reject unless resolved by a later explicit field (candidate); reject spread overriding an earlier explicit field. with allows adding or replacing fields, including changing a field's type when the target shape permits. No implicit conversion to nominal Struct or Map. Infer output shape from checked operand shapes; reject dynamic/unproven keys in the initial profile.

## Safety and backend evidence
Retain const/constexpr admission; no automatic deep freeze. Ordinary construction/update must provide independent logical mutable state or fail closed; immutable sharing, safe move elision and observationally equivalent COW are permitted. Explicit take!/borrow!/copy!/copy!!/share! retain their respective contracts. Reject illicit actor-heap escapes, stale loans, noncopyable resource duplication and hidden mutable aliases transitively. Preserve cleanup, cancellation, and drop order on partial failure. No mandatory Pair heap allocation, reflection, runtime type synthesis, hash lookup or JIT for closed scalar shapes. Do not claim zero GC on the basis of a host-side test.

Required gates: real lexer/parser AST and formatter round trip; recursive shape checker; actual compiled guest values and side-effect order; negative diagnostic and no output artifact; explicit ownership counterexamples; native AOT layout and allocation evidence. Record source head and root tree, executed step receipts and independent review. Run identical fixtures across Java, LLVM, NativeAOT, Wasm, Rust, JS, Forge and Cranelift. Track HDL/realtime/self-hosted backend applicability separately. NOT_EXECUTED, unsupported-feature rejection and host-only contract tests are distinct from guest PASS.
