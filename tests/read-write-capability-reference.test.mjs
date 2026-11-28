// Host-only deterministic reference oracle; not a compiler/guest test.
import assert from 'node:assert/strict';
import test from 'node:test';
function runCases(assert) {
  const checks=[];
  function test(name,fn){fn();checks.push(name)}
  class ItemQueue {
    constructor(capacity){this.capacity=capacity;this.items=[];this.waiters=[];this.closed=false}
    write(ticket){if(ticket.state!=="new")return false;if(this.closed){ticket.state="rejected";return false}if(this.items.length<this.capacity){this.items.push(ticket.value);ticket.value=undefined;ticket.state="accepted";return true}ticket.state="waiting";this.waiters.push(ticket);return false}
    cancel(ticket){if(ticket.state!=="waiting")return false;ticket.state="cancelled";return true}
    read(){if(!this.items.length)return this.closed?{tag:"eof"}:{tag:"would_block"};const value=this.items.shift();while(this.waiters.length){const t=this.waiters.shift();if(t.state!=="waiting")continue;t.state="new";this.write(t);break}return {tag:"item",value}}
    close(){if(this.closed)return;this.closed=true;for(const t of this.waiters)if(t.state==="waiting")t.state="rejected";this.waiters=[]}
  }
  const ticket=value=>({value,state:"new"});
  test("empty differs from EOF and zero",()=>{const q=new ItemQueue(1);assert(q.read().tag==="would_block");q.write(ticket(0));assert(q.read().value===0);q.close();assert(q.read().tag==="eof")});
  test("full writer retains owner until admission",()=>{const q=new ItemQueue(1);q.write(ticket(1));const t=ticket(2);assert(!q.write(t)&&t.value===2);assert(q.read().value===1);assert(t.state==="accepted"&&t.value===undefined);assert(q.read().value===2)});
  test("cancel before commit preserves payload",()=>{const q=new ItemQueue(1);q.write(ticket(1));const t=ticket(2);q.write(t);assert(q.cancel(t));q.read();assert(t.value===2&&q.read().tag==="would_block")});
  test("cancel after commit cannot undo",()=>{const q=new ItemQueue(1);const t=ticket(2);q.write(t);assert(!q.cancel(t));assert(!q.write(t));assert(q.read().value===2)});
  test("close drains and rejects pending owner",()=>{const q=new ItemQueue(1);q.write(ticket(1));const t=ticket(2);q.write(t);q.close();q.close();assert(t.state==="rejected"&&t.value===2);assert(q.read().value===1);assert(q.read().tag==="eof")});
  test("select winner alone commits",()=>{const a=new ItemQueue(1),b=new ItemQueue(1);a.write(ticket(11));b.write(ticket(22));const select=qs=>qs.find(q=>q.items.length)?.read();assert(select([a,b]).value===11);assert(b.read().value===22)});
  test("independent subscription bounded credit",()=>{const a=new ItemQueue(1),b=new ItemQueue(1);const broadcast=v=>{if([a,b].some(q=>q.closed||q.items.length===q.capacity))return false;for(const q of [a,b])q.write(ticket(v));return true};assert(broadcast(1));assert(a.read().value===1);assert(!broadcast(2));assert(a.read().tag==="would_block");assert(b.read().value===1);assert(broadcast(2));assert(a.read().value===2&&b.read().value===2)});
  test("deterministic close/cancel/commit ordering",()=>{for(const order of [["close","cancel","read"],["close","read","cancel"],["cancel","read","close"],["cancel","close","read"],["read","close","cancel"],["read","cancel","close"]]){const q=new ItemQueue(1);q.write(ticket(0));const t=ticket(9);q.write(t);for(const op of order){if(op==="close")q.close();if(op==="cancel")q.cancel(t);if(op==="read")q.read()}if(order[0]==="read"){assert(t.state==="accepted"&&t.value===undefined&&q.read().value===9)}else{assert(t.value===9&&t.state!=="accepted"&&q.read().tag==="eof")}}});
  return checks;
}
test('read/write capability reference outcomes',()=>{ assert.equal(runCases(assert.ok).length,8); });
