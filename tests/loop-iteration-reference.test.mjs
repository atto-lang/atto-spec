import test from 'node:test';
import assert from 'node:assert/strict';
function iterate(source,body){const it=source();try{for(;;){const next=it.next();if(next.done)return;if(body(next.value)==='break')return}}finally{it.close()}}
function post(body,pred){do{body()}while(pred())}
test('iterator source once, next and close counts including break and throw',()=>{for(const mode of ['normal','break','throw']){let sources=0,nexts=0,closes=0;const source=()=>{sources++;return {next:()=>({done:++nexts>3,value:nexts}),close:()=>closes++}};const body=x=>{if(x===2&&mode==='throw')throw Error('body');if(x===2&&mode==='break')return 'break'};if(mode==='throw')assert.throws(()=>iterate(source,body),/body/);else iterate(source,body);assert.equal(sources,1);assert.equal(closes,1);assert.equal(nexts,mode==='normal'?4:2)}});
test('post-test runs once even when condition false; recur updates simultaneous state',()=>{let n=0,p=0;post(()=>n++,()=>{p++;return false});assert.deepEqual([n,p],[1,1]);let i=0,sum=0;while(i<10)[i,sum]=[i+1,sum+i];assert.equal(sum,45)});

// Host reference only; this does not parse, type-check or execute Atto source.
function nextState(old, operands) {
  assert.equal(operands.length, old.length);
  const snapshot = Object.freeze([...old]);
  return operands.map(operand => operand(snapshot));
}
test('recur operands run once left-to-right against old state', () => {
  const trace = [];
  const old = [2, 7];
  const result = nextState(old, [s => {trace.push('first'); return s[1];}, s => {trace.push('second'); return s[0];}]);
  assert.deepEqual(result, [7, 2]);
  assert.deepEqual(old, [2, 7]);
  assert.deepEqual(trace, ['first', 'second']);
});
test('recur operand failure publishes no new state and skips remaining operands', () => {
  let state = [1, 2, 3];
  const trace = [];
  assert.throws(() => {state = nextState(state, [() => {trace.push(1); return 9;}, () => {trace.push(2); throw Error('operand');}, () => {trace.push(3); return 0;}]);}, /operand/);
  assert.deepEqual(state, [1, 2, 3]);
  assert.deepEqual(trace, [1, 2]);
});
test('recur arity mismatch evaluates no operands in the reference', () => {
  let calls = 0;
  assert.throws(() => nextState([1, 2], [() => ++calls]));
  assert.equal(calls, 0);
});
test('state initializers are evaluated once in declaration order', () => {
  const trace = [];
  const initializers = [() => {trace.push('a'); return 2;}, s => {trace.push('b'); return s[0] + 5;}];
  let state = [];
  for (const init of initializers) state.push(init(Object.freeze([...state])));
  for (let n = 0; n < 3; n++) state = nextState(state, [s => s[1], s => s[0]]);
  assert.deepEqual(state, [7, 2]);
  assert.deepEqual(trace, ['a', 'b']);
});
test('large recur reference uses an iterative backedge', () => {
  let state = [0, 0];
  while (state[0] < 100000) state = nextState(state, [s => s[0] + 1, s => s[1] + 1]);
  assert.deepEqual(state, [100000, 100000]);
});
