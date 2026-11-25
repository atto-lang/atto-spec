# AttoLang TextMate fallback (DRAFT)

This is a lexical fallback derived from Chapter 16's documented Java lexer table, not a parser, formatter, or shipped language server. Literal strings, nested comments, and Symbols precede keyword matching. Only `nb-select` is a lexer compound; `critical-read`, `critical-write`, and `transform-pipe` need parser context. TARGET/contextual words (`declare`, `sealed`, `singleton`, `pipe`) are excluded. `.ores` is legacy compatibility only.

The Node contract checks JSON and regex inventory. It **does not execute the TextMate/Oniguruma engine** or establish actual highlighting behavior. Real editor tests remain required before release.
