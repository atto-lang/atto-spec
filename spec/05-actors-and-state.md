# 05 — Actors, Sealed State, Messaging and Supervision

**Status: DRAFT; TARGET unless evidence is explicitly linked.**

## Actor identity

An actor is a **special nominal class** with identity, runtime-owned inbox, lifecycle, supervisor, and actor-local persistent allocation domain. Each actor owns a guest heap/allocation arena and logical stack domain; this does not require a dedicated OS thread, separate host address space, or OS process. A normal class cannot become an actor via an unapproved cast or inheritance trick.

```atto
define actor Counter as
  state {
    let int count: 0
  }

  receive(Increment message) -> void ::
    self.handle_state(critical-write |s| -> {
      s.count = s.count + message.amount
    })
  end

  read_count() -> int ::
    return self.handle_state(critical-read |s| -> s.count)
  end
end

val counter = spawn Counter()
val admitted = counter.send(Increment(1))
```

This is the intended **sealed-state target**, not proof that the displayed `state {}` and `handle_state` lowering execute on every backend. API casing/signatures are fixed only after a conformance amendment.

## State confinement

At most one effective persistent guest state schema belongs to one actor. Direct reads/writes of actor state outside compiler-validated scoped callbacks (`handle_state(critical-read|write ...)` or equivalent admitted lexically scoped `using`) MUST fail compilation. The intrinsic is sealed; code cannot override it or forge an actor-state pointer.

- **critical-read:** immutable ephemeral loan; concurrent readers may be admitted if the actor/profile supports them.
- **critical-write:** exclusive mutation; any writer excludes conflicting readers/writers.
- No state loan may escape its callback, be serialized, be captured by a child task, or cross a suspension without an explicit proven and runtime-enforced safe exception.
- Ordinary actors are concurrent by default. `define serial actor Name as ... end` opts into at most one active guest turn at a time. Concurrent admission never permits conflicting state access: compatible `critical-read` loans may overlap, while `critical-write` excludes readers and writers of the same protected region. Backend scheduling capacity does not replace these proofs.
- Serial actors retain the same sealed-state and borrow rules; serialization is not permission to leak mutable references into tasks, pipes, singletons or other actors. See the [concurrency and shared-memory amendment](22-concurrency-and-shared-ownership.md) for migration and execution gates.

## Mailboxes and sends

An actor has a bounded DATA inbox. Sending has a **linearization point**: either an owned message is admitted exactly once (with quota/ownership obligations transferred) or the send fails without partial publication. Admission checks type, identity, incarnation, authority, closure state and queue count/byte limits.

`send(message)` should return an explicit typed admission outcome such as `Result<Ack, SendError>` (or a Future thereof where admission is asynchronous); never mistake mailbox admission for recipient processing or completion. Existing backend APIs may expose different aliases, and must be reconciled before finalizing the signature. `get_done()` is an explicit completion barrier, not an implicit send acknowledgement.

A receiver is serialized with other conflicting turns. Messages may be rejected due to full/closed inbox, stale actor generation, invalid payload, cancelled sender or missing authority. No backend may silently drop a message while returning success.

## Lifecycle

Conceptual lifecycle: allocate identity and quotas → initialize owned state → run reserved `on_start()` → publish ready → receive DATA/control-admitted turns → stop/cancel/fail → run finalization/`tear_down()` → physically retire owned resources → settle `done`. Construction must not implicitly inject a user message into `receive`.

`stop` is graceful, `cancel` is structured, and force termination requires an explicitly stronger isolation/revocation capability. Closing admission prevents new DATA turns, while already-admitted ownership and pending outputs still require deterministic handling. Hot replacement fences old generations and stale handles.

## Supervisor and CONTROL

Panic and unhandled exceptional control are surfaced via a **separate bounded, authenticated CONTROL path**, not routed through the user DATA FIFO. An actor cannot intercept its own panic. Supervisor notices contain actor ID, parent/supervisor identity, failure kind, generation and bounded diagnostic data — **never** a mutable host exception/pointer graph.

The supervisor decides whether to restart, stop, escalate or cancel children under a declared policy. A supervisor may own actor children **and** supervisor children: only the direct parent receives authenticated child failure CONTROL, and restarting a child supervisor replaces its entire fenced subtree. One actor has exactly one controlling supervisor even if it joins multiple groups. See [hierarchical supervisor contract](13-supervisor-hierarchies.md). CONTROL delivery must be possible when DATA is full, without unbounded priority starvation or running supervisor guest code inline inside the failing actor's carrier. Host-fatal process corruption is outside any supervisor recovery guarantee.

A failed actor is restarted from stored state by default, and its unstarted mail carries over. See [runtime guarantees](18-runtime-guarantees.md).

## Kinds, groups and typed actor pipes

Shared, private/isolated and untrusted kinds select capacity, transport and policy, not a second object model. One actor may join multiple `ActorGroup` instances using authorized membership capabilities; group lifecycle cannot steal owned state. HTTP/TCP/WS actor shorthand and `extends ChildProcManager` style libraries are target desugarings over the base actor model. `serial http actor` requests serial request/message concurrency.

`spawn A() pipe spawn B()` creates a typed, bounded actor data pipeline; a supervisor is not a data stage. Affinity, number of carrier threads, and mailbox size do not weaken supervision or sealed-state rules.

The proposed `Actor.pipe(A(), B(), ...)` and zero-argument-type `Actor.pipe(A, B, ...)` are new-actor factory forms of that pipeline, while `Actor.connect(a_ref, b_ref)` connects existing actors without changing their supervisor. These must share the same post-start admission, ownership, capacity and DATA/CONTROL separation guarantees. The deferred factory proposal returns a single-use builder; only `.start()` attempts to create the new graph. Nested builders can define explicit child-supervisor scopes without changing the owning supervisor of already-running actors. See [chapter 14](14-actor-pipeline-factories.md) and [chapter 15](15-nested-actor-pipelines.md); all factory syntax remains **TARGET / NOT_VERIFIED**.

## Experimental browser compatibility profile

The source-defined browser actor subset and current linear-memory execution evidence are documented in [chapter 23](23-browser-compiler-profile.md). Its direct field writes and serial receive loop are compatibility behavior; they do not weaken this chapter’s sealed-state or chapter 22 concurrency targets.
