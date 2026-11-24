# 17 — Primitives and Core Types

**Status: DRAFT.** This chapter lists the built-in types and the primitives that concurrency is built from. [Chapter 02](02-types-and-patterns.md) covers the type system itself. Behavior described as "observed" comes from the local runs in [chapter 19](19-observed-status-2026-11-03.md) and is not a language rule.

## Scalars

| Type | Meaning | Observed |
| --- | --- | --- |
| `bool`, `boolean` | `true` or `false`. The two spellings are the same type | `bool` works on Java and LLVM. `boolean` works on Java |
| `int` | Signed 64-bit integer | Works on both, but overflow differs (see below) |
| `i8` `i16` `i32` `i64` `u8` `u16` `u32` `u64` `uint` | Sized integers | Java accepts them but does not enforce their range. LLVM rejects them as local types in the tests |
| `bigint` | Intended as arbitrary precision | Java accepts it but treats it as 64-bit |
| `float` `f32` `f64` | Floating point | Java runs them. LLVM rejected them as local types in the tests, although its diagnostics show some `f64` support elsewhere |
| `decimal` | Decimal number | Java accepts the type, but a literal such as `0.1` is a type error against it |
| `complex` `complex64` `complex128` | Complex number | Java runs `3 + 4i` |
| `String` | Text | Java runs it. LLVM compiles it but needs its runtime library to link |
| `string` | Lowercase spelling | Java accepts it. Which spelling is canonical is open (S-23) |
| Symbol | `#name`, an interned name | Java runs it. LLVM rejected the token |
| `void` | No value | Works as a return type |

AttoLang has **no `null` value** and **no truthiness**. Absence is `Option<T>`, and conditions must have type `bool`.

