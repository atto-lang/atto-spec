// TEST-ONLY lexical oracle. Not the AttoLang lexer, parser, formatter or LSP.
const startsIdentifier = c => c !== undefined && /[\p{L}_]/u.test(c);
const continuesIdentifier = c => c !== undefined && /[\p{L}\p{N}_]/u.test(c);
const isDigit = c => c !== undefined && /[0-9]/.test(c);

export function scanLexicalReference(source, reservedWords) {
  const reserved = new Set(reservedWords);
  const tokens = [];
  const emit = (start, end, kind) => {
    if (!(end > start)) throw new Error("empty token");
    tokens.push({ text: source.slice(start, end), kind, start, end });
  };
  const readQuoted = (quoteStart, quote, kind, tokenStart = quoteStart) => {
    let i = quoteStart + 1;
    while (i < source.length) {
      if (source[i] === "\\") {
        if (i + 1 >= source.length) throw new SyntaxError("unterminated escape");
        i += 2;
        continue;
      }
      if (source[i] === quote) {
        emit(tokenStart, i + 1, kind);
        return i + 1;
      }
      i++;
    }
    throw new SyntaxError("unterminated quoted token");
  };
  let i = 0;
  while (i < source.length) {
    const start = i;
    const c = source[i];
    if (/\s/u.test(c)) { i++; continue; }
    if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
      emit(start, i, "comment");
      continue;
    }
    if (source.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (depth && i < source.length) {
        if (source.startsWith("/*", i)) { depth++; i += 2; }
        else if (source.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new SyntaxError("unterminated nested block comment");
      emit(start, i, "comment");
      continue;
    }
    if (c === '"' || c === "'" || c === "\x60") {
      i = readQuoted(i, c, c === "\x60" ? "template" : "string");
      continue;
    }
    if (c === "#" && source[i + 1] === '"') {
      i = readQuoted(i + 1, '"', "symbol", i);
      continue;
    }
    if (c === "#" && startsIdentifier(source[i + 1])) {
      i++;
      while (i < source.length && continuesIdentifier(source[i])) i++;
      emit(start, i, "symbol");
      continue;
    }
    // Chapter 16 documents nb-select as a lexer compound, others as parser-contextual.
    if (source.startsWith("nb-select", i) &&
        !continuesIdentifier(source[i + "nb-select".length]) &&
        source[i + "nb-select".length] !== "-") {
      i += "nb-select".length;
      emit(start, i, "compound");
      continue;
    }
    if (startsIdentifier(c)) {
      i++;
      while (i < source.length && continuesIdentifier(source[i])) i++;
      emit(start, i, reserved.has(source.slice(start, i)) ? "reserved" : "identifier");
      continue;
    }
    if (isDigit(c)) {
      i++;
      while (i < source.length && /[0-9_]/.test(source[i])) i++;
      emit(start, i, "number");
      continue;
    }
    const op = ["|>", "==", "!=", "<=", ">="].find(x => source.startsWith(x, i));
    if (op) {
      i += op.length;
      emit(start, i, "operator");
      continue;
    }
    if ("-+=*/<>|&!?".includes(c)) {
      i++;
      emit(start, i, "operator");
      continue;
    }
    if ("–—−".includes(c)) {
      i++;
      emit(start, i, "invalid_dash");
      continue;
    }
    if (";:.,(){}[]".includes(c)) {
      i++;
      emit(start, i, "punctuation");
      continue;
    }
    i++;
    emit(start, i, "unknown");
  }
  return tokens;
}
