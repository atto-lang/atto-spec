// HOST MODEL ONLY. No AttoLang guest compiler, durable SQL, fsync or crash test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../conformance/durable-typed-protocols-v1.json',import.meta.url),'utf8'));

class DurableModel {
  constructor() {
    this.tenant = "t1"; this.actor = "account/A"; this.epoch = 1; this.schemaVersion=1; this.messageVersion=1;
    this.state={balance:0}; this.sequence=0; this.events=[]; this.operations=new Map(); this.outbox=[]; this.claimGeneration=0;
    this.messageMigrations=new Map();
  }
  clone(x){return JSON.parse(JSON.stringify(x));}
  registerMessageMigration(from,to,fn){if(to!==from+1||this.messageMigrations.has(from))throw Error("ambiguous migration");this.messageMigrations.set(from,fn);}
  submit({tenant="t1",actor="account/A",producer="client",epoch=this.epoch,operation,namespace="adjust",message,outbox=[],expected=this.sequence,fault=null}) {
    if(tenant!==this.tenant||actor!==this.actor) return {status:"REJECT_AUTHORITY"};
    if(epoch!==this.epoch) return {status:"REJECT_STALE_EPOCH"};
    if(!operation||typeof operation!=="string"||operation.length>64) return {status:"REJECT_KEY"};
    if(!message||message.schema_id!=="counter.adjust"||!Number.isSafeInteger(message.schema_version)||message.schema_version<1||message.schema_version>this.messageVersion) return {status:"REJECT_SCHEMA"};
    if(typeof message.payload!=="string"||message.payload.length>1024) return {status:"REJECT_WIRE"};
    let decoded;try{decoded=JSON.parse(message.payload);if(JSON.stringify(decoded)!==message.payload) return {status:"REJECT_NONCANONICAL"};}catch{return {status:"REJECT_WIRE"};}
    const digest=message.schema_id+"/"+message.schema_version+"/"+message.payload;
    const scope=[tenant,actor,producer,namespace,operation].join("|");
    const prior=this.operations.get(scope);
    if(prior) return prior.digest===digest?{...prior.receipt,replayed:true}:{status:"REJECT_KEY_CONFLICT"};
    if(expected!==this.sequence) return {status:"REJECT_VERSION"};
    let version=message.schema_version;
    try{while(version<this.messageVersion){const migrator=this.messageMigrations.get(version);if(!migrator)return {status:"REJECT_NO_MIGRATION"};decoded=migrator(this.clone(decoded));version++;}}catch{return {status:"REJECT_MIGRATION"};}
    if(!Number.isSafeInteger(decoded.delta)||!Number.isSafeInteger(this.state.balance+decoded.delta)) return {status:"REJECT_PAYLOAD"};
    if(!Array.isArray(outbox)||outbox.length>8||outbox.some(x=>!x||typeof x.destination!=="string"||x.destination.length>80||x.schema_id!=="counter.updated"||x.schema_version!==1)) return {status:"REJECT_OUTBOX"};
    if(fault==="before_commit") return {status:"REJECT_IO"};
    const next=this.sequence+1;
    const receipt={status:"COMMITTED",sequence:next,operation};
    // Single modeled publication: no mutation occurs before all validation/fault gates.
    this.events.push({sequence:next,delta:decoded.delta,wire_version:message.schema_version});
    this.sequence=next;
    this.state={...this.state,balance:this.state.balance+decoded.delta};
    this.operations.set(scope,{digest,receipt});
    for(let i=0;i<outbox.length;i++) this.outbox.push({effect_id:scope+"/"+i,sequence:next,...this.clone(outbox[i]),acked:false,claim:null});
    return fault==="lost_receipt"?{status:"OUTCOME_UNKNOWN",operation}:receipt;
  }
  reconcile({tenant="t1",actor="account/A",epoch=this.epoch,operation,producer="client",namespace="adjust",message}) {
    if(tenant!==this.tenant||actor!==this.actor)return {status:"REJECT_AUTHORITY"};
    if(epoch!==this.epoch)return {status:"REJECT_STALE_EPOCH"};
    const scope=[tenant,actor,producer,namespace,operation].join("|");
    const prior=this.operations.get(scope);
    if(!prior)return {status:"NOT_FOUND"};
    const digest=message.schema_id+"/"+message.schema_version+"/"+message.payload;
    return prior.digest===digest?{...prior.receipt,reconciled:true}:{status:"REJECT_KEY_CONFLICT"};
  }
  upgrade({epoch=this.epoch,toVersion,stateMigration,fail=false}) {
    if(epoch!==this.epoch)return {status:"REJECT_STALE_EPOCH"};
    if(toVersion!==this.schemaVersion+1||typeof stateMigration!=="function")return {status:"REJECT_NO_MIGRATION"};
    let candidate;try{candidate=stateMigration(this.clone(this.state));if(!candidate||!Number.isSafeInteger(candidate.balance)||candidate.currency!=="USD")return {status:"REJECT_SCHEMA"};}catch{return {status:"REJECT_MIGRATION"};}
    if(fail)return {status:"REJECT_IO"};
    this.state=this.clone(candidate);this.schemaVersion=toVersion;this.messageVersion=toVersion;this.epoch++;
    return {status:"UPGRADED",epoch:this.epoch};
  }
  claim({epoch=this.epoch,now=0}) {
    if(epoch!==this.epoch)return {status:"REJECT_STALE_EPOCH"};
    const row=this.outbox.find(x=>!x.acked&&(!x.claim||x.claim.until<=now));
    if(!row)return {status:"NO_WORK"};
    row.claim={epoch,token:++this.claimGeneration,until:now+10};
    return {status:"CLAIMED",effect_id:row.effect_id,token:row.claim.token};
  }
  settle({epoch=this.epoch,effect_id,token}) {
    if(epoch!==this.epoch)return {status:"REJECT_STALE_EPOCH"};
    const row=this.outbox.find(x=>x.effect_id===effect_id);
    if(!row||!row.claim||row.claim.epoch!==epoch||row.claim.token!==token)return {status:"REJECT_STALE_CLAIM"};
    row.acked=true;return {status:"ACKED"};
  }
  recover() {
    let balance=0,seq=0;
    for(const e of this.events){if(e.sequence!==seq+1||!Number.isSafeInteger(e.delta)||!Number.isSafeInteger(balance+e.delta))return {status:"REJECT_CORRUPT_JOURNAL"};balance+=e.delta;seq++;}
    if(seq!==this.sequence)return {status:"REJECT_CORRUPT_JOURNAL"};
    const previous=this.state;
    this.state={...previous,balance};this.epoch++;
    return {status:"RECOVERED",balance,epoch:this.epoch};
  }
}
const msg = (delta,version=1) => ({schema_id:'counter.adjust',schema_version:version,payload:JSON.stringify({delta})});
const intent = {destination:'audit',schema_id:'counter.updated',schema_version:1};
test('contract is host-model only and all backends are unexecuted',()=>{
  assert.equal(manifest.testTier,'HOST_MODEL_ONLY');
  assert.ok(Object.values(manifest.backendStatus).every(x=>x==='NOT_EXECUTED'));
  assert.equal(manifest.invariants.length,16);
  assert.equal(new Set(manifest.cases).size,16);
});
test('atomic commit, duplicate receipt and conflicting original bytes',()=>{
  const m=new DurableModel();
  const original=m.submit({operation:'a',message:msg(3),outbox:[intent]});
  assert.equal(original.status,'COMMITTED');
  assert.equal(m.submit({operation:'a',message:msg(3)}).replayed,true);
  assert.equal(m.submit({operation:'a',message:msg(4)}).status,'REJECT_KEY_CONFLICT');
  assert.equal(m.sequence,1);assert.equal(m.state.balance,3);assert.equal(m.outbox.length,1);
});
test('old epoch is rejected before duplicate lookup; tenant spoof fails',()=>{
  const m=new DurableModel();m.submit({operation:'a',message:msg(1)});
  assert.equal(m.submit({operation:'a',message:msg(1),epoch:0}).status,'REJECT_STALE_EPOCH');
  assert.equal(m.submit({operation:'x',message:msg(1),tenant:'evil'}).status,'REJECT_AUTHORITY');
});
test('precommit failure leaves all four durable structures unmodified',()=>{
  const m=new DurableModel();assert.equal(m.submit({operation:'x',message:msg(1),outbox:[intent],fault:'before_commit'}).status,'REJECT_IO');
  assert.equal(m.sequence,0);assert.equal(m.events.length,0);assert.equal(m.operations.size,0);assert.equal(m.outbox.length,0);assert.equal(m.state.balance,0);
});
test('crash after local commit but before receipt reconciles original and never duplicates outbox',()=>{
  const m=new DurableModel();const message=msg(7);
  assert.equal(m.submit({operation:'x',message,outbox:[intent],fault:'lost_receipt'}).status,'OUTCOME_UNKNOWN');
  assert.equal(m.recover().status,'RECOVERED');
  assert.equal(m.reconcile({operation:'x',message}).sequence,1);
  assert.equal(m.reconcile({operation:'x',message,epoch:1}).status,'REJECT_STALE_EPOCH');
  assert.equal(m.reconcile({operation:'x',message,tenant:'evil'}).status,'REJECT_AUTHORITY');
  assert.equal(m.submit({operation:'x',message}).replayed,true);
  assert.equal(m.sequence,1);assert.equal(m.outbox.length,1);
});
test('future schema rejected and missing old-version migration blocks delivery',()=>{
  const m=new DurableModel();assert.equal(m.submit({operation:'a',message:msg(1,2)}).status,'REJECT_SCHEMA');
  assert.equal(m.upgrade({toVersion:2,stateMigration:s=>({...s,currency:'USD'})}).status,'UPGRADED');
  assert.equal(m.submit({operation:'b',message:msg(1,1)}).status,'REJECT_NO_MIGRATION');
  m.registerMessageMigration(1,2,v=>v);
  assert.equal(m.submit({operation:'b',message:msg(1,1)}).status,'COMMITTED');
});
test('failed copy-then-switch retains old state and code/epoch',()=>{
  const m=new DurableModel();
  assert.equal(m.upgrade({toVersion:2,stateMigration:()=>{throw Error('no');}}).status,'REJECT_MIGRATION');
  assert.equal(m.upgrade({toVersion:2,stateMigration:s=>({...s,currency:'USD'}),fail:true}).status,'REJECT_IO');
  assert.equal(m.epoch,1);assert.equal(m.schemaVersion,1);assert.deepEqual(m.state,{balance:0});
});
test('dedupe binds original version before upcasting',()=>{
  const m=new DurableModel();m.registerMessageMigration(1,2,v=>v);
  m.upgrade({toVersion:2,stateMigration:s=>({...s,currency:'USD'})});
  assert.equal(m.submit({operation:'x',message:msg(2,1)}).status,'COMMITTED');
  assert.equal(m.submit({operation:'x',message:msg(2,1)}).replayed,true);
  assert.equal(m.submit({operation:'x',message:msg(2,2)}).status,'REJECT_KEY_CONFLICT');
});
test('expired lease and actor epoch fence stale outbox claim; duplicate delivery window exists',()=>{
  const m=new DurableModel();m.submit({operation:'x',message:msg(1),outbox:[intent]});
  const a=m.claim({now:0});const b=m.claim({now:10});
  assert.notEqual(a.token,b.token);
  assert.equal(a.effect_id,b.effect_id,'redelivery retains the original effect identity');
  assert.equal(m.settle({effect_id:a.effect_id,token:a.token}).status,'REJECT_STALE_CLAIM');
  assert.equal(m.settle({effect_id:b.effect_id,token:b.token}).status,'ACKED');
  assert.equal(m.claim({now:20}).status,'NO_WORK');
});
test('journal gap fails closed without partially republishing state',()=>{
  const m=new DurableModel();m.submit({operation:'x',message:msg(1)});m.submit({operation:'y',message:msg(2)});
  m.events[1].sequence=8;const old=m.state.balance;
  assert.equal(m.recover().status,'REJECT_CORRUPT_JOURNAL');assert.equal(m.state.balance,old);assert.equal(m.epoch,1);
});
