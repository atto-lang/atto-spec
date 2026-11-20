// Structural draft-spec traceability only. No compiler execution or release claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const contract = JSON.parse(readFileSync(new URL(
  '../contracts/attolang-semantic-floor-v1/contract.json', import.meta.url), 'utf8'));

test('all required independent backends are pinned to distinct repo identities', () => {
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.status, 'DRAFT_TARGET_NOT_VERIFIED');
  assert.deepEqual(contract.required_backends,
    ['llvm', 'java', 'wasm', 'dotnet', 'forge', 'cranelift']);
  const repos = contract.required_backends.map(b => contract.backend_repositories[b]);
  assert.equal(new Set(repos).size, repos.length);
  for (const repo of repos) assert.match(repo, /^ores-truffle-oreslang\/oreslang-source\./);
});

test('host-only and runnerless evidence can never claim verified guest parity', () => {
  assert.equal(contract.evidence_policy.baseline, 'NOT_EXECUTED');
  assert.equal(contract.evidence_policy.eligible_parity_tier, 'ORES_GUEST_EXECUTED');
  for (const field of ['runner_id', 'executed_non_housekeeping_steps',
                       'source_commit', 'source_tree', 'fixture_blob', 'artifact_sha256']) {
    assert.ok(contract.evidence_policy.required_fields.includes(field), field);
  }
  for (const denial of ['zero_step_job', 'host_only_test',
                        'unverified_cross_org_mirror', 'runner_id_zero']) {
    assert.ok(contract.evidence_policy.rejected_as_proof.includes(denial), denial);
  }
});

test('each authored fixture resolves to an existing draft feature without claiming execution', () => {
  const features = new Map(contract.features.map(f => [f.id, f]));
  const fixtureIds = new Set(contract.fixtures.map(f => f.id));
  assert.equal(fixtureIds.size, contract.fixtures.length);
  for (const feature of contract.features) {
    assert.equal(feature.status, 'TARGET_NOT_VERIFIED', feature.id);
    for (const id of [...feature.positive_fixture_ids, ...feature.negative_fixture_ids]) {
      assert.ok(fixtureIds.has(id), 'feature ' + feature.id + ' lacks ' + id);
    }
  }
  for (const fixture of contract.fixtures) {
    assert.equal(fixture.status, 'AUTHORED_NOT_EXECUTED', fixture.id);
    assert.ok(features.has(fixture.feature), fixture.id);
    assert.match(fixture.path, /^contracts\/attolang-semantic-floor-v1\/fixtures\/.*\.atto$/);
  }
});
