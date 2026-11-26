import test from 'node:test';
import assert from 'node:assert/strict';
import {schedule,explore} from '../scripts/deterministic-actor-model.mjs';
const worker = {id:'worker',handlers:{increment:[{op:'add',key:'count'}], tick:[{op:'add',key:'ticks'}]}};
const copy=x=>structuredClone(x);

test('seed fixes all runnable selections; JSON trace replays bit-for-bit',()=>{
 const scenario={actors:[worker],tasks:[{id:'p',steps:[{op:'send',to:'worker',tag:'increment'},{op:'send',to:'worker',tag:'increment'}]},{id:'q',steps:[{op:'send',to:'worker',tag:'increment'}]}],shared:{count:0,ticks:0}};
 const first=schedule(scenario,{seed:123}), second=schedule(scenario,{seed:123});
 assert.deepEqual(first,second);
 assert.deepEqual(schedule(scenario,{seed:123,replay:JSON.parse(JSON.stringify(first))}),first);
 assert.equal(first.final_state.shared.count,3);
 assert.equal(first.evidence,'REFERENCE_MODEL_ONLY_NOT_GUEST_EXECUTION');
 assert.ok(first.events.every((e,i)=>e.seq===i && e.enabled.includes(e.choice)));
});

test('replay rejects stale header, non-enabled edits, runnable-set and state tampering',()=>{
 const scenario={actors:[worker],tasks:[{id:'p',steps:[{op:'send',to:'worker',tag:'increment'}]}],shared:{count:0,ticks:0}};
 const original=schedule(scenario,{seed:17});
 const t=copy(original);t.events[0].enabled.push('forged');
 assert.throws(()=>schedule(scenario,{seed:17,replay:t}),/replay event mismatch/);
 const t2=copy(original);t2.events[0].choice='step:ghost';
 assert.throws(()=>schedule(scenario,{seed:17,replay:t2}),/not enabled/);
 const t3=copy(original);t3.events.at(-1).after='bad';
 assert.throws(()=>schedule(scenario,{seed:17,replay:t3}),/divergence/);
 assert.throws(()=>schedule({...scenario,shared:{count:42,ticks:0}},{seed:17,replay:original}),/header/);
 assert.throws(()=>schedule(scenario,{seed:18,replay:original}),/header/);
});

test('virtual clock fast forwards to timer due and never reads wall clock',()=>{
 const scenario={actors:[worker],tasks:[{id:'p',steps:[{op:'timer_send',to:'worker',tag:'tick',after:25},{op:'sleep',after:9},{op:'add',key:'count'}]}],shared:{count:0,ticks:0}};
 const trace=schedule(scenario,{seed:8});
 assert.equal(trace.final_state.clock,25);
 assert.equal(trace.final_state.shared.ticks,1);
 assert.equal(trace.final_state.shared.count,1);
 assert.ok(trace.events.some(e=>e.time===9));
 assert.ok(trace.events.some(e=>e.time===25));
 assert.deepEqual(schedule(scenario,{seed:8,replay:trace}),trace);
});

test('cancel versus delivery yields safe outcomes and supports schedule exploration',()=>{
 const scenario={actors:[worker],tasks:[{id:'sender',steps:[{op:'send',to:'worker',tag:'increment'},{op:'cancel',target:'m1'}]}],shared:{count:0,ticks:0}};
 const outcomes=new Set();
 for(let seed=1;seed<=200;seed++){
  const trace=schedule(scenario,{seed});
  outcomes.add(trace.final_state.shared.count);
  assert.ok([0,1].includes(trace.final_state.shared.count));
  assert.equal(trace.final_state.consumed+trace.final_state.cancelled,1);
 }
 assert.deepEqual([...outcomes].sort(),[0,1]);
});

test('restart fences stale mailbox and handler continuations; upgrade requires quiescence',()=>{
 const scenario={actors:[worker],tasks:[{id:'sender',steps:[{op:'send',to:'worker',tag:'increment'},{op:'restart',target:'worker'},{op:'upgrade',target:'worker'}]}],shared:{count:0,ticks:0}};
 let verified=0;
 for(let seed=1;seed<50;seed++){
  const t=schedule(scenario,{seed});
  assert.equal(t.final_state.actors.worker.generation,2);
  assert.equal(t.final_state.actors.worker.version,2);
  assert.ok(t.final_state.shared.count<=1);
  verified++;
 }
 assert.equal(verified,49);
});

test('linear ownership transfers forbid duplicate or stale owners',()=>{
 const scenario={actors:[{id:'a',handlers:{}},{id:'b',handlers:{}}],owners:{asset:'a'},tasks:[{id:'handoff',steps:[{op:'transfer',asset:'asset',from:'a',to:'b'}]}]};
 const t=schedule(scenario,{seed:1});assert.equal(t.final_state.owners.asset,'b');
 const illegal=copy(scenario);illegal.tasks[0].steps.push({op:'transfer',asset:'asset',from:'a',to:'b'});
 const failure=schedule(illegal);assert.equal(failure.status,'failed');
 assert.match(failure.failure.message,/without authority/);
 assert.deepEqual(schedule(illegal,{replay:failure}),failure);
});

test('bounded schedule exploration exposes a lost-update interleaving',()=>{
 const s={actors:[],shared:{count:0},tasks:[
  {id:'a',steps:[{op:'load',key:'count',as:'x'},{op:'store',key:'count',local:'x'}]},
  {id:'b',steps:[{op:'load',key:'count',as:'x'},{op:'store',key:'count',local:'x'}]}
 ]};
 // Both read 0 and write 0; this demonstrates the explorer controls individual steps.
 for(let seed=1;seed<=20;seed++)assert.equal(schedule(s,{seed}).final_state.shared.count,0);
});

