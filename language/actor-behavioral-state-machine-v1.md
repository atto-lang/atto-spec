# Actor behavioral state-machine contract v1

**Status: proposal, not ratified grammar or backend execution evidence.** This extends [actor attached state and guarded lifecycle](actor-attached-state-and-lifecycle-v1.md) and [actor execution classes](actor-execution-classes-v1.md); their isolation, lifecycle and effect rules remain authoritative.

## Storage and behavioral state are distinct

The existing `state { ... }` block is the actor's private mutable per-instance storage schema. Preserve it unchanged, including empty `state {}`, and preserve `define state on actor Foo as { ... }` as its out-of-line equivalent. Neither form declares a behavioral state or implies a machine. An actor can have its existing single state schema and optionally one behavioral state machine. No machine is required for ordinary actors.

Candidate contextual syntax (not an assertion of current parser support):

```atto
define actor Foo as
    state {
        let int count: 0;
    }

    state machine as
        initial state Idle
        state Idle as
            on Start() -> Running
        end
        state Running as
            on Stop() -> Idle
        end
    end
end
```

At actor member scope, `state {` introduces storage and `state machine as` introduces behavior. Inside the machine, `state Name as ... end` declares a graph node; it cannot introduce another actor storage schema. `machine` is contextual in this candidate, not a new globally reserved identifier. Reject a duplicate machine, malformed or ambiguous declarations, node declarations at actor-member scope, and storage declarations inside a machine. Formatter must preserve distinction and not rewrite or move storage. A graph node may later carry its own typed payload, but it is not a second general mutable actor container. The active node and version are runtime-owned metadata, not assignable actor fields. The contextual grammar extension below proposes transition actions; node payload grammar remains deferred.

## Execution, ownership and commit

- A machine consumes one event under serialized transition authority. Other methods may use existing checked state loans, but machine state, affected storage and staged effect intents must have a single observable commit boundary. A backend must prove equivalent exclusivity or reject this profile; no change to ordinary actors' concurrency defaults.
- Guard evaluation is pure and uses a coherent pre-transition snapshot. Reject ambiguous matching transitions unless an explicit deterministic priority rule is specified. Unknown events must have an explicit reject, defer or ignore disposition; admission and processing acknowledgement are distinct.
- Transition-local storage edits must pass the same state.read/state.write, guarded-access, ownership and lifetime checks as existing actor state. No escaped view, nested guard, suspension, send or I/O under a live state loan. No ambient write authority just from being a transition.
- Stage changes in bounded storage or a verified undo journal; acquire all resources needed for commit before publishing. Reject operations that cannot be staged safely (including irreversible resource destruction). A rejected or aborted transition leaves the previous node, data and version intact; no partial mutation or externally visible effect. Commit the new node, storage and incremented version together; publish staged effects only after commit. Durable profiles additionally require a transactional outbox or equivalent verified atomic persistence.
- Each event/completion/timer is fenced by actor identity, incarnation and where appropriate state activation generation; reentry into a node creates a fresh activation. Stale events cannot affect a newer activation. Exhausted counters and bounded queues fail before mutation; no wrapping.
- Runtime-owned priority supervisor CONTROL is not a machine DATA event. Preserve throw/raise/panic semantics and do not permit a machine to intercept its own panic.
- Retries rerun an eligible operation with bounded attempts, delay and deadline; failed uncommitted state is discarded. Undo is an explicit inverse **new committed** transition, not a version rewind. External compensation is a separate effect with an independently recorded outcome, stable idempotency identity and reconciliation for ambiguous completion. No automatic rollback of external I/O or promise of exactly-once remote effects.
- Storage profiles remain orthogonal. Volatile actors need no disk. Persistent/durable actors need separately verified storage, fencing, crash recovery and permissions. Hierarchy, parallel regions and history remain later extensions; scoped resources and migration are separate profiles described below, not requirements for the first flat profile.

## Required portable acceptance cases

