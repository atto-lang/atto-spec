import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import test from "node:test";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>JSON.parse(readFileSync(path.join(root,p),"utf8"));
const spec=read("contracts/keyword-taxonomy-v1/lsp-semantic-token-v1.json");
const catalog=read("contracts/keyword-taxonomy-v1/catalog.json");
const standard=new Set("namespace type class enum interface struct typeParameter parameter variable property enumMember event function method macro keyword modifier comment string number regexp operator decorator".split(" "));

test("LSP token proposal uses standard semantic types and explicitly unverified status",()=>{
 assert.equal(spec.schema_version,1);
 assert.equal(spec.status,"DRAFT_LSP_TOKEN_EXPECTATIONS_NOT_SERVER_EXECUTED");
 assert.equal(spec.provenance.server_evidence,"NOT_EXECUTED");
 assert.equal(spec.provenance.guest_executions,0);
 assert.equal(spec.offset_encoding,"UTF-16");
 assert.equal(new Set(spec.legend.token_types).size,spec.legend.token_types.length);
 assert.equal(new Set(spec.legend.token_modifiers).size,spec.legend.token_modifiers.length);
 assert.ok(spec.legend.token_types.every(x=>standard.has(x)));
 assert.ok(spec.examples.length>=6);
});

test("every documented keyword role has exactly one standard fallback type",()=>{
 const groups=catalog.reserved_groups;
 const got=spec.keyword_group_mappings;
 assert.deepEqual(got.map(x=>x.id).sort(),groups.map(x=>x.id).sort());
 assert.equal(new Set(got.map(x=>x.id)).size,got.length);
 for(const entry of got)assert.ok(spec.legend.token_types.includes(entry.type));
});

for(const example of spec.examples){
 test("LSP semantic token delta vector: "+example.id,()=>{
  assert.equal(example.status,"TARGET_NOT_EXECUTED");
  assert.equal(example.encoded.length,example.tokens.length*5);
  let line=0,column=0,previous=-1;
  for(let i=0;i<example.tokens.length;i++){
   const token=example.tokens[i],array=example.encoded.slice(i*5,i*5+5);
   const [deltaLine,deltaColumn,length,typeIndex,modifierMask]=array;
   assert.ok(Number.isInteger(deltaLine)&&deltaLine>=0);
   assert.ok(Number.isInteger(deltaColumn)&&deltaColumn>=0);
   assert.ok(length>0&&Number.isInteger(length));
   assert.ok(typeIndex>=0&&typeIndex<spec.legend.token_types.length);
   line+=deltaLine;column=deltaLine===0?column+deltaColumn:deltaColumn;
   assert.deepEqual([line,column,length],[token.line,token.column,token.length]);
   assert.equal(spec.legend.token_types[typeIndex],token.type);
   const decodedMods=spec.legend.token_modifiers.filter((_,bit)=>(modifierMask&(1<<bit))!==0);
   assert.deepEqual(decodedMods,token.modifiers);
   assert.equal(example.source.slice(token.start,token.start+token.length),token.text);
   const pre=example.source.slice(0,token.start).split("\n");
   assert.equal(token.line,pre.length-1);
   assert.equal(token.column,pre.at(-1).length);
   assert.ok(token.start>previous,"tokens ordered without duplication");
   previous=token.start;
  }
 });
}

test("semantic type decisions require resolved symbols, not keyword regex matching",()=>{
 const byId=new Map(spec.examples.map(x=>[x.id,x]));
 assert.equal(byId.get("target-declared-actor").tokens.find(x=>x.text==="Foo").type,"class");
 assert.equal(byId.get("target-declared-actor").tokens.find(x=>x.text==="ActorXYZ").type,"interface");
 assert.equal(byId.get("reserved-as-callable-name").tokens.find(x=>x.text==="stop").type,"method");
 assert.equal(byId.get("namespace-identifier").tokens.find(x=>x.text==="foo").type,"namespace");
 assert.equal(spec.provenance.server_evidence,"NOT_EXECUTED");
});
