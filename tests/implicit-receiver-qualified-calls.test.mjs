// Host-only reference lookup oracle. Does NOT parse or execute AttoLang guest code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL(
  '../conformance/implicit-receiver-qualified-calls-v1.json', import.meta.url),'utf8'));

function resolve(c) {
  const local = (c.local || []).find(x => x.name === c.call);
  const family = (c.methods || []).filter(x => x.name === c.call);
  const root = (c.root || []).filter(x => x.name === c.call);
  const imports = (c.imports || []).filter(x => x.alias === c.call && !x.wildcard);
  const method = () => {
    const selected = family.filter(x => x.arity === c.arity);
    if (!selected.length) return 'REJECT_WRONG_ARITY_METHOD';
    if (selected.length > 1) return 'REJECT_AMBIGUOUS_INHERITANCE';
    return 'INSTANCE_METHOD';
  };
  const root_fn = () => {
    if (!root.length) return 'REJECT_MISSING_FILE_ROOT';
    return root.some(x => x.arity === c.arity)
      ? 'FILE_ROOT' : 'REJECT_WRONG_ARITY_FILE_ROOT';
  };

  switch (c.mode) {
    case 'imports': {
      if (c.as_value) return 'REJECT_IMPORT_VALUE';
      if (!imports.length) return 'REJECT_MISSING_IMPORT';
      if (imports.some(x => !x.public)) return 'REJECT_PRIVATE_IMPORT';
      return imports.some(x => x.arity === c.arity)
        ? 'EXPLICIT_IMPORT' : 'REJECT_WRONG_ARITY_IMPORT';
    }
    case 'pkg':
      if (c.actor) return 'REJECT_ACTOR_SAME_FILE_DEPENDENCY';
      return root_fn();
    case 'self':
    case 'bare': {
      if (c.actor && c.sealed && c.call === 'handle_state') {
        if (local || family.length) return 'REJECT_INTRINSIC_SHADOW';
        if (!c.instance) return 'REJECT_NO_RECEIVER';
        return 'STATE_INTRINSIC';
      }
      if (c.mode === 'self') {
        if (!c.instance) return 'REJECT_NO_RECEIVER';
        return family.length ? method() : 'REJECT_MISSING_METHOD';
      }
      if (local) {
        if (!local.callable) return 'REJECT_NONCALLABLE';
        return local.arity === c.arity ? 'LEXICAL_CALLABLE' : 'REJECT_WRONG_ARITY_LOCAL';
      }
      if (c.instance && family.length) return method();
      return root.length ? root_fn() : 'REJECT_UNRESOLVED';
    }
    default: return 'REJECT_INVALID_QUALIFIER';
  }
}

test('oracle has a complete nonexecuted evidence boundary and unique case IDs', () => {
  assert.equal(manifest.evidence, 'HOST_ONLY_MODEL_NOT_GUEST');
  assert.ok(manifest.cases.length >= 26);
  assert.equal(new Set(manifest.cases.map(c => c.id)).size, manifest.cases.length);
  assert.ok(Object.values(manifest.backend_evidence).every(v => v === 'NOT_EXECUTED'));
});

test('lexical, implicit-self, file-root and import selection is deterministic', () => {
  for (const c of manifest.cases)
    assert.equal(resolve(c), c.expected, c.id);
});

test('collisions never fall through on wrong arity, missing imports or shadowing', () => {
  const named = id => structuredClone(manifest.cases.find(c => c.id === id));
  const wrongMethod = named('ordinary-method-wins-collision');
  wrongMethod.arity = 1;
  assert.equal(resolve(wrongMethod), 'REJECT_WRONG_ARITY_METHOD');
  const wrongPackage = named('package-explicit');
  wrongPackage.root = [];
  assert.equal(resolve(wrongPackage), 'REJECT_MISSING_FILE_ROOT');
  const shadow = named('lexical-callback-before-method');
  shadow.local[0].callable = false;
  assert.equal(resolve(shadow), 'REJECT_NONCALLABLE');
  const noImport = named('import-explicit');
  noImport.imports = [];
  assert.equal(resolve(noImport), 'REJECT_MISSING_IMPORT');
});

test('actor state authority and imported function values never become generic fallback', () => {
  const intrinsic = structuredClone(manifest.cases.find(c => c.id === 'actor-intrinsic-bare'));
  assert.equal(resolve(intrinsic), 'STATE_INTRINSIC');
  intrinsic.local = [{name:'handle_state', arity:1, callable:true}];
  assert.equal(resolve(intrinsic), 'REJECT_INTRINSIC_SHADOW');
  const imported = structuredClone(manifest.cases.find(c => c.id === 'import-explicit'));
  imported.as_value = true;
  assert.equal(resolve(imported), 'REJECT_IMPORT_VALUE');
});
