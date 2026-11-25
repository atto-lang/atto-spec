import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {PullCursor, AsyncPullCursor, BoundedStream, done, yielded}
  from '../src/iterator-stream-lazy-reference.mjs';

const registry = JSON.parse(readFileSync(new URL('../contracts/iterator-stream-lazy-v1.json', import.meta.url), 'utf8'));

test('registry never mistakes host-only tests for guest execution', () => {
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.hostReferenceIsGuestExecution, false);
  assert.equal(registry.status, 'candidate-no-guest-evidence');
  assert.ok(registry.cases.length >= 18);
  assert.equal(new Set(registry.cases.map(c => c.id)).size, registry.cases.length);
  assert.deepEqual(Object.keys(registry.compilerBackends).sort(),
    ['cranelift','forge','hdl','java','js','llvm','net','rs','wasm']);
  for (const item of registry.cases) {
    assert.equal(item.status, 'not_executed');
    assert.ok(['compile','guest'].includes(item.phase));
    assert.ok(item.expect);
  }
  for (const [backend, status] of Object.entries(registry.compilerBackends))
    assert.equal(status, backend === 'hdl' ? 'unsupported' : 'not_executed');
  assert.ok(registry.receiptRequired.includes('guest_executed'));
});

test('lazy map/filter/take preserves callback demand and order', () => {
  const log = [];
  let index = 0;
  const source = new PullCursor(() => {log.push('pull:' + (++index));
    return index <= 5 ? yielded(index) : done;
  }, () => log.push('closed'));
  const flow = source.filter(n => {log.push('filter:' + n); return n % 2;}, () => log.push('cooperate'))
    .map(n => {log.push('map:' + n); return n * 10;}).take(2);
  assert.deepEqual(log, []);
  assert.deepEqual(flow.next(), yielded(10));
  assert.deepEqual(log, ['pull:1','cooperate','filter:1','map:1']);
  assert.deepEqual(flow.next(), yielded(30));
  assert.equal(log.filter(x => x === 'closed').length, 1);
  assert.deepEqual(flow.next(), done);
  flow.close();flow.close();
  assert.equal(log.filter(x => x === 'closed').length, 1);
});

test('fold uses no intermediate materialized collection', () => {
  const values = PullCursor.fromArray([1,2,3,4]);
  assert.equal(values.map(n => n * 2).filter(n => n > 3).fold(0, (sum,n) => sum + n), 18);
  assert.equal(values.closeCount, 1);
});

test('bounded collect overflow releases every item once, no partial list', () => {
  const released = [];
  const input = PullCursor.fromArray([1,2,3]);
  assert.deepEqual(input.collect(3), {ok:true,value:[1,2,3]});
  const extra = PullCursor.fromArray([1,2,3]);
  assert.deepEqual(extra.collect(2, v => released.push(v)), {ok:false,error:'CollectLimitExceeded'});
  assert.deepEqual(released,[3,1,2]);
  assert.equal(extra.closeCount,1);
  assert.throws(() => PullCursor.fromArray([]).collect(-1), /InvalidBound/);
  assert.throws(() => PullCursor.fromArray([]).collect(Number.MAX_SAFE_INTEGER + 1), /InvalidBound/);
});

test('None, Err and undefined values are not EOF', () => {
  const cursor=PullCursor.fromArray([{kind:'None'},{kind:'Err',value:'x'},undefined]);
  assert.deepEqual(cursor.next(),yielded({kind:'None'}));
  assert.deepEqual(cursor.next(),yielded({kind:'Err',value:'x'}));
  assert.deepEqual(cursor.next(),yielded(undefined));
  assert.deepEqual(cursor.next(),done);
});

test('terminal producer error remains sticky without re-entry', () => {
  const error=new Error('producer'); let calls=0;
  const iter=new PullCursor(()=>{calls++;throw error;});
  for(let i=0;i<100;i++)assert.throws(()=>iter.next(),e=>e===error);
  assert.equal(calls,1);
  iter.close();assert.deepEqual(iter.next(),done);
});

test('async activation lazy, overlapping next rejected, close Future memoized', async () => {
  let resolvePull;let pulls=0;let cleanup=0;
  const p=new AsyncPullCursor(()=>{pulls++;return new Promise(resolve=>{resolvePull=resolve;});},
    ()=>{if(resolvePull)resolvePull(done);},()=>{cleanup++;});
  assert.equal(pulls,0);
  const first=p.next();
  await assert.rejects(p.next(),/ConcurrentPull/);
  await Promise.resolve();assert.equal(pulls,1);
  const c1=p.close();const c2=p.close();assert.equal(c1,c2);
  assert.deepEqual(await first,done);
  await c1;
  assert.equal(cleanup,1);assert.equal(p.closeCount,1);
  assert.deepEqual(await p.next(),done);
});

