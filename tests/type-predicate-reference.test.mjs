// HOST ONLY: finite closed tag dispatch reference; no guest compiler evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
function choose(source, arms, aliases={}) {
 const norm=t=>aliases[t]??t, covered=new Set();let wildcard=false;
 for(const a of arms){
   const key=a.type==='_'?'_':(a.neg?'!':'')+norm(a.type);
   if(wildcard||covered.has(key))throw Error('unreachable');
   if(!a.guard){covered.add(key);if(key==='_')wildcard=true;}
 }
 const v=source();
 for(const a of arms){
   if(a.type!=='_'&&(a.neg?norm(v.type)===norm(a.type):norm(v.type)!==norm(a.type)))continue;
   const scope=a.bind?{[a.bind]:v.value}:{};
   if(a.guard&&!a.guard(scope))continue;
   return a.run(scope);
 }
 throw Error('nonexhaustive');
}
test('tag before capture; guard sees only bound name; evaluate source once',()=>{
 let calls=0;const arms=[{type:'string',bind:'s',guard:()=>{throw Error('wrong tag')},run:()=>0},{type:'int',bind:'n',guard:({n})=>n>50,run:()=>0},{type:'int',run:scope=>{assert.deepEqual(scope,{});return 42}}];
 assert.equal(choose(()=>{calls++;return {type:'int',value:41}},arms),42);assert.equal(calls,1);
});
test('duplicates and wildcard successors reject before scalar specialization',()=>{
 const source=()=>{throw Error('should not evaluate')};
 assert.throws(()=>choose(source,[{type:'int'},{type:'I64'}],{I64:'int'}),/unreachable/);
 assert.throws(()=>choose(source,[{type:'_'},{type:'string'}]),/unreachable/);
});
test('negative predicate is not a cast to another arbitrary type',()=>{
 assert.equal(choose(()=>({type:'bool',value:true}),[{type:'int',neg:true,run:()=>true}]),true);
 assert.equal(choose(()=>({type:'int',value:1}),[{type:'int',neg:true,run:()=>0},{type:'_',run:()=>1}]),1);
});
