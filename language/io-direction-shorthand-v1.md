# I/O direction shorthand v1 — channels, streams and read/write capabilities

Status: **candidate syntax contract**. This document records the intended grammar and static/effect semantics, not proof of any executable compiler/backend support.

## Decision

The direction operators are typed **I/O syntax**, not general user-defined overloads:

```atto
stdio.out << "effectful output";
stdio.in >> const line;

do select {
    when inbox >> const message -> {
        writech stdio.out, message;
    }
    when outgoing << "ready" -> {
        writech stdio.out, "Write completed";
    }
}
```

- `source >> const item;` reads one unit from a readable source into an immutable binding.
- `source >> let item;` reads into a reassignable binding (not an assertion that the referent is mutable).
- `sink << value;` writes one value to a writable sink.
- The same operations are candidates in `when` arms of `select`, `do select`, and `nb select`, **only** for selectable capabilities.
- `readch`/`writech` stay the explicit, canonical spelling for channels. The formatter must preserve a programmer's chosen shorthand or explicit spelling rather than rewrite one to the other.

For `Channel<T>`, this is a syntax-directed alias for the same read/write and ownership effects as `readch`/`writech`. For any other stream/source/sink, lower to its statically resolved readable/writable protocol operation; do **not** call channel-only APIs against non-channels. The exact interface names are a type-system integration task, not a dynamic operator-overload registration feature.

## Grammar (informal)

```ebnf
io_statement   = writable_expr, "<<", value_expr, ";"
               | readable_expr, ">>", ("const" | "val" | "let"), identifier, [" :", type], ";" ;
select_io_arm  = "when", writable_expr, "<<", value_expr, "->", block
               | "when", readable_expr, ">>", ("const" | "val" | "let"), identifier, [" :", type], "->", block ;
```

A statement may also use a parenthesized source/sink and a qualified path (`stdio.out`, `streams.output`). The token pairs must be contiguous: `<<` and `>>`, not `< <` / `> >`. Nested generic closing delimiters such as `Result<Option<int>>` remain distinct by grammar context. Numeric bit shifts are not retroactively I/O; no inferred channel creation, arithmetic shift-to-I/O conversion, or arbitrary class operator overloading is permitted. v1 rejects chained I/O operators without explicit sequencing.

## Typing, errors, EOF, and ownership

1. Left-hand operand must resolve statically to a readable/writable capability of the corresponding element type. Otherwise emit a type error. Writing an incompatible value must fail at compile time. Read binder scope is the statement's remaining lexical scope or the winning select arm, as applicable.
2. Reads/writes evaluate operands only once, preserve the underlying operation's result, error, EOF/closed-state, and cancellation contract, and never silently discard errors. For streams, an element read might produce `Option<T>` or `Result<Option<T>, E>`; shorthand must not flatten or disguise that result. For a channel, preserve the channel's existing close semantics.
3. For a write, ownership transfers only upon successful admission/commit. A rejected or losing selectable write retains the original value and cannot produce a duplicate effect.
4. Cooperative suspension is allowed for ordinary I/O; no OS-thread parking is implied. The `try` / `nb` forms and any future I/O shorthand prefixes must preserve existing scheduling behavior, not infer nonblocking from `<<`/`>>`.
5. Select arms register **atomic** alternatives. Exactly one arm commits. Reads in losing arms consume nothing; writes in losing arms publish nothing. Candidate-value evaluation must not itself perform irreversible I/O; a selected arm cannot speculatively call `read()`/`write()` before winning. Losing registrations are safely canceled/disposed.
6. Generic streams are **not** automatically selectable. A type must separately implement checked/selectable read or write admission, atomic commit, and cancellation/ownership rollback. Ordinary file/socket/readiness APIs without those guarantees must be rejected in select arms.
7. Backpressure, bounded buffering, close, cancellation, task/actor ownership, effect checking, and error handling remain the responsibility of the underlying I/O contract. A stream with a terminal EOF event must not turn EOF into a phantom data message. An `io << data` statement that returns a fallible result cannot implicitly swallow that result where the language requires checked effects.

## Examples

```atto
// Standalone channel and stream operations.
inbox >> const msg;
stdio.out << "received";
file_reader >> const next_chunk;
file_writer << payload;

// Selectable channels.
do select {
    when inbox >> const message -> {
        stdio.out << message;
    }
    when outgoing << "ready" -> {
        stdio.out << "write admitted";
    }
    default: { stdio.out << "idle"; }
}
```

The `file_reader` and `file_writer` lines above are candidate source spellings for correctly typed capabilities, **not claims** about current file I/O APIs or compiler execution. A file descriptor does not become selectable merely because it is readable.

## Required negative and conformance cases

- Forbid `42 << "data"` and `"data" >> const message` unless their types implement the I/O capabilities (numeric shift remains a distinct grammar/typecase).
- Reject `when stream << payload` when that stream cannot commit/cancel an atomic select write.
- Reject `when stream >> const item` when it cannot commit/cancel an atomic select read.
- Reject `when inbox >> message`, `when outgoing << ->`, `inbox >> const ;`, and chained `a << b << c` in v1.
- Preserve `// inbox >> x`, `"out << x"`, nested generics, and existing `readch`/`writech` parsing.
- Prove a losing read does not consume, a losing write does not publish/move, a closed/EOF read is not a value, and a winning write is committed exactly once.
- Require actual compiled guest tests and exact-head execution receipts for each backend before changing status to PASS. Syntax-only parsers and host models are not guest-runtime conformance.
