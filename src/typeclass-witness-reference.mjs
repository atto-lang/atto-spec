/**
 * Compile-time typeclass witness lookup proposal. No runtime reflection,
 * vtable generation, dynamic proxy, generic JIT, or actual AttoLang compiler.
 */
const symbol = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const method = /^[a-z_][a-z0-9_]{0,63}$/;
const mod = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
function err(code) { throw new TypeError('E_WITNESS_' + code); }
function exact(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) ||
      Object.getPrototypeOf(obj) !== Object.prototype ||
      Reflect.ownKeys(obj).length !== keys.length) err('SHAPE');
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(obj,key);
    if (!d || !d.enumerable || !Object.hasOwn(d,'value')) err('SHAPE');
  }
  if (Reflect.ownKeys(obj).some(k => !keys.includes(k))) err('SHAPE');
}
function dense(list, max=512) {
  if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype ||
      list.length > max || Reflect.ownKeys(list).length !== list.length + 1)
    err('LIST');
  // Inspect descriptors before reading values: holes, accessors and hidden keys fail closed.
  for (let i=0; i<list.length; i++) {
    const d=Object.getOwnPropertyDescriptor(list,String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d,'value')) err('LIST');
  }
}
function distinct(list, valid, max=128) {
  dense(list,max);
  if (list.some(v => !valid(v)) || new Set(list).size !== list.length)
    err('LIST');
}
export function resolveStaticTypeclassWitness(catalog, request) {
  exact(catalog,['schema','closedWorld','runtimeReflection','types','typeclasses','implementations']);
  if (catalog.schema !== 'atto.typeclass.witness.v1' ||
      catalog.closedWorld !== true || catalog.runtimeReflection !== false) err('CLOSED_WORLD');
  if (!Array.isArray(catalog.types) || !Array.isArray(catalog.typeclasses) ||
      !Array.isArray(catalog.implementations) ||
      catalog.types.length > 256 || catalog.typeclasses.length > 256 ||
      catalog.implementations.length > 512) err('CATALOG');
  dense(catalog.types,256);
  dense(catalog.typeclasses,256);
  dense(catalog.implementations,512);
  const seenTypes=new Set(), seenTypeclasses=new Set();
  for (const t of catalog.types) {
    exact(t,['name','owner']);
    if (!symbol.test(t.name) || !mod.test(t.owner) ||
        !t.name.startsWith(t.owner+'.') || seenTypes.has(t.name)) err('TYPE');
    seenTypes.add(t.name);
  }
  for (const tc of catalog.typeclasses) {
    exact(tc,['name','owner','methods']);
    if (!symbol.test(tc.name) || !mod.test(tc.owner) ||
        !tc.name.startsWith(tc.owner+'.') || seenTypeclasses.has(tc.name)) err('TYPECLASS');
    distinct(tc.methods,v => typeof v === 'string' && method.test(v),64);
    if (!tc.methods.length) err('METHODS');
    seenTypeclasses.add(tc.name);
  }
  exact(request,['typeclass','nominalType','visibleModules']);
  if (!seenTypes.has(request.nominalType) || !seenTypeclasses.has(request.typeclass))
    err('UNKNOWN_DECLARATION');
  distinct(request.visibleModules,v => typeof v === 'string' && mod.test(v),64);
  const tc = catalog.typeclasses.find(t=>t.name===request.typeclass);
  const typ = catalog.types.find(t=>t.name===request.nominalType);
  const matches=[];
  for (const imp of catalog.implementations) {
    exact(imp,['module','typeclass','forType','bindings']);
    if (!mod.test(imp.module) ||
        !seenTypeclasses.has(imp.typeclass) || !seenTypes.has(imp.forType) ||
        !Array.isArray(imp.bindings) || imp.bindings.length > 64) err('IMPLEMENTATION');
    dense(imp.bindings,64);
    const declaredTc=catalog.typeclasses.find(t=>t.name===imp.typeclass);
    const declaredType=catalog.types.find(t=>t.name===imp.forType);
    if (imp.module!==declaredTc.owner && imp.module!==declaredType.owner)
      err('ORPHAN_IMPL');
    const names=new Set();
    for (const b of imp.bindings) {
      exact(b,['method','symbol']);
      if (!method.test(b.method) || !symbol.test(b.symbol) ||
          !b.symbol.startsWith(imp.module+'.') || names.has(b.method))
        err('BINDING');
      names.add(b.method);
    }
    if (imp.bindings.length!==declaredTc.methods.length ||
        declaredTc.methods.some(n=>!names.has(n))) err('METHOD_MISMATCH');
    if (imp.typeclass===request.typeclass && imp.forType===request.nominalType &&
        request.visibleModules.includes(imp.module)) matches.push(imp);
  }
  if (!matches.length) err('MISSING');
  if (matches.length!==1) err('AMBIGUOUS');
  const imp=matches[0];
  const dispatch=Object.freeze(Object.fromEntries(imp.bindings.map(x=>[x.method,x.symbol])));
  return Object.freeze({kind:'STATIC_AOT_WITNESS',typeclass:tc.name,
    concreteType:typ.name,providerModule:imp.module,dispatch,
    runtimeReflectionRequired:false,authenticated:false,compilerExecutable:false});
}
