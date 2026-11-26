import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync(new URL('../conformance/nominal-method-spelling-v1.json',import.meta.url),'utf8'));
test('method spelling corpus covers every backend without certifying execution',()=>{
  assert.equal(m.status,'CANDIDATE_NOT_EXECUTED');
  assert.deepEqual(Object.keys(m.compiler_targets).sort(),['atto','cranelift','forge','hdl','java','js','llvm','net','realtime','rs','wasm']);
  assert.ok(Object.values(m.compiler_targets).every(v=>v==='NOT_EXECUTED'));
  assert.equal(m.cases.length,35);
  assert.equal(new Set(m.cases.map(c=>c.id)).size,35);
  for(const kind of ['interface','trait']){
    for(const spelling of ['bare','fnc','mtd']){
      const p=m.cases.find(c=>c.id===kind+'.'+spelling+'.positive');
      const n=m.cases.find(c=>c.id===kind+'.'+spelling+'.missing');
      assert.equal(p.expected_return_int,42);
      assert.equal(n.expect,'semantic_reject');
      assert.equal(n.no_artifact,true);
      assert.equal(n.diagnostic_family,'MISSING_INSTANCE_OBLIGATION');
      assert.equal(p.source.split('\n')[0],n.source.split('\n')[0]);
      assert.equal(p.status,'NOT_EXECUTED');
      assert.equal(n.status,'NOT_EXECUTED');
    }
  }
});

test('contextual class method names dispatch and collide across spellings',()=>{
  const declaration=(name,spelling)=>`pub ${spelling==='bare'?'':spelling+' '}${name}(): int { return 42; }`;
  for(const name of ['ping','mtd','method']){
    for(const spelling of ['bare','fnc','mtd']){
      const c=m.cases.find(c=>c.id===`class.${name}.${spelling}.positive`);
      assert.equal(c.expect,'compile_and_run');
      assert.equal(c.expected_return_int,42);
      assert.equal(c.source,`define class C as ${declaration(name,spelling)} end\npub fnc main(): int { return new C().${name}(); }\n`);
    }
    for(const [first,second] of [['bare','mtd'],['mtd','fnc'],['fnc','bare']]){
      const c=m.cases.find(c=>c.id===`class.${name}.${first}-${second}.duplicate`);
      assert.equal(c.expect,'semantic_reject');
      assert.equal(c.no_artifact,true);
      assert.equal(c.diagnostic_family,'DUPLICATE_INSTANCE_METHOD');
      assert.equal(c.source,`define class C as ${declaration(name,first)} ${declaration(name,second)} end\npub fnc main(): int { return 0; }\n`);
    }
  }
});

test('every candidate remains unexecuted and has a disjoint outcome contract',()=>{
  for(const c of m.cases){
    assert.equal(c.status,'NOT_EXECUTED');
    assert.equal(c.entry,'main.atto');
    if(c.expect==='compile_and_run'){
      assert.equal(c.expected_return_int,42);
      assert.ok(!Object.hasOwn(c,'diagnostic_family')&&!Object.hasOwn(c,'no_artifact'));
    }else{
      assert.ok(['semantic_reject','syntax_reject'].includes(c.expect));
      assert.equal(c.no_artifact,true);
      assert.ok(!Object.hasOwn(c,'expected_return_int'));
    }
  }
});

test('obsolete method introducer is rejected, not normalized',()=>{
  assert.equal(m.formatting.obsolete_method_introducer,'reject_not_rewrite');
  for(const kind of ['class','actor','struct','interface','trait']){
    const c=m.cases.find(c=>c.id===kind+'.obsolete-method.reject');
    const body=['interface','trait'].includes(kind)?'method ping(): int;':'method ping(): int { return 42; }';
    assert.equal(c.source,`define ${kind} C as ${body} end\npub fnc main(): int { return 0; }\n`);
    assert.equal(c.expect,'syntax_reject');
    assert.equal(c.diagnostic_family,'OBSOLETE_METHOD_INTRODUCER');
    assert.equal(c.no_artifact,true);
  }
});
