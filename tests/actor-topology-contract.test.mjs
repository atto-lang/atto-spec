// HOST_ONLY model checks. Passing these does NOT establish compiled Atto guest support.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TopologyModel } from '../src/actor-topology-reference.mjs';

const seed = (m, key, extra={}) => m.seed({
  tenant:'tenant-a', graph:'g1', type:'Source', purpose:'source', key, ...extra
});
const grant = (m, actor, ops=['find','create','connect','observe']) =>
  m.grant(actor,{actions:ops, types:['Worker','Sink','Source'], purposes:['parse','sink','source']});
const factory = async () => ({stop:async()=>{}});
const children = (m,c) => m.children(c,{type:'Worker',purpose:'parse'});

test('find is nonactivating, scope-bound, and type-restricted', () => {
  const m=new TopologyModel(), owner=seed(m,'owner'), c=grant(m,owner);
  assert.equal(m.find(c,{type:'Sink',purpose:'sink',key:'never'}),null);
  assert.equal(m.count,1);
  assert.throws(()=>m.find(c,{type:'Admin',purpose:'sink',key:'never'}),/DENIED/);
  const other=m.seed({tenant:'tenant-b',graph:'g1',type:'Sink',purpose:'sink',key:'target'});
  assert.equal(m.find(c,{type:'Sink',purpose:'sink',key:'target'}),null);
  assert.ok(other);
});

test('opaque grants are not writable permissions, forgery and revocation fail closed', async () => {
  const m=new TopologyModel(), owner=seed(m,'owner'), c=grant(m,owner,['find']);
  assert.equal(Object.isFrozen(c),true);
  assert.equal(c.actions,undefined);
  assert.throws(()=>m.find({}, {type:'Worker',purpose:'parse',key:'x'}),/DENIED/);
  await assert.rejects(()=>m.ensureChildren(c,{type:'Worker',purpose:'parse',count:2},factory),/DENIED/);
  m.revoke(c);
  assert.throws(()=>m.find(c,{type:'Worker',purpose:'parse',key:'x'}),/DENIED/);
});

test('ensure_children(2) publishes exactly two and idempotently reuses both', async () => {
  const m=new TopologyModel(), c=grant(m,seed(m,'owner'));
  let created=0;
  const spawn=async()=>{created++;return {stop:async()=>{}}};
  const a=await m.ensureChildren(c,{type:'Worker',purpose:'parse',count:2},spawn);
  const b=await m.ensureChildren(c,{type:'Worker',purpose:'parse',count:2},spawn);
  assert.equal(created,2);
  assert.equal(m.count,3);
  assert.equal(new Set(a).size,2);
  assert.deepEqual(b,a);
  assert.deepEqual(children(m,c),a);
});

test('failed second factory rolls back first with no partial publication', async () => {
  const m=new TopologyModel(), c=grant(m,seed(m,'owner'));
  let calls=0,stops=0;
  await assert.rejects(()=>m.ensureChildren(c,{type:'Worker',purpose:'parse',count:2},async()=>{
    if(++calls===2) throw new Error('factory failed');
    return {stop:async()=>{stops++}};
  }),/factory failed/);
  assert.equal(stops,1);
  assert.equal(children(m,c).length,0);
  assert.equal(m.count,1);
  assert.equal((await m.ensureChildren(c,{type:'Worker',purpose:'parse',count:2},factory)).length,2);
});

test('overlapping batch cannot publish duplicate children', async () => {
  const m=new TopologyModel(), c=grant(m,seed(m,'owner'));
  let release,started;
  const entered=new Promise(r=>{started=r});
  const blocked=new Promise(r=>{release=r});
  const first=m.ensureChildren(c,{type:'Worker',purpose:'parse',count:2},async()=>{
    started(); await blocked; return {stop:async()=>{}};
  });
  await entered;
  await assert.rejects(()=>m.ensureChildren(c,{type:'Worker',purpose:'parse',count:2},factory),/BUSY/);
  release();
  await first;
  assert.equal(children(m,c).length,2);
});

test('revoked grant during factory awaits retirement before retry', async () => {
  const m=new TopologyModel(), owner=seed(m,'owner'), c=grant(m,owner);
  let started, release, stopped=0;
  const entered=new Promise(r=>{started=r});
  const gate=new Promise(r=>{release=r});
  const task=m.ensureChildren(c,{type:'Worker',purpose:'parse',count:1},async()=>{
    started();await gate;return {stop:async()=>{stopped++}};
  });
  await entered;
  m.revoke(c); release();
  await assert.rejects(task,/DENIED/);
  assert.equal(stopped,1);
  assert.equal(m.count,1);
});

