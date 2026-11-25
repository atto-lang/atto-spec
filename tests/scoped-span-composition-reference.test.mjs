// Host reference only: models scope admission, not the Atto compiler/runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const scope=readFileSync(new URL('../spec/03-functions-and-effects.md',import.meta.url),'utf8');
const aot=readFileSync(new URL('../spec/09-modules-and-aot.md',import.meta.url),'utf8');
class Model {
  enabled=false; active=new Map(); ended=[]; recorded=[];
  enter(id,site,parent=null) {
    if(this.active.has(id)) throw Error('duplicate activation');
    const t={id,site,parent,recording:this.enabled};
    this.active.set(id,t);
    if(t.recording) this.recorded.push(t);
    return t;
  }
  leave(t) {
    if(this.active.get(t.id)!==t) throw Error('inactive activation');
    this.active.delete(t.id); this.ended.push(t.id);
  }
}
test('policy toggles affect new admissions, not live cleanup obligations',()=>{
  const m=new Model(); m.enabled=true;
  const t=m.enter(1,'lexical'); m.enabled=false;
  const off=m.enter(2,'lexical'); m.enabled=true;
  assert.equal(off.recording,false); assert.equal(t.recording,true);
  m.leave(off); m.leave(t); assert.deepEqual(m.ended,[2,1]);
  assert.throws(()=>m.leave(t),/inactive/); assert.equal(m.recorded.length,1);
});
test('distinct automatic site and repeated lexical site retain context without duplicate activation',()=>{
  const m=new Model(); m.enabled=true;
  const p=m.enter(1,'probe'), child=m.enter(2,'lexical',p.id);
  assert.throws(()=>m.enter(2,'lexical'),/duplicate/);
  assert.equal(child.parent,p.id); m.leave(child); m.leave(p);
  const again=m.enter(3,'lexical'); m.leave(again);
  assert.deepEqual(m.recorded.map(x=>x.site),['probe','lexical','lexical']);
});
test('source contract retains provenance, trusted cleanup, and separate execution gates',()=>{
  assert.match(scope,/runtime-owned and nominally sealed/);
  assert.match(scope,/Guest calls to\s+`close_scope` are forbidden/);
  assert.match(scope,/exactly once/); assert.match(scope,/A legal `await` or `select`/);
  assert.match(aot,/Recheck expanded/); assert.match(aot,/same identity for each lexical site/);
  assert.match(aot,/at\s+most one recorded span/);
  assert.match(aot,/New recording policy applies to\s+subsequent admissions/);
  assert.match(aot,/runtime compiler disabled or absent/);
});
