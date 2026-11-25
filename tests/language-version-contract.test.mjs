import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const body=readFileSync(new URL('../language/callable-body-migration-v2.md',import.meta.url),'utf8');

test('compatibility gate always makes v1 the Rust/native/browser default',()=>{
  assert.match(body,/v1 \(legacy\)/);
  assert.match(body,/Rust `compile\(source\)`/);
  assert.match(body,/native `attoc file\.atto`/);
  assert.match(body,/browser ABI `compile\(length\)`/);
  assert.match(body,/retain their old implicit-return meaning/);
});
test('new strict grammar is opt-in across all current compiler/formatter entrypoints',()=>{
  assert.match(body,/`attoc --language-version 2 file\.atto`/);
  assert.match(body,/`compile_v2\(length\)`/);
  assert.match(body,/`compile_with_version\(source, LanguageVersion::Explicit\)`/);
  assert.match(body,/atto-format-caret --language-version=2/);
});
test('version mode never authorizes automatic :: rewrites',()=>{
  assert.match(body,/E_BODY_VERSION/);
  assert.match(body,/No automatic rewrite is authorized/);
  assert.match(body,/legacy comma\/tail bodies/);
  assert.match(body,/semicolons?/i);
});
test('unimplemented package resolver and backend parity stay explicit',()=>{
  assert.match(body,/Package manifest selection remains pending/);
  assert.match(body,/does \*\*not\*\* establish a released language edition/);
});
