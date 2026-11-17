# Equality operators: value versus identity (draft)

> Status: proposal for review. This document does not claim compiler implementation or backend parity.

## Decision

| Operator | Primitive operands | Reference operands |
| --- | --- | --- |
| `eq` | Compare values | Value equality via the applicable `equals()` contract |
| `neq` | Negation of `eq` | Negation of `eq` |
| `==` | **Compile-time error** | Compare object identity |
| `!=` | **Compile-time error** | Compare object identity inequality |

`==` means stable *object identity*, not physical memory address. Moving objects, arenas, and handles must preserve identity. Pointer comparison requires a separately specified pointer/provenance contract.

## Examples

```javascript
val int a = 10;
val int b = 20;
a eq b;    // false
a neq b;   // true
a == b;    // compile-time error: primitives have no reference identity
a != b;    // compile-time error

val User x = new User("Alex");
val User y = new User("Alex");
x == y;    // false: distinct instances
x == x;    // true: same live instance
// val User z = x; would MOVE ownership; using x after that is invalid.
x eq y;    // invokes value equality; true only if User.equals defines it
x neq y;   // logical negation of x eq y
```

## Compiler and runtime requirements

1. Parser: retain four distinct equality operator nodes/tokens; no silent rewrite from `==` to `eq`.
2. Type checker: reject `==` and `!=` for primitive values and non-reference value aggregates; require compatible reference identity domains.
3. `eq` on primitives: typed, deterministic value comparison; no user method dispatch.
4. `eq` on objects: resolve the applicable `equals()` method, checking visibility, return type `bool`, and non-suspending behavior. Specify null handling before implementation.
5. `neq` must be precisely the boolean negation of `eq`; `!=` the negation of `==`.
6. Formatter must preserve the operator choice. Diagnostics should suggest `eq` for primitive `==` and `neq` for primitive `!=`.
7. Compile-time and AOT implementations must agree across targets; do not require reflection or JIT.

## Review comments / questions

- **Numeric cross-type comparisons:** Should `1 eq 1.0` be accepted with exact numeric equivalence, or require explicit conversion? Avoid lossy implicit coercion.
- **Floating point:** Specify NaN, signed zero, and IEEE-754 rules for `eq` and `neq`.
- **Absence and Option:** AttoLang rejects the `null` literal. Define future `Option<Class>` comparison separately, with an explicit presence/tag test and no implicit null-like reference dispatch; `Option<Class>` is not yet executable in the Rust/browser subset.
- **Equality method contract:** Decide default object `equals()`, inheritance/override behavior, symmetry, hash consistency, and whether equality may throw.
- **Values versus references:** Define behavior for enums, strings, tuples, records, structs, symbols, and boxed primitives. A boxed primitive reference may have identity even though an unboxed primitive does not.
- **Pointers:** Explicitly distinguish raw address equality, provenance, and object identity; never assume `==` compares addresses.
- **Compatibility:** Audit existing `==` and `!=` uses; migration requires diagnostics and tests rather than a blind replacement.

## Required tests before ready for review

- Positive primitive `eq`/`neq` cases for integer, bool, float, char, including boundary values.
- Negative compile tests for primitive `==`/`!=`.
- Same-reference and distinct-reference identity tests; distinct objects with equal values.
- User-defined `equals()` dispatch, negation, missing/invalid method diagnostics.
- Null, NaN, signed zero, mixed numerics, symbols, value aggregates after semantic decisions.
- Parser/formatter round trips and cross-backend compile/run fixtures, with exact-head CI evidence.

**No tests are claimed to have run in this specification-only PR.**

## Hardening notes (review candidate, not ratified)

### Operator typing and evaluation

