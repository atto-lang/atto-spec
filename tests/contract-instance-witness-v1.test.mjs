import test from 'node:test';
import {resolveInstanceWitness} from '../reference-checks/contract-instance-witness-v1.mjs';
function referenceCases(resolve) {
  const id=(name,kind="trait",pkg="pkg@1")=>[pkg,"shop","root",kind,name];
  const owner=id("C","class");
  const s={name:"ping",params:[],result:"int",returnMode:"value",receiver:"read",effects:[],visibility:"pub",instance:true};
  const node=(name,parents=[],slots=[],kind="trait")=>({id:id(name,kind),kind,parents,slots});
  const a=node("A",[],[{...s,defaultBody:"A.ping"}]), b=node("B",[a.id]), c=node("C",[a.id]), d=node("D",[b.id,c.id]);
  const base={owner,nodes:[a,b,c,d],roots:[d.id],methods:[]};
  const method={...s,owner,body:"C.ping"};
  const conflict=node("Other",[],[{...s,defaultBody:"Other.ping"}]);
  const required=node("Required",[],[s],"interface");
  const eq=(x,y)=>{if(JSON.stringify(x)!==JSON.stringify(y))throw Error("assert equal")};
  const bad=(input,code,limits)=>{try{resolve(input,limits)}catch(e){eq(e.message,code);return}throw Error("expected "+code)};
  return [
    ["diamond visits shared canonical default once",()=>{const w=resolve(base);eq(w.slots.length,1);eq(w.slots[0].implementation,"A.ping");eq(w.slots[0].obligations.length,1)}],
    ["input and parent ordering do not change witness",()=>eq(resolve(base),resolve({...base,nodes:[d,c,b,a],roots:[d.id]}))],
    ["conflicting default origins reject",()=>bad({...base,nodes:[...base.nodes,conflict],roots:[d.id,conflict.id]},"E_CONTRACT_CONFLICT")],
    ["local override resolves conflict",()=>eq(resolve({...base,nodes:[...base.nodes,conflict],roots:[d.id,conflict.id],methods:[method]}).slots[0].implementation,"C.ping")],
    ["interface required slot cannot disappear",()=>bad({...base,nodes:[required],roots:[required.id]},"E_CONTRACT_MISSING")],
    ["valid instance method meets requirement",()=>eq(resolve({...base,nodes:[required],roots:[required.id],methods:[method]}).slots[0].implementation,"C.ping")],
    ["same leaf foreign owner cannot satisfy",()=>bad({...base,nodes:[required],roots:[required.id],methods:[{...method,owner:id("C","class","pkg@2")}]},"E_CONTRACT_MISSING")],
    ["static method not instance implementation",()=>bad({...base,nodes:[required],roots:[required.id],methods:[{...method,instance:false}]},"E_CONTRACT_MISSING")],
    ["private implementation rejects",()=>bad({...base,nodes:[required],roots:[required.id],methods:[{...method,visibility:"private"}]},"E_CONTRACT_VISIBILITY")],
    ["effects cannot grow",()=>bad({...base,nodes:[required],roots:[required.id],methods:[{...method,effects:["suspend"]}]},"E_CONTRACT_SIGNATURE")],
    ["receiver and return ownership must match",()=>{bad({...base,nodes:[required],roots:[required.id],methods:[{...method,receiver:"write"}]},"E_CONTRACT_SIGNATURE");bad({...base,nodes:[required],roots:[required.id],methods:[{...method,returnMode:"take"}]},"E_CONTRACT_SIGNATURE")}],
    ["cycle rejects",()=>bad({...base,nodes:[{...a,parents:[d.id]},b,c,d]},"E_CONTRACT_CYCLE")],
    ["unresolved parent rejects",()=>bad({...base,nodes:[b,c,d]},"E_CONTRACT_UNRESOLVED")],
    ["duplicate roots reject",()=>bad({...base,roots:[d.id,d.id]},"E_CONTRACT_DUPLICATE")],
    ["cross-kind ancestry rejects",()=>bad({...base,nodes:[required,{...a,parents:[required.id]}],roots:[a.id]},"E_CONTRACT_KIND")],
    ["duplicate local methods reject",()=>bad({...base,nodes:[required],roots:[required.id],methods:[method,method]},"E_CONTRACT_DUPLICATE")],
    ["edge and node budgets fail closed",()=>{bad(base,"E_CONTRACT_LIMIT",{edges:1});bad(base,"E_CONTRACT_LIMIT",{nodes:2})}],
    ["witness is deeply immutable at published levels",()=>{const w=resolve(base);if(!Object.isFrozen(w)||!Object.isFrozen(w.slots)||!Object.isFrozen(w.slots[0])||!Object.isFrozen(w.slots[0].obligations)||!Object.isFrozen(w.roots))throw Error("mutable witness")}],
    ["deep chain uses bounded iterative traversal",()=>{const chain=Array.from({length:2000},(_,i)=>node("N"+i,i?[id("N"+(i-1))]:[],i?[]:[{...s,defaultBody:"N0.ping"}]));eq(resolve({...base,nodes:chain,roots:[chain.at(-1).id]}).slots[0].implementation,"N0.ping")}]
  ];
}
for (const [name,run] of referenceCases(resolveInstanceWitness)) test(name,run);
