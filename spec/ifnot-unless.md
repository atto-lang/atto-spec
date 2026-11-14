# Negated conditionals: `ifnot` and `unless`

**Status:** normative target contract; compiler implementations pending exact-head CI verification. The populated Java and LLVM implementations are under review in `ores-truffle-oreslang/oreslang-source.java#3086` and `ores-truffle-oreslang/oreslang-source.llvm#1791`.

## Grammar

```ebnf
if_statement = ("if" | "ifnot" | "unless"), boolean_condition,
               ("then", statements | "{", statements, ["}"]),
               { "elif", boolean_condition, "then", statements },
               ["else", statements], "fi";
```

Existing braced and semicolon compatibility rules follow `if`. This fragment is illustrative; exact condition-binding and braced-delimiter grammar is defined by the primary grammar. `ifnot` and `unless` are reserved, case-sensitive, single tokens with identifier boundaries; there is no postfix `unless` form.

## Semantics

Both spellings mean `if !(condition)`. The condition must have static type `bool`; numbers, strings, `Option` and `Result` are not coerced to booleans. Evaluate the original condition exactly once, and execute the first branch if and only if it yields `false`. `elif` clauses retain their ordinary *positive* conditions and evaluate in source order only if earlier branches were skipped. `else` runs only when no branch matches. `fi` remains mandatory, including for braced forms. The negation must never change side-effect order, error propagation or actor scheduling.

```atto
ifnot ready then
  start_worker();
else
  notify_ready();
fi

unless should_stop then
  process_next();
fi
```

Neither keyword introduces a new AST or backend runtime control-flow operation; implementations may desugar to a single logical negation of the initial `if` condition. Existing `if` semantics remain unchanged.

**Soundness gate:** a refutable `let` head or an `as let ... when` capture in the first negated branch is rejected until a backend can prove correct binding scope under inversion. Rejection must be explicit rather than letting the captured value leak. In particular, a pattern capture established by the *positive* predicate must not become visible in the *negative* branch.

## Acceptance checklist

- Reserved words with whole-word, case-sensitive lexing and no identifier-prefix collisions
- True/false branch inversion; normal `elif` and `else` handling; nested `fi` correctness
- Both `then` and existing braced spellings; single evaluation of a side-effecting boolean predicate
- Type errors for non-`bool` predicates and errors for unsafe bound-pattern heads
- Real guest-code execution for each compiler backend, not just lexical/model tests
- Reports must distinguish **passed**, **failed**, **unsupported**, and **not executed**

See `contracts/ifnot-unless-v1.json` for the machine-readable semantic contract.
