# I/O direction shorthand v1 — channels, streams and read/write capabilities

Status: **candidate syntax contract**. This document records the intended grammar and static/effect semantics, not proof of any executable compiler/backend support.

## Decision

The direction operators are typed **I/O syntax**, not general user-defined overloads:

```atto
stdio.out << "effectful output";
stdio.in >> val line;
val line << stdio.in;

do select {
    when inbox >> val message -> {
        writech stdio.out, message;
    }
    when outgoing << "ready" -> {
        writech stdio.out, "Write completed";
    }
}
```

- `source >> val item;` reads one unit from a readable source into an immutable binding.
- `source >> let item;` reads into a reassignable binding (not an assertion that the referent is mutable).
- `sink << value;` writes one value to a writable sink.
- The same operations are candidates in `when` arms of `select`, `do select`, and `nb select`, **only** for selectable capabilities.
- `readch`/`writech` stay the explicit, canonical spelling for channels. The formatter must preserve a programmer's chosen shorthand or explicit spelling rather than rewrite one to the other.

Important: `const` is strictly compile-time in current AttoLang. A runtime channel/stream read **cannot** initialize `const`; both `stdio.in >> const line;` and `const line << stdio.in;` are compile-time-effect errors. Use `val` for a fixed-name runtime value. The same restriction applies to read binders in `select` arms. `<<` with a `val/let` binding on its left is a **read**, not a sink write; it requires a readable right operand. Without an explicit binding declaration, `sink << value` remains a write.

For `Channel<T>`, this is a syntax-directed alias for the same read/write and ownership effects as `readch`/`writech`. For any other stream/source/sink, lower to its statically resolved readable/writable protocol operation; do **not** call channel-only APIs against non-channels. The exact interface names are a type-system integration task, not a dynamic operator-overload registration feature.

## Grammar (informal)

```ebnf
io_statement   = writable_expr, "<<", value_expr, ";"
               | readable_expr, ">>", ("val" | "let"), identifier, [" :", type], ";" 
               | ("val" | "let"), identifier, [":", type], "<<", readable_expr, ";" ;
select_io_arm  = "when", writable_expr, "<<", value_expr, "->", block
               | "when", readable_expr, ">>", ("val" | "let"), identifier, [":", type], "->", block
               | "when", ("val" | "let"), identifier, [":", type], "<<", readable_expr, "->", block ;
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
inbox >> val msg;
stdio.out << "received";
file_reader >> const next_chunk;
file_writer << payload;

// Selectable channels.
do select {
    when inbox >> val message -> {
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
- Reject `when inbox >> message`, `when outgoing << ->`, `inbox >> val ;`, and chained `a << b << c` in v1.
- Preserve `// inbox >> x`, `"out << x"`, nested generics, and existing `readch`/`writech` parsing.
- Prove a losing read does not consume, a losing write does not publish/move, a closed/EOF read is not a value, and a winning write is committed exactly once.
- Require actual compiled guest tests and exact-head execution receipts for each backend before changing status to PASS. Syntax-only parsers and host models are not guest-runtime conformance.


## Hardened semantic rules (normative for v1)

### Parse and capability resolution

- The operator must occupy an I/O statement or an I/O `when` guard, never an arbitrary subexpression. Reject `send << value << second` and `source >> const item >> const next` as chains. The right-hand write expression may contain nested generic type applications or parenthesized expressions; the parser must distinguish these from direction tokens by AST context.
- The receiver is evaluated **exactly once**. It must have an accessible typed `Readable<T>` or `Writable<T>` capability, as appropriate; a channel maps to its channel-specific operation. A readable-only stream cannot be written to, and a writable-only stream cannot be read from. An untyped `any`, arbitrary method named `read`/`write`, or duck-typed numeric operand cannot opt into this syntax.
- If numeric shift operators exist in an expression grammar, those remain separate AST operations with numeric operands. Do not select the I/O interpretation merely because a token pair appears in the lexer or because a numeric expression happens to be a bare statement. Invalid or ambiguous operands produce an error rather than silently switching effect domains.
- Bindings accept exactly one identifier and, optionally, a **complete** type grammar after `:`. Do not accept trailing expression tokens or malformed/incomplete generic annotations. The annotation must unify with the read operation's real result type, not be used to coerce away EOF/errors.
- `when` direction shorthand is legal only directly inside a `select` family construct and only if the capability advertises atomic selectable admission. A `when` inside a plain block cannot turn into a select arm by lexical appearance alone.

