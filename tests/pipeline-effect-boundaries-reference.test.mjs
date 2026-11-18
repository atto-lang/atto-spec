// AttoLang pipeline effect boundaries: executable Node reference model ONLY.
// NOT Atto compiler, Wasm guest, scheduler, or supervisor runtime evidence.
import test from 'node:test';
import assert from 'node:assert/strict';

const Ok = value => ({tag:'Ok', value});
const Err = error => ({tag:'Err', error});
const Some = value => ({tag:'Some', value});
const None = Object.freeze({tag:'None'});
const failure = (effect, label) => Object.assign(new Error(label), {effect, label});

// Handler jurisdiction is explicit: JavaScript's catch-all is NOT Atto catch.
function trap(f) {
  try { return Some(f()); }
  catch (e) { if (e.effect === 'throw') return None; throw e; }
}
function catch_throw(f, handler) {
  try { return f(); }
  catch (e) { if (e.effect === 'throw') return handler(e); throw e; }
}
function recover_raise(f, handler) {
  try { return f(); }
  catch (e) { if (e.effect === 'raise') return handler(e); throw e; }
}
const forward = (value, stages) => stages.reduce((v, f) => f(v), value);
// f <| g <| x = f(g(x)); stages are written in reverse dataflow order.
const reverse = (stages, value) => forward(value, [...stages].reverse());

function graph(stages, direction, initial) {
  const dataflow = direction === 'rpipe' ? [...stages].reverse() : [...stages];
  const constructed = stages.map(x => x.name); // graph endpoint construction: lexical order
  const executed = [];
  let data = initial;
  try {
    for (const stage of dataflow) {
      executed.push(stage.name);
      data = stage.apply(data);
    }
    return {outcome:Ok(data), constructed, executed};
  } catch (cause) {
    return {outcome:Err({kind:'StageFailure', cause, stage:executed.at(-1)}), constructed, executed};
  }
}

class Lifecycle {
  constructor() { this.first = null; this.outcome = null; this.control = []; this.inflight = 0; }
  acquire() { if (this.first) throw Error('admission fenced'); this.inflight++; }
  release() { assert.ok(this.inflight > 0); this.inflight--; this.finish(); }
  fail(cause, actor) {
    // CONTROL is independent of the first terminal pipe cause.
    if (cause.effect === 'panic') this.control.push({actor, cause});
    if (!this.first) this.first = {kind:'Failure', cause};
    this.finish();
  }
  cancel() { if (!this.first) this.first = {kind:'Cancelled'}; this.finish(); }
  complete() { if (!this.first) this.first = {kind:'Success'}; this.finish(); }
  finish() { if (this.first && this.inflight === 0 && !this.outcome) this.outcome = this.first; }
}

test('forward and reverse function application agree on values and exact call order', () => {
  const seen = [];
  const a = x => { seen.push('a'); return x + 1; };
  const b = x => { seen.push('b'); return x * 2; };
  assert.equal(forward(20, [a,b]), 42);
  assert.deepEqual(seen, ['a','b']);
  seen.length = 0;
  assert.equal(reverse([b,a], 20), 42);
  assert.deepEqual(seen, ['a','b']);
});

test('throw stops every later functional stage; trap applies to entire call boundary', () => {
  for (const run of [
    x => forward(x, [() => { throw failure('throw','X'); }, () => { throw Error('unreachable'); }]),
    x => reverse([() => { throw Error('unreachable'); }, () => { throw failure('throw','X'); }], x),
  ]) {
    assert.deepEqual(trap(() => run(1)), None);
  }
});

test('raise and panic bypass trap and ordinary catch in both application directions', () => {
  for (const kind of ['raise','panic']) {
    for (const call of [() => forward(1,[() => {throw failure(kind,'X')}]),
                        () => reverse([() => {throw failure(kind,'X')}],1)]) {
      assert.throws(() => trap(() => catch_throw(call, () => 'handled')), e => e.effect === kind);
    }
  }
});

test('recover handles raise, but neither trap nor recover intercept panic', () => {
  const raised = () => { throw failure('raise','R'); };
  assert.equal(recover_raise(raised, e => 'recovered-' + e.label), 'recovered-R');
  const panic = () => { throw failure('panic','P'); };
  assert.throws(() => recover_raise(panic, () => 'incorrect'), e => e.effect === 'panic');
});

