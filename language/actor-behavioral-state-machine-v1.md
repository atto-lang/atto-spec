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

At actor member scope, `state {` introduces storage and `state machine as` introduces behavior. Inside the machine, `state Name as ... end` declares a graph node; it cannot introduce another actor storage schema. `machine` is contextual in this candidate, not a new globally reserved identifier. Reject a duplicate machine, malformed or ambiguous declarations, node declarations at actor-member scope, and storage declarations inside a machine. Formatter must preserve distinction and not rewrite or move storage. A graph node may later carry its own typed payload, but it is not a second general mutable actor container. The active node and version are runtime-owned metadata, not assignable actor fields. Do not prescribe syntax for transition bodies or payloads before grammar review.

## Execution, ownership and commit

- A machine consumes one event under serialized transition authority. Other methods may use existing checked state loans, but machine state, affected storage and staged effect intents must have a single observable commit boundary. A backend must prove equivalent exclusivity or reject this profile; no change to ordinary actors' concurrency defaults.
- Guard evaluation is pure and uses a coherent pre-transition snapshot. Reject ambiguous matching transitions unless an explicit deterministic priority rule is specified. Unknown events must have an explicit reject, defer or ignore disposition; admission and processing acknowledgement are distinct.
- Transition-local storage edits must pass the same state.read/state.write, guarded-access, ownership and lifetime checks as existing actor state. No escaped view, nested guard, suspension, send or I/O under a live state loan. No ambient write authority just from being a transition.
- Stage changes in bounded storage or a verified undo journal; acquire all resources needed for commit before publishing. Reject operations that cannot be staged safely (including irreversible resource destruction). A rejected or aborted transition leaves the previous node, data and version intact; no partial mutation or externally visible effect. Commit the new node, storage and incremented version together; publish staged effects only after commit. Durable profiles additionally require a transactional outbox or equivalent verified atomic persistence.
- Each event/completion/timer is fenced by actor identity, incarnation and where appropriate state activation generation; reentry into a node creates a fresh activation. Stale events cannot affect a newer activation. Exhausted counters and bounded queues fail before mutation; no wrapping.
- Runtime-owned priority supervisor CONTROL is not a machine DATA event. Preserve throw/raise/panic semantics and do not permit a machine to intercept its own panic.
- Retries rerun an eligible operation with bounded attempts, delay and deadline; failed uncommitted state is discarded. Undo is an explicit inverse **new committed** transition, not a version rewind. External compensation is a separate effect with an independently recorded outcome, stable idempotency identity and reconciliation for ambiguous completion. No automatic rollback of external I/O or promise of exactly-once remote effects.
- Storage profiles remain orthogonal. Volatile actors need no disk. Persistent/durable actors need separately verified storage, fencing, crash recovery and permissions. Hierarchy, parallel regions, history, scoped resources and migration are later extensions, not requirements for the first flat profile.

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
