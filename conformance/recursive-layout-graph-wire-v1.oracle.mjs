// Source-free contract oracle; not a guest/backend result.
function model(){
  function layout(nodes, edges) {
    const indegree = new Map(nodes.map(n=>[n,0])), out=new Map(nodes.map(n=>[n,[]]));
    for(const [a,b,inline] of edges){
      if(!indegree.has(a)||!indegree.has(b))throw Error("unknown layout");
      if(inline){out.get(a).push(b);indegree.set(b,indegree.get(b)+1);}
    }
    const q=nodes.filter(n=>indegree.get(n)===0); let count=0;
    for(let i=0;i<q.length;i++){count++;for(const b of out.get(q[i])){indegree.set(b,indegree.get(b)-1);if(indegree.get(b)===0)q.push(b);}}
    return count===nodes.length;
  }
  function decode(w,limits={nodes:16,edges:32},publish=()=>{}){
    function exact(x,keys){return x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.keys(x).sort().join(",")===keys.slice().sort().join(",");}
    function deny(){throw Error("invalid graph");}
    if(!exact(w,["version","root","objects"])||w.version!==1||!Array.isArray(w.objects)||w.objects.length===0||w.objects.length>limits.nodes||!Number.isSafeInteger(w.root)||w.root<0||w.root>=w.objects.length)deny();
    let edges=0;
    for(let i=0;i<w.objects.length;i++){
      const n=w.objects[i];
      if(!exact(n,["id","type","value","next","alias"])||n.id!==i||!["Node","Other"].includes(n.type)||!Number.isInteger(n.value)||n.value < -2147483648||n.value>2147483647)deny();
      for(const id of [n.next,n.alias]){
        if(id===null)continue;
        if(++edges>limits.edges||!Number.isSafeInteger(id)||id<0||id>=w.objects.length||w.objects[id]?.type!=="Node")deny();
      }
    }
    const seen=new Set([w.root]),q=[w.root];
    for(let i=0;i<q.length;i++)for(const id of [w.objects[q[i]].next,w.objects[q[i]].alias])if(id!==null&&!seen.has(id)){seen.add(id);q.push(id);}
    if(seen.size!==w.objects.length)deny();
    const shells=w.objects.map(n=>({type:n.type,value:n.value,next:null,alias:null}));
    for(let i=0;i<shells.length;i++){const n=w.objects[i];shells[i].next=n.next===null?null:shells[n.next];shells[i].alias=n.alias===null?null:shells[n.alias];}
    publish(shells[w.root]);return shells[w.root];
  }
  const node=(id,next=null,alias=null,type="Node",value=1)=>({id,type,value,next,alias});
  const wire=(objects,root=0)=>({version:1,root,objects});
  const tests=[];
  function check(name,f){if(!f())throw Error(name);tests.push(name);}
  function rejects(w,limits){let published=0;try{decode(w,limits,()=>published++);return false;}catch{return published===0;}}
  check("inline self cycle",()=>!layout(["A"],[["A","A",true]]));
  check("mutual inline cycle",()=>!layout(["A","B"],[["A","B",true],["B","A",true]]));
  check("explicit reference cuts cycle",()=>layout(["A","B"],[["A","B",true],["B","A",false]]));
  check("diamond inline finite",()=>layout(["A","B","C"],[["A","B",true],["A","C",true],["B","C",true]]));
  check("self edge preserved",()=>{let a=decode(wire([node(0,0)]));return a===a.next;});
  check("mutual cycle preserved",()=>{let a=decode(wire([node(0,1),node(1,0)]));return a.next.next===a;});
  check("diamond identity preserved",()=>{let a=decode(wire([node(0,1,2),node(1,3),node(2,3),node(3)]));return a.next.next===a.alias.next;});
  check("independent decode roots",()=>{let w=wire([node(0,0)]),a=decode(w),b=decode(w);a.value=9;return a!==b&&b.value===1&&b.next===b;});
  check("duplicate ID refused",()=>rejects(wire([node(0,1),node(0)])));
  check("dangling reference refused",()=>rejects(wire([node(0,1)])));
  check("unreachable object refused",()=>rejects(wire([node(0),node(1)])));
  check("unknown type refused",()=>rejects(wire([node(0,null,null,"Foreign")])));
  check("wrong target type refused",()=>rejects(wire([node(0,1),node(1,null,null,"Other")])));
  check("out-of-range scalar refused",()=>rejects(wire([node(0,null,null,"Node",2147483648)])));
  check("unknown field refused",()=>rejects(wire([{...node(0),capability:1}])));
  check("unsupported version refused",()=>rejects({...wire([node(0)]),version:2}));
  check("invalid root refused",()=>rejects(wire([node(0)],1)));
  check("exact logical node/edge boundary",()=>{let a=decode(wire([node(0,1),node(1,0)]),{nodes:2,edges:2});return a.next.next===a;});
  check("node limit refusal",()=>rejects(wire([node(0,1),node(1)]),{nodes:1,edges:2}));
  check("edge limit refusal",()=>rejects(wire([node(0,0,0)]),{nodes:1,edges:1}));
  check("publish once",()=>{let count=0;decode(wire([node(0,0)]),undefined,()=>count++);return count===1;});
  return tests;
}
const passed = model();
console.log(JSON.stringify({scope:'SOURCE_FREE_MODEL',passed:passed.length,cases:passed}));
