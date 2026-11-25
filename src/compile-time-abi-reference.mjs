// Source-free reference checker for AttoLang compile-time reflection / ABI proposals.
// NOT a compiler, C ABI verifier, capability broker or proof of full guest AOT.
const fail=(code)=>{throw new Error(code);};
function record(x,keys){
  if(!x||typeof x!=='object'||Array.isArray(x)||Object.getPrototypeOf(x)!==Object.prototype)fail('E_ABI_SHAPE');
  const own=Reflect.ownKeys(x);
  if(own.length!==Object.keys(x).length||Object.keys(x).some(k=>!Object.getOwnPropertyDescriptor(x,k)?.value && Object.getOwnPropertyDescriptor(x,k)?.get))
    fail('E_ABI_SHAPE');
  if(keys&&own.some(k=>!keys.includes(k)))fail('E_ABI_SHAPE');
}
function list(a,max=64){
  if(!Array.isArray(a)||a.length>max||Object.keys(a).length!==a.length||Reflect.ownKeys(a).length!==a.length+1)fail('E_ABI_LIST');
  for(let i=0;i<a.length;i++)if(!Object.hasOwn(a,i)||!Object.getOwnPropertyDescriptor(a,String(i))?.value&&Object.getOwnPropertyDescriptor(a,String(i))?.get)fail('E_ABI_LIST');
}
function n(x){if(!Number.isSafeInteger(x)||x<0)fail('E_ABI_OVERFLOW');return x;}
function add(a,b){a=n(a);b=n(b);return n(a+b);}
function pow2(x){return Number.isSafeInteger(x)&&x>0&&(Math.log2(x)%1===0);}
function alignUp(value,alignment){if(!pow2(alignment))fail('E_ABI_ALIGNMENT');return n(Math.ceil(n(value)/alignment)*alignment);}
const types=Object.freeze({u8:1,i8:1,u16:2,i16:2,u32:4,i32:4,u64:8,i64:8,f32:4,f64:8});
export function compileLayout(layout,target){
  record(layout,['name','repr','target','endian','fields','size','align']);
  record(target,['triple','endian','alignments','maxAlign']);
  if(layout.repr!=='C'||typeof layout.name!=='string'||!layout.name||layout.target!==target.triple||layout.endian!==target.endian)fail('E_ABI_TARGET_UNKNOWN');
  if(!['little','big'].includes(target.endian))fail('E_ABI_TARGET_UNKNOWN');
  record(target.alignments,Object.keys(types));
  if(!pow2(target.maxAlign))fail('E_ABI_ALIGNMENT');
  list(layout.fields);
  if(!layout.fields.length)fail('E_ABI_UNSUPPORTED_FIELD');
  const names=new Set();let pos=0,structAlign=1;const result=[];
  for(const f of layout.fields){
    record(f,['name','type','offset']);
    if(typeof f.name!=='string'||!/^[a-z_][a-z0-9_]*$/.test(f.name)||names.has(f.name))fail('E_ABI_UNSUPPORTED_FIELD');
    names.add(f.name);
    if(!Object.hasOwn(types,f.type)||!Object.hasOwn(target.alignments,f.type))fail('E_ABI_UNSUPPORTED_FIELD');
    const a=target.alignments[f.type],size=types[f.type];
    if(!pow2(a)||a>target.maxAlign||a>size)fail('E_ABI_ALIGNMENT');
    structAlign=Math.max(structAlign,a);pos=alignUp(pos,a);
    if(f.offset!==pos)fail('E_ABI_LAYOUT_MISMATCH');
    result.push(Object.freeze({name:f.name,type:f.type,offset:pos,size,align:a}));
    pos=add(pos,size);
  }
  const total=alignUp(pos,structAlign);
  if(layout.size!==total||layout.align!==structAlign)fail('E_ABI_LAYOUT_MISMATCH');
  return Object.freeze({name:layout.name,target:target.triple,size:total,align:structAlign,
    fields:Object.freeze(result),guestAotCertified:false,cHeaderVerified:false,runtimeReflection:false});
}
export function compileMetadata(type,{requester,derive=false}={}){
  record(type,['name','owner','fields','kind','closed']);
  if(!type.closed||!['struct','record','enum'].includes(type.kind))fail('E_COMPTIME_REFLECTION_DYNAMIC');
  if(typeof requester!=='string'||!requester)fail('E_COMPTIME_PRIVATE');
  list(type.fields,32);
  const seen=new Set(),visible=[];
  for(const f of type.fields){
    record(f,['name','type','visibility']);
    if(typeof f.name!=='string'||!f.name||seen.has(f.name)||typeof f.type!=='string')fail('E_ABI_SHAPE');
    if(!['pub','private'].includes(f.visibility))fail('E_ABI_SHAPE');
    seen.add(f.name);
    if(f.visibility==='pub'||requester===type.owner)visible.push(Object.freeze({name:f.name,type:f.type}));
    else if(derive)fail('E_COMPTIME_PRIVATE');
  }
  if(derive){
    if(requester!==type.owner)fail('E_COMPTIME_PRIVATE');
    for(const f of visible)if(!Object.hasOwn(types,f.type))fail('E_COMPTIME_REFLECTION_DYNAMIC');
  }
  return Object.freeze({type:type.name,fields:Object.freeze(visible),codegenOnly:true,
    runtimeReflection:false,guestAotCertified:false});
}
export function checkForeignBinding(binding){
  record(binding,['symbol','target','abi','artifactSha256','params','result','effects','ownership','callbacks','thread']);
  if(typeof binding.symbol!=='string'||!/^[a-z_][a-z0-9_]*$/.test(binding.symbol)
     ||typeof binding.target!=='string'||!binding.target
     ||binding.abi!=='C-v1'||typeof binding.artifactSha256!=='string'
     ||!/^[a-f0-9]{64}$/.test(binding.artifactSha256))fail('E_FFI_BINDING');
  list(binding.params,16);list(binding.effects,8);list(binding.ownership,16);
  const allowed=new Set(['int','bool','float']);
  if(binding.params.some(t=>!allowed.has(t))||!(allowed.has(binding.result)||binding.result==='void'))
    fail('E_FFI_UNSUPPORTED_TYPE');
  const e=new Set(binding.effects);
  if(e.size!==binding.effects.length||binding.effects.some(x=>!['ffi','blocking','suspends'].includes(x))||!e.has('ffi'))fail('E_FFI_EFFECT');
  if(binding.ownership.length!==binding.params.length||binding.ownership.some(x=>x!=='value'))fail('E_FFI_OWNERSHIP');
  if(binding.callbacks!=='none'||binding.thread!=='calling-thread')fail('E_FFI_CALLBACK');
  return Object.freeze({symbol:binding.symbol,aotStatic:true,capabilityAuthorized:false,
     guestAotCertified:false,callbackAllowed:false});
}
