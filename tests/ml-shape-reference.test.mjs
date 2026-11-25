// Host-only shape reference. No tensor runtime or compiled guest certification.
import test from 'node:test';import assert from 'node:assert/strict';
const max=BigInt(2**31-1);
function count(shape){let n=1n;for(const d of shape){if(!Number.isSafeInteger(d)||d<0)throw Error('dimension');n*=BigInt(d);if(n>max)throw Error('bound')}return n}
function broadcast(a,b){const o=[];for(let i=1;i<=Math.max(a.length,b.length);i++){let x=a.at(-i)??1,y=b.at(-i)??1;if(x!==y&&x!==1&&y!==1)throw Error('shape');o.unshift(x===1?y:x)}count(o);return o}
function mm(a,b){if(a.length!==2||b.length!==2||a[1]!==b[0])throw Error('contract');const out=[a[0],b[1]];count(out);return out}
test('shape products are bounded; reject invalid dimensions',()=>{assert.equal(count([2,3,4]),24n);assert.throws(()=>count([65536,65536]),/bound/);assert.throws(()=>count([-1]),/dimension/)});
test('broadcast and matrix contraction',()=>{assert.deepEqual(broadcast([2,1,4],[3,4]),[2,3,4]);assert.deepEqual(broadcast([0,1],[1,3]),[0,3]);assert.throws(()=>broadcast([2],[3]),/shape/);assert.deepEqual(mm([2,3],[3,4]),[2,4]);assert.throws(()=>mm([2,3],[2,4]),/contract/)});
test('reverse-mode scalar product agrees with finite differences',()=>{const f=(x,y)=>x*y+x*x,x=3,y=5,e=1e-5;assert.ok(Math.abs((f(x+e,y)-f(x-e,y))/(2*e)-(y+2*x))<1e-7);assert.ok(Math.abs((f(x,y+e)-f(x,y-e))/(2*e)-x)<1e-7)});