- Evaluate the left operand once, then the right operand once, left-to-right; `neq` and `!=` must not evaluate either operand twice.
- `eq`/`neq` produce `bool`. Do not confuse `Option<Class>` with a nullable raw pointer. `null` is not an AttoLang value (`E_NULL`); the Rust/browser compiler currently rejects `Option<Class>` (`E_UNSUPPORTED_TYPE`). Future optional equality must be specified as tagged-value semantics, without dereferencing absent values.
- For references, `==`/`!=` must not invoke user code or allocate. Equality must remain stable across relocation and representation changes.
- Never implement `neq` by invoking a separate user-defined `not_equals()`; it is the logical complement of `eq`.
- A user-defined `equals()` must be callable without suspension and return exactly `bool`; reject ambiguous overloads. Error effects must be declared and propagated according to the language's effect rules rather than silently swallowed.
- Primitive numeric comparison must not use an implicit lossy cast. **Proposed default:** reject mixed primitive numeric types unless a common exact comparison is explicitly specified by the language; explicit conversion is always available.
- **Proposed IEEE floating-point rule:** NaN `eq` anything is false (including itself), NaN `neq` anything is true, and positive zero `eq` negative zero is true. Identity operators remain invalid on primitive floats.
- Distinguish reference-like types from nominal value classes and other aggregates; coordinate with the identity-free value-class specification before allowing identity comparisons.

### Review test matrix

| Fixture | Expected |
| --- | --- |
| `10 eq 10`, `10 neq 20` | true, true |
| `10 == 10`, `10 != 20` | compile-time error |
| `true eq true`, `'a' neq 'b'` | true, true |
| `1 eq 1.0` | compile-time error under proposed no-implicit-mixed-numeric rule |
| `nan eq nan`, `nan neq nan` | false, true under proposed IEEE rule |
| `+0.0 eq -0.0` | true |
| `ref_a == alias_a` | true |
| `ref_a == separately_allocated_equal_value` | false |
| `ref_a eq separately_allocated_equal_value` | calls resolved `equals()` |
| `null eq null` | compile-time `E_NULL` (no null literal in AttoLang) |
| `Option<MyClass>` in Rust/browser | `E_UNSUPPORTED_TYPE` until checked object-option ABI exists |
| `lhs() neq rhs()` | each operand evaluated exactly once, in order |
| `value_struct_a == value_struct_b` | compile-time error when no reference identity |
| `x eq y` formatter round trip | same operator and meaning |

### CI admission protocol

1. Record exact source commit SHA and Git tree SHA before running tests.
2. First attempt source-org Actions and inspect actual job scheduling/completion; a queued or skipped job is not a pass.
3. If Actions budget blocks execution, use a permitted private alternate org/repo with available Actions minutes. Mirror the **exact source Git tree** into a temporary test branch, verifying each blob SHA, file mode, and tree SHA. Never depend on a cross-org checkout token or copy secrets.
4. Run parser, semantic, formatter, negative compilation, AOT runtime, and cross-backend conformance checks from that mirror. Record workflow run URL, SHA, test totals, failures, and any unavailable backend.
5. Do not mark this draft ready until semantic questions are resolved and real CI evidence exists. Clean up temporary mirror branches after evidence is retained.

**Verification status:** This document is a test plan, not an executed CI report.

## Bounded checked class-equality profile (Rust/browser implementation slice)

The initial full-AOT browser profile admits **only same-concrete-class**
`eq` and `neq` calls where the class has a checked instance
method `pub equals(Class other): bool`, either declared directly or
safely specialized from a source-local, fieldless ancestor. No JIT,
reflection, runtime virtual dispatch, or `Object.equals` fallback is claimed.

```atto
define class Point as
    pub mut int n = 0;
    constructor(int n) { self.n = n; }
    pub equals(Point other): bool { return self.n eq other.n; }
end
pub fnc main(): int {
    val a = new Point(7);
    val b = new Point(7);
    if a eq b, a != b then return 42; fi
    return 0;
}
```

- The compiler resolves `eq` to a concrete method index in the static
  class method table and emits one native/Wasm call with receiver and argument
  in source order. `neq` emits exactly that call plus one boolean negation.