test('early close prevents stranded pre-admission async read', async () => {
  let calls=0;
  const cursor=new AsyncPullCursor(()=>{calls++;return new Promise(()=>{});});
  const first=cursor.next();
  const closed=cursor.close();
  await assert.rejects(first,/CancelledPull/);
  await closed;
  assert.equal(calls,0);
});

test('async map lazy and rejects implicitly awaited callbacks', async () => {
  let calls=0;
  const cursor=new AsyncPullCursor(async()=>{calls++;return calls===1?yielded(3):done;});
  const mapped=cursor.map(n=>n*2);
  assert.equal(calls,0);
  assert.deepEqual(await mapped.next(),yielded(6));
  assert.deepEqual(await mapped.collect(3),{ok:true,value:[]});
  const invalid=new AsyncPullCursor(async()=>yielded(1)).map(async n=>n+1);
  await assert.rejects(invalid.next(),/AsyncCallbackRequiresMapAsync/);
  await invalid.close();
});

test('capacity zero is a real rendezvous, not hidden buffer', async () => {
  const stream=new BoundedStream(0);
  const reader=stream.asyncIter();
  let acknowledged=false;
  const send=stream.send(42).then(()=>{acknowledged=true;});
  await Promise.resolve();assert.equal(acknowledged,false);
  assert.equal(stream.maxObserved,0);
  assert.deepEqual(await reader.next(),yielded(42));
  await send;assert.equal(acknowledged,true);
  stream.finish();assert.deepEqual(await reader.next(),done);
  await reader.close();
});

test('capacity one blocks extra sender then drains in FIFO order', async () => {
  const stream=new BoundedStream(1);
  await stream.send('first');
  let committedSecond=false;
  const second=stream.send('second').then(()=>{committedSecond=true;});
  await Promise.resolve();assert.equal(committedSecond,false);
  await assert.rejects(stream.send('third'),/StreamQuota/);
  const reader=stream.asyncIter();
  assert.deepEqual(await reader.next(),yielded('first'));
  await second;assert.equal(committedSecond,true);
  assert.equal(stream.buffer.length,1);
  assert.equal(stream.maxObserved,1);
  stream.finish();
  assert.deepEqual(await reader.next(),yielded('second'));
  assert.deepEqual(await reader.next(),done);
  await reader.close();
});

test('exceptional close drains committed items before preserving failure', async () => {
  const error=new Error('I/O');const stream=new BoundedStream(1);
  await stream.send(9);
  const reader=stream.asyncIter();
  stream.finish(error);
  assert.deepEqual(await reader.next(),yielded(9));
  await assert.rejects(reader.next(),e=>e===error);
  await assert.rejects(reader.next(),e=>e===error);
  await reader.close();
});

test('exclusive reader lease is not a channel ownership transfer', async () => {
  const stream=new BoundedStream(1);
  const a=stream.asyncIter();
  assert.throws(()=>stream.asyncIter(),/ExclusiveReader/);
  await a.close();assert.equal(stream.ended,false);
  const b=stream.asyncIter();
  await stream.send(8);
  assert.deepEqual(await b.next(),yielded(8));
  await b.close();
});

test('closing reader view cancels pending read without closing external source', async () => {
  const stream=new BoundedStream(0);
  const reader=stream.asyncIter();
  const p=reader.next();
  await Promise.resolve();
  assert.ok(stream.readWaiter);
  const closing=reader.close();
  await assert.rejects(p,/CancelledPull/);
  await closing;
  assert.equal(stream.readWaiter,null);
  assert.equal(stream.ended,false);
});

test('cancel refunds uncommitted item and releases buffer exactly once', async () => {
  const released=[];
  const stream=new BoundedStream(1,v=>released.push(v));
  await stream.send('committed');
  const pending=stream.send('uncommitted');
  stream.cancel();stream.cancel();
  await assert.rejects(pending,/StreamClosed/);
  assert.equal(stream.committed,1);
  assert.equal(stream.released,2);
  assert.deepEqual(released,['uncommitted','committed']);
  assert.equal(stream.buffer.length,0);
  assert.deepEqual(await stream.receive(),done);
});
