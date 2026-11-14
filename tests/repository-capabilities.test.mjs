import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateCapabilities} from '../scripts/validate-capabilities.mjs';

const example=JSON.parse(readFileSync(new URL('../atto-capabilities.json',import.meta.url)));
const clone=()=>structuredClone(example);

test('self-description is advisory and schema version is explicit',()=>{
 const v=validateCapabilities(example,'atto-lang/atto-spec');
 assert.equal(v.certification,'NOT_CERTIFIED');
 assert.ok(Object.values(v.feature_status).every(x=>x==='not_executed'));
});

test('a README-only repository cannot claim feature execution or evidence',()=>{
 const scaffold=clone();
 scaffold.source_state='scaffold';
 assert.doesNotThrow(()=>validateCapabilities(scaffold));
 scaffold.feature_status.repository_capability_contract='passed';
 assert.throws(()=>validateCapabilities(scaffold),/README-only scaffold/);
 scaffold.feature_status.repository_capability_contract='not_executed';
 scaffold.evidence=[{feature:'repository_capability_contract',status:'passed',source_head_sha:'a'.repeat(40),execution_kind:'guest',workflow_url:'https://github.com/atto-lang/atto-spec/actions/runs/1'}];
 assert.throws(()=>validateCapabilities(scaffold),/README-only scaffold/);
});

test('unreviewed non-baseline claims and parser-only evidence fail closed',()=>{
 const claim=clone();
 claim.feature_status.repository_capability_contract='passed';
 assert.throws(()=>validateCapabilities(claim),/lacks evidence/);
 claim.evidence=[{feature:'repository_capability_contract',status:'passed',source_head_sha:'a'.repeat(40),execution_kind:'parser',workflow_url:'https://github.com/atto-lang/atto-spec/actions/runs/123'}];
 assert.throws(()=>validateCapabilities(claim),/host\/parser-only/);
 claim.evidence[0].execution_kind='guest';
 assert.doesNotThrow(()=>validateCapabilities(claim), 'metadata validation is not proof of guest execution');
});

test('unknown keys, cross-repository identity and invalid features are denied',()=>{
 for(const mutate of [
   x=>{x.unexpected=true;},
   x=>{x.repository='atto-co/other';},
   x=>{x.feature_status['BAD-KEY']='passed';},
   x=>{x.certification='CERTIFIED';}
 ]) {
  const x=clone();mutate(x);
  assert.throws(()=>validateCapabilities(x,'atto-lang/atto-spec'),/E_CAPABILITY_MANIFEST/);
 }
});

test('CLI validates local file with exact repo selection',()=>{
 const script=new URL('../scripts/validate-capabilities.mjs',import.meta.url).pathname;
 const file=new URL('../atto-capabilities.json',import.meta.url).pathname;
 const ok=spawnSync(process.execPath,[script,file,'--repo','atto-lang/atto-spec'],{encoding:'utf8'});
 assert.equal(ok.status,0,ok.stderr);
 assert.match(ok.stdout,/NOT_CERTIFIED/);
 const denied=spawnSync(process.execPath,[script,file,'--repo','atto-lang/other'],{encoding:'utf8'});
 assert.equal(denied.status,1);
 assert.equal(denied.stdout,'');
});
