# Oreslang Core Language — Editor's Draft

**Edition:** 0.1  
**Updated:** 2026-11-04  
**Status:** Draft language contract; examples are not evidence of compiler support.  
**Conformance:** See [conformance.md](conformance.md); backend implementation requirements in [compiler-runtime-contract.md](compiler-runtime-contract.md).

## 1. Principles and terminology

Oreslang is an actor-first, statically checked systems language with functional, object-oriented and data-oriented facilities. The language definition is independent of JVM, LLVM, Wasm, Cranelift and .NET implementation choices.

A **value** is an Oreslang semantic value, not a raw backend address. An **actor** is an isolated execution and ownership domain with a mailbox, lifecycle, and supervisor relationship. **Observable behavior** includes returned values, language-level errors, permitted event orderings, resource admission, and lifecycle transitions; it excludes addresses, GC timing, compiler internal stack traces, and nondeterministic interleaving choices.

The keywords MUST and MUST NOT below describe the **proposed normative contract**, not implemented coverage. Explicitly marked **open questions** have no default behavior.

## 2. Lexical and declaration conventions

### 2.1 Names and modifiers — established design direction

- Function and method identifiers use **snake_case**. Names such as get_done, capture_trace and handle_state are canonical.
- Public declarations use the canonical ordering **define pub**; parsers may accept **pub define** as a compatibility spelling and format to the canonical form.
- Instance methods inside classes and actors may omit the keyword method; legacy fnc is accepted for compatibility and formatted to the bare method form. Top-level functions use fnc.
- Statically dispatched members may use static fnc.
- The formatter MUST preserve semantic meaning and MUST NOT legalize an invalid program by rewriting it.
- Nonstandard compound keywords include critical-read, critical-write, nb-select and transform-pipe where defined by the language grammar; the lexer must treat the intended compound token unambiguously.

Illustrative declarations:

~~~ores
define pub module telemetry as
  define pub fnc record_event(String event_name) -> void as
    // implementation
  end
end

define actor Worker as
  receive(Message message) -> void as
    // implementation
  end
end
~~~

Exact parameter-list and body separators must be validated against the canonical grammar before a declaration is classified as parser-conformant.

### 2.2 Classes, traits and supervisors — established direction with open details

- define class introduces a class; define actor introduces a special class with actor isolation and lifecycle rules; define supervisor introduces a supervisor with a CONTROL path.
- Actors may implement appropriate traits/interfaces and inherit only from actor-compatible base types. A normal mutable class cannot silently become an actor by inheritance.
- Sealed and non-sealed class forms are part of the intended type model.
- Child-process facilities should be expressed as a typed actor base (for example, extends ChildProcManager), not a new unrelated language keyword.
- HTTP/TCP/WebSocket actor shorthands must desugar to a typed actor plus configuration; shorthands cannot weaken the core actor contract.
- Whether a given trait is actor-safe is a static property of its effects and instance-state requirements; generic superclass compatibility requires explicit validation.

**Open:** The exact inheritance lattice, abstract method syntax, override rules, actor constructor restrictions and trait coherence rules require a separate ratified grammar and type-system chapter.

### 2.3 State containers and virtual actors — candidate contract

The proposed declaration heads are `define state container Name as ... end` and `define virtual actor Name as ... end`. These are **new declaration kinds**, not aliases of ordinary classes or runtime-transparent actor spawning. The tokens `state` and `virtual` are contextual in declaration position. `grain` is not an alias. The state container protects mutable heap referents through `handle_state(critical-read/critical-write ...)`; the virtual actor adds logical key identity, fenced activation and an explicit storage policy while preserving actor isolation/supervision. See the [candidate full contract](state-containers-and-virtual-actors.md). No backend implementation is established by this draft.

### 2.4 Fields and qualifiers — established direction

- Class fields without a written mutability qualifier default to an implicitly immutable val; the formatter may omit redundant val after verifying equivalent semantics.
- let denotes mutable binding where permitted; final denotes single assignment; const requires a compile-time constant.
- A final const field with a proven constant initializer is formatter-equivalent to final. The compiler must check constant evaluation before canonicalization.
- An assignment expression may not replace a comparison in an if condition; use eq or == according to accepted grammar.
- Conditional binding uses **if expression as const name then ... fi** for immutable binding or **as let name** for mutable binding. A final conditional binding is invalid.
- Conditional presence matching tests presence, not generalized truthiness.

**Open:** Full val/let capture, definite-assignment, visibility, constructor and constant-evaluation formalism.

## 3. Types and values

### 3.1 Type families

