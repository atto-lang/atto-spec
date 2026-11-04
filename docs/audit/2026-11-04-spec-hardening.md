# Specification audit and hardening — 2026-11-04

**Scope:** every Markdown file on `main` at `9e210e0` (README, CONTRIBUTING, chapters 00–15), plus the open draft PRs #3 (nested pipelines) and #7 (grammar, primitives, runtime and status chapters) for overlap. **Method:** a manual read of every chapter for contradictions between chapters, contradictions between rules and examples, ambiguous grammar, undefined terms, and safety or isolation gaps. Every external link was resolved through the GitHub API, and the source-free model suites were run locally. Mechanical findings are now enforced by [`tools/spec-lint`](../../tools/spec-lint).

**What "fixed" means here:** the spec text now states one precise rule, marked TARGET where it is a new design commitment. Every such commitment also has a row in [open questions](../../spec/12-open-questions.md) (S-41 to S-57), so that the compiler owners can overturn it. The IDs start at S-41 because open PR #7 adds its own rows in the S-2x range. Nothing in this audit claims backend execution.

## Findings

Severity: **High** means two conforming implementations could accept the same program with different meanings, or an isolation/safety guarantee had a hole. **Medium** means a required rule was missing or untestable. **Low** means an editorial or consistency issue.

| ID | Sev. | Where | Finding | Resolution |
| --- | --- | --- | --- | --- |
| A-01 | High | 13 example, 14 example | Examples used `restart=#permanent` and `Transformer(batch_size=256)`, but chapter 03 says value arguments are `label: value` and `=` in a call is not a named argument | Examples corrected; spec-lint rule `example-named-arg` |
| A-02 | High | 13 | `on_panic(f: Failure)` was the only `name: Type` parameter; every other parameter in the spec (and in PR #7's grammar) is type-first | Corrected to `Failure f`; type-first parameters stated in 01; spec-lint rule `example-param-order`. Local-binding order is genuinely split (S-46) and left open |
| A-03 | High | 02 | Symbol literal `#with spaces` cannot be lexed: `if s == #ready then` would be ambiguous | Unquoted symbols are identifier-shaped; delimited `#"..."` form PROPOSED (S-49), matching PR #7 |
| A-04 | High | 05 | `read_count()` on an actor read like a method callable from outside, which would run guest code outside mailbox serialization | Actor methods run only inside the actor's own turns; `ActorRef` exposes no synchronous calls; S-57 |
| A-05 | High | 03, 05, 14, PR #3 | `spawn A()` publishes a live actor everywhere except inside `pipe`, where chapter 14 says it is staged; `Actor.pipe(spawn A(), ...)` is rejected for the same operand. PR #3 says infix operands spawn immediately | The infix chain is one grammar production whose operands are descriptors; non-`spawn` operands and `\|>` mixing rejected; conflict with PR #3 logged as S-54 |
| A-06 | High | 09 | After #6, same-tier import collisions are diagnosed, but a project-root file still silently overrides one in `ATTOLANG_PATH`, so adding a file can replace a dependency | Cross-tier matches are ambiguous unless pinned in the manifest; S-53 |
| A-07 | High | 13 | A failed actor publishes `Failure` only after cleanup completes, so a hung `tear_down` hid the failure from its supervisor forever | Cleanup barrier is bounded; publish with `cleanup_incomplete` and quarantine resources |
| A-08 | Medium | 02 | The "eligible callable" for postfix `?` was undefined: lambda/callback boundary, `Option` in a `Result` function, error-type conversion, `defer` bodies | Innermost callable/lambda/Task body; same carrier and same `E`; no implicit conversion; rejected in `defer`/`finally`/top level |
| A-09 | Medium | 01, 03 | `?` has four meanings and `:` doubles as a label, so `f(flag: c ? a : b)` was ambiguous | Bounded-lookahead classification; parenthesized ternary in argument lists; S-45 |
| A-10 | Medium | 01, PR #7 | "The parser must not insert semicolons in a way that changes meaning" is not testable. Every example omits semicolons, while PR #7 records that compilers require them except before `}`, `fi` and `end` | Not decided here: chapter 01 requires a testable rule and rejection of unclassifiable line breaks; S-42 |
| A-11 | Medium | 01, 14 | Chapter 01 calls `pipe` a reserved keyword, but `Actor.pipe` uses it as a member name while chapter 14 says it is "not another keyword" | Reserved words allowed only directly after `.`; S-43 |
| A-12 | Medium | 01 | `const` means "compile-time constant" in statements but an ordinary runtime binding in `if e as const x` | Contextual meaning stated; S-44 |
| A-13 | Medium | 01, 02, 06 | `as` opens declarations, binds in conditions, binds in select arms and casts, with no rule for choosing | Disambiguation table keyed on the following token |
| A-14 | Medium | 02, 03 | "Arity-first" overload resolution was undefined once omittable, rest and trailing-closure formals exist | Arity is a range; three-step resolution; exactly one candidate or error |
| A-15 | Medium | 04, 06 | Awaiting the same `Task` twice, or a `Future` of a move-only `T` from two places, was unspecified despite "exactly-once" | `await` consumes the Task handle; move-only Future values go to one awaiter unless explicitly shared |
| A-16 | Medium | 06 | `do nb { }` kept a "supervision obligation" without saying who receives its failure | Parent scope waits; unhandled failure becomes the parent scope's failure; S-51 |
| A-17 | Medium | 07 | "throw escalates out of its lexical scope" contradicted `trap f()` catching a throw from a callee | `throw` propagates through callers; escalation only at turn/Task/root boundaries (S-05 still open) |
| A-18 | Medium | 07 | Precedence (cancellation over panic) could erase a panic raised by cleanup during cancellation | Precedence picks the primary outcome only; that panic still reaches CONTROL |
| A-19 | Medium | 03 | `pure` meant only "no externally observable mutation", which still allowed reading mutable state, I/O and suspension, so purity-based optimization was unsound | Concrete list of forbidden and allowed effects; panic preserved |
| A-20 | Medium | 03, 14 | When an argument expression fails part-way, the fate of already-evaluated temporaries and moved places was unspecified | Reverse-order drop; moved places stay moved; same rule for factory constructor arguments |
| A-21 | Medium | 14 | Dropping an `ActorGraph` without `stop()` was undefined: actors could be leaked or detached | Proposed: drop requests graceful stop; must-use diagnostic; S-55 |
| A-22 | Medium | 09 | Import cycles allowed, but reading a not-yet-initialized peer binding was unspecified | Defined initialization error; never a default value |
| A-23 | Low | 14 | One example declared `val graph_result` three times in the same scope; no redeclaration rule existed | Distinct names; same-scope redeclaration is an error; shadowing S-48; spec-lint rule `example-redeclare` |
| A-24 | Low | 03 | `val graph = ... pipe ...` named an admission `Result` as a graph, and the summary put `Actor.connect` under the `ActorGraph` result | Renamed; `connect` result stated; chapter 14 governs |
| A-25 | Low | 05, 11, 13, 14 | Label `NOT_VERIFIED` used but not defined in the status vocabulary | Added to chapter 00 |
| A-26 | Low | README, 00 | "Ordinary normative RFC meaning" had no citation; lowercase "must" outnumbers MUST about 4 to 1 | BCP 14 cited; lowercase "must" in rule sentences treated as normative until editorial pass S-41 |
| A-27 | Low | 01, 02, 03, 07, 14 | Terms used but defined nowhere: `transform-pipe`, `unwrap_safe`, `omit`, value-parameter defaults, `recover`, pipeline role declarations | Each marked PROPOSED with "reject until specified"; S-50, S-52 |
| A-28 | Low | 01, 05 | "Constructors are explicit" versus examples `Point(...)` and `Increment(1)` with no declared constructor | Reject unmatched construction until S-47 decides |
| A-29 | Low | 06 | `_async` suffix rules stated twice, loosely enough to allow `read` and `read_async` to be different operations | Canonical names unsuffixed; `_async` only as an identical alias |
| A-30 | Low | 01 | Comparison spelled "`eq` or `==` where admitted" | S-56 (PR #7 proposes `eq` canonical, `==` alias) |
| A-31 | Low | 02 | `Container<T=string, U=T>` explanation mixed use-site and declaration scoping | Use-site names resolve in the surrounding scope; only declaration defaults see the declaring formals |
| A-32 | Low | 00 | No rule for which source wins when an example and a rule disagree | Prose over examples, specific over general, otherwise reject and log |
| A-33 | Low | README | Chapter 15 (`guard`, merged in #8) was missing from the README chapter table | Row added; spec-lint rule `index` |
| A-34 | Process | CONTRIBUTING | Required "local Markdown link/fence check" did not exist | `tools/spec-lint` (Rust, no dependencies) plus workflow |
| A-35 | Process | CI | Every Actions run in this repository fails with **zero executed steps**: the account's Actions billing has failed ("recent account payments have failed or your spending limit needs to be increased") | Not fixable in-repo. These are admission failures, not test results; checks were run locally |

## Checked and left unchanged

- **Chapters 08, 10, 11 and 15** had no contradictions with the rest of the spec. All external GitHub links resolve. The `flags-2-env` link points at a GitHub organization, not a specific repository; consider linking the parser repository directly.
- Chapters 08 and 11 include CI/source-export governance (private-source mirrors, Actions minutes). That is repository process rather than language semantics; consider moving it to a governance document, but that is outside this audit.

## Interaction with open PRs

- **PR #7** adds chapters 16–19 and its own S-2x rows. This change uses S-41 onward so the IDs cannot collide. Where PR #7 records today's compiler behaviour (semicolons, `val x: int` locals, `eq`), this audit logs the disagreement instead of overriding it (S-42, S-46, S-56).
- **PR #3** adds `spec/15-nested-actor-pipelines.md`, but chapter 15 is now `15-guard.md`. Once rebased it needs a new number; spec-lint reports the duplicate. Its immediate-spawn reading of infix `pipe` is S-54.

## Follow-ups for spec owners

1. Decide S-41 to S-57. Each row names the proposed rule and the evidence needed.
2. Run the S-41 editorial pass (capitalize the normative lowercase "must").
3. Turn the TARGET rules added here into positive/negative `.atto` fixtures in `oreslang-platform-conformance`. Each rejection rule maps directly to a negative test.
4. Restore Actions billing so that the model suites and spec-lint run on GitHub.
