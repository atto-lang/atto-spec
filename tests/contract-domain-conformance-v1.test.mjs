// Host reference only. Not a compiler, guest, or proof of full semantic parity.
import test from 'node:test';
import assert from 'node:assert/strict';

const owner = {package:'pkg@1', namespace:'shop', path:'Cart', kind:'class'};
const need = {name:'run', arity:1, params:['int'], result:'int', mode:'read',
  ownership:['borrow'], effects:[], visibility:'pub', static:false};
const method = {...need, owner};
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const identity = o => [o.package,o.namespace,o.path,o.kind];
const rules = {namespace:'namespace', module:'module', interface:'instance', trait:'instance', static:'static'};
function admit(domain, target, required, members, complete=true) {
  if (!Object.hasOwn(rules,domain) || rules[domain] !== target.domain) throw Error('E_DOMAIN');
  if (!complete) throw Error('E_UNRESOLVED');
  if (!target.nominal && domain !== 'namespace' && domain !== 'module') throw Error('E_UNRESOLVED');
  for (const n of required) {
    const slots = members.filter(m => same(identity(m.owner),identity(target.owner)) &&
      m.name === n.name && m.arity === n.arity && m.static === n.static);
    if (slots.length !== 1) throw Error(slots.length?'E_CONFLICT':'E_MISSING');
    const m = slots[0];
    if (m.visibility !== 'pub') throw Error('E_VISIBILITY');
    if (!same(m.params,n.params) || m.result !== n.result ||
        m.mode !== n.mode || !same(m.ownership,n.ownership) ||
        m.effects.some(e=>!n.effects.includes(e))) throw Error('E_SIGNATURE');
  }
  return true;
}
const target = {domain:'instance',nominal:true,owner};
test('unique fully compatible instance slot',()=>assert.equal(admit('interface',target,[need],[method]),true));
test('trait uses same instance checks; static and module domains cannot substitute',()=>{
  assert.equal(admit('trait',target,[need],[method]),true);
  for (const d of ['static','module','namespace']) assert.throws(()=>admit(d,target,[need],[method]),/E_DOMAIN/);
});
test('same leaf names in different owners or package versions are not identity',()=>{
  for(const o of [{...owner,package:'pkg@2'},{...owner,namespace:'other'},{...owner,path:'Other.Cart'},{...owner,kind:'struct'}])
    assert.throws(()=>admit('interface',target,[need],[{...method,owner:o}]),/E_MISSING/);
});
test('wrong slot kind, arity, or duplicate does not satisfy',()=>{
  for(const m of [{...method,static:true},{...method,arity:0}])
    assert.throws(()=>admit('interface',target,[need],[m]),/E_MISSING/);
  assert.throws(()=>admit('interface',target,[need],[method,method]),/E_CONFLICT/);
});
test('visibility, parameter, return, receiver, ownership and effect mismatches',()=>{
  assert.throws(()=>admit('interface',target,[need],[{...method,visibility:'private'}]),/E_VISIBILITY/);
  for(const change of [{params:['string']},{result:'string'},{mode:'write'},{ownership:['take']},{effects:['suspend']}])
    assert.throws(()=>admit('interface',target,[need],[{...method,...change}]),/E_SIGNATURE/);
});
test('all obligations must be present and partial source sets cannot certify',()=>{
  assert.throws(()=>admit('interface',target,[need,{...need,name:'other'}],[method]),/E_MISSING/);
  assert.throws(()=>admit('interface',target,[need],[method],false),/E_UNRESOLVED/);
  const ns={domain:'namespace',owner:{...owner,kind:'namespace',path:''}};
  assert.throws(()=>admit('namespace',ns,[],[],false),/E_UNRESOLVED/);
});
test('empty nominal marker does not admit an unrelated structural witness',()=>{
  assert.equal(admit('interface',target,[],[]),true);
  assert.throws(()=>admit('interface',{...target,nominal:false},[],[]),/E_UNRESOLVED/);
});
test('static slot cannot be discharged by instance method',()=>{
  const t={...target,domain:'static'}, n={...need,static:true};
  assert.equal(admit('static',t,[n],[{...method,static:true}]),true);
  assert.throws(()=>admit('static',t,[n],[method]),/E_MISSING/);
});

test('namespace members are checked against canonical namespace and complete source set',()=>{
  const ns={domain:'namespace',owner:{package:'pkg@1',namespace:'shop',path:'',kind:'namespace'}};
  const n={...method,owner:ns.owner};
  assert.equal(admit('namespace',ns,[need],[n]),true);
  assert.throws(()=>admit('namespace',ns,[need],[{...n,owner:{...ns.owner,package:'pkg@2'}}]),/E_MISSING/);
  assert.throws(()=>admit('namespace',ns,[need],[n],false),/E_UNRESOLVED/);
  assert.throws(()=>admit('namespace',ns,[need],[n,n]),/E_CONFLICT/);
});
test('module contract uses only its own visible member slots',()=>{
  const mod={domain:'module',owner:{package:'pkg@1',namespace:'shop',path:'Api',kind:'module'}};
  const n={...method,owner:mod.owner};
  assert.equal(admit('module',mod,[need],[n]),true);
  assert.throws(()=>admit('module',mod,[need],[{...n,visibility:'private'}]),/E_VISIBILITY/);
  assert.throws(()=>admit('module',mod,[need],[{...n,owner:{...mod.owner,path:'Other'}}]),/E_MISSING/);
  assert.throws(()=>admit('interface',mod,[need],[n]),/E_DOMAIN/);
});
test('slot selection is independent of unrelated member order',()=>{
  const other={...method,name:'other'};
  assert.equal(admit('trait',target,[need],[other,method]),true);
  assert.equal(admit('trait',target,[need],[method,other]),true);
  assert.throws(()=>admit('trait',target,[need],[method,other,method]),/E_CONFLICT/);
});
test('portable inventory covers all eleven backends without overstating evidence',async()=>{
  const {readFileSync}=await import('node:fs');
  const m=JSON.parse(readFileSync(new URL('../conformance/contract-domain-conformance-v1.json',import.meta.url),'utf8'));
  assert.equal(m.schema,'atto.contract-domain-conformance.v1');
  assert.equal(m.status,'PROPOSED_NOT_EXECUTED');
  assert.deepEqual(Object.keys(m.backends).sort(),['atto','cranelift','forge','hdl','java','js','llvm','net','realtime','rs','wasm']);
  assert.ok(Object.values(m.backends).every(v=>v==='NOT_EXECUTED'));
  const counts={namespace:6,module:6,interface:6,trait:6,static_class:4,structural:3,behavioral:4,linkage:2};
  assert.equal(m.cases.length,37);
  assert.equal(new Set(m.cases.map(c=>c.id)).size,37);
  for(const [domain,count] of Object.entries(counts)) assert.equal(m.cases.filter(c=>c.domain===domain).length,count,domain);
  for(const c of m.cases){
    assert.ok(c.id.startsWith(c.domain+'.'));
    assert.ok(['compile_run','compile_reject','profile_reject','incremental','full_aot'].includes(c.phase));
    assert.equal(c.source_kind,'acceptance_intent_not_runnable');
    assert.equal(c.status,'NOT_EXECUTED');
    assert.ok(c.requirement.length>30);
  }
});
