// Host-only executable oracle for the proposed unwind transition rules.
// Does not compile or execute an AttoLang guest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const rank = { normal: 0, return: 0, throw: 1, raise: 2, panic: 3, cancel: 4, fatal: 5 };
const outcome = (kind, id) => ({kind, id, supplemental: [], overflow: 0});
function combine(pending, escaped, limit = 4) {
  if (!(pending.kind in rank) || !(escaped.kind in rank)) throw new Error('unknown outcome');
  if (escaped.kind === 'normal' || escaped.kind === 'return') return pending;
  const callback = ['throw','raise'].includes(escaped.kind)
    ? {...escaped, kind: 'panic', origin: escaped.kind} : escaped;
  const wins = rank[callback.kind] > rank[pending.kind];
  const primary = wins ? callback : pending;
  const secondary = wins ? pending : callback;
  const records = [...primary.supplemental];
  let overflow = primary.overflow + secondary.overflow;
  if (rank[secondary.kind] > 0) {
    for (const v of [{kind: secondary.kind, id: secondary.id, origin: secondary.origin}, ...secondary.supplemental]) {
      if (records.length < limit) records.push(v); else overflow++;
    }
  }
  return {...primary, supplemental: records, overflow};
}
function drain(pending, callbacks, limit) {
  const trace = [];
  for (const [name, escaped] of [...callbacks].reverse()) {
    if (pending.kind === 'fatal') break;
    trace.push(name);
    pending = combine(pending, escaped, limit);
  }
  return {pending, trace};
}
const recoverEligible = kind => kind === 'throw' || kind === 'raise';
test('every pair: terminal precedence and callback boundary conversion', () => {
  for (const p of Object.keys(rank)) for (const e of Object.keys(rank)) {
    const pending = outcome(p,'prior');
    const escaped = outcome(e,'callback');
    const r = combine(pending,escaped);
    const normalized = ['throw','raise'].includes(e) ? 'panic' : e;
    const winner = rank[normalized] > rank[p] ? normalized : p;
    assert.equal(r.kind,winner, p+'/'+e);
    if (rank[p] > 0 && rank[normalized] > 0)
      assert.equal(r.supplemental[0].id, r.id === 'prior' ? 'callback' : 'prior');
  }
});
test('return is snapshotted; successful callbacks cannot replace it', () => {
  assert.equal(combine(outcome('return',40),outcome('return',2)).id,40);
});
test('LIFO drain; first panic remains primary; all safe callbacks run', () => {
  const r = drain(outcome('throw','original'),[['A',outcome('raise','a')],['B',outcome('throw','b')],['C',outcome('normal','c')]]);
  assert.deepEqual(r.trace,['C','B','A']);
  assert.equal(r.pending.kind,'panic');
  assert.equal(r.pending.id,'b');
  assert.deepEqual(r.pending.supplemental.map(x=>x.id),['original','a']);
  assert.equal(recoverEligible(r.pending.kind),false);
});
test('cancellation remains primary and retains callback panic', () => {
  const r = combine(outcome('cancel','stop'),outcome('throw','cleanup'));
  assert.equal(r.kind,'cancel');
  assert.equal(r.supplemental[0].kind,'panic');
  assert.equal(r.supplemental[0].origin,'throw');
  assert.equal(recoverEligible(r.kind),false);
});
test('bounded diagnostics and overflow count', () => {
  const r = drain(outcome('panic','primary'),Array.from({length:9},(_,i)=>[String(i),outcome('raise',String(i))]),3);
  assert.equal(r.pending.id,'primary');
  assert.equal(r.pending.supplemental.length,3);
  assert.equal(r.pending.overflow,6);
  assert.equal(r.trace.length,9);
});
test('forced fatal stops unsafe subsequent callback execution', () => {
  const r = drain(outcome('return',42),[['A',outcome('normal','a')],['B',outcome('fatal','fatal')]]);
  assert.deepEqual(r.trace,['B']);
  assert.equal(r.pending.kind,'fatal');
});
test('unknown outcomes fail closed', () => {
  assert.throws(()=>combine(outcome('return',0),outcome('forged','x')));
});
