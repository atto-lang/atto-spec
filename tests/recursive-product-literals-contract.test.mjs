import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function contractTests(test,assert,doc,corpus,parent){
 const byId=new Map(corpus.vectors.map(v=>[v.id,v]));
 test("target-only registry",()=>{assert.equal(corpus.schema,"atto.recursive-product-literals-v1");assert.equal(corpus.status,"TARGET_NOT_EXECUTED");assert.equal(byId.size,corpus.vectors.length);for(const v of corpus.vectors){assert.ok(v.id&&v.source&&v.expect);assert.ok(["accept","reject"].includes(v.kind));}});
 test("nine recursive products",()=>{for(const id of ["pair-tuple","tuple-pair","record-tuple","tuple-record","record-pair","pair-record","pair-pair","tuple-tuple","record-record"])assert.equal(byId.get(id)?.kind,"accept",id);});
 test("paired positive and negative boundary fixtures",()=>{for(const [pos,neg] of [["quoted-call-two","quoted-call-no-coalesce"],["quoted-call-mixed-order","quoted-call-after-named"],["quoted-call-single","quoted-call-not-named"],["quoted-call-apply-tuple","quoted-call-apply-not-tuple"],["quoted-label-record-of-pair","quoted-call-no-intrinsic-field"],["quoted-brace-map-control","quoted-label-braces-equals"],["quoted-label-capture-mixed","quoted-label-capture-duplicate"],["quoted-label-trivia","quoted-label-comment-text"],["quoted-label-underscore-digit","quoted-label-trailing-space"],["quoted-call-grouped","quoted-call-slot-duplicate"],["quoted-record-mixed","quoted-record-duplicate"],["quoted-label-dot-projection","quoted-label-inner-invalid"],["quoted-call-nested-comma","quoted-call-double-comma"],["quoted-label-index-projection","quoted-label-nul"],["quoted-record-label","quoted-label-escaped-duplicate"],["quoted-call-equality-control","quoted-free-assignment"]]){assert.equal(byId.get(pos)?.kind,"accept",pos);assert.equal(byId.get(neg)?.kind,"reject",neg);}});
 test("profile precedence and execution limits",()=>{for(const s of ["DQ_STRING","quoted_record_arg = DQ_STRING","no executable artifact","No computed key expressions or runtime checks","must not simply remove quotes","never implicitly coalesce","before overload resolution","full-string consumption","no new assignment expression","Host contract tests are not the production parser"])assert.ok(doc.includes(s),s);assert.ok(parent.includes("recursive-product-v1 candidate"));assert.ok(parent.includes("Do not run historical quoted-equals negative cases"));});
 // Reference model over already lexed tokens, NOT a production lexer/parser.
 const dispatch=(context,[a,b])=>{
   if(context==="call"){
     if(a==="IDENT"&&(b==="EQ"||b==="COLON"))return "NAMED";
     if(a==="DQ_STRING"&&b==="EQ")return "POSITIONAL_RECORD";
     if(a==="ELLIPSIS")return "SPREAD";
     return "EXPRESSION";
   }
   if(((a==="IDENT"||a==="DQ_STRING")&&b==="EQ")||(a==="COLON"&&b==="IDENT"))return "RECORD_ITEM";
   return "POSITIONAL_ITEM";
 };
 test("bounded token-pair dispatch",()=>{const first=["IDENT","DQ_STRING","OTHER_STRING","LPAREN","COLON","ELLIPSIS","INT","EOF"];const second=["EQ","EQEQ","COLON","COLONEQ","FATARROW","IDENT","COMMA","EOF"];const named=new Set(["IDENT:EQ","IDENT:COLON"]),record=new Set(["IDENT:EQ","DQ_STRING:EQ","COLON:IDENT"]);for(const a of first)for(const b of second){const k=`${a}:${b}`;assert.equal(dispatch("call",[a,b]),named.has(k)?"NAMED":k==="DQ_STRING:EQ"?"POSITIONAL_RECORD":a==="ELLIPSIS"?"SPREAD":"EXPRESSION",k);assert.equal(dispatch("paren",[a,b]),record.has(k)?"RECORD_ITEM":"POSITIONAL_ITEM",k);}});
 test("bounded delimiter classification",()=>{const classify=(items,comma)=>{if(!items.length)return "EMPTY_TUPLE";const kinds=items.map(i=>dispatch("paren",i));if(kinds.every(k=>k==="RECORD_ITEM"))return "RECORD";if(kinds.some(k=>k==="RECORD_ITEM"))return "REJECT_MIXED";return items.length===1&&!comma?"GROUP":"TUPLE";};const p=["IDENT","COLONEQ"],r=["IDENT","EQ"],q=["DQ_STRING","EQ"],n=["LPAREN","IDENT"];for(const [items,comma,result] of [[[],false,"EMPTY_TUPLE"],[[p],false,"GROUP"],[[p],true,"TUPLE"],[[r],true,"RECORD"],[[q,r],true,"RECORD"],[[n,n],true,"TUPLE"],[[r,p],true,"REJECT_MIXED"],[[p,q],true,"REJECT_MIXED"]])assert.equal(classify(items,comma),result);});
}
const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
contractTests(test,assert,read('../language/recursive-product-literals-v1.md'),JSON.parse(read('../conformance/recursive-product-literals-v1.json')),read('../language/pair-literals-and-bindings-v3.md'));
