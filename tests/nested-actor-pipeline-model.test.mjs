import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stage, pipe, with_capacity, with_supervision, analyze_pipeline,
  restart_targets, DEFAULT_LIMITS,
} from '../scripts/nested-actor-pipeline-model.mjs';

// SOURCE-FREE only: NO AttoLang parser/compiler, mailbox, supervisor or runtime is run.
const s = (name, input, output) => stage(name, input, output);
const base = () => pipe(
  s('Reader', null, 'Bytes'),
  pipe(s('T1', 'Bytes', 'Csv'), s('T2', 'Csv', 'Rows')),
  s('Writer', 'Rows', null),
);
const configured = () => with_supervision(with_capacity(base(), 1024), '#one_for_all');
const flat = () => with_supervision(with_capacity(pipe(
  s('Reader', null, 'Bytes'), s('T1', 'Bytes', 'Csv'),
  s('T2', 'Csv', 'Rows'), s('Writer', 'Rows', null),
), 1024), '#one_for_all');
const nodeNames = p => p.nodes.map(n => n.name);
const endpoints = p => p.edges.map(e => [p.nodes.find(n => n.id === e.from).name, p.nodes.find(n => n.id === e.to).name]);

// Metamorphic properties, deterministic layout and budgets.
test('flat and nested are equivalent by names, DATA edges, capacities, and public ports', () => {
  const a = analyze_pipeline(configured());
  const b = analyze_pipeline(flat());
  assert.deepEqual(nodeNames(a), nodeNames(b));
  assert.deepEqual(endpoints(a), endpoints(b));
  assert.deepEqual(a.edges.map(x => x.capacity), [1024, 1024, 1024]);
  assert.deepEqual(a.edges.map(x => x.capacity), b.edges.map(x => x.capacity));
  assert.deepEqual(a.ports, {input: null, output: null});
  assert.equal(a.totalSlots, 3072);
});

test('canonical DATA edges are in source sequence, even through nested segments', () => {
  const result = analyze_pipeline(configured());
  assert.deepEqual(endpoints(result), [['Reader','T1'], ['T1','T2'], ['T2','Writer']]);
  assert.deepEqual(result.edges.map(e => e.owner), ['root', 'root', 'root']);
});

test('plain nesting does not create an extra supervisor or change ownership', () => {
  const result = analyze_pipeline(configured());
  assert.deepEqual(result.scopes.map(s => [s.id, s.parent, s.policy]), [['root',null,'#one_for_all']]);
  assert.deepEqual(result.scopes[0].children.map(c => [c.kind,c.order]),
    [['actor',0],['actor',1],['actor',2],['actor',3]]);
  assert.ok(result.nodes.every(n => n.owner === 'root'));
});

test('capacity override applies only to inside edge, not incoming or outgoing boundary edges', () => {
  const inner = with_capacity(pipe(s('T1','Bytes','Csv'),s('T2','Csv','Rows')),16);
  const result = analyze_pipeline(with_capacity(pipe(s('Reader',null,'Bytes'),inner,s('Writer','Rows',null)),1024));
  assert.deepEqual(result.edges.map(e => e.capacity), [1024,16,1024]);
  assert.equal(result.totalSlots, 2064);
});

test('multiple levels inherit capacity through plain nesting and override nearest explicit ancestor', () => {
  const middle = pipe(s('M','X','X'), with_capacity(pipe(s('N','X','X'), s('O','X','X')), 7), s('P','X','X'));
  const result = analyze_pipeline(with_capacity(pipe(s('A',null,'X'), middle, s('Z','X',null)),30));
  assert.deepEqual(result.edges.map(e => e.capacity), [30,30,7,30,30]);
});

