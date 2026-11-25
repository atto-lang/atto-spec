// HOST ONLY: bounded affine task-result and request model.
import test from 'node:test';import assert from 'node:assert/strict';
class Child {
 constructor(){this.right=true;this.cancelled=false;this.hint=false;this.terminal=null;this.retired=false}
 get_ready(){if(!this.right)throw Error('result consumed');this.right=false;let used=false;return {join:()=>{if(used||!this.terminal)throw Error('invalid join');used=true;return this.terminal}}}
 cancel_task(){if(!this.terminal)this.cancelled=true}
 cooperate(){if(!this.terminal&&!this.cancelled)this.hint=true}
 checkpoint(guard){if(this.cancelled)return 'cancel';if(guard||!this.hint)return 'continue';this.hint=false;return 'yield'}
 commit(v){if(this.terminal)return false;this.terminal=this.cancelled?{kind:'cancelled'}:{kind:'ok',v};return true}
}
test('split receipt consumes only result right, control survives',()=>{
 const t=new Child(),r=t.get_ready();assert.throws(()=>t.get_ready(),/consumed/);
 t.cooperate();assert.equal(t.checkpoint(true),'continue');assert.equal(t.checkpoint(false),'yield');
 t.commit(42);t.cancel_task();assert.deepEqual(r.join(),{kind:'ok',v:42});assert.throws(()=>r.join(),/join/);
});
test('cancellation wins before commitment; terminal success is not rewritten',()=>{
 for(const cancelFirst of [true,false]){const t=new Child(),r=t.get_ready();if(cancelFirst)t.cancel_task();t.commit(42);if(!cancelFirst)t.cancel_task();
 assert.deepEqual(r.join(),cancelFirst?{kind:'cancelled'}:{kind:'ok',v:42});assert.equal(t.retired,false);assert.equal(t.commit(0),false);}
});
test('cooperation requests coalesce and cannot bypass guard or cancellation',()=>{
 const t=new Child();t.cooperate();t.cooperate();assert.equal(t.checkpoint(true),'continue');assert.equal(t.checkpoint(false),'yield');assert.equal(t.checkpoint(false),'continue');
 t.cooperate();t.cancel_task();assert.equal(t.checkpoint(false),'cancel');
});
test('inline task return is a local value after cleanup, no child allocation',()=>{
 const trace=[];const inline=()=>{try{trace.push('body');return 42}finally{trace.push('cleanup')}};const result=inline();trace.push('parent');assert.equal(result,42);assert.deepEqual(trace,['body','cleanup','parent']);
});
