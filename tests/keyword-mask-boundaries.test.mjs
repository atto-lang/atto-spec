import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import test from "node:test";
import {scanLexicalReference} from "./helpers/keyword-taxonomy-lexical-reference.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const catalog=JSON.parse(readFileSync(path.join(root,"contracts/keyword-taxonomy-v1/catalog.json"),"utf8"));
const reserved=catalog.reserved_groups.flatMap(g=>g.words);
const scan=s=>scanLexicalReference(s,reserved);

test("all reserved spellings remain masked inside quoted text, comments, and Symbols",()=>{
  for(const word of reserved){
    for(const [src,kind] of [
      ['"'+word+'"',"string"],
      ["'"+word+"'","string"],
      ["\x60"+word+"\x60","template"],
      ["// "+word,"comment"],
      ["/* "+word+" */","comment"],
      ["#"+word,"symbol"],
      ['#"'+word+'"',"symbol"]
    ]){
      const tokens=scan(src);
      assert.equal(tokens.length,1,src);
      assert.equal(tokens[0].kind,kind,src);
      assert.equal(tokens[0].text,src);
    }
  }
});

test("identifier adjacency does not falsely reserve partial words",()=>{
  for(const word of reserved){
    for(const candidate of [word+"_",word+"9","_a"+word,"x"+word,word.toUpperCase()]){
      const t=scan(candidate);
      assert.deepEqual(t.map(x=>x.kind),["identifier"],candidate);
    }
  }
});

test("nested block comments mask all keyword-like and compound text",()=>{
  const src="/* define actor /* nb-select critical-read */ implements */ actor";
  assert.deepEqual(scan(src).map(t=>[t.kind,t.text]),[
    ["comment","/* define actor /* nb-select critical-read */ implements */"],
    ["reserved","actor"]
  ]);
});

test("callable name escape requires parser, not a change to the reserved inventory",()=>{
  const src="worker.stop(); do(); done(); val stop = 1;";
  const ts=scan(src);
  assert.equal(ts.filter(x=>["stop","do","done"].includes(x.text)).length,4);
  assert.ok(ts.filter(x=>["stop","do","done"].includes(x.text)).every(x=>x.kind==="reserved"));
  assert.equal(catalog.basis.backend_parity,"NOT_TESTED");
});

test("ASCII hyphen compounds do not swallow subtraction or Unicode dashes",()=>{
  assert.deepEqual(scan("nb-select").map(x=>x.kind),["compound"]);
  for(const x of ["critical-read","critical-write","transform-pipe"]){
    assert.deepEqual(scan(x).map(t=>t.kind),["identifier","operator","identifier"],x);
  }
  for(const d of ["–","—","−"]){
    const x=scan("critical"+d+"read");
    assert.deepEqual(x.map(t=>t.kind),["identifier","invalid_dash","identifier"],d);
  }
});
