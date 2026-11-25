# Specification refinement and proof obligations v1

**Status: proof plan / specifications of obligations, not a completed formal verification or backend certificate.** Links: language/specification-framework-v1.md and formal/actor_trace_refinement_v2.md.

## Trust boundaries

There are separate theorem statements for (1) grammar/metamodel integrity, (2) static typing and ownership, (3) reference operational semantics, (4) formatter safety, (5) actor protocols, and (6) compiled guest observational refinement. Proving one does not prove the others. The authoritative rule IDs are enumerated in contracts/specification-rules-v1.json.

## Formal obligations

**F-GRAMMAR:** For edition E and logical source context C, every positive syntax vector has a unique or explicitly disambiguated syntax tree. Negative vectors must be rejected. Parser implementations agree on semantic AST, not only on a shared accept bit. Document lexical/Unicode and error-recovery boundaries. The parser and formatter must receive the same E,C; path-dependent namespaces are part of C.

**F-TYPE-OWN:** Progress and preservation for the typed core, within declared effects and runtime assumptions. No well-typed execution accesses a consumed take!/drop! owner; outstanding loans prohibit forbidden transitions; a mutable loan is exclusive; a shared read loan does not outlive its owner. Pinning and freeze/actor handoff require separate provenance proofs, not lexical shortcuts. Include counterexamples from invalid programs.

**F-FORMAT:** For formatter F_E,C, parser+static checker P_E,C and semantic abstraction S_E,C:
- If F(s)=t and P(s)=valid, then P(t)=valid and S(s) ≃ S(t).
- If F(s)=t and P(s)=invalid, then P(t)=invalid for an equivalent violation.
- If F(s)=t, then F(t)=t.
- If F(s) rejects, it has no side effect on source content and must not fabricate compiler acceptance.

The ≃ relation must preserve type/effect/ownership, namespace/module identity, binding resolution, evaluation order and runtime-visible behavior. Lexical equality is too strong, string removal is too weak; use independently reviewed semantic AST adapters and guest differential tests. A formatter test of an in-memory reference callback is HOST_MODEL, not a proof of target compiler behavior.

**F-ACTOR:** Under bounded trace assumptions, admission/dispatch/close/retire linearization preserves mailbox FIFO where specified; CONTROL precedence and fencing; exactly-once settlement per accepted receipt; no stale-incarnation deliver; no lock-owner mismatch; concurrent read vs exclusive write; no actor retirement with active work. Reuse the existing actor trace refinement models rather than inventing new event names.

**F-SECURITY:** Prove noninterference under declared capabilities for environment reads and tenant resources, fail-closed permission decisions and no implicit authority amplification from imports, formatter rewrites or actor name resolution. Native untrusted-code memory isolation is **not** established by a parser or a bounded actor protocol model and needs separate sandbox/compiler proof.

**F-COMPILER:** Show compiler output refines source operational semantics up to permitted nondeterminism for the declared backend/profile; do not demand identical schedules, machine code, or diagnostic wording where not normative.

## Model artifacts, evidence and open debt

Use bounded model checking (e.g., existing actor trace models), property-based negative generation, differential parser AST comparison, proof-carrying or typed operational semantics when feasible, and independently executed guest tests. Log explicit assumptions, bounds, missing cases and counterexamples. Never report a model pass as an all-backend proof.

Until real parser/semantic adapters and independently executed backend fixtures exist for a rule, its AST/compiled_guest/multi-backend assertion remains NOT_EXECUTED. Formal proof obligations alone do not flip that status.
