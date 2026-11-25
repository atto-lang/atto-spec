# Verified Core nominal identity and proof admission (candidate)

This extends the file-local profile without admitting new syntax or claiming cross-backend implementation.

## Dimensional identity
A base dimension is identified by the compiler's resolved package/module/declaration identity, not its unqualified spelling. Aliases refer to the same identity; two independent declarations of Time are distinct. Resolved identity and canonical sorted exponent vector, reduced positive rational scale, and numeric carrier constitute the quantity type. No hash collision or display spelling is sufficient to establish equality. Bind imported descriptors to the resolved dependency graph and exact interface digest. Public type exports require a versioned semantic interface. Cyclic alias/unit dependencies must reject with a bounded traversal and a deterministic diagnostic. The current earlier-only file-local rule remains in force until imported/compound declarations are admitted. Do not invent compound or affine syntax in an implementation PR.

## Proof admission
Proof obligations are generated from the resolved typed IR; the compiler may not omit an obligation merely because a solver times out. Record carrier, normalized unit, refinement, assumptions, operation, source span, and obligation identity. Distinguish normal-result bounds from a proof that arithmetic cannot fail. A strict total arithmetic claim must prove absence of overflow and division by zero as well as postcondition preservation. Any accepted runtime checks remain part of executable semantics and cannot be represented as static proofs.

Proof results must bind compiler revision, source and dependency trees, target, proof calculus and checker version, obligation set and artifact digest. Independent checking is required; unknown, missing, stale, refuted or unapproved assumed obligations do not certify a strict profile. An interval oracle is not a proof of arbitrary compiler preservation. AOT output must not require a solver, JIT or reflection.

## Protocol graph analysis
Compute reachable states, reachable nonterminal sinks, and reachable states without any graph path to a declared terminal. These are advisory results in v1: ongoing service actors need not terminate. A path to a terminal is an existential graph fact, not a scheduler fairness or eventual delivery guarantee. A protocol graph alone cannot prove deadlock freedom, cross-actor liveness, or cancellation settlement. Require compiled trace and concurrency refinement evidence for those claims.

## Acceptance
The expanded conformance #584 corpus adds 80 deterministic source cases to the existing 23. The reference graph and validation hardening are tracked in common-source #140. The Rust closed registry remains a distinct narrower profile until it adopts this contract. All additional cases are pending exact-head execution. No new keywords are globally reserved.
