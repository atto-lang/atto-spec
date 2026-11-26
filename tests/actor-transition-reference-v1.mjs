// Host-only logical reference tests. No parser, scheduler, persistence, authenticated receipt or resource proof.
// Run: node tests/actor-transition-reference-v1.mjs
function run(){
  "use strict";
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
  const eq=(a,b,msg)=>assert(JSON.stringify(a)===JSON.stringify(b),msg);
  const init=()=>({node:"Idle",balance:2,version:0,epoch:1,schema:1,obligations:[]});
  const transition=(s,{epoch=s.epoch,to=s.node,delta=0,guard=true,failAt="",max=Number.MAX_SAFE_INTEGER}={})=>{
    if(epoch!==s.epoch||!guard||s.version>=max||s.epoch>=max||!["Idle","Busy","Done"].includes(to)||s.node==="Done")return {state:s,committed:false,hooks:[]};
    const hooks=[];const next={...s,node:to,balance:s.balance+delta,version:s.version+1,epoch:s.epoch+1};
    for(const phase of ["exit","body","enter"]){hooks.push(phase);if(failAt===phase)return {state:s,committed:false,hooks};}
    if(!Number.isSafeInteger(next.balance)||next.balance<0)return {state:s,committed:false,hooks};
    return {state:next,committed:true,hooks};
  };
  const ledger=(plan=["a","b","c"],limit=3)=>({plan:[...plan],limit,completed:[],pending:null,compensated:[],failed:false,attempt:0});
  const start=(l,step)=>{
    if(l.pending||l.failed||l.plan[l.completed.length]!==step||l.attempt>=l.limit)return false;
    l.pending={step,key:"forward:"+step,kind:"forward",unknown:false};l.attempt++;return true;
  };
  const apply=(l,outcome)=>{
    if(!l.pending||!["ok","failure","transient","unknown"].includes(outcome))return false;
    const p=l.pending;
    if(outcome==="unknown"){p.unknown=true;return true;}
    if(p.kind==="forward"){
      if(outcome==="ok"){l.completed.push(p.step);l.attempt=0;}
      else if(outcome==="failure"||l.attempt>=l.limit){l.failed=true;}
    }else if(outcome==="ok"){l.compensated.push(p.step);}
    l.pending=null;return true;
  };
  const settle=(l,outcome)=>!!l.pending&&!l.pending.unknown&&apply(l,outcome);
  const reconcile=(l,outcome)=>!!l.pending?.unknown&&outcome!=="unknown"&&apply(l,outcome);
  const compensate=(l,outcome)=>{
    if(!l.failed||l.pending||!["ok","failure","transient","unknown"].includes(outcome))return false;
    const step=l.completed[l.completed.length-1-l.compensated.length];
    if(step===undefined)return false;
    l.pending={step,key:"compensate:"+step,kind:"compensate",unknown:false};
    return settle(l,outcome);
  };
  const migrate=(s,to,map)=>{
    if(to!==s.schema+1||!Object.prototype.hasOwnProperty.call(map,s.node)||!["Idle","Busy","Done"].includes(map[s.node])||s.epoch>=Number.MAX_SAFE_INTEGER)return s;
    return {...s,schema:to,node:map[s.node],epoch:s.epoch+1,obligations:[...s.obligations]};
  };
  const tests=[
    ["SM07 atomic logical commit",()=>{const s=init(),r=transition(s,{to:"Busy",delta:3});eq(r.state,{...s,node:"Busy",balance:5,version:1,epoch:2},"commit");eq(s,init(),"original");}],
    ["SM08/17 rollback at each hook",()=>{for(const failAt of ["exit","body","enter"]){const s=init(),r=transition(s,{to:"Busy",delta:3,failAt});assert(r.state===s&&!r.committed,failAt);}}],
    ["SM10 stale completion",()=>{const s=transition(init(),{to:"Busy"}).state;assert(!transition(s,{epoch:1}).committed,"stale");}],
    ["SM11 bound exhaustion",()=>{const s=init();assert(!transition(s,{max:1}).committed,"exhaustion");}],
    ["SM16 exit/body/enter order",()=>eq(transition(init(),{to:"Busy"}).hooks,["exit","body","enter"],"order")],
    ["SM16 guard rejection",()=>eq(transition(init(),{guard:false}).hooks,[],"guard")],
    ["SM16 external self transition",()=>{const r=transition(init());assert(r.committed&&r.state.epoch===2,"generation");}],
    ["SM18 false invariant",()=>{const s=init(),r=transition(s,{delta:-3});assert(r.state===s&&!r.committed,"invariant");}],
    ["SM12 undo advances version",()=>{const s=transition(init(),{delta:1}).state,r=transition(s,{delta:-1});assert(r.state.version===2&&r.state.balance===2,"undo");}],
    ["SM21 reverse compensation",()=>{const l=ledger();for(const step of ["a","b"]){assert(start(l,step)&&settle(l,"ok"),step);}start(l,"c");settle(l,"failure");assert(compensate(l,"ok")&&compensate(l,"ok"),"compensate");eq(l.compensated,["b","a"],"reverse");assert(!compensate(l,"ok"),"empty");}],
    ["SM22 unknown forward fences progression",()=>{const l=ledger();start(l,"a");settle(l,"unknown");assert(!start(l,"b")&&!compensate(l,"ok")&&!settle(l,"failure"),"unknown");assert(reconcile(l,"ok")&&start(l,"b"),"reconciled");}],
    ["SM22 unknown compensation reconciles without advancing forward",()=>{const l=ledger();start(l,"a");settle(l,"ok");start(l,"b");settle(l,"failure");compensate(l,"unknown");assert(!compensate(l,"ok")&&!settle(l,"ok"),"blocked");assert(reconcile(l,"ok"),"reconcile");eq(l.completed,["a"],"no duplicate forward");eq(l.compensated,["a"],"compensated");}],
    ["SM22 failed compensation retains obligation",()=>{const l=ledger();start(l,"a");settle(l,"ok");start(l,"b");settle(l,"failure");compensate(l,"failure");eq(l.compensated,[],"still owed");assert(compensate(l,"ok"),"retry");}],
    ["SM23 bounded retry stable key",()=>{const l=ledger();for(let i=0;i<3;i++){assert(start(l,"a"),"attempt");eq(l.pending.key,"forward:a","key");settle(l,"transient");assert(!start(l,"b"),"cannot skip step");}assert(!start(l,"a")&&l.failed,"attempt cap");}],
    ["SM26 migration preserves obligations",()=>{const s={...init(),obligations:["receipt-a"]},n=migrate(s,2,{Idle:"Busy"});eq(n.obligations,s.obligations,"obligations");assert(n.schema===2&&n.node==="Busy"&&n.epoch===2,"migration");}],
    ["SM27 rejected migration unchanged",()=>{const s=init();assert(migrate(s,2,{})===s&&migrate(s,3,{Idle:"Busy"})===s,"reject");}],
    ["SM27 old activation after migration",()=>{const s=migrate(init(),2,{Idle:"Busy"});assert(!transition(s,{epoch:1}).committed,"old activation");}],
    ["SM terminal state refuses transitions",()=>assert(!transition(transition(init(),{to:"Done"}).state,{to:"Idle"}).committed,"terminal")]
  ];
  for(const [name,test] of tests){try{test();}catch(e){throw new Error(name+": "+e.message);}}
  return tests.map(([name])=>name);
}
const passed = run();
for (const name of passed) console.log('PASS '+name);
console.log(`${passed.length}/${passed.length} host-reference cases passed`);
