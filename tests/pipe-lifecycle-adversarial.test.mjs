// HOST-ONLY model: not Atto compiler, Wasm guest, or production I/O transport.
import test from 'node:test';
import assert from 'node:assert/strict';

const EVENTS = new Set(['#error', '#complete', '#cancel', '#settled']);
const tick = () => new Promise(resolve => setImmediate(resolve));
const frozen = value => Object.freeze(value);

class PipeLifecycleModel {
  constructor({max_observers = 128} = {}) {
    this.max_observers = max_observers;
    this.subs = [];
    this.outcome = null;
    this.observer_faults = [];
    this.supervisor_control = [];
    this.suppressed = [];
    this.pending_flush = false;
    this.done = new Promise(resolve => { this.resolve_done = resolve; });
  }
  on(event, cb) {
    if (!EVENTS.has(event)) throw Error('E_PIPE_OBSERVER_EVENT');
    if (typeof cb !== 'function') throw Error('E_PIPE_OBSERVER_CALLBACK');
    if (this.subs.length >= this.max_observers) throw Error('E_PIPE_OBSERVER_QUOTA');
    const sub = { event, cb, active: true, delivered: false };
    this.subs.push(sub);
    if (this.outcome) this.queue_flush();
    return { unsubscribe: () => { sub.active = false; } };
  }
  queue_flush() {
    if (this.pending_flush) return;
    this.pending_flush = true;
    queueMicrotask(() => {
      this.pending_flush = false;
      // Terminal-specific callbacks precede #settled, regardless of registration order.
      const ordered = [...this.subs].sort((a,b) =>
        Number(a.event === '#settled') - Number(b.event === '#settled'));
      for (const sub of ordered) {
        if (!sub.active || sub.delivered || !this.outcome) continue;
        if (sub.event !== '#settled' && sub.event !== this.outcome.event) continue;
        sub.delivered = true; // Mark first to make re-entrant registration safe.
        const value = sub.event === '#settled' ? this.outcome
          : sub.event === '#complete' ? this.outcome.stats : this.outcome.error;
        try { sub.cb(value); }
        catch (e) { this.observer_faults.push(e); }
      }
    });
  }
  settle(event, payload) {
    if (this.outcome) return false;
    if (!['#complete','#error','#cancel'].includes(event)) throw Error('E_PIPE_TERMINAL');
    if (event === '#complete') {
      this.outcome = frozen({status:'success', event, stats:frozen({...payload})});
      this.resolve_done(frozen({kind:'Ok', value:this.outcome.stats}));
    } else {
      this.outcome = frozen({status:event === '#cancel' ? 'cancelled':'failure',
        event, error:frozen({...payload})});
      this.resolve_done(frozen({kind:'Err', error:this.outcome.error}));
    }
    this.queue_flush();
    return true;
  }
  get_done() { return this.done; }
  suppress_diagnostic(e) { this.suppressed.push(e); }
  actor_panic(notice) {
    this.supervisor_control.push(frozen({...notice}));
    return this.settle('#error',{kind:'StagePanic',actor_id:notice.actor_id,
      generation:notice.generation,committed:notice.committed});
  }
}

const end = () => ({kind:'eof'});
const item = value => ({kind:'item',value});
function source_of(values,{fail_after=null}={}) {
  let index=0, closed=false;
  return {get closed(){return closed}, close(){closed=true}, async read(){
    if(fail_after===index) throw Error('read failure');
    if(index===values.length) return end();
    return item(values[index++]);
  }};
}
function sink_of({fail_after=null,partial_at=null,owned=false}={}) {
  const committed=[];let closed=false, writes=0;
  return {committed,get closed(){return closed},owned,close(){closed=true},async write(v){
    if(fail_after===writes) throw Error('write failure');
    if(partial_at===writes) {
      writes++;
      return {status:'indeterminate',committed_bytes:2,remaining:v.length-2};
    }
    writes++;committed.push(v);
    return {status:'committed'};
  }};
}
async function io_pipe_model(src,dst,handle=new PipeLifecycleModel()) {
  let committed_items=0, read_items=0;
  try {
    for (;;) {
      if (handle.outcome) break;
      const got=await src.read();
      if (handle.outcome) break;
      if (got.kind==='eof') {
        if (dst.owned) dst.close();
        handle.settle('#complete',{committed_items,read_items});
        break;
      }
      read_items++;
      const ack=await dst.write(got.value);
      if (handle.outcome) break;
      if (ack.status !== 'committed') {
        handle.settle('#error',{kind:'IndeterminateWrite',committed_items,
          read_items, committed_bytes:ack.committed_bytes, remaining:ack.remaining});
        break;
      }
      committed_items++;
    }
  } catch (e) {
    handle.settle('#error',{kind: e.message==='read failure' ? 'ReadError':'WriteError',
      committed_items,read_items,cause:e});
  }
  return await handle.get_done();
}

