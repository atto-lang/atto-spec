/** Source-free reference for associated types and typed AOT direct-call plans.
 * This is NOT a .atto compiler or proof of NativeAOT/LLVM/Wasm execution.
 * Requires the already-reviewed v1 resolver for coherent visibility/orphans.
 */
import {resolveStaticTypeclassWitness} from './typeclass-witness-reference.mjs';

const qname=/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;
const name=/^[A-Za-z_][A-Za-z0-9_]*$/;
const method=/^[a-z_][a-z0-9_]*$/;
const primitives=new Set(['int','bool','float','string','void']);
function reject(code) { throw new TypeError('E_WITNESS_'+code); }
function exact(obj, keys) {
  if (!obj || typeof obj!=='object' || Array.isArray(obj) ||
      Object.getPrototypeOf(obj)!==Object.prototype ||
      Reflect.ownKeys(obj).length!==keys.length) reject('SHAPE');
  for (const key of keys) {
    const d=Object.getOwnPropertyDescriptor(obj,key);
    if (!d || !d.enumerable || !Object.hasOwn(d,'value')) reject('SHAPE');
  }
  if (Reflect.ownKeys(obj).some(key=>!keys.includes(key))) reject('SHAPE');
}
function dense(xs,max=512) {
  if (!Array.isArray(xs) || Object.getPrototypeOf(xs)!==Array.prototype ||
      xs.length>max || Reflect.ownKeys(xs).length!==xs.length+1) reject('LIST');
  for(let i=0;i<xs.length;i++) {
    const d=Object.getOwnPropertyDescriptor(xs,String(i));
    if(!d || !d.enumerable || !Object.hasOwn(d,'value')) reject('LIST');
  }
}
function unique(xs,valid,max=128) {
  dense(xs,max);
  if(xs.some(x=>!valid(x)) || new Set(xs).size!==xs.length) reject('LIST');
}
function typeName(s,known) {
  return typeof s==='string' && (primitives.has(s) || known.has(s));
}
function key(tc,typ) { return tc+'\u0000'+typ; }
export function resolveAssociatedTypeclassWitness(catalog,request) {
  exact(catalog,['schema','witnessCatalog','typeclassSignatures','associatedBindings','functionSignatures']);
  if(catalog.schema!=='atto.typeclass.associated-witness.v2') reject('SCHEMA');
  exact(request,['typeclass','nominalType','visibleModules']);
  const base=catalog.witnessCatalog;
  // v1's strict object guard inspects own properties and descriptors;
  // no getters/proxies, arbitrary module lookup, or dynamic reflection.
  const resolved=resolveStaticTypeclassWitness(base,request);
  dense(catalog.typeclassSignatures,256);
  dense(catalog.associatedBindings,512);
  dense(catalog.functionSignatures,1024);
  const known=new Set(base.types.map(x=>x.name));
  const tcNames=new Set(base.typeclasses.map(x=>x.name));
  const seenSigs=new Set(), signatures=new Map();
  for(const s of catalog.typeclassSignatures) {
    exact(s,['typeclass','associatedTypes','methods']);
    if(!tcNames.has(s.typeclass) || seenSigs.has(s.typeclass)) reject('SIGNATURE');
    seenSigs.add(s.typeclass);
    unique(s.associatedTypes,x=>typeof x==='string' && name.test(x) &&
           !primitives.has(x) && x!=='Self',64);
    dense(s.methods,64);
    const required=base.typeclasses.find(t=>t.name===s.typeclass).methods;
    if(s.methods.length!==required.length) reject('SIGNATURE');
    const seen=new Set();
    for(const m of s.methods) {
      exact(m,['name','params','returns']);
      if(!method.test(m.name) || !required.includes(m.name) || seen.has(m.name)) reject('METHOD');
      seen.add(m.name);
      dense(m.params,32);
      const validType=x=>typeName(x,known) || x==='Self' ||
        (typeof x==='string' && x.startsWith('Assoc.') && s.associatedTypes.includes(x.slice(6)));
      if(!m.params.every(validType) || !validType(m.returns)) reject('SIGNATURE');
    }
    signatures.set(s.typeclass,s);
  }
  if(signatures.size!==tcNames.size) reject('SIGNATURE');
  const allImplPairs=new Set(), instanceBindings=new Map();
  for(const imp of base.implementations) {
    const id=key(imp.typeclass,imp.forType);
    if(allImplPairs.has(id)) reject('AMBIGUOUS');
    allImplPairs.add(id);
  }
  for(const a of catalog.associatedBindings) {
    exact(a,['module','typeclass','forType','bindings']);
    if(!allImplPairs.has(key(a.typeclass,a.forType))) reject('ASSOC');
    const witness=base.implementations.find(i=>
      i.module===a.module && i.typeclass===a.typeclass && i.forType===a.forType);
    if(!witness) reject('ASSOC');
    const id=key(a.typeclass,a.forType);
    if(instanceBindings.has(id)) reject('AMBIGUOUS');
    dense(a.bindings,64);
    const declared=signatures.get(a.typeclass)?.associatedTypes;
    if(!declared || declared.length!==a.bindings.length) reject('ASSOC');
    const types=new Map();
    for(const binding of a.bindings) {
      exact(binding,['name','type']);
      if(!declared.includes(binding.name) || types.has(binding.name) ||
         typeof binding.type!=='string') reject('ASSOC');
      types.set(binding.name,binding.type);
    }
    instanceBindings.set(id,types);
  }
  if(instanceBindings.size!==allImplPairs.size) reject('ASSOC');
  const functions=new Map();
  for(const fn of catalog.functionSignatures) {
    exact(fn,['symbol','module','params','returns']);
    if(!qname.test(fn.symbol) || fn.module!==fn.symbol.split('.')[0] || functions.has(fn.symbol)) reject('FUNCTION');
    dense(fn.params,32);
    if(!fn.params.every(p=>typeName(p,known)) || !typeName(fn.returns,known)) reject('FUNCTION');
    functions.set(fn.symbol,fn);
  }
  // Check every static witness symbol, including implementations not selected
  // by this request, before admitting any code-generation plan.
  for(const imp of base.implementations) {
    const signature=signatures.get(imp.typeclass);
    const assoc=instanceBindings.get(key(imp.typeclass,imp.forType));
    if(!signature || !assoc) reject('ASSOC');
    const memo=new Map();
    const substitute=(t,stack=new Set())=>{
      if(t==='Self') return imp.forType;
      const a=t.startsWith('Assoc.')?t.slice(6):null;
      if(a===null) {
        if(!typeName(t,known)) reject('TYPE');
        return t;
      }
      if(memo.has(a)) return memo.get(a);
      if(stack.has(a) || !assoc.has(a)) reject('ASSOC_CYCLE');
      stack.add(a);
      const value=substitute(assoc.get(a),stack);
      stack.delete(a);
      if(value==='void') reject('ASSOC');
      memo.set(a,value);
      return value;
    };
    for(const a of signature.associatedTypes) substitute('Assoc.'+a);
    for(const methodSignature of signature.methods) {
      const sym=imp.bindings.find(b=>b.method===methodSignature.name)?.symbol;
      const fn=functions.get(sym);
      if(!fn || fn.module!==imp.module) reject('FUNCTION');
      const params=methodSignature.params.map(t=>substitute(t));
      const ret=substitute(methodSignature.returns);
      if(fn.params.length!==params.length || fn.params.some((p,i)=>p!==params[i]) ||
         fn.returns!==ret) reject('SIGNATURE_MISMATCH');
    }
  }
  const selected=signatures.get(request.typeclass);
  const associated=instanceBindings.get(key(request.typeclass,request.nominalType));
  const finalAliases=Object.create(null);
  const expand=(type,seen=new Set())=>{
    if(type==='Self') return request.nominalType;
    if(!type.startsWith('Assoc.')) return type;
    const alias=type.slice(6);
    if(seen.has(alias) || !associated.has(alias)) reject('ASSOC_CYCLE');
    seen.add(alias);
    return expand(associated.get(alias),seen);
  };
  for(const a of selected.associatedTypes) finalAliases[a]=expand('Assoc.'+a);
  const staticCalls=Object.create(null);
  for(const m of selected.methods) {
    staticCalls[m.name]=Object.freeze({
      kind:'DIRECT_AOT_CALL',symbol:resolved.dispatch[m.name],
      params:Object.freeze(m.params.map(p=>expand(p))),
      returns:expand(m.returns),
      runtimeReflectionRequired:false
    });
  }
  return Object.freeze({
    kind:'STATIC_ASSOCIATED_WITNESS_V2',
    typeclass:request.typeclass,concreteType:request.nominalType,
    providerModule:resolved.providerModule,
    associatedTypes:Object.freeze(finalAliases),
    calls:Object.freeze(staticCalls),
    compilerExecutable:false,authenticated:false,
    runtimeReflectionRequired:false
  });
}
