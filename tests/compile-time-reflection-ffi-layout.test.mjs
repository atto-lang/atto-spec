import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileLayout,compileMetadata,checkForeignBinding} from '../src/compile-time-abi-reference.mjs';
const fixture=JSON.parse(readFileSync(new URL('../contracts/compile-time-reflection-ffi-layout-v1.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);
const denied=(f,code)=>assert.throws(f,new RegExp(code));

test('evidence remains source-free and every backend is NOT_EXECUTED',()=>{
 assert.equal(fixture.schema,'atto.comptime.abi.reference.v1');
 assert.equal(fixture.status,'SOURCE_FREE_MODEL_NOT_GUEST_EXECUTION');
 assert.deepEqual(Object.keys(fixture.backendEvidence).sort(),['cranelift','forge','java','llvm','net','rs','wasm']);
 assert.ok(Object.values(fixture.backendEvidence).every(s=>s==='NOT_EXECUTED'));
});
test('explicit target ABI layout is not shared across triples',()=>{
 for(let i=0;i<fixture.examples.length;i++){
   const got=compileLayout(fixture.examples[i],fixture.profiles[i]);
   assert.equal(got.size,fixture.examples[i].size);
   assert.equal(got.align,fixture.examples[i].align);
   assert.deepEqual(got.fields.map(f=>f.offset),fixture.examples[i].fields.map(f=>f.offset));
   assert.equal(got.runtimeReflection,false);
   assert.equal(got.cHeaderVerified,false);
   assert.equal(got.guestAotCertified,false);
   assert.equal(Object.isFrozen(got),true);
   assert.equal(Object.isFrozen(got.fields),true);
 }
 assert.notEqual(fixture.examples[0].size,fixture.examples[1].size);
 denied(()=>compileLayout(fixture.examples[0],fixture.profiles[1]),'E_ABI_TARGET_UNKNOWN');
});
test('rejects fake C layouts and field-offset/size/align mistakes',()=>{
 const cases=[
  x=>x.repr='native',
  x=>x.target='unknown-platform',
  x=>x.endian='big',
  x=>x.fields[1].offset=4,
  x=>x.fields[2].offset=17,
  x=>x.size=20,
  x=>x.align=4,
  x=>x.fields[1].type='long',
  x=>x.fields[1].type='Pointer',
  x=>x.fields[2].name='counter',
  x=>x.fields.push({name:'spill',type:'object',offset:24}),
  x=>x.fields[0].offset=Number.MAX_SAFE_INTEGER,
  x=>x.fields[0].extra='secret',
  x=>x.fields[0].name='__Bad',
  x=>x.fields=[],
  x=>x.fields=[{name:'a',type:'u8',offset:0},,]
 ];
 for(const change of cases){
  const x=clone(fixture.examples[0]);change(x);
  assert.throws(()=>compileLayout(x,fixture.profiles[0]));
 }
});
test('rejects target alignment and metadata integrity tricks',()=>{
 const profile=fixture.profiles[0];
 for(const mutate of [
  x=>x.alignments.i64=3,
  x=>x.alignments.u8=32,
  x=>x.maxAlign=3,
  x=>x.alignments.secret=8,
  x=>x.endian='middle',
  x=>x.alignments.i64=0
 ]){
  const x=clone(profile);mutate(x);
  assert.throws(()=>compileLayout(fixture.examples[0],x));
 }
 const x=clone(fixture.examples[0]);
 x.fields.extra='surprise';
 denied(()=>compileLayout(x,profile),'E_ABI_LIST');
 const y=clone(fixture.examples[0]);
 Object.defineProperty(y.fields[1],'offset',{enumerable:true,get(){throw new Error('GETTER_EXECUTED')}});
 denied(()=>compileLayout(y,profile),'E_ABI_SHAPE');
});
test('compile-time metadata respects visibility and never enables runtime codegen',()=>{
 const t=fixture.type;
 const publicView=compileMetadata(t,{requester:'external'});
 assert.deepEqual(publicView.fields,[{name:'tag',type:'u8'}]);
 assert.equal(publicView.codegenOnly,true);
 assert.equal(publicView.runtimeReflection,false);
 const own=compileMetadata(t,{requester:'packet',derive:true});
 assert.deepEqual(own.fields.map(f=>f.name),['tag','secret']);
 assert.equal(own.guestAotCertified,false);
 denied(()=>compileMetadata(t,{requester:'external',derive:true}),'E_COMPTIME_PRIVATE');
 for(const change of [
  x=>x.closed=false,
  x=>x.kind='actor',
  x=>x.fields[1].type='Pointer<T>',
  x=>x.fields[1].type='ForeignHandle<T>',
  x=>x.fields[0].name='secret',
 ]){
  const x=clone(t);change(x);
  assert.throws(()=>compileMetadata(x,{requester:'packet',derive:true}));
 }
});
test('foreign catalog checks finite scalar-only calling and explicit effects',()=>{
 const b=fixture.foreignBinding;
 const v=checkForeignBinding(b);
 assert.equal(v.aotStatic,true);
 assert.equal(v.callbackAllowed,false);
 assert.equal(v.capabilityAuthorized,false);
 assert.equal(v.guestAotCertified,false);
 for(const change of [
  x=>x.symbol='../lib.so',
  x=>x.artifactSha256='0'.repeat(63),
  x=>x.abi='native',
  x=>x.params[0]='Pointer<int>',
  x=>x.params[0]='@repr(C) SamplePacket',
  x=>x.params[0]='str',
  x=>x.result='Result<int,FfiError>',
  x=>x.effects=[],
  x=>x.effects=['blocking'],
  x=>x.effects.push('syscall'),
  x=>x.effects.push('ffi'),
  x=>x.ownership[0]='borrow',
  x=>x.ownership[0]='take!',
  x=>x.ownership.pop(),
  x=>x.callbacks='callback-v2',
  x=>x.thread='foreign-worker',
  x=>x.params.extra='late-bound'
 ]){
  const x=clone(b);change(x);
  assert.throws(()=>checkForeignBinding(x));
 }
});
test('reference proof is distinctly weaker than actual compiler and C witness',()=>{
 const doc=readFileSync(new URL('../language/compile-time-reflection-ffi-layout-v1.md',import.meta.url),'utf8');
 assert.match(doc,/NOT COMPILER-VERIFIED/);
 assert.match(doc,/C11 header witness/);
 assert.match(doc,/full guest AOT/i);
 assert.match(doc,/V1 callbacks and foreign reentrancy are forbidden/);
 assert.match(doc,/before executable artifact emission/);
 assert.match(doc,/no guest interpreter, JIT, runtime reflection or runtime code generation/);
});
