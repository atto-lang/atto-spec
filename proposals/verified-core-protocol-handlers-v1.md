# Verified Core protocol handler binding v1

Status: **candidate frontend profile** extending [file-local protocol declarations](verified-core-protocol-declarations-v1.md). A binding checks that one actor declaration supplies a complete set of typed transition handlers for a resolved local protocol.

```atto
define dimension Time;
define unit Millis: Time;

type Timeout = i32 where self > 0 and self <= 60_000 and units in Millis;

define protocol Connection as
    initial Disconnected;
    Disconnected -> Connecting on connect(Timeout timeout);
    Connecting -> Connected on connected;
    Connecting -> Failed on fail;
    terminal Failed;
end

define actor ConnectionActor implements Connection as
    connect(Timeout timeout) -> void { transition Connecting; }
    connected() -> void { transition Connected; }
    fail() -> void { transition Failed; }
end

pub fnc main() -> int { return 42; }
```

- A standalone Verified Core file places actor bindings after protocol graph declarations and before its scalar functions. An actor name is unique in the file and distinct from local refinement and protocol names. The `implements` clause resolves an earlier protocol declaration.
- Require exactly one handler for each distinct message tag. Each handler's ordered parameters must have the same resolved carrier, dimensions, scale, and bounds as the edge payload. Parameter names are local to the handler. The result type is `void`.
- The body in this profile consists of one `transition Destination;` statement. Its destination must match every edge for the message. A protocol that uses a single tag to reach different states needs a future state-dependent handler proof. Message tags remain in the protocol namespace as actor bindings and cannot serve as scalar call targets.
- Report an unresolved protocol or duplicate actor name as `E_PROTOCOL_ACTOR`, incomplete or duplicate handlers as `E_PROTOCOL_HANDLER`, a parameter mismatch as `E_PROTOCOL_PAYLOAD`, and an invalid transition or body as `E_PROTOCOL_TRANSITION`.

The source checker retains the validated actor bindings alongside the protocol graph. Java, LLVM, and .NET can compile and run the containing scalar program. The [local protocol mailbox profile](verified-core-protocol-mailbox-v1.md) lowers these bindings to live JVM and .NET mailboxes. The shared transition oracle also applies the verified destination after a legal source edge and checked message payload.
