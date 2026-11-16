// Source-free grammar-position reference only. This does NOT compile .atto.
// Canonical authority: spec/27-optional-and-named-arguments.md
import assert from 'node:assert/strict';
import test from 'node:test';
const fail = code => { throw Error(code); };
function parseType(raw) {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s || s.endsWith('??')) fail('E_TYPE_SUFFIX');
  if (s.includes(':') || s.includes('=') || (s.includes('?') && !s.endsWith('?'))) fail('E_FORMAL');
  if (!s.endsWith('?')) return s;
  const inner = s.slice(0, -1);
  if (!inner || inner === 'void' || inner === 'null') fail('E_TYPE_SUFFIX');
  return 'Option<' + inner + '>';
}
function parseFormal(raw) {
  // A deliberately narrow reference for default literals; this is not the
  // compiler grammar, a typechecker, or a default expression evaluator.
  const s = raw.trim();
  const eq = s.indexOf('=');
  const lhs = (eq === -1 ? s : s.slice(0,eq)).trim();
  const defaultText = eq === -1 ? null : s.slice(eq+1).trim();
  if (eq !== -1 && (!defaultText || defaultText.includes('='))) fail('E_DEFAULT');
  const first = lhs.match(/^([a-z_]\w*)(\?)?\s*:\s*(.+)$/);
  let name, typeText, omittable;
  if (first) {
    name=first[1]; omittable=Boolean(first[2]); typeText=first[3];
  } else {
    const other=lhs.match(/^(.+?)\s+([a-z_]\w*)(\?)?$/);
    if (!other) fail('E_FORMAL');
    typeText=other[1]; name=other[2]; omittable=Boolean(other[3]);
  }
  const type=parseType(typeText);
  if (defaultText !== null && !omittable) fail('E_DEFAULT_REQUIRES_NAME_QUESTION');
  if (omittable && !type.startsWith('Option<') && defaultText===null) fail('E_OMITTABLE_DEFAULT');
  return {name,type,omittable,defaultText};
}
function parseSignature(formals) {
  const values=formals.map(parseFormal);
  if (new Set(values.map(x=>x.name)).size !== values.length) fail('E_DUPLICATE_FORMAL');
  // DO NOT reject nontrailing omission here: canonical named call binding can
  // fill later required slots, even while Rust/Wasm supports trailing-only.
  return values;
}
const rejected=(fn,code)=>assert.throws(fn,error=>error.message===code);
test('both formal orders retain the independent optional type and omittable name markers',()=>{
  for(const [a,b] of [
    ['X? x?', 'x?: Option<X>'],
    ['int? x', 'x: int?'],
    ['int? x?', 'x?: int?'],
    ['Result<int,string>? out?', 'out?: Option<Result<int,string>>'],
    ['Option<int>? nested?', 'nested?: Option<Option<int>>'],
    ['int count? = 10', 'count?: int = 10']
  ]) assert.deepEqual(parseFormal(a),parseFormal(b), a+' / '+b);
  assert.equal(parseFormal('X? x').omittable,false);
  assert.equal(parseFormal('X? x?').omittable,true);
});
test('nontrailing omittable formals are legal target syntax with later named binding',()=>{
  const f=parseSignature(['int? a?', 'int b', 'c?: int?']);
  assert.deepEqual(f.map(x=>x.omittable),[true,false,true]);
  assert.deepEqual(f.map(x=>x.type),['Option<int>','int','Option<int>']);
});
test('malformed double question, misplaced defaults and unsupported omission fail closed',()=>{
  for(const [s,code] of [
    ['int?? x','E_TYPE_SUFFIX'],
    ['x: int??','E_TYPE_SUFFIX'],
    ['x: void?','E_TYPE_SUFFIX'],
    ['int x?','E_OMITTABLE_DEFAULT'],
    ['x?: int','E_OMITTABLE_DEFAULT'],
    ['x: int = 10','E_DEFAULT_REQUIRES_NAME_QUESTION'],
    ['int x = 10','E_DEFAULT_REQUIRES_NAME_QUESTION'],
    ['int? x??','E_FORMAL'],
    ['x??: int','E_FORMAL']
  ]) rejected(()=>parseFormal(s),code);
  rejected(()=>parseSignature(['int x','x: int']), 'E_DUPLICATE_FORMAL');
});
