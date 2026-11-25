import test from 'node:test';
import assert from 'node:assert/strict';
function iterate(source,body){const it=source();try{for(;;){const next=it.next();if(next.done)return;if(body(next.value)==='break')return}}finally{it.close()}}
function post(body,pred){do{body()}while(pred())}
test('iterator source once, next and close counts including break and throw',()=>{for(const mode of ['normal','break','throw']){let sources=0,nexts=0,closes=0;const source=()=>{sources++;return {next:()=>({done:++nexts>3,value:nexts}),close:()=>closes++}};const body=x=>{if(x===2&&mode==='throw')throw Error('body');if(x===2&&mode==='break')return 'break'};if(mode==='throw')assert.throws(()=>iterate(source,body),/body/);else iterate(source,body);assert.equal(sources,1);assert.equal(closes,1);assert.equal(nexts,mode==='normal'?4:2)}});
test('post-test runs once even when condition false; recur updates simultaneous state',()=>{let n=0,p=0;post(()=>n++,()=>{p++;return false});assert.deepEqual([n,p],[1,1]);let i=0,sum=0;while(i<10)[i,sum]=[i+1,sum+i];assert.equal(sum,45)});
