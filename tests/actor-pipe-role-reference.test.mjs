// HOST ONLY: nominal ingress witness model, no compiler/runtime certification.
import test from 'node:test';import assert from 'node:assert/strict';
function link(decl,concrete,handlers){
 if(concrete!==undefined&&concrete!==decl)throw Error('signature');
 if(handlers.length!==1)throw Error('unfulfilled or duplicate');
 const h=handlers[0];if(h.type!==decl||h.pub||h.result!=='void'||h.owner!=='Foo')throw Error('signature');
 return {inboxWitnessed:true,emitsWitnessed:false};
}
test('nominal metadata needs exactly one matching private receiver',()=>{
 const h={type:'int',owner:'Foo',result:'void'};
 assert.deepEqual(link('int','int',[h]),{inboxWitnessed:true,emitsWitnessed:false});
 assert.throws(()=>link('int','int',[]),/unfulfilled/);
 assert.throws(()=>link('int','int',[h,h]),/duplicate/);
 for(const variant of [{type:'bool'},{owner:'Other'},{pub:true},{result:'int'}])assert.throws(()=>link('int','int',[{...h,...variant}]),/signature/);
 assert.throws(()=>link('int','bool',[h]),/signature/);
});
test('ordinary send capability cannot witness pipe output',()=>{
 const role={receives:'int',sends:'int',emits:undefined};
 const canPipe=(source,sink)=>source.emits!==undefined&&source.emits===sink.receives;
 assert.equal(canPipe(role,{receives:'int'}),false);
 assert.equal(canPipe({...role,emits:'int'},{receives:'int'}),true);
 assert.equal(canPipe({...role,emits:'int'},{receives:'bool'}),false);
});