The language intends primitive numeric and boolean types, strings, Symbol, nominal classes, records/structs, enumerations, algebraic data types, arrays/vectors, pointers/ownership handles, Option<T>, Result<T,E>, channels, actors, and callable types.

Types have semantic identities independent of target machine word size. Fixed-width integers MUST have stable bit widths across backends. Backend data layout MUST NOT silently change the meaning of a language type.

- **Enum and ADT:** nominal cases and sum/product constructors; matching uses declared case identity and checks impossible/duplicate arms.
- **Structural views:** the planned structural/struct syntax supports structural requirements where explicitly allowed, but MUST NOT silently erase nominal identity.
- **Symbol:** source form is #name or the permitted #with spaces form; the string "#name" is not a Symbol.
- Core/predefined Symbol identities may be globally shared; user-defined symbol identity is **not** implicitly shared across isolates. Identity and serialization semantics must be explicit.
- **Option and Result:** explicit absence/error, map/and_then/map_err, pipeline composition, and early-return with ?.
- **Pointer<T>:** transport depends on copying, shared ownership, or explicit taking; copying a raw address is not portable serialization.

### 3.2 Generics — established direction

Generic parameters may have defaults; named arguments may supply selected parameters and dependent defaults may reference preceding parameters. Type checking, overload resolution and formatting must agree on the resolved substitutions.

Candidate example:

~~~ores
// A dependent default is resolved in declaration order.
define class Cache<A, B=A> as
end

// Named arguments are resolved by declared name, not by supplied order.
~~~

**Open:** Variance, specialization, inference across overloaded candidates, and complete bounds grammar.

### 3.3 Overloads

Overload resolution first separates candidates by arity. The intended nominal enum distinction may disambiguate where allowed. Pure structural-shape distinctions MUST NOT silently determine overload identity. Failure to resolve must be a diagnostic, not a runtime guess.

## 4. Expressions, control flow, and pipelines

### 4.1 Match and switch — established direction

- The language accepts match value over ... end; do match may be accepted and formatter-normalized.
- return match ... over ... end participates in enclosing return-type inference.
- Typed arms are intended for match<T>, switch<T> and select<T>.
- Arms use first-match semantics, subject to duplicate/redundant-case checking. A wildcard _ is the fallback arm.
- Numeric-equivalence, including 1 compared with 1.0, needs explicit conversion and equality rules; do not delegate equivalence to host-language object equality.
- A switch/match arm for Symbol #ready MUST NOT match string "#ready".

**Open:** Complete patterns, guards, float NaN/negative-zero matching and exhaustive-check requirements for each type family.

### 4.2 Pipes — established direction

Functional composition uses |>. Actor pipeline composition uses a distinct pipe keyword:

~~~ores
let next = input |> normalize |> validate
spawn Decoder() pipe spawn Encoder()
~~~

The actor-pipeline syntax shown above is illustrative until the exact AST and lifecycle semantics are ratified. The two operators MUST NOT be conflated by a backend.

### 4.3 Select, await, and cooperation

- await may suspend an actor/task at defined suspension points.
- do select supports return when a selected arm exits the enclosing callable; typed select<T> arms must agree on the return contract.
- Nonblocking channel-read operations are disallowed inside select arms where they subvert blocking/registration semantics.
- Every backend must preserve observable cancellation, channel closure, and branch commitment semantics.
- Cooperative reduction/time budgets and inserted rt cooperate points are intended for fairness, but scheduling choices are not part of deterministic language output.

**Open:** The select winner/fairness policy, cancellation race precedence, and guarantees under watchdog preemption.

## 5. Ownership and memory safety

### 5.1 Ownership principles — proposed normative contract

Ownership and borrowing apply to heap objects as well as stack locals. The static checker must reason about *referents*, aliases, lifetime and concurrency domains, not simply variable storage locations.

- Each exclusively owned mutable region has exactly one authorized mutable owner at a time.
- Shared immutable borrows may coexist when they cannot race with mutation.
- A mutable borrow excludes conflicting mutable or immutable borrows of the same region during its lifetime.
- Taking a value invalidates subsequent use through the moved-from capability except where the language proves independent residual fields.
- Sharing mutable state requires an explicit concurrency-safe abstraction, not merely reference counting.
- A successful transfer into another ownership domain invalidates sender ownership where the transfer kind is take.
- Any borrow retained across await, select, actor handoff or critical-region exit must have a proven safe lifetime and aliasing discipline.
- Native pointers, Java object references and Wasm indices are backend representations; none is permission to bypass these rules.

