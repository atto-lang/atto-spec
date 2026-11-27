// Bounded reference model; not a compiler or a runtime loan checker.
function plan(leaves, capture, sourcePaths) {
 const names=new Set([capture]), actions=[], available=new Set(sourcePaths);
 if(!capture||capture==='_')throw Error("capture");
 const overlap=(a,b)=>a===b||a.startsWith(b+"/")||b.startsWith(a+"/");
 for(const {name,path,mode} of leaves){
  if(!name||name==='_'||names.has(name))throw Error("duplicate");
  names.add(name);
  if(!available.has(path))throw Error("missing path");
  if(!["copy","read","write","take"].includes(mode))throw Error("unsupported mode");
  for(const prev of actions)if(overlap(prev.path,path)&&(prev.mode==="take"||mode==="take"||prev.mode==="write"||mode==="write"))throw Error("overlap");
  actions.push({name,path,mode});
 }
 return actions;
}
function permitted(actions,path,mode){
 const overlap=(a,b)=>a===b||a.startsWith(b+"/")||b.startsWith(a+"/");
 return !actions.some(a=>overlap(a.path,path)&&(a.mode==="take"||a.mode==="write"||a.mode==="read"&&mode!=="read"));
}
export {plan,permitted};
