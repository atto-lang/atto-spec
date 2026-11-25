// Host-only reference semantics; NOT an Atto parser, borrow checker or guest.
import assert from "node:assert/strict";
import test from "node:test";

function fail(code) { const error=new Error(code); error.code=code; throw error; }
function type_of(value) {
  if(typeof value==="number") return Number.isSafeInteger(value)?"int":"float";
  if(typeof value==="boolean") return "bool";
  if(typeof value==="string") return "string";
  if(value && Object.isFrozen(value) && !Array.isArray(value))
    return "Record<"+shape(value)+">";
  return "owned/unverified";
}
function safe(value) {
  return ["int","float","bool","string"].includes(type_of(value)) ||
    (value && typeof value==="object" && Object.isFrozen(value) &&
      !Array.isArray(value) && Object.values(value).every(safe));
}
function shape(value) {
  return Object.keys(value).sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)))
    .map(key=>JSON.stringify(key)+":"+type_of(value[key])).join(",");
}
// Ordered entries are name/effect thunk pairs, rather than JS object literals;
// they permit asserting duplicate names and evaluation order precisely.
function with_record(source, updates) {
  if(!source || !Object.isFrozen(source) || Array.isArray(source)) fail("E_WITH_OPEN_RECORD");
  const keys=new Set(), values=[];
  for(const [name, get] of updates) {
    if(keys.has(name)) fail("E_DUPLICATE");
    keys.add(name);
    const value=get();
    if(!safe(value)) fail("E_WITH_OWNERSHIP");
    values.push([name,value]);
  }
  for(const [key,value] of Object.entries(source))
    if(!keys.has(key) && !safe(value)) fail("E_WITH_OWNERSHIP");
  return Object.freeze({...source,...Object.fromEntries(values)});
}
function with_struct(original, schema, updates) {
  if(original.nominal!==schema.id) fail("E_WITH_TYPE");
  const entries=[];
  for(const [name,get] of updates) {
    const decl=schema.fields[name];
    if(!decl) fail("E_WITH_FIELD");
    if(!decl.public) fail("E_WITH_ACCESS");
    const value=get();
    if(type_of(value)!==decl.type) fail("E_WITH_TYPE");
    entries.push([name,value]);
  }
  return Object.freeze({...original,...Object.fromEntries(entries),nominal:schema.id});
}
test("closed Record returns a new root without source mutation",()=>{
  const x=Object.freeze({age:30,name:"Alice"});
  const y=with_record(x,[["age",()=>31]]);
  assert.notStrictEqual(x,y);
  assert.equal(x.age,30);assert.equal(y.age,31);
});
test("field addition changes the inferred structural shape",()=>{
  const x=Object.freeze({age:30});
  const y=with_record(x,[["active",()=>true]]);
  assert.equal(shape(x),'"age":int');
  assert.equal(shape(y),'"active":bool,"age":int');
});
test("field type changes are structural and do not alter original type",()=>{
  const x=Object.freeze({age:30});
  const y=with_record(x,[["age",()=>"thirty"]]);
  assert.equal(shape(x),'"age":int');
  assert.equal(shape(y),'"age":string');
});
test("source-order effects and exactly once per override",()=>{
  const order=[];const x=Object.freeze({a:1});
  const y=with_record(x,[["z",()=>{order.push("z");return true;}],["a",()=>{order.push("a");return 2;}]]);
  assert.deepEqual(order,["z","a"]);assert.equal(y.a,2);
});
test("field canonicalization does not reorder evaluations",()=>{
  const first=Object.freeze({a:1,b:true});
  const second=Object.freeze({b:true,a:1});
  assert.equal(shape(first),shape(second));
});
test("empty update creates equivalent new logical root",()=>{
  const source=Object.freeze({a:1}),next=with_record(source,[]);
  assert.notStrictEqual(next,source);assert.deepEqual(next,source);
});
test("quoted punctuation and empty names are supported",()=>{
  const next=with_record(Object.freeze({"content-type":"json"}),[["",()=>true]]);
  assert.equal(next["content-type"],"json");assert.equal(next[""],true);
});
test("duplicate decoded field names fail",()=>{
  assert.throws(()=>with_record(Object.freeze({a:1}),[["a",()=>2],["a",()=>3]]),
    {code:"E_DUPLICATE"});
});
test("missing copy/share proof for retained mutable nested data fails",()=>{
  assert.throws(()=>with_record(Object.freeze({nested:{x:1}}),[["a",()=>3]]),
    {code:"E_WITH_OWNERSHIP"});
});
test("a newly supplied mutable alias is not implicitly shared",()=>{
  const mutable={x:1};
  assert.throws(()=>with_record(Object.freeze({a:1}),[["nested",()=>mutable]]),
    {code:"E_WITH_OWNERSHIP"});
});
test("explicitly immutable nested Record may be reused",()=>{
  const inner=Object.freeze({x:1});
  const y=with_record(Object.freeze({nested:inner}),[["a",()=>2]]);
  assert.strictEqual(y.nested,inner);
});
test("Struct replacement preserves nominal type, never changes schema",()=>{
  const schema={id:"mod.Foo",fields:{age:{type:"int",public:true}}};
  const x=Object.freeze({nominal:schema.id,age:1});
  const y=with_struct(x,schema,[["age",()=>2]]);
  assert.equal(y.nominal,"mod.Foo"); assert.equal(x.age,1);assert.equal(y.age,2);
  assert.throws(()=>with_struct(x,schema,[["new_field",()=>3]]),{code:"E_WITH_FIELD"});
  assert.throws(()=>with_struct(x,schema,[["age",()=>"two"]]),{code:"E_WITH_TYPE"});
});
test("Struct private field and mismatched nominal identity cannot be updated",()=>{
  const schema={id:"m.C",fields:{secret:{type:"int",public:false}}};
  assert.throws(()=>with_struct(Object.freeze({nominal:"m.C",secret:1}),schema,
    [["secret",()=>2]]),{code:"E_WITH_ACCESS"});
  assert.throws(()=>with_struct(Object.freeze({nominal:"other.C",secret:1}),schema,[]),
    {code:"E_WITH_TYPE"});
});
