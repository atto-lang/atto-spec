/**
 * Deliberately tiny source-free guard prototype, NOT an AttoLang compiler.
 * Only verifies v1 examples and the fail-arm/no-else shape.
 */
const restricted =
  /^fnc\s+[A-Za-z_]\w*\s*\(\s*(bool|int)\s+([A-Za-z_]\w*)\s*\)\s*->\s*int\s*\{\s*guard\s+(true|false|[A-Za-z_]\w*(?:\s*>\s*0)?)\s*\{\s*return\s+(-?\d+)\s*;\s*\}\s*return\s+(-?\d+)\s*;\s*\}$/s;

export function inspectGuardFixture(source) {
  if (typeof source !== 'string' || source.length > 4096)
    return {admitted:false,code:'E_GUARD_SOURCE'};
  if (/\bguard\b[\s\S]*\belse\b/.test(source))
    return {admitted:false,code:'E_GUARD_ELSE_NOT_REQUIRED'};
  const m = restricted.exec(source.trim());
  if (!m) return {admitted:false,code:'E_GUARD_UNSUPPORTED_SHAPE'};
  const [, parameterType, param, guardExpr, failValue, passValue] = m;
  const boolParam = guardExpr === param && parameterType === 'bool';
  const intCompare = guardExpr.replace(/\s+/g,'') === param + '>0' && parameterType === 'int';
  if (!['true','false'].includes(guardExpr) && !boolParam && !intCompare)
    return {admitted:false,code:'E_GUARD_BOOL_REQUIRED'};
  if (![failValue,passValue].every(s => Number.isSafeInteger(Number(s))))
    return {admitted:false,code:'E_GUARD_UNSAFE_INTEGER'};
  return {admitted:true,mode:
    guardExpr === 'true' || guardExpr === 'false' ? 'literal' :
      boolParam ? 'bool-param' : 'integer-compare',
    parameter:param,failValue:Number(failValue),passValue:Number(passValue),
    literal:guardExpr === 'true' ? true : guardExpr === 'false' ? false : null};
}
/** Execute reference semantics only: a false condition executes early exit. */
export function runGuardModel(parsed, parameterValue, observer = () => {}) {
  if (!parsed?.admitted) throw new TypeError('UNADMITTED_GUARD');
  observer('condition'); // exactly once, independent of outcome
  let cond;
  if (parsed.mode === 'literal') cond = parsed.literal;
  else if (parsed.mode === 'bool-param') {
    if (typeof parameterValue !== 'boolean') throw new TypeError('BOOL_INPUT');
    cond = parameterValue;
  } else {
    if (!Number.isSafeInteger(parameterValue)) throw new TypeError('INT_INPUT');
    cond = parameterValue > 0;
  }
  return {value: cond ? parsed.passValue : parsed.failValue,
    exitedEarly: !cond};
}
