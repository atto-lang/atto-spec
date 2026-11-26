import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeResolver, convertible } from '../reference-checks/primitive-type-naming-v1.mjs';
const r = JSON.parse(readFileSync(new URL('../contracts/primitive-type-naming-v1.json', import.meta.url)));
const resolve = makeResolver(r);
for (const p of r.primitives) {
  test('canonical '+p, () => assert.equal(resolve(p), 'intrinsic:'+p));
  test('uppercase '+p, () => assert.throws(()=>resolve(p.toUpperCase()), /E_UNKNOWN_TYPE/));
  test('leading space '+p, () => assert.throws(()=>resolve(' '+p), /E_UNKNOWN_TYPE/));
  test('trailing space '+p, () => assert.throws(()=>resolve(p+' '), /E_UNKNOWN_TYPE/));
  test('wrong case '+p, () => assert.throws(()=>resolve(p[0].toUpperCase()+p.slice(1)), /E_UNKNOWN_TYPE|E_WRAPPER_NOT_ADMITTED/));
}
for (const [name,p] of Object.entries(r.wrapperCandidates)) {
  const id = 'std:'+name, scalar = 'intrinsic:'+p;
  const auth = new Map([[id,scalar]]);
  const named = makeResolver(r,new Map([[name,id]]));
  const user = makeResolver(r,new Map([[name,'user:'+name]]));
  test('wrapper not admitted '+name,()=>assert.throws(()=>resolve(name),/E_WRAPPER_NOT_ADMITTED/));
  test('declared wrapper '+name,()=>assert.equal(named(name),id));
  test('wrapper differs from primitive '+name,()=>assert.notEqual(named(name),named(p)));
  test('shadow wrapper '+name,()=>assert.equal(user(name),'user:'+name));
  test('no implicit box '+name,()=>assert.equal(convertible(scalar,id,'assign',auth),false));
  test('no implicit unbox '+name,()=>assert.equal(convertible(id,scalar,'assign',auth),false));
  test('explicit box '+name,()=>assert.equal(convertible(scalar,id,'box',auth),true));
  test('explicit unbox '+name,()=>assert.equal(convertible(id,scalar,'unbox',auth),true));
  test('shadow cannot box '+name,()=>assert.equal(convertible(scalar,'user:'+name,'box',auth),false));
  test('shadow cannot unbox '+name,()=>assert.equal(convertible('user:'+name,scalar,'unbox',auth),false));
  test('casts do not box '+name,()=>assert.equal(convertible(scalar,id,'cast',auth),false));
  test('wrong underlying type '+name,()=>assert.equal(convertible('intrinsic:void',id,'box',auth),false));
}
for(const [alias,p] of Object.entries(r.legacyAliasesRequiringProfileMigration)) {
  test('legacy alias '+alias,()=>assert.equal(resolve(alias,'legacy-alias'),'intrinsic:'+p));
  test('resolved named type takes precedence '+alias,()=>assert.equal(makeResolver(r,new Map([[alias,'user:'+alias]]))(alias,'legacy-alias'),'user:'+alias));
}
test('boolean compatibility',()=>assert.equal(resolve('boolean'),resolve('bool')));
test('unknown profile fails',()=>assert.throws(()=>resolve('int','typo'),/E_PROFILE/));
test('case-sensitive named declarations',()=>{const f=makeResolver(r,new Map([['Thing','a'],['thing','b']]));assert.notEqual(f('Thing'),f('thing'));});
test('no unverified execution claims',()=>{assert.equal(r.status,'TARGET_ONLY_NOT_EXECUTED');assert.equal(Object.keys(r.backends).length,11);assert.ok(Object.values(r.backends).every(x=>x==='NOT_EXECUTED'));});
test('registry invariant',()=>{assert.equal(new Set(r.primitives).size,r.primitives.length);assert.ok(r.primitives.every(x=>/^[a-z][a-z0-9]*$/.test(x)));for(const p of Object.values({...r.wrapperCandidates,...r.futureWrapperCandidates,...r.compatibilityAliases})) assert.ok(r.primitives.includes(p));assert.equal(r.rules.implicitBoxing,false);assert.equal(r.rules.implicitUnboxing,false);assert.equal(r.rules.capitalizationDeterminesStorage,false);});