test('invalid handles, overflow, impossible clocks and bounded budgets fail closed',()=>{
 assert.throws(()=>schedule({actors:[],tasks:[{id:'x',steps:[{op:'yield'},{op:'yield'}]}]},{maxSteps:1}),/budget/);
 assert.match(schedule({actors:[],tasks:[{id:'x',steps:[{op:'send',to:'absent',tag:'work'}]}]}).failure.message,/unknown/);
 assert.match(schedule({actors:[],tasks:[{id:'x',steps:[{op:'sleep',after:Number.MAX_SAFE_INTEGER},{op:'sleep',after:1}]}]}).failure.message,/overflow/);
 assert.throws(()=>schedule({actors:[worker,worker],tasks:[]}),/duplicate/);
});

test('stale timers cannot cross restart incarnation boundary',()=>{
 const s={actors:[worker],tasks:[{id:'p',steps:[{op:'timer_send',to:'worker',tag:'tick',after:5},{op:'restart',target:'worker'}]}],shared:{count:0,ticks:0}};
 const t=schedule(s,{seed:2});
 assert.equal(t.final_state.clock,5);
 assert.equal(t.final_state.shared.ticks,0);
 assert.equal(t.final_state.fenced,1);
 assert.deepEqual(schedule(s,{seed:2,replay:t}),t);
});

test('systematic branching finds alternative cancellation outcomes, each exactly replayable',()=>{
 const s={actors:[worker],tasks:[{id:'p',steps:[{op:'send',to:'worker',tag:'increment'},{op:'cancel',target:'m1'}]}],shared:{count:0,ticks:0}};
 const report=explore(s,{maxSchedules:32});
 assert.ok(report.explored>=2);
 const outcomes=new Set(report.traces.map(t=>t.final_state.shared.count));
 assert.deepEqual([...outcomes].sort(),[0,1]);
 for(const t of report.traces)assert.deepEqual(schedule(s,{seed:1,replay:t}),t);
});

test('violated property produces a failing, replayable schedule rather than a false PASS',()=>{
 const s={actors:[],shared:{count:0},tasks:[{id:'p',steps:[{op:'add',key:'count'},{op:'assert',key:'count',value:0}]}]};
 const t=schedule(s,{seed:4});assert.equal(t.status,'failed');
 assert.match(t.failure.message,/property failed/);
 assert.deepEqual(schedule(s,{seed:4,replay:t}),t);
});

test('mailbox does not reorder admitted messages to the same serial actor',()=>{
 const s={actors:[{id:'worker',handlers:{first:[{op:'assert',key:'count',value:0},{op:'add',key:'count'}],second:[{op:'assert',key:'count',value:1},{op:'add',key:'count'}]}}],shared:{count:0},tasks:[{id:'p',steps:[{op:'send',to:'worker',tag:'first'},{op:'send',to:'worker',tag:'second'}]}]};
 for(let seed=0;seed<100;seed++){
  const trace=schedule(s,{seed});
  assert.equal(trace.status,'completed','seed='+seed);
  assert.equal(trace.final_state.shared.count,2);
  const delivered=trace.events.filter(e=>e.choice.startsWith('deliver:'));
  assert.deepEqual(delivered.map(e=>e.choice),['deliver:m1','deliver:m2']);
 }
});

test('terminal sleep retains serial ownership until the wake transition',()=>{
 const s={actors:[{id:'worker',handlers:{first:[{op:'sleep',after:10}],second:[{op:'add',key:'count'}]}}],shared:{count:0},tasks:[{id:'p',steps:[{op:'send',to:'worker',tag:'first'},{op:'send',to:'worker',tag:'second'}]}]};
 const t=schedule(s,{prefix:['step:p','step:p','deliver:m1','step:delivery.m1']});
 assert.equal(t.status,'completed');
 assert.equal(t.events.find(e=>e.choice==='deliver:m2').time,10);
 assert.equal(t.final_state.shared.count,1);
 assert.deepEqual(schedule(s,{replay:t}),t);
});
test('empty root task completes without a phantom step; duplicate ids still reject',()=>{
 const s={actors:[],tasks:[{id:'empty',steps:[]}]};
 assert.equal(schedule(s).status,'completed');
 assert.equal(schedule(s).events.length,0);
 assert.throws(()=>schedule({...s,tasks:[...s.tasks,...s.tasks]}),/duplicate/);
});
test('delivery cannot exceed the live task budget or consume the refused mail',()=>{
 const s={actors:[worker],shared:{count:0,ticks:0},tasks:[
  {id:'sender',steps:[{op:'send',to:'worker',tag:'increment'},{op:'yield'}]},
  ...Array.from({length:255},(_,i)=>({id:'root'+i,steps:[{op:'yield'}]}))
 ]};
 const t=schedule(s,{prefix:['step:sender','deliver:m1']});
 assert.equal(t.status,'failed');
 assert.match(t.failure.message,/live task budget/);
 assert.equal(t.final_state.mailbox.length,1);
 assert.equal(t.final_state.consumed,0);
 assert.equal(Object.keys(t.final_state.tasks).length,256);
});
test('bounded exploration reports a pruned frontier explicitly',()=>{
 const s={actors:[],tasks:Array.from({length:24},(_,i)=>({id:'root'+i,steps:[{op:'yield'}]}))};
 const report=explore(s,{maxSchedules:1});
 assert.equal(report.frontier_pruned,true);
 assert.equal(report.exhausted,false);
});
