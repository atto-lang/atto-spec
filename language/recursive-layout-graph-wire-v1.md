# Recursive layouts and identity graphs v1 (candidate)

Status: TARGET, NOT_EXECUTED by any guest compiler. This chapter refines the
existing copyable-ownership-v1 and primitive-object-storage-java-llvm-v1
contracts; it does not ratify new grammar, change the legacy copy! edition,
or authorize automatic sharing. Coordinate Java #560/#561/#565/#1713,
LLVM #427 and serialization #48 before admitting implementation. The existing checked structural preflight in serialization #48 remains a separate tree-value API; it does not authorize graph decoding or deep copy.

## Separate three independent proofs

1. Alias resolution: declaration identity and normalized type arguments must
   form a finite regular graph. Reject transparent alias cycles and growing
   polymorphic recursion. Bound depth, expanded work and instantiations.
2. Physical layout: construct the graph of *inline storage* dependencies
   after normalization and target layout selection. Reject every cycle in
   that graph, including self-edges. A nominal identity allocation, verified
   managed reference or dynamically allocated collection may cut an inline
   edge; Option, Result, enum, tuple, record, fixed array and union do not
   automatically imply indirection. A backend proposing boxing must prove
   the ABI, ownership, alignment, checked size arithmetic and AOT lowering.
   Zero-length inline arrays require an explicit no-storage layout proof.
3. Inhabitation: separately compute a least fixed point of finite
   constructors. A nullable alternative can establish a finite witness
   without making inline storage finite. A class requiring itself during
   initialization may be uninhabitable without a separately checked delayed
   initialization protocol. Do not treat weak references, functions or
   resource handles as proof of arbitrary initialized payloads.

A type can pass one proof and fail another. Diagnostic candidates:
E_TYPE_ALIAS_CYCLE, E_TYPE_EXPANSION_LIMIT, E_TYPE_LAYOUT_CYCLE,
E_TYPE_NO_FINITE_BASE. No compiler is required to adopt those spellings
without the existing diagnostic contract review.

## Actor-local identity

A managed reference is a capability, not a raw pointer. Verify tenant/actor
identity, actor generation, slot and slot generation on every dereference,
including weak upgrade after suspension. Reject foreign edges before mutation;
the old cell must survive any failed replacement. Do not allow opaque FFI
containers or unverified host callbacks to bypass admission. Local cycles
are legal only through proved identity-bearing edges. Weak edges do not
extend strong reachability; reclaim and revoke at quiescence, with bounded
work and exactly-once resource retirement. No mandatory global tracing GC.

## Deep copying

copy! stays shallow; copy!! requires independent DeepCopyable proof.
Compile a finite indexed descriptor graph (not an infinitely expanded plan);
a recursive descriptor reference is not itself a source object reference.
Verify exact concrete type, field/edge ownership, source domain and live loans.
Keep a bounded identity-to-destination map and allocate private destination
shells before populating outgoing edges. Repeated source identities map to
one fresh destination identity; a backedge points to its copied destination.
No constructors, reflection, JIT, user callbacks, raw addresses or resource
duplication. Preserve the existing Copyable/DeepCopyable distinction, checked immutable interned sharing, zero-argument copy methods, call-loan ownership and temporary cleanup obligations. This proposal does not ratify any graph wire ABI. Source remains unchanged; publish only after all fields validate.
On error/cancellation, discard the entire unpublished allocation transaction.
Do not infer Sendable, Copyable, or serialization eligibility from DeepCopyable.

## Explicit typed graph wire profile

Ordinary JSON, CBOR, MessagePack and Protobuf tree APIs must not silently
become graph codecs. They must reject cycles using bounded traversal, and
must not serialize live actor capabilities. Define a separately negotiated
versioned logical envelope, independent of the selected binary/text framing.
The first proposed profile is closed-world and strongly reachable only:
version=1, root ID, ordered object table with dense document-local IDs,
registered type IDs and descriptor-defined fields. No arbitrary type
names, dynamic loading, references to external documents or runtime handles.
Each strong edge contains an explicit object ID; optional edges may be
absent only when the descriptor permits. Weak-edge transport is out of
scope for v1, fail closed. Do not confuse data object IDs with actor slots.

Admission: authenticate schema/version; validate exact envelope and field
shapes, IDs, edge targets and their types, scalar ranges and cumulative byte,
node, edge and work quotas; reject duplicate, dangling, unreachable, unknown
or malformed entries. Charge wire bytes before materialization; bound all
integer arithmetic, parser depth and allocation estimates. Snapshot or
exclusively borrow the source during encoding. Decoder allocates shells only
after complete validation; populate without user code; commit the root
atomically. Failed operations produce neither partial roots nor live handles.
Identity is local to one decoded graph, not preserved across messages.

The source-free reference model covers a deliberately restricted Node/Other
schema with int32 payload and optional strong next/alias edges, logical
object/edge bounds, and inline layout admission. It is not a wire parser,
actual memory allocator, actor runtime, compiler, or proof of quota units
for production. Its choices of dense IDs and caps are proposed for review. Treat the model inputs as structured trusted fixture data only, not an untrusted deserialized byte stream.
Backend conformance must independently execute recursive ADTs, class layouts,
invalid cycles, generic growth, cyclic and diamond copies, byte-level
malformed wire inputs, allocation failure, rollback, stale generations,
weak upgrade, suspension and cancellation on exact reviewed heads.
