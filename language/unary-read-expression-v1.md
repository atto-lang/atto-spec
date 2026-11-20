# Unary read expression: \`<< readable\` (proposed v1)

Status: **normative syntax target / backend execution pending**. This extends
[the directional I/O shorthand v1](io-direction-shorthand-v1.md). It is not
evidence that the Java, LLVM, .NET, or browser/Wasm compilers execute guest reads.

**Postfix expression companion:** [\`readable >>\` single reads](postfix-channel-read-expression-v1.md) are defined as the same checked read operation as \`<< readable\`; neither spelling unwraps an EOF/error-capable \`Channel<T>\` into bare \`T\`.

## Decision

At expression-start position, contiguous prefix \`<<\` reads **one** item
from a statically typed readable capability, producing exactly the same
*read outcome type and effects* as \`readch readable\` (channels), or the
appropriate typed Readable protocol operation (streams).

\`\`\`atto
val Channel<int> c = new Channel<int>();
let total = 0;
val received = << c;
total += (<< c);   // only if the read outcome has type int
val combined = (<< c) + (<< c); // two distinct ordered reads
process_value(<< c);
return << c;
\`\`\`

No user-visible anonymous variable is created. The compiler may use a
single-use SSA value or hidden temporary to evaluate the source and read
**once**. This is a *read expression*, unlike \`sink << value\` (write)
and unlike \`val result << source\` (read-binding declaration). Prefix
placement, not runtime operator overloading, determines the grammar.

**Important correction:** on fallible/EOF-capable channels or streams,
\`<< c\` has the checked outcome type (e.g. \`Result<Option<int>, IoError>\`)
rather than \`int\`. Therefore \`total += (<< c)\` is **not** legal if the
read outcome cannot be added to an integer. The programmer must explicitly
handle \`Err\` / \`None\` or use a checked propagation/unwrap operation
supported by that concrete type. There is no implicit conversion,
zero-on-EOF, trap, panic, or error suppression.

The original example \`const Channel<int> c = new Channel<int>();\` is not a
compile-time constant initialization under Atto's \`const\` rules. Use
\`val Channel<int> c\` for a fixed binding to a runtime-created channel.

## Grammar and precedence

\`\`\`ebnf
prefix_io_read = "<<", unary_expression ;
unary_expression = prefix_io_read | other_unary_expression ;
\`\`\`

The two \`<\` tokens must be adjacent on the same source line. The receiver
must resolve to a readable capability. Prefix receive has the same unary
precedence as \`await\`, \`trap\`, unary plus/minus, and ownership prefixes.
In expression position, \`<< c\` is a right operand to \`+=\` or a normal
function argument; \`total += (<< c)\` and \`total += << c\` should parse
equivalently. Parentheses remain recommended for readability.

| Form | Interpretation |
|---|---|
| \`readch c\` | Explicit channel read expression |
| \`<< c\` | Prefix read expression; identical outcome/effects |
| \`total += (<< c)\` | Compound assignment using a read outcome |
| \`c >> val x\` | Single read, new lexical binding |
| \`val x << c\` | Declaration-first read, new lexical binding |
| \`sink << x\` | Single write operation |
| \`a pipe b\` | Continuous supervised transport; unrelated grammar |
| \`1 << 3\` | Numeric shift only if supported by numeric operator rules; never I/O |
| \`T<U<V>>\` | Nested generic closers; never I/O |

No reinterpretation of binary \`<<\`, numeric shift, generic closers,
select guards, stream pumps, reverse functional \`<|\`, or terminal capture
\`>> val\` is permitted. No unary write form is introduced by this decision.
Do not treat \`when << c ->\` as an atomic select-arm shorthand without a
separate selectable registration/commit grammar.

## Semantics and safety

1. **Type-directed:** The source must implement a statically resolved
   \`Readable<T>\`-like interface or channel read capability. Reject
   numerics, unknown dynamic values, non-readable sinks and an incompatible
   target type. Do not dispatch to an arbitrary \`read()\` method name.
2. **Exactly once:** Evaluate the source exactly once, perform one read,
   consume the result exactly once. Repeated occurrences are distinct reads
   with normal left-to-right expression evaluation. Do not duplicate reads
   when lowering \`+=\`, calls, traps, or pipelines.
3. **Outcome-preserving:** Preserve \`T\`, \`Option<T>\`,
   \`Result<T, E>\`, \`Result<Option<T>, E>\`, or the exact declared outcome.
   EOF, closure, cancellation and exceptions must remain distinguishable.
   Never silently unwrap or turn missing values into zero.
4. **Effects:** Inherit the same \`io\` and possible \`suspends\` constraints
   as \`readch c\`. No OS thread parking. \`trap << c\` may capture only
   effects recognized by \`trap\`; it must not conflate \`Err\` with \`None\`.
   This proposal does not introduce implicit \`nb << c\` / \`try << c\` modes.
5. **Borrow and reentrancy:** A potentially suspending read may not hold an
   illegal live mutable loan or actor critical-write lock across suspension.
   A local \`total += (<< c)\` follows checked evaluation order; it is **not**
   an atomic read-and-update of shared state. Check read-before-write races
   and move/loan lifetime just as for \`total += readch c\`.
6. **Error propagation:** Compound assignment is legal only if the resolved
   read outcome supports the selected arithmetic operation, and all errors
   are handled according to the caller's declared effects. If two reads
   occur and the second fails, the first read is **not rolled back**.
7. **Discard:** A bare standalone \`<< c;\` that discards a checked read
   outcome is forbidden. Explicitly bind/handle the outcome.
8. **\`const\`:** Runtime \`const x = << c\` fails \`E_CONST_EFFECT\`.

## Implementation/conformance gates

- Parser: AST prefix-read node, source span, no binary-write/numeric-shift
  collision; exhaustive lexer/formatter tests, adjacent-token and
  nested-generic negatives, both parenthesized and bare expressions.
- Checker: \`Readable<T>\` capability, exact return type, \`io\`/\`suspends\`,
  \`const\`, \`trap\`, \`Result\`/\`Option\`, overload/call/compound-assignment
  constraints, actor state and ownership across suspension.
- IR: lower to the same checked read operation as \`readch\`, with source
  evaluated once and SSA result consumed once. No hidden \`unwrap\`.
- Runtime: nonparking blocked read, bounded channel, pending/cancelled
  futures, EOF, closure, backpressure, supervisor errors; exact-once consume.
- Compare exact matching test fixtures on **Java, LLVM, .NET** and the
  browser/Rust compiler only where supported. Prove positive executable
  guests on the production backends, not just lexer scans or a host mock;
  negative cases must produce no executable artifact. Record exact tree
  SHAs and runner receipts. Do not claim parity from parse-only tests.

### Restricted browser compiler staging

The current Rust browser subset can *recognize* a conservative
\`<< simple.qualified.path\` operand in expression position, with
\`E_IO_SYNTAX\`, \`E_CONST_EFFECT\`, or \`E_IO_DISCARD\` for certain invalid
forms. It must return \`E_UNSUPPORTED\` for otherwise recognized unary reads
until the typed guest channel/stream read ABI is executable. This staging
does **not** mean \`total += (<< c)\` runs in the playground.


## Typed declaration-first shorthand and required suspension (v1 clarification)

The three source forms below are **one-shot reads with the same effective
result type, ownership transfer and effect requirements**. Parentheses only
group the prefix expression:

```atto
pub suspends fnc receive_example(Channel<int> c): void using io, suspend {
    val Result<Option<int>, IoError> a = << c;
    val Result<Option<int>, IoError> b = (<< c);
    val Result<Option<int>, IoError> d << c;
}
```

The declaration-first binding syntax accepts both type-first and name-first
annotations:

```atto
val Result<Option<int>, IoError> a << c;
val a: Result<Option<int>, IoError> << c;
c >> val a: Result<Option<int>, IoError>;
```

These are *syntax and type/effect contract examples*, not an assertion that
the current browser compiler or production backends can execute them.
The exact read outcome of `Channel<int>` remains checked: none of these
three declarations coerces it to bare `int`. Thus `val int a << c` and
`val int a = << c` are **both rejected** if `c` reads as
`Result<Option<int>, IoError>`. They become well typed only for a
readable whose *actual* declared read outcome is `int`.

Potentially suspending operations require an enclosing callable declared
`susp` or `suspends` (aliases), **not merely** the presence of
`using io`. Where the effect system requires explicit capabilities,
the callable must also declare `io` and `suspend`. These are distinct
checks: `io` is not permission to suspend, `suspends` does not
authorize unrelated I/O, and `trap` never erases the suspend effect.

```atto
pub susp fnc example(Channel<int> c): void using io, suspend {
    val result = << c;
}

// Must fail effect checking, even with `using io`:
pub fnc invalid(Channel<int> c): void using io {
    val result = << c; // E_SUSPENDS_REQUIRED
}
```

A non-suspending function may only use a separately specified immediate
nonblocking operation with its own distinct type and effect contract;
there is no implicit `nb` mode for unary `<<`.

For compound assignment, `total += << c` and
`total += (<< c)` denote the same parse, but neither can add a
`Result<Option<int>, IoError>` to `int`. When a readable's
actual result is `int`, evaluate the channel expression once, perform
one read, then load/update the left-hand variable once; the read must
finish before the write. Do not hold an exclusive reference to
`total` across suspension or mutate shared actor state outside its
critical access protocol. Any pending read that is cancelled or fails
must leave `total` unchanged. For `a + (<< c) + (<< c)`, each
receive is a separate ordered operation, without rollback of prior
successful receives.

**Conformance additions:** test type-first/name-first binding forms,
`val int a = << c`, `val int b = (<< c)`, `val int d << c`,
both `susp` and `suspends`, a synchronous callable negative,
`trap << c` retaining suspension, rejected mismatched checked outcomes,
`+=` with and without parentheses, cancellation-before-commit,
and exact-once reads. Compare compiled, executed guests across
Java, LLVM and .NET before claiming parity.
