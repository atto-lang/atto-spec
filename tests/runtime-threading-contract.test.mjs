import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SOURCE-FREE reference parser only. Passing this file does NOT prove an Atto
// CLI exists, a compiler accepts these flags, or a guest executes serially.
const contract=JSON.parse(readFileSync(new URL('../contracts/runtime-threading-v1.json',import.meta.url)));
const allowedModes=new Set(['single-threaded','trace']); // hypothetical test capability only

function parseReference(args) {
  let shorthand=false, numeric=null;
  const modes=new Set();
  for(const token of args) {
    if(token==='--') break; // following tokens are application arguments
    if(token==='--single-threaded') {
      shorthand=true;
    } else if(token.startsWith('--max-threads-per-space=')) {
      const raw=token.slice('--max-threads-per-space='.length);
      if(!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)))
        return {accept:false,code:'E_INVALID_THREAD_LIMIT'};
      const limit=Number(raw);
      if(numeric!==null && numeric!==limit)
        return {accept:false,code:'E_CONFLICTING_THREAD_POLICY'};
      numeric=limit;
    } else if(token.startsWith('--mode=')) {
      const raw=token.slice('--mode='.length);
      for(const mode of raw.split(',')) {
        if(mode==='')return {accept:false,code:'E_EMPTY_MODE'};
        if(!allowedModes.has(mode))return {accept:false,code:'E_UNKNOWN_MODE'};
        if(modes.has(mode))return {accept:false,code:'E_DUPLICATE_MODE'};
        modes.add(mode);
      }
    } else {
      return {accept:false,code:'E_UNKNOWN_FLAG'};
    }
  }
  const singleRequested=shorthand||modes.has('single-threaded');
  if(singleRequested && numeric!==null && numeric!==1)
    return {accept:false,code:'E_CONFLICTING_THREAD_POLICY'};
  if(numeric!==null && numeric!==1)
    return {accept:false,code:'E_UNSUPPORTED_THREAD_LIMIT'};
  return {accept:true,singleThreaded:singleRequested||numeric===1,
          extraModes:[...modes].filter(m=>m!=='single-threaded').sort()};
}

test('contract is explicitly proposed, source-free, and limited to a test capability',()=>{
  assert.equal(contract.schema,'atto.runtime.threading-mode.contract.v1');
  assert.equal(contract.status,'PROPOSED_SOURCE_FREE_ONLY');
  assert.equal(contract.testScope,'CLI_REFERENCE_MODEL_NOT_COMPILER_OR_GUEST_EXECUTION');
  assert.equal(contract.capabilityProfile,'single-threaded-and-trace-only-for-reference-parser');
  assert.equal(contract.invariant,'at_most_one_os_thread_in_guest_memory_space');
  assert.equal(contract.cliCases.length,30);
  assert.equal(contract.runtimeCases.length,11);
});

test('all CLI examples have unique IDs and exactly match reference admission',()=>{
  const seen=new Set();
  for(const c of contract.cliCases) {
    assert.match(c.id,/^[a-z][a-z0-9-]+$/);
    assert.ok(!seen.has(c.id),c.id);
    seen.add(c.id);
    assert.ok(Array.isArray(c.args)&&c.args.every(s=>typeof s==='string'));
    assert.deepEqual(parseReference(c.args),c.expected,c.id);
  }
});

test('unknown mode and invalid numeric input cannot turn into silent multithread defaults',()=>{
  for(const arg of ['--mode=abx','--mode=single-threaded,xyz','--max-threads-per-space=0',
                    '--max-threads-per-space=-1','--max-threads-per-space=1e0',
                    '--max-threads-per-space=2','--mode=single-threaded,']) {
    const result=parseReference([arg]);
    assert.equal(result.accept,false,arg);
  }
  assert.deepEqual(parseReference(['--single-threaded','--','--mode=xyz']),
                   {accept:true,singleThreaded:true,extraModes:[]});
  assert.deepEqual(parseReference(['--','--single-threaded']),
                   {accept:true,singleThreaded:false,extraModes:[]});
});

test('runtime scenarios explicitly distinguish serialization, isolation and fail-closed edges',()=>{
  const ids=new Set();
  const allowed=new Set([
    'SERIALIZE_IN_ONE_LANE','CONCURRENT_ALLOWED','MARSHAL_OR_REJECT',
    'JOIN_DOMAIN_OR_REJECT','QUEUE_COMPLETION_AND_PROGRESS',
    'COOPERATIVE_SUSPEND_NOT_DEADLOCK','REJECT_UNSUPPORTED',
    'ALLOW_ONLY_WITH_BORROW_AND_REENTRANCY_SAFETY',
    'SHARED_DOMAIN_PROOF_OR_REJECT',
    'CONTROL_AND_CLEANUP_WITHOUT_PARALLEL_GUEST_EXECUTION'
  ]);
  for(const c of contract.runtimeCases) {
    assert.ok(!ids.has(c.id),c.id);ids.add(c.id);
    assert.ok(typeof c.condition==='string'&&c.condition.length>15,c.id);
    assert.ok(allowed.has(c.expected),c.id);
  }
  assert.equal(contract.runtimeCases.find(c=>c.id==='same-memory-two-actors').expected,
               'SERIALIZE_IN_ONE_LANE');
  assert.equal(contract.runtimeCases.find(c=>c.id==='independent-workers').expected,
               'CONCURRENT_ALLOWED');
  assert.equal(contract.runtimeCases.find(c=>c.id==='unverified-plugin').expected,
               'REJECT_UNSUPPORTED');
});
