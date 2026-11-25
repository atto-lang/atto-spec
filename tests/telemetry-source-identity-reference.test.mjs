import test from 'node:test';
import assert from 'node:assert/strict';
function table(rows){const ids=new Set();for(const r of rows){if(!/^rid_[a-f0-9]{32}$/.test(r.routine)||!/^sid_[a-f0-9]{32}$/.test(r.site)||ids.has(r.site))throw Error('invalid identity');ids.add(r.site)}return Object.freeze(rows.map(r=>Object.freeze({...r})))}
function record(build,site,trace,span){if(!/^[a-f0-9]{32}$/.test(trace)||! /^[a-f0-9]{16}$/.test(span)||/^0+$/.test(trace)||/^0+$/.test(span))throw Error('trace context');return {build,trace_id:trace,span_id:span,attributes:{'atto.source.site_id':site.site,'atto.source.routine_id':site.routine}}}
const r={routine:'rid_'+'a'.repeat(32),site:'sid_'+'b'.repeat(32),event:'same'};
test('same event may have distinct sites, duplicate IDs reject',()=>{assert.equal(table([r,{...r,site:'sid_'+'c'.repeat(32)}]).length,2);assert.throws(()=>table([r,{...r}]),/identity/)});
test('source ID stays stable across runtime invocations and build generations',()=>{const site=table([r])[0],a=record('build1',site,'d'.repeat(32),'e'.repeat(16)),b=record('build2',site,'f'.repeat(32),'1'.repeat(16));assert.deepEqual(a.attributes,b.attributes);assert.notEqual(a.trace_id,b.trace_id);assert.notEqual(a.build,b.build);assert.throws(()=>record('build1',site,r.site,'e'.repeat(16)),/trace context/)});
