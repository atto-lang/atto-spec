# 15 — Dual-form `guard` and flow narrowing

**Status: TARGET contract.** The scalar boolean subset is being introduced in
Java and LLVM frontends independently. Optional payload narrowing is **not**
certified on any backend by this chapter; it requires type/ownership proof
before executable admission.

## Motivation and syntax

AttoLang supports **two equivalent spellings** for an early-exit guard.
The original brace form remains accepted for source compatibility:

```atto
fnc optional_port(bool present): Option<int> {
  guard present {
    return None;
  }
  return Some(8080);
}
```

The keyword-delimited form places the same failure statements between
`else` and `end`:

```atto
fnc optional_port(bool present): Option<int> {
  guard present else
    return None;
  end
  return Some(8080);
}
```

The same two forms admit explicit void early returns in an unbraced
`-> void ... end` callable body, exactly as follows:

```atto
fnc process_explicit() -> void
    guard false else ^ void end
end

fnc process_braced() -> void
    guard false { ^ void }
end
```

Both are semantically identical to `guard false { return; }`, and
`^ void` is a contextual **no-value return marker**, not a value expression.
For the keyword guard, the first `end` closes the guard's failure branch
and the second `end` closes the function. For the braced guard, `}`
closes the guard and the lone `end` closes the function. Neither spelling
implicitly returns from an enclosing lambda or actor instead of the
nearest lexical callable. `^ void` in a non-void callable is rejected.

In **both** forms, all guard tests passing continues after the guard;
a failed test executes the failure statements, which MUST explicitly
return from the enclosing function on every path. This is a statically
enforced requirement even when the predicate is a constant `true`. The `else` here introduces the *failure* block;
it is not an optional success branch. This is distinct from the
`if ... then ... else ... fi` construct.

Grammar target:

```ebnf
guard_statement = "guard" guard_test ("," guard_test)* guard_failure ;
guard_test      = boolean_expression | option_presence_test ;
option_presence_test = identifier "is" "Some" ;
guard_failure   = "{" statement* returning_statement "}"
                | "else" statement* returning_statement "end" ;
returning_statement = return_statement | exhaustive_returning_conditional ;
```

The `{` or `else` delimiter begins the failure block only immediately
after the final guard test; a brace must not be mistaken for a record
literal or closure. Commas are top-level, left-associative guard-test
separators, not tuple construction, value assignment or generic comma
expressions. Parenthesized calls with commas remain one test.
The parser must track nested expression delimiters and nested blocks
rather than detect keywords with textual substitution.

With the brace form, an outer keyword-delimited `if` can still own
its following `else` or `fi`:

```atto
do if ready then
  guard x > 0 { return 1; }
else
  return 2;
fi
return 42;
```

In the keyword form, `guard x > 0 else ... end` consumes its own
`else` and `end`; a subsequent outer `else` remains the outer
`if` branch. Mixed syntax such as `guard x { return; } else ... end`
is invalid, and `guard` never owns `fi` or `then`.
No trailing semicolon is required after the failure block.

Tests are evaluated **once, from left to right, with short-circuit
semantics**. Only when **all** tests succeed does execution continue
after the guard. Any test failure executes the single failure block.
Equivalently, a purely boolean guard lowers to a negated `if`
containing the failure block; the compiler may use its normal
conditional and cleanup lowering. Both surface spellings MUST produce
identical typing, effect, ownership, CFG and cleanup behavior. The
formatter preserves the author's brace-versus-keyword block style,
including on round-trips, unless explicitly requested otherwise.

## Mandatory termination

Every reachable path through the failure block MUST execute an explicit
`return` or the equivalent explicit lexical return marker `^` that returns
from the **enclosing function**. A block that can fall through is a compile
error. `throw`, `raise`, `panic`, `break`, and `continue` are **not substitutes**
for the required return, even if they would otherwise terminate a control-flow
path; `break` and `continue` inside a guard never count as function returns.
The return must match the enclosing function's declared return type; a `void`
function uses `return;`, `^;`, `^ void` or `return void;` as equivalent
no-value returns. The `void` token is not a runtime value. A nested `if`
is valid only if all reachable arms explicitly return; similarly, a nested
`match` may be accepted only if exhaustiveness and return on every arm are
proved. Calling a function with unknown effects, spawning work, `await`,
`defer`, or `yield` does not prove a return. Unreachable code remains subject
to the backend's dead-code policy.

