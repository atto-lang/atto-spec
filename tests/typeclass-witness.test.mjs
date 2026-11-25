import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveStaticTypeclassWitness as resolve} from '../src/typeclass-witness-reference.mjs';
const fixture=JSON.parse(readFileSync(new URL('../contracts/typeclass-witness-v1.json',import.meta.url)));
const catalog=()=>structuredClone(fixture.catalog);
const request=()=>({typeclass:'ops.Show',nominalType:'math.Vector',visibleModules:['math']});
const denied=(f,code)=>assert.throws(f,new RegExp(code));

test('witness proposal is a model and deliberately never proves compiled AOT',()=>{
 assert.equal(fixture.schema,'atto.typeclass.witness.contract.v1');
 assert.equal(fixture.status,'PROPOSED_SOURCE_FREE_ONLY');
 const r=resolve(catalog(),request());
 assert.equal(r.kind,'STATIC_AOT_WITNESS');
 assert.equal(r.runtimeReflectionRequired,false);
 assert.equal(r.compilerExecutable,false);
 assert.equal(r.authenticated,false);
 assert.equal(Object.isFrozen(r),true);
 assert.equal(Object.isFrozen(r.dispatch),true);
});
test('static dispatch is exactly bound to a single visible authorized witness',()=>{
 for(const c of fixture.positive){
   const r=resolve(catalog(),c.request);
   assert.equal(r.providerModule,c.provider,c.id);
   assert.equal(r.dispatch.render ?? null,c.render,c.id);
 }
});
test('undeclared or absent implementations cannot fall back to reflection',()=>{
 for(const c of fixture.negative)
   denied(()=>resolve(catalog(),c.request),c.error);
});
test('ambiguous trait-vs-type-owner instances are rejected rather than arbitrarily selected',()=>{
 const c=catalog();
 c.implementations.push({module:'ops',typeclass:'ops.Show',forType:'math.Vector',
    bindings:[{method:'render',symbol:'ops.render_vector'}]});
 denied(()=>resolve(c,{...request(),visibleModules:['math','ops']}),'E_WITNESS_AMBIGUOUS');
 assert.equal(resolve(c,request()).providerModule,'math');
});
test('orphan instances, missing methods, and foreign method symbols fail closed',()=>{
 const offenders=[
   c=>c.implementations[0].module='external',
   c=>c.implementations[1].bindings.pop(),
   c=>c.implementations[0].bindings[0].symbol='other.render_vector',
   c=>c.implementations[0].bindings.push({method:'render',symbol:'math.another'}),
   c=>c.implementations[0].bindings[0].method='reflect',
 ];
 for(const mutate of offenders){
   const c=catalog();mutate(c);
   denied(()=>resolve(c,request()),'E_WITNESS_');
 }
});
test('no open-world, runtime reflection, prototype or hidden metadata admission',()=>{
 const changes=[
  c=>c.closedWorld=false,c=>c.runtimeReflection=true,
  c=>c[Symbol('covert')]='x',
  c=>Object.defineProperty(c,'hidden',{value:'x'}),
  c=>Object.defineProperty(c,'closedWorld',{get:()=>true,enumerable:true}),
 ];
 for(const mutate of changes){const c=catalog();mutate(c);denied(()=>resolve(c,request()),'E_WITNESS_');}
 denied(()=>resolve(catalog(),{...request(),visibleModules:['math','math']}),'E_WITNESS_LIST');
});

test('rejects sparse arrays, hidden metadata and accessor-backed witness catalogs',()=>{
 const sparseRequest=request();
 sparseRequest.visibleModules=['math',,'ops'];
 denied(()=>resolve(catalog(),sparseRequest),'E_WITNESS_LIST');
 const missingMethod=catalog();
 missingMethod.typeclasses.find(t=>t.name==='ops.Show').methods=new Array(1);
 denied(()=>resolve(missingMethod,request()),'E_WITNESS_LIST');
 const decorated=catalog();
 decorated.implementations.extra='unreviewed';
 denied(()=>resolve(decorated,request()),'E_WITNESS_LIST');
 const symbolMetadata=catalog();
 symbolMetadata.types[Symbol('covert')]='hidden';
 denied(()=>resolve(symbolMetadata,request()),'E_WITNESS_LIST');
 const accessor=catalog();
 Object.defineProperty(accessor.implementations[0].bindings,'0',{
   enumerable:true,get(){throw new Error('EXECUTED_UNTRUSTED_GETTER');}
 });
 denied(()=>resolve(accessor,request()),'E_WITNESS_LIST');
});