Boolean logic uses `&&` (short-circuit AND), `||` (short-circuit OR) and the named `Xor(bool, bool)` intrinsic. `^^` is eager integer bitwise XOR, not Boolean XOR; statement-leading `^ expression;` is a return shorthand. The built-in `And`, `Or` and `Xor` functions remain available. See [chapter 16](16-lexical-and-grammar-reference.md#operators) for precedence and backend status. Inside conditions, `,` and `|` are still accepted as AND and OR.

## Integer rules

The chapter 02 rule is that no backend may rely on unchecked host overflow when the source specifies checked arithmetic. The historical observed backends below do not necessarily implement the canonical language rules:

| Program | Java | LLVM |
| --- | --- | --- |
| `int` max + 1 | Wraps to a negative number | Traps at run time |
| `val a: i8 = 127; a + 1` | Gives 128 | `i8` local rejected |
| `val a: u8 = 300` | Accepted | `u8` local rejected |
| `val a: i32 = 2147483647; a + 1` | Stays positive, so no 32-bit wrap | `i32` local rejected |
| `bigint` 2^63−1 + 1 | Wraps | `bigint` local rejected |
| `int / int` | Gives a `float` | Rejected |
| `5 % 0` | Fails with a host `ArithmeticException` | Rejected unless the divisor is a nonzero literal |
| `1 eq 1.0` | True | Rejected: operands must have the same scalar type |

**TARGET (decided):** integer arithmetic is checked. Dynamic overflow raises an ordinary `ArithmeticOverflowError` that can be caught or captured as a Result. Unhandled actor errors follow [chapter 07](07-errors-and-failure.md) and [chapter 18](18-runtime-guarantees.md). Integer arithmetic never wraps silently.

This has a direct consequence: sized types must be real types with enforced ranges, not aliases of `int`, or `i8` could never overflow.

Backends must emit the checked guest-error path or reject operations whose safety they cannot establish.

**PROPOSED** (S-24):

1. A literal or constant expression outside its declared type's range is a compile-time error.
2. `bigint` is either truly arbitrary precision or rejected. It must not silently act as 64-bit.
3. Division by zero is a language-level failure with a defined class, never a host exception.

Outside an actor, unhandled overflow ends the root invocation as described in [chapter 07](07-errors-and-failure.md).

**DECIDED (2026-11-23):** source `int / int` truncates toward zero and returns an `int`. Explicit floating operands select floating division. Division by zero and signed minimum divided by minus one produce distinct ordinary guest errors. See [the reconciliation contract](../language/cross-backend-semantics-reconciliation-v1.md#numeric-semantics).

## Equality and identity

- `a eq b` compares values, using AttoLang's rules and never host `equals()`. Records, tuples, arrays, `Option` and `Result` compare by content. Class and actor instances compare by identity unless a future protocol says otherwise.
- `a is b` compares identity. It needs reference or handle values, and scalars are rejected.
- `switch` constants and literal `match` patterns use the same value equality as `eq`.
- Whether numbers of different types can be equal is open. See the `1 eq 1.0` row above.

## Aggregates

| Type | Size | Elements | Meaning |
| --- | --- | --- | --- |
| `Tuple[A, B]`, or `[A, B]` | Fixed at compile time | Mixed | A product value, with exact arity |
| `FixedArray[...]`, `FixedList[...]` | Fixed at compile time | Exact shape | Fixed storage, as in `FixedArray[3 of int]` |
| `Array[T]`, `List[T]`, `Vector[T]` | Set at run time | One type or an explicit repeating pattern | Owning sequence |
| `Slice[T]` | Set at run time | One type | Non-owning view |
| `{a: int}`, `record {...}` | Closed | Named fields | Readonly structural value |
| `infer struct{...}` | Closed | Named fields | Closed-shape value, distinct from a record |
| `define class` | Declared | Named fields | Nominal type with identity and methods |

- `[...]` describes shape, `<name=value>` carries compile-time metadata, and `(...)` carries run-time construction state. These three channels must not be merged.
- `ArrayList` is not a core sequence type on Java `main`. Chapter 02 uses it only as a conditional example.
- On Java, an out-of-bounds index fails with a host `IllegalArgumentException`. **TARGET:** it becomes a language-level panic with a defined class.

## Option and Result

Both are ordinary data, not exceptions. `Result` always takes two type arguments.

| Operation | `Option<T>` | `Result<T,E>` |
| --- | --- | --- |
| Construct | `Some(v)`, `None` | `Ok(v)`, `Err(e)` |
| Inspect | `is_some()`, `is_none()` | `is_ok()`, `is_err()` |
| Extract or panic | `unwrap()`, `expect(msg)` | `unwrap()`, `expect(msg)` |
| Extract with fallback | `unwrap_or(v)` | `unwrap_or(v)` |
| Keep failure as data | `unwrap_safe()` gives `Result<T, OptionUnwrapError>` | `unwrap_safe()` gives `Result<T, E>` |

On Java, `try/catch` did not catch an `unwrap()` panic in the test, which matches [chapter 07](07-errors-and-failure.md). Postfix `?` is a target and did not parse on Java in the test.

## Callables

- Function types use `=>`, as in `(int) => int`. Executable code uses `->`.
- Lambdas use `|int x| -> x + 1` or `|int x| -> { return x + 1; }`.
- `|>` passes the left value as the first argument of a named callable: `41 |> inc`.
- A function returns exactly one value. A tuple or record counts as one value.

## Ownership operations

`rt take`, `rt copy`, `rt borrow`, `rt share` and related forms are defined in [chapter 04](04-ownership-and-memory.md). On Java, using a value after `rt take` is rejected at compile time.

Spellings disagree here. Chapter 04 writes `rt borrow mut`, while the Java diagnostic asks for `rt mut borrow`, and the v0.6 grammar still lists `&` and `&mut`, which that same diagnostic refuses (S-26).

## Concurrency primitives

These are the building blocks. Semantics live in [chapter 05](05-actors-and-state.md), [chapter 06](06-async-and-scheduling.md) and [chapter 18](18-runtime-guarantees.md).

| Primitive | What it is | Spelling that ran on Java |
| --- | --- | --- |
| Actor | Confined state and mailbox; concurrent by default, serial by explicit declaration | `define actor W as ... end`, `define serial actor W as ... end`, `spawn W()` |
| `ActorRef` | Reference to one actor instance, across its restarts | `w.send(v)`, `w.stop()`, `await w.get_done()` |
| `ActorMail<T>` | A received message | `receive(ActorMail<int> mail): void { ... }` |
| `Future<T>` | A value that settles later | `async fnc`, `await` |
| CPU task | Explicit CPU work with a result | `let Future<int> t = cpu task { return 42; };` |
| `Task<T>` | Target structured task | `nb { ... }` as written in chapter 06 was rejected |
| `Channel<T>` | Typed, bounded queue | `Channel.new<int>(1)`, `writech c, v;`, `readch c` |
| Select | Waits on several channels | `do select first { when readch c: const v { ... } }` |
| Generator | Pull-based sequence | `generator fnc g(): int { yield 42; return; }` |
| `AsyncIterator<T>` | Async sequence | `for await const v of source { ... }` (from a repository example, not run here) |
| `SharedMutex<T>` | Explicit shared mutable memory, shared actors only | `SharedMutex.new(...)`, `try_lock()` (from a repository example, not run here) |
| `Shared<T>`, `SyncCell<T>` | Frozen shared value, synchronized cell | Runtime primitives, with no final source syntax |

LLVM rejected the actor, async, channel and select programs in these tests, with diagnostics saying the lowering does not exist yet. It accepts a narrower scalar actor form, `define actor C as { let total: int = 0; pub fnc on_message(int n): int { ... } }`.

**Signature mismatch:** chapter 05 proposes that `send` returns a typed admission result, but the Java type checker gives `ActorRef.send` the type `void`. This is tracked by S-07.