Use identical input bytes and expected outcomes across all supported compiler targets. First prove parse/format distinction, then checked transition MIR, then actual compiled guest behavior.

| ID | Required behavior |
| --- | --- |
| SM01 | Legacy actor with empty inline state, no machine, remains valid |
| SM02 | Nonempty inline storage and machine coexist, no aliasing between actors |
| SM03 | Out-of-line storage and machine coexist; duplicate storage rejected |
| SM04 | Duplicate machine and missing/duplicate initial state rejected |
| SM05 | Duplicate node, unknown successor, invalid node scope rejected |
| SM06 | Pure guard, deterministic dispatch; ambiguous/effectful guard rejected |
| SM07 | Commit node, changed data and version as one snapshot |
| SM08 | Throw/cancellation before commit retains old node, data and version |
| SM09 | State loan escape, direct field access, suspension and send under guard rejected |
| SM10 | Old activation timer after exit/reentry and old incarnation completion rejected |
| SM11 | Queue/version/attempt exhaustion rejects without partial publication |
| SM12 | Retry bounded; undo advances version; duplicate effect completion reconciled |
| SM13 | Panic reaches supervisor CONTROL, not machine handler |
| SM14 | Unsupported backend fails closed before emitting guest artifact |

All cases initially NOT_EXECUTED. A parser-only result, host oracle, old branch receipt or zero-step CI cannot establish guest parity. Pin source SHA/tree, compiler SHA, real executed steps, target, artifact and trace. Track Java, LLVM, Rust/Wasm, .NET, Forge, Cranelift, JS and all additional atto-source targets individually. Do not silently fall back to interpreting machine declarations as ordinary fields or ignoring them.

## Integration / overlap disposition

- Java #1735 and Rust #517: complementary state-indexed message protocol candidates; externally held actor refs do not imply a current machine state. Both remain runtime-gated; do not replace their affine/cardinality checks.
- Java #1898 and Rust #566: restricted durable scalar emission candidates, not a general durable machine or shared actor ABI.
- LLVM #553 and Forge #136: existing sealed state / exclusive turn substrate; use as prerequisites where verified, not competing storage.
- atto-stategraph.atto #6–#9: separate graph library and portability candidates; keep graph engine distinct from compiler-owned actor transition authority.
- atto-step-function-demo #9 and atto-ai-agent-coordination-demo #12: saga/guarded workflow candidates; retain explicit external effect reconciliation rather than claiming their host/demo behavior is native machine support.
- atto-spec #257: deterministic scheduler oracle changes; complementary, not a production scheduler.
- All linked candidates require exact-current-head overlap resolution and fresh compiler execution before integration. This proposal does not supersede or close any of them.


## Contextual grammar extension: sagas, invariants and lifecycle

Owner direction: support native `saga {}`, `migrate`, `invariant`, `owned`, `enter` and `exit` without changing the inline mutable `state {}` container. Candidate grammar, not existing compiler support. No global keyword reservation: ordinary identifiers retain these spellings outside the corresponding declaration/statement position. Recognize complete introducers at the correct syntactic scope; strings, comments and symbols cannot introduce declarations.

```ebnf
Machine = "state", "machine", "as", MachineMember*, "end";
MachineMember = Initial | Node | Final | Invariant;
Initial = "initial", "state", Identifier, ";";
Node = "state", Identifier, "as", NodeMember*, "end";
Final = "final", "state", Identifier, ";";
NodeMember = EventRule | TimerRule | Invariant | Owned | Enter | Exit;
EventRule = "on", EventPattern, ["when", PureExpr], "->", Identifier,
            [TransitionAction], ";";
TimerRule = "after", DurationExpr, "->", Identifier, [TransitionAction], ";";
TransitionAction = CallableEffectClause, Block;
Invariant = "invariant", "|", Identifier, "|", "->", PureExpr, ";";
Owned = "owned", Type, Identifier, ";";
Enter = "enter", CallableEffectClause, Block;
Exit = "exit", CallableEffectClause, Block;
Saga = "saga", "{", SagaStep+, "}";
SagaStep = "step", Identifier, ":", CallExpr, "{",
           [RetryPolicy], (Compensation | Irreversible), "}";
Compensation = "compensate", CallExpr, ";";
Irreversible = "irreversible", ";";
RetryPolicy = "retry", "{", RetryField+, "}";
Migration = "migrate", "from", SchemaVersion, "to", SchemaVersion, Block;
```

