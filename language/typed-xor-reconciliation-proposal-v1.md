# Typed XOR reconciliation proposal v1

**Status: DRAFT — not normative, not implemented or verified.** The merged integer-only `^^` decision in #151 and the canonical Boolean contract continue to govern until this proposal is reviewed and accepted. This reconciles the historical #6 and Rust #53 intent with #151; it must not be used to overwrite current compiler tests prematurely.

## Proposed typing and lowering

- `bool ^^ bool -> bool`: exclusive disjunction; evaluate operands left-to-right exactly once, eagerly.
- `int ^^ int -> int`: preserve existing signed i64 bitwise XOR.
- Reject mixed bool/int, other operand types, coercion, runtime overload lookup and user-defined overloads for this initial profile. Resolve the operation statically before backend lowering. No boxing, allocation, GC or JIT dependency.
- Preserve existing integer `^^=`. Boolean `^^=` is outside this proposal until mutation semantics are agreed.
- `Xor(a,b)` remains the explicit Boolean intrinsic; preserve intrinsic identity and existing variadic behavior. Do not change And/Or laziness or reserve word operators by implication.

## Precedence decision needed

Recommend retaining a single syntactic precedence tier for `^^`, identical to the current bitwise tier (above `&&` and `||`, below `&` and equality). This avoids type-dependent parsing or changing existing integer expressions. Historical Boolean precedence placed XOR between AND and OR; that would change parse trees or require explicit syntax. Until review resolves this, use parentheses in mixed Boolean chains, and do not claim their unparenthesized semantics are settled. Keep `^` return, `|>` pipeline and `||` contextual lambda syntax unchanged.

## Minimum executable corpus

| Case | Expected |
|---|---|
| `false ^^ false` | false |
| `false ^^ true` | true |
| `true ^^ false` | true |
| `true ^^ true` | false |
| `12 ^^ 10` | 6 |
| `-1 ^^ 0` | -1 |
| `true ^^ 10`, `12 ^^ false`, `1.0 ^^ 2` | compile-time type rejection |
| `false && (true ^^ 10)` | compile-time type rejection despite skipped RHS |
| `(a && b) ^^ c`, `a ^^ (b && c)` | preserve explicit grouping |
| effectful bool operands | both execute exactly once, left before right |

Require exact-tree source-compiled guest execution across all backend profiles, actual diagnostic categories and no emitted artifact on invalid input, optimized/unoptimized equivalence, formatter round-trip, and independent approval. Retain existing tests until the canonical specification is revised in a coordinated follow-up. No passing implementation evidence is asserted here.