Ownership operations in the established design direction include:

~~~ores
rt borrow value
rt borrow mut value
rt take value
rt copy value
rt share value
rt ref value
rt deref value
rt unref value
~~~

These are conceptual forms; their operand grammar, expression results and effect typing require formalization. A backend MUST NOT silently treat take as copy or share.

### 5.2 Boxes, vectors and reference-counted handles

Box-like exclusive heap ownership, Vec-like resizable containers, and Arc-like shared handles must preserve Oreslang's ownership semantics even where the JVM uses GC or the native runtime uses arenas and reference counting. Arc-like shared ownership does not make unsynchronized mutable access legal.

For cross-actor messages, distinguish **Sendable** (safe to hand off between local actors) from **Serializable** (can be encoded on a wire). Neither implies the other without a stated rule.

### 5.3 Sealed actor state — established direction

Actor state is sealed against ordinary external field access. Read and write occur only through statically authorized callbacks:

~~~ores
handle_state(critical-read |s| -> {
  // observe s without mutable alias escape
})

handle_state(critical-write |s| -> {
  // update s with exclusive access
})
~~~

- critical-read permits multiple compatible readers.
- critical-write excludes conflicting readers and writers.
- Direct access to actor state outside authorized access forms is a compile-time error.
- Callback state references MUST NOT escape the access scope.
- Suspension inside a critical region is rejected unless an explicitly defined suspend-critical form proves safe lock/ownership behavior.
- Deadlock avoidance, writer fairness and failure cleanup require a formal runtime contract.

## 6. Actors, supervisors, and groups

### 6.1 Actor contract — established direction

- An actor is a special class with isolated state, a mailbox, a lifecycle and a supervising relationship.
- spawn Worker() creates an actor according to the runtime's typed spawn contract; await spawn may wait for its defined readiness/creation result.
- send must report admission as Result (not imply the recipient completed handling).
- get_done() represents explicit completion notification where supported.
- Mailbox admission and closure must have linearizable outcomes; no accepted message may silently disappear because a mailbox concurrently closed.
- CONTROL messages to the supervisor have semantics separate from ordinary user mailbox payloads.
- A panic originating in an actor cannot be caught or intercepted by that same actor.
- A supervisor notice should carry actor ID, parent/supervisor reference, failure kind and a bounded error payload, without requiring a backend-native stack trace.

The runtime may use Java threads/isolates, native work queues, Wasm workers or .NET tasks, but these choices MUST NOT change message-admission guarantees.

### 6.2 ActorGroup membership — established direction, contract to ratify

An actor can belong to **multiple** ActorGroups. Membership is not exclusive ownership of the actor.

**Proposed contract:**

- A group holds membership references/capabilities, not an extra independent owner of actor state.
- Joining returns or records an authorization capability; leaving revokes that membership without destroying a still-live actor.
- Actor shutdown revokes all memberships and subscriptions associated with it.
- Group shutdown removes group relationships; it does not implicitly kill member actors unless the API explicitly states a supervised-ownership relationship.
- Membership changes must be linearizable at their admission point. Fan-out delivery must not implicitly guarantee a global order across unrelated recipients.

### 6.3 In-memory pub-sub — proposed adapter-neutral contract

Pub-sub is a library/runtime facility, **not** a new define publisher or define subscriber language construct.

- Topics have explicit identity within a broker scope. A topic name alone does not imply process-global identity.
- subscribe returns a typed, cancellable subscription handle with an unambiguous owner and lifetime.
- publish returns an admission result. It MUST NOT mean that every subscriber processed the event.
- For each individual publisher-to-subscriber stream, admitted publications preserve a documented order; there is no inferred total ordering across all publishers.
- Backpressure is bounded and explicit (reject, await capacity, or a declared drop policy); never silently install an unbounded queue.
- unsubscribe and close have linearizable admission cutoffs; in-flight admitted deliveries may complete according to a documented drain/cancel policy.
- Subscriber failure and shutdown must not accidentally transfer ownership of other subscribers' actors or state.
- Redis or another distributed broker belongs behind an adapter boundary with separately documented durability, ordering and delivery guarantees.

Illustrative API shape (names and precise signatures **not ratified**):