test('explicit inner supervisor creates one child unit in parent, preserving child order', () => {
  const inner = with_supervision(pipe(s('T1','Bytes','Csv'),s('T2','Csv','Rows')),'#one_for_one');
  const p = analyze_pipeline(with_supervision(pipe(s('Reader',null,'Bytes'),inner,s('Writer','Rows',null)),'#one_for_all'));
  assert.deepEqual(p.scopes.map(s => [s.id,s.parent,s.policy]), [['root',null,'#one_for_all'],['root/1','root','#one_for_one']]);
  assert.deepEqual(p.scopes[0].children.map(c => [c.kind,c.order]), [['actor',0],['supervisor',1],['actor',2]]);
  assert.deepEqual(p.nodes.map(n => n.owner), ['root','root/1','root/1','root']);
  assert.deepEqual(p.edges.map(e => e.owner), ['root','root/1','root']);
});

test('one_for_all treats inner supervisor as one direct child, never individual grandchildren', () => {
  const inner = with_supervision(pipe(s('T1','Bytes','Csv'),s('T2','Csv','Rows')),'#one_for_one');
  const p = analyze_pipeline(with_supervision(pipe(s('Reader',null,'Bytes'),inner,s('Writer','Rows',null)),'#one_for_all'));
  assert.deepEqual(restart_targets(p,'root','root/0'),['root/0','root/1','root/2']);
  assert.deepEqual(restart_targets(p,'root/1','root/1/0'),['root/1/0']);
  assert.throws(() => restart_targets(p,'root','root/1/0'),/direct child/);
});

test('rest_for_one selects immutable registration order, including supervisor child as one unit', () => {
  const inner = with_supervision(pipe(s('B','X','X'),s('C','X','X')),'#one_for_one');
  const p = analyze_pipeline(with_supervision(pipe(s('A',null,'X'),inner,s('D','X',null)),'#rest_for_one'));
  assert.deepEqual(restart_targets(p,'root','root/1'),['root/1','root/2']);
  assert.deepEqual(restart_targets(p,'root','root/2'),['root/2']);
  assert.deepEqual(restart_targets(p,'root','root/0'),['root/0','root/1','root/2']);
});

test('nested scope inside plain segment attaches to nearest real supervisor', () => {
  const deep = with_supervision(pipe(s('B','X','X')),'#one_for_one');
  const p = analyze_pipeline(pipe(s('A',null,'X'),pipe(deep),s('C','X',null)));
  assert.deepEqual(p.scopes.map(s=>[s.id,s.parent]),[['root',null],['root/1/0','root']]);
  assert.deepEqual(p.scopes[0].children.map(c=>c.kind),['actor','supervisor','actor']);
});

test('one-stage pipeline keeps ports and consumes no DATA-edge capacity', () => {
  const p = analyze_pipeline(pipe(s('Single','I','O')));
  assert.deepEqual(p.ports,{input:'I',output:'O'});
  assert.deepEqual(p.edges,[]);
  assert.equal(p.totalSlots,0);
});

test('deeply nested plain segments preserve source/sink ports', () => {
  const p = analyze_pipeline(pipe(pipe(pipe(s('Only','In','Out')))));
  assert.deepEqual(p.ports,{input:'In',output:'Out'});
  assert.equal(p.scopes.length,1);
});

test('type mismatch detected on both boundaries of nested segment', () => {
  assert.throws(()=>analyze_pipeline(pipe(s('R',null,'X'),pipe(s('A','Wrong','Y')),s('W','Y',null))),/incompatible/);
  assert.throws(()=>analyze_pipeline(pipe(s('R',null,'X'),pipe(s('A','X','Y')),s('W','Wrong',null))),/incompatible/);
  assert.throws(()=>analyze_pipeline(pipe(s('R',null,'X'),pipe(s('A','X','Y'),s('B','Wrong','Z')),s('W','Z',null))),/incompatible/);
});

test('source and sink can be at overall ends only', () => {
  assert.throws(()=>analyze_pipeline(pipe(s('Sink','X',null),s('B','X',null))),/source\/sink/);
  assert.throws(()=>analyze_pipeline(pipe(s('Source',null,'X'),s('Source2',null,'Y'))),/source\/sink/);
  assert.throws(()=>analyze_pipeline(pipe(s('A','X','Y'),pipe(s('Sink','Y',null)),s('B','Z',null))),/source\/sink/);
});

