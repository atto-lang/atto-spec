// Source-only reference semantics: this is NOT an Atto compiler or runtime.
import assert from "node:assert/strict";
import test from "node:test";

const ANY = Symbol("value wildcard");
const str = {kind:"string"}, integer={kind:"int"};
const lit = value => ({kind:"literal", value});
const union = (...variants) => ({kind:"union", variants});
const shape = fields => ({kind:"shape", fields});

// Pure, bounded reference model. It is NOT a compiler or a runtime adapter.
const MAX_SHAPE_DEPTH = 64;
function type_subtype(actual, expected, depth=0) {
  if (!actual || !expected || depth >= MAX_SHAPE_DEPTH) return false;
  // All actual alternatives must conform to at least one expected arm.
  // Testing the expected union first incorrectly rejects A|B <= A|B.
  if (actual.kind === "union")
    return actual.variants.length > 0 &&
      actual.variants.every(t => type_subtype(t, expected, depth+1));
  if (expected.kind === "union")
    return expected.variants.some(t => type_subtype(actual, t, depth+1));
  if (actual.kind === "literal") {
    if (expected.kind === "literal") return Object.is(actual.value,expected.value);
    if (expected.kind === "string") return typeof actual.value === "string";
    if (expected.kind === "int") return Number.isSafeInteger(actual.value);
  }
  if (actual.kind === expected.kind && ["int","string"].includes(actual.kind)) return true;
  if (actual.kind === "shape" && expected.kind === "shape") {
    return Object.entries(expected.fields).every(([key, ty]) => {
      const desc = Object.getOwnPropertyDescriptor(actual.fields, key);
      return !!desc && Object.hasOwn(desc, "value") &&
        type_subtype(desc.value,ty,depth+1);
    });
  }
  return false;
}