test('returned Err remains a value, and trap Err is Some(Err), never None', () => {
  const result = forward(1,[x => Err('bad-' + x)]);
  assert.deepEqual(result, Err('bad-1'));
  assert.deepEqual(trap(() => reverse([x => Err('bad-' + x)], 1)), Some(Err('bad-1')));
  assert.notDeepEqual(Some(Err('bad-1')), None);
});

test('an explicit Result propagation terminates a stage, not an entire VALUE graph by magic', () => {
  const called = [];
  function checked_stage(value) { called.push('stage'); if (value.tag === 'Err') return value; return Ok(value.value+1); }
  const data = forward(Err('payload'), [checked_stage]);
  assert.deepEqual(data, Err('payload'));
  assert.deepEqual(called,['stage']);
});

test('functional pipeline inner throw is catchable only by a handler surrounding that evaluation', () => {
  const f = x => {throw failure('throw', String(x))};
  assert.equal(catch_throw(() => forward(7,[f]), e => Number(e.label)+1), 8);
  assert.equal(catch_throw(() => reverse([f],7), e => Number(e.label)+1), 8);
});

test('graph rpipe reverses flow but never lexical construction or cause identity', () => {
  const producer={name:'producer',apply:x=>x+1};
  const bad={name:'bad',apply:()=>{throw failure('raise','causal-1')}};
  const sink={name:'sink',apply:()=>{throw Error('must never execute')}};
  const left=graph([producer,bad,sink],'pipe',1);
  const right=graph([sink,bad,producer],'rpipe',1);
  assert.deepEqual(left.executed,['producer','bad']);
  assert.deepEqual(right.executed,['producer','bad']);
  assert.deepEqual(right.constructed,['sink','bad','producer']);
  assert.equal(left.outcome.error.cause.effect,'raise');
  assert.equal(right.outcome.error.cause.label,'causal-1');
});

test('Result.Err DATA is not a stage failure in either graph direction', () => {
  const src={name:'src',apply:()=>Err('data')};
  const dst={name:'dst',apply:v=>v};
  assert.deepEqual(graph([src,dst],'pipe',0).outcome,Ok(Err('data')));
  assert.deepEqual(graph([dst,src],'rpipe',0).outcome,Ok(Err('data')));
});

test('first pipe failure wins; a later actor panic still produces CONTROL', () => {
  const lifecycle=new Lifecycle();
  const first=failure('throw','ordinary');
  const later=failure('panic','terminal');
  lifecycle.fail(first,1);
  lifecycle.fail(later,2);
  assert.equal(lifecycle.outcome.cause,first);
  assert.deepEqual(lifecycle.control,[{actor:2,cause:later}]);
});

test('cancellation is not throw, raise, panic or normal completion', () => {
  const lifecycle=new Lifecycle();
  lifecycle.cancel();
  assert.deepEqual(lifecycle.outcome,{kind:'Cancelled'});
  assert.deepEqual(lifecycle.control,[]);
  assert.throws(() => trap(() => {throw failure('cancel','cancelled')}),e=>e.effect==='cancel');
});

test('an inflight transfer fences terminal publication until physical quiescence', () => {
  const lifecycle=new Lifecycle();
  lifecycle.acquire();
  lifecycle.fail(failure('raise','stop'),7);
  assert.equal(lifecycle.outcome,null);
  assert.throws(() => lifecycle.acquire(),/admission fenced/);
  lifecycle.release();
  assert.equal(lifecycle.outcome.kind,'Failure');
  assert.equal(lifecycle.outcome.cause.effect,'raise');
  lifecycle.complete();
  assert.equal(lifecycle.outcome.kind,'Failure');
});

test('a graph cancelled before an actor panic still propagates CONTROL', () => {
  const lifecycle=new Lifecycle();
  lifecycle.cancel();
  const p=failure('panic','supervisor');
  lifecycle.fail(p,'actor-7');
  assert.equal(lifecycle.outcome.kind,'Cancelled');
  assert.deepEqual(lifecycle.control,[{actor:'actor-7',cause:p}]);
});

test('trap construction does not catch later asynchronous completion', async () => {
  const handle = {get_done: async () => Err({kind:'StageFailure',stage:'f'})};
  assert.deepEqual(trap(() => handle),Some(handle));
  const completed = await handle.get_done();
  assert.deepEqual(trap(() => completed),Some(Err({kind:'StageFailure',stage:'f'})));
});
