// Deliberately tiny independent *type-rule oracle*, NOT a guest compiler.
export function parseType(input) {
  if (typeof input !== "string" || input.length > 512 ||
      !/^[A-Za-z0-9_<>, ]+$/.test(input)) throw Error("INVALID_TYPE");
  const tokens = input.match(/[A-Za-z_][A-Za-z0-9_]*|[<>,]/g) ?? [];
  let p = 0;
  function atom(depth) {
    if (depth > 16) throw Error("TYPE_DEPTH_EXCEEDED");
    const name = tokens[p++];
    if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw Error("INVALID_TYPE");
    if (tokens[p] === "<") {
      if (!["Option", "Future"].includes(name)) throw Error("UNKNOWN_GENERIC");
      p++;
      const inner = atom(depth + 1);
      if (tokens[p++] !== ">") throw Error("INVALID_TYPE");
      return {name, inner};
    }
    if (["Option", "Future"].includes(name)) throw Error("UNPARAMETERIZED_WRAPPER");
    if (name !== "int" && name !== "bool") throw Error("UNKNOWN_SCALAR");
    return {name};
  }
  const ast = atom(0);
  if (p !== tokens.length) throw Error("TRAILING_TYPE_TOKENS");
  return ast;
}
export function printType(type) {
  return type.inner ? `${type.name}<${printType(type.inner)}>` : type.name;
}
export function applyRule(op, source, destination) {
  const type = parseType(source);
  if (op === "assign") {
    const target = parseType(destination);
    if (printType(type) === printType(target)) return printType(target);
    if (type.name === target.name &&
        ["Option", "Future"].includes(type.name) &&
        type.inner?.name === type.name &&
        printType(type.inner) === printType(target))
      throw Error("IMPLICIT_FLATTEN_FORBIDDEN");
    throw Error("INCOMPATIBLE_TYPES");
  }
  if (!["await", "unwrap", "flatten"].includes(op)) throw Error("UNKNOWN_OPERATION");
  if (op === "await" && type.name !== "Future" ||
      op === "unwrap" && type.name !== "Option" ||
      op === "flatten" && !["Option", "Future"].includes(type.name))
    throw Error("OPERATION_WRAPPER_MISMATCH");
  if (op === "flatten" && type.inner?.name !== type.name)
    throw Error("FLATTEN_REQUIRES_SAME_WRAPPER");
  return printType(type.inner);
}
