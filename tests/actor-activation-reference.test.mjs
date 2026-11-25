// Host-only actor activation and scoped state model.
import test from 'node:test';import assert from 'node:assert/strict';
class Actor {
 constructor(gen){this.gen=gen;this.state='starting';this.initialized=false;this.value=undefined;this.queue=[]}
 send(v){if(this.state==='retired')return false;this.queue.push(v);return true}
 activate(init){try{this.value=init();if(!Number.isInteger(this.value))throw Error('uninitialized');this.initialized=true;this.state='ready'}catch(e){this.state='retired';throw e}}
 receive(){if(this.state!=='ready'||!this.initialized)throw Error('activation');return this.value+=this.queue.shift()}
 view(gen){if(this.state!=='ready'||gen!==this.gen)throw Error('stale');return this.value}
}
test('admission may precede activation but receive never does',()=>{const a=new Actor(1);assert.equal(a.send(1),true);assert.throws(()=>a.receive(),/activation/);a.activate(()=>0);assert.equal(a.receive(),1);a.send(2);assert.equal(a.receive(),3)});
test('failed activation never publishes state; successor has separate incarnation',()=>{const a=new Actor(1);a.send(1);assert.throws(()=>a.activate(()=>undefined),/uninitialized/);assert.throws(()=>a.receive(),/activation/);assert.equal(a.send(2),false);const b=new Actor(2);b.activate(()=>0);assert.throws(()=>b.view(1),/stale/);assert.equal(b.view(2),0)});
