# I/O direction shorthand v1 — channels, streams and read/write capabilities

Status: **candidate syntax contract**. This document records the intended grammar and static/effect semantics, not proof of general executable compiler/backend support. The Rust/Wasm browser subset has a draft implementation of **standalone `stdio.out << value`** and **`writech stdio.out, value`** via its existing checked `stdio.print` lowering (atto-source.rs #176), but no passing exact-head guest test has been observed. General channels, stream reads/writes, and atomic `select` remain unsupported in that compiler.

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
file_reader >> val next_chunk;
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

- Reject `42 << "data"` as an invalid numeric shift or non-writable value, and `"data" >> val message` because an immutable string is not a readable capability; reject any runtime read into `const` regardless of operand type.
- Reject `when stream << payload` when that stream cannot commit/cancel an atomic select write.
- Reject `when stream >> val item` when it cannot commit/cancel an atomic select read.
- Reject `when inbox >> message`, `when outgoing << ->`, `inbox >> val ;`, and chained `a << b << c` in v1.
- Preserve `// inbox >> x`, `"out << x"`, nested generics, and existing `readch`/`writech` parsing.
- Prove a losing read does not consume, a losing write does not publish/move, a closed/EOF read is not a value, and a winning write is committed exactly once.
- Require actual compiled guest tests and exact-head execution receipts for each backend before changing status to PASS. Syntax-only parsers and host models are not guest-runtime conformance.


## Hardened semantic rules (normative for v1)

### Parse and capability resolution

- The operator must occupy an I/O statement or an I/O `when` guard, never an arbitrary subexpression. Reject `send << value << second` and `source >> val item >> val next` as chains. The right-hand write expression may contain nested generic type applications or parenthesized expressions; the parser must distinguish these from direction tokens by AST context.
- The receiver is evaluated **exactly once**. It must have an accessible typed `Readable<T>` or `Writable<T>` capability, as appropriate; a channel maps to its channel-specific operation. A readable-only stream cannot be written to, and a writable-only stream cannot be read from. An untyped `any`, arbitrary method named `read`/`write`, or duck-typed numeric operand cannot opt into this syntax.
- If numeric shift operators exist in an expression grammar, those remain separate AST operations with numeric operands. Do not select the I/O interpretation merely because a token pair appears in the lexer or because a numeric expression happens to be a bare statement. Invalid or ambiguous operands produce an error rather than silently switching effect domains.
- Bindings accept exactly one identifier and, optionally, a **complete** type grammar after `:`. Do not accept trailing expression tokens or malformed/incomplete generic annotations. The annotation must unify with the read operation's real result type, not be used to coerce away EOF/errors.
- `when` direction shorthand is legal only directly inside a `select` family construct and only if the capability advertises atomic selectable admission. A `when` inside a plain block cannot turn into a select arm by lexical appearance alone.

### Result and terminal-state semantics

- For a **standalone read**, `source >> val result;` binds the underlying read **outcome**, rather than falsely asserting that a `T` was received. Thus a fallible stream returning `Result<Option<T>, E>` binds that full type; consumers must explicitly handle `Err` and `None`. A channel must preserve the exact return contract of its explicit `readch` equivalent. The shorthand introduces no implicit `unwrap`, `?`, panics, or EOF-to-value conversion.
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


## Nonblocking and suspension modes (v1 addition)

The direction shorthand is an *effect-checked operation*, not intrinsically blocking or intrinsically nonblocking. The resolved Readable/Writable operation advertises whether its direct completion can suspend. Actual readiness may complete synchronously, but a compiler must reject a potentially suspending call in a context that lacks \`suspends\` even if it happens to be ready at runtime.

| Source form | Static effect | Binding/result |
|---|---|---|
| \`source >> val item;\` | Underlying direct read effect (possibly suspending) | Completed read outcome |
| \`sink << value;\` | Underlying direct write effect (possibly suspending) | Completed write outcome |
| \`nb source >> val pending;\` | Register/return promptly; never suspend caller | \`Future<ReadOutcome<T,E>>\` |
| \`nb sink << value;\` | Register/return promptly; never suspend caller | \`Future<WriteOutcome<E>>\` when captured |
| \`try source >> val immediate;\` | Never suspend | Immediate readiness/read outcome |
| \`try sink << value;\` | Never suspend | Immediate readiness/write outcome |

The \`ReadOutcome\` / \`WriteOutcome\` names above are illustrative schema parameters, **not new required AttoLang nominal types**. Use the concrete readable/writable capability's result type, retaining \`Option\`, \`Result\`, EOF, closure, cancellation and ownership errors. Channel-specific contracts continue to dictate exact future generic parameters; there is no blanket \`Future<string>\` promise for all streams and channels.

Standalone read and explicit \`nb readch\`/ \`nb writech\` examples:

\`\`\`atto
// Inside a callable that admits 'io, suspend' effects:
stdio.in >> val line;
val line2 << stdio.in;

// Any effect-appropriate callable: registration returns a Future, not data.
nb stdio.in >> val pending_line;
val pending2: Future<ReadOutcome<string, IoError>> = nb readch inbox;

// Direct named, nonblocking channel operations (same underlying contracts).
val pending_write = nb writech outgoing, "hi";
val pending_read  = nb readch inbox;

// The next statement may suspend because it AWAITS the future:
val result = await pending_read;
\`\`\`

\`nb readch foo >> Future<string> foo;\` is deliberately **not** the syntax. It confuses a completed-channel read with a future result, omits the \`val\` / \`let\` binder, uses an ambiguous repeated name, and attempts to append a second direction operator to an already specified \`readch\` operation. Use \`val pending = nb readch foo;\` or \`nb foo >> val pending;\`; optionally annotate the latter binding as \`Future<ActualReadOutcome>\`. A type annotation does not erase EOF or errors.

\`nb\` scopes one I/O operation when prefixed to the handle (\`nb foo >> val pending\`, \`nb foo << value\`), not to a \`when\` guard. A standalone reversed form may use \`val pending << nb foo;\` only if a dedicated grammar explicitly defines it; **v1 does not admit that spelling**. No generic \`Future<T> << source\` assignment form is introduced.

\`try\` is an immediate readiness attempt, not error catching and not \`trap\`; it may return not-ready without consuming/committing. The type checker must distinguish its readiness result from \`Result<T,E>\` error propagation and ordinary completed reads. \`try\` must not start irreversible work or create a pending future.

### Effect and select rules

- A function marked \`suspends\` is allowed to perform operations whose static effect includes suspension (subject to its \`using\` permissions); it need not suspend on every call. A function **without** \`suspends\` may perform only statically proven immediate read/write operations, explicit \`try\` attempts or \`nb\` registrations, provided I/O permission is present. \`pure\` forbids I/O even for \`nb\` or \`try\`.
- Nonblocking means **the caller does not suspend or park** while registration is admitted. It is not a promise of successful delivery or readiness. The returned future is completed only after the operation succeeds, fails, closes or is cancelled; a synchronous failure to register is reported through the declared API contract.
- Captured futures cannot silently be dropped where typed effect/lifecycle rules require handling. A \`Future<T>\` is not equal to \`T\`; an \`await\` on a pending future requires suspension authority.
- \`when nb source >> val x ->\`, \`when try source >> val x ->\` and \`when nb sink << value ->\` are **invalid**: the enclosing \`select\` arbitrates registrations itself. The supported spelling is \`do nb select { when source >> val x -> { ... } }\`, with the existing select-specific arm cancellation/commit behavior.
- A \`do nb select\` registration must not suspend its caller; the winning arm may use effects only as permitted by its owner/task context. \`select<T>\` and \`nb select<T>\` return types remain specified by their separate select contract; do not confuse a future of the selection with a future of an individual read.
- Stream I/O is nonblocking only if its implementation actually supports nonparking asynchronous admission. An OS-level blocking API cannot be hidden behind \`nb\`. An immediately available operation may complete without suspension in the ordinary form, but dynamic readiness cannot justify omitting static \`suspends\` authority.
- The compiler must fail closed on unsupported mode, capability, result-type, or effect combinations; parser recognition alone is not proof of guest runtime support.

### Required positive/negative cases for this extension

1. Accept syntax-only \`nb stdio.in >> val pending;\`, \`nb outgoing << "hi";\`, \`try stdio.in >> val immediate;\`, and the corresponding ordinary forms, preserving mode and binder AST/preflight metadata.
2. Reject \`nb readch foo >> Future<string> foo;\`, \`when nb inbox >> val x ->\`, \`when try inbox >> val x ->\`, \`when nb outgoing << 1 ->\`, and \`nb foo >> const pending;\` with stable diagnostics.
3. Reject potential suspension inside non-\`suspends\` or \`pure\` callables at the checked effect boundary, and reject nonparking guarantees that the underlying stream cannot satisfy.
4. Prove \`nb\` read/write futures have exactly-once completion, correct error/EOF/closure semantics and cancellation/ownership reclamation. Futures must not capture transient borrows across task suspension or actor stop.
5. Test standalone, \`suspends\`, \`do select\`, and \`do nb select\` separately; do not use host reference-model execution as a substitute for actual compiled Atto guest tests.


## Browser compiler admission boundary (implementation note)

The restricted browser compiler may prove a *narrower* executable subset than this syntax contract. In that profile, direct `stdio.out << value;`, parenthesized `(stdio.out) << value;`, and explicit `writech stdio.out, value;` can lower to the existing typed `stdio.print(value)` Wasm import. That lowering is permitted **only** for direct standalone output with no select registration or `nb`/`try` mode. It does not establish general Channel<T>, Stream<T>, stdin, stderr, or atomic select execution.

The syntactic `stdio.out` shortcut must never bypass lexical capability resolution: if a local or parameter named `stdio` shadows the builtin namespace, the restricted backend must fail closed, rather than silently printing to the built-in host output and ignoring the local. A complete backend should instead resolve the actual receiver's statically checked capability.

A `when` I/O direction guard is valid only when its **immediately enclosing** block is a `select` family block, including a typed form such as `select<Result<Option<int>, Error>> { ... }`. Nesting a plain `block` or `if` body inside a select does not make arbitrary inner `when` statements new select registrations. Local `nb` or `try` prefixes on individual select guards remain invalid.

Browser preflight recognition, Rust host oracles, and compiled guest execution have separate evidence tiers. A compiler diagnostic or a successful source-only test is not proof of the corresponding transport, cancellation, or scheduler behavior. In particular, host-model tests cannot by themselves validate races between real operating-system readiness callbacks, actor mailboxes, scheduler preemption, or shutdown.
