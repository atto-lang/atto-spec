import test from 'node:test';
import assert from 'node:assert/strict';
const need={name:'ping',arity:0,result:'int',visibility:'pub',effects:[]};
function resolve(owner,methods){const candidates=methods.filter(m=>m.owner===owner&&m.name===need.name&&m.arity===need.arity&&!m.static);if(candidates.length!==1)throw Error(candidates.length?'E_IMPL_CONFLICT':'E_IMPL_MISSING');const m=candidates[0];if(m.result!==need.result||m.effects.some(e=>!need.effects.includes(e)))throw Error('E_IMPL_SIGNATURE');if(m.visibility!=='pub')throw Error('E_IMPL_VISIBILITY');return m}
const method={...need,owner:'Sensor#1',static:false};
test('nominal receiver, arity, static and visibility failures',()=>{assert.equal(resolve('Sensor#1',[method]),method);for(const m of [{...method,owner:'Sensor#2'},{...method,arity:1},{...method,static:true}])assert.throws(()=>resolve('Sensor#1',[m]),/E_IMPL_MISSING/);assert.throws(()=>resolve('Sensor#1',[{...method,visibility:'private'}]),/E_IMPL_VISIBILITY/)});
test('return/effect mismatch and ambiguous implementations reject',()=>{assert.throws(()=>resolve('Sensor#1',[{...method,result:'string'}]),/E_IMPL_SIGNATURE/);assert.throws(()=>resolve('Sensor#1',[{...method,effects:['susp']}]),/E_IMPL_SIGNATURE/);assert.throws(()=>resolve('Sensor#1',[method,{...method}]),/E_IMPL_CONFLICT/)});
