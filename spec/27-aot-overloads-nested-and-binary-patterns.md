# 27 — AOT Overloads, Nested Destructuring and Binary/Packet Patterns

**Status: TARGET / NOT IMPLEMENTED across all backends (2026-11-14).** This amendment defines *source semantics*, not evidence that a compiler accepts or executes these features. It preserves the existing actor, nominal type, no-reflection and strict full-AOT policies from chapters 02–05 and 24.

## 1. Overload identity and static selection

Free functions use fnc. Receiver methods use mtd with an explicitly typed self receiver at file/namespace scope; class-body methods may retain their permitted bare method form. Keep snake_case callable names. A static method, instance method, free function and class constructor inhabit distinct declaration namespaces. Visibility and imported nominal owner are part of lookup; result type, effects, guard conditions, parameter names, defaults and return type are **not** dispatch discriminators.

Resolution MUST:

1. Resolve lexical scope, visibility, nominal owner and receiver category first; never allow private/inaccessible candidates to participate.
2. Partition candidates by **source-visible value arity** (exclude implicit/explicit self). Fill omitted trailing defaulted formals using a statically validated value-binding plan; reject ambiguous overlap of reachable arities, including variadics.
3. For a same-arity family, permit only proven distinct **nominal enum declaration identities** to discriminate. All other formal positions must have identical canonical static types. Primitive-only differences, structural shape, generic-erased types, return types, receiver mutability and pointer/borrow qualifiers are not alternative overload keys. Where the compiler cannot prove the enum declaration and argument identities statically, reject before executable IR.
4. Resolve and type-check every supplied argument in source order, exactly once; then permute checked temporary values into ABI parameter order. Named labels MUST NOT resolve an otherwise ambiguous overload. Match generic instantiation, monomorphization, tree shaking, exported symbols and linker keys to the selected canonical signature.
5. Reject duplicates, unresolved types, ambiguous candidates, inaccessible signatures and illegal overload changes at declaration or call sites. A branch that silently chooses declaration order is incorrect.

~~~atto
use namespace worker_math;

fnc scale(int x): int { return x * 2; }
fnc scale(int x, int factor): int { return x * factor; }

declare class Counter;
mtd (Counter self) read(): int { return self.value; }
mtd (mut self: Counter) add(int amount): void {
    self.value = self.value + amount;
}
~~~

Two same-arity primitive alternatives (for example fnc f(int) and fnc f(string)) are invalid under the current conservative policy, even though a richer future static overload system could discriminate them. Signature/ABI keys MUST be injective across module identity, owner, callable kind, name, source arity, qualifying nominal enum identities, static type arguments and hot-load generation where applicable.

### Class constructors and actors

An ordinary class MAY declare multiple constructors. The same static overload rules apply: source-visible arity first and only admitted nominal enum distinctions at equal arity. A constructor is not a normal fnc/mtd, cannot be selected using a return type, and cannot be inherited. Duplicate constructors and overlapping optional/default/variadic arities are errors. Constructor chaining MUST target an unambiguous sibling constructor on the same allocation, preserve exactly-once field initialization and checked ownership cleanup, and reject cycles.

~~~atto
define class Point as
    int x;
    int y;

    constructor(int x) {
        self.x = x;
        self.y = 0;
    }
    constructor(int x, int y) {
        self.x = x;
        self.y = y;
    }
end

let p = new Point(2, 3);
~~~

Actors are special classes **without constructors**. Both constructor declarations in an actor body and ordinary expressions such as new Worker(...) MUST fail static admission. spawn Worker(...) is an actor-creation operation, not an invocation of a class constructor; spawn arguments, initialization and supervision have their own distinct lifecycle contract. Method overload resolution for actors does not bypass mailbox admission, sealed state, critical-read/critical-write, serial actor scheduling or concurrency safety.

## 2. Nested patterns and head/tail

Nested destructuring works in let/val bindings, match arms, fnc/mtd parameters where admitted, and receiving/message patterns. Patterns may nest tuple, array/list, enum, record, nominal and explicit structural (~) patterns. An as binding names the value matched by a structural/typed subpattern; repeated variable bindings in one pattern are rejected rather than treated as implicit equality.

~~~atto
match value over
    on {user: ~ {id: int, name: string} as person, tags: [head | tail]} -> {
        use_person(person.id, head, tail);
    }
    on _ -> {}
end

let [first, second | rest] = values;
~~~

Within a *list/sequence pattern only*, a single vertical bar separates a fixed prefix from a tail pattern: [head | tail], [a, b | rest]. The prefix has one or more element patterns; [| rest], multiple bars, non-final tails and two bindings for the same name are rejected. The tail denotes the unconsumed suffix; empty tails are permitted. This token has NO new bitwise-OR meaning. Outside pattern brackets existing boolean/condition and type-union operators retain their independent grammar.