Reuse existing expression, type, block and callable effect grammar. Earlier examples omit semicolons for readability; reconcile leaf terminators with the actual parser before ratification. Require one initial node, unique named saga steps, at most one enter/exit per node, explicit compensation or irreversible disposition, unique retry fields and migration edges. Reject unknown successors, unreachable nodes and outgoing rules from terminal nodes. Malformed contextual constructs fail closed rather than silently selecting alternate grammar. Owned is a resource scope, not a second ownership system: preserve existing checked ownership transfer operations.

### Invariants and lifecycle

- Actor-level invariants cover sealed storage; machine/node invariants cover relevant snapshots. A candidate explicit immutable binder is `invariant |s| -> s.balance >= 0;`. No ambient direct field access. Node invariants apply only while active. Class invariants require a separate construction/mutation-boundary contract.
- Invariants are total, pure, bounded and non-suspending. Check activation, each commit (including ordinary checked writes), destination entry, undo and migration, not transient intermediate edits. Failure prevents publication. Elide only proven checks. Fatal faults preserve supervisor policy.
- Initial activation stages initial enter before DATA execution. State-changing events stage source exit, transition body, then destination enter. External self-transition renews activation; any future internal transition has separate semantics. No hooks on rejected guards. Hooks may run on aborted attempts; only one successful local commit publishes changes.
- Hooks declare effects and use authenticated guarded state loans against staged storage. No suspension, I/O, nested guard, unknown-effect callback or irreversible destruction within atomic transition. Stage postcommit resource operations and receive typed completion events; entering does not imply successful external acquisition. A final node ends machine transitions, not necessarily actor lifetime or pending cleanup.
- Owned slots are activation-private; require definite initialization and exclusive transfer or retirement. A staged move must preserve the old owner on abort; no borrowed reference survives exit. Track physical retirement separately, bound pending cleanup, and fence DONE until completion. Non-reversible cleanup cannot execute speculatively. No live handles, pointers or process-local leases in durable snapshots.

### Saga execution and retry

- Native structured sequential saga is allowed in ordinary callables and actor handlers, never under a live state loan or within an atomic transition. A transition may commit a saga intent and consume its result in a later turn. Parallel/nested sagas and expression result typing need separate specification. No effect authority comes from syntax.
- Reserve bounded ledger capacity and stable workflow/step/effect identity before dispatch. Retries keep the logical effect key, increment a checked attempt number, and preserve the original typed input. Compensation has a distinct stable key and consumes the original authenticated success receipt. Record success before starting the next step; durable mode persists intent and receipt with a transactional outbox or equivalent. Volatile mode has no restart guarantee.
- Retry only classified transient failures with proven non-execution or authorized idempotent/reconciled effects. max_attempts includes first attempt; validate finite delay, maximum delay, deadline, backoff and jitter. Saturating arithmetic and monotonic clock prevent overflow. Persist decisions in durable mode; use virtual time in tests. Deadline/cancellation stops new attempts but cannot erase unknown outcomes.
- Definitive failure before execution triggers compensation of completed compensable steps in reverse completion order. An indeterminate forward or compensation outcome blocks progression until reconciled; timeout alone is not proof of failure. Authenticated identical receipts are idempotent; conflicting/stale receipts reject. Failed compensation retains an obligation and retry/escalation path. Irreversible steps are explicit and disallowed in a profile promising full compensability. Never claim exactly-once external effects.
- Rollback discards uncommitted local edits. Undo is a new typed inverse transition with fresh commit version and invariant checks. Compensation is a separate external effect. Panic reaches supervisor CONTROL; it is not a catchable saga state.

