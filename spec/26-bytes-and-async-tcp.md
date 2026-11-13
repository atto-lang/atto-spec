# 26 — Bytes and Async TCP v1

**Status: DRAFT / TARGET, 2026-11-13.** This chapter defines the portable byte-string type and the nonblocking TCP surface used by network services (the four broker implementations in particular). **IMPLEMENTED** only where a backend row below names exact evidence. Protocol logic (RESP, AMQP, Kafka, NATS framing) is application code and MUST be written in AttoLang on top of these primitives; a backend MUST NOT add protocol-specific parsing to this surface.

## `Bytes`

`Bytes` is a built-in, non-generic, immutable byte string of at most a backend-documented bound (Java: 1 MiB per value).

Ownership:

* `Bytes` is **move-only**. Binding, assignment and by-value argument passing move the handle; later use of the source is `use of moved value`.
* Read-only members (`size`, `byte_at`, `index_of`, `slice`, `concat`, `equals`, `copy`, `to_list`, `to_utf8`) never consume the receiver. `equals` and `concat` only read their argument.
* Every operation that yields `Bytes` returns a **fresh owned value**. No guest code observes or aliases a mutable backing buffer. Implementations MAY share immutable storage internally, provided `close()` on one handle cannot affect another.
* `take(): Bytes` moves ownership into a new handle and invalidates the receiver. `close()` releases the handle early. Any later use of a taken or closed handle fails at runtime.
* `Bytes` is `Send` (it may cross a task boundary by move) and immutable, so it may be shared across actors under the immutable-sharing rules of chapter 22.

| Member | Type | Semantics |
| --- | --- | --- |
| `Bytes.empty()` | `Bytes` | Zero-length value. |
| `Bytes.from_list(List<int>)` | `Bytes` | Each element MUST be an integer `0..255`; otherwise a runtime failure. |
| `Bytes.from_string(string)` | `Bytes` | UTF-8 encoding. |
| `b.size()` | `int` | Length in bytes. |
| `b.byte_at(int i)` | `int` | Value `0..255`; index outside `0..size-1` fails. |
| `b.index_of(int v, int from)` | `int` | First index `>= from` holding `v`, else `-1`. `v` outside `0..255` or `from` outside `0..size` fails. |
| `b.slice(int start, int end)` | `Bytes` | Copy of `[start, end)`. Bounds are checked and never clamped: `0 <= start <= end <= size`. |
| `b.concat(Bytes other)` | `Bytes` | `b` followed by `other`. |
| `b.equals(Bytes other)` | `bool` | Byte-wise content equality. |
| `b.copy()` | `Bytes` | Independent owned copy. |
| `b.to_list()` | `List<int>` | Copy as integers `0..255`. |
| `b.to_utf8()` | `Option<string>` | Strict UTF-8 decode; `None` on malformed input. |

Unknown constructors or members are compile errors.

### `Bytes` in `Map`

`Bytes` is an admitted `Map` key and value domain (`~map<Bytes, Bytes>()`, `~map<Bytes, int>()`, ...):

* Keys compare and hash **by content**, never by handle identity.
* `set(k, v)` moves both `k` and `v` into the map.
* `get_optional(k)` and `delete(k)` **borrow** `k` (the caller keeps it). `get_optional` returns an independent copy of a stored `Bytes` value, never the map's own handle.
* Indexed read `m[k]` stays restricted to copyable value domains.
* Bytes-keyed maps are data stores with their own bounded quotas (Java: 2^24 entries, 2^32 aggregate key bytes), independent of the symbol-property object limit.

## Async TCP v1

All operations are asynchronous and MUST NOT block a scheduler thread. Each returns `Future<T>` and is used with `await`. Synchronous or `_blocking` variants are not part of this surface.

| Operation | Result |
| --- | --- |
| `network.listen_async(string host, int port)` | `NioListener` bound to a numeric host. Port `0` selects an ephemeral port. |
| `listener.local_port_async()` | `int` |
| `listener.accept_async()` | `NioConnection` |
| `listener.close_async()` | `void` |
| `conn.read_owned_bytes_async(int max)` | `Bytes` of `1..max` bytes, or an empty `Bytes` at end of stream. |
| `conn.write_owned_bytes_async(Bytes data)` | `void`; completes after all of `data` is accepted by the transport. `data` is moved. |
| `conn.read_bytes_async(int max)` / `conn.write_bytes_async(List<int>)` | Legacy `List<int>` forms with the same semantics. |
| `conn.close_async()` | `void` |

Ownership and concurrency:

* `NioConnection` is **affine Send, never Sync/Share**. It may MOVE into exactly one `task { ... }` or async callable whose formal is an owned `NioConnection`; capturing it twice, or using it in the parent after the move, is a compile error. A backend MUST also reject at runtime an attempt to pass it into a formal of any other type.
* `NioListener` is not Send; it stays with its owning task.
* A connection admits at most one pending read and one pending write at a time.
* Network access requires the `NETWORK` capability.

The canonical multi-client server shape is an accept loop inside a structured `task scope`, moving each accepted connection into its own session task:

```atto
pub async routine main(): void {
  val listener = await network.listen_async("127.0.0.1", 6380);
  task scope {
    loop {
      val socket = await listener.accept_async();
      let Future<void> session = task { await serve(socket); return; };
    }
  }
}
```

## Backend status

| Backend | Status |
| --- | --- |
| Java/GraalVM | `Bytes` v1 and Async TCP v1 IMPLEMENTED: `oreslang-source.java` main, tests `AttoBytesV1GuestTest`, `AttoNioAffineTaskMoveGuestTest`, `AttoAsyncNioTcpGuestTest`. The runtime still carries transitional RESP-specific `read_resp2_*`/`write_resp2_*` members, which are outside this contract and scheduled for removal. |
| LLVM | NOT_IMPLEMENTED. |
| .NET | NOT_IMPLEMENTED. |
