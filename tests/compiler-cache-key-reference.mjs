import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Reference envelope only: no source authentication, artifact trust, file I/O
// or native execution is performed by this function.
const domain=Buffer.from('atto.compiler.cache-key.v1\0','ascii');
const digestFields=['compiler','toolchain','target','configuration','sources','bindings'];
const fields=['stage','owner','unitKind','unit',...digestFields,'generated','dependencies'];
function fail(message){throw new TypeError(message);}
function u32(value){const b=Buffer.alloc(4);b.writeUInt32BE(value);return b;}
function ident(value){
  if(typeof value!=='string'||value.length<1||value.length>512||/[^\x21-\x7e]/.test(value))
    fail('invalid bounded ASCII identity');
  const b=Buffer.from(value,'ascii');return Buffer.concat([u32(b.length),b]);
}
function digest(value){
  if(typeof value!=='string'||value.length!==64||/[^0-9a-f]/.test(value))fail('invalid digest');
  return Buffer.from(value,'hex');
}
export function cacheKey(input){
  if(!input||Object.keys(input).length!==fields.length||fields.some(k=>!Object.hasOwn(input,k)))
    fail('invalid key envelope fields');
  if(!['namespace','source-unit'].includes(input.unitKind))fail('invalid unit kind');
  if(!Array.isArray(input.dependencies)||input.dependencies.length>128)fail('dependency budget');
  const deps=input.dependencies.map(d=>{
    if(!d||Object.keys(d).length!==2||!Object.hasOwn(d,'identity')||!Object.hasOwn(d,'digest'))
      fail('invalid dependency witness');
    return {identity:d.identity,id:ident(d.identity),hash:digest(d.digest)};
  }).sort((a,b)=>a.identity<b.identity?-1:a.identity>b.identity?1:0);
  for(let i=1;i<deps.length;i++)if(deps[i-1].identity===deps[i].identity)fail('duplicate dependency identity');
  const generated=input.generated===null?[Buffer.from([0])]:[Buffer.from([1]),digest(input.generated)];
  const bytes=Buffer.concat([domain,ident(input.stage),ident(input.owner),ident(input.unitKind),ident(input.unit),
    ...digestFields.map(k=>digest(input[k])),...generated,u32(deps.length),...deps.flatMap(d=>[d.id,d.hash])]);
  return createHash('sha256').update(bytes).digest('hex');
}
const h=n=>n.toString(16).padStart(2,'0').repeat(32);
const base={stage:'typed-ir',owner:'@org/project/a',unitKind:'namespace',unit:'network',
  compiler:h(1),toolchain:h(2),target:h(3),configuration:h(4),sources:h(5),bindings:h(6),generated:null,
  dependencies:[{identity:'@org/project/b',digest:h(7)},{identity:'@org/project/c',digest:h(8)}]};
const expected='6d0658c41d4e45ede029ca0c7654333c5aa0bc117f3179f12832aa7b1d22b657';
assert.equal(cacheKey(base),expected);
assert.equal(cacheKey({...base,dependencies:[...base.dependencies].reverse()}),expected);
for(const k of digestFields)assert.notEqual(cacheKey({...base,[k]:h(9)}),expected,k);
for(const [k,v] of Object.entries({stage:'native-code',owner:'@org/project/z',unitKind:'source-unit',unit:'other',generated:h(0)}))
  assert.notEqual(cacheKey({...base,[k]:v}),expected,k);
assert.notEqual(cacheKey({...base,dependencies:[]}),expected);
assert.notEqual(cacheKey({...base,dependencies:[{...base.dependencies[0],digest:h(9)},base.dependencies[1]]}),expected);
assert.notEqual(cacheKey({...base,owner:'ab',unit:'c'}),cacheKey({...base,owner:'a',unit:'bc'}));
for(const malformed of [
  {...base,generated:''},{...base,compiler:'F'.repeat(64)},{...base,compiler:h(1)+'\n'},{...base,owner:'a\n'},{...base,owner:'a\0b'},
  {...base,unit:'\ud800'},{...base,unit:'x'.repeat(513)},{...base,unitKind:'package'},
  {...base,dependencies:[base.dependencies[0],base.dependencies[0]]},
  {...base,dependencies:Array.from({length:129},(_,i)=>({identity:'p'+i,digest:h(1)}))},
  {...base,extra:'unknown'},Object.fromEntries(Object.entries(base).filter(([k])=>k!=='generated')),
])assert.throws(()=>cacheKey(malformed),TypeError);
console.log('CACHE_KEY_REFERENCE|vector='+expected+'|permutation|field-drift|framing|hostile-input-rejections');