test('count shrink fails instead of claiming false exact cardinality', async () => {
  const m=new TopologyModel(), c=grant(m,seed(m,'owner'));
  await m.ensureChildren(c,{type:'Worker',purpose:'parse',count:3},factory);
  await assert.rejects(()=>m.ensureChildren(c,{type:'Worker',purpose:'parse',count:2},factory),/COUNT_CONFLICT/);
  assert.equal(children(m,c).length,3);
});

test('in-flight creation consumes the same bounded actor budget', async () => {
  const m=new TopologyModel({maxActors:3}), a=grant(m,seed(m,'a')), b=grant(m,seed(m,'b'));
  let release,started;
  const entered=new Promise(r=>{started=r});
  const hold=new Promise(r=>{release=r});
  const pending=m.ensureChildren(a,{type:'Worker',purpose:'parse',count:1},async()=>{
    started();await hold;return {stop:async()=>{}};
  });
  await entered;
  await assert.rejects(()=>m.ensureChildren(b,{type:'Worker',purpose:'parse',count:1},factory),/QUOTA/);
  release(); await pending;
  assert.equal(m.count,3);
});

test('find_or_create neighbor uses stable key, enforces permission and retries after failure', async () => {
  const m=new TopologyModel(), owner=seed(m,'owner'), c=grant(m,owner);
  let made=0;
  const arg={type:'Sink',purpose:'sink',key:'aggregate'};
  const first=await m.findOrCreateNeighbor(c,arg,async()=>{made++;return {stop:async()=>{}}});
  const next=await m.findOrCreateNeighbor(c,arg,async()=>{throw new Error('duplicate')});
  assert.equal(first,next);
  assert.equal(made,1);
  assert.equal(m.find(c,arg),first);
  let stopped=0;
  await assert.rejects(()=>m.findOrCreateNeighbor(c,{...arg,key:'fail'},async()=>({
    stop:async()=>{stopped++}
  })).then(()=>{throw new Error('not expected')}),/not expected/);
  assert.equal(stopped,0); // Once published, a later consumer failure is not registry rollback.
  assert.equal(m.count,3);
});

test('typed graph edges require source ownership, same tenant, fresh revision and DAG', () => {
  const m=new TopologyModel();
  const a=seed(m,'a',{input:'int',output:'int'});
  const b=seed(m,'b',{type:'Sink',purpose:'sink',input:'int',output:'int'});
  const c=seed(m,'c',{input:'int',output:'int'});
  const d=m.seed({tenant:'tenant-b',graph:'g1',type:'Sink',purpose:'sink',key:'d',input:'int'});
  const ca=grant(m,a), cb=grant(m,b);
  assert.throws(()=>m.connect(ca,a,d,{payload:'int',expectedRevision:0}),/DENIED/);
  assert.throws(()=>m.connect(ca,a,b,{payload:'string',expectedRevision:0}),/TYPE/);
  assert.equal(m.connect(ca,a,b,{payload:'int',expectedRevision:0}),1);
  assert.deepEqual(m.upstream(cb,b),[a]);
  assert.throws(()=>m.connect(ca,a,c,{payload:'int',expectedRevision:0}),/STALE_GRAPH/);
  assert.throws(()=>m.connect(ca,a,b,{payload:'int',expectedRevision:1}),/DUPLICATE/);
  m.connect(cb,b,c,{payload:'int',expectedRevision:1});
  const cc=grant(m,c);
  assert.throws(()=>m.connect(cc,c,a,{payload:'int',expectedRevision:2}),/CYCLE/);
  assert.equal(m.revision,2);
});

test('retiring owner revokes grants, descendants, and old inbound edges', async () => {
  const m=new TopologyModel(), owner=seed(m,'owner',{input:'int',output:'int'});
  const c=grant(m,owner);
  const [child]=await m.ensureChildren(c,{type:'Worker',purpose:'parse',count:1},factory);
  assert.equal(m.count,2);
  assert.equal(m.retire(owner),true);
  assert.equal(m.count,0);
  assert.equal(m.retire(child),false);
  assert.throws(()=>m.find(c,{type:'Worker',purpose:'parse',key:'x'}),/DENIED/);
});

test('telemetry sidecar queue is bounded and lossy, scoped by tenant', () => {
  const m=new TopologyModel(), owner=seed(m,'owner'), c=grant(m,owner);
  const sub=m.observe(c,{capacity:2});
  for(let i=0;i<7;i++) m.emitObservation({
    tenant:'tenant-a',graph:'g1',kind:'span.ended',actorGeneration:1
  });
  m.emitObservation({tenant:'tenant-b',graph:'g1',kind:'secret',actorGeneration:1});
  assert.equal(sub.loss(),5);
  assert.equal(sub.read().kind,'span.ended');
  assert.equal(sub.read().kind,'span.ended');
  assert.equal(sub.read(),null);
  sub.close();
  m.emitObservation({tenant:'tenant-a',graph:'g1',kind:'more',actorGeneration:1});
  assert.equal(sub.read(),null);
});
