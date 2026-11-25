// Abstract deterministic oracle for the Awaitable RFC; not a scheduler implementation.
function suite(report) {
  const assert = (ok, msg) => { if (!ok) throw Error(msg); };
  class Operation {
    constructor(generation) { this.generation=generation; this.phase="created"; this.queued=false; this.parked=false; this.registered=false; this.retired=false; this.delivered=false; this.polls=0; }
    active() { return ["created","polling","pending"].includes(this.phase); }
    wake(generation) { if (!this.active() || generation!==this.generation) return false; this.queued=true; this.parked=false; return true; }
    poll() { if (!(this.phase==="created" || (this.phase==="pending" && this.queued))) return false; this.phase="polling"; this.queued=false; this.parked=false; this.polls++; return true; }
    register() { if (this.phase!=="polling") return false; this.registered=true; return true; }
    pending() { if (this.phase!=="polling" || !(this.registered || this.queued)) return false; this.phase="pending"; return true; }
    park() { if (this.phase!=="pending" || this.queued) return false; this.parked=true; return true; }
    ready(value) { if (this.phase!=="polling") return false; this.phase="completed"; this.value=value; this.queued=false; return true; }
    cancel() { if (!this.active()) return false; this.phase="cancelled"; this.queued=false; this.parked=false; return true; }
    take() { if (this.phase!=="completed" || this.delivered) return {ok:false}; this.delivered=true; return {ok:true,value:this.value}; }
    retire() { if (this.active() || this.retired) return false; this.retired=true; this.registered=false; return true; }
  }
  const cases = [
    ["immediate ready and affine extraction",()=>{const o=new Operation(1); assert(o.poll()&&o.ready(42),"ready"); assert(o.take().value===42&&!o.take().ok,"single delivery"); assert(!o.park(),"ready cannot park");}],
    ["wake while polling is not lost",()=>{const o=new Operation(1); o.poll(); o.wake(1); assert(o.polls===1,"wake ran inline"); assert(o.pending()&&!o.park()&&o.poll(),"wake lost");}],
    ["wake between pending and park",()=>{const o=new Operation(1); o.poll(); o.register(); o.pending(); o.wake(1); assert(!o.park()&&o.poll(),"park despite wake");}],
    ["wake after park and duplicate coalescing",()=>{const o=new Operation(1); o.poll(); o.register(); o.pending(); assert(o.park(),"park"); o.wake(1); o.wake(1); assert(!o.parked&&o.poll()&&!o.poll(),"duplicate or concurrent poll");}],
    ["stale generation is rejected",()=>{const o=new Operation(2); o.poll(); o.register(); o.pending(); o.park(); assert(!o.wake(1)&&o.parked&&!o.poll(),"stale wake"); assert(o.wake(2)&&o.poll(),"live wake");}],
    ["pending without progress is rejected",()=>{const o=new Operation(1); o.poll(); assert(!o.pending(),"unregistered pending"); assert(o.cancel()&&o.retire(),"failed registration cleanup");}],
    ["cancel before ready fences late completion and retains registration",()=>{const o=new Operation(1); o.poll(); o.register(); assert(o.cancel()&&!o.ready(9)&&!o.take().ok&&!o.retired&&o.registered,"cancel outcome"); assert(!o.wake(1)&&o.retire()&&!o.retire()&&!o.registered,"retirement exactly once");}],
    ["ready before cancel preserves one result and physical retirement",()=>{const o=new Operation(1); o.poll(); o.register(); assert(o.ready(7)&&!o.cancel()&&!o.retired&&o.registered,"completed outcome"); assert(o.take().value===7&&o.retire()&&!o.retire(),"delivery and retirement");}],
    ["select observes without consuming a losing arm",()=>{const a=new Operation(1),b=new Operation(1); a.poll();b.poll();a.ready(10);b.ready(20); const observed=[a,b].filter(o=>o.phase==="completed");assert(observed.length===2&&!a.delivered&&!b.delivered,"destructive observation");assert(observed[0].take().value===10&&b.take().value===20,"loser was consumed");}]
  ];
  for(const [name,run] of cases){run();report("PASS "+name);}
  report(`${cases.length}/${cases.length} abstract contract scenarios passed; not compiler/guest evidence`);
}
suite(console.log);
