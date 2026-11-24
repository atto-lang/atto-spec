# Verified Core protocol declarations v1

Status: **candidate executable frontend profile** for the [Verified Core RFC](https://github.com/atto-lang/atto-source.java/pull/1799). It defines and verifies file-local protocol graphs with typed scalar messages. A declaration introduces a source descriptor that creates no actor, mailbox, handler, or exported wire type.

## Source and resolution

A standalone source may declare protocols after optional dimension, unit, and [refinement declarations](verified-core-refinements-v1.md) and before its scalar functions. `protocol`, `initial`, `terminal`, and `on` are contextual. At the beginning of a clause, an identifier immediately followed by the arrow token denotes a source state. Message arguments use type-first syntax. An empty argument list and an omitted argument list both mean zero payload fields.

```atto
define dimension Time;
define unit Second: Time;
define unit Millis: Time = Second / 1000;

type Timeout = i32 where self > 0 and self <= 60_000 and units in Millis;

define protocol Connection as
    initial Disconnected;
    Disconnected -> Connecting on connect(Timeout timeout);
    Connecting -> Connected on ready;
    Connecting -> Failed on fail;
    Connected -> Disconnected on disconnect;
    terminal Failed;
end

pub fnc main() -> int { return 42; }
```

- Require exactly one initial-state clause. The state set is the union of that state and all edge endpoints. Each terminal clause names one distinct member of this set. Terminal states have no outgoing application edges.
- Each ordered pair of source state and message tag selects at most one edge. A message tag can recur in different source states with the same ordered payload types. Compare scalar width, normalized dimension and scale, and inclusive bounds. Field names are local to an edge and must be unique within its payload.
- Payload carriers are `int`, `i32`, and earlier scalar refinement aliases. A protocol name is unique in the file and distinct from the scalar carrier and refinement names. Protocols and payloads resolve before lowering the containing file.
- Admit at most 64 protocols per file, 128 states and 256 edges per protocol, and 16 payload fields per edge. Classify failures with `E_PROTOCOL_INITIAL`, `E_PROTOCOL_TERMINAL`, `E_PROTOCOL_DUPLICATE`, `E_PROTOCOL_PAYLOAD`, `E_PROTOCOL_LIMIT`, or the ordinary syntax diagnostic where the frontend cannot recognize a name.

## Reference transition semantics

In the reference model, an incarnation starts at the declared initial state with a scalar state value that satisfies its invariant. A dispatch checks the incarnation, whether it is live, the current state's edge for the message, and the payload's units and bounds. A pure staged handler proposes a destination and state value. Publication requires the declared destination, preservation of the invariant, and an unchanged live incarnation snapshot. It commits the destination and scalar state together. A rejected or failed dispatch leaves the previously published state value intact. Stop fences a staged publication, and restart establishes initialization under a new incarnation.

The shared reference model covers these transitions over copyable scalar payloads. Conformance runs the normal Java, LLVM, and .NET compiler entry points on equivalent declarations, malformed graphs, and inconsistent signatures. Successful declaration cases also execute the containing scalar program. [Actor handler binding](verified-core-protocol-handlers-v1.md) checks handlers against these declarations. Runtime dispatch, message ownership settlement, and observations under real scheduler races require further implementation and execution evidence.
