import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const c=JSON.parse(readFileSync(new URL("../contracts/actor-pubsub-v1/contract.json",import.meta.url),"utf8"));

// SOURCE-FREE invariants only. This suite is deliberately not a compiler/actor guest.
class Broker {
  constructor(){this.actors=new Map();this.groups=new Map();this.grants=new Set();this.topics=new Map();this.subs=[];}
  actor(name,generation=1){const a={name,generation,alive:true};this.actors.set(name,a);return a;}
  group(name){const g={name,alive:true,members:new Set()};this.groups.set(name,g);return g;}
  join(g,a){
    if(!g.alive||!a.alive) return {error:"StaleTarget"};
    if(g.members.has(a)) return {alreadyMember:true};
    const cap={g,a,active:true};this.grants.add(cap);g.members.add(a);return {cap};
  }
  leave(cap){
    if(!this.grants.has(cap)||!cap.active) return {error:"StaleMembership"};
    cap.active=false;cap.g.members.delete(cap.a);
    for(const s of this.subs) if(!s.closed&&s.topic.g===cap.g) {
      if(s.kind==="actor"&&s.target===cap.a)this.unsubscribe(s);
      else if(s.kind==="group"&&s.target===cap.g)s.queues.delete(cap.a);
    }
    return {ok:true};
  }
  topic(g,name){const t={g,name,seq:0};this.topics.set(g.name+":"+name,t);return t;}
  subscribe(t,kind,target,capacity){
    if(!t.g.alive||(!target.alive&&kind==="actor"))return {error:"StaleTarget"};
    if(kind==="group"?target!==t.g:!t.g.members.has(target))return {error:"UnauthorizedSubscriber"};
    const old=this.subs.find(s=>!s.closed&&s.topic===t&&s.kind===kind&&s.target===target);
    if(old)return old.capacity===capacity?{sub:old,alreadySubscribed:true}:{error:"SubscriptionConflict"};
    if(!Number.isInteger(capacity)||capacity<1)return {error:"InvalidCapacity"};
    const sub={topic:t,kind,target,capacity,closed:false,queues:new Map(),inflight:new Map()};
    this.subs.push(sub);return {sub};
  }
  publish(t,cap,payload,shared=true){
    if(!t.g.alive)return {error:"StaleGroup"};
    if(!this.grants.has(cap)||!cap.active||cap.g!==t.g||!cap.a.alive||!t.g.members.has(cap.a))
      return {error:"UnauthorizedPublisher"};
    if(!shared)return {error:"NotShared"};
    const all=[];
    for(const sub of this.subs)if(!sub.closed&&sub.topic===t){
      const members=sub.kind==="actor"?[sub.target]:[...sub.target.members];
      for(const a of members)if(a.alive&&t.g.members.has(a)){
        const used=(sub.queues.get(a)?.length??0)+(sub.inflight.get(a)??0);
        if(used>=sub.capacity)return {error:"Full"};
        all.push([sub,a]);
      }
    }
    t.seq++;
    for(const [sub,a] of all){
      if(!sub.queues.has(a))sub.queues.set(a,[]);
      sub.queues.get(a).push({seq:t.seq,payload});
    }
    return {sequence:t.seq,recipients:all.length};
  }
  begin(s,a){
    if(s.closed)return {error:"Closed"};
    if(!a.alive||!s.topic.g.members.has(a))return {error:"StaleTarget"};
    const q=s.queues.get(a);if(!q?.length)return {error:"Empty"};
    s.inflight.set(a,(s.inflight.get(a)??0)+1);return q.shift();
  }
  finish(s,a){
    const n=s.inflight.get(a)??0;if(!n)return {error:"NoInFlight"};
    if(n===1)s.inflight.delete(a);else s.inflight.set(a,n-1);
    return {ok:true};
  }
  unsubscribe(s){s.closed=true;s.queues.clear();return {ok:true};}
  done(s){return s.closed&&[...s.inflight.values()].every(n=>n===0);}
  stop(a){
    a.alive=false;
    for(const cap of this.grants)if(cap.active&&cap.a===a)this.leave(cap);
    for(const sub of this.subs){
      sub.queues.delete(a);
      if(sub.kind==="actor"&&sub.target===a)this.unsubscribe(sub);
    }
  }
}
function setup(){
  const b=new Broker(),a=b.actor("a"),g=b.group("g"),cap=b.join(g,a).cap,t=b.topic(g,"events");
  return {b,a,g,cap,t};
}
test("contract identity and evidence cannot masquerade as backend execution",()=>{
  assert.equal(c.schema,"atto.actor_pubsub.v1");
  assert.equal(c.status,"TARGET_NOT_BACKEND_VERIFIED");
  assert.equal(c.evidence,"SOURCE_FREE_MODEL_ONLY_NOT_GUEST_EXECUTION");
  assert.equal(c.core_policy,"RELIABLE");
  assert.deepEqual(c.optional_extensions,["LOSSY","LATEST","PG_MONITOR_REVISIONS"]);
  assert.deepEqual(Object.keys(c.backend_evidence),c.targets);
  for(const value of Object.values(c.backend_evidence))assert.equal(value,"NOT_VERIFIED");
  assert.deepEqual(c.cases.map(x=>x.id),
    Array.from({length:12},(_,i)=>"AP"+String(i+1).padStart(3,"0")));
  assert.equal(new Set(c.cases.map(x=>x.invariant)).size,12);
});
test("AP001 membership alone never subscribes",()=>{
  const {b,cap,t}=setup();assert.deepEqual(b.publish(t,cap,"a"),{sequence:1,recipients:0});
});
test("AP002 atomic RELIABLE reservation: one full recipient prevents every enqueue and sequence",()=>{
  const {b,a,g,cap,t}=setup(),other=b.actor("b");
  b.join(g,other);
  const sa=b.subscribe(t,"actor",a,1).sub,sb=b.subscribe(t,"actor",other,1).sub;
  assert.equal(b.publish(t,cap,"first").recipients,2);
  assert.equal(b.begin(sa,a).seq,1);
  assert.equal(b.finish(sa,a).ok,true);
  assert.equal(b.publish(t,cap,"refused").error,"Full");
  assert.equal(t.seq,1);
  assert.equal(b.begin(sa,a).error,"Empty");
  assert.equal(b.begin(sb,other).payload,"first");
  b.finish(sb,other);
  assert.deepEqual(b.publish(t,cap,"retry"),{sequence:2,recipients:2});
});
test("AP003/AP004 publisher grant and direct subscriber authorization",()=>{
  const {b,a,g,cap,t}=setup(),other=b.actor("b"),h=b.group("h");
  const foreign=b.join(h,a).cap;
  assert.equal(b.publish(t,foreign,"x").error,"UnauthorizedPublisher");
  assert.equal(b.publish(t,{...cap},"x").error,"UnauthorizedPublisher");
  assert.equal(b.subscribe(t,"actor",other,1).error,"UnauthorizedSubscriber");
  assert.equal(t.seq,0);
});
test("AP005 overlap and independent group-topic identities",()=>{
  const {b,a,g,cap,t}=setup(),h=b.group("h"),other=b.join(h,a).cap;
  const ht=b.topic(h,"events");
  const gs=b.subscribe(t,"group",g,1).sub,hs=b.subscribe(ht,"group",h,1).sub;
  assert.deepEqual(b.publish(t,cap,"g"),{sequence:1,recipients:1});
  assert.deepEqual(b.publish(ht,other,"h"),{sequence:1,recipients:1});
  assert.equal(b.begin(gs,a).payload,"g");
  assert.equal(b.begin(hs,a).payload,"h");
});
test("AP006/AP007 unsubscribe cancels queued events, but never in-flight completion",()=>{
  const {b,a,g,cap,t}=setup(),s=b.subscribe(t,"group",g,2).sub;
  b.publish(t,cap,"active");
  assert.equal(b.begin(s,a).payload,"active");
  b.publish(t,cap,"pending");
  b.unsubscribe(s);
  assert.equal(b.done(s),false);
  assert.equal(b.begin(s,a).error,"Closed");
  assert.equal(b.finish(s,a).ok,true);
  assert.equal(b.done(s),true);
  assert.deepEqual(b.publish(t,cap,"after"),{sequence:3,recipients:0});
});
test("AP008 stale grants cannot regain publication after leave/rejoin",()=>{
  const {b,a,g,cap,t}=setup();
  assert.equal(b.leave(cap).ok,true);
  const next=b.join(g,a).cap;
  assert.notEqual(next,cap);
  assert.equal(b.publish(t,cap,"no").error,"UnauthorizedPublisher");
  assert.equal(b.publish(t,next,"yes").sequence,1);
});
test("AP009 stopped incarnation cannot resurrect memberships or edges",()=>{
  const {b,a,g,cap,t}=setup(),s=b.subscribe(t,"actor",a,1).sub;
  b.stop(a);
  const next=b.actor("a",2);
  assert.equal(b.publish(t,cap,"no").error,"UnauthorizedPublisher");
  assert.equal(b.begin(s,a).error,"Closed");
  const newCap=b.join(g,next).cap;
  const newSub=b.subscribe(t,"actor",next,1).sub;
  assert.deepEqual(b.publish(t,newCap,"yes"),{sequence:1,recipients:1});
  assert.equal(b.begin(newSub,next).payload,"yes");
});
test("AP010 non-shared payload does not burn sequence or capacity",()=>{
  const {b,a,g,cap,t}=setup(),s=b.subscribe(t,"group",g,1).sub;
  assert.equal(b.publish(t,cap,{},false).error,"NotShared");
  assert.equal(t.seq,0);
  assert.equal(b.publish(t,cap,"safe").sequence,1);
  assert.equal(b.begin(s,a).payload,"safe");
});
test("AP011 duplicate subscribe does not duplicate edges or alter capacity",()=>{
  const {b,a,g,cap,t}=setup(),s=b.subscribe(t,"actor",a,1).sub;
  assert.equal(b.subscribe(t,"actor",a,1).sub,s);
  assert.equal(b.subscribe(t,"actor",a,2).error,"SubscriptionConflict");
  assert.equal(b.publish(t,cap,"x").recipients,1);
});
test("AP012 leave in group g leaves an independent group's subscription intact",()=>{
  const {b,a,g,cap,t}=setup(),h=b.group("h"),other=b.join(h,a).cap;
  const ht=b.topic(h,"events"),gs=b.subscribe(t,"group",g,1).sub,hs=b.subscribe(ht,"group",h,1).sub;
  b.publish(t,cap,"g");b.publish(ht,other,"h");
  b.leave(cap);
  assert.equal(b.begin(gs,a).error,"StaleTarget");
  assert.equal(b.begin(hs,a).payload,"h");
  assert.deepEqual(b.publish(ht,other,"h2"),{error:"Full"});
});
