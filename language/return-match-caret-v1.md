# Return-position \`match\`: \`return\` and \`^\` (v1)

**Status:** language contract. Rust/Wasm has a draft implementation in
[atto-source.rs PR #197](https://github.com/atto-lang/atto-source.rs/pull/197).
Do not treat the current unexecuted compiled-channel CI head as proof of
cross-backend runtime support.

## Decision

The following are equivalent **in function/method statement position**:

\`\`\`atto
return match result over
    on Ok(value) -> { return value; }
    on Err(error) -> { return -1; }
end
\`\`\`

\`\`\`atto
^ match result over
    on Ok(value) -> { ^ value; }
    on Err(error) -> { return -1; }
end
\`\`\`

\`^\` is a statement-level spelling of \`return\`, not a value-producing
prefix unary operator, an XOR/power operator, or a return from the
innermost match arm. A nested \`^ match\` (or \`return match\`) returns
from the same **enclosing callable**. A match arm may instead end in
an ordinary \`return\` or \`^\`, or another proven terminating
construct. Every arm must terminate and match coverage must be proven.

\`\`\`atto
pub fnc main(): int {
    val result: Result<Option<int>,IoError> = Ok(Some(41));

    ^ match result over
        on Err(error) -> { return -1; }
        on Ok(value) -> {
            return match value over
                on None -> { ^ 0; }
                on Some(n) -> { return n + 1; }
            end
        }
    end
}
\`\`\`

This compiles to the same typed control flow as replacing all
\`^ match\` with \`return match\`. \`match\` subjects and effectful
expressions are evaluated **exactly once**. Return values must match
the declared callable return type. An unguarded wildcard or exhaustive
ADT/enum alternatives are needed where static coverage is not
otherwise provable; a guarded arm alone cannot establish coverage.

## Channel/Future example

\`\`\`atto
pub susp fnc main(): int {
    val opened: Result<Channel<int>, IoError> = Channel<int>.bounded(0);

    ^ match opened over
        on Err(error) -> { return -1; }
        on Ok(channel) -> {
            val pending = nb readch channel;
            val sent = channel.send(41);

            ^ match sent over
                on Err(error) -> { return -2; }
                on Ok -> {
                    val result = await pending;

                    ^ match result over
                        on Err(error) -> { return -3; }
                        on Ok(value) -> {
                            ^ match value over
                                on Some(n) -> { return n + 1; }
                                on None -> { return 0; }
                            end
                        }
                    end
                }
            end
        }
    end
}
\`\`\`

The four \`^ match\` constructs are nested returns from \`main\`.
Every \`Err\` is handled as a distinct branch, \`None\` is not a zero
integer sentinel, and \`await\` remains a checked suspension point
requiring the \`susp\`/\`suspends\` function effect. Return markers
do not implicitly await, consume a Future twice, erase ownership,
or bypass permissions and error contracts.

## Grammar (informal)

\`\`\`ebnf
return_marker       = "return" | "^" ;
return_match_stmt   = return_marker, "match", expression, "over",
                      return_match_arm, { return_match_arm }, "end", [ terminator ] ;
return_match_arm    = "on", pattern, [ "when", boolean_expression ],
                      "->", ( terminating_block | result_expression ),
                      [ "," ] ;
terminating_block   = "{", { statement }, terminating_statement, "}" ;
terminating_statement = return_statement | return_match_stmt
                      | throw_statement | proven_terminal_control_flow ;
\`\`\`

An expression arm implicitly returns its result. A braced arm must
terminate explicitly; a nested exhaustive match counts when all its
arms terminate. An incomplete match, nonterminal arm, incorrect
payload type, wrong callable return type, forbidden \`^\` expression,
and effect/borrow violations are compile-time errors. A checker must
**still prove exhaustiveness independently** of the parser's
syntactic termination check.

For guard failure branches, a complete terminal \`^ match\` may
satisfy the mandatory early-exit requirement. For a lambda, any
nonlocal-return/closure escape semantics require their own explicit
effect and lifetime contract; the above v1 rule applies to ordinary
function and method bodies and must not invent such lambda behavior.

## Verification boundaries

The Rust/Wasm parser and checker change on
[PR #197](https://github.com/atto-lang/atto-source.rs/pull/197)
adds nested return-match acceptance and new native, compiled-channel
and browser fixtures. It is **authored and mirrored**, but a passing
hosted-runner receipt on the exact newest source head is still
required. Java, LLVM, .NET and Forge must independently pass the same
nested return and channel/Future conformance cases before parity
is claimed.
