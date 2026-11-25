import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import {scanLexicalReference} from "./helpers/keyword-taxonomy-lexical-reference.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const catalog=JSON.parse(readFileSync(path.join(root,"contracts/keyword-taxonomy-v1/catalog.json"),"utf8"));
const reserved=catalog.reserved_groups.flatMap(g=>g.words);
const contextual=catalog.documented_not_reserved.map(e=>e.spelling);
const scan=s=>scanLexicalReference(s,reserved);
function rng(seed){let state=seed>>>0;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};}
const choices=[
 ...reserved.map(word=>[word,"reserved"]),
 ...contextual.map(word=>[word,"identifier"]),
 ["nb-select","compound"],["|>","operator"],["==","operator"],["!=","operator"],
 ["#ready","symbol"],['#"actor"', "symbol"],['"implements"', "string"],
 ["'pub'","string"],["\x60actor\x60","template"],["42","number"],["42_000","number"],
 [";", "punctuation"],["(", "punctuation"],[")","punctuation"],["foo_actor","identifier"],
 ["über","identifier"],["_actor","identifier"],["Дело","identifier"],["actor99","identifier"]
];

test("seeded lexical cases preserve every category across 300 reproducible sequences",()=>{
 const next=rng(0xA7702026);
 for(let i=0;i<300;i++){
  const expected=Array.from({length:8+(next()%25)},()=>choices[next()%choices.length]);
  const source=expected.map(x=>x[0]).join(" \t");
  const actual=scan(source);
  assert.deepEqual(actual.map(x=>[x.text,x.kind]),expected,"seeded case "+i);
  for(const t of actual){
   assert.equal(source.slice(t.start,t.end),t.text);
   assert.ok(t.end>t.start);
   assert.ok(t.start>=0 && t.end<=source.length);
  }
  for(let j=1;j<actual.length;j++)assert.ok(actual[j-1].end<actual[j].start);
 }
});

test("reported offsets are UTF-16 code units including supplementary characters",()=>{
 const source='  "actor 🙂" \r\n #ready \t\u03bbambda \r\n actor ';
 const tokens=scan(source);
 assert.deepEqual(tokens.map(t=>[t.text,t.kind]),[
  ['"actor 🙂"',"string"],["#ready","symbol"],["\u03bbambda","identifier"],["actor","reserved"]
 ]);
 assert.equal(tokens[0].start,2);
 assert.equal(tokens[0].end,2+'"actor 🙂"'.length);
 for(const t of tokens)assert.equal(source.substring(t.start,t.end),t.text);
});

test("many repeated nested comments never leak keywords or compounds",()=>{
 for(let depth=1;depth<=24;depth++){
  const source="/* ".repeat(depth)+"actor nb-select implements "+" */".repeat(depth)+" actor";
  const ts=scan(source);
  assert.equal(ts.length,2,"depth "+depth);
  assert.equal(ts[0].kind,"comment");
  assert.equal(ts[1].kind,"reserved");
  assert.equal(ts[1].text,"actor");
 }
});

test("malformed quote/comment variants reject without inventing complete tokens",()=>{
 const invalid=['"actor','"a\\','\x60implements',"'pub", "#\"actor", "/*", "/* /* actor */"];
 for(const source of invalid)assert.throws(()=>scan(source),SyntaxError,JSON.stringify(source));
});

test("compound lookalikes and contextual words never become reserved by case folding",()=>{
 for(const word of contextual){
  for(const source of [word,word.toUpperCase(),word+"9","_"+word]){
   const ts=scan(source);
   assert.equal(ts.length,1,source);
   assert.equal(ts[0].kind,"identifier",source);
  }
 }
 for(const source of ["nb-select_more","anb-select","nb-selector","nb-select-other"]){
  assert.ok(scan(source).every(t=>t.kind!=="compound"),source);
 }
});
