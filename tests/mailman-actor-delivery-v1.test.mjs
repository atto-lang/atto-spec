// HOST-ONLY semantic oracle. NOT an Atto compiler, executable actor runtime, or authenticated proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function authorize(input) {
  const p={mode:null,unique:true,graph_closed:true,sendable:true,deep_copyable:true,frozen:true,sync:true,same_domain:true,scoped:true,readers:0,writer:false,reader_proof:true,writer_proof:true,loans:0,live_after:true,observable_copy:true,elision:false,copy_hooks_equivalent:true,copy_budget:true,room:true,authentic:true,fresh_epoch:true,...input};
  const fail=code=>({ok:false,code});
  if(!['TRANSFER','DEEP_COPY','READ_LEASE','WRITE_LEASE','FROZEN_SHARE','SHALLOW_COPY'].includes(p.mode))return fail('E_DELIVERY_MODE');
  if(!p.authentic)return fail('E_ENVELOPE_FORGED');
  if(!p.fresh_epoch)return fail('E_STALE_GENERATION');
  if(!p.room)return fail('E_MAILBOX_FULL');
  if(!p.sendable)return fail('E_SENDABLE_PROOF_REQUIRED');
  if(p.mode==='SHALLOW_COPY')return fail('E_SHALLOW_ISOLATION_PROOF');
  if(p.mode==='TRANSFER'){
    if(!p.unique||!p.graph_closed)return fail('E_EXCLUSIVE_GRAPH_REQUIRED');
    if(p.loans)return fail('E_BORROW_CONFLICT');
    if(!p.same_domain)return fail('E_MEMORY_DOMAIN');
    return {ok:true,delivery:'TRANSFER'};
  }
  if(p.mode==='DEEP_COPY'){
    if(!p.deep_copyable)return fail('E_DEEP_COPY_WITNESS');
    if(!p.copy_budget)return fail('E_COPY_BUDGET');
    const elide=p.elision&&p.unique&&p.graph_closed&&!p.loans&&!p.live_after&&!p.observable_copy&&p.copy_hooks_equivalent&&p.same_domain;
    return {ok:true,delivery:elide?'ELIDED_COPY_TRANSFER':'DEEP_COPY'};
  }
  if(!p.same_domain)return fail('E_MEMORY_DOMAIN');
  if(p.mode==='FROZEN_SHARE')return p.frozen&&p.sync?{ok:true,delivery:'FROZEN_SHARE'}:fail('E_FREEZE_PROOF_REQUIRED');
  if(!p.scoped)return fail('E_LOAN_SCOPE_REQUIRED');
  if(p.mode==='READ_LEASE'){
    if(!p.reader_proof)return fail('E_READ_LEASE_PROOF');
    return p.writer?fail('E_LOAN_CONFLICT'):{ok:true,delivery:'READ_LEASE'};
  }
  if(!p.writer_proof)return fail('E_WRITE_LEASE_PROOF');
  return p.writer||p.readers?fail('E_LOAN_CONFLICT'):{ok:true,delivery:'WRITE_LEASE'};
}
function graph_copy(root,memo=new Map(),quota={left:10000}){
  if(root===null||typeof root!=='object')return root;
  if(memo.has(root))return memo.get(root);
  if(root.uncopyable===true)throw Error('E_DEEP_COPY_WITNESS');
  if(--quota.left<0)throw Error('E_COPY_BUDGET');
  const output=Array.isArray(root)?[]:{};
  memo.set(root,output);
  for(const key of Object.keys(root))output[key]=graph_copy(root[key],memo,quota);
  return output;
}
function deliver(sender,recipient,requested,fail_during_copy=false){
  const choice=authorize(requested);
  if(!choice.ok)return choice;
  if(recipient.inbox.length>=recipient.capacity)return {ok:false,code:'E_MAILBOX_FULL'};
  if(choice.delivery==='TRANSFER'||choice.delivery==='ELIDED_COPY_TRANSFER')sender.escrow=true;
  let payload;
  try{
    if(choice.delivery==='DEEP_COPY'){
      if(fail_during_copy)throw Error('E_COPY_ALLOCATION');
      payload=graph_copy(sender.value,new Map(),{left:requested.node_budget??10000});
    }else payload=sender.value;
    recipient.inbox.push(payload);
    if(choice.delivery==='TRANSFER'||choice.delivery==='ELIDED_COPY_TRANSFER'){sender.value=undefined;sender.owned=false;}
    sender.escrow=false;
    return {ok:true,delivery:choice.delivery};
  }catch(error){
    sender.escrow=false;
    return {ok:false,code:error.message};
  }
}
const fixtures=JSON.parse(readFileSync(new URL('../conformance/mailman-actor-delivery-v1.json',import.meta.url),'utf8'));
test('case registry pins safe modes and reject diagnostics',()=>{
  assert.equal(fixtures.version,'atto-mailman-delivery-v1');
  assert.equal(fixtures.status,'HOST_ONLY_MODEL_NOT_GUEST_PROOF');
  assert.equal(fixtures.cases.length,32);
  for(const fixture of fixtures.cases){
    const result=authorize(fixture.request);
    assert.equal(result.ok?result.delivery:result.code,fixture.expected,fixture.name);
  }
});
test('a graph clone keeps cycles and internal aliases but differs across recipients',()=>{
  const child={items:[1,2,3]};
  const original={left:child,right:child};original.self=original;
  const a=graph_copy(original),b=graph_copy(original);
  assert.notEqual(a,original);assert.notEqual(b,original);assert.notEqual(a,b);
  assert.equal(a.left,a.right);assert.equal(a.self,a);assert.equal(b.left,b.right);
  assert.notEqual(a.left,b.left);assert.notEqual(a.left,child);
  a.left.items[0]=99;
  assert.equal(original.left.items[0],1);assert.equal(b.left.items[0],1);
});
test('deep copy preserves sender and creates separate mutable message',()=>{
  const sender={value:{nested:{value:4}},owned:true,escrow:false};
  const receiver={inbox:[],capacity:1};
  assert.deepEqual(deliver(sender,receiver,{mode:'DEEP_COPY'}),{ok:true,delivery:'DEEP_COPY'});
  receiver.inbox[0].nested.value=99;
  assert.equal(sender.value.nested.value,4);assert.equal(sender.owned,true);
});
test('unique transfer consumes sender only after committed enqueue',()=>{
  const x={nested:[1]};
  const sender={value:x,owned:true,escrow:false};
  const receiver={inbox:[],capacity:1};
  assert.deepEqual(deliver(sender,receiver,{mode:'TRANSFER'}),{ok:true,delivery:'TRANSFER'});
  assert.equal(receiver.inbox[0],x);assert.equal(sender.value,undefined);
  assert.equal(sender.owned,false);assert.equal(sender.escrow,false);
});
test('failed copy and full mailbox leave sender owner intact, publish nothing',()=>{
  for(const full of [false,true]){
    const x={nested:[1]};
    const sender={value:x,owned:true,escrow:false};
    const receiver={inbox:full?[{existing:true}]:[],capacity:full?1:2};
    const before=receiver.inbox.length;
    const result=deliver(sender,receiver,{mode:'DEEP_COPY'},!full);
    assert.equal(result.ok,false);assert.equal(sender.value,x);
    assert.equal(sender.owned,true);assert.equal(sender.escrow,false);
    assert.equal(receiver.inbox.length,before);
  }
});
test('copy budget and uncopyable child fail atomically',()=>{
  for(const value of [{a:{b:{c:{}}}},{a:{uncopyable:true}}]){
    const sender={value,owned:true,escrow:false},receiver={inbox:[],capacity:2};
    const result=deliver(sender,receiver,{mode:'DEEP_COPY',node_budget:2});
    assert.equal(result.ok,false);assert.equal(receiver.inbox.length,0);
    assert.equal(sender.value,value);assert.equal(sender.owned,true);
  }
});
test('requested copy may be elided only when source is proven dead and unobservable',()=>{
  const a={value:{v:9},owned:true,escrow:false},b={inbox:[],capacity:2};
  assert.equal(deliver(a,b,{mode:'DEEP_COPY',elision:true,live_after:false,observable_copy:false}).delivery,'ELIDED_COPY_TRANSFER');
  assert.equal(a.value,undefined);
  const c={value:{v:10},owned:true,escrow:false},d={inbox:[],capacity:2};
  assert.equal(deliver(c,d,{mode:'DEEP_COPY',elision:true,live_after:true,observable_copy:false}).delivery,'DEEP_COPY');
  assert.ok(c.value);assert.notEqual(c.value,d.inbox[0]);
});
