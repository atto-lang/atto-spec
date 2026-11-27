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

test('call boundaries: Pair vs named vs Record, with arity controls',()=>{
 const accept=['call-direct-pair','call-grouped-pair','call-two-direct-pairs','positional-pair-tuple','call-singleton-pair-tuple','call-brace-colonequals','call-pair-then-named','call-pair-with-spaces','call-quoted-pair-vs-named','call-pair-effect-order','typed-record-newline','typed-record-empty-passed'];
 const reject=['call-pair-after-named','call-pair-to-scalar','call-grouped-pair-to-scalar','call-direct-pair-to-record','call-two-pairs-not-tuple','call-one-tuple-not-two-pairs','call-spaced-pair-token','call-comment-separated-pair-token','typed-record-prefix-reject','typed-record-duplicate-mixed-separators','record-of-invalid-quoted-colon','record-of-invalid-quoted-equals','inferred-record-mixed-equals','brace-separator-comment-gap'];
 for(const id of accept)assert.equal(ids.get(id)?.kind,'accept',id);
 for(const id of reject)assert.equal(ids.get(id)?.kind,'reject',id);
 assert.ok(doc.includes('detect the complete adjacent := token before testing'));
 assert.ok(doc.includes('NOT a semantic pass'));
});
// Enumerate all item-kind sequences through arity 3. Reference only.
test('bounded recursive-product delimiter matrix',()=>{
 const kinds=['COLON','EQ','COLONEQ','CAPTURE','ARROW','VALUE'];
 const contexts=['ordinary','inferred','typed-record','brace'];
 const seqs=[[]];
 for(let n=1;n<=3;n++)for(const seq of seqs.filter(s=>s.length===n-1))for(const k of kinds)seqs.push([...seq,k]);
 const fields=new Set(['COLON','EQ','COLONEQ','CAPTURE']);
 for(const items of seqs)for(const ctx of contexts)for(const comma of [false,true]){
   let want;
   if(ctx==='brace')want=items.length===0?'AMBIGUOUS':items.every(x=>fields.has(x))?'RECORD':items.every(x=>x==='ARROW')?'MAP':'REJECT';
   else if(ctx==='typed-record')want=items.every(x=>fields.has(x))?'RECORD':'REJECT';
   else if(ctx==='inferred'&&['COLON','CAPTURE'].includes(items[0]))want=items.every(x=>['COLON','CAPTURE'].includes(x))?'RECORD':'REJECT';
   else if(items.some(x=>['COLON','EQ','CAPTURE'].includes(x)))want='REJECT';
   else want=items.length===1&&!comma?'GROUP':'TUPLE';
   assert.equal(classify(ctx,items,comma),want,JSON.stringify({ctx,items,comma}));
 }
});
