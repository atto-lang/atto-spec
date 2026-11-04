# 20 — Else-free `guard` and flow narrowing

**Status: TARGET contract.** The scalar boolean subset is being introduced in
Java and LLVM frontends independently. Optional payload narrowing is **not**
certified on any backend by this chapter; it requires type/ownership proof
before executable admission.

## Motivation and syntax

The canonical form has **no `else`**, `then`, `fi` or mandatory
trailing semicolon:

```atto
fnc positive(int x) -> int {
  guard x > 0 {
    return 0;
  }
  return x;
}
```

Grammar target:

```ebnf
guard_statement  = "guard" guard_test ("," guard_test)* failure_block ;
guard_test       = boolean_expression | option_presence_test ;
option_presence_test = identifier "is" "Some" ;
failure_block    = "{" statement* terminal_statement "}" ;
```

The `{` starting the failure block must be unambiguous at the end of
the last guard test; source parsers must not interpret it as a record
literal or closure. Commas are top-level, left-associative guard-test
separators, not tuple construction, value assignment or a generic
comma expression. Parenthesized calls with commas remain one test.

When a guard is the last statement inside a keyword-delimited outer
`if ... then ... else ... fi`, the enclosing `else` or `fi` belongs
to the **outer if**, not to the guard. The parser must not reject a legal
outer delimiter merely because it follows a completed guard block:

```atto
if ready then
  guard x > 0 { return 1; }
else
  return 2;
fi
return 42;
```

A standalone postfix `guard x { return; } else { ... }` remains
invalid; `guard` never owns `else` or `fi`.

The tests are evaluated **once, from left to right, with short-circuit
semantics**. Only when **all** tests succeed does execution continue
after `guard`. Any test failure executes the single failure block.
Equivalently, a purely boolean guard lowers to a negated `if`
containing the failure block; the compiler may use its normal
conditional and cleanup lowering.

## Mandatory termination

Every reachable path through the failure block MUST exit the enclosing
continuation; a block that may fall through is a compile error. Supported
exits depend on their enclosing context: `return`, a well-typed
`throw` or other checked exceptional exit, and `break` or
`continue` **only when they target an enclosing loop outside the guard**.
A nested `if` is valid only when all reachable arms terminate; a
nonexhaustive `match` cannot prove termination. Merely calling a
function with unknown effects, spawning work, `await`, `defer`, or
`yield` does not prove exit. Dead code after a terminal exit remains
subject to the backend's dead-code policy.

```atto
guard ready { return; }                  // valid in a void callable
guard x > 0 { log("bad"); }               // reject: may fall through
guard x > 0 else { return; }              // reject: else is forbidden
guard x > 0 { return; } fi                // reject: fi is forbidden
```

An implementation may initially support **only a stricter, statically
provable subset** (such as a direct `return` failure block), but MUST
not silently execute unsupported forms as if they were equivalent.

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
  source `throw` and optional narrowing remain closed until independently
  enabled by effect/type/ownership checking.
- LLVM: initial source lowering admits scalar-only guard failures
  ending in `return`, including earlier side-effecting statements and
  nested exhaustive conditionals with all paths returning. Other
  terminating control transfers and Option payload narrowing remain
  unimplemented. This is **authored**, not compiler-executed proof.
- Wasm, .NET and Forge: fail closed until matching implementation and
  executed backend receipts exist.

All backends must check strict `bool` conditions, one-time evaluation,
short circuit, nested/void/loop exits, malformed syntax, guard scope
and cleanup ordering. Exact source SHA, compiled guest execution
and nonempty CI steps are required for parity claims. Source-free
reference tests are useful but are **not** backend conformance.
