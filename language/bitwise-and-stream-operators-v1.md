# Bitwise operators and directional stream syntax — v1

**Status:** proposed normative contract, pending executable parity. **Language:** AttoLang (also called AttoPL).

## Surface grammar

| Syntax | Meaning | Result |
| --- | --- | --- |
| `a & b` | integer bitwise AND | `int` |
| `a \| b` | integer bitwise OR | `int` |
| `a ^^ b` | integer bitwise XOR | `int` |
| `^ expression;` | return from the enclosing callable (alias for `return expression;`) | enclosing return type |
| `Math.pow(a, b)` | exponentiation via the typed Math API, **not** a caret operator | Math API result type |
| `~a` | integer bitwise complement | `int` |
| `a <<< n` | integer left shift | `int` |
| `a >>> n` | integer logical (zero-fill) right shift | `int` |
| `a ashr n` | integer arithmetic (sign-filling) right shift | `int` |
| `sink << value` | typed single write/insertion | I/O effect |
| `source >> val binding` | typed single read/extraction | I/O effect |

`&= |= ^^= <<<= >>>= ashr=` are assignment shorthands and require a writable lvalue. In the initial browser subset, only mutable locals are supported. No overload resolution on user-defined numeric types is implied. `<<=` and `>>=` are **not** shift assignments.

Bitwise operands MUST both have type `int` (signed, 64-bit). No implicit `bool`, `float`, `Pointer<T>`, `Channel<T>`, or collection coercion is permitted. The result is an `int` containing the specified 64-bit two's-complement bit pattern. `~` is unary; the other bitwise operators evaluate left then right exactly once, with no suspension.

### Shift semantics

- Shift counts MUST be within `0..63` inclusive. Negative distances and values 64 or greater fail with a checked, language-level error; masking with `n & 63` is invalid and must never be used to hide an invalid count. The exact error/actor CONTROL mapping requires its own backend contract.
- `<<<` discards shifted-out high bits and introduces zero low bits; it does **not** trigger checked arithmetic-overflow errors.
- `>>>` introduces zero high bits; the resulting 64-bit pattern is returned as a signed `int`. Example: `-1 >>> 1` is `9223372036854775807`.
- `ashr` propagates the sign bit. Example: `-8 ashr 1` is `-4`.
- All three shifts are deterministic on every target; C/C++ undefined behavior is not a permitted implementation.

### Precedence, lowest to highest within the relevant expression region

```ebnf
logical_and  = bit_or { "&&" bit_or } ;
bit_or       = bit_xor { "|" bit_xor } ;
bit_xor      = bit_and { "^^" bit_and } ;
bit_and      = equality { "&" equality } ;
equality     = comparison { ("eq" | "neq" | "==" | "!=") comparison } ;
comparison   = shift { ("<" | "<=" | ">" | ">=") shift } ;
shift        = additive { ("<<<" | ">>>" | "ashr") additive } ;
additive     = product { ("+" | "-") product } ;
unary        = "~" unary | other_unary ;
```

`^^` is **integer bitwise XOR** on two `int` operands, never an alternate return marker or a Boolean coercion. `^` has **no infix expression meaning**. The ordinary `|>` functional pipeline remains distinct. The owner-approved reconciliation in [#151](https://github.com/atto-lang/atto-spec/pull/151) reserves `^^` exclusively for integer XOR; Boolean XOR is the explicit `Xor(bool,bool)` operation. This supersedes the competing `bool ^^ bool` spelling in draft [#6](https://github.com/atto-lang/atto-spec/pull/6) for the canonical language. No backend execution is established by this decision.

**Compatibility rule:** legacy single `|` inside an unparenthesized `if` or `while` condition remains boolean OR until separately migrated. To use integer `|` there, parenthesize the integer subexpression: `if (flags | mask) eq expected then ... fi`. `|x| -> expression` remains a lambda.

### Prefix-tilde and caret disambiguation

`~Type` and `is ~Type` in **type annotations and structural-pattern positions** are
structural type/pattern syntax, not integer complements. In an **ordinary
value-expression position**, `~value` is unary bitwise NOT and only type-checks
when `value: int`. The parser must preserve the source syntactic context and
type-check the resolved meaning; it must not choose a different meaning based
on runtime data or silently reinterpret an invalid type as a value.

In statement-return position, `^ expression;` is identical to
`return expression;` and exits the enclosing callable. It does **not** mean
power or XOR. Infix `left ^ right` is invalid source; the integer XOR spelling
is `left ^^ right`. These meanings are token/grammar distinctions rather than
runtime type-dependent overloads. For powers, use `Math.pow(base, exponent)`;
its numeric overloads and rounding rules belong to the typed Math API contract,
not to an exponentiation operator. Do not silently use JavaScript `**` or `^`
as a substitute. Test `^ 5;`, `return 5;`, `^ (12 ^^ 10);`, rejected
`return 12 ^ 10;`, nested structural patterns and `~int_value`.

### Lexer and typed-I/O compatibility

The expression grammar recognizes exactly **three contiguous** `<` or `>` characters as shifts. Two contiguous characters retain their existing I/O direction forms. Type/generic parsing MUST still parse nested closing `>` delimiters, e.g. `Future<Result<Option<int>>>`, without reinterpreting them as `>>>`. Do not retokenize generic close delimiters globally as shifts.

`<<` and `>>` are typed read/write operators on streams, channels, and **any value whose statically resolved type satisfies the appropriate read/write interface or trait**. A write must be authorized by the writable capability; a read must satisfy the readable capability and binding type. Operations are subject to effect, permission, lifecycle, cancellation and backpressure rules; an arbitrary host object with a coincidentally named method has no ambient authority. These operators are not integer shifts. Continuous endpoint pumping uses the separate `pipe` keyword. This document does not certify any general stream/trait guest lowering.

### Conformance cases

| ID | Source expression | Expected `int` |
| --- | --- | ---: |
| BW-001 | `12 & 10` | 8 |
| BW-002 | `12 \| 10` | 14 |
| BW-003 | `12 ^^ 10` | 6 |
| BW-004 | `~12` | -13 |
| BW-005 | `8 <<< 2` | 32 |
| BW-006 | `-1 >>> 1` | 9223372036854775807 |
| BW-007 | `-8 ashr 1` | -4 |
| BW-008 | `1 <<< 64` | checked failure (invalid shift distance) |
| BW-009 | `1 + 2 <<< 3` | 24 |
| BW-010 | `(1 <<< 63) >>> 63` | 1 |
| BW-011 | `(1 <<< 63) ashr 63` | -1 |

Required negatives: `return 12 ^ 10;` (single caret is not binary), `true ^^ false` (no implicit bool-to-int XOR), `1.0 & 2`, `1 >>> 1.0`, `~true`, immutable `val x; x |= 1`, `1 << 2` and `8 >> 2` as would-be integer shifts, malformed or whitespace-separated triple shifts, and incorrect stream classification of `x <<< 3`. Verify `^ 5;` and `return 5;` produce identical callable results; `^ (12 ^^ 10);` returns 6. Verify `stdio.out << 1`, `stream >> val item`, other trait-conforming readable/writable endpoints, nested generics, Boolean logic, and lambdas remain distinct.

**Evidence status:** A draft browser compiler implementation exists in [atto-source.rs #334](https://github.com/atto-lang/atto-source.rs/pull/334). Its source changes are not executable evidence. Rust tests, native-generated Wasm guest execution, actual browser compiler execution, alternate-runner exact-SHA tree proof, and independent Java/LLVM/.NET/Wasm/Forge parity must be reported separately as PASS / FAIL / UNSUPPORTED / NOT EXECUTED.
