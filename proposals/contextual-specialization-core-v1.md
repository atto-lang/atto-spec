# Contextual specialization — core feature, draft v1

Owner direction: #293. This contract is independent of allocation; allocator selection is an application. Draft declaration grammar, not a certification of any backend.

## Syntax and resolution

```atto
define class Scale as
    pub static fnc apply::(int factor)(int value) -> int {
        return factor * value;
    }
end

const x = Scale::(2);
const y = x.apply(42);
const z = Scale::(3).apply(42);
```

The expression `T::(context)` binds a statically resolved nominal owner, its generic arguments and an explicitly declared context schema. It produces a typed value, not a runtime-created type or allocated instance of T. Immediate member calls are shorthand for binding followed by invocation. Context expressions evaluate once, left to right, at binding time; ordinary arguments evaluate at call time. Context parameters are not ordinary arguments. No ambient lookup or implicit allocator substitution. Named arguments, multiple members and the exact type-level schema declaration are proposed extensions to the single-member declaration above; reconcile before admitting them.

Context binding is a distinct postfix grammar, not the existing qualification or callable body syntax. Preserve ordinary constructor calls, existing `::` forms and expression copy/update `with`. Preserve nominal visibility, arity, generic constraints, effects and static/instance separation. No dynamic reflection, rebinding of self, or invocation of undeclared members.

## Ownership

A bound value has a nominal owner plus typed captured context, with lifetime, effects and transfer properties derived from captures. Copy only when all captures permit Copy; move-only capabilities consume under ordinary move rules. A reusable loan may be used for repeated calls subject to borrow rules. Const freezes a binding, not the allocator or resource. Binding may neither manufacture nor amplify authority, extend a loan, permit actor escape, bypass quota/revocation, or turn a local resource into a Sendable value. Passing, returning, storing and capturing bound values are part of the full feature, but require actual typed representation and ownership checking. An unsupported profile rejects before emission.

## Allocation is separate

`new Foo(args) with heap` selects a typed allocator for primitive reference construction. `Foo::(heap).new(args)` invokes a declared contextual factory. `make Point(args)` constructs a value. `Foo.new(args)` / `Point.make(args)` are programmable factories; neither spelling alone fixes allocator, physical placement or pointer width. Preserve #280's current struct allocation restriction pending explicit boxing design. Heap capture requires verified resource lifetime and provenance; no fallback to a different heap.


## Context representation and explicit construction — proposed next-stage contract

The scalar profile may eliminate a bound value entirely, but the full language must represent a nominal owner, a resolved context schema and ordered typed captures as a first-class value. The representation inherits the most restrictive ownership, lifetime, transfer and effect constraints of its captured capabilities. A declaration, an ordinary static method, an allocator and a bound factory are distinct entities. Binding a context must not construct an instance, acquire storage for an instance, or implicitly create a reference. The general declaration spelling and multiple-member schema are still draft.

- Validate context shape, visibility, type and ownership before emitting executable code. Evaluate each context expression exactly once, in source order. For named contexts, source evaluation order is distinct from declaration slot order; duplicate, unknown or missing fields deny. No runtime type construction or reflection is implied.
- Preserve ordinary argument evaluation order at invocation, and reuse the already-bound captures without evaluating their source expressions again. Copying a factory is allowed only where all captured authority is independently Copy; moving or borrowing uses the usual ownership rules. A scalarized representation must be observationally equivalent to the first-class value.
- Primitive `new Foo(args) with allocator` is reference construction; `make Foo(args) with allocator` is value construction with the selected context for any required backing storage. Neither spelling intrinsically selects stack versus heap. A contextual member `Foo::(allocator).new(args)` or `.make(args)` is a declared factory and is not automatically equivalent to primitive construction. Establish its checked allocator/constructor contract explicitly.
- Proposed direct-with evaluation order: resolve type and constructor statically, evaluate ordinary operands left-to-right, evaluate the explicit allocator operand once, validate capability and reserve storage before running the constructor. For the bound-call spelling, the context is evaluated before ordinary arguments because binding is a separate expression. These two spellings are equivalent only under the relevant evaluation and effect conditions. This order is a proposal for owner review, not an already ratified grammar rule.
- On allocation failure or constructor failure, no usable object or value may be published. Roll back exactly the initialized fields/resources in reverse initialization order and release the exact reservation once; never silently switch allocators. Preserve the original failure and the language's cleanup-failure precedence. Allocation counters and quota effects cannot be optimized away unless observational equivalence is proved.
- A captured allocator handle must validate owner, region lifetime, allocator generation and revocation at use. An actor-private context cannot be sent to another actor by copying or wrapping the bound value. Suspension retains the lifetime/ownership proof, while actor retirement and hot upgrade fence stale generations. A returned or stored factory cannot outlive a borrowed capability.

Additional acceptance targets: direct-with operand ordering with side effects; positional versus named evaluation order; context value passed and returned without allocation; two contextual methods sharing one schema; whole-factory move and denied duplication; constructor rollback at each partially initialized field; quota failure without fallback; stale-generation invocation; actor-private context send denial; arena closure while a bound loan remains live; nonescaping factory elimination with identical failure and quota observations. These are NOT_EXECUTED for the general profile.

## Implementation admission

- The Rust/Wasm initial scalar slice at [atto-source.rs#750](https://github.com/atto-lang/atto-source.rs/pull/750) lowers a single source-local public static member with an int/bool context and scalar result into checked static dispatch and immutable slots. It does not implement general first-class values, multiple methods, generics or resource contexts.
- The general AST/HIR must represent BindContext, the nominal context schema, captured values and InvokeBoundStatic independently; scalar token lowering is not the normative IR.
- Backends must share resolution, evaluation order, diagnostics and ownership behavior. HDL/realtime may reject unsupported profiles explicitly; no artifact on semantic denial. No claims of parity from host parsing alone.

## Required target fixtures (all NOT_EXECUTED here)

| ID | Scenario | Target outcome |
|---|---|---|
| CTX-01 | direct call with factor 6 and value 7 | guest returns 42 |
| CTX-02 | bind mutable scalar n=3, change n to 9, call twice and add direct call | guest returns 41 |
| CTX-03 | independent bindings 2 and 3, each called with 4 | guest returns 20 |
| CTX-04 | side-effecting context expression and repeated calls | one context effect, per-call argument effects |
| CTX-05 | incompatible context type/name/arity | reject, no artifact |
| CTX-06 | incompatible ordinary argument type/arity | reject, no artifact |
| CTX-07 | private or instance member selected | reject, no artifact |
| CTX-08 | generic owner with typed context and multiple members | guest execution |
| CTX-09 | pass and return bound Copy context | preserve capture and nominal identity |
| CTX-10 | moved unique context reused or duplicated | reject, no artifact |
| CTX-11 | bound factory escapes borrowed heap or owning actor | reject, no artifact |
| CTX-12 | revoked resource, allocation failure or heap exhaustion | defined failure, no fallback |
| CTX-13 | legacy qualification, callable body and with grammar | unchanged behavior |
| CTX-14 | format and reparse direct/stored/named context forms | equivalent AST |
| CTX-15 | unsupported profile, including dynamic hardware allocation | precise rejection and no artifact |

Evidence must include exact source head/tree, actual stepful compiler and guest results, expected diagnostic/no-artifact results and profile limitations. No parser-only or zero-step run counts as guest parity.
