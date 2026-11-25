import test from 'node:test';
import assert from 'node:assert/strict';
const lo=-(1n<<63n), hi=(1n<<63n)-1n;
function checked(x){if(x<lo||x>hi)throw new RangeError('ArithmeticOverflowError');return x}
function divide(a,b){if(b===0n)throw new RangeError('DivisionByZeroError');return checked(a/b)}
function rem(a,b){if(b===0n)throw new RangeError('DivisionByZeroError');return a%b}
function admit(caller,callee,verified){return verified&&caller==='checked-v1'&&callee===caller}
test('i64 boundaries and checked intermediate operations',()=>{assert.equal(checked(40n+2n),42n);for(const x of [hi+1n,lo-1n,-lo,3037000500n**2n])assert.throws(()=>checked(x),/ArithmeticOverflowError/);assert.throws(()=>checked(checked(hi+1n)-1n),/ArithmeticOverflowError/)});
test('division and remainder keep distinct failure and signed semantics',()=>{assert.equal(divide(-7n,3n),-2n);assert.equal(rem(lo,-1n),0n);assert.equal(rem(-7n,3n),-1n);assert.throws(()=>divide(lo,-1n),/ArithmeticOverflowError/);assert.throws(()=>rem(1n,0n),/DivisionByZeroError/)});
test('verified numeric profile required on both sides of link',()=>{assert.equal(admit('checked-v1','checked-v1',true),true);for(const p of ['legacy-wrap','unknown',null])assert.equal(admit('checked-v1',p,true),false);assert.equal(admit('checked-v1','checked-v1',false),false)});
