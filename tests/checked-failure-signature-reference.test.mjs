// REFERENCE-ONLY typed-signature model, NOT the Atto lexer/parser/compiler/AOT.
// Structured inputs represent already parsed clauses/annotations and body boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';

const types = ['throws','raises','panics'];
const aliases = new Map([
  ['Throws','throws'],['Raises','raises'],['Panics','panics'],
  ['throws','throws'],['raises','raises'],['panics','panics'],
]);
class Failure extends Error {
  constructor(code) { super(code); this.code = code; }
}
const reject = (code) => { throw new Failure(code); };
function normalize(def) {
  const result = {returnType: null, throws: [], raises: [], panics: []};
  const {annotations=[],clauses=[],returnBefore=null,returnAfter=null,
    prefixReturn=null,body='braces',hardNewline=false} = def;
  if ([returnBefore,returnAfter,prefixReturn].filter(v => v != null).length > 1)
    reject('E_RETURN_TYPE_CONFLICT');
  result.returnType = returnBefore ?? returnAfter ?? prefixReturn ?? 'void';
  if (returnAfter != null && def.effectAfterReturn === true)
    reject('E_EFFECT_ORDER');
  if (body === 'shortcut' && returnAfter == null)
    reject('E_BODY_DELIMITER');
  if (body === 'shortcut' && !hardNewline)
    reject('E_BODY_NEWLINE');
  if (!['braces','begin_end','as_end','shortcut'].includes(body))
    reject('E_BODY_DELIMITER');

  const encountered = new Set();
  for (const item of [...annotations, ...clauses]) {
    if (typeof item !== 'object' || !item) reject('E_EFFECT_TYPE');
    const kind = aliases.get(item.name);
    if (!kind || (item.source === 'clause' && !types.includes(item.name)))
      reject('E_EFFECT_TYPE');
    if (encountered.has(kind)) reject('E_DUPLICATE_EFFECT');
    encountered.add(kind);
    if (!Array.isArray(item.errors)) reject('E_EFFECT_TYPE');
    // Empty declarations are permitted as explicit _proof_ only for annotations.
    if (item.source === 'clause' && item.errors.length === 0)
      reject('E_EFFECT_TYPE');
    const normalized = item.errors.map(e => {
      if (typeof e !== 'string' || !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:<[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*>)?$/.test(e))
        reject('E_EFFECT_TYPE');
      return e;
    });
    if (new Set(normalized).size !== normalized.length)
      reject('E_DUPLICATE_ERROR_TYPE');
    result[kind] = [...normalized].sort();
  }
  return result;
}
const annotation = (name,...errors) => ({source:'annotation',name,errors});
const clause = (name,...errors) => ({source:'clause',name,errors});
const verify = (err, fn) => assert.throws(fn,e=>e instanceof Failure && e.code===err);
const upperBound = (bodyEffects, signatureEffects, ancestor) =>
  bodyEffects.every(e => signatureEffects.some(bound => e===bound || ancestor(e,bound)));
const ancestry = (x,y) => x==='FileNotFound' && y==='IOError';

