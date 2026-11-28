// Theater v2 candidate descriptor planner. HOST MODEL ONLY; not an Atto compiler, capability service, or runtime.
function planComposition(descriptor, authorizedTenant) {
  const fail=code=>({ok:false,code,order:[],rollback:[]});
  const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
  const ident=x=>typeof x==="string"&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(x);
  const dense=x=>Array.isArray(x)&&Array.from({length:x.length},(_,i)=>Object.hasOwn(x,i)).every(Boolean);
  if(!plain(descriptor)||!ident(descriptor.tenant)||!dense(descriptor.members)||descriptor.members.length===0||descriptor.members.length>1024)return fail("INVALID_DESCRIPTOR");
  // Host model only: authorizedTenant stands for a prevalidated capability, not a capability API.
  if(!ident(authorizedTenant)||descriptor.tenant!==authorizedTenant)return fail("UNAUTHORIZED_TENANT");
  const byId=new Map();
  for(const m of descriptor.members){
    if(!plain(m)||!ident(m.id)||!["actor","supervisor"].includes(m.kind)||!dense(m.dependsOn)||!m.dependsOn.every(ident)||new Set(m.dependsOn).size!==m.dependsOn.length)return fail("INVALID_MEMBER");
    if(byId.has(m.id))return fail("DUPLICATE_MEMBER");
    if(m.kind==="actor"&&!ident(m.owner))return fail("INVALID_OWNER");
    if(m.kind==="supervisor"&&m.owner!==null&&!ident(m.owner))return fail("INVALID_OWNER");
    byId.set(m.id,m);
  }
  const dependencies=new Map();
  for(const m of byId.values()){
    if(m.owner!==null&&byId.get(m.owner)?.kind!=="supervisor")return fail("INVALID_OWNER");
    const ds=new Set(m.dependsOn);
    if(m.owner!==null)ds.add(m.owner);
    for(const d of ds)if(!byId.has(d))return fail("UNKNOWN_DEPENDENCY");
    dependencies.set(m.id,ds);
  }
  const done=new Set(),order=[];
  while(order.length<byId.size){
    const ready=[...byId.keys()].filter(id=>!done.has(id)&&[...dependencies.get(id)].every(d=>done.has(d))).sort();
    if(!ready.length)return fail("DEPENDENCY_CYCLE");
    const id=ready[0];done.add(id);order.push(id);
  }
  return {ok:true,order,rollback:[...order].reverse()};
}
function rollbackPrefix(plan, started) {
  if(plan?.ok!==true||!Array.isArray(plan.order)||!Array.isArray(started)||started.length>plan.order.length)return {ok:false,code:"INVALID_START_PREFIX",retire:[]};
  for(let i=0;i<started.length;i++)if(!Object.hasOwn(started,i)||started[i]!==plan.order[i])return {ok:false,code:"INVALID_START_PREFIX",retire:[]};
  return {ok:true,retire:[...started].reverse()};
}
function cases() {
  const S=(id,owner=null,dependsOn=[])=>({id,kind:"supervisor",owner,dependsOn});
  const A=(id,owner,dependsOn=[])=>({id,kind:"actor",owner,dependsOn});
  const d=()=>({tenant:"T",members:[A("Sink","Root",["Source"]),S("Root"),A("Source","Root"),S("Nested","Root"),A("Worker","Nested")]});
  const p=x=>planComposition(x,"T");
  const ok=p(d());
  const entries=[
    ["deterministic dependency order",()=>JSON.stringify(ok.order)===JSON.stringify(["Root","Nested","Source","Sink","Worker"])],
    ["declaration permutation stable",()=>JSON.stringify(p({...d(),members:d().members.reverse()}))===JSON.stringify(ok)],
    ["reverse teardown",()=>JSON.stringify(ok.rollback)===JSON.stringify([...ok.order].reverse())],
    ["descriptor not mutated",()=>{const x=d(),before=JSON.stringify(x);p(x);return JSON.stringify(x)===before;}],
    ["unauthorized tenant denied",()=>planComposition(d(),"Other").code==="UNAUTHORIZED_TENANT"],
    ["missing authorization denied",()=>planComposition(d(),null).code==="UNAUTHORIZED_TENANT"],
    ["duplicate identity denied",()=>{const x=d();x.members.push(S("Root"));return p(x).code==="DUPLICATE_MEMBER";}],
    ["unknown dependency denied",()=>{const x=d();x.members[0].dependsOn=["Missing"];return p(x).code==="UNKNOWN_DEPENDENCY";}],
    ["owner missing denied",()=>{const x=d();x.members[0].owner=null;return p(x).code==="INVALID_OWNER";}],
    ["non-supervisor owner denied",()=>{const x=d();x.members[0].owner="Source";return p(x).code==="INVALID_OWNER";}],
    ["multiple owner representation denied",()=>{const x=d();x.members[0].owner=["Root","Nested"];return p(x).code==="INVALID_OWNER";}],
    ["dependency cycle denied with no partial plan",()=>{const x=d();x.members[2].dependsOn=["Sink"];const a=p(x);return a.code==="DEPENDENCY_CYCLE"&&a.order.length===0;}],
    ["supervision cycle denied",()=>{const x=d();x.members[1].owner="Nested";return p(x).code==="DEPENDENCY_CYCLE";}],
    ["self dependency denied",()=>{const x=d();x.members[0].dependsOn=["Sink"];return p(x).code==="DEPENDENCY_CYCLE";}],
    ["duplicate dependency denied",()=>{const x=d();x.members[0].dependsOn=["Source","Source"];return p(x).code==="INVALID_MEMBER";}],
    ["sparse members denied",()=>{const x=d();delete x.members[1];return p(x).code==="INVALID_DESCRIPTOR";}],
    ["partial startup rollback",()=>JSON.stringify(rollbackPrefix(ok,ok.order.slice(0,3)).retire)===JSON.stringify(["Source","Nested","Root"])],
    ["empty rollback",()=>rollbackPrefix(ok,[]).retire.length===0],
    ["forged startup ledger denied",()=>rollbackPrefix(ok,["Source"]).code==="INVALID_START_PREFIX"],
    ["duplicate startup ledger denied",()=>rollbackPrefix(ok,["Root","Root"]).code==="INVALID_START_PREFIX"],
    ["sparse startup ledger denied",()=>{const x=["Root","Nested"];delete x[1];return rollbackPrefix(ok,x).code==="INVALID_START_PREFIX";}],
    ["failed plan cannot authorize retirement",()=>rollbackPrefix(p({}),[]).code==="INVALID_START_PREFIX"],
    ["prototype-like identifier is treated as data",()=>p({tenant:"T",members:[S("__proto__"),A("constructor","__proto__")]}).ok],
    ["descriptor resource bound",()=>p({tenant:"T",members:Array.from({length:1025},(_,i)=>S("S"+i))}).code==="INVALID_DESCRIPTOR"]
  ];
  return entries;
}
import test from 'node:test';
import assert from 'node:assert/strict';
for (const [name, check] of cases()) test(name, () => assert.equal(check(), true));
