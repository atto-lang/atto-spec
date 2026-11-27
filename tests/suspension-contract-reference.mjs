// Host oracle, NOT compiler-backed guest or real concurrent execution.
const result = (function runContractOracle() {
  // Sequential host model only. Not a production scheduler or a compiler.
  let assertions=0;
  const check=(v,m)=>{assertions++;if(!v)throw new Error(m)};
  class Selection {
    constructor(generation=1){this.generation=generation;this.phase="pending";this.waiters=new Set([0,1]);this.queues=[[11],[22]];this.winner=null;this.ticket=null;this.cancelled=false;this.calls=0;this.value=null;}
    commit(i,g=this.generation){
      if(g!==this.generation||this.phase!=="pending"||!this.waiters.has(i)||!this.queues[i].length)return null;
      this.phase="committed";this.winner=i;this.waiters.clear();this.ticket=Object.freeze({g,i,payload:this.queues[i].shift()});return this.ticket;
    }
    cancel(){if(this.phase==="pending"){this.waiters.clear();this.phase="cancelled";return true}if(this.phase==="committed"&&!this.cancelled){this.cancelled=true;return true}return false}
    finish(ticket,lane,cleanupDone){
      if(this.phase!=="committed"||ticket!==this.ticket||lane!=="owner"||!cleanupDone)return false;
      this.calls++;this.phase=this.cancelled?"cancelled":"success";if(!this.cancelled)this.value=ticket.payload;return true;
    }
  }
  function permutations(a){if(!a.length)return [[]];return a.flatMap((x,i)=>permutations(a.filter((_,j)=>j!==i)).map(y=>[x,...y]))}
  let schedules=0;
  for(const order of permutations(["left","right","cancel","stale","finish","wrongLane","earlyCleanup"])){
    const s=new Selection(7);let t=null;
    for(const op of order){
      if(op==="left"||op==="right"){const x=s.commit(op==="left"?0:1);if(x)t=x;}
      if(op==="cancel")s.cancel();
      if(op==="stale")check(s.commit(0,6)===null,"stale generation committed");
      if(op==="finish")s.finish(t,"owner",true);
      if(op==="wrongLane")check(!s.finish(t,"reactor",true),"reactor callback ran guest");
      if(op==="earlyCleanup")check(!s.finish(t,"owner",false),"settled before cleanup");
      check(s.queues.flat().length===(s.winner===null?2:1),"double or phantom consumption");
      check(s.calls<=1,"duplicate arm completion");
      if(s.phase!=="pending")check(s.waiters.size===0,"leaked loser waiter");
    }
    if(s.phase==="committed")s.finish(t,"owner",true);
    check(!s.finish(t,"owner",true),"duplicate finish");
    if(s.winner===null){check(s.phase==="cancelled"&&s.queues.flat().length===2,"precommit cancel consumed");}
    else {check(s.queues[1-s.winner].length===1,"loser lost data");check(s.phase==="success"||s.phase==="cancelled","nonterminal result");}
    schedules++;
  }
  // Abstract payload descriptors, not actual Atto values. Unknown/cyclic graph fails closed.
  function admissible(root,actorBoundary){
    const active=new Set(),done=new Set();
    function visit(x){
      if(!x||typeof x!=="object")return false;
      if(active.has(x))return false;
      if(done.has(x))return true;
      active.add(x);
      let ok=false;
      if(x.kind==="data")ok=true;
      else if(x.kind==="callable")ok=!actorBoundary&&x.safe===true&&Array.isArray(x.captures)&&x.captures.every(visit);
      else if(x.kind==="box"||x.kind==="tuple"||x.kind==="record"||x.kind==="erased")ok=Array.isArray(x.children)&&x.children.every(visit);
      active.delete(x);if(ok)done.add(x);return ok;
    }return visit(root);
  }
  const d={kind:"data"},f={kind:"callable",safe:true,captures:[d]},bad={kind:"callable",safe:false,captures:[d]};
  const cyclic={kind:"box",children:[]};cyclic.children.push(cyclic);
  const cases=[[d,true,true],[f,true,false],[bad,false,false],[{kind:"erased",children:[{kind:"tuple",children:[d,f]}]},true,false],[{kind:"record",children:[d,d]},true,true],[{kind:"opaque"},false,false],[cyclic,false,false],[{kind:"callable",safe:true,captures:[bad]},false,false],[{kind:"box",children:[{kind:"callable",safe:true,captures:[]}]},true,false]];
  for(const [payload,local,actor] of cases){check(admissible(payload,false)===local,"local payload policy");check(admissible(payload,true)===actor,"actor payload policy");}
  return {schedules,assertions,payloadAssertions:cases.length*2,scope:"sequential host oracle only"};
})();
console.log(JSON.stringify(result));
