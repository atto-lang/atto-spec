// HOST ONLY: bounded single-selection arbitration oracle.
import test from 'node:test';import assert from 'node:assert/strict';
class Select {
 constructor(arms,gen=1){this.arms=arms;this.gen=gen;this.winner=null;this.pending=true;this.result=null;}
 commit(i,gen){if(!this.pending||gen!==this.gen)return false;this.pending=false;this.winner=i;this.arms[i].commit++;return true}
 cancel(){if(this.pending){this.pending=false;return 'cancelled'}return 'committed'}
 finish(value){if(this.winner===null||this.result!==null)throw Error('invalid completion');this.result={value}}
}
test('enumerate every order of two ready arms and cancellation; only first admitted operation wins',()=>{
 for(const order of [[0,1,'c'],[1,0,'c'],[0,'c',1],[1,'c',0],['c',0,1],['c',1,0]]){
  const arms=[{commit:0},{commit:0}],s=new Select(arms);
  for(const x of order)x==='c'?s.cancel():s.commit(x,1);
  assert.equal(arms[0].commit+arms[1].commit,order[0]==='c'?0:1);
  if(order[0]!=='c'){assert.equal(s.winner,order[0]);s.finish(42);assert.throws(()=>s.finish(43),/completion/)}
 }
});
test('stale generation cannot commit; tracked result stays pending through arm execution',()=>{
 const arms=[{commit:0}],s=new Select(arms,2);assert.equal(s.commit(0,1),false);assert.equal(s.commit(0,2),true);
 assert.equal(s.result,null);assert.equal(s.cancel(),'committed');s.finish(42);assert.deepEqual(s.result,{value:42});
});
