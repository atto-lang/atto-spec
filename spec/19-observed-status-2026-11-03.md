# 19 — Observed Status, 2026-11-03

**Status: a dated snapshot. It certifies nothing.** These are small programs run once on one developer machine. They do not meet the evidence bar in [chapter 11](11-conformance.md), so nothing here counts as IMPLEMENTED. They exist to show where the draft and the compilers differ.

## Environment

| Item | Value |
| --- | --- |
| Machine | macOS 26, arm64 |
| Java | `oreslang-source.java` `main` at `5c3d5414a1`, run through `dev.oreslang.launcher.OresMain` on OpenJDK 25, interpreter only |
| LLVM | `oreslang-source.llvm` branch at `f823a28ac`, a recent feature branch rather than `main`. IR was linked with plain `clang` and no runtime library |
| Not run | Wasm, Forge, .NET |
| Test programs | Written for this snapshot. Most return 42 on success. An exit status of 1 was checked against the error output, because some programs also return 1 |

Limits of these results:

- Programs were named `.ores` on Java and `.atto` on LLVM, because the Java launcher refused `.atto` with `mixed source must use .ores or .java`.
- **Compiled** on LLVM means the compiler accepted the source, but linking failed because no runtime library was supplied. Run time was not tested in those cases.
- A rejection may be specific to that program. LLVM's narrow subset often rejected a test for an unrelated reason, such as an untyped local. Such cases are listed as "Rejected (other)".

## Results

