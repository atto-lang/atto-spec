# Postfix channel receive expression: `readable >>` (v1 candidate)

**Status:** candidate extension of [unary read expression](unary-read-expression-v1.md) and [directional I/O](io-direction-shorthand-v1.md). This file is not a claim of executable guest support or cross-backend parity.

## Canonical equivalence

For any statically readable `c`, these are the **same single-read operation**, with exactly the same resolved type, effects, and error/cancellation/EOF behavior:

```atto
val Result<Option<int>,IoError> a = (c >>);
val Result<Option<int>,IoError> b = (<< c);
val Result<Option<int>,IoError> d = readch c;
```

These expressions each perform **one distinct read** if evaluated in sequence; they are equivalent *forms*, not a shared cached result. `(c >>)` must lower to the existing `PrefixRead(c)` / checked channel-read IR used by `(<< c)`. No separate ABI, hidden variable, second channel reservation, or implicit unwrap is permitted.

```ebnf
postfix_read = postfix_expression, ">>" ;
prefix_read  = "<<", unary_expression ;
```

The `>>` tokens must be contiguous on one line. The postfix form is admitted **only when the next token closes or separates the value expression**, such as `) `, `]`, `,`, or `;`, and the receiver is statically readable. The real AST parser decides boundaries, not a string search. The postfix operator binds to its full receiver, including a member/parenthesized receiver: `(object.input >>)`. Do not accept an incomplete/numeric expression under the guise of a read.

- `c >> val item;` and `c >> let item;` remain **declaration statements** with a new binding, not postfix expression reads.
- `sink << value` remains a single write. `val item << c` remains a declaration-first read; `<< c` remains a prefix *expression* read.
- `c >>> n` is a three-character numeric shift; `1 >> 2` is **not** a numeric shift. Generic closers `Result<Option<int>>` remain type tokens, never reads.
- `c > >` is two comparisons, never a read. `when c >> ->` has **no implicit selectable/atomic** semantics. `nb` / `try` do not silently apply to this syntax.
- A bare `c >>;` discarding a checked outcome is invalid (`E_IO_DISCARD`), just as `<< c;` is.
- Valid syntax without a compiled capability/ABI must fail closed with a diagnostic, **never** emit a fabricated guest.

## Type and effect contract

For `Channel<int>` with checked receive, both forms have type `Result<Option<int>,IoError>`, **not `int`**. `Some(0)`, EOF (`None`), closed/cancelled/error, and pending suspension are distinct. Therefore:

```atto
pub susp fnc receive(Channel<int> c): Result<Option<int>,IoError> {
    return (c >>);
}
pub susp fnc receive_other(Channel<int> c): Result<Option<int>,IoError> {
    return (<< c);
}
```

These are positive *language contracts*. `val int answer = (c >>);` and `val int answer = (<< c);` must both reject with the same incompatible-type diagnostic for the checked channel outcome. An explicit `Result` / `Option` handling step is required before returning a bare `int`. A producer that has sent 42 does not waive the type rule: cancellation, closing, and delivery failure may still occur.

The read can suspend: the surrounding callable must be `susp`/`suspends` and have required capabilities. Preserve nonparking cooperative scheduling; evaluate receiver once; perform/read exactly once; check loans and actor-critical sections across suspension; preserve resource cleanup and pending Future ownership. A write `c << 42` must separately follow the existing typed send admission/backpressure and error contract; it must not silently become an infallible `try_send`. `new Channel<int>(2)` constructor support and general send support are independent implementation gates.

## Checked bounded channel construction (implementation pilot)

`new Channel<int>(capacity)` and `Channel<int>.bounded(capacity)` are
**equivalent fallible constructor spellings** in the restricted Rust/Wasm
`Channel<int>` guest pilot. Both resolve to the single typed channel-open
operation with result `Result<Channel<int>,IoError>`; neither can be
assigned to a bare `Channel<int>` without explicit `Ok` / `Err`
handling. This extension is being staged in atto-source.rs #257 and is
not an assertion of executable support in the other backends.

```atto
pub susp fnc checked_receive(): Result<Option<int>,IoError> {
    match new Channel<int>(2) over
        on Ok(c) -> {
            // A separate, checked send must be successfully admitted.
            return (c >>);
        }
        on Err(error) -> { return Err(error); }
    end
}
```

Capacity is an `int`; negative, unrepresentable or quota-exceeding
capacities must return an explicit `Err(IoError)` rather than trap or
wrap to a smaller capacity. Only `int` payload channels are admitted in
this browser-pilot subset. Other generic instantiations fail closed.
Successful channel creation does **not** authorize silently replacing
`c << value` with nonparking `c.try_send(value)`; the former remains a
distinct suspending, checked backpressure contract.

## Required conformance

| Case | Expected |
| --- | --- |
| `return (c >>);` vs `return (<< c);` in suspending typed read function | Same typed AST/IR read node, same JSPI/native ABI and one read |
| `val outcome: Result<Option<int>,IoError> = (c >>);` | Valid typed receive on an admitted backend |
| `val int item = (c >>);` / `val int item = (<< c);` | Both rejected; no implicit unwrap |
| `return c >>;` | Valid syntax, same checked type |
| `val a = (c > >);`, `c >>> 1`, `1 >> 2` | Must never be mistaken for channel read |
| `c >> val x;` | Remains binding-direction syntax |
| `c >>;` | `E_IO_DISCARD` |
| `pub fnc f(Channel<int> c)... (c >>)` | `E_SUSPENDS_REQUIRED` |
| `pub susp fnc f(int c)... (c >>)` | `E_IO_READABLE` |
| `when c >> -> ...` | Reject until selectable semantics explicitly specified |
| `return (c >>) + 1;` | Reject incompatible type, no arithmetic on checked outcome |
| queued `Some(0)`, queued `Some(42)`, EOF, cancellation, error, blocked read | Exact parity in guest execution for both spellings |

**Evidence gates:** Each `atto-source.*` backend must report its own exact source HEAD, compiler build, *compiled .atto guest* positive and negative tests, runtime receipts, and explicit `PASS` / `UNSUPPORTED` / `NOT_EXECUTED`; host-only parser tests do not prove runtime parity. Include Rust, LLVM, Java, .NET, Wasm, Cranelift, Forge, JS, Atto, HDL, and realtime targets where those repositories implement the language compiler. Keep `atto-format` parse-equivalence and canonical round-trip tests synchronized.
