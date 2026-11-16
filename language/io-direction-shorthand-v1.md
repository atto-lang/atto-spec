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


### Example: declaring suspension permission

The following is **target AttoLang syntax** for the full effect-aware compiler, not a claim that the present browser compiler can execute channel/stream reads:

\`\`\`atto
// Direct I/O may suspend, so this callable admits suspension and I/O.
pub suspends fnc consume_stdin(): void using io, suspend {
    stdio.in >> val read_outcome;
    inspect_read_outcome(read_outcome); // handle EOF/errors explicitly
}

// Nonblocking registration does not itself need suspension permission.
// The caller still needs I/O permission and must retain/handle the Future.
pub fnc begin_read(Channel<string> inbox): Future<ReadOutcome<string, IoError>> using io {
    return nb readch inbox;
}

// Awaiting the pending Future requires suspension permission.
pub suspends fnc finish_read(Channel<string> inbox): void using io, suspend {
    val pending = nb readch inbox;
    val outcome = await pending;
    inspect_read_outcome(outcome);
}
\`\`\`

\`ReadOutcome\`, \`IoError\` and \`inspect_read_outcome\` here stand for the actual API's checked outcome and handler; they are not declarations added by this proposal. The target compiler must resolve those types, I/O permissions and effects rather than trusting a source comment or a nominally immediate underlying implementation. Being marked \`suspends\` permits a suspension but does not force one.


## Stdio output admission: unbounded logical channel, non-suspending sender

**Normative contract.** `stdio.out` (and `process.stdout`, the same channel endpoint) is an ordered, asynchronous, *logically unbounded* channel of output messages. Logical unboundedness means it has **no finite channel-slot count** that makes a normally admitted send wait for a reader or operating-system write readiness. It is not an infinite-memory guarantee. `stdio.err` follows the same admission model; `stdio.in` does not.

```atto
// Both are effectful I/O, but do not have the suspend effect.
pub fnc greet(): void using io {
    writech stdio.out, "Hello";
    stdio.out << " world";
}

// This can suspend while awaiting asynchronous sink progress:
pub suspends fnc finish(): void using io, suspend {
    await stdio.out.flush();
}
```

The two write spellings are identical after capability resolution. For this special output endpoint, `writech stdio.out, value` **must not park/suspend the calling task/actor on channel capacity or OS backpressure**. A normal successful send reserves queue resources and atomically admits exactly one typed payload. It does not wait for formatting, terminal acknowledgement, pipe draining or a consumer's availability. The send retains its ordinary `io` effect and its existing channel send outcome (`Result` or language-equivalent); **a successful admission is not a delivery or durability receipt**.

**Resource and lifecycle behavior:**

1. A closed or revoked output endpoint rejects admission with a typed closed/capability error. No payload is consumed on a failed send.
2. Queue-memory or per-actor/per-process byte quotas reject admission with an explicit resource/quota error **without suspending**. A backend must not silently drop, truncate or pretend to accept a payload it cannot retain. Quotas are implementation-specific but must be exposed by the target profile.
3. Payload transfer/borrowing and formatting must be well-defined: retain immutable owned data or produce an owned encoding *before* reporting admission. Do not queue a pointer to a stack-local or mutable transient buffer. A failed admission leaves ownership with the caller.
4. The queue is FIFO by the linearization order of successful admissions to a single endpoint. Concurrent actor senders can interleave, but one message is not partly admitted or replayed. The background writer alone handles OS-level readiness and potentially suspending drain.
5. `await stdio.out.flush()` waits for all messages admitted before its linearization point to pass through the target's output-drain contract. It **may suspend** and may report I/O failure, cancellation or closure. It is not automatically `fsync` and cannot promise consumption by a remote terminal.
6. Process shutdown and actor termination require explicit, bounded drain/cancellation policy. No implicit unbounded wait during actor panic or supervisor teardown. The compiler must never infer a `suspends` effect from the mere potential that stdout's consumer is slow.
7. A `select` write arm on this endpoint is immediately *admissible* only when the channel is open and its queue resource reservation succeeds. Readiness is not a guarantee of unlimited RAM. A winning write atomically reserves/adopts its payload once; losing arms retain ownership. Implementations must preserve fairness for competing read arms even when stdout is continuously ready.
8. `nb writech stdio.out, value` and `nb stdio.out << value` are valid but redundant for suspension: their ordinary `nb` return contract still applies, not a new ad-hoc payload or fire-and-forget type.

**Capability typing:** provide a semantic distinction between potentially suspending `Writable<T>` and `NonSuspendingWritable<T>` (or an equivalent compile-time effect/capability marker). For a verified non-suspending writer, ordinary `writech` is legal in an `io`-authorized function **without** `suspends`. A bounded channel whose capacity may be full does not satisfy this capability. A generic `Writable<T>` cannot be treated as non-suspending merely because a particular write happens to complete synchronously.

**Backend evidence:** a browser host that captures stdout into a fixed-size display buffer is **not** an unbounded channel. It may provide a non-suspending **quota-bounded profile** only if quota exhaustion yields an explicit failure with no truncation of an accepted write. The existing `atto.print_*` Wasm host import can demonstrate direct, non-parking admission in that restricted profile, but cannot prove the language-wide asynchronous stdout/flush runtime. Verify native and browser admission, slow-pipe backpressure, quota, closure, ownership, ordering, fairness and drain separately.

### Required executable tests

- `writech stdio.out, "Hello";` and `stdio.out << "Hello";` compile without `suspends`, still require `io`, and produce identical output order.
- A deliberately stalled OS sink does not stall a writer on channel-capacity readiness; a requested `flush()` may suspend and report failure.
- Concurrent actors preserve atomic FIFO admission and successful writers are never replayed; cancellation before admission retains payload.
- Exhausted quota and closed writer return errors without suspending, consuming data or returning success; no successful write is silently dropped.
- `select` with an output arm and other ready arms observes fairness and commits only its winner, including under resource exhaustion.


## Candidate extension: supervised `do` I/O, callbacks, and detached-operation safety

Status: **syntax/semantics candidate**, no general compiled guest support. This section does not change the established meanings of `do select`, `do nb select`, `do match`, or other existing `do` contexts. A `do` immediately governing a channel operation is a specific *supervised detached I/O* form, **not** a blanket change to every `do` statement.

### Proposed syntax

```atto
// Direct: follows underlying I/O completion/effect contract.
writech foo, "hi";
foo << "hi";

