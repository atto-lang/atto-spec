import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveAssociatedTypeclassWitness as resolve} from '../src/typeclass-associated-v2-reference.mjs';

const fixture=JSON.parse(readFileSync(new URL('../contracts/typeclass-associated-v2.json',import.meta.url)));
const catalog=()=>structuredClone({
  schema:'atto.typeclass.associated-witness.v2',
  witnessCatalog:fixture.witnessCatalog,
  typeclassSignatures:fixture.typeclassSignatures,
  associatedBindings:fixture.associatedBindings,
  functionSignatures:fixture.functionSignatures
});
const call=()=>structuredClone(fixture.request);
const denied=(mutate,code)=>{
  const c=catalog();mutate(c);
  assert.throws(()=>resolve(c,call()),new RegExp('E_WITNESS_'+code));
};

test('associated types lower into exact direct symbol signatures, still not compiled',()=>{
  assert.equal(fixture.status,'PROPOSED_SOURCE_FREE_ONLY');
  const r=resolve(catalog(),call());
  assert.equal(r.kind,'STATIC_ASSOCIATED_WITNESS_V2');
  assert.equal(r.associatedTypes.Item,'int');
  assert.equal(r.calls.map.symbol,'math.map_vector');
  assert.deepEqual([...r.calls.map.params],['math.Vector','int']);
  assert.equal(r.calls.map.returns,'int');
  assert.equal(r.runtimeReflectionRequired,false);
  assert.equal(r.calls.map.runtimeReflectionRequired,false);
  assert.equal(r.compilerExecutable,false);
  assert.equal(r.authenticated,false);
  assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.calls)&&Object.isFrozen(r.associatedTypes));
});
test('type, signature and binding completeness fail closed',()=>{
  denied(c=>c.associatedBindings[0].bindings=[],'ASSOC');
  denied(c=>c.associatedBindings[0].bindings[0].type='foreign.Unknown','TYPE');
  denied(c=>c.associatedBindings[0].bindings[0].type='Assoc.Item','ASSOC_CYCLE');
  denied(c=>c.functionSignatures[0].returns='bool','SIGNATURE_MISMATCH');
  denied(c=>c.functionSignatures[0].params=['int','int'],'SIGNATURE_MISMATCH');
  denied(c=>c.functionSignatures=[],'FUNCTION');
  denied(c=>c.typeclassSignatures[0].methods=[],'SIGNATURE');
  denied(c=>c.typeclassSignatures[0].associatedTypes=[],'SIGNATURE');
  denied(c=>c.associatedBindings[0].bindings.push({name:'Item',type:'int'}),'ASSOC');
});
test('orphan, global duplicate coherence and runtime reflection are prohibited',()=>{
  denied(c=>c.witnessCatalog.implementations[0].module='unrelated','ORPHAN_IMPL');
  denied(c=>{
    c.witnessCatalog.implementations.push({
      module:'ops',typeclass:'ops.Mapper',forType:'math.Vector',
      bindings:[{method:'map',symbol:'ops.map_vector'}]
    });
  },'AMBIGUOUS');
  denied(c=>c.witnessCatalog.runtimeReflection=true,'CLOSED_WORLD');
});
test('unknown names, inaccessible evidence and hidden metadata cannot create witnesses',()=>{
  denied(c=>c.typeclassSignatures[0].methods[0].params=['Assoc.Hidden'],'SIGNATURE');
  denied(c=>c.associatedBindings[0].module='other','ASSOC');
  denied(c=>c.functionSignatures[0].symbol='evil.map_vector','FUNCTION');
  denied(c=>Object.defineProperty(c,'secret',{value:'ambient'}),'SHAPE');
  denied(c=>c.associatedBindings[Symbol('hidden')]='yes','LIST');
  denied(c=>c.functionSignatures[0].params=['int',,'int'],'LIST');
  assert.throws(()=>resolve(catalog(),{...call(),visibleModules:['math','math']}),/E_WITNESS_LIST/);
});
