// Host Boolean reference model; not compiler evidence.
function suite(report){const bool=x=>{if(typeof x!=="boolean")throw TypeError("bool");return x};const ops={and:(a,b)=>bool(a())&&bool(b()),or:(a,b)=>bool(a())||bool(b()),xor:(a,b)=>bool(a())!==bool(b())};let n=0;for(const a of [true,false])for(const b of [true,false])for(const k of Object.keys(ops)){let trace=[];const result=ops[k](()=>{trace.push("L");return a},()=>{trace.push("R");return b});const expected=k==="and"?a&&b:k==="or"?a||b:a!==b;const t=k==="and"&&!a||k==="or"&&a?"L":"LR";if(result!==expected||trace.join("")!==t)throw Error("truth or trace "+k);n++}for(const k of Object.keys(ops))for(const x of [0,1,"true",null]){let rejected=false;try{ops[k](()=>x,()=>true)}catch(e){rejected=e instanceof TypeError}if(!rejected)throw Error("coercion");n++}for(const [k,a] of [["and",false],["or",true]]){if(ops[k](()=>a,()=>{throw Error("skipped")})!==a)throw Error("skip");n++}report(`${n} Boolean host reference checks passed`)}
suite(console.log);


/* Named reduction model only: scalar thunk evaluation and already materialized arrays. */
import assert from 'node:assert/strict';
const names = ['And', 'Or', 'Xor'];
const strictBool = value => {
  if (typeof value !== 'boolean') throw new TypeError('bool required');
  return value;
};
function reduce(name, values) {
  let result = name === 'And';
  for (const value of values) {
    const bit = strictBool(value);
    if (name === 'And') result = result && bit;
    else if (name === 'Or') result = result || bit;
    else if (name === 'Xor') result = result !== bit;
    else throw new TypeError('unknown reducer');
  }
  return result;
}
function scalar(name, operands) {
  if (operands.length < 2) throw new TypeError('arity');
  let result = name === 'And';
  for (const operand of operands) {
    const bit = strictBool(operand());
    if (name === 'And') { result = result && bit; if (!result) break; }
    else if (name === 'Or') { result = result || bit; if (result) break; }
    else if (name === 'Xor') result = result !== bit;
    else throw new TypeError('unknown reducer');
  }
  return result;
}
function array(name, operands) {
  return reduce(name, operands.map(operand => strictBool(operand())));
}
let checks = 0;
for (let size = 0; size <= 6; size++) {
  for (let mask = 0; mask < 2 ** size; mask++) {
    const values = Array.from({length: size}, (_, i) => !!(mask & (1 << i)));
    const count = values.filter(Boolean).length;
    for (const name of names) {
      const expected = name === 'And' ? count === size : name === 'Or' ? count > 0 : count % 2 === 1;
      let trace = [];
      const args = values.map((value, i) => () => { trace.push(i); return value; });
      assert.equal(array(name, args), expected);
      assert.deepEqual(trace, values.map((_, i) => i));
      checks++;
      if (size >= 2) {
        trace = [];
        assert.equal(scalar(name, args), expected);
        const decisive = name === 'And' ? values.indexOf(false) : name === 'Or' ? values.indexOf(true) : -1;
        assert.deepEqual(trace, values.slice(0, decisive < 0 ? size : decisive + 1).map((_, i) => i));
        checks++;
      }
    }
  }
}
const fail = () => { throw new Error('reached'); };
assert.equal(scalar('And', [() => false, fail]), false);
assert.equal(scalar('Or', [() => true, fail]), true);
for (const name of names) {
  assert.throws(() => array(name, [() => name === 'Or', fail]), /reached/);
  assert.throws(() => scalar(name, []), /arity/);
  assert.throws(() => scalar(name, [() => true]), /arity/);
  for (const bad of [0, 1, 'true', null, [], [true]]) {
    assert.throws(() => array(name, [() => true, () => bad]), /bool required/);
    assert.throws(() => scalar(name, [() => bad, () => true]), /bool required/);
  }
}
assert.throws(() => scalar('Xor', [() => false, fail]), /reached/);
console.log(`${checks} named Boolean truth/order vectors passed (host model only)`);