Pattern matching is left-to-right, top-to-bottom, short-circuits on first mismatch and never executes guards or body side effects for a failed arm. No branch may mutate the input while partially matching. A refutable binding without a fallback is a checked failure (PatternMatchError, a concrete Error subtype); in actor context its unhandled failure follows actor failure/supervision semantics. A backend may reject unsafe borrowed-tail lifetimes before IR, and must never manufacture a dangling borrowed slice across await, send or actor transitions. Immutable list tails may be shared safely when the ownership proof admits it; arrays and Bytes follow their own view/copy rules.

## 3. Typed binary and packet patterns

Use **binary { ... }** and **packet { ... }**, never << >>. Both denote the same typed, sequential binary-pattern AST and static lowering; packet is a readability alias, NOT a network capability or an implicitly allocated buffer. Neither form is a normal class/record pattern. This v1 amendment specifies patterns only; constructors/encoders are separate future admissions.

~~~atto
match incoming over
    on packet {
        version: u8,
        length: u16be,
        payload: bytes[length],
        ..rest
    } as frame -> {
        process_frame(frame.payload, rest);
    }
    on _ -> {
        reject_frame();
    }
end

let binary {
    flags: bits[3],
    kind: bits[5],
    payload: bytes[4],
    ..tail
} = source;
~~~

- u8, i8, u16be, u16le, i16be, u32be, u32le, u64be (and corresponding admitted signed widths) consume their fixed bit count with explicit endianness. Unsuffixed multi-byte scalar types in a binary pattern are rejected: no host-native endian default. Fixed integer captures preserve width, sign and checked conversion; negative lengths are invalid.
- bits[n] consumes n bits in network MSB-first order, with n a bounded nonnegative compile-time constant. bytes[n] consumes exactly n bytes, where n is a compile-time constant or an earlier, statically integer-typed bound field. References to later fields, circular lengths, unproven signed/overflowing arithmetic, or effects are rejected.
- Every offset/length computation uses checked non-wrapping arithmetic and bounds checks before reading or forming borrowed views. A failed size or value test is a normal nonmatch in a match arm, never an out-of-bounds read, partial write, arbitrary allocation, or acceptance of a truncated packet.
- ..rest is optional and MUST be the final segment. It binds the exact remaining suffix with preserved ownership/lifetime. Without ..rest, a pattern requires exact full input consumption. An ignored field uses _ only in a position whose width is known.
- A pattern beginning with a non-byte-aligned segment may use additional bits fields; a bytes segment or ..rest requires a byte-aligned cursor. No silent rounding/padding. Bit-level tails require an explicitly typed bits rest pattern in a later separately versioned design.
- Field identifiers may be used as captured names in the arm, and an optional outer as name binds the successfully decoded aggregate view. Field declarations are ordered captures, not source-record member lookups. The pattern parser must not confuse { ... } here with class bodies, block statements or structural patterns.
- Matching immutable Bytes may borrow a bounded subview only when a proven lifetime prevents escaping the owning storage. Cross-actor transport requires admitted take/copy/share rules; no raw pointers, hidden heap allocations, dynamic compilation or host-language reflection.

For example, bytes 01 00 03 61 62 63 ff match packet {version:u8,length:u16be,payload:bytes[length],..rest} with version=1, length=3, payload=61 62 63 and rest=ff. The same input **does not** match an exact pattern without ..rest.

## 4. Strict-AOT implementation and conformance requirements

Every backend MUST build a finite, immutable compile-time dispatch table and a bounded binary-pattern decision plan from resolved types. Enum dispatch must use canonical nominal declaration identity; overload plans and parsed layouts become typed HIR/MIR then ordinary AOT control flow, constant-sized field loads, checked offset calculations and owned/borrowed view operations. No runtime method discovery, reflection-driven dispatch, interpreter fallback, JIT, runtime codegen, magic structural hashing or platform-native endian inference.

The same canonical .atto fixtures must exercise parse/formatter round trips; valid and invalid same-arity overloads; free/mtd/static/constructor namespaces; actor constructor rejection; constructor chaining/cycles; nested success and failure; head/tail with empty suffix; binary BE/LE, bits, truncation, rest, zero and max lengths, overflow, borrowing, concurrent actor dispatch and ownership rejection. Verify generated AOT artifacts, accessible symbol/dispatch manifests, sanitizer results for native builds and exact-commit stepful guest execution, not just a source-free reference-model test.

**Current status:** This chapter and the attached contract corpus are source-level targets only. The real Java and LLVM compilers contain partially implemented overload/constructor paths, but this change does not certify them. Forge, Wasm and .NET likewise require independent compiler and execution evidence.