~~~ores
let broker = InMemoryPubSub<Message>.new(capacity: 256)
let subscription = broker.subscribe(topic: #telemetry, consumer: worker)
let accepted = broker.publish(topic: #telemetry, message: event)
subscription.unsubscribe()
broker.close()
~~~

**Open:** Whether durable replay/acks, admission fairness, replay offsets, deduplication and group fan-out are core interfaces or optional adapter capabilities.

## 7. Errors and failure propagation

### 7.1 Error types — established direction

Error is a language-level base class; throw, raise and panic accept Error subclasses, not arbitrary host exceptions. Error values do not automatically capture a heavyweight stack trace merely because they are constructed. Explicit capture_trace and serialization functions may provide bounded trace data.

### 7.2 Three failure channels — established direction

| Construct | Language-level behavior |
| --- | --- |
| throw | Caught by nearest applicable try/catch; if uncaught, escalates as raise |
| raise | Bypasses ordinary catches, reaches nearest permitted defer/recover; if unrecovered, escalates as panic |
| panic | Non-recoverable in the failing actor; supervisor receives priority CONTROL notice |

A host Java exception, LLVM landing pad, Wasm trap or .NET exception is not itself the Oreslang error protocol. Every backend must translate or lower to the same language-level outcome.

In non-actor main, the default top-level uncaught-error/panic reporting and process-exit mapping require a dedicated contract; no backend may choose and report that mapping as a ratified portable rule.

The trap modifier for a callable indicates it cannot **throw** (although raise/panic require independent effect declarations). A trap invocation such as trap worker.send(42) returns a typed Result or Option form as defined by the selected API; it cannot erase a failed mailbox admission.

**Open:** Formal effect types, defer/recover nesting, suppression/aggregation of secondary errors, fatal host-process failures, and the exact Result shape produced by trap per callable kind.

## 8. Modules, packages and permissions

### 8.1 Modules and imports — established direction

- New AttoLang sources, examples, and fixtures use `.atto`; `.ores` is a legacy source extension admitted only by an explicitly declared compatibility profile. An extension change alone MUST NOT change parsing or semantics, and compiler conformance requires the same exact source bytes for each backend within a case.
- define module is private by default; define pub module exports a module.
- A project-root import uses + to refer to the root found by .ores.pkg.toml discovery.
- ORES_PATHS supplies additional colon-delimited resolution roots where applicable.
- Symlink targets must be checked against package boundaries; an import cannot escape isolation simply by traversing a symlink.
- CLI overrides may be expressed via .cli-flags.toml; configuration precedence and reproducibility must be documented.
- Foreign-source imports (Java, C and other targets) need explicit trust/capability gates and cannot use symlink trickery to bypass source-origin restrictions.

### 8.2 Permission model — established direction

Deno-like run/build permissions are part of the platform contract and must be implemented consistently across backend CLIs using the flags-2-env parsing convention adopted by the project.

Permissions control filesystem, environment, network, process, foreign calls and other privileged operations according to explicit capability grants. A backend MUST NOT implicitly grant a capability merely because the underlying host API makes it accessible.

**Open:** Complete flag spelling, default-deny policy per execution profile, attenuation/delegation, and exact permission-error taxonomy.

## 9. Blocking APIs, channels and streams

- Synchronous I/O APIs end with **_blocking**; asynchronous APIs may end with **_async**.
- A source-level blocking API may suspend without parking an OS thread; naming describes observable call semantics, not host-thread usage.
- process.stdout, process.stderr and process.stdin and stdio.out/err/in are channel abstractions with typed aliases as specified by the runtime.
- stdio.in.stream() and Observable.from_ch(stdio.in) are intended interoperability forms.
- Channel close, backpressure, select registration and stream cancellation must use uniform semantics across runtimes.

## 10. Compatibility, diagnostics, and unresolved specification work

The language grammar, type rules, ownership diagnostics and error outcomes must be versioned. Implementations may add diagnostic detail, but should identify stable diagnostic categories and source ranges.

Priority unresolved questions:

1. A complete grammar/precedence and formatter canonicalization reference.
2. Default integer-overflow behavior, checked/unchecked arithmetic operators, and floating-point determinism.
3. Formal lifetime regions, escape analysis and pinning across await/select.
4. Trait coherence, sealed hierarchy rules, method dispatch and generic inference.
5. Actor scheduling fairness, exact CONTROL ordering, mailbox drain behavior and crash policy.
6. ActorGroup membership and pub-sub policy ratification.
7. Permissions, native interfaces, package discovery and capability delegation.
8. Wasm/Native AOT/hot-loading feature profiles and explicit unsupported-target diagnostics.

Every unresolved point must remain **open** rather than acquiring Java, LLVM, or another backend's behavior by accident.

---

**Next:** [Compiler and runtime contract](compiler-runtime-contract.md) defines how implementations preserve this specification; [Conformance](conformance.md) defines acceptable proof.
