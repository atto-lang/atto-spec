import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {bind, normalize, arityIntervalsOverlap, BindingError} from "./helpers/optional-named-binder-reference.mjs";

const contract=JSON.parse(readFileSync(new URL("../contracts/optional-named-parameters-v1/cases.json",import.meta.url),"utf8"));
const sourceCases=contract.cases;

test("contract is uniquely versioned and never certifies guest execution",()=>{
  assert.equal(contract.schema,"attolang.optional-named-parameters.v1");
  assert.equal(contract.status,"SOURCE_FREE_MODEL_NOT_GUEST_EXECUTION");
  assert.equal(contract.canonical_source_extension,".atto");
  assert.ok(sourceCases.length>=25);
  assert.equal(new Set(sourceCases.map(c=>c.id)).size,sourceCases.length);
  assert.ok(Object.values(contract.backend_evidence).every(v=>v==="NOT_VERIFIED"));
  assert.ok(sourceCases.every(c=>c.source.includes("fnc ") && (Array.isArray(c.slots) !== Boolean(c.reject))));
});

test("all documented source shapes have independent expected slot/evaluation or rejection outcomes",()=>{
  for(const c of sourceCases){
    if(c.reject){
      assert.throws(()=>bind(c.formals,c.items),e=>e instanceof BindingError&&e.code===c.reject,c.id);
    }else{
      const got=bind(c.formals,c.items);
      assert.deepEqual(got.slots,c.slots,c.id);
      assert.deepEqual(got.evaluatedCallItemIndices,c.eval,c.id);
      assert.deepEqual(got.provenance.map(x=>x.rawIndex),c.items.map((_,i)=>i),c.id);
      assert.equal(new Set(got.provenance.map(x=>x.formalIndex)).size,c.items.length,c.id);
    }
  }
});

test("type suffix sugar and formal omission bit are independent",()=>{
  const shape=normalize([{name:"a",type:"int?"},{name:"b",type:"Option<int>",omittable:true},{name:"c",type:"Option<int>?"}]);
  assert.deepEqual(shape.map(p=>[p.type,p.omittable,p.defaultKind]),[
    ["Option<int>",false,null],["Option<int>",true,"typed_none"],["Option<Option<int>>",false,null]
  ]);
});

test("labels do not resolve overlapping optional-arity overloads",()=>{
  const a=[{name:"one",type:"int",omittable:true,default:1,defaultKind:"constant",defaultType:"int"},{name:"two",type:"int"}];
  const b=[{name:"other",type:"int"}];
  assert.equal(arityIntervalsOverlap(a,b),true);
  assert.equal(arityIntervalsOverlap([{name:"a",type:"int"},{name:"b",type:"int"}],[{name:"a",type:"int"}]),false);
});

test("seeded named permutation and explicit omission preserve strict source provenance",()=>{
  let seed=0xA7702026;
  const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  const f=Array.from({length:6},(_,i)=>({name:"p"+i,type:"int?",omittable:true}));
  for(let trial=0;trial<1200;trial++){
    const names=[...f.map(p=>p.name)];
    for(let i=names.length-1;i>0;i--){const j=next()%(i+1);[names[i],names[j]]=[names[j],names[i]];}
    const items=names.map((label,i)=>next()%4===0?{kind:"omit",label}:{kind:"value",label,expression:"effect("+i+")",valueType:"Option<int>"});
    const got=bind(f,items);
    assert.equal(new Set(got.provenance.map(x=>x.formalIndex)).size,6);
    assert.deepEqual(got.evaluatedCallItemIndices,items.flatMap((x,i)=>x.kind==="value"?[i]:[]));
    got.provenance.forEach((origin,i)=>{assert.equal(origin.rawIndex,i);assert.equal(f[origin.formalIndex].name,names[i]);});
    assert.equal(got.slots.length,6);
  }
});
