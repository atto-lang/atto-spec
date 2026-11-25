# Proposed else-free guard syntax (roadmap #25)

STATUS: PROPOSED, not a merged normative AttoLang grammar; no real compiler executed by these files.

Canonical surface: guard condition { return value; }

The condition must typecheck as bool and is evaluated exactly once. If it evaluates to false, the guard body executes its mandatory terminating return/raise; if true, the body is skipped and the subsequent statement executes. The proposed v1 reference restricts the guard body to an explicit return; the future typechecker must prove *all paths* terminate and preserve existing ownership and critical/suspends effects. There is no required else token and no implicit truthiness, implicit conversion or automatic option/future flattening. The condition may have ordinary eager evaluation side effects; they must happen once and in source order. No interpreter may desugar guard into an effect-duplicating conditional.

Example:

    fnc classify(bool ready) -> int {
      guard ready { return 0; }
      return 42;
    }

Rejections: non-boolean condition, nonterminal guard body, unmatched braces, redundant else, fallthrough without a return in a non-void function. Guard inside critical inherits its no-suspension and no-escaping-borrow restrictions. A guard return must run ordinary defer/cleanup exactly once.

The checked-in miniature source-free reference parses a strictly limited subset (single int-returning function, primitive literal/parameter or int > 0). It is NOT the AttoLang compiler/parser and the 13 fixtures are design vectors, NOT backend execution. Before claiming task complete, add real native parser, AST, CFG reachability/typed-effect/ownership lowering and reject-before-artifact tests for Java/GraalVM, LLVM, .NET, Wasm and Forge, with stepful exact-head receipts.
