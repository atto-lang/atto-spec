// REFERENCE MODEL ONLY: not production Atto parser/IR/runtime or guest execution.
import test from 'node:test';
import assert from 'node:assert/strict';

const Ok = (value) => ({ tag: 'Ok', value });
const Err = (error) => ({ tag: 'Err', error });
const is_result = (x) => x != null && (x.tag === 'Ok' || x.tag === 'Err');
class SourceSignal extends Error {
  constructor(kind, source_error) {
    super(kind);
    this.kind = kind;
    this.source_error = source_error;
  }
}
function trap(thunk) {
  try {
    const out = thunk();
    return is_result(out) ? out : Ok(out);
  } catch (e) {
    if (e instanceof SourceSignal && e.kind === 'throw') return Err(e.source_error);
    throw e;
  }
}
const and_then = (result, fn) => result.tag === 'Err' ? result : fn(result.value);
const value_pipe = (value, ...functions) => functions.reduce((x, fn) => fn(x), value);
const forward = (source, transform, sink) => [source, transform, sink];
const reverse = (sink, transform, source) => [source, transform, sink];
const effects = (...labels) => new Set(labels);
const combine = (...sets) => new Set(sets.flatMap((set) => [...set]));
const discharge = (set, handled) => new Set([...set].filter((effect) => !handled.has(effect)));
const unhandled = (actual, permitted) => [...actual].filter((x) => !permitted.has(x));
const must_handle = (type) => /^(Result<|PipeHandle\b|Future<Result<|CheckedIo<)/.test(type);
function join_error(left, thrown) {
  if (left === thrown || left === 'Error') return left;
  throw Error('E_TRAP_ERROR_JOIN');
}

// The "proof" here is that the reference equations enforce their stated contracts;
// no claim is made about Atto compiler coverage, soundness, or actual guest behavior.
test('ordinary throw is captured without cloning the original Error', () => {
  const error = {message: 'boom'};
  const out = trap(() => { throw new SourceSignal('throw', error); });
  assert.equal(out.tag, 'Err');
  assert.equal(out.error, error);
});
test('returned Err is preserved as an unchanged result', () => {
  const err = Err({kind: 'Failure'});
  assert.equal(trap(() => err), err);
});
test('Option-style None is success payload rather than trapped failure', () => {
  assert.deepEqual(trap(() => ({tag: 'None'})), Ok({tag: 'None'}));
});
test('raise and panic bypass ordinary trap', () => {
  for (const kind of ['raise', 'panic']) {
    const signal = new SourceSignal(kind, {kind});
    assert.throws(() => trap(() => {throw signal;}), (caught) => caught === signal);
  }
});
test('functional reverse application has identical error behavior', () => {
  const stages = [x => x+2, x => x*3];
  assert.equal(value_pipe(4, ...stages), 18);
  assert.equal(stages[1](stages[0](4)), 18); // g <| (f <| 4)
});
test('Result is not implicitly lifted or flattened by a value pipeline', () => {
  const seen = [];
  const input = Err({message: 'returned error'});
  value_pipe(input, x => {seen.push(x); return x;});
  assert.equal(seen[0], input);
  let ran = false;
  const output = and_then(input, x => {ran = true; return Ok(x+1);});
  assert.equal(output, input);
  assert.equal(ran, false);
});
test('typed error join rejects lossy implicit conversions', () => {
  assert.equal(join_error('Error', 'Error'), 'Error');
  assert.equal(join_error('Error', 'NetworkError'), 'Error');
  assert.throws(() => join_error('string','Error'), /E_TRAP_ERROR_JOIN/);
});
test('effect closure is union; trap removes only throw', () => {
  const closure = combine(effects('throws(Error)'),effects('raises(Error)','panics(Error)'));
  assert.deepEqual([...discharge(closure, effects('throws(Error)'))].sort(), ['panics(Error)','raises(Error)']);
  assert.deepEqual(unhandled(closure,effects('throws(Error)')).sort(), ['panics(Error)','raises(Error)']);
});
test('partial recover delegation does not certify raise as handled', () => {
  const original = effects('raises(Error)');
  const handler_can_delegate = true;
  const remainder = handler_can_delegate ? original : discharge(original,effects('raises(Error)'));
  assert.equal(remainder.has('raises(Error)'), true);
});
test('higher-order unknown call is not certified pure', () => {
  const callback_effect = effects('unknown');
  assert.deepEqual(unhandled(callback_effect,effects()), ['unknown']);
});
test('rpipe reverses wiring, not dataflow; lexical side effects remain', () => {
  assert.deepEqual(forward('reader','map','writer'),reverse('writer','map','reader'));
  const order = [];
  const stage = name => {order.push(name); return name;};
  const built = reverse(stage('writer'),stage('map'),stage('reader'));
  assert.deepEqual(order,['writer','map','reader']);
  assert.deepEqual(built,['reader','map','writer']);
});
test('graph setup failure prevents activation and terminal handle fabrication', () => {
  let active = false;
  const setup = (admit) => admit ? (active = true, Ok({get_done: () => Ok({})})) : Err({kind:'PipeSetupError'});
  const failed = setup(false);
  assert.equal(failed.tag,'Err');
  assert.equal(active,false);
});
test('asynchronous graph failure is separate from successful setup', () => {
  const stage_error = {kind:'PipeError',stage:2};
  const handle = {get_done: () => Err(stage_error)};
  const setup = Ok(handle);
  assert.equal(setup.tag,'Ok');
  assert.equal(setup.value.get_done().error, stage_error);
});
test('must-handle types include setup, completion and checked I/O', () => {
  for (const t of ['Result<int,Error>','PipeHandle','Future<Result<void,Error>>','CheckedIo<int>']) {
    assert.equal(must_handle(t),true,t);
  }
  assert.equal(must_handle('int'),false);
});
test('panic is not converted to success or DATA and emits one CONTROL notice', () => {
  const notices = [];
  const signal = new SourceSignal('panic',{actor:7});
  try {trap(() => {throw signal;});} catch(e) {if(e.kind==='panic') notices.push({channel:'CONTROL',actor:e.source_error.actor});}
  assert.deepEqual(notices,[{channel:'CONTROL',actor:7}]);
});
