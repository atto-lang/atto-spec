# AttoLang actor trace refinement v2 — candidate normative obligations

Status: proposed cross-backend specification; model artifacts and checked finite
traces are **not** compiler correctness proofs.

## Actor identities and observability

An actor identity consists of (actor_id, generation). A restart may reuse the
ID only after a prior incarnation retired; generation must increment.
Every running receiver turn has an independent receiver_id and logical stack.
Non-serial actors may have multiple receiver methods executing concurrently;
serial actors have at most one running receiver. Mailbox DATA admissions and
dispatch are FIFO; completion of concurrently running turns need not be FIFO.

The canonical vocabulary, field types and bounded budgets live at
atto-common-source/contracts/actor-trace-v2.json. The fail-closed verifier
lives at atto-platform-conformance/bin/check_actor_trace_v2.py.
Legacy Oreslang v1 receive records are not, alone, proof of completion.

## Required linearization points

- send_accept: an accepted mailbox DATA admission, never an attempted,
  rejected, denied or closed send.
- receive_start: dequeue of an admitted DATA message into the named receiver.
- receive_complete: receiver finished; the exact ID is settled once.
- control_admit: supervisor priority CONTROL mailbox admission independent of
  DATA capacity; new DATA dispatch must not overtake pending CONTROL.
- control_dispatch: consumes CONTROL and fences new DATA dispatch; running
  turns must be quiesced or completed before retirement.
- actor_close: future admissions refused; queued work must drain or be discarded.
- actor_retire: no queued work, active receiver, CONTROL, or critical lock.

Read-lock scopes may overlap when held by different active receivers;
write scopes are exclusive. Lock releases must identify the acquiring
receiver; running receiver completion must not leak lock ownership.
Logical retirement does **not** prove physical arena cleanup. The compiler
must separately reject escapes and forbidden suspension across critical
boundaries.

## Evidence levels

1. REFERENCE_MODEL: finite-state model only; no compiled guest.
2. RUNTIME_HOST: real JVM/native actor carrier execution, but may not be
   compiled from AttoLang source.
3. COMPILED_ATTO_GUEST: native .atto code compiled and executed through each
   backend's actual actor scheduler.
4. MULTI_BACKEND_PARITY: equivalent fixtures and invariants passed across
   independently built Java, LLVM, .NET NativeAOT, Wasm, Rust and Forge.

Each receipt identifies producer.backend, producer.subject and
producer.emission. A history reconstructed_after_quiescence is a causal
reconstruction and must not be presented as live guest instrumentation.
CI must record source Git head/tree, compiled artifact digest, backend,
executed .atto fixture identifiers, and precise coverage/noncoverage.

## Required negative checks

Duplicate settlement, stale incarnation, CONTROL priority inversion,
wrong FIFO dispatch, parallel serial receiver, overlapping read/write
critical sections, lock release by another receiver, duplicate CONTROL,
retirement while work remains, malformed/duplicate JSON fields, truncated
or overbudget traces, and unauthorized ownership transfer.

## Backend execution and hard-real-time constraints

Begin with existing JVM/native host probes but distinguish RUNTIME_HOST
from COMPILED_ATTO_GUEST. Add real .atto traces at actual mailbox and
scheduler linearization points, not after-the-fact fabricated guest events.
An optional recorder must not extend actor object lifetime, copy payloads,
retain raw pointers or add unbounded allocation to hard-real-time paths.
Physical reclamation requires independent quiescence and ownership evidence.
