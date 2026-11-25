# Contributing to the AttoLang Specification

Specification changes are language changes, not claims of merged backend code.

Every proposal should state: motivation; canonical `.atto` source; grammar and formatter impact; static typing/effect rules; ownership and borrow behavior; actor/cancellation/failure behavior; runtime security implications; AOT and target restrictions; negative cases; and a cross-backend test plan.

Mark unverified features as **TARGET**, **PROPOSED** or **DRAFT**. Never say "implemented" without naming the backend, exact immutable source/compiler revision, executed fixture and evidence. A passed API mock, host-only model, self-attested JSON ledger, or source-free runner probe does not establish guest semantics.

Do not publish private source or runtime secrets into an unapproved test organization, issue, artifact, or public docs. Link only to repositories and documents already within the audience's permissions.

Run a local Markdown link/fence check before review, then add machine-executable `.atto` conformance fixtures in the source/conformance repositories rather than relying on code fences here. Keep the spec versioned and document backward compatibility.
