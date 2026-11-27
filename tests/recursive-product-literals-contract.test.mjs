import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const doc=read('../language/recursive-product-literals-v1.md');
const corpus=JSON.parse(read('../conformance/recursive-product-literals-v1.json'));
const ids=new Map(corpus.vectors.map(v=>[v.id,v]));
test('target registry and all nine product combinations',()=>{
 assert.equal(corpus.status,'TARGET_NOT_EXECUTED');
 assert.equal(ids.size,corpus.vectors.length);
 for(const v of corpus.vectors){assert.ok(v.source&&v.expect);assert.ok(['accept','reject'].includes(v.kind));}
 for(const id of ['pair-tuple','tuple-pair','record-tuple','tuple-record','record-pair','pair-record','pair-pair','tuple-tuple','record-record'])assert.equal(ids.get(id)?.kind,'accept',id);
});
test('explicit empty Record is not empty Tuple',()=>{
 for(const id of ['empty-tuple','typed-empty-record-paren','typed-empty-record-brace','typed-empty-map','typed-pair-fields','tuple-pair'])assert.equal(ids.get(id)?.kind,'accept',id);
 for(const id of ['untyped-empty-brace','anonymous-empty-brace','typed-record-tuple','typed-record-tuple-value','typed-record-pair-value'])assert.equal(ids.get(id)?.kind,'reject',id);
});
test('context and quoted key boundary cases',()=>{
 for(const id of ['inferred-colon','typed-mixed-fields','brace-mixed','quoted-record-label','quoted-map-control','call-grouped-pair','quoted-call-named-scalar','call-brace-colonequals','typed-nested-pair','typed-nested-tuple'])assert.equal(ids.get(id)?.kind,'accept',id);
 for(const id of ['inferred-equals','mixed-colon-first','mixed-pair-first','mixed-brace-record-map','mixed-brace-map-record','anonymous-parenthesized-pair','anonymous-parenthesized-colon','anonymous-parenthesized-equals','nested-parenthesized-colon','quoted-record-hyphen','quoted-call-duplicate-bare'])assert.equal(ids.get(id)?.kind,'reject',id);
});
test('normative boundary statements',()=>{
 for(const s of ['const Record x = (); | empty Record','const x = (); | empty Tuple','No propagation into nested expressions','Quoted colon is Record, not Map','Anonymous Record literals use braces','never Tuple conversion','Host contract tests are reference tests only'])assert.ok(doc.includes(s),s);
});
// Bounded reference classification of already identified top-level item kinds.
// Not a lexer, production parser, type checker or execution test.
function classify(context,items,comma=false){
 if(context==='brace')return !items.length?'AMBIGUOUS':items.every(x=>x==='ARROW')?'MAP':items.every(x=>['COLON','EQ','COLONEQ','CAPTURE'].includes(x))?'RECORD':'REJECT';
 if(context==='typed-record')return items.every(x=>['COLON','EQ','COLONEQ','CAPTURE'].includes(x))?'RECORD':'REJECT';
 if(!items.length)return 'TUPLE';
 if(context==='inferred'&&['COLON','CAPTURE'].includes(items[0]))return items.every(x=>['COLON','CAPTURE'].includes(x))?'RECORD':'REJECT';
 if(items.some(x=>['COLON','EQ','CAPTURE'].includes(x)))return 'REJECT';
 return items.length===1&&!comma?'GROUP':'TUPLE';
}
test('reference delimiter/context matrix',()=>{
 for(const [ctx,items,comma,want] of [
 ['ordinary',[],false,'TUPLE'],['inferred',[],false,'TUPLE'],['typed-record',[],false,'RECORD'],['brace',[],false,'AMBIGUOUS'],
 ['inferred',['COLON','COLON'],false,'RECORD'],['inferred',['COLONEQ','COLONEQ'],false,'TUPLE'],
 ['typed-record',['COLONEQ','COLONEQ'],false,'RECORD'],['inferred',['COLON','COLONEQ'],false,'REJECT'],
 ['inferred',['COLONEQ','COLON'],false,'REJECT'],['ordinary',['COLON'],false,'REJECT'],
 ['ordinary',['COLONEQ'],false,'GROUP'],['ordinary',['COLONEQ'],true,'TUPLE'],
 ['brace',['EQ','COLON','COLONEQ'],false,'RECORD'],['brace',['ARROW','ARROW'],false,'MAP'],
 ['brace',['COLON','ARROW'],false,'REJECT'],['brace',['ARROW','COLON'],false,'REJECT']
 ])assert.equal(classify(ctx,items,comma),want);
});
