#!/usr/bin/env node
/**
 * Offline structural validator for advisory Atto repository capability files.
 * This checks declarations only. No external network, compilation, guest
 * execution, provenance verification, or release certification occurs.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROLES = new Set(['compiler', 'runtime', 'platform', 'library', 'tooling', 'demo', 'governance', 'conformance', 'site']);
const STATUS = new Set(['not_executed', 'passed', 'failed', 'unsupported']);
const EXECUTION = new Set(['guest', 'host', 'parser', 'unavailable']);
const SHA = /^[a-f0-9]{40}$/;
const REPO = /^atto-lang\/[a-z0-9._-]+$/;
const FEATURE = /^[a-z][a-z0-9_]*$/;
const RUN = /^https:\/\/github\.com\/atto-lang\/[a-z0-9._-]+\/actions\/runs\/[1-9][0-9]*$/;
const required = ['schema', 'repository', 'role', 'source_state', 'feature_status', 'certification', 'evidence'];

export function validateCapabilities(doc, expectedRepository = null) {
  const fail = message => { throw new Error('E_CAPABILITY_MANIFEST: ' + message); };
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc) ||
      Object.keys(doc).sort().join('|') !== [...required].sort().join('|')) {
    fail('unexpected root keys');
  }
  if (doc.schema !== 'atto.repository-capabilities.v1' ||
      doc.certification !== 'NOT_CERTIFIED') fail('unsupported schema or certification claim');
  if (typeof doc.repository !== 'string' || !REPO.test(doc.repository) ||
      (expectedRepository !== null && doc.repository !== expectedRepository)) fail('repository identity');
  if (!ROLES.has(doc.role) || !['scaffold', 'implementation'].includes(doc.source_state)) fail('role/source state');
  if (!doc.feature_status || typeof doc.feature_status !== 'object' ||
      Array.isArray(doc.feature_status) || Object.keys(doc.feature_status).length < 1) {
    fail('features required');
  }
  const features = Object.entries(doc.feature_status);
  for (const [name, status] of features) {
    if (!FEATURE.test(name) || !STATUS.has(status)) fail('invalid feature/status');
  }
  if (!Array.isArray(doc.evidence) || doc.evidence.length > 100) fail('evidence array');
  if (doc.source_state === 'scaffold' &&
      (doc.evidence.length !== 0 || features.some(([, status]) => status !== 'not_executed'))) {
    fail('README-only scaffold cannot claim executed features');
  }
  const seen = new Set();
  for (const receipt of doc.evidence) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
        Object.keys(receipt).sort().join('|') !==
          ['feature', 'status', 'source_head_sha', 'execution_kind', 'workflow_url'].sort().join('|')) {
      fail('evidence fields');
    }
    if (!FEATURE.test(receipt.feature) || seen.has(receipt.feature) ||
        !['passed', 'failed', 'unsupported'].includes(receipt.status) ||
        doc.feature_status[receipt.feature] !== receipt.status ||
        !SHA.test(receipt.source_head_sha) || !EXECUTION.has(receipt.execution_kind) ||
        !RUN.test(receipt.workflow_url)) {
      fail('incomplete or conflicting evidence metadata');
    }
    if (receipt.status === 'passed' && receipt.execution_kind !== 'guest') {
      fail('host/parser-only evidence cannot claim guest success');
    }
    seen.add(receipt.feature);
  }
  if (features.some(([feature, status]) => status !== 'not_executed' && !seen.has(feature))) {
    fail('non-baseline feature status lacks evidence record');
  }
  return doc;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 3 ||
      (args.length === 3 && args[1] !== '--repo') || args.length === 2) {
    console.error('usage: node scripts/validate-capabilities.mjs <capabilities.json> [--repo atto-lang/name]');
    process.exitCode = 2;
  } else {
    try {
      validateCapabilities(JSON.parse(readFileSync(args[0], 'utf8')), args[2] ?? null);
      process.stdout.write('VALID STRUCTURE ONLY; NOT_CERTIFIED; guest execution not verified\n');
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
