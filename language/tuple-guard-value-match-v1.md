# Guarded value match over a tuple (v1)

Status: **target language contract**, with a restricted Rust/Wasm implementation
proposed separately in [atto-source.rs PR #153](https://github.com/atto-lang/atto-source.rs/pull/153).
Not a claim of multi-backend parity or a completed consensus algorithm.

## Canonical syntax

```atto
use namespace raft;

// Math-only Raft entry: NOT an implemented consensus algorithm.
define module rmq_raft_majority as
  pub fnc has_quorum(int voters, int acknowledgements): bool {
    return match<bool> (voters, acknowledgements) over
      on voters < 1                    -> false,
      on acknowledgements < 1          -> false,
      on acknowledgements > voters     -> false,
      on acknowledgements > voters / 2 -> true,
      default                          -> false
    end;
  }
end
```

## Semantic requirements

1. `match<T> tuple over ... end` is an **expression** producing `T`.
   Every `on` and `default` arm value must type-check as `T`, independently
   of the enclosing return type.
2. The tuple subject is evaluated **once**, left-to-right, before the arms.
   A guard-only arm has the semantics of `on _ when condition` (and does not
   destructure/rebind tuple components). Guards may use names already in scope.
   General pattern arms, including explicitly bound tuple elements, are a
   separate feature; do not silently infer binding qualifiers.
3. Evaluate boolean guards in source order, only until the first true guard.
   Evaluate only the selected result. `default` must be the final arm.
   Guard-only matches without a final default are non-exhaustive.
4. `->` introduces arm execution/result expressions; `=>` is reserved for
   callable type signatures and other type declarations. Commas separate arms.
5. Reject non-bool guards, non-`T` arm results, extra/missing tuple members,
   undefined subject names, and misplaced or duplicate `default` with
   diagnostics. No partial Wasm artifact on errors.
6. For positive int `voters` and `acknowledgements`, strict majority is
   `acknowledgements > voters / 2` with integer division. Validate
   `1 <= acknowledgements <= voters` and `voters >= 1` first.
   Do **not** compute `acknowledgements * 2`: it can overflow signed 64-bit int.
   `4,2` => false; `4,3` => true; `1,1` => true; `0,0` => false;
   `9223372036854775807,4611686018427387904` => true.

## Restricted first implementation versus future general syntax

The initial Rust/Wasm subset in PR #153 admits only a
`return match<bool> (name1, name2) over ... end` whose subject components are
already-bound `int` variables. It lowers guard-only arms to typed conditional
returns, and validates the two source variable types before evaluating guards.
It does *not* yet support first-class Tuple expressions, arbitrary tuple
construction, destructuring, `match<int>`, expression positions outside
`return`, or browser lowering of `use namespace` / `define module`.
Those restrictions must remain explicit.

Real guest execution and cross-backend parity require separately executed
tests. CI that failed without a runner is **NOT_EXECUTED**, not passing.
General structural Tuple/List patterns remain tracked in
[atto-source.rs issue #123](https://github.com/atto-lang/atto-source.rs/issues/123).
