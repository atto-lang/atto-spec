// Host-level typed attachment reference; source parsing and guest evidence separate.
import test from 'node:test';import assert from 'node:assert/strict';
import {elaborateQuantityDeclarations,resolveQuantityUnit,sameUnit,evaluateQuantityMain} from '../../common/reference/verified-core/quantities.mjs';
const ds=[{kind:'dimension',name:'Time'},{kind:'unit',name:'Second',dimension:'Time'},{kind:'unit',name:'Millis',dimension:'Time',relativeTo:'Second',factor:'1000',divide:true}];
const units=elaborateQuantityDeclarations(ds),scalar=resolveQuantityUnit(units);
const attach=(type,value,name)=>{if(!sameUnit(type,scalar))throw Error('not scale-one scalar');if(!name)throw Error('unit required');return {type:resolveQuantityUnit(units,name),value:value()}};
test('resolved attachment preserves scalar value once, rejects wrong kind or residual scale',()=>{
 let calls=0;const out=attach(scalar,()=>{calls++;return 84n},'Second');assert.equal(calls,1);assert.equal(out.value,84n);
 assert.throws(()=>attach(out.type,()=>1n,'Millis'),/not scale-one/);
 assert.throws(()=>attach({...scalar,n:1000n},()=>1n,'Second'),/not scale-one/);
 assert.throws(()=>attach(scalar,()=>1n,'Time'),{code:'E_UNIT_NAME'});
});
test('checked execution failures survive elaboration to quantity literals',()=>{
 const lit=(v)=>{const x=attach(scalar,()=>v,'Second');return {op:'literal',value:String(x.value),unit:'Second'}};
 const div=(a,b)=>evaluateQuantityMain(ds,{op:'divide',left:lit(a),right:lit(b)});
 assert.equal(div(84n,2n),42n);assert.throws(()=>div(1n,0n),{code:'E_I64_DIV_ZERO'});
 assert.throws(()=>div(-(1n<<63n),-1n),{code:'E_I64_OVERFLOW'});
});