// These descriptors represent compiler-proven public fields. A map's generic
// key type does not imply any known key. Never look up inherited/prototype
// members or invoke property getters to manufacture field evidence.
function static_admit(source, expected) {
  if (!["class","record","struct","map"].includes(source.kind)) return false;
  if (source.opaque || source.actor_state || source.effectful_getter) return false;
  if (!source.fields || !expected.fields) return false;
  return Object.entries(expected.fields).every(([key, ty]) => {
    const descriptor = Object.getOwnPropertyDescriptor(source.fields, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return false;
    const member = descriptor.value;
    return !!member && member.public === true && member.readable === true
      && member.guaranteed === true && type_subtype(member.type,ty);
  });
}

// The model makes at most one data-property retrieval per field, disallows
// getters, and calls native Map.prototype methods to avoid overridden hooks.
// A concurrent Atto map must still provide an atomic lookup or snapshot loan;
// this single-threaded JS model is NOT proof of race freedom across actors.
function read_field(subject, name) {
  if (subject === null || typeof subject !== "object") return {present:false};
  if (subject instanceof Map) {
    if (!Map.prototype.has.call(subject,name)) return {present:false};
    return {present:true,value:Map.prototype.get.call(subject,name)};
  }
  const d = Object.getOwnPropertyDescriptor(subject,name);
  if (!d || !Object.hasOwn(d, "value")) return {present:false};
  return {present:true,value:d.value};
}
function runtime_value_pattern(subject, fields) {
  if (subject === null || typeof subject !== "object") return false;
  return fields.every(({name, optional=false, value=ANY}) => {
    const read = read_field(subject,name);
    if (!read.present) return optional;
    return value === ANY || Object.is(read.value,value);
  });
}
function value_has_type(v, type, depth=0) {
  if (!type || depth >= MAX_SHAPE_DEPTH) return false;
  if (type.kind === "literal") return Object.is(v,type.value);
  if (type.kind === "string") return typeof v === "string";
  if (type.kind === "int") return Number.isSafeInteger(v);
  if (type.kind === "union")
    return type.variants.some(t=>value_has_type(v,t,depth+1));
  if (type.kind === "shape")
    return runtime_type_pattern(v,type,depth+1);
  return false;
}
function runtime_type_pattern(subject, expected, depth=0) {
  if (depth >= MAX_SHAPE_DEPTH || subject === null ||
      typeof subject !== "object" || !expected.fields) return false;
  return Object.entries(expected.fields).every(([key,type]) => {
    const read=read_field(subject,key);
    return read.present && value_has_type(read.value,type,depth+1);
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

test("actual union and expected union are set-like for safe readonly subtyping",()=>{
  const both=union(str,integer);
  assert.equal(type_subtype(both,union(str,integer)),true);
  assert.equal(type_subtype(both,union(integer,str)),true);
  assert.equal(type_subtype(union(integer,integer),both),true);
  assert.equal(type_subtype(both,str),false);
  assert.equal(type_subtype(str,both),true);
  assert.equal(type_subtype(union(),str),false);
  assert.equal(type_subtype(str,union()),false);
  assert.equal(type_subtype(shape({foo:both}),shape({foo:both})),true);
});
test("readonly structural field order and extras do not affect compatibility",()=>{
  const row=shape({foo:str, bar:integer});
  assert.equal(type_subtype(shape({bar:integer, foo:str}),row),true);
  assert.equal(type_subtype(shape({foo:str, bar:integer, extra:lit(true)}),row),true);
  assert.equal(type_subtype(shape({foo:str}),row),false);
  assert.equal(type_subtype(shape({foo:integer,bar:integer}),row),false);
});
test("prototype pollution, getters and missing-key laundering cannot establish shape evidence",()=>{
  let reads=0;
  const fields=Object.create({foo:field(str)});
  assert.equal(static_admit({kind:"record",fields},shape({foo:str})),false);
  assert.equal(static_admit({kind:"record",fields:{toString:field(str)}},
                            shape({constructor:str})),false);
  const accessor={};
  Object.defineProperty(accessor,"foo",{get(){reads++;return field(str)},enumerable:true});
  assert.equal(static_admit({kind:"class",fields:accessor},shape({foo:str})),false);
  const instance={};
  Object.defineProperty(instance,"foo",{get(){reads++;return "dog"},enumerable:true});
  assert.equal(runtime_value_pattern(instance,[{name:"foo",value:"dog"}]),false);
  assert.equal(runtime_type_pattern(instance,shape({foo:str})),false);
  assert.equal(reads,0);
});
test("runtime map subclasses cannot override key-presence or lookup used by the reference",()=>{
  let hook=0;
  class UntrustedMap extends Map {
    has(k){ hook++;return true; }
    get(k){ hook++;return "fake"; }
  }
  const map=new UntrustedMap([["foo","dog"]]);
  assert.equal(runtime_value_pattern(map,[{name:"foo",value:"dog"}]),true);
  assert.equal(runtime_value_pattern(map,[{name:"bar",value:"fake"}]),false);
  assert.equal(runtime_type_pattern(map,shape({foo:lit("dog")})),true);
  assert.equal(hook,0);
});
test("optional absence, present null, empty string, unicode and extra keys",()=>{
  const m=new Map([["foo",""],["status",null],["emoji","🐕"]]);
  assert.equal(runtime_value_pattern(m,[{name:"foo",value:""},{name:"emoji",value:"🐕"}]),true);
  assert.equal(runtime_value_pattern(m,[{name:"status",value:null}]),true);
  assert.equal(runtime_value_pattern(m,[{name:"status",value:ANY}]),true);
  assert.equal(runtime_value_pattern(m,[{name:"missing",optional:true,value:"dog"}]),true);
  assert.equal(runtime_value_pattern(m,[{name:"foo",optional:true,value:"dog"}]),false);
  assert.equal(runtime_type_pattern(m,shape({foo:str})),true);
  assert.equal(runtime_type_pattern(m,shape({emoji:lit("🐕")})),true);
});
test("nested structural type checking and cycle depth bound deny unsupported recursion",()=>{
  assert.equal(type_subtype(shape({nested:shape({foo:lit("dog")})}),
                            shape({nested:shape({foo:str})})),true);
  assert.equal(runtime_type_pattern({nested:{foo:"dog"}},
                            shape({nested:shape({foo:str})})),true);
  const recursive=shape({});
  recursive.fields.self=recursive;
  assert.equal(type_subtype(recursive,recursive),false);
  const cyc={};cyc.self=cyc;
  assert.equal(runtime_type_pattern(cyc,recursive),false);
});
