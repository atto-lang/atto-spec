// HOST-ONLY reference model for language/timers-and-sleep-v1.md.
// NOT an Atto compiler, guest runtime or backend-parity result.
import test from 'node:test';
import assert from 'node:assert/strict';

const MAX=(1n<<64n)-1n;
const UNITS={ns:1n,us:1000n,ms:1000000n,s:1000000000n,
  min:60000000000n,h:3600000000000n};
function duration(source) {
  if(typeof source!=='string') throw Error('E_DURATION_TYPE');
  const m=/^([0-9]+(?:_[0-9]+)*)(ns|us|ms|min|s|h)$/.exec(source);
  if(!m) throw Error('E_DURATION_LITERAL');
  const n=BigInt(m[1].replaceAll('_',''))*UNITS[m[2]];
  if(n>MAX) throw Error('E_DURATION_RANGE');
  return n;
}
function checked_add(a,b) {
  if(a<0n||b<0n||a>MAX-b) throw Error('E_DURATION_RANGE');
  return a+b;
}
class FakeMonotonicTimerQueue {
  constructor(now=0n) {this.now=now;this.wall=0n;this.ids=0;this.entries=[];}
  register(delay) {
    const deadline=checked_add(this.now,delay);
    const handle={id:++this.ids,deadline,state:'pending',wakes:0};
    this.entries.push(handle);return handle;
  }
  cancel(h) {
    if(h.state!=='pending') return false;
    h.state='cancelled';return true;
  }
  jump_wall(delta) {this.wall+=delta;}
  pump(delta) {
    if(delta<0n) throw Error('monotonic cannot go backward');
    this.now=checked_add(this.now,delta);
    for(const h of this.entries)
      if(h.state==='pending'&&h.deadline<=this.now) {
        h.state='completed';h.wakes++;
      }
  }
  shutdown() {for(const h of this.entries) this.cancel(h);}
}
function admit(ctx,kind) {
  if(ctx.critical||ctx.unbudgeted_hard_rt) throw Error('E_BLOCKING_CONTEXT');
  if(kind==='susp') {
    if(!ctx.susp) throw Error('E_SUSPEND_CONTEXT');
  } else if(kind==='blocking') {
    if(!ctx.susp||!ctx.parkable_fiber||ctx.reactor_thread||ctx.browser_main)
      throw Error('E_BLOCKING_CONTEXT');
  } else throw Error('unknown sleep API');
  return true;
}
test('integral exact nanosecond suffixes and underscore separators',()=>{
  for(const [literal,nanos] of Object.entries({
    '0ns':0n,'1ns':1n,'1us':1000n,'100ms':100000000n,
    '1_000ms':1000000000n,'5s':5000000000n,
    '2min':120000000000n,'1h':3600000000000n,
    '18446744073709551615ns':MAX,
  })) assert.equal(duration(literal),nanos,literal);
});
test('reject malformed, fractional, negative and overflowed durations',()=>{
  for(const literal of [
    '100 ms','-1ms','1.5s','1e3ms','100m','1__0ms',
    '1_ms','_1ms','1ms_','1MS','NaNms','',
    '18446744073709551616ns','18446744073710ms',
    '999999999999999999h',
  ]) assert.throws(()=>duration(literal),/E_DURATION_(LITERAL|RANGE)/,literal);
  assert.throws(()=>duration(100),/E_DURATION_TYPE/);
});
test('zero sleep yields until pump; monotonic time resists wall clock jumps',()=>{
  const q=new FakeMonotonicTimerQueue(10n);
  const zero=q.register(duration('0ms'));
  const one=q.register(duration('1ms'));
  const two=q.register(duration('2ms'));
  assert.equal(zero.state,'pending');
  q.pump(0n);
  assert.equal(zero.state,'completed');
  assert.equal(one.state,'pending');
  q.jump_wall(100000000000000n);
  assert.equal(two.state,'pending');
  q.pump(duration('1ms'));
  assert.equal(one.state,'completed');
  assert.equal(two.state,'pending');
  q.pump(duration('1ms'));
  assert.equal(two.state,'completed');
  q.pump(0n);
  for(const h of [zero,one,two]) assert.equal(h.wakes,1);
});
test('cancellation-before-expiry wins, cannot resurrect or double-resume',()=>{
  const q=new FakeMonotonicTimerQueue();
  const h=q.register(duration('100ms'));
  assert.equal(q.cancel(h),true);
  assert.equal(q.cancel(h),false);
  q.pump(duration('100ms'));
  assert.equal(h.state,'cancelled');assert.equal(h.wakes,0);
  const ready=q.register(0n);q.pump(0n);
  assert.equal(q.cancel(ready),false);assert.equal(ready.wakes,1);
});
test('many identical deadlines do not lose wakeups; teardown cancels',()=>{
  const q=new FakeMonotonicTimerQueue();
  const all=Array.from({length:128},()=>q.register(duration('1ms')));
  for(let i=0;i<all.length;i+=3) assert.equal(q.cancel(all[i]),true);
  q.pump(duration('1ms'));
  for(const h of all) {
    assert.ok(['completed','cancelled'].includes(h.state));
    assert.equal(h.wakes,h.state==='completed'?1:0);
  }
  const pending=q.register(duration('10ms'));
  q.shutdown();q.pump(duration('10ms'));
  assert.equal(pending.state,'cancelled');assert.equal(pending.wakes,0);
});
test('deadline overflow and clock regression reject safely',()=>{
  const q=new FakeMonotonicTimerQueue(MAX-1n);
  assert.equal(q.register(1n).deadline,MAX);
  assert.throws(()=>q.register(2n),/E_DURATION_RANGE/);
  assert.throws(()=>q.pump(-1n),/backward/);
});
test('blocking sleep requires parkable fiber, never event loop or critical lease',()=>{
  assert.equal(admit({susp:true,parkable_fiber:true},'blocking'),true);
  assert.equal(admit({susp:true},'susp'),true);
  for(const ctx of [{},{parkable_fiber:true},{susp:true},
    {susp:true,parkable_fiber:true,reactor_thread:true},
    {susp:true,parkable_fiber:true,browser_main:true},
    {susp:true,parkable_fiber:true,critical:true},
    {susp:true,parkable_fiber:true,unbudgeted_hard_rt:true}])
    assert.throws(()=>admit(ctx,'blocking'),/E_BLOCKING_CONTEXT/);
  assert.throws(()=>admit({},'susp'),/E_SUSPEND_CONTEXT/);
  assert.throws(()=>admit({susp:true,critical:true},'susp'),/E_BLOCKING_CONTEXT/);
});
