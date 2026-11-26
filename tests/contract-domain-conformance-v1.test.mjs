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