```atto
guard ready { return; }                  // valid in a void callable
guard ready else return; end              // same semantics; valid
guard x > 0 { log("bad"); }               // reject: may fall through
guard x > 0 else log("bad"); end           // reject: may fall through
guard x > 0 else { return; }              // reject: mixed delimiters
guard x > 0 { return; } else return; end   // reject: mixed delimiters
guard x > 0 else return; fi               // reject: guard closes with end
guard x > 0 { break; }                   // reject: loop break is not return
guard x > 0 else continue; end          // reject: loop continue is not return
guard x > 0 { throw! Error("bad"); }  // reject: throw is not return
```

An implementation may initially support **only a stricter, statically
provable subset** (such as a direct `return` failure block), but MUST
not silently execute unsupported forms as if they were equivalent. An
exceptional exit does not satisfy a mandatory-return guard and must not be
promoted into one by lowering.

## Optional presence without `name = name`

AttoLang uses `let` for **mutable** bindings; it MUST NOT copy Swift's
`guard let username = username else { ... }` spelling or reinterpret
`let` as an immutable optional binding.

The intended concise form is:

```atto
fnc authorize(Option<string> username, Option<string> password)
    -> Result<string, AuthError> {
  guard username is Some,
        password is Some,
        !username.isEmpty,
        password.count >= 8 {
    return Err(AuthError.InvalidCredentials);
  }
  return Ok(username);
}
```

The `is Some` test is an explicit **sum-variant pattern test**, not a
truthiness coercion, string comparison, a nominal class type test, or
assignment. It establishes a same-spelled, read-only,
**flow-scoped payload view** of type `T` on the successful continuation.
No `username = username` or implicit `Option<T>` conversion is
inserted. The view must not outlive, move from, or bypass the ownership
of its `Option<T>` owner; for a move-only payload, explicit
ownership-aware extraction remains required. The compiler must reject
narrowing where alias mutation, suspension, a captured mutable
reference, actor state changes or other effects can invalidate its
proof. Nested `Option<Option<T>>` tests unwrap one layer per explicit
`is Some` proof, never flatten automatically.

`is None` and destructuring aliases are **not** authorized by this v1
shorthand. A future explicit alias form can be specified separately
without assigning a special meaning to ordinary `let`.

A failed early test must never evaluate later checks, including
property accesses on unproven optional payloads. Duplicate tests,
unknown names, invalid option types and unsafe ownership projections
must produce diagnostics rather than runtime panics.

## Backends, effects and exact evidence

- Java: boolean guards can lower through a checked inverted `IfStmt`;
  source `throw` does not discharge the guard return obligation; optional
  narrowing remains closed until independently enabled by effect/type/ownership checking.
- LLVM: initial source lowering admits scalar-only guard failures
  ending in `return`, including earlier side-effecting statements and
  nested exhaustive conditionals with all paths explicitly returning. Other
  control transfers and Option payload narrowing remain
  unimplemented. This is **authored**, not compiler-executed proof.
- Wasm, .NET and Forge: fail closed until matching implementation and
  executed backend receipts exist.
- The new `else ... end` surface form is TARGET only until every
  relevant frontend/parser, formatter and runtime path has separate
  executed conformance receipts; existing guard-v1 fixtures and their
  pinned Git blob IDs MUST remain unchanged. Adding this spelling
  requires additive fixtures and versioned contract updates. The historical
  v1 model and tests remain unchanged; they do not define v2 admission.

All backends must check strict `bool` conditions, one-time evaluation,
short circuit, nested/void function returns, invalid loop exits and throw-only branches, malformed syntax, guard scope
and cleanup ordering. Exact source SHA, compiled guest execution
and nonempty CI steps are required for parity claims. Source-free
reference tests are useful but are **not** backend conformance.

## Guard v2 reference model
`node tests/guard-v2-reference.mjs` checks explicit-return paths, invalid exceptional/loop exits and once-only short-circuit evaluation for both spellings. It is an abstract CFG oracle; guest admission and exact formatter tests remain NOT_EXECUTED.
