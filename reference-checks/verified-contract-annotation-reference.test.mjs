// Host-level structured contract elaboration; not a source parser.
import test from 'node:test';import assert from 'node:assert/strict';
import {constrain,full,normalResult,includes,preservesUpperBounds} from '../../common/reference/verified-core/intervals.mjs';
function elaborate(clauses,site){
 let bounds=full,unit=null;
 for(const c of clauses){
  if(!['where','units','requires','ensures'].includes(c.kind)||((site==='type')!==['where','units'].includes(c.kind)))throw Error('attachment');
  if(c.kind==='units'){if(unit!==null)throw Error('duplicate unit');unit=c.value}
  else if(c.kind==='where'||c.kind==='requires'){if(c.name!==(site==='type'?'self':'duration'))throw Error('scope');bounds=constrain(bounds,c.op,c.value)}
  else if(c.name!=='result')throw Error('scope');
 }
 return {bounds,unit};
}
test('mixed syntax retains all constraints and identical intervals',()=>{
 const a={kind:'where',name:'self',op:'>',value:0n},b={kind:'where',name:'self',op:'<=',value:84n},u={kind:'units',value:'Millis'};
 assert.deepEqual(elaborate([a,b,u],'type'),elaborate([{...a,annotation:true},b,{...u,annotation:true}],'type'));
 assert.deepEqual(elaborate([a,b,u],'type').bounds,[1n,84n]);
 assert.throws(()=>elaborate([u,{...u,annotation:true}],'type'),/duplicate/);
 assert.throws(()=>elaborate([a,{...b,value:0n}],'type'),/contradictory/);
});
test('preconditions constrain proof and do not grant result scope',()=>{
 const p={kind:'requires',name:'duration',op:'>=',value:2n};
 let input=elaborate([p],'callable').bounds;let half=normalResult('divide',input,[2n,2n]);
 assert.ok(includes(constrain(full,'>',0n),half));assert.ok(preservesUpperBounds('divide',input,[2n,2n],true));
 assert.throws(()=>elaborate([{...p,name:'result'}],'callable'),/scope/);
 assert.throws(()=>elaborate([{...p,kind:'where'}],'callable'),/attachment/);
});
