// Host-only registry integrity test. Not a parser, compiler, guest or formal proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(readFileSync(path.join(root, 'contracts/specification-rules-v1.json'), 'utf8'));
const knownLayers = new Set(['governance','syntax','static_semantics','dynamic_semantics','concurrency','formatting','formal']);
const knownStatus = new Set(['target','proposed_process']);
const knownFormatter = new Set(['must_follow','must_preserve','contextual_only','preserve_invalidity','invariant','not_applicable']);

test('registry is well-formed, versioned, traceable and has no duplicate IDs', () => {
  assert.equal(data.schema, 'atto.specification-rules.v1');
  assert.equal(data.schema_version, 1);
  assert.equal(data.authority.repository, 'atto-lang/atto-spec');
  assert.equal(data.default_backend_status, 'not_executed');
  assert.deepEqual(data.result_statuses, ['passed','failed','unsupported','not_executed']);
  assert.ok(data.backend_targets.length >= 7);
  assert.equal(new Set(data.backend_targets).size, data.backend_targets.length);
  assert.deepEqual(data.formatter_targets, ['atto-lang/atto-format','ores-truffle-oreslang/oreslang-format']);
  assert.ok(data.rules.length >= 12);
  assert.equal(new Set(data.rules.map(r => r.id)).size, data.rules.length);
  for (const r of data.rules) {
    assert.match(r.id, /^ATTO-[A-Z]+-[0-9]{3}$/);
    assert.ok(knownLayers.has(r.layer), r.id);
    assert.ok(knownStatus.has(r.status), r.id);
    assert.ok(knownFormatter.has(r.formatter), r.id);
    assert.ok(r.title.length > 20 && r.proof.length >= 12, r.id);
    assert.ok(!path.isAbsolute(r.source) && !r.source.includes('..'), r.id);
    assert.ok(existsSync(path.join(root,r.source)), 'missing clause '+r.source);
    if (r.conformance !== null) {
      assert.equal(r.conformance.repo, 'atto-lang/atto-platform-conformance');
      assert.match(r.conformance.path, /^contracts\/[a-z0-9-]+\.json$/);
    }
  }
});

test('key semantic layers and safety conditions cannot disappear', () => {
  for (const id of [
    'ATTO-SPEC-001','ATTO-SYN-001','ATTO-SYN-002','ATTO-TYPE-001',
    'ATTO-OWN-001','ATTO-OWN-002','ATTO-OWN-003','ATTO-CONST-001',
    'ATTO-RUN-001','ATTO-ACTOR-001','ATTO-FMT-001','ATTO-FMT-002',
    'ATTO-FMT-003','ATTO-FORMAL-001','ATTO-GOV-001'
  ]) assert.ok(data.rules.some(r => r.id === id), 'missing '+id);
  const idSet = new Set(data.rules.map(r=>r.id));
  assert.ok(data.formatter_cases.length >= 8);
  assert.equal(new Set(data.formatter_cases.map(c=>c.id)).size, data.formatter_cases.length);
  for (const c of data.formatter_cases) {
    assert.match(c.id, /^fmt-[a-z0-9-]+$/);
    assert.ok(c.rule_ids.length > 0 && c.rule_ids.every(id=>idSet.has(id)),c.id);
    assert.ok(['preserve_semantics','reject_or_remain_invalid','contextual_equivalence_only'].includes(c.required),c.id);
    assert.ok(typeof c.input === 'string' && c.input.length > 10 && c.input.length <= 4096,c.id);
  }
  assert.ok(data.formatter_cases.some(c=>c.required==='reject_or_remain_invalid'));
  assert.ok(data.formatter_cases.some(c=>c.input.includes('copy!!')));
  assert.ok(data.formatter_cases.some(c=>c.input.includes('os.read_env')));
});

test('framework claims only proposed, source-only/host integrity validation', () => {
  assert.match(data.authority.publication,/proposed/i);
  assert.ok(data.evidence_taxonomy.includes('host_model'));
  assert.ok(data.evidence_taxonomy.includes('compiled_guest'));
  assert.ok(data.evidence_taxonomy.includes('formal_model'));
  const doc = readFileSync(path.join(root,'language/specification-framework-v1.md'),'utf8');
  const formal = readFileSync(path.join(root,'formal/specification-refinement-obligations-v1.md'),'utf8');
  assert.match(doc,/NOT compiler, formatter or formal-verification certification/);
  assert.match(doc,/atto-platform-conformance/);
  assert.match(doc,/oreslang-format/);
  assert.match(formal,/F-FORMAT/);
  assert.match(formal,/F-ACTOR/);
  assert.match(formal,/NOT_EXECUTED/);
});
