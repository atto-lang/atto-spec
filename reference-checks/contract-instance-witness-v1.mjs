// HOST-ONLY reference for a deliberately bounded nominal instance subset.
// Exact scalar signature facts only; no generic substitution, variance, layout or guest dispatch.
export function resolveInstanceWitness(input, limits={}) {
  // Reference model over normalized typed facts, not a parser or executable ABI.
  const fail=(code)=>{throw Error(code)};
  const cap={nodes:4096,edges:16384,slots:16384,checks:65536,...limits};
  for(const n of Object.values(cap))if(!Number.isSafeInteger(n)||n<1)fail("E_CONTRACT_LIMIT");
  const key=(id)=>{
    if(!Array.isArray(id)||id.length!==5||id.some(x=>typeof x!=="string"||!x.length))fail("E_CONTRACT_ID");
    return JSON.stringify(id);
  };
  const owner=key(input.owner), nodes=new Map();
  if(!Array.isArray(input.nodes)||input.nodes.length>cap.nodes)fail("E_CONTRACT_LIMIT");
  for(const n of input.nodes){
    const id=key(n.id);
    if(nodes.has(id))fail("E_CONTRACT_DUPLICATE");
    if(!["interface","trait"].includes(n.kind)||n.id[3]!==n.kind||!Array.isArray(n.parents)||!Array.isArray(n.slots))fail("E_CONTRACT_KIND");
    nodes.set(id,n);
  }
  const slotKey=(s)=>{
    if(typeof s.name!=="string"||!s.name||!Array.isArray(s.params)||!Array.isArray(s.effects)||typeof s.result!=="string"||!s.result||!["read","write","take"].includes(s.receiver)||!["borrow","take","copy","share","value"].includes(s.returnMode))fail("E_CONTRACT_SIGNATURE");
    for(const p of s.params)if(typeof p.label!=="string"||typeof p.type!=="string"||!p.type||!["borrow","take","copy","share","value","borrow_mut"].includes(p.mode))fail("E_CONTRACT_SIGNATURE");
    if(s.effects.some(e=>typeof e!=="string"||!e)||new Set(s.effects).size!==s.effects.length)fail("E_CONTRACT_SIGNATURE");
    return JSON.stringify([s.name,s.params.length]);
  };
  const compatible=(need,actual)=>actual.visibility==="pub"&&actual.instance===true&&actual.result===need.result&&actual.returnMode===need.returnMode&&actual.receiver===need.receiver&&JSON.stringify(actual.params.map(p=>[p.label,p.type,p.mode]))===JSON.stringify(need.params.map(p=>[p.label,p.type,p.mode]))&&actual.effects.every(e=>need.effects.includes(e));
  if(!Array.isArray(input.roots)||!Array.isArray(input.methods))fail("E_CONTRACT_SIGNATURE");
  if(input.roots.length>cap.nodes||input.methods.length>cap.slots)fail("E_CONTRACT_LIMIT");
  const roots=input.roots.map(key).sort();
  if(new Set(roots).size!==roots.length)fail("E_CONTRACT_DUPLICATE");
  const state=new Map(), buckets=new Map();
  let edges=0,slots=0,checks=0;
  // Iterate rather than recurse so a deep legal graph cannot overflow the host stack.
  for(const root of roots){
    const stack=[{id:root,exit:false}];
    while(stack.length){
      const frame=stack.pop(), id=frame.id;
      if(frame.exit){state.set(id,2);continue}
      if(state.get(id)===1)fail("E_CONTRACT_CYCLE");
      if(state.get(id)===2)continue;
      const node=nodes.get(id);
      if(!node)fail("E_CONTRACT_UNRESOLVED");
      state.set(id,1);stack.push({id,exit:true});
      const local=new Set();
      for(const s of node.slots){
        if(++slots>cap.slots)fail("E_CONTRACT_LIMIT");
        const sk=slotKey(s);
        if(local.has(sk))fail("E_CONTRACT_DUPLICATE");
        local.add(sk);
        if(s.defaultBody!==undefined&&(!s.defaultBody||typeof s.defaultBody!=="string"||node.kind!=="trait"||s.instance!==true||s.visibility!=="pub"))fail("E_CONTRACT_KIND");
        if(s.visibility!=="pub"||s.instance!==true)fail("E_CONTRACT_KIND");
        if(!buckets.has(sk))buckets.set(sk,[]);
        buckets.get(sk).push({origin:id,slot:s});
      }
      const parents=node.parents.map(key).sort();
      if(new Set(parents).size!==parents.length)fail("E_CONTRACT_DUPLICATE");
      for(const parent of parents){
        if(++edges>cap.edges)fail("E_CONTRACT_LIMIT");
        const p=nodes.get(parent);
        if(!p)fail("E_CONTRACT_UNRESOLVED");
        if(p.kind!==node.kind)fail("E_CONTRACT_KIND");
      }
      for(let j=parents.length-1;j>=0;j--)stack.push({id:parents[j],exit:false});
    }
  }
  const methods=new Map();
  for(const m of input.methods){
    const sk=slotKey(m);
    if(key(m.owner)!==owner||m.instance!==true)continue;
    if(typeof m.body!=="string"||!m.body)fail("E_CONTRACT_UNRESOLVED");
    if(methods.has(sk))fail("E_CONTRACT_DUPLICATE");
    methods.set(sk,m);
  }
  const resolved=[];
  for(const sk of [...buckets.keys()].sort()){
    const obligations=buckets.get(sk).sort((a,b)=>a.origin<b.origin?-1:a.origin>b.origin?1:0);
    const local=methods.get(sk), defaults=obligations.filter(o=>o.slot.defaultBody!==undefined);
    if(!local&&defaults.length>1)fail("E_CONTRACT_CONFLICT");
    const chosen=local??defaults[0]?.slot;
    if(!chosen)fail("E_CONTRACT_MISSING");
    for(const o of obligations){
      if(++checks>cap.checks)fail("E_CONTRACT_LIMIT");
      if(!compatible(o.slot,chosen))fail(chosen.visibility!=="pub"?"E_CONTRACT_VISIBILITY":"E_CONTRACT_SIGNATURE");
    }
    resolved.push(Object.freeze({slot:sk,implementation:local?local.body:defaults[0].slot.defaultBody,origin:local?owner:defaults[0].origin,obligations:Object.freeze(obligations.map(o=>o.origin))}));
  }
  return Object.freeze({owner,roots:Object.freeze(roots),slots:Object.freeze(resolved)});
}
