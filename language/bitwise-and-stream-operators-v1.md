# Bitwise operators and directional stream syntax — v1

**Status:** proposed normative contract, pending executable parity. **Language:** AttoLang / AttoPL (formerly Oreslang).

## Surface grammar

| Syntax | Meaning | Result |
| --- | --- | --- |
| `a & b` | integer bitwise AND | `int` |
| `a \| b` | integer bitwise OR | `int` |
| `a ^ b` | integer bitwise XOR | `int` |
| `~a` | integer bitwise complement | `int` |
| `a <<< n` | integer left shift | `int` |
| `a >>> n` | integer logical (zero-fill) right shift | `int` |
| `a ashr n` | integer arithmetic (sign-filling) right shift | `int` |
| `sink << value` | typed single write/insertion | I/O effect |
| `source >> val binding` | typed single read/extraction | I/O effect |

`&= |= ^= <<<= >>>= ashr=` are assignment shorthands and require a writable lvalue. In the initial browser subset, only mutable locals are supported. No overload resolution on user-defined numeric types is implied. `<<=` and `>>=` are **not** shift assignments.

Bitwise operands MUST both have type `int` (signed, 64-bit). No implicit `bool`, `float`, `Pointer<T>`, `Channel<T>`, or collection coercion is permitted. The result is an `int` containing the specified 64-bit two's-complement bit pattern. `~` is unary; the other bitwise operators evaluate left then right exactly once, with no suspension.

### Shift semantics

- The effective shift count is the low six bits of the right operand: `n & 63`. This includes negative `int` counts. The modulo-64 policy is provisional pending portability review, not permission for backend-specific undefined behavior.
- `<<<` discards shifted-out high bits and introduces zero low bits; it does **not** trigger checked arithmetic-overflow errors.
- `>>>` introduces zero high bits; the resulting 64-bit pattern is returned as a signed `int`. Example: `-1 >>> 1` is `9223372036854775807`.
- `ashr` propagates the sign bit. Example: `-8 ashr 1` is `-4`.
- All three shifts are deterministic on every target; C/C++ undefined behavior is not a permitted implementation.

### Precedence, lowest to highest within the relevant expression region

```ebnf
logical_and  = bit_or { "&&" bit_or } ;
bit_or       = bit_xor { "|" bit_xor } ;
bit_xor      = bit_and { "^" bit_and } ;
bit_and      = equality { "&" equality } ;
equality     = comparison { ("eq" | "neq" | "==" | "!=") comparison } ;
comparison   = shift { ("<" | "<=" | ">" | ">=") shift } ;
shift        = additive { ("<<<" | ">>>" | "ashr") additive } ;
additive     = product { ("+" | "-") product } ;
unary        = "~" unary | other_unary ;
```

`||` is below `&&` and `^^` is a **different** eager **boolean** XOR operator on `bool` (where supported); `^ ` is integer bitwise XOR. The ordinary `|>` functional pipeline remains distinct.

**Compatibility rule:** legacy single `|` inside an unparenthesized `if` or `while` condition remains boolean OR until separately migrated. To use integer `|` there, parenthesize the integer subexpression: `if (flags | mask) eq expected then ... fi`. `|x| -> expression` remains a lambda.

### Prefix-tilde and caret disambiguation

`~Type` and `is ~Type` in **type annotations and structural-pattern positions** are
structural type/pattern syntax, not integer complements. In an **ordinary
value-expression position**, `~value` is unary bitwise NOT and only type-checks
when `value: int`. The parser must preserve the source syntactic context and
type-check the resolved meaning; it must not choose a different meaning based
on runtime data or silently reinterpret an invalid type as a value.

In statement-return position, `^ expression;` remains the return shorthand
(with the enclosing callable as its target). Infix `left ^ right` is the
integer XOR expression. The lexer and parser must not turn a leading return
caret into an XOR expression or vice versa. Both are separate from the boolean
`^^` operator. These rules must be tested together with nested structural
patterns, `~int_value`, and infix XOR in a returned expression.

### Lexer and typed-I/O compatibility

The expression grammar recognizes exactly **three contiguous** `<` or `>` characters as shifts. Two contiguous characters retain their existing I/O direction forms. Type/generic parsing MUST still parse nested closing `>` delimiters, e.g. `Future<Result<Option<int>>>`, without reinterpreting them as `>>>`. Do not retokenize generic close delimiters globally as shifts.

`<<` and `>>` are for compatible typed channels/streams, potentially suspending, backpressured and subject to I/O effect checks. They are not integer shifts. Continuous endpoint pumping uses the separate `pipe` keyword, not a chained stream shift. This document does not claim that arbitrary channels or reads have executable guest backends.

### Conformance cases

| ID | Source expression | Expected `int` |
| --- | --- | ---: |
| BW-001 | `12 & 10` | 8 |
| BW-002 | `12 \| 10` | 14 |
| BW-003 | `12 ^ 10` | 6 |
| BW-004 | `~12` | -13 |
| BW-005 | `8 <<< 2` | 32 |
| BW-006 | `-1 >>> 1` | 9223372036854775807 |
| BW-007 | `-8 ashr 1` | -4 |
| BW-008 | `1 <<< 64` | 1 |
| BW-009 | `1 + 2 <<< 3` | 24 |
| BW-010 | `(1 <<< 63) >>> 63` | 1 |
| BW-011 | `(1 <<< 63) ashr 63` | -1 |

Required negatives: `1.0 & 2`, `true ^ false`, `1 >>> 1.0`, `~true`, immutable `val x; x |= 1`, `1 << 2` and `8 >> 2` as would-be integer shifts, malformed or whitespace-separated triple shifts, and incorrect stream classification of `x <<< 3`. Verify source `stdio.out << 1`, nested generics, boolean logic, and lambdas unchanged.

**Evidence status:** A draft browser compiler implementation exists in [atto-source.rs #334](https://github.com/atto-lang/atto-source.rs/pull/334). Its source changes are not executable evidence. Rust tests, native-generated Wasm guest execution, actual browser compiler execution, alternate-runner exact-SHA tree proof, and independent Java/LLVM/.NET/Wasm/Forge parity must be reported separately as PASS / FAIL / UNSUPPORTED / NOT EXECUTED.
