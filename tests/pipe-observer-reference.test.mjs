// Host-only candidate behavioral oracle. NOT executable Atto guest transport.
import test from 'node:test';
import assert from 'node:assert/strict';
const Ok = value => ({tag:'Ok',value});
const Err = error => ({tag:'Err',error});
const source = (name,out='int')=>({name,out});
const sink = (name,inn='int')=>({name,inn});
const trans=(name,inn,out)=>({name,inn,out});
const flush=()=>new Promise(r=>setImmediate(r));
class Handle {
  constructor(stages) {
    this.stages=stages; this.state=null; this.listeners=[];
    this.observer_errors=[]; this.control=[];
  }
  on(event,cb) {
    if(!['#error','#complete','#cancel','#settled'].includes(event)) throw Error('bad event');
    const sub={event,cb,active:true,delivered:false}; this.listeners.push(sub);
    if(this.state) queueMicrotask(()=>this.deliver(sub)); // Replay after late subscribe.
    return {unsubscribe:()=>{sub.active=false;}};
  }
  deliver(sub) {
    if(!this.state||!sub.active||sub.delivered) return;
    if(sub.event!=='#settled'&&sub.event!==this.state.event) return;
    sub.delivered=true;
    try {sub.cb(this.state.payload);} catch(e){this.observer_errors.push(e);}
  }
  settle(event,payload) {
    if(this.state) return false;
    this.state={event,payload};
    for(const s of this.listeners) queueMicrotask(()=>this.deliver(s));
    return true;
  }
  get_done() {
    if(!this.state) throw Error('pending: real runtime get_done is awaited');
    return this.state.event==='#complete' ? Ok(this.state.payload) : Err(this.state.payload);
  }
  panic(control) {
    this.control.push(control); // independent supervisor CONTROL
    this.settle('#error',{kind:'StagePanic',origin:control.actor_id,committed:control.committed});
  }
}
function connect(stages,direction='pipe',observer) {
  if(!['pipe','rpipe'].includes(direction)) return Err('E_PIPE_DIRECTION');
  const flow=direction==='rpipe'?[...stages].reverse():[...stages];
  if(flow.length<2) return Err('E_PIPE_SETUP');
  for(let i=0;i+1<flow.length;i++){
    if(!flow[i].out) return Err('E_PIPE_SOURCE');
    if(!flow[i+1].inn) return Err('E_PIPE_SINK');
    if(flow[i].out!==flow[i+1].inn) return Err('E_PIPE_TYPE');
  }
  if(observer?.position==='middle') return Err('E_PIPE_OBSERVER_POSITION');
  const h=new Handle(flow.map(x=>x.name));
  if(observer)h.on(observer.event||'#settled',observer.cb);
  return Ok(h);
}
const io_pipe=(a,b)=>connect([a,b]);
test('pipe/rpipe/io.pipe edges are identical',()=>{
  const a=source('source'),b=trans('transform','int','bool'),c=sink('sink','bool');
  assert.deepEqual(connect([a,b,c]).value.stages,connect([c,b,a],'rpipe').value.stages);
  assert.deepEqual(io_pipe(a,sink('sink')).value.stages,['source','sink']);
  assert.equal(io_pipe(sink('sink'),a).error,'E_PIPE_SOURCE');
  assert.equal(connect([a,c]).error,'E_PIPE_TYPE');
});
test('setup rejects with no handle, no lifecycle error callback',async()=>{
  let observed=0;
  const x=connect([source('s'),sink('t','bool')],'pipe',
    {event:'#error',cb:()=>observed++});
  assert.equal(x.error,'E_PIPE_TYPE'); await flush(); assert.equal(observed,0);
});
test('inline observer is attached before immediate failure',async()=>{
  const events=[];
  const h=connect([source('s'),sink('t')],'pipe',
    {event:'#error',cb:e=>events.push(e)}).value;
  h.settle('#error',{kind:'ReadError',committed:0});
  await flush();assert.equal(events.length,1);
  assert.deepEqual(h.get_done(),Err({kind:'ReadError',committed:0}));
});
test('late on replays once and does not synchronously invoke callback',async()=>{
  const h=io_pipe(source('s'),sink('t')).value;
  h.settle('#error',{kind:'WriteError',committed:2});
  let n=0;h.on('#error',()=>n++);assert.equal(n,0);
  await flush();assert.equal(n,1);
  assert.equal(h.settle('#error',{kind:'late'}),false);
  await flush();assert.equal(n,1);
});
test('EOF completion, cancellation and failure are distinct',async()=>{
  for(const [kind,outcome] of [['#complete','Ok'],['#cancel','Err'],['#error','Err']]){
    const h=io_pipe(source('s'),sink('t')).value;
    const got=[];for(const e of ['#error','#complete','#cancel','#settled'])h.on(e,()=>got.push(e));
    h.settle(kind,{committed:3});
    await flush();assert.deepEqual(got,[kind,'#settled']);
    assert.equal(h.get_done().tag,outcome);
  }
});
test('zero-arg observer is settled notification, never a catch',async()=>{
  let n=0;
  const h=connect([sink('t'),source('s')],'rpipe',{cb:()=>n++}).value;
  h.settle('#error',{kind:'StageFailure'});
  await flush();assert.equal(n,1);assert.equal(h.get_done().tag,'Err');
});
test('unsubscribe prevents queued delivery',async()=>{
  const h=io_pipe(source('s'),sink('t')).value;let n=0;
  const token=h.on('#error',()=>n++);
  h.settle('#error',{kind:'fail'});token.unsubscribe();
  await flush();assert.equal(n,0);
});
test('observer error is isolated and cannot replace first failure',async()=>{
  const h=io_pipe(source('s'),sink('t')).value;
  const first={kind:'StageFailure',committed:7};
  let seen=0;
  h.on('#error',()=>{throw Error('callback error')});
  h.on('#error',()=>seen++);
  h.settle('#error',first);await flush();
  assert.equal(h.observer_errors.length,1);assert.equal(seen,1);
  assert.deepEqual(h.get_done(),Err(first));
});
test('panic cannot be consumed by observer or substituted for CONTROL',async()=>{
  const h=io_pipe(source('actor'),sink('sink')).value;
  h.on('#error',()=>{throw Error('observer error')});
  h.panic({actor_id:9,committed:2});
  await flush();
  assert.deepEqual(h.control,[{actor_id:9,committed:2}]);
  assert.equal(h.get_done().error.kind,'StagePanic');
});
test('Result.Err and Option.None items are ordinary payloads',async()=>{
  const h=io_pipe(source('s','Result<int,string>'),sink('t','Result<int,string>')).value;
  const payloads=[Err('data'),{tag:'None'}];
  let errors=0;h.on('#error',()=>errors++);
  assert.equal(payloads.length,2);
  h.settle('#complete',{committed:2});
  await flush();assert.equal(errors,0);
});
test('observer only allowed as trailing out-of-band decorator',()=>{
  assert.equal(connect([source('s'),sink('t')],'pipe',
    {position:'middle',event:'#error',cb:()=>{}}).error,'E_PIPE_OBSERVER_POSITION');
  assert.equal(connect([source('s'),sink('t')],'rpipe').error,'E_PIPE_SOURCE');
  assert.equal(connect([sink('t'),source('s')],'pipe').error,'E_PIPE_SOURCE');
});
