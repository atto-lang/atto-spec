# Checked integer parsing into Result v1

**Contract ID:** `ATTO-INT-PARSE-RESULT-V1`  
**Status:** normative target; the Rust/Wasm draft candidate is not compiler-certified until exact-head guest execution succeeds. Other backend support remains unverified.

## Signature and caller behavior

```atto
int.parse(text: string): Result<int, Error>
```

The method is a primitive type member (not ambient host parsing, an extension method, reflection, or an import). It evaluates its string argument exactly once and returns a fresh tagged `Ok(value)` on success or `Err(original Error)` on failure. `int` is a signed 64-bit two's-complement integer. For the v1 portable admission profile, the runtime parser accepts **1 through 1024 UTF-8 bytes** and performs at most that many digit operations per call. A future explicitly versioned profile may extend this admission ceiling if its scheduler/fuel quota and latency invariants are proven.

Successful strings contain precisely an optional single leading ASCII `+` or `-`, followed by one or more ASCII digits `0` through `9`. Leading zeros are valid, and negative zero yields 0. The entire string must be consumed. It is **not** locale-sensitive: whitespace, underscores, separators, non-ASCII numerals, embedded NUL, a bare sign, decimal points, exponents, extra signs and leading/trailing junk are invalid. Values outside `[-9223372036854775808, 9223372036854775807]` fail without wraparound or overflow panic.

Malformed, oversized and out-of-range decimal strings return `Err(Error("invalid integer"))` for the v1 concrete builtin profile. Each failure creates a new ordinary Error with intact message and guest-owned identity. It does **not** throw, raise, panic, return None, or silently produce zero. The Error is the existing immutable error type; no `ParseError` subclass or automatic `Result<int,ParseError>` covariance is inferred. Those changes require an independently specified nominal type/error-join contract. Fixed-heap allocation failure remains a fatal resource outcome, not a conversion to `Err` by fiat.

```atto
pub fnc parse_id(string text): Result<int, Error> {
  val parsed = int.parse(text)?;
  return Ok(parsed);
}
pub fnc main(): int {
  return match parse_id("42") over
    on Ok(value) -> value,
    on Err() -> 0
  end;
}
```

A successful source-compiled guest returns 42. Replacing `"42"` with `"bad"` follows the `Err()` arm and returns 0. The `?` is a normal early **return of the original tagged Err handle**, not a source `throw`; it must execute registered `defer` and `finally` cleanup through the canonical cleanup exit. The matcher must typecheck `Ok(int)`, `Err(Error)`, and discarding `Err()` while still requiring exhaustive unguarded coverage.

## Reference boundary matrix

| Input | Outcome |
| --- | --- |
| `"42"`, `"+42"`, `"00042"` | `Ok(42)` |
| `"-42"` | `Ok(-42)` |
| `"-0"`, `"0"` | `Ok(0)` |
| `"9223372036854775807"` | `Ok(i64::MAX)` |
| `"-9223372036854775808"` | `Ok(i64::MIN)` |
| `"9223372036854775808"` | `Err(Error)` |
| `"-9223372036854775809"` | `Err(Error)` |
| `""`, `"+"`, `"-"`, `" 42"`, `"42 "` | `Err(Error)` |
| `"٤٢"`, `"4_2"`, `"42x"`, `"4\\0"` (embedded NUL) | `Err(Error)` |
| 1024 zeros | `Ok(0)` |
| 1025 zeros | `Err(Error)` |

The string view must be validated before any guest-memory load, and the loop must be bounded before processing untrusted input. Error records follow the target's existing Error/Result ABI with correct tag, payload, and Error identity—not a JS object fabricated outside the guest or a host `parseInt` fallback. Unsafe actor and tenant contexts without proven admission/scheduler effects must reject the builtin explicitly rather than accepting a weaker runtime path.

## Diagnostics and parity evidence

- `int.parse(42)`: deterministic type error, no guest artifact.
- `int.parse()` or `int.parse("1","2")`: deterministic arity error, no artifact.
- Returning a raw `Result` from an `int`-returning function without a match/propagation-compatible signature: deterministic type error.
- A `?` on `Result<int,Error>` inside an `Option<int>` or `int` return context is a type error.
- A nonexhaustive `Ok`-only or `Err`-only match is a compile-time error.
- `trap int.parse(text)` must not introduce a nested `Result`, discard an `Err`, or convert `Err` to `None`; ordinary thrown Error remains distinct from returned Err.

The canonical conformance target registry is [atto-platform-conformance PR #68](https://github.com/atto-lang/atto-platform-conformance/pull/68), and the implementation tracking issue is [atto-compilers-parity-testing #20](https://github.com/atto-lang/atto-compilers-parity-testing/issues/20). Every advertised backend needs an exact source Git tree/head, compiler digest, compiled guest stdout/exit and error/identity traces, deterministic negative no-artifact receipts and **nonzero executed CI steps**. Keep results at `NOT_EXECUTED` or `UNSUPPORTED` where the compiler, host, or runtime profile is missing. No host-model test, source-only manifest check, or zero-step workflow counts as implementation proof.

**Migration:** Prior `trap`-to-`Option` semantics are obsolete under [trap-result-v1](trap-result-v1.md). Adding `int.parse` does not imply general generic Result/Error covariance, arbitrary Error subclasses, or universal trap recovery.
