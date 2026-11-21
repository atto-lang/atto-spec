# Confidential computing and TenantVM boundaries v1 — editor's draft

**Status: TARGET / NOT HARDWARE VERIFIED.** This contract defines runtime
hosting semantics, not an AttoLang keyword. No backend is certified by this
document. The corresponding executable evidence belongs to
[atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance).

## 1. Distinct trust boundaries

1. **External infrastructure vs. protected workload:** a hardware Trusted
   Execution Environment (TEE) such as AMD SEV-SNP or Intel TDX may provide
   workload confidentiality and integrity against some privileged host threats,
   subject to that technology's published threat model.
2. **TenantVM A vs. TenantVM B in the same OS process:** must be enforced
   *independently* by the Atto runtime, trusted code producer and unavoidable
   memory/capability barriers. Whole-VM hardware attestation does not prove
   per-TenantVM separation.
3. **Actor A vs. actor B within a TenantVM:** sealed state, actor-owned
   memory, mailbox admission, resource quotas and typed control notices
   remain enforced as specified elsewhere.

An actor heap, JVM Context, Java classloader, `mmap` cage, Graal Native Image
or target-profile entry is NOT a hardware TEE. In-process untrusted native
code with unrestricted pointers cannot be admitted merely because the host
is inside a confidential VM.

## 2. Trusted host admission protocol

Confidential execution is a host/deployment **requirement**, never a guest
self-asserted capability. The host MUST reject a confidential request if
the implementation has no independently reviewed hardware attestor and
secret-release broker. An opt-in flag or untrusted `is_confidential` value
MUST NOT silently downgrade to trusted-only ordinary execution.

The confidential host is instantiated in an approved TEE before the host
may claim hardware protection; an individual TenantVM cannot retrofit
whole-VM memory encryption after the process starts.

The host-side attestation protocol MUST:

1. Generate a fresh unpredictable challenge from an OS CSPRNG, bind it to
   a deployment-scoped ephemeral public key and intended workload identity.
2. Verify the vendor-signed evidence and endorsement chain cryptographically,
   including trust roots, TCB/security version, firmware policy, revoked
   endorsements, debug configuration and technology-specific report format.
3. Verify freshness against the issued challenge and short bounded validity,
   and bind signed report data to the expected image/boot measurement and
   ephemeral key. Untrusted quote metadata alone cannot assert validity.
4. Fail closed before any sensitive provision/admission if any check fails,
   the TEE is unavailable, the quote is stale, the measurement changes, or
   the provider/TCB is unsupported. No fallback to unprotected execution.
5. Only after independent verification may the secret broker establish an
   authenticated encrypted channel bound to the measured workload and
   ephemeral key. Secrets are never supplied through guest-provided
   headers, logs, ambient environment or unsigned manifests.
6. Revoke tenant-scoped keys and capabilities on generation restart,
   quiescence, shutdown and provider policy withdrawal. Reject replayed
   evidence and stale key-release tickets. Keep I/O capability enforcement,
   tenant identity and budget checks orthogonal to the TEE verdict.

## 3. State and evidence classification

The portable preflight states are:

- `CREATED`
- `CHALLENGE_ISSUED`
- `UNVERIFIED_CLAIMS_MATCH` (untrusted metadata matches host policy;
  **NOT** vendor authenticated)
- `REJECTED`

A challenge is consumed on the first inspection, including failure.
`UNVERIFIED_CLAIMS_MATCH` MUST NOT authorize a TenantVM, bypass permissions,
create a verified label, or release a key. Future provider-specific
`VENDOR_VERIFIED` and `KEY_RELEASE_AUTHORIZED` states require distinct
non-forgeable trusted proofs and reviewed key-broker integration; neither
exists in this v1 preflight.

Backend reporting MUST distinguish `HOST_ONLY`,
`SOURCE_FREE_REFERENCE`, `NOT_EXECUTED`, `HARDWARE_ATTESTED` and
`UNSUPPORTED`. A host unit test is never `HARDWARE_ATTESTED`.
Hardware evidence must include code/artifact digest, exact compiler/runtime
SHA, TEE model, security/firmware version, attestation verifier details,
executed positive and negative cases, and CI provenance with nonzero steps.

## 4. Required adversarial vectors

Preflight rejects mismatched provider, nonce, image digest, low TCB,
debug-enabled mode, revoked evidence, empty/malformed quote, stale or
future timestamp, expired challenge, invalid entropy, and second use of
a consumed challenge. These tests are **not cryptographic quote verification**.

Hardware tests must additionally reject tampered vendor signatures,
untrusted chain roots, revoked certificates, stale signed report data,
wrong channel binding, key replay, and denial of tenant isolation;
one compromised tenant must not read a sibling's memory or socket.
Tests must run on actual supported hardware before claiming support.

## 5. AMD SEV-SNP raw evidence and transcript v1

