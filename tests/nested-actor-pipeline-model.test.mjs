import test from 'node:test';
import assert from 'node:assert/strict';
import {stage, pipe, with_capacity, with_supervision, analyze_pipeline} from '../scripts/nested-actor-pipeline-model.mjs';

// SOURCE-FREE ONLY: these tests do not establish guest compiler execution or backend parity.
const s=(name,input,output)=>stage(name,input,output);
const graph=()=>pipe(s('Reader',null,'Bytes'),pipe(s('T1','Bytes','Csv'),s('T2','Csv','Rows')),s('Writer','Rows',null));
const configured=()=>with_supervision(with_capacity(graph(),1024),'#one_for_all');
const names=x=>x.nodes.map(n=>n.name);

test('nested and flat have equivalent four-stage sequential topology',()=>{
  const nested=analyze_pipeline(configured());
  const flat=analyze_pipeline(with_supervision(with_capacity(pipe(s('Reader',null,'Bytes'),s('T1','Bytes','Csv'),s('T2','Csv','Rows'),s('Writer','Rows',null)),1024),'#one_for_all'));
  assert.deepEqual(names(nested),names(flat));
  assert.equal(nested.edges.length,3);
  assert.deepEqual(nested.ports,{input:null,output:null});
  assert.deepEqual(nested.edges.map(e=>e.capacity),[1024,1024,1024]);
});

test('plain nested segment has no separate supervision scope',()=>{
  const graph=analyze_pipeline(configured());
  assert.deepEqual(graph.scopes,[{id:'root',parent:null,policy:'#one_for_all'}]);
  assert.ok(graph.nodes.every(n=>n.owner==='root'));
});

test('inner capacity overrides only internal edge; boundary edges belong to parent',()=>{
  const inner=with_capacity(pipe(s('T1','Bytes','Csv'),s('T2','Csv','Rows')),16);
  const result=analyze_pipeline(with_capacity(pipe(s('Reader',null,'Bytes'),inner,s('Writer','Rows',null)),1024));
  assert.deepEqual(result.edges.map(e=>e.capacity),[16,1024,1024]); // edge traversal is postorder
  assert.equal(result.edges.filter(e=>e.capacity===16).length,1);
  assert.equal(result.edges.filter(e=>e.capacity===1024).length,2);
});

test('explicit inner supervisor owns only nested actors and is one child scope',()=>{
  const inner=with_supervision(pipe(s('T1','Bytes','Csv'),s('T2','Csv','Rows')),'#one_for_one');
  const result=analyze_pipeline(with_supervision(pipe(s('Reader',null,'Bytes'),inner,s('Writer','Rows',null)),'#one_for_all'));
  assert.deepEqual(result.scopes,[{id:'root',parent:null,policy:'#one_for_all'},{id:'root/1',parent:'root',policy:'#one_for_one'}]);
  assert.deepEqual(result.nodes.map(n=>n.owner),['root','root/1','root/1','root']);
});

test('nested boundary type mismatch is rejected',()=>{
  assert.throws(()=>analyze_pipeline(pipe(s('Reader',null,'Bytes'),pipe(s('T1','Wrong','Csv'),s('T2','Csv','Rows')),s('Writer','Rows',null))),/incompatible/);
  assert.throws(()=>analyze_pipeline(pipe(s('Reader',null,'Bytes'),pipe(s('T1','Bytes','Csv'),s('T2','Csv','Wrong')),s('Writer','Rows',null))),/incompatible/);
});

test('source and sink misplacement rejected',()=>{
  assert.throws(()=>analyze_pipeline(pipe(s('Sink','X',null),s('B','X',null))),/source\/sink/);
  assert.throws(()=>analyze_pipeline(pipe(s('Source',null,'X'),s('Source2',null,'Y'))),/source\/sink/);
});

test('invalid pipeline shapes and duplicate descriptor identity rejected',()=>{
  assert.throws(()=>pipe(),/empty/);
  const reused=s('Transform','X','X');
  assert.throws(()=>analyze_pipeline(pipe(reused,reused)),/reused/);
  const inner=pipe(s('A','X','X'));
  assert.throws(()=>analyze_pipeline(pipe(inner,inner)),/reused/);
  assert.throws(()=>analyze_pipeline(s('A',null,null)),/root/);
});

test('capacity and strategy admission reject invalid and repeated values',()=>{
  const base=pipe(s('Only',null,null));
  for(const n of [0,-1,1.1,Number.MAX_SAFE_INTEGER+1,NaN,Infinity]){
    assert.throws(()=>with_capacity(base,n),/capacity/);
  }
  assert.throws(()=>with_capacity(with_capacity(base,1),2),/duplicate/);
  assert.throws(()=>with_supervision(base,'#unknown'),/strategy/);
  assert.throws(()=>with_supervision(with_supervision(base,'#one_for_all'),'#one_for_one'),/duplicate/);
});

test('finite default applies without explicit capacity',()=>{
  assert.equal(analyze_pipeline(pipe(s('A',null,'X'),s('B','X',null)),31).edges[0].capacity,31);
  assert.throws(()=>analyze_pipeline(pipe(s('A',null,'X')),0),/default/);
});