// Nonblocking: returns Future<actual checked write outcome>.
val pending = nb writech foo, "hi";
nb foo >> val read_future; // Future<actual checked read outcome>

// Detached, supervised operation: no future is returned to caller.
do writech foo, "hi";
do foo << "hi";

// Optional completion callback (no args = success-only).
do writech foo, "hi", || -> void { log_success(); };

// Recommended typed outcome callback (success and failure).
do writech foo, "hi", |outcome| -> void {
    handle_write_outcome(outcome);
};

// Read must deliver its result to an explicit consumer.
do readch foo, |outcome| -> void {
    handle_read_outcome(outcome);
};
```

`log_success` and `handle_*_outcome` are placeholders for user-defined functions. A successful *channel write* means admission according to the channel protocol; it does **not** promise OS flush, persistence or delivery to an external peer. Stream APIs must define what their own write completion means.

`do readch foo;` with no callback or output sink is **invalid by default**: it would silently consume an application message. For deliberate drains, require a separately named/typed discard or drain operation with explicit effect and supervision; do not turn `do readch` into accidental message disposal. `do foo >> val x` is invalid: a detached task cannot bind a local value in the caller's now-ended scope. The first version does not add a direction-only detached-read alternative.

### Detached operation lifecycle

1. `do writech` schedules a *supervised child I/O task*, with exactly one operation owner and a bounded runtime admission mechanism; it never calls a blocking OS I/O primitive on the caller/carrier. It must not imply an unlimited number of pending tasks. Registration/allocation/quota failures must be delivered synchronously as a declared error or to the supervisor, never silently dropped.
2. A detached operation can be queued when the underlying bounded channel is not ready, but it may eventually fail (closed, cancelled, quota, timeout, shutdown). The scheduler retains an owned payload until exactly one admission/terminal transition. The owner must not reuse a moved buffer; an uncommitted payload must be returned/cleaned up under the declared contract. No duplicate admission.
3. The child belongs to the invoking actor/task group. On teardown it must either complete under an explicit join policy or be cancelled and report the cancellation. Detached is **not** orphaned; it does not permit use-after-free of borrowed stack/actor-state data or cross critical-read/write suspension boundaries.
4. **With no callback**, terminal failures are delivered to the supervisor's dedicated control/error path. A runtime with no error sink/supervisor must reject unobservable `do` I/O or require an explicit error handler.
5. A callback accepting the typed completion outcome receives exactly one terminal event. A zero-argument `|| -> void { ... }` callback is invoked on **success only**; failure is still delivered to supervisor. Callbacks cannot erase checked failures merely by omitting parameters. A callback that explicitly handles an error may avoid escalation according to the ordinary actor error policy; panic cannot be swallowed.
6. Callback execution uses the owning task/actor scheduler, not a reactor/carrier thread holding I/O locks. `-> void` callbacks are non-suspending unless explicitly marked/effect-checked; no direct access to sealed actor state outside critical callbacks. Callback lifetime, capture move/borrow and cancellation have the same checks as other async closures.
7. The language's `using io` permission is required for direct, `nb`, and `do`. `pure` forbids them all. A `do` registration does not itself require `suspends` if guaranteed nonparking, but the child operation may suspend under the runtime's own authorization; effect-check callback and task body independently. `await` still needs suspension authority in the executing callable.
8. Bare `nb writech foo, "hi";` returns a Future which must be observed, transferred or explicitly detached. A strict profile should reject discarding a checked pending Future; use `val pending = nb writech ...` or `do writech ...`. This prevents mistakenly treating `nb` as fire-and-forget.
9. Prefix `do sink << value;` may be accepted as the same supervised write as `do writech sink, value;` with the same source-level expression ownership and error routing. `do` does not modify `<<`/`>>` semantics generally and does not add the proposed glyph operators `<<!`, `!>>`, `<<:` or `:>>` to v1: explicit mode prefixes are clearer, avoid shift/annotation token conflicts, and preserve existing parser rules.

### Proposed extension: typed read–await continuations

**Candidate syntax, not an assertion of executable guest support.** The two
forms below have the same typed, sequential effect. A leading `nb` controls
**read registration only**; an explicitly written `await` may then suspend
the *enclosing* `suspends` callable. Neither form detaches work or installs
a callback. The resolved binder enters lexical scope **after** the successful
await and stays available in the remaining statement scope.

~~~atto
// First spelling: contextual Future<T> is a TYPE SLOT supplied by nb read,
// not a constructor, expression, or evaluated generic.
nb incoming >> (val Outcome resolved << await Future<Outcome>);

// Second spelling: '|' is a delimiter ONLY in this typed I/O continuation
// production, not a replacement for functional '|>'.
nb incoming >> Future<Outcome> pending
    | await pending >> val Outcome resolved;

// Equivalent explicit desugaring:
nb incoming >> val pending: Future<Outcome>;
val resolved: Outcome = await pending;
~~~

Here `Outcome` is a type variable standing for the **actual checked return
value** of a readable capability, not a language-defined type or an implicit
unwrap. For ordinary stdin the outcome could be
`Result<Option<string>, IoError>` (the exact signature remains subject
to the concrete stdio capability). A bare `String` binder is allowed
**only** when the capability really provides a `Future<String>` without
discarding error, EOF, closure, or cancellation. Therefore the literal
`nb stdio.in >> ... Future<string>` examples are *syntactically recognized
candidates* but must fail at type checking for a fallible/EOF-bearing stdin.
Do not claim they execute as written against raw stdin.

**Constrained grammar (illustrative EBNF):**

~~~ebnf
nb_await_read = "nb", readable_expr, ">>",
    ( "(", binding_decl_head, "<<", "await", future_type_slot, ")"
    | future_type_slot, identifier, "|", "await", identifier,
      ">>", binding_decl_head ) ;
binding_decl_head = ("val" | "let"), (type_ref, identifier | identifier, ":", type_ref);
future_type_slot = "Future", "<", complete_type_ref, ">" ;
~~~

- Parse `Future<T>` in these two positions as a **contextual typed
  placeholder** for the result of the preceding `nb` registration; it is
  not a runtime expression and does not change what `await` means elsewhere.
- The future placeholder must match the *entire* result, including
  `Result`/`Option`/EOF/typed errors. The final binder type must unify
  with the resolved future value; no implicit `?`, panic, unwrap, or
  error/EOF flattening is permitted.
- In the second spelling, `await pending` must refer to precisely the
  declared future binder, which cannot escape or be consumed twice. The
  `|` delimiter is admitted **only** after the typed intermediate binder;
  elsewhere `|` keeps its existing boolean/other expression meanings.
- Operand evaluation and read registration occur once before await. `nb`
  admission does not park; the explicit subsequent await may suspend or
  cooperate. The caller must have `using io` and `suspends` permission,
  and borrow/lease checking must forbid suspended stack loans and sealed
  actor-state leases.
- If registration itself fails immediately, that failure must appear in
  the declared checked contract and must not be converted into an unresolved
  future. Cancellation, close, EOF and other terminal outcomes remain
  typed and observable.
- Type parsing must disambiguate nested generic close `>>` from the
  direction operator; reject free-standing `Future<T>` runtime values,
  unbound/mismatched await identifiers, missing delimiters, and direction
  chains outside this production.
- Until the checked guest `Readable<T>`/Future ABI and checker are
  implemented, the browser compiler must fail closed with a stable
  unsupported diagnostic and emit **no guest Wasm**. Recognition in a
  parser is not evidence of executable stdin I/O.

### Required conformance gates

- Direct / `nb` / `do` / `try` I/O and explicit `readch`/`writech` must have **distinct AST modes** with no confusion with `do select` or `do nb select`.
- Runtime checks: admission of bounded writes, credit exhaustion and quota failure; supervisor error path when there is no callback; callback once on terminal success/failure; cancel vs commit; no payload duplication; no callback after owner destruction; no stack loan escaping the caller.
- Negative parse/type tests for bare `do readch`, detached local read binders, `nb readch foo >> Future<string> foo`, a standalone `await Future<string>` expression outside the contextual nb-read continuation production, `do` under `pure`, missing I/O capability, and bare discarded checked Futures.
- A Rust host model or syntax-only preflight must be reported separately from actual compiled `.atto` guest runtime/driver evidence. **No claims of executable support** until each backend runs a real channel and stream fixture from an exact SHA-pinned artifact.
