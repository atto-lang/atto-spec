// Source-only reference semantics: this is NOT an Atto compiler or runtime.
import assert from "node:assert/strict";
import test from "node:test";

const ANY = Symbol("value wildcard");
const str = {kind:"string"}, integer={kind:"int"};
const lit = value => ({kind:"literal", value});
const union = (...variants) => ({kind:"union", variants});
const shape = fields => ({kind:"shape", fields});

function type_subtype(actual, expected) {
  if (expected.kind === "union") return expected.variants.some(t=>type_subtype(actual,t));
  if (actual.kind === "union") return actual.variants.every(t=>type_subtype(t,expected));
  if (actual.kind === "literal") {
    if (expected.kind === "literal") return Object.is(actual.value,expected.value);
    if (expected.kind === "string") return typeof actual.value === "string";
    if (expected.kind === "int") return Number.isSafeInteger(actual.value);
  }
  if (actual.kind === expected.kind && ["int","string"].includes(actual.kind)) return true;
  if (actual.kind === "shape" && expected.kind === "shape")
    return Object.entries(expected.fields).every(([k,t]) =>
      Object.hasOwn(actual.fields,k) && type_subtype(actual.fields[k],t));
  return false;
}
// Descriptors model compiler-proved, accessible public fields, NOT JS
// object property enumeration. A generic Map<K,V> has no guaranteed keys.
function static_admit(source, expected) {
  if (!["class","record","struct","map"].includes(source.kind)) return false;
  if (source.opaque || source.actor_state || source.effectful_getter) return false;
  return Object.entries(expected.fields).every(([key, ty]) => {
    const member = source.fields[key];
    return !!member && member.public === true && member.readable === true
      && member.guaranteed === true && type_subtype(member.type,ty);
  });
}
function runtime_value_pattern(subject, fields) {
  if (subject === null || typeof subject !== "object") return false;
  return fields.every(({name, optional=false, value=ANY}) => {
    const present = subject instanceof Map ? subject.has(name) : Object.hasOwn(subject,name);
    if (!present) return optional;
    const actual = subject instanceof Map ? subject.get(name) : subject[name];
    return value === ANY || Object.is(actual,value);
  });
}
function runtime_type_pattern(subject, expected) {
  if (subject === null || typeof subject !== "object") return false;
  return Object.entries(expected.fields).every(([key, type]) => {
    const present = subject instanceof Map ? subject.has(key) : Object.hasOwn(subject,key);
    if (!present) return false;
    const v = subject instanceof Map ? subject.get(key) : subject[key];
    return type.kind === "literal" ? Object.is(type.value,v)
      : type.kind === "string" ? typeof v === "string"
      : type.kind === "int" ? Number.isSafeInteger(v)
      : type.kind === "union" ? type.variants.some(t=>runtime_type_pattern(new Map([["v",v]]),shape({v:t})))
      : false;
  });
}
const field=(type, opts={})=>({type, public:true, readable:true, guaranteed:true,...opts});

test("readonly row subtype admits compatible classes, records, structs, guaranteed maps",()=>{
  for(const kind of ["class","record","struct","map"]){
    assert.equal(static_admit({kind,fields:{foo:field(str), extra:field(integer)}},shape({foo:str})),true,kind);
    assert.equal(static_admit({kind,fields:{foo:field(lit("dog"))}},shape({foo:lit("dog")})),true,kind);
  }
});
test("singleton cannot be inferred from broad declared field or default initializer",()=>{
  assert.equal(static_admit({kind:"class",fields:{foo:field(str,{default_value:"dog"})}},shape({foo:lit("dog")})),false);
  assert.equal(type_subtype(lit("dog"),str),true);
  assert.equal(type_subtype(str,lit("dog")),false);
});
test("union covariant read, but not automatic write permission",()=>{
  assert.equal(type_subtype(str,union(str,integer)),true);
  assert.equal(type_subtype(lit("dog"),union(str,integer)),true);
  assert.equal(type_subtype(union(str,integer),str),false);
  const source={kind:"record",fields:{foo:field(union(str,integer))}};
  assert.equal(static_admit(source,shape({foo:union(str,integer)})),true);
  assert.equal(static_admit(source,shape({foo:str})),false);
});
test("a typed Map's key type alone does not guarantee a literal key",()=>{
  assert.equal(static_admit({kind:"map",fields:{foo:field(str,{guaranteed:false})}},shape({foo:str})),false);
  assert.equal(static_admit({kind:"map",fields:{}},shape({foo:str})),false);
});
test("never allow private, effectful, opaque or actor state fields",()=>{
  for(const bad of [field(str,{public:false}),field(str,{readable:false}),field(str,{guaranteed:false})]){
    assert.equal(static_admit({kind:"class",fields:{foo:bad}},shape({foo:str})),false);
  }
  for(const key of ["opaque","actor_state","effectful_getter"]){
    assert.equal(static_admit({kind:"class",[key]:true,fields:{foo:field(str)}},shape({foo:str})),false);
  }
});
test("runtime map matching distinguishes absent from present null and equality",()=>{
  const m = new Map([["foo","dog"],["status",null]]);
  assert.equal(runtime_value_pattern(m,[{name:"foo",value:"dog"},{name:"status"}]),true);
  assert.equal(runtime_value_pattern(m,[{name:"foo",value:"cat"}]),false);
  assert.equal(runtime_value_pattern(m,[{name:"foo",value:ANY},{name:"status",value:ANY}]),true);
  assert.equal(runtime_value_pattern(m,[{name:"missing"}]),false);
  assert.equal(runtime_value_pattern(m,[{name:"missing",optional:true}]),true);
  assert.equal(runtime_value_pattern(new Map([["foo",null]]),[{name:"foo",value:ANY}]),true);
});
test("runtime shape test refines exactly the required field and typed singleton",()=>{
  const x=new Map([["foo","dog"],["extra",123]]);
  assert.equal(runtime_type_pattern(x,shape({foo:str})),true);
  assert.equal(runtime_type_pattern(x,shape({foo:lit("dog")})),true);
  assert.equal(runtime_type_pattern(x,shape({foo:integer})),false);
  assert.equal(runtime_type_pattern(x,shape({foo:union(str,integer)})),true);
  assert.equal(runtime_type_pattern(new Map(),shape({foo:str})),false);
});
