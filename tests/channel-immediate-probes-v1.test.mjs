import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync(new URL('../contracts/channel-immediate-probes-v1.json',import.meta.url),'utf8'));
class Channel {
 constructor(capacity){this.capacity=capacity;this.queue=[];this.closed=false;this.reader=null;this.waiters=0;}
 close(){this.closed=true;}
 probe(owner){
  assert.equal(owner.live,true,'must hold one live owner');owner.live=false;
  const payload=owner.payload;
  if(this.closed)return {tag:'Closed',owner:{live:true,payload}};
  if(this.reader){const r=this.reader;this.reader=null;r(payload);return {tag:'Accepted'};}
  if(this.queue.length===this.capacity)return {tag:'Full',owner:{live:true,payload}};
  this.queue.push(payload);return {tag:'Accepted'};
 }
}
const owned=payload=>({live:true,payload});
test('registry keeps real guest execution pending',()=>{
 assert.equal(c.cases.length,18);assert.equal(new Set(c.cases.map(x=>x.id)).size,18);
 assert.ok(c.cases.every(x=>x.verification_status==='NOT_EXECUTED'));
 assert.deepEqual(c.write_result.variants,['Accepted','Full(T)','Closed(T)']);
 assert.equal(c.acceptance.host_only_tests_certify_parity,false);
});
test('bounded admission and retry preserve identity, never double own',()=>{
 const ch=new Channel(1), first=owned({id:1}),payload={id:2},second=owned(payload);
 assert.equal(ch.probe(first).tag,'Accepted');assert.equal(first.live,false);
 const full=ch.probe(second);assert.equal(full.tag,'Full');assert.equal(second.live,false);assert.equal(full.owner.payload,payload);
 assert.equal(ch.waiters,0);assert.equal(ch.queue.length,1);ch.queue.shift();
 assert.equal(ch.probe(full.owner).tag,'Accepted');assert.equal(full.owner.live,false);
 assert.equal(ch.queue[0],payload);assert.throws(()=>ch.probe(second));
});
test('rendezvous and close-before/after-admission are distinct',()=>{
 const ch=new Channel(0),p={id:3},first=ch.probe(owned(p));assert.equal(first.tag,'Full');
 let delivered;ch.reader=x=>{delivered=x};assert.equal(ch.probe(first.owner).tag,'Accepted');assert.equal(delivered,p);
 ch.close();const q={id:4},closed=ch.probe(owned(q));assert.equal(closed.tag,'Closed');assert.equal(closed.owner.payload,q);assert.equal(ch.waiters,0);
 const buffered=new Channel(1);assert.equal(buffered.probe(owned(p)).tag,'Accepted');buffered.close();assert.equal(buffered.queue[0],p);
});
