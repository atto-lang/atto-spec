import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import test from "node:test";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>JSON.parse(readFileSync(path.join(root,p),"utf8"));
const grammar=read("editors/attolang-lexical.tmLanguage.json");
const catalog=read("contracts/keyword-taxonomy-v1/catalog.json");
const head="(?<![\\p{L}\\p{N}_])",tail="(?![\\p{L}\\p{N}_])";
const words=catalog.reserved_groups.flatMap(g=>g.words);
const notReserved=[...catalog.documented_not_reserved,...catalog.candidate_spellings].map(x=>x.spelling);
const re=p=>new RegExp(p.match,"u");

test("TextMate fallback is explicitly lexical-only and ordered for shielding",()=>{
 assert.equal(grammar.scopeName,"source.atto");
 assert.deepEqual(grammar.fileTypes,["atto","ores"]);
 assert.ok(grammar.name.includes("DRAFT"));
 assert.deepEqual(grammar.patterns.map(x=>x.include),["#lineComments","#blockComments","#strings","#symbols","#compound","#keywords"]);
 assert.equal(catalog.status,"DRAFT_TOOLING_METADATA_NOT_COMPILER_VERIFIED");
});

test("regex scopes agree exactly with the documented 95 words and group categories",()=>{
 const patterns=grammar.repository.keywords.patterns;
 assert.equal(patterns.length,catalog.reserved_groups.length);
 assert.equal(new Set(words).size,95);
 for(let i=0;i<patterns.length;i++){
  const group=catalog.reserved_groups[i],pattern=patterns[i];
  assert.ok(group.words.every(word=>/^[a-z]+$/.test(word)));
  const sorted=group.words.slice().sort((a,b)=>b.length-a.length||a.localeCompare(b));
  assert.equal(pattern.name,group.highlight_scope);
  assert.equal(pattern.match,head+"(?:"+sorted.join("|")+")"+tail);
  const regex=re(pattern);
  for(const word of group.words){
   assert.ok(regex.test(word),word);
   assert.ok(!regex.test(word+"x"),word);
   assert.ok(!regex.test("_"+word),word);
  }
 }
 for(const candidate of notReserved)assert.ok(!patterns.some(p=>re(p).test(candidate)),candidate);
});

test("nb-select alone gets a lexer-level compound regex",()=>{
 const patterns=grammar.repository.compound.patterns;
 assert.equal(patterns.length,1);
 const r=re(patterns[0]);
 assert.ok(r.test("nb-select"));
 for(const x of ["nb-select2","nb-selector","anb-select","nb-select-other","critical-read","critical-write","transform-pipe"]){
  assert.ok(!r.test(x),x);
 }
 assert.ok(!grammar.repository.keywords.patterns.some(p=>p.match.includes("critical-read")));
});

test("strings, comments and Symbols have shielding scopes",()=>{
 const repo=grammar.repository;
 const scopes=Object.values(repo).flatMap(x=>x.patterns.map(y=>y.name)).filter(Boolean);
 for(const x of ["comment.block.atto","comment.line.double-slash.atto","constant.other.symbol.quoted.atto","string.quoted.template.atto"])assert.ok(scopes.includes(x));
 assert.ok(repo.blockComments.patterns[0].patterns.some(x=>x.include==="#blockComments"));
 assert.ok(repo.strings.patterns.every(x=>x.begin&&x.end));
});

test("Unicode-aware whole-word guards wrap every reserved category",()=>{
 for(const p of grammar.repository.keywords.patterns){
  assert.ok(p.match.startsWith(head));
  assert.ok(p.match.endsWith(tail));
  assert.ok(!re(p).test("prefixactorpostfix"));
 }
});