test('empty pipelines, arbitrary objects, runtime actor refs and forged descriptors fail closed', () => {
  assert.throws(()=>pipe(),/empty/);
  assert.throws(()=>pipe({kind:'stage', name:'Evil', input:'A', output:'A'}),/forged/);
  assert.throws(()=>pipe({kind:'pipe', parts:[s('A','X','X')], capacity:null, supervision:null}),/forged/);
  assert.throws(()=>pipe({kind:'actor-ref',name:'Live'}),/forged/);
  assert.throws(()=>with_capacity({kind:'pipe',parts:[]},1),/forged/);
  assert.throws(()=>with_supervision({kind:'pipe',parts:[]},'#one_for_one'),/forged/);
  assert.throws(()=>analyze_pipeline({kind:'pipe',parts:[s('A',null,null)]}),/root/);
});

test('reused actors and shared inner builders are rejected (aliasing in one tree)', () => {
  const one = s('Step','X','X');
  assert.throws(()=>analyze_pipeline(pipe(one,one)),/reused/);
  const inner = pipe(s('A','X','X'));
  assert.throws(()=>analyze_pipeline(pipe(inner,inner)),/reused/);
  const configuredInner = with_capacity(inner,8);
  assert.throws(()=>analyze_pipeline(pipe(inner,configuredInner)),/reused/);
});

test('descriptors and plans are immutable', () => {
  const descriptor = s('A',null,'X');
  assert.equal(Object.isFrozen(descriptor),true);
  const builder = pipe(descriptor,s('B','X',null));
  assert.ok(Object.isFrozen(builder));
  assert.ok(Object.isFrozen(builder.parts));
  const plan = analyze_pipeline(builder);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.scopes[0].children));
  assert.ok(Object.isFrozen(plan.edges[0]));
  assert.throws(()=>{plan.scopes[0].children[0].order=99},/read only/);
});

test('invalid name/type ports rejected before composition', () => {
  for(const name of ['',' whitespace','foo-bar', '1invalid']) assert.throws(()=>s(name,'X','X'),/name/);
  for(const port of ['', ' X ', 123, undefined, {}, Symbol('bad')]) assert.throws(()=>s('A',port,'X'),/port/);
});