test('specific terminal event runs before #settled regardless of registration order',async()=>{
  const h=new PipeLifecycleModel(),order=[];
  h.on('#settled',out=>{order.push('settled');assert.equal(out.status,'failure');});
  h.on('#error',error=>{order.push('error');assert.equal(error.kind,'broken');});
  h.settle('#error',{kind:'broken'});await tick();assert.deepEqual(order,['error','settled']);
});
test('#settled carries a tagged PipeOutcome, never a bare PipeError',async()=>{
  const h=new PipeLifecycleModel(),seen=[];
  h.on('#settled',x=>seen.push(x));h.settle('#cancel',{kind:'Cancelled',committed_items:2});
  await tick();assert.deepEqual(seen,[{status:'cancelled',event:'#cancel',error:{kind:'Cancelled',committed_items:2}}]);
});
test('get_done is a shared pending promise that resolves once before observer callbacks',async()=>{
  const h=new PipeLifecycleModel(),calls=[];
  const p1=h.get_done(),p2=h.get_done();assert.equal(p1,p2);
  h.on('#error',()=>calls.push('observer'));
  h.settle('#error',{kind:'Failed'});
  const r=await p1;assert.equal(r.kind,'Err');
  await tick();assert.deepEqual(calls,['observer']);
  assert.equal(h.settle('#complete',{committed_items:20}),false);
  assert.deepEqual(await h.get_done(),r);
});
test('late #error and #settled replay separately exactly once',async()=>{
  const h=new PipeLifecycleModel(),seen=[];
  h.settle('#error',{kind:'WriteError'});
  h.on('#settled',()=>seen.push('settled'));h.on('#error',()=>seen.push('error'));
  assert.deepEqual(seen,[]);await tick();assert.deepEqual(seen,['error','settled']);
});
test('unsubscribe before flush cancels late and early delivery',async()=>{
  const h=new PipeLifecycleModel(),calls=[];
  const t=h.on('#error',()=>calls.push('early'));
  h.settle('#error',{kind:'fail'});t.unsubscribe();
  const late=h.on('#error',()=>calls.push('late'));late.unsubscribe();
  await tick();assert.deepEqual(calls,[]);
});
test('reentrant subscription does not duplicate original listener',async()=>{
  const h=new PipeLifecycleModel(),calls=[];
  h.on('#error',()=>{calls.push('old');h.on('#error',()=>calls.push('new'));});
  h.settle('#error',{kind:'fail'});await tick();assert.deepEqual(calls,['old','new']);
});
test('callbacks cannot mutate typed outcome or overwrite first error',async()=>{
  const h=new PipeLifecycleModel(),events=[];
  h.on('#settled',x=>{try{x.status='success'}catch{}events.push(x.status)});
  h.on('#error',e=>{try{e.kind='other'}catch{}events.push(e.kind)});
  assert.equal(h.settle('#error',{kind:'Primary',committed_items:3}),true);
  assert.equal(h.settle('#cancel',{kind:'Cancelled'}),false);
  await tick();assert.deepEqual(events,['Primary','failure']);
  assert.equal((await h.get_done()).error.kind,'Primary');
});
test('observer callback failure never breaks later listeners or changes get_done',async()=>{
  const h=new PipeLifecycleModel();let delivered=0;
  h.on('#error',()=>{throw Error('callback fault')});h.on('#error',()=>delivered++);
  h.settle('#error',{kind:'Original'});await tick();
  assert.equal(delivered,1);assert.equal(h.observer_faults.length,1);
  assert.equal((await h.get_done()).error.kind,'Original');
});
test('subscription count is bounded and bad events rejected',()=>{
  const h=new PipeLifecycleModel({max_observers:2});
  h.on('#error',()=>{});h.on('#error',()=>{});
  assert.throws(()=>h.on('#error',()=>{}),/E_PIPE_OBSERVER_QUOTA/);
  assert.throws(()=>h.on('#unknown',()=>{}),/E_PIPE_OBSERVER_EVENT/);
  assert.throws(()=>new PipeLifecycleModel().on('#error',3),/E_PIPE_OBSERVER_CALLBACK/);
});
test('source read failure preserves exact prior admitted count',async()=>{
  const h=new PipeLifecycleModel(),s=source_of([1,2,3],{fail_after:2}),d=sink_of();
  const outcome=await io_pipe_model(s,d,h);
  assert.equal(outcome.kind,'Err');assert.equal(outcome.error.kind,'ReadError');
  assert.equal(outcome.error.committed_items,2);assert.deepEqual(d.committed,[1,2]);
  assert.equal(d.closed,false);assert.equal(s.closed,false);
});
test('sink failure preserves committed prefix and never retries failed item',async()=>{
  const h=new PipeLifecycleModel(),s=source_of([1,2,3]),d=sink_of({fail_after:1});
  const outcome=await io_pipe_model(s,d,h);
  assert.equal(outcome.error.kind,'WriteError');assert.equal(outcome.error.committed_items,1);
  assert.deepEqual(d.committed,[1]);assert.equal(outcome.error.read_items,2);
});
test('indeterminate physical partial write is never automatically retried',async()=>{
  const d=sink_of({partial_at:0}),s=source_of(['abcdef','ghijk']);
  const result=await io_pipe_model(s,d);
  assert.equal(result.error.kind,'IndeterminateWrite');
  assert.equal(result.error.committed_bytes,2);assert.equal(result.error.remaining,4);
  assert.equal(result.error.read_items,1);assert.deepEqual(d.committed,[]);
});
test('EOF closes only graph-owned sink after full drain',async()=>{
  for(const owned of [true,false]){
    const h=new PipeLifecycleModel(),d=sink_of({owned});
    const result=await io_pipe_model(source_of([1,2,3]),d,h);
    assert.deepEqual(result,{kind:'Ok',value:{committed_items:3,read_items:3}});
    assert.deepEqual(d.committed,[1,2,3]);assert.equal(d.closed,owned);
  }
});
test('cancel is not #error, #complete, or synthetic EOF',async()=>{
  const h=new PipeLifecycleModel(),events=[];
  for(const e of ['#error','#cancel','#complete','#settled'])h.on(e,()=>events.push(e));
  h.settle('#cancel',{kind:'Cancelled',committed_items:1});
  await tick();assert.deepEqual(events,['#cancel','#settled']);
  assert.equal((await h.get_done()).kind,'Err');
});
test('actor panic emits independent supervisor CONTROL and one terminal outcome',async()=>{
  const h=new PipeLifecycleModel(),messages=[];
  h.on('#error',()=>messages.push('error'));
  h.actor_panic({actor_id:42,generation:3,committed:5});
  h.suppress_diagnostic({kind:'cleanup_error'});
  await tick();assert.deepEqual(messages,['error']);
  assert.equal(h.supervisor_control.length,1);
  assert.equal((await h.get_done()).error.committed,5);
  assert.equal(h.suppressed.length,1);
});
test('deterministic randomized subscribe/settle/unsubscribe interleavings settle exactly once',async()=>{
  let seed=0x13579bdf;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let run=0;run<300;run++){
    const h=new PipeLifecycleModel();let count=0;const tokens=[];
    const when=random()%12;const active=new Set();
    for(let j=0;j<12;j++){
      const op=random()%4;
      if(j===when)h.settle('#error',{kind:'F',run});
      if(op===0&&tokens.length){const [id,token]=tokens[random()%tokens.length];token.unsubscribe();active.delete(id);}
      else if(op!==0){const id=tokens.length;const token=h.on('#error',()=>count++);tokens.push([id,token]);active.add(id);}
    }
    h.settle('#error',{kind:'F',run});
    await Promise.resolve();await Promise.resolve();
    assert.equal(count,active.size,'run '+run);
    assert.equal((await h.get_done()).error.run,run);
  }
});
