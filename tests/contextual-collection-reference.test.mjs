// HOST_ONLY contextual type reference, not parser or guest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const doc=readFileSync(new URL('../language/contextual-collection-and-entry-literals-v1.md',import.meta.url),'utf8');
function arrow(left,right,expected){if(!left||!right)throw Error('E_INFER');const kind=expected?.kind??'Entry';if(!['Pair','Entry'].includes(kind)||expected&&(expected.left!==left||expected.right!==right))throw Error('E_TYPE');return {kind,left,right}}
function empty(expected){if(!expected||!['Map','Record','Array','List'].includes(expected.kind)||expected.kind!=='Record'&&!expected.types?.length)throw Error('E_INFER');return {kind:expected.kind,items:[]}}
test('context controls Pair vs Entry; missing type and mismatch reject',()=>{assert.deepEqual(arrow('int','bool'),{kind:'Entry',left:'int',right:'bool'});assert.equal(arrow('int','bool',{kind:'Pair',left:'int',right:'bool'}).kind,'Pair');assert.throws(()=>arrow(null,'bool'),/E_INFER/);assert.throws(()=>arrow('int','bool',{kind:'Entry',left:'string',right:'bool'}),/E_TYPE/)});
test('empty collection retains concrete expected type',()=>{for(const k of ['List','Array','Map'])assert.equal(empty({kind:k,types:k==='Map'?['int','bool']:['int']}).kind,k);assert.throws(()=>empty(),/E_INFER/);assert.throws(()=>empty({kind:'List'}),/E_INFER/)});
test('document preserves identifier-only records and inferred Entry',()=>{assert.ok(doc.includes('Quoted brace keys construct Maps, never Record fields.'));assert.ok(doc.includes('infers a nominal Entry<K,V>'));assert.ok(doc.includes('no guest artifact'));});
