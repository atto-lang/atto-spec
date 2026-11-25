# Negated conditionals: `ifnot` and `unless`

**Status:** TARGET, not compiler-certified. This revision supersedes the older statement-only and mandatory-fi-for-braces proposal, matching [#174](https://github.com/atto-lang/atto-spec/pull/174) and [#183](https://github.com/atto-lang/atto-spec/pull/183).

## Forms

- Value: `ifnot/unless condition then value else value fi`. Mandatory else, compatible static arm types; no control-transfer statement as a value.
- Imperative keyword: `do ifnot/unless condition then statements [else statements] fi`. Optional else.
- Imperative brace: `ifnot/unless condition { statements } [else { statements }]`. Matching braces terminate; no fi.

Both keywords are reserved case-sensitive whole tokens, not postfix modifiers. The original predicate has static type bool and is evaluated once, then inverted; subsequent elif predicates remain positive and are evaluated in source order only if reached. Else is ordinary fallback. There is no truthiness coercion. Negation does not alter side effects, failures or scheduling.

```atto
do ifnot ready then
  start_worker();
else
  notify_ready();
fi

unless should_stop {
  process_next();
}

val int selected = unless ready then 5 else 6 fi;
```

Refutable or conditional-binding heads are rejected pending sound scope proof; a positive-predicate capture is never available in a negated branch merely because the spelling changes. Existing if semantics are not replaced by this chapter; the general conditional grammar is separately tracked in #183.

## Verification

The [machine-readable contract](../contracts/ifnot-unless-v1.json) is identical to the reconciled #174 contract. Run `node tests/negated-conditional-reference.mjs` for the host reference checks of truth table, evaluation order, positive elif, fallback, type rejection and form/evidence consistency. Actual compiler parsing, guest execution, formatting and parity remain separately required. Compiler PR references are not execution proof.
