// SOURCE-ONLY reference tokenization for the exceptional-control bang proposal.
// Not an Atto compiler/parser, not backend execution, not guest conformance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const contract=JSON.parse(readFileSync(
  new URL('../contracts/exception-control-bang/v1/cases.json',import.meta.url),'utf8'));
const names=new Set(['trap','throw','raise','panic']);
const bangNames=new Set([...names].map(x=>x+'!'));
const expectedBackends=[
  'atto-source.atto','atto-source.cranelift','atto-source.forge',
  'atto-source.hdl','atto-source.java','atto-source.js','atto-source.llvm',
  'atto-source.net','atto-source.realtime','atto-source.rs','atto-source.wasm'
].sort();

// A deliberately limited lexical *oracle*. It reports only which of the four
// proposed exceptional-control bang spellings appear outside strings/comments.
// Production lexers and their source-to-guest effects need independent tests.
function referenceExceptionBangs(source) {
  const bangTokens=[];
  let i=0;
  while(i<source.length) {
    if(/\s/.test(source[i])) {i++;continue;}
    if(source.startsWith('//',i)) {
      i+=2;
      while(i<source.length&&!/[\r\n\u0085\u2028\u2029]/.test(source[i]))i++;
      continue;
    }
    if(source.startsWith('/*',i)) {
      let depth=1;i+=2;
      while(i<source.length&&depth) {
        if(source.startsWith('/*',i)){depth++;i+=2;}
        else if(source.startsWith('*/',i)){depth--;i+=2;}
        else i++;
      }
      assert.equal(depth,0,'reference contract has unclosed comment');
      continue;
    }
    if(source[i]==='"'||source[i]==="'"||source[i]===String.fromCharCode(96)) {
      const quote=source[i++];
      let closed=false;
      while(i<source.length) {
        if(source[i]==='\\'){i+=2;continue;}
        if(source[i++]===quote){closed=true;break;}
      }
      assert.equal(closed,true,'reference contract has unclosed string');
      continue;
    }
    if(source[i]==='#') {
      i++;
      if(source[i]==='"'||source[i]==="'") continue; // next iteration shields quoted symbol
      const symbol=/^[\p{L}_][\p{L}\p{N}_]*/u.exec(source.slice(i));
      if(symbol){i+=symbol[0].length;continue;}
    }
    const word=/^[\p{L}_][\p{L}\p{N}_]*/u.exec(source.slice(i));
    if(word) {
      i+=word[0].length;
      // Do not reinterpret != or !eq as an exceptional keyword suffix.
      if(names.has(word[0])&&source[i]==='!'&&source[i+1]!=='='&&
          !/^!eq(?![\p{L}\p{N}_])/u.test(source.slice(i))) {
        const keyword=word[0]+'!';
        assert.ok(bangNames.has(keyword));
        bangTokens.push(keyword);
        i++;
      }
      continue;
    }
    i++;
  }
  return bangTokens;
}

test('the candidate lexeme inventory names exactly eleven distinct targets',()=>{
  assert.equal(contract.schema_version,1);
  assert.equal(contract.status,'SOURCE_ONLY_TARGET_NOT_BACKEND_OR_GUEST_VERIFIED');
  assert.deepEqual([...contract.canonical_keywords].sort(),[...bangNames].sort());
  assert.deepEqual([...contract.migration_keywords].sort(),[...names].sort());
  assert.deepEqual([...contract.backends].sort(),expectedBackends);
});

test('reference lexical vectors distinguish canonical bangs, bare migration and comments',()=>{
  assert.equal(contract.cases.length,18);
  const seen=new Set();
  let positive=0,negative=0;
  for(const c of contract.cases) {
    assert.match(c.id,/^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(!seen.has(c.id),'duplicate fixture id: '+c.id);seen.add(c.id);
    assert.equal(c.status,'TARGET_ONLY');
    assert.deepEqual(referenceExceptionBangs(c.source),c.exceptional_tokens,c.id);
    if(c.exceptional_tokens.length)positive++;else negative++;
  }
  assert.equal(positive,6);
  assert.equal(negative,12);
  // These cells describe targets; they are *not* executed backend results.
  assert.equal(contract.cases.length*contract.backends.length,198);
});

test('one-character and nested comment changes never promote unrecognized bangs',()=>{
  for(const word of names) {
    assert.deepEqual(referenceExceptionBangs(word+'!value'),[word+'!']);
    assert.deepEqual(referenceExceptionBangs(word+' !value'),[]);
    assert.deepEqual(referenceExceptionBangs(word+'!=value'),[]);
    assert.deepEqual(referenceExceptionBangs(word+'!eq value'),[]);
    assert.deepEqual(referenceExceptionBangs(word+'ed!value'),[]);
    assert.deepEqual(referenceExceptionBangs('/* '+word+'! /* hidden '+word+'! */ */ 42'),[]);
    assert.deepEqual(referenceExceptionBangs('"'+word+'!"'),[]);
  }
});

test('Unicode identifier prefixes and quoted symbols or templates are shielded',()=>{
 for(const word of names){
  assert.deepEqual(referenceExceptionBangs('é'+word+'!value'),[]);
  assert.deepEqual(referenceExceptionBangs('#'+word+'!'),[]);
  assert.deepEqual(referenceExceptionBangs('#"'+word+'!"'),[]);
  assert.deepEqual(referenceExceptionBangs(String.fromCharCode(96)+word+'!'+String.fromCharCode(96)),[]);
 }
});
