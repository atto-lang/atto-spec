// HOST-ONLY quiescence model. Not an Atto runtime/compiled guest implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
const tick=()=>new Promise(r=>setImmediate(r));

class Barrier {
  constructor() {
    this.pending=new Set();this.next=0;
    this.acked=0;this.released=0;this.cleanup=0;
    this.eof=false;this.primary=null;this.final=null;
    this.suppressed=[];this.control=[];this.wakers=[];this.observers=[];
    this.done=new Promise(resolve=>this.resolve=resolve);
  }
  start_write() {
    if(this.eof || this.primary) throw Error('E_PIPE_FENCED');
    const id=++this.next;this.pending.add(id);return id;
  }
  ack(id) { this.finish_write(id);this.acked++;this.maybe_finish(); }
  release(id) { this.finish_write(id);this.released++;this.maybe_finish(); }
  finish_write(id) {
    if(!this.pending.delete(id)) throw Error('E_PIPE_DOUBLE_RELEASE');
  }
  begin_cleanup(){this.cleanup++;}
  end_cleanup(error=null){
    if(!this.cleanup)throw Error('E_PIPE_CLEANUP_UNBALANCED');
    this.cleanup--;if(error)this.suppressed.push(error);
    this.maybe_finish();
  }
  on(event,cb){this.observers.push({event,cb,delivered:false});if(this.final)this.flush();}
  on_cancel_wake(cb){this.wakers.push(cb);}
  request_eof(){this.eof=true;this.maybe_finish();}
  stop(kind,error) {
    if(this.final || this.primary)return false;
    this.primary={kind,error};
    for(const cb of this.wakers)queueMicrotask(cb);
    this.maybe_finish();return true;
  }
  panic(control){this.control.push({...control});this.stop('#error',{kind:'StagePanic',actor_id:control.actor_id});}
  maybe_finish(){
    if(this.final || this.cleanup || this.pending.size)return;
    const cause=this.primary || (this.eof ? {kind:'#complete',error:null} : null);
    if(!cause)return;
    const stats=Object.freeze({admitted_items:this.acked,released_items:this.released});
    this.final=Object.freeze({event:cause.kind,
      outcome:cause.kind==='#complete' ? Object.freeze({kind:'Ok',stats})
        :Object.freeze({kind:'Err',error:Object.freeze({...cause.error,...stats})})});
    this.resolve(this.final.outcome);
    this.flush();
  }
  flush(){queueMicrotask(()=>{
    const order=[...this.observers].sort((a,b)=>Number(a.event==='#settled')-Number(b.event==='#settled'));
    for(const o of order){
      if(o.delivered || (o.event!==this.final.event&&o.event!=='#settled'))continue;
      o.delivered=true;
      try{o.cb(o.event==='#settled'?this.final.outcome:this.final.outcome.kind==='Ok'?this.final.outcome.stats:this.final.outcome.error);}
      catch(e){this.suppressed.push(e);}
    }
  });}
  get_done(){return this.done;}
}

test('cancel request cannot complete before pending ack and physical teardown',async()=>{
  const b=new Barrier(),id=b.start_write();b.begin_cleanup();
  let done=false;b.get_done().then(()=>done=true);
  assert.equal(b.stop('#cancel',{kind:'Cancelled'}),true);
  await tick();assert.equal(done,false);
  b.ack(id);await tick();assert.equal(done,false);
  b.end_cleanup();assert.equal((await b.get_done()).error.admitted_items,1);
  assert.equal(done,true);assert.equal(b.final.event,'#cancel');
});
test('EOF request waits for admitted items, stage failure during drain wins',async()=>{
  const b=new Barrier(),id=b.start_write();b.request_eof();
  assert.equal(b.final,null);
  assert.equal(b.stop('#error',{kind:'WriteError'}),true);
  b.release(id);assert.equal((await b.get_done()).error.kind,'WriteError');
  assert.equal(b.final.event,'#error');
});
test('normal EOF waits for writes and graph-owned cleanup',async()=>{
  const b=new Barrier(),first=b.start_write(),second=b.start_write();
  b.begin_cleanup();b.request_eof();assert.equal(b.final,null);
  b.ack(first);b.ack(second);assert.equal(b.final,null);
  b.end_cleanup();const result=await b.get_done();
  assert.deepEqual(result,{kind:'Ok',stats:{admitted_items:2,released_items:0}});
});
test('cancellation wakes blocked sender and releases uncommitted token once',async()=>{
  const b=new Barrier(),id=b.start_write();
  b.on_cancel_wake(()=>b.release(id));b.stop('#cancel',{kind:'Cancelled'});
  const result=await b.get_done();
  assert.equal(result.error.admitted_items,0);assert.equal(result.error.released_items,1);
  assert.equal(b.pending.size,0);
  assert.throws(()=>b.release(id),/E_PIPE_DOUBLE_RELEASE/);
});
test('cleanup errors are suppressed and cannot replace the first cause',async()=>{
  const b=new Barrier();b.begin_cleanup();b.stop('#error',{kind:'ReadError'});
  b.end_cleanup(Error('close failed'));
  assert.equal((await b.get_done()).error.kind,'ReadError');
  assert.equal(b.suppressed.length,1);
});
test('observers registered while stopping only run after quiescence',async()=>{
  const b=new Barrier(),id=b.start_write(),calls=[];
  b.stop('#error',{kind:'StageFailure'});
  b.on('#settled',()=>calls.push('settled'));
  b.on('#error',()=>calls.push('error'));
  await tick();assert.deepEqual(calls,[]);
  b.release(id);await b.get_done();await tick();
  assert.deepEqual(calls,['error','settled']);
});
test('actor panic CONTROL remains independent even if cancellation won',async()=>{
  const b=new Barrier(),id=b.start_write();
  b.stop('#cancel',{kind:'Cancelled'});
  b.panic({actor_id:7,generation:4});
  b.release(id);await b.get_done();
  assert.deepEqual(b.control,[{actor_id:7,generation:4}]);
  assert.equal(b.final.event,'#cancel');
});
test('seeded cancellation/ack/EOF/failure races never leak or duplicate tokens',async()=>{
  let seed=0x1a2b3c4d;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let run=0;run<300;run++){
    const b=new Barrier(),ids=[];
    for(let i=0;i<4;i++)ids.push(b.start_write());
    if(random()%2)b.request_eof();
    for(const id of ids){
      const op=random()%5;
      if(op===0)b.stop('#cancel',{kind:'Cancelled'});
      if(op===1)b.stop('#error',{kind:'WriteError'});
      if(random()%2)b.ack(id);else b.release(id);
    }
    if(!b.primary&&!b.eof)b.request_eof();
    const outcome=await b.get_done();
    assert.equal(b.pending.size,0);
    assert.equal(b.acked+b.released,4);
    assert.equal(outcome.kind,b.final.event==='#complete'?'Ok':'Err');
  }
});
