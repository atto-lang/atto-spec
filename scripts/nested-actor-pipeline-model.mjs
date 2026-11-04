// SOURCE-FREE reference model only: no AttoLang parser/compiler/runtime is exercised.

export function stage(name,input,output){
  if(typeof name!=="string"||!name||!(typeof input==="string"||input===null)||!(typeof output==="string"||output===null))throw Error("invalid stage");
  return Object.freeze({kind:"stage",name,input,output});
}

export function pipe(...parts){
  if(parts.length===0)throw Error("empty pipeline");
  return Object.freeze({kind:"pipe",parts:Object.freeze(parts.slice()),capacity:null,supervision:null});
}

export function with_capacity(builder,n){
  if(!builder||builder.kind!=="pipe"||builder.capacity!==null)throw Error("duplicate or invalid capacity configuration");
  if(!Number.isSafeInteger(n)||n<1)throw Error("capacity must be positive safe integer");
  return Object.freeze({...builder,capacity:n});
}

export function with_supervision(builder,policy){
  if(!builder||builder.kind!=="pipe"||builder.supervision!==null)throw Error("duplicate or invalid supervision configuration");
  if(!["#one_for_one","#one_for_all","#rest_for_one"].includes(policy))throw Error("invalid supervision strategy");
  return Object.freeze({...builder,supervision:policy});
}

export function analyze_pipeline(root,default_capacity=32){
  if(!root||root.kind!=="pipe")throw Error("pipeline root required");
  if(!Number.isSafeInteger(default_capacity)||default_capacity<1)throw Error("bad default capacity");
  const seen=new WeakSet(),nodes=[],edges=[],scopes=[];
  function walk(item,path,parent_scope,inherited_capacity){
    if(!item||typeof item!=="object"||seen.has(item))throw Error("invalid or reused descriptor");
    seen.add(item);
    if(item.kind==="stage"){
      nodes.push({id:path,name:item.name,owner:parent_scope,input:item.input,output:item.output});
      return {first:path,last:path,input:item.input,output:item.output};
    }
    if(item.kind!=="pipe"||!Array.isArray(item.parts)||item.parts.length===0)throw Error("invalid segment");
    const capacity=item.capacity===null?inherited_capacity:item.capacity;
    if(!Number.isSafeInteger(capacity)||capacity<1)throw Error("invalid capacity");
    const is_scope=path==="root"||item.supervision!==null;
    const scope=is_scope?path:parent_scope;
    if(is_scope)scopes.push({id:scope,parent:path==="root"?null:parent_scope,policy:item.supervision??"#one_for_one"});
    let first=null,previous=null;
    item.parts.forEach((child,index)=>{
      const current=walk(child,path+"/"+index,scope,capacity);
      if(previous){
        if(previous.output===null||current.input===null)throw Error("source/sink position mismatch");
        if(previous.output!==current.input)throw Error("incompatible boundary types");
        edges.push({from:previous.last,to:current.first,capacity,owner:scope});
      }
      if(first===null)first=current;
      previous=current;
    });
    return {first:first.first,last:previous.last,input:first.input,output:previous.output};
  }
  const ports=walk(root,"root",null,default_capacity);
  return {nodes,edges,scopes,ports:{input:ports.input,output:ports.output}};
}