| Construct | Test | Java | LLVM |
| --- | --- | --- | --- |
| Function, `: T { }` | `fnc add(int a, int b): int { ... }` | Ran | Ran |
| Function, `-> T { }` | `fnc add(int a, int b) -> int { ... }` | Ran | Ran |
| Function, `-> T :: end` | Free function | Rejected | Rejected: `'::' body requires a class method` |
| Method, `-> T :: end` | Class method | Rejected | Rejected (other) |
| `routine` | `pub routine main(): int` | Ran | Ran |
| Nested comments | `/* a /* b */ c */` | Ran | Ran |
| Typed local | `val x: int = 41` | Ran | Ran |
| Untyped local | `val x = 41` | Ran | Rejected: needs `: int` or `: bool` |
| Mutable local | `let x: int = 41` | Ran | Rejected |
| `val` reassignment | `val b = 2; b = 3` | Rejected, as intended | Rejected (other) |
| `null` | `val x = null` | Rejected, as intended | Rejected (other) |
| Assignment as condition | `if x = 2 then` | Rejected, as intended | Rejected (other) |
| `if` forms | `then`, `; do` and `{ }`, closed by `fi` | Ran | Rejected |
| `while` | `while c do ... done` | Ran | Rejected (other) |
| `for` | C-style and `for const x of` | Ran | Rejected (other) |
| `loop` | `loop do ... done` | Ran | Rejected (other) |
| Ternary | `c ? 1 : 2` | Ran | Ran |
| `eq`, `neq` | `1 eq 1` | Ran | Ran |
| Digit separators | `1_000 == 1000` | Ran | Ran |
| Hex literal | `0x2A` | Rejected | Rejected |
| Number too large | `9223372036854775808` | Rejected, as intended | Rejected, as intended |
| `int` overflow | max + 1 | Wrapped | Trapped (SIGTRAP) |
| `i8` range | `127 + 1` | Gave 128 | Type rejected |
| `u8` literal | `val a: u8 = 300` | Accepted | Type rejected |
| `bigint` | 2^63−1 + 1 | Wrapped | Type rejected |
| `/` on two `int`s | `7 / 2` | Gave a `float` | Rejected |
| `%` by zero | `5 % 0` | Host `ArithmeticException` | Rejected: needs a nonzero literal |
| `float`, `f32`, `f64` | Comparison | Ran | Type rejected |
| `decimal` | `val d: decimal = 0.1` | Rejected: literal is `FLOAT` | Type rejected |
| `complex` | `3 + 4i` | Ran | Type rejected |
| Cross-type equality | `1 eq 1.0` | True | Rejected |
| `String` | Literal | Ran | Compiled |
| Concatenation | `"a" + "b"` | Ran | Rejected (other) |
| `.length()` | `s.length()` | Rejected: unknown member | Rejected (other) |
| Symbol | `#ready`, `#"with spaces"` | Ran | Rejected: unsupported token |
| Unquoted spaced Symbol | `#with spaces` | Rejected | Rejected |
| Tuple destructure | `[const a, const b] = t` | Ran | Rejected (other) |
| Array | `arr[40, 2]` | Ran | Rejected (other) |
| Fixed array | `FixedArray[3 of int]` | Ran | Type rejected |
| Out-of-bounds index | `a[5]` | Host `IllegalArgumentException` | Rejected (other) |
| Struct literal | `infer struct{a: 42}` | Ran | Rejected (other) |
| `Option.unwrap` | `Some(4)` | Ran | Compiled |
| `unwrap_safe` | On `None` | Ran | Rejected (other) |
| Panic through `try` | `None.unwrap()` in `try` | Not caught, as intended | Rejected (other) |
| Postfix `?` | `g()?` | Rejected | Rejected (other) |
| `throw`, `panic`, `trap` | As statements or expressions | Rejected: lowering not available | Rejected: lowering not available |
| `defer` | `defer print("d");` | Ran | Rejected (other) |
| Plain `match` | Arms with `->` and a block | Ran | Rejected: expects `over` |
| Non-exhaustive `match` | Missing `None` | Rejected, as intended | Rejected (other) |
| `do match ... over` | `on` arms with blocks | Ran | Literal patterns only |
| `match ... over` expression | `on` arms with values | Rejected: expects `{` | Literal patterns only |
| `switch` | `case 1 -> { ... }`, `default -> { ... }` | Ran | Rejected (other) |
| `switch`, other spellings | `1 -> { }` and `case 1:` | Rejected | Rejected (other) |
| Class | `define class P as ... end` | Ran | Rejected (other) |
| Class with braces | `define class P { }` | Rejected | Rejected |
| Module | `define module m as ... end` | Ran | Rejected: trailing source |
| `define pub module` | Chapter 01 target | Rejected: no modifiers | Rejected: not in the subset |
| `define enum` | Chapter 02 target | Rejected | Rejected: needs ADT lowering |
| `define trait` | Empty | Ran | Ran |
| Type alias | `type N = int \| bool;` | Ran | Rejected |
| Generic function | `id<int>(1)` | Ran | Ran |
| Named generic | `id<T=int>(42)` | Ran | Ran |
| Named value call | `f(b: 2, a: 4)` | Rejected | Ran |
| Lambda | `\|int x\| -> x + 1` | Ran | Rejected |
| `\|>` | `41 \|> inc` | Ran | Rejected |
| `rt take` then reuse | Use after move | Rejected, as intended | Rejected (other) |
| `&mut x` | Unary borrow | Rejected: use `rt` forms | Rejected (other) |
| `async`, `await` | `await g()` | Ran | Rejected: lowering not available |
| CPU task | `cpu task { return 42; }` | Ran | Rejected: lowering not available |
| `nb` task block | Chapter 06 target | Rejected: needs `Future<T>` context | Rejected: lowering not available |
| Channel | `Channel.new<int>(1)` | Ran | Rejected |
| `do select first` | One ready channel | Ran | Rejected |
| `do nb-select` | With `default:` | Rejected in the spelling tried | Rejected |
| Generator | `generator fnc` | Ran | Rejected: needs `generator*` |
| Actor, send and stop | `define actor`, `spawn`, `send`, `get_done` | Ran | Rejected: needs a scalar field |
| Actor constructor | `pub constructor() {}` | Rejected, as intended | Rejected (other) |
| Scalar actor | `define actor C as { ... on_message ... }` | Rejected | Compiled |
| Actor `state { }` | Chapter 05 target | Rejected | Rejected: needs `handle_state` lowering |
| Actor calling a module function | Implicit access | Rejected, as intended | Rejected (other) |
| `define supervisor` | Chapter 13 target | Rejected: lowering not available | Rejected |
| `spawn A() pipe spawn B()` | Chapter 03 target | Rejected: lowering not available | Rejected |
| Stack overflow, no actors | `rec(n + 1) + 1` | Exit 1 | SIGSEGV |
| Stack overflow in an actor | Other actor waiting | Exit 1, other actor never ran | Not run |

## Draft examples that do not compile today

The draft marks these as targets, so this is expected. They should not be mistaken for working code:

- `-> T :: ... end` as a function body (chapters 01, 02, 03, 05).
- `define pub module` (chapter 01).
- `define enum` and the unquoted Symbol `#with spaces` (chapter 02).
- `state { }` with `handle_state` (chapter 05).
- `let Task<int> work = nb { ... }` (chapter 06).
- `spawn A() pipe spawn B()` (chapters 03, 05).
- `define supervisor` (chapter 13).

A separate test harness for the tenant VM branch produced the tenant results in [chapter 18](18-runtime-guarantees.md). That branch was not part of this table.