### Result and terminal-state semantics

- For a **standalone read**, `source >> const result;` binds the underlying read **outcome**, rather than falsely asserting that a `T` was received. Thus a fallible stream returning `Result<Option<T>, E>` binds that full type; consumers must explicitly handle `Err` and `None`. A channel must preserve the exact return contract of its explicit `readch` equivalent. The shorthand introduces no implicit `unwrap`, `?`, panics, or EOF-to-value conversion.
- For a **select read arm**, the binding contains `T` only when a successful data read commits. EOF, close, and errors must remain observable through the enclosing select's typed termination/error outcome or explicit terminal arm contract; they must not execute the data-success arm with a fabricated `T`. This requires an explicit backend/runtime contract before any guest implementation is marked complete.
- For writes, successful admission transfers ownership of the payload once, while close, cancellation, timeout, nonselection, and backpressure preserve or return the uncommitted payload under the underlying API's error contract. No result may be silently discarded when fallibility is checked by the language. A write arm executes its body only after successful admission.

### Atomicity and scheduling

- Select registration and commitment must have a single linearization point. Exactly one ready arm may win; losing arms must be unregistered and retain their values. A read must not remove an element until it wins, and a write must not publish a value until it wins. Close, cancellation, and concurrent readiness changes cannot turn a losing arm into a second winner.
- A write payload expression may be evaluated once to prepare a value but must not perform irreversible I/O as part of *registering* a guard. Implementations must account for any effects of payload evaluation and cannot claim speculative side effects were rolled back. Ownership is transferred only by the winning commit.
- `default` is selected only if no eligible guard is ready at the selection point. Timeout/cancellation must release registrations and payload reservations, without leaking wakeups, double-committing, or leaving stale handles. If all inputs close or no arms remain enabled, the select must reach an explicit terminal outcome rather than silently waiting forever.
- The supported I/O operation's suspension and cancellation semantics govern standalone use. `nb select` cannot execute a blocking operation inside a nonblocking arm; this syntax does not introduce an escape from effect checks, borrow restrictions, or actor-state critical-section rules.

### Required backend gates

1. AST shape and contextual tokenization: strings/comments, `Result<Option<T>>`, partial generic types, numeric shifts, malformed bindings, chains, and nested `when` must be classified correctly.
2. Compile-time capability checks: read-only/write-only misuse, incompatible payload and annotation types, unselectable streams, borrow-across-suspension, and unchecked errors.
3. Deterministic channel/stream runtime checks: close and EOF, bounded buffer backpressure, repeated selects, cancellation before and after readiness, simultaneous ready reads/writes, and losing-arm ownership.
4. Concurrency checks: close-versus-commit, cancellation-versus-commit, exactly-once wake and admission, and no lost payload with an instrumented linearization witness.
5. Exact-head CI: Rust reference/oracle tests, compiler-built AttoLang guest tests, and platform runtime tests must be reported as **separate** evidence tiers. A host reference test passing never establishes guest runtime parity.

## Hardening: asymmetric declaration syntax and precedence

The two runtime read-declaration spellings are semantically identical:

```atto
stdio.in >> val line;
val line << stdio.in;

// Inside a select: the arm only binds if it wins.
do select {
    when inbox >> val message -> { stdio.out << message; }
    when val message << inbox -> { stdio.out << message; }
}
```

`val x << source` is parsed as an **I/O binding declaration**, not a general binary operation or an assignment to `x`. Type-directed resolution must verify that `source` implements the readable contract; in contrast, `sink << value` resolves to a write on the sink. This distinction must be made by the grammar based on the leading `val`/`let` token, never by guessing from runtime values. A declaration may only introduce a fresh local binding; it cannot overwrite an existing name. `const` is never a runtime-read binder.

Outside of I/O declaration grammar, numeric bit shifts (where supported) and generic type closers remain independent syntax. There must be no dynamic operator overloading for arbitrary values. Parenthesized readable expressions, method-returned streams and index expressions require the normal expression parser and typechecker; the bounded browser preflight only recognizes qualified paths and must refuse unsupported cases without emitting bytecode.

A `select` arm can use either read-binder direction or an ordinary write, but only for statically proven SelectableRead/SelectableWrite operations. Losing arms must not consume/move, including if the source is a stream wrapping a socket or file. Selected writes must not claim success before admission and error/EOF/cancellation handling completes.