**Normative target, not currently certified.** AMD SEV-SNP evidence has a
**1,184-byte** raw report, a **672-byte signed prefix**, and a **48-byte
SHA-384 launch measurement** at offset \`0x90\`. The signed 64-byte
\`REPORT_DATA\` field is at \`0x50\`. The signature algorithm is ECDSA P-384
with SHA-384; its padded little-endian R and S are at \`0x2a0\` and \`0x2e8\`.
The report's signer's endorsement identity must be authenticated against AMD's
product-specific trust roots. A caller-supplied ECDSA key is not such proof.

The **32-byte \`measurement_sha256\`** in the early generic
\`ConfidentialAttestationPreflight\` examples is *untrusted host metadata*
and is **not** an SNP measurement. Backends MUST NOT compare a 32-byte hash
against an SNP measurement or use the metadata preflight as an authenticator.

The draft application transcript binds \`REPORT_DATA\` as follows:

\`\`\`text
SHA512(
  ASCII("atto-sev-snp-report-data-v1")
  || verifier_nonce_32
  || expected_deployment_image_identity_32
  || uint32_be(ephemeral_tls_spki_der.length)
  || ephemeral_tls_spki_der
)
\`\`\`

The verifier MUST mint the nonce using an operating-system CSPRNG.
The ephemeral TLS key must be generated and controlled inside the
attested workload; the broker must verify possession of the corresponding
private key on the authenticated encrypted channel. The deployment-image
identity is an independently authenticated deployment identifier; it does
not replace the firmware launch measurement. Guest-controlled transcript
inputs cannot alter the verifier's policy or trusted root set.

A real verifier MUST validate and distinguish VCEK and VLEK endorsement
chains, pinned AMD ARK and ASK/ASVK roots, revocation, product/hardware
identity, report-signature integrity, the certificate TCB extensions
against the signed \`REPORTED_TCB\`, firmware launch TCB, debug and VMPL
policy, measurement and fresh \`REPORT_DATA\`. A syntactically valid report
or P-384 signature against an **unverified** key MUST NOT unlock the host,
a TenantVM or a secret. If endorsement checking or CRLs are unavailable,
the result is **UNSUPPORTED / NOT_EXECUTED**, never \`HARDWARE_ATTESTED\`.

The ABI and deterministic transcript test vectors live in draft
[atto-platform-conformance #543](https://github.com/atto-lang/atto-platform-conformance/pull/543).
The current LLVM and Java changes implement raw-report parsing, policy
matching, transcript hashing and signature-only tests using locally
generated **synthetic** keys. Those are \`HOST_ONLY\` primitives, not
cryptographic AMD endorsement or real-hardware test results.

### Offline VCEK endorsement validation — Family 19h only

The first implementation is a **non-admission, offline VCEK verifier**.
It MUST authenticate the exact AMD ARK trust anchor using an independently
approved, product-specific SHA-256 certificate fingerprint. A fingerprint
included in the evidence payload or received from an untrusted guest is not
an authorized trust anchor. The X.509 chain MUST bind ARK → ASK → VCEK and
reject expired/untrusted/revoked endorsements.

For Family 19h VCEK certificates (AMD `structVersion=0`), the verifier
compares certificate extensions to the signed report's `REPORTED_TCB`:
`blSPL (1.3.6.1.4.1.3704.1.3.1)` ↔ offset `0x180`;
`teeSPL (.2)` ↔ `0x181`; `snpSPL (.3)` ↔ `0x186`;
`ucodeSPL (.8)` ↔ `0x187`. The `hwID`
extension (`1.3.6.1.4.1.3704.1.4`) must match the full
64-byte `CHIP_ID` at `0x1a0..0x1df`. Malformed, duplicate, missing or
wrong-type extensions reject. Proof must establish the report signature
using the *verified* VCEK public key, never arbitrary caller-supplied keys.

The offline implementation requires trusted-host-provisioned, fresh issuer
CRLs for VCEK and ASK; absence of either denies rather than silently
disabling revocation. TCB policy and the authenticated AMD product family
must be independently reviewed before enabling a provider. **VLEK**
and Turin/family-1Ah `structVersion=1` are unsupported by this first
VCEK-only path. In particular, do not route cloud VLEK reports through
a VCEK endorsement verifier.

A successful `EndorsementCryptographyValid` /
`ENDORSEMENT_CRYPTOGRAPHY_VALID` is a **host-only cryptographic
observation**, not hardware-attested admission or authority to release a
secret. It does not establish a fresh, bound report-collection session,
trusted-product-root provisioning, authenticated ephemeral TLS private
key possession, tenant generation, or per-tenant guest isolation.
Those must be separately enforced and evidenced before a real
`HARDWARE_ATTESTED` classification.

## 6. Backend allocation

- **Java/GraalVM:** trusted Java host should verify TEE evidence via an
  approved verifier before any protected workload credential release.
  `TenantIsolateManager.open_confidential_tenant_vm` remains disabled until
  the provider and per-tenant security barriers are independently reviewed.
- **LLVM:** trusted native runtime validates hardware evidence outside
  hard-real-time actor turns. `VmSpec.require_confidential_compute` MUST
  fail closed without a reviewed provider. Appending a status code must not
  silently renumber existing ABI values. Native code cages and checked
  offsets alone do not implement hardware-TEE protection.

**Related drafts:** [Java #218](https://github.com/atto-lang/atto-source.java/pull/218)
and [LLVM #294](https://github.com/atto-lang/atto-source.llvm/pull/294).