- Neither operand is implicitly moved: the method's `other` parameter is
  a borrowed, non-owning reference for the duration of the call. A method
  attempting to `take!`, transfer, or forward `other` as an owned handle
  is rejected (not silently allowed).
- A declared `equals` with wrong arity, return type, visibility, static
  modifier, mutable argument, or non-self class argument must fail closed as
  `E_EQUALS_SIGNATURE`, even if that declaration is never called.
- When no checked `equals` is available, `eq`/`neq` on class references
  emit `E_EQUALS` and **no guest artifact**. In particular, this profile
  does not use reference identity as a default value-equality method.
- The parser currently rejects suspending instance methods. A future
  suspension-capable backend MUST reject an effectful/suspending `equals`
  unless the equality effect contract is revised explicitly.
- The profile is intentionally static, same-class only; *dynamic* inheritance,
  base-typed upcasts, virtual dispatch, `Option<Class>` object absence,
  cross-actor transfers, and other backends remain unresolved. Source-local
  method copying must not be described as runtime subtype dispatch.

**Evidence gate:** Before claiming this implementation as tested, record the
exact Rust/browser source Git commit and Git tree alongside an executed
compiler+guest run and the negative compile diagnostics. Do not treat this
normative design description as evidence by itself.

### Identity checks inside instance methods

Inside a class instance method, `self == other`, `self != other`, and
`self == self` may project `self` to a **read-only, non-owning**
reference identity operand. The compiler MUST reject using that projection
as a general value or moving, returning, or sharing `self` as an owned
alias. Static functions and actor `self` do not inherit this class
exception.

```atto
define class Point as
    pub final int n: 7;
    pub equals(Point other): bool {
        if self == other then return true; fi
        if self != other then return self.n eq other.n; fi
        return false;
    }
end
```

This `self` identity check is not a recursive call to `equals()`. It
compares stable object handles directly. Primitive or mismatched-class
operands still trigger `E_IDENTITY_TYPE`.

The Rust/browser compiler implements this bounded same-class profile; it
does not imply general self-as-value semantics, virtual inheritance,
dynamic dispatch, actor capability identity, or default `Object.equals()`.

## Closed-world inherited equality specialization (proposed bounded AOT profile)

When nominal lowering already admits a source-local class inheritance graph,
a **stateless, constructor-free ancestor** may provide
`pub equals(Ancestor other): bool`. For each concrete descendant, the
checked lowerer can clone that method and specialize the single parameter
from `Ancestor` to the concrete class before normal parsing, type checking,
borrow enforcement and AOT emission. This preserves the same-class operator
contract without inventing implicit upcasts.

```atto
define class Base as
    pub equals(Base other): bool { return self == other; }
end
define class Derived extends Base as end
pub fnc main(): int {
    val a = new Derived();
    val b = new Derived();
    if a eq a, a neq b then return 49; fi
    return 0;
}
```

An explicit `override equals(Ancestor other): bool` must match the inherited
source signature before specialization. Mismatched overrides and conflicting
multiple-inheritance origins fail closed. Inherited fields/constructors and
unverified changes in object layout remain prohibited. The method is still
statically selected using the *concrete* class; a `Base`-typed reference to a
`Derived` object, runtime vtables, and polymorphic method dispatch are **not
implemented by this lowering**.

No automatic value-equality default is introduced: absent `equals` is
`E_EQUALS`. Inherited signatures that cannot be proven same-class after
specialization must fail as `E_EQUALS_INHERITANCE`. IEEE NaN value equality
is false and `neq` its logical inverse; positive and negative infinity
follow normal IEEE `float` semantics. A separately defined hashing contract
must be adopted before promising hash-key behavior for user-defined equality.

**Verification boundary:** This is a bounded static source transformation.
Any full-inheritance or nullable-object work needs separate checked runtime
metadata, a new conformance phase, and exact-head AOT evidence.
