// Source-free regression tests for the actual inline Python workflow guard.
// Never treat these simulations as GitHub-hosted runner admission receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fullName = 'ores-truffle-oreslang/attolang-language-spec.md';
const repoId = 1444921662;
const workflow = readFileSync(new URL('../.github/workflows/spec-lint.yml', import.meta.url), 'utf8');
const lines = workflow.split(/\r?\n/);
const opener = lines.findIndex(line => line.trim() === "python3 - <<'PY'");
const closer = lines.findIndex((line, i) => i > opener && line.trim() === 'PY');
assert.ok(opener >= 0 && closer > opener, 'missing inline Python origin guard');
const py = lines.slice(opener + 1, closer).map(line =>
  line.startsWith('          ') ? line.slice(10) : line).join('\n') + '\n';

function execute({ event = 'pull_request', repoName = fullName, baseName = fullName,
                   baseId = repoId, headName = fullName, headId = repoId,
                   includeHead = true, validJson = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'atto-origin-mutation-'));
  try {
    const payload = { repository: { full_name: baseName, id: baseId } };
    if (includeHead) payload.pull_request = { head: { repo: { full_name: headName, id: headId } } };
    const path = join(dir, 'event.json');
    writeFileSync(path, validJson ? JSON.stringify(payload) : '{invalid-json');
    return spawnSync('python3', ['-'], {
      encoding: 'utf8', timeout: 10_000, input: py,
      env: { ...process.env, GH_EVENT_PATH: path, GH_EVENT_NAME: event,
             GH_REPOSITORY: repoName },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const [name, input, expected] of [
  ['same-repo pull request is admitted', {}, true],
  ['same-repo push is admitted', { event: 'push', includeHead: false }, true],
  ['foreign pull request is rejected', { headName: 'foreign/spec', headId: 88 }, false],
  ['spoofed PR head ID is rejected', { headId: 88 }, false],
  ['spoofed base repo ID is rejected', { baseId: 88 }, false],
  ['spoofed base repo name is rejected', { baseName: 'foreign/spec' }, false],
  ['spoofed GH_REPOSITORY is rejected', { repoName: 'foreign/spec' }, false],
  ['absent PR head is rejected', { includeHead: false }, false],
  ['unsupported event is rejected', { event: 'workflow_dispatch' }, false],
  ['malformed event JSON is rejected', { validJson: false }, false],
]) {
  test('spec workflow origin: ' + name, () => {
    const result = execute(input);
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status === 0, expected, result.stderr);
    if (expected) assert.match(result.stdout, /SOURCE_OWNER_ONLY=true/);
    else assert.doesNotMatch(result.stdout, /SOURCE_OWNER_ONLY=true/);
  });
}