test('PascalCase annotations and Java-style clauses normalize equivalently',()=>{
  const a=normalize({annotations:[annotation('Throws','IOError','ParseError'),annotation('Raises','RecoveryError')],
    returnBefore:'Config'});
  const b=normalize({clauses:[clause('throws','ParseError','IOError'),clause('raises','RecoveryError')],
    returnBefore:'Config'});
  const c=normalize({clauses:[clause('raises','RecoveryError'),clause('throws','IOError','ParseError')],
    returnAfter:'Config'});
  assert.deepEqual(a,b); assert.deepEqual(b,c);
});
test('legacy lowercase annotation and parenthesized clause semantics share identity',()=>{
  assert.deepEqual(normalize({annotations:[annotation('throws','Error')]}),
    normalize({clauses:[clause('throws','Error')]}));
});
test('empty annotations are explicit empty effect sets',()=>{
  assert.deepEqual(normalize({annotations:[annotation('Throws'),annotation('Raises')],
    returnBefore:'int'}),{returnType:'int',throws:[],raises:[],panics:[]});
});
test('an empty clause is not an accepted Java-style type list',()=>{
  verify('E_EFFECT_TYPE',()=>normalize({clauses:[clause('throws')]}));
});
test('panics is independent of throws and raises',()=>{
  const n=normalize({annotations:[annotation('Throws'),annotation('Raises')],
    clauses:[clause('panics','FatalError')]});
  assert.deepEqual(n.throws,[]); assert.deepEqual(n.raises,[]);
  assert.deepEqual(n.panics,['FatalError']);
});
test('exact same-kind duplicates across annotation and clauses reject',()=>{
  for(const name of types){
    const cap=name[0].toUpperCase()+name.slice(1);
    verify('E_DUPLICATE_EFFECT',()=>normalize({
      annotations:[annotation(cap,'Error')],clauses:[clause(name,'Error')]}));
    verify('E_DUPLICATE_EFFECT',()=>normalize({
      annotations:[annotation(name,'Error'),annotation(cap,'Error')]}));
    verify('E_DUPLICATE_EFFECT',()=>normalize({
      clauses:[clause(name,'Error'),clause(name,'Error')]}));
  }
});
test('multiple nominal error types and one generic error type accepted',()=>{
  assert.deepEqual(normalize({clauses:[clause('throws','ParseError<T>','IOError')]}).throws,
    ['IOError','ParseError<T>']);
});
test('duplicate within one effect kind rejected, no last-wins',()=>{
  verify('E_DUPLICATE_ERROR_TYPE',()=>normalize({clauses:[clause('throws','Error','Error')]}));
});
test('unknown annotation and malformed type references rejected',()=>{
  verify('E_EFFECT_TYPE',()=>normalize({annotations:[annotation('throwsAny','Error')]}));
  for(const e of ['string[]()','system.exec(1)','ParseError<T>>','',null,42]){
    verify('E_EFFECT_TYPE',()=>normalize({annotations:[annotation('Throws',e)]}));
  }
});
test('return-before, return-after and prefix T• are semantically equal',()=>{
  const base={clauses:[clause('throws','IOError')]};
  const a=normalize({...base,returnBefore:'Config',body:'braces'});
  const b=normalize({...base,returnAfter:'Config',body:'braces'});
  const c=normalize({...base,prefixReturn:'Config',body:'begin_end'});
  assert.deepEqual(a,b); assert.deepEqual(a,c);
});
test('conflicting early/late or bullet/late return types rejected',()=>{
  verify('E_RETURN_TYPE_CONFLICT',()=>normalize({returnBefore:'int',returnAfter:'string'}));
  verify('E_RETURN_TYPE_CONFLICT',()=>normalize({prefixReturn:'int',returnAfter:'int'}));
  verify('E_RETURN_TYPE_CONFLICT',()=>normalize({prefixReturn:'int',returnBefore:'int'}));
});
test('effects after late return type rejected',()=>{
  verify('E_EFFECT_ORDER',()=>normalize({returnAfter:'Config',effectAfterReturn:true}));
});
test('shortcut is legal only with late return type and hard newline',()=>{
  const normal=normalize({clauses:[clause('throws','IOError')],
    returnAfter:'Config',body:'shortcut',hardNewline:true});
  assert.equal(normal.returnType,'Config');
  verify('E_BODY_DELIMITER',()=>normalize({returnBefore:'Config',body:'shortcut',hardNewline:true}));
  verify('E_BODY_DELIMITER',()=>normalize({prefixReturn:'Config',body:'shortcut',hardNewline:true}));
  verify('E_BODY_DELIMITER',()=>normalize({clauses:[clause('raises','E')],body:'shortcut',hardNewline:true}));
  verify('E_BODY_NEWLINE',()=>normalize({returnAfter:'Config',body:'shortcut',hardNewline:false}));
});
test('explicit braces, begin/end and as/end stay available in either return position',()=>{
  for(const body of ['braces','begin_end','as_end']){
    assert.equal(normalize({returnBefore:'Config',body}).returnType,'Config');
    assert.equal(normalize({returnAfter:'Config',body}).returnType,'Config');
    assert.equal(normalize({prefixReturn:'Config',body}).returnType,'Config');
  }
});
test('effects are subtype-covered but mismatched kinds are never equivalent',()=>{
  assert.ok(upperBound(['FileNotFound'],['IOError'],ancestry));
  assert.ok(!upperBound(['IOError'],['FileNotFound'],ancestry));
  assert.ok(!upperBound(['RecoveryError'],['IOError'],ancestry));
});
test('overrides must not widen any independent effect kind',()=>{
  const base={throws:['IOError'],raises:[],panics:[]};
  const narrow={throws:['FileNotFound'],raises:[],panics:[]};
  const wide={throws:['IOError'],raises:['RecoveryError'],panics:[]};
  assert.ok(types.every(kind=>upperBound(narrow[kind],base[kind],ancestry)));
  assert.ok(!types.every(kind=>upperBound(wide[kind],base[kind],ancestry)));
});
test('empty no-throw assertion fails on a derived escaping Error',()=>{
  const safe=normalize({annotations:[annotation('Throws')]});
  assert.ok(!upperBound(['IOError'],safe.throws,ancestry));
});
test('typed Result.Err return does not consume or create throws',()=>{
  const n=normalize({returnAfter:'Result<Config, ConfigError>',clauses:[clause('throws','IOError')],
    body:'shortcut',hardNewline:true});
  assert.equal(n.returnType,'Result<Config, ConfigError>');
  assert.deepEqual(n.throws,['IOError']);
});
