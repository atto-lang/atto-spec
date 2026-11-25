# Verified Core local protocol guests v1

The candidate extends file-local protocol actors with an optional actor-owned scalar field and a standalone guest `main` on Java, LLVM, and .NET. The [shared Connection fixture](https://github.com/atto-lang/atto-platform-conformance/blob/feat/verified-core-quantities-v1/fixtures/verified-core-protocol-guest-v1/connection.atto) uses a bounded `i32` quantity in milliseconds as its field and accepts messages with a separately refined timeout.

## Staging and invariant

An optional `state { Elapsed elapsed = 2<Millis>; }` block follows the actor's `as` clause. The compiler checks the initializer against the field's carrier, units, scale, and declared interval. The interval is the invariant on stored values. A handler may put one increment such as `elapsed = elapsed + timeout;` before its terminal transition. The parameter and field must have the same carrier and normalized unit. The increment evaluates against the last published field on the serial actor turn.

The runtime checks signed addition and the resulting interval. It publishes the field value and destination together under the gate that also orders stop. If staging fails, it retains the prior pair and returns receipt status `6`. Each handler is restricted to the field increment and terminal transition. [Local mailbox wire format](verified-core-protocol-mailbox-v1.md)

## Guest lifecycle

Guest `main` binds one file-local actor with `val worker = spawn ConnectionActor();`. It may make up to 64 typed sends, each followed by `val status = worker.get_receipt();` on the same binding. Each send carries a declared message and checked scalar quantity literals. The guest then calls `worker.stop();` and may return one bound receipt status. The receiver rejects stale actor incarnations. The compiler rejects sends after the binding has been stopped. Java uses scheduler awaits for startup, receipt, and physical completion, and its cancellation path requests stop and awaits actor retirement.

The fixture's field starts at 2 and has maximum 10. A delay of 9 fails, a delay of 7 advances the actor, and a later delay of 2 fails. Retrying with 1 reaches the terminal state, where another message is an illegal edge. The shared runner checks all five outcomes and rejects invalid units, payload bounds, initial state, lifecycle, and handler effects.

## Model proof and execution evidence

The solver checks the reviewed Connection fixture's serial staging model with finite-width integers. It checks the initial value, representation of the sum, invariant preservation, the edge and authority gate, and rollback of the pair. Positive reachability and guard-removal mutants check that the model can distinguish incorrect behavior.

For LLVM and .NET, the conformance runner can save the proof, exact checkout and fixture identities, observations, and native artifacts in a bundle. The independent replay checks the recorded digest of each executable and the pinned checkout identities, reruns the model queries, and executes each native artifact against the expected return status. Java records the compiled JVM class and dependency identities and runs the same guest observations. General ownership and transfer proofs, model-to-compiler preservation, strict compiler admission, and temporal guarantees require further evidence.
