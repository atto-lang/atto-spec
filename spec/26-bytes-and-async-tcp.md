# 26 — Bytes, Async TCP and Async File I/O

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

### Binary codec helpers (v1.1)

These are memchr/memcpy-class primitives so binary protocol framing (AMQP, Kafka) does not pay per-byte interpretation cost. Framing logic itself stays in AttoLang. All reads are bounds-checked and never clamp.

| Member | Type | Semantics |
| --- | --- | --- |
| `b.read_u16_be(i)` / `b.read_i16_be(i)` | `int` | 16-bit big-endian at offset `i`, unsigned or signed. |
| `b.read_u32_be(i)` / `b.read_i32_be(i)` | `int` | 32-bit big-endian, unsigned or signed. |
| `b.read_i64_be(i)` | `int` | 64-bit big-endian, signed. |
| `b.read_uvarint(i)` | `Tuple[int, int]` | Unsigned LEB128 `(value, next offset)`. At most 10 bytes; truncated or over-63-bit encodings fail. |
| `b.read_zigzag_varint(i)` | `Tuple[int, int]` | Zigzag-encoded signed varint (Kafka/protobuf). |
| `b.crc32c(start, end)` / `b.crc32(start, end)` | `int` | CRC-32C (Castagnoli) or CRC-32 (IEEE) of `[start, end)`. |
| `Bytes.from_u8(n)`, `from_u16_be`, `from_i16_be`, `from_u32_be`, `from_i32_be`, `from_i64_be` | `Bytes` | Big-endian encodings; out-of-range values fail. |
| `Bytes.from_uvarint(n)` / `Bytes.from_zigzag_varint(n)` | `Bytes` | Varint encodings; `from_uvarint` requires `n >= 0`. |
| `Bytes.join(List<Bytes> parts)` | `Bytes` | Concatenation in one pass; moves the list. |

Conformance vectors: uvarint 300 = `AC 02`; zigzag −1 = `01`, 1 = `02`, −64 = `7F`; CRC-32C("123456789") = `0xE3069283`; CRC-32("123456789") = `0xCBF43926`.

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

### Split connections and timers (v1.1)

Push-style protocols (NATS `MSG` fan-out, AMQP `basic.deliver`, Kafka long-poll `Fetch`) must write to a client while also reading from it.

* `conn.split(): Tuple[NioReader, NioWriter]` is synchronous and **consumes** the connection. Each half is affine Send (never Sync/Share), like the connection, so a reader task and a writer task can each own one direction.
* `NioReader`: `read_owned_bytes_async(int max)`, `read_bytes_async(int max)`, `close_async()` (shuts down input).
* `NioWriter`: `write_owned_bytes_async(Bytes)`, `write_bytes_async(List<int>)`, `close_async()` (shuts down output).
* The socket closes when both halves are closed. A half moves into an async callee only through an owned formal of the same direction.
* `process.sleep_async(int ms): Future<void>` is a nonblocking timer, `0 <= ms <= 86_400_000`. It suspends only the caller, and cancelling the Future cancels the timer. Combine it with `Future.race` for timeouts and heartbeats. Timers are owned by the runtime context and revoked when it closes.

The canonical push-server shape gives each connection a reader task (parses input, sends commands to the state owner), a writer task fed by a bounded `Channel<Bytes>`, and the state owner writing to that channel.

## Async file I/O v1

For logs, journals and append-only stores (Kafka partitions, AMQP durable queues, NATS JetStream, Redis AOF). All blocking work runs off the scheduler threads; guest code sees Futures only.

| Operation | Result |
| --- | --- |
| `fs.open_binary_async(string path)` | `BinaryFile`, opened or created. Requires READ and WRITE permission on both the lexical and canonical path; symlinks and non-regular files are refused. |
| `file.append_async(Bytes data)` | `int`: offset where `data` starts. `data` is moved. |
| `file.sync_async()` | `void`: file content reaches stable storage (fdatasync semantics). An append is durable only after a later `sync_async` completes. |
| `file.read_at_async(int offset, int length)` | `Bytes`: up to `length` bytes (≤ 1 MiB) at `offset`; fewer at end of file, empty past it. |
| `file.size_async()` | `int` |
| `file.truncate_async(int size)` | `void`: shrink to `size` (e.g. drop a torn tail during recovery). Growing is rejected. |
| `file.close_async()` | `void`; later use fails. |

`BinaryFile` is affine Send: it may move into one task, never be shared.

## Backend status

| Backend | Status |
| --- | --- |
| Java/GraalVM | IMPLEMENTED on `oreslang-source.java` main: `Bytes` v1 (#3043, tests `AttoBytesV1GuestTest`), codec helpers v1.1 (#3056, `AttoBytesCodecGuestTest`), Async TCP v1 (#2894, #3042, `AttoNioAffineTaskMoveGuestTest`), split connections and `process.sleep_async` (#3051, `AttoNioSplitAndTimerGuestTest`), async file I/O v1 (#3057, `AttoBinaryFileGuestTest`). The runtime still carries transitional RESP-specific `read_resp2_*`/`write_resp2_*` members, which are outside this contract and scheduled for removal. |
| LLVM | NOT_IMPLEMENTED. |
| .NET | NOT_IMPLEMENTED. |