### Migration

- Migrate is a schema-evolution declaration, not an arbitrary runtime command or capability grant. Positive increasing source/destination schema versions differ from commit versions and activation epochs. Require one explicit upgrade path; reject missing/ambiguous paths, cycles and unsupported downgrade.
- Transform typed old immutable snapshots into validated new snapshots. Map all live node IDs, serializable payloads, queued message schemas, timers, dedup entries and unfinished saga obligations or reject. Stable portable IDs replace process pointers and enum ordinals. No silent deletion of an effect or escalation of permissions.
- Quiesce new DATA execution and fence old completions. Stage migration and all invariants, persist the new snapshot and epoch atomically or through a crash-recoverable equivalent, then resume. Failure preserves the old recoverable snapshot. No external I/O during transformation. Recovery observes a coherent old or new schema, never both; hot-reload remains gated on real quiescence and crash tests.

## Extended portable acceptance requirements

| ID | Required behavior |
| --- | --- |
| SM15 | Contextual introducers coexist with ordinary identifiers, comments and strings; formatter keeps storage distinct |
| SM16 | Enter/exit ordering at activation and external self-transition; no hooks on guard rejection |
| SM17 | Hook failure aborts data, node, version and resource transfer together |
| SM18 | Actor/node invariant failure at activation, transition and ordinary write prevents publication |
| SM19 | Effectful/suspending invariant, hook under live loan, and escaping state-owned borrow reject |
| SM20 | Move abort preserves old owner; commit retires or transfers exactly once; physical cleanup fences DONE |
| SM21 | Saga records receipts before next step; definitive failure compensates in reverse completion order |
| SM22 | Unknown forward outcome blocks progress and compensation; unknown compensation blocks unwinding |
| SM23 | Bounded retry includes first attempt, checked deadline/delay, stable effect key and deterministic jitter |
| SM24 | Duplicate receipt idempotence; conflicting/stale receipt refusal; irreversible steps cannot claim rollback |
| SM25 | Crash around durable intent, dispatch, receipt and compensation commit retains obligations |
| SM26 | Migration preserves obligations and stable IDs; unknown node/version and ambiguous path reject |
| SM27 | Migration abort preserves old snapshot; recovery sees coherent old/new schema; stale events fenced |
| SM28 | Volatile profile has no persistence guarantee; unsupported durable/migration/resource profile fails closed |

All new cases initially NOT_EXECUTED for compiler/guest targets. Host reference tests are not parser, ownership, resource-retirement, native-effect or crash-recovery evidence. First admit the flat volatile machine; durability, saga and migration have independent capability gates.


## Shared retry/undo and backend admission handoff

[Retry/undo PR #285](https://github.com/atto-lang/atto-spec/pull/285) owns the typed retry policy, reversible history, tail undo/redo, operation IDs, deduplication and durable effect-ledger rules; this machine proposal owns the contextual grammar, behavior/activation metadata, lifecycle and migration integration. A machine's undo must obey the same history/expected-version and published-effect restrictions, not bypass them via a second inverse API. An inverse of an ordinary transition can advance a new logical version only if the retained history and ownership evidence permit it. Keep the same retry/compensation receipt authority across standalone saga and actor machine implementations.

[Conformance PR #689](https://github.com/atto-lang/atto-platform-conformance/pull/689) holds the companion `contracts/actor-state-machine-v1.json` registry. The 41 retry/undo requirements and 28 machine requirements describe overlapping behavior, not 69 independent executed tests. Shared cases must reuse identical candidate source bytes and expected outcomes. Parse/format, typed MIR, actual guest execution, runtime resource proof and crash recovery are separately gated. No backend currently certified by this proposal.