test('configuration rejects zero/negative/non-integral/unsafe capacity and duplicates', () => {
  const p = pipe(s('A',null,null));
  for(const n of [0,-1,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>with_capacity(p,n),/capacity/);
  assert.throws(()=>with_capacity(with_capacity(p,1),2),/duplicate/);
  assert.throws(()=>with_supervision(p,'#bogus'),/strategy/);
  assert.throws(()=>with_supervision(with_supervision(p,'#one_for_all'),'#one_for_one'),/duplicate/);
});

test('default edge capacity is finite and bounded by maxEdgeCapacity', () => {
  const b = pipe(s('A',null,'X'),s('B','X',null));
  assert.equal(analyze_pipeline(b).edges[0].capacity,DEFAULT_LIMITS.defaultCapacity);
  assert.equal(analyze_pipeline(b,{defaultCapacity:17}).edges[0].capacity,17);
  assert.throws(()=>analyze_pipeline(b,{defaultCapacity:7,maxEdgeCapacity:6}),/default capacity/);
  assert.throws(()=>analyze_pipeline(with_capacity(b,300),{maxEdgeCapacity:32}),/edge capacity/);
});

test('total slot quota includes every edge and cannot silently overflow', () => {
  const b = with_capacity(pipe(s('A',null,'X'),s('B','X','X'),s('C','X',null)),600);
  assert.throws(()=>analyze_pipeline(b,{maxTotalSlots:1199}),/aggregate/);
  assert.equal(analyze_pipeline(b,{maxTotalSlots:1200}).totalSlots,1200);
});

test('actor count and edge count quotas apply independently', () => {
  const b = pipe(s('A',null,'X'),s('B','X','X'),s('C','X',null));
  assert.throws(()=>analyze_pipeline(b,{maxStages:2}),/stage budget/);
  assert.throws(()=>analyze_pipeline(b,{maxEdges:1}),/edge budget/);
  assert.equal(analyze_pipeline(b,{maxStages:3,maxEdges:2}).edges.length,2);
});

test('nested pipeline depth budget rejects excessive recursion', () => {
  let b = pipe(s('A',null,null));
  for(let i=0;i<4;i++) b=pipe(b);
  assert.throws(()=>analyze_pipeline(b,{maxDepth:4}),/depth/);
  assert.equal(analyze_pipeline(b,{maxDepth:5}).nodes.length,1);
});

test('explicit supervisor scope budget applies at every level', () => {
  const s1 = with_supervision(pipe(s('A',null,'X')),'#one_for_one');
  const s2 = with_supervision(pipe(s('B','X',null)),'#one_for_all');
  const b = pipe(s1,s2);
  assert.throws(()=>analyze_pipeline(b,{maxScopes:2}),/scope budget/);
  assert.equal(analyze_pipeline(b,{maxScopes:3}).scopes.length,3);
});

test('unknown or malformed budget knobs fail closed', () => {
  const b=pipe(s('A',null,null));
  for(const opts of [null,[],42,{unknown:4},{maxDepth:0},{maxStages:1.2},{maxEdges:-2},{maxTotalSlots:Number.MAX_SAFE_INTEGER+1}]) {
    assert.throws(()=>analyze_pipeline(b,opts));
  }
  const accessor={};Object.defineProperty(accessor,'maxStages',{enumerable:true,get(){throw Error('getter must not execute')}});
  assert.throws(()=>analyze_pipeline(b,accessor),/invalid limit property/);
});

test('the source-free analyzer never marks a builder consumed or pretends to start actors', () => {
  const b=base();
  const a=analyze_pipeline(b),c=analyze_pipeline(b);
  assert.deepEqual(a,c);
  assert.equal(Object.hasOwn(a,'started'),false);
  assert.equal(Object.hasOwn(a,'generation'),false);
});

test('stable deterministic composition across a seeded variety of nested partitions', () => {
  const names=['A','B','C','D','E','F','G','H'];
  for (let length=2;length<=8;length++) {
    const input=names.slice(0,length).map((name,index)=>s(name,index===0?null:'X',index===length-1?null:'X'));
    const flatPlan=analyze_pipeline(pipe(...input));
    for (let split=1;split<length;split++) {
      const alt=names.slice(0,length).map((name,index)=>s(name,index===0?null:'X',index===length-1?null:'X'));
      const left=split===1?alt[0]:pipe(...alt.slice(0,split));
      const right=length-split===1?alt[split]:pipe(...alt.slice(split));
      const nested=analyze_pipeline(pipe(left,right));
      assert.deepEqual(nodeNames(nested),nodeNames(flatPlan));
      assert.deepEqual(endpoints(nested),endpoints(flatPlan));
      assert.equal(nested.totalSlots,flatPlan.totalSlots);
    }
  }
});


test('unsupervised graph inherits caller supervisor; plain grouping mints no supervisor', () => {
  const p = analyze_pipeline(base());
  assert.equal(p.scopes.length, 1);
  assert.deepEqual([p.scopes[0].policy,p.scopes[0].physical], [null,false]);
  assert.throws(() => restart_targets(p,'root','root/0'),/inherited supervisor/);
});

test('configured supervision is an explicit physical child-supervisor scope', () => {
  const p = analyze_pipeline(configured());
  assert.deepEqual([p.scopes[0].policy,p.scopes[0].physical], ['#one_for_all',true]);
  assert.deepEqual(restart_targets(p,'root','root/0').length,4);
});

test('restart policy helper rejects spoofed analysis plans', () => {
  assert.throws(() => restart_targets({scopes:[{id:'root',policy:'#one_for_all',children:[]}]}, 'root','bad'),/unverified/);
});

test('model limit overrides cannot disable hard upper safety budgets', () => {
  const b=pipe(s('A',null,null));
  for (const opts of [{maxDepth:100000},{maxStages:999999999},{maxTotalSlots:Number.MAX_SAFE_INTEGER},{maxEdgeCapacity:2**32}]) {
    assert.throws(()=>analyze_pipeline(b,opts),/invalid limit/);
  }
});
