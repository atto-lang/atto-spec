# Process stdio as typed channel endpoints — v1 target

**Status: proposed normative target, NOT executable cross-backend parity.**
Companion: [I/O direction shorthand](io-direction-shorthand-v1.md),
[unary checked reads](unary-read-expression-v1.md), and
[suspension effect aliases](susp-effect-shorthand-v1.md).
This deliberately continues existing Atto/Ores work (legacy Java stdio #540)
instead of creating another input/output channel runtime.

## Identity, direction and ownership

In a host-process CLI profile, resolve these names to **identity-stable,
context-owned endpoint capabilities**, not new channels on each lookup:

| Alias | Identity | Data capability | Guest access |
| --- | --- | --- | --- |
| `stdio.in` | `process.stdin` | `Channel<string>` readable only | checked `readch` |
| `stdio.out` | `process.stdout` | `Channel<string>` writable only | checked `writech` |
| `stdio.err` | `process.stderr` | `Channel<string>` writable only | checked `writech` |

`Channel<string>` denotes the nominal channel element contract, **not**
permission to invoke every operation on a process-owned endpoint.
The compiler checks `Readable<string>`/`Writable<string>` capability
directions: `readch stdio.out`, `readch stdio.err`, and
`writech stdio.in, "x"` are errors. The two output streams remain
distinct sinks with independent ordering; no global stdout/stderr merge
order is guaranteed. Aliases use the same endpoint object, queue,
lifecycle, and capability generation, not copied platform descriptors.
User code cannot close the process-owned descriptor by dropping an alias.

A channel read **does not return bare `string`**. On this CLI text
profile, `readch stdio.in`, `<< stdio.in`, `(stdio.in >>)`, and the
directional read binder must preserve the exact checked completed outcome
`Result<Option<string>, IoError>`: `Ok(Some(s))` for a value,
`Ok(None)` for normal EOF, `Err(e)` for failure/cancellation.
Do not turn EOF into `""`, silently unwrap, convert a typed
`Result` into text, or generate a dummy input message.

For the process text-output profile `writech` is a potentially suspending
checked write of one string value with `Result<void, IoError>` as its
completed outcome. The output endpoint may queue UTF-8 bytes, but
successful write admission is not proof of terminal rendering or durable
flush. A typed write result may not be discarded when the checker requires
inspection. The existing channel `try` and `nb` variants retain their
separate ownership/ready/Future contracts and must not be substituted.

## Text and frame portability

The portable CLI text profile uses UTF-8 and LF-delimited stdin records;
a trailing CR immediately before LF is removed consistently, and EOF
delivers a final nonempty unterminated record **once**, then `Ok(None)`.
An empty line is `Ok(Some(""))`, distinct from EOF. A NUL is data,
not termination; malformed UTF-8 and input record quota overflow are
checked `IoError` conditions, never lossy or silently truncated.
The maximum allowed record length is an explicit, finite target-profile
configuration, not a platform-dependent implicit truncation. Writes
encode the supplied string as UTF-8 with **no implicit newline**.
To transport raw bytes or use different framing, choose explicit typed
byte adapters rather than passing `Bytes` to `Channel<string>` or
pretending arbitrary OS read chunk boundaries are portable message frames.

## Suspension, consumer lease and error handling

`pub susp fnc` and `pub suspends fnc` admit the same suspension effect.
`readch` / `writech` may suspend under backpressure or no input;
read/write readiness is implemented by continuation registration and an
event/reactor/host callback, **never blocking a scheduler carrier**.
`using io, suspend` (where enforced by the current effect profile)
and actual host permissions are separate obligations. `suspends` is not
an ambient grant to access process file descriptors.

`stdio.in.stream()` is a single-consumer pull-stream adapter over that
**same** stdin endpoint. Claim one exclusive reader lease per process
input endpoint per generation. Do not allow simultaneous `readch`,
`nb readch`, directional input extraction, or another active stream
subscription to race the stream adapter. Deny a competing consumer
before consuming bytes or registering a waiter; release the lease on
stream cancellation/drop/terminal EOF. `stdio.in` and
`process.stdin` share this lease. One active `readch` call may
claim/release the lease as part of its operation. Cancellation must
detach waiter ownership and avoid lost or duplicated records.

A write's queue is bounded in both items and bytes. A paused sink
backpressures its producer cooperatively, without sleeping, spinning,
unbounded buffering or borrowing a mutable payload across suspension.
Writes are admitted exactly once, checked for close/quota/cancel races.
Flush and process-exit drain are separately specified; never block an
actor carrier or claim durability from queue admission. On Unix,
broken pipe/SIGPIPE must surface as a checked error, not kill an
untrusted TenantVM or crash the shared process.

## Type-safe one-record echo target

This is a **target fixture**, not proof of current source compiler support:

```atto
pub suspends fnc main(): int using io, suspend {
  val input = stdio.in;
  val output = stdio.out;
  val prompt = writech output, "Echo the next input item:";
  return match prompt over
    on Err(_) -> 10,
    on Ok(_) -> match readch input over
      on Ok(Some(item)) -> match writech output, item over
        on Err(_) -> 12,
        on Ok(_) -> match writech stdio.err, "echo complete" over
          on Ok(_) -> 0,
          on Err(_) -> 13
        end
      end,
      on Ok(None) -> 11,
      on Err(_) -> 14
    end
  end;
}
```

The originally proposed unchecked `val item = readch input;
writech output, item;` is **not type-correct** for the fallible
channel contract: `item` is a `Result<Option<string>, IoError>`.
The compiler must report a payload type error, not stringify a Result,
hide EOF, or invent auto-unwrapping. Future explicit `?` propagation
may shorten this example only when the enclosing callable return type
supports it. The `stdio.in.stream()` path is an **alternative**,
not an additional concurrent stdin reader.

## Tenant security and profile rules

All three endpoints are capability-scoped to an authorized process/root
context. Mutually untrusted tenant actors have **no ambient** host
`stdio`/file-descriptor access merely because `process.stdin` exists.
An authorized host broker may explicitly grant a tenant-generation-scoped
redirected endpoint with operation, byte, queue, lifetime, and revocation
limits. It must never expose a raw OS fd, unrelated tenant's input, another
tenant's stderr, or a mutable shared channel reference. Check capability
before starting I/O or allocating unbounded work. Stale-generation uses,
post-revocation writes and process-global fd inheritance must fail closed.
Actor-local `io.*` and supervisor CONTROL mail are distinct from
`stdio.*`; ordinary process I/O is not actor CONTROL mail.

A browser/Wasm or JS worker with no host stdin uses an explicitly
authorized injected port/stream; no fabricated `process.stdin` or
unvalidated imports. HDL/synthesis and other targets with no process
stdio must reject with an explicit unsupported-profile diagnostic
(`E_UNSUPPORTED_PROFILE`), not synthesize shared-process I/O.
A backend claiming the host-process CLI profile must implement the
typed, suspending, checked semantics above.

## Parity and negative gates

1. Parse both `susp` and `suspends`, namespace aliases, and
   `readch`/`writech` independently of `<<`, `>>`, and `pipe`.
2. Compile and **execute** the echo fixture from real `.atto` on a
   host CLI profile; drive one UTF-8 record, empty line, EOF, trailing
   unterminated line, CRLF, Unicode, and NUL, and assert status and
   exact stdout/stderr bytes. No implicit prompt newline.
3. Reject writing the unread `Result<Option<string>,IoError>`,
   wrong-direction endpoints, non-suspending callable, missing `io`
   permission, parallel stdin consumers, and wrong-tenant grants.
4. Instrument blocked read/write registration to prove no parked
   carrier, no busy polling, bounded queue memory, exactly-once
   resume/commit, cancellation before/after readiness, and broken pipe.
5. Ensure alias object identity and a single consumer lease across
   `stdio.in`, `process.stdin`, and `stdio.in.stream()`.
6. Record exact compiler commit/tree, target toolchain, guest
   executable, I/O bytes/exit, negative diagnostics, and nonempty
   executed CI job steps for each backend. Host-side reference models,
   code-search excerpts, parser-only acceptance, or previous SHA
   receipts **never** establish parity.

**Backend status on authoring:** no new compiled guest or runtime receipt
has been supplied by this document. Preserve `NOT_EXECUTED` until a
verified target-specific test run establishes otherwise.

## Compatibility gate: existing browser stdout subset

The existing Rust/Wasm browser compiler's draft `stdio.out` subset
([atto-source.rs #176](https://github.com/atto-lang/atto-source.rs/pull/176))
lowers `writech stdio.out, value` and `stdio.out << value` to the
already-supported `stdio.print` import. That particular scalar print
operation has been admitted in **non-`susp` callables** and does not
provide a checked `Result<void,IoError>` for process-stdout close,
quota, cancellation or flush. It is **not** the full endpoint API here.

Introducing a checked, potentially suspending `writech stdio.out`
outcome is therefore a **source-visible API/ABI migration**, not a
drop-in compiler optimization. Before merging any implementation:
version the new typed host import, audit old stdout fixtures/call sites,
preserve a documented legacy-print adapter where needed, and require
positive/negative compiled-guest receipts for both forms. Never
retroactively claim the old non-suspending `stdio.print` test is
evidence of the new checked channel contract. If the language decides
to keep `stdio.print` permanently, its weaker admission-only
semantics must remain an explicitly distinct API rather than changing
the read/write channel rules.
