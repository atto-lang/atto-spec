// Reference model only: not a lexer, compiler, or evidence of guest execution.
export function makeResolver(registry, declarations = new Map()) {
  const primitive = new Set(registry.primitives);
  const aliases = new Map(Object.entries(registry.compatibilityAliases));
  const wrappers = new Map(Object.entries(registry.wrapperCandidates));
  const intrinsic = name => 'intrinsic:' + name;
  return function resolve(name, profile = 'strict') {
    if (profile !== 'strict' && profile !== 'legacy-alias') throw Error('E_PROFILE');
    if (primitive.has(name)) return intrinsic(name);
    if (aliases.has(name)) return intrinsic(aliases.get(name));
    if (declarations.has(name)) return declarations.get(name);
    if (profile === 'legacy-alias' && Object.hasOwn(registry.legacyAliasesRequiringProfileMigration,name))
      return intrinsic(registry.legacyAliasesRequiringProfileMigration[name]);
    if (wrappers.has(name)) throw Error('E_WRAPPER_NOT_ADMITTED');
    throw Error('E_UNKNOWN_TYPE');
  };
}
export function convertible(source, target, operation, authenticatedWrappers) {
  if (operation === 'assign') return source === target;
  if (operation === 'box') return authenticatedWrappers.get(target) === source && authenticatedWrappers.has(target);
  if (operation === 'unbox') return authenticatedWrappers.get(source) === target && authenticatedWrappers.has(source);
  return false;
}
