import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contract = JSON.parse(readFileSync(new URL('../contracts/numeric-semantics-v1.json', import.meta.url), 'utf8'));
const ok = value => ({ kind: 'value', value: String(value) });
const error = code => ({ kind: 'error', code });
const pow10 = n => 10n ** BigInt(n);
const minmax = type => {
  const alias = { int: 'i64', uint: 'u64' }[type] ?? type;
  const m = /^([iu])(8|16|32|64)$/.exec(alias);
  assert.ok(m, `unsupported integer type: ${type}`);
  const bits = BigInt(m[2]);
  return m[1] === 'u' ? [0n, (1n << bits) - 1n] : [-(1n << (bits - 1n)), (1n << (bits - 1n)) - 1n];
};
function bounded(type, op, args) {
  const [low, high] = minmax(type);
  const nums = args.map(x => BigInt(x));
  if (op === 'literal') return nums[0] < low || nums[0] > high ? error('integer_literal_out_of_range') : ok(nums[0]);
  if (nums.some(x => x < low || x > high)) return error('integer_literal_out_of_range');
  if (op === 'div' && nums[1] === 0n) return error('division_by_zero');
  const value = op === 'add' ? nums[0] + nums[1]
    : op === 'neg' ? -nums[0]
    : op === 'sub' ? nums[0] - nums[1]
    : op === 'mul' ? nums[0] * nums[1]
    : op === 'div' ? nums[0] / nums[1]
    : assert.fail(`unknown op ${op}`);
  return value < low || value > high ? error('integer_overflow') : ok(value);
}
const decimalRe = /^(-?)(\d+)(?:\.(\d+))?$/;
function parseDecimal(text) {
  const m = decimalRe.exec(text);
  assert.ok(m, `bad decimal: ${text}`);
  return { coeff: BigInt(`${m[1]}${m[2]}${m[3] ?? ''}`), scale: (m[3] ?? '').length };
}
function renderDecimal({ coeff, scale }) {
  if (coeff === 0n) return '0';
  const sign = coeff < 0n ? '-' : '';
  let digits = String(coeff < 0n ? -coeff : coeff);
  if (scale > 0) digits = digits.padStart(scale + 1, '0');
  let value = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  value = value.replace(/\.?0+$/, '') || '0';
  // Never erase integer zeros: only trim fraction zeros.
  if (!value.includes('.') && scale === 0) value = digits;
  return sign + value;
}
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
function exactDivide(a, b) {
  if (b.coeff === 0n) return error('division_by_zero');
  let num = a.coeff * pow10(b.scale);
  let den = b.coeff * pow10(a.scale);
  if (den < 0n) { num = -num; den = -den; }
  const common = gcd(num, den);
  num /= common; den /= common;
  let twos = 0; let fives = 0;
  while (den % 2n === 0n) { den /= 2n; twos++; }
  while (den % 5n === 0n) { den /= 5n; fives++; }
  if (den !== 1n) return error('decimal_context_required');
  const scale = Math.max(twos, fives);
  return ok(renderDecimal({ coeff: num * (2n ** BigInt(scale - twos)) * (5n ** BigInt(scale - fives)), scale }));
}
function divideRounded(a, b, targetScale, mode) {
  if (b.coeff === 0n) return error('division_by_zero');
  assert.equal(mode, 'half_even');
  if (!Number.isSafeInteger(targetScale) || targetScale < 0 || targetScale > 128) throw Error('invalid test scale');
  let numerator = a.coeff * pow10(b.scale + targetScale);
  let denominator = b.coeff * pow10(a.scale);
  const negative = (numerator < 0n) !== (denominator < 0n);
  numerator = numerator < 0n ? -numerator : numerator;
  denominator = denominator < 0n ? -denominator : denominator;
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (2n * remainder > denominator || (2n * remainder === denominator && quotient % 2n === 1n)) quotient++;
  return { kind: 'value', value: renderDecimal({ coeff: negative ? -quotient : quotient, scale: targetScale }), inexact: remainder !== 0n };
}
function quantize(d, targetScale, mode) {
  assert.equal(mode, 'half_even');
  if (!Number.isSafeInteger(targetScale) || targetScale < 0 || targetScale > 128) throw Error('invalid test scale');
  if (d.scale <= targetScale) return renderDecimal({ coeff: d.coeff * pow10(targetScale - d.scale), scale: targetScale });
  const divisor = pow10(d.scale - targetScale);
  const sign = d.coeff < 0n ? -1n : 1n;
  const abs = d.coeff < 0n ? -d.coeff : d.coeff;
  let q = abs / divisor; const r = abs % divisor;
  if (2n * r > divisor || (2n * r === divisor && q % 2n === 1n)) q += 1n;
  return renderDecimal({ coeff: q * sign, scale: targetScale });
}
function evaluate(c) {
  const { domain, op, args } = c;
  if (domain === 'integer') return bounded(c.type, op, args);
  if (domain === 'bigint') {
    const a = BigInt(args[0]), b = BigInt(args[1]);
    if (op === 'div' && b === 0n) return error('division_by_zero');
    return ok(op === 'add' ? a + b : op === 'mul' ? a * b : op === 'div' ? a / b : assert.fail('bigint op'));
  }
  if (domain === 'decimal') {
    const a = parseDecimal(args[0]);
    const b = args[1] === undefined ? null : parseDecimal(args[1]);
    if (op === 'quantize') return ok(quantize(a, c.scale, c.rounding));
    if (op === 'div_exact') return exactDivide(a, b);
    if (op === 'div_rounded') return divideRounded(a, b, c.scale, c.rounding);
    if (op === 'mul') return ok(renderDecimal({ coeff: a.coeff * b.coeff, scale: a.scale + b.scale }));
    const scale = Math.max(a.scale, b.scale);
    const lhs = a.coeff * pow10(scale - a.scale), rhs = b.coeff * pow10(scale - b.scale);
    return ok(renderDecimal({ coeff: op === 'add' ? lhs + rhs : op === 'sub' ? lhs - rhs : assert.fail('decimal op'), scale }));
  }
  if (domain === 'fixed') {
    const [a, b] = args.map(BigInt);
    const value = op === 'add' ? a + b : op === 'mul' ? a * b : assert.fail('fixed op');
    const [lo, hi] = minmax(c.rep);
    if (a < lo || a > hi || b < lo || b > hi) return error('integer_literal_out_of_range');
    if (op === 'add' && (value < lo || value > hi)) return error('integer_overflow');
    return { kind: 'value', coefficient: String(value), scale: op === 'mul' ? c.scale * 2 : c.scale };
  }
  if (domain === 'vector') {
    const [a, b] = args;
    if (a.length !== b.length) return error('shape_mismatch');
    if (op === 'dot') {
      let total = 0n;
      for (let i = 0; i < a.length; i++) {
        const product = bounded(c.type, 'mul', [a[i], b[i]]);
        if (product.kind === 'error') return { ...product, index: i };
        const sum = bounded(c.type, 'add', [String(total), product.value]);
        if (sum.kind === 'error') return { ...sum, index: i };
        total = BigInt(sum.value);
      }
      return ok(total);
    }
    const out = [];
    for (let i = 0; i < a.length; i++) {
      const v = bounded(c.type, op, [a[i], b[i]]);
      if (v.kind === 'error') return { ...v, index: i };
      out.push(v.value);
    }
    return { kind: 'value', value: out };
  }
  if (domain === 'matrix') {
    assert.equal(op, 'matmul');
    const [a, b] = args;
    const rectangular = m => Array.isArray(m) && m.length > 0
      && Array.isArray(m[0]) && m[0].length > 0
      && m.every(row => Array.isArray(row) && row.length === m[0].length);
    if (!rectangular(a) || !rectangular(b) || a[0].length !== b.length) return error('shape_mismatch');
    const out = [];
    for (let row = 0; row < a.length; row++) {
      const dst = [];
      for (let column = 0; column < b[0].length; column++) {
        let sum = '0';
        for (let inner = 0; inner < b.length; inner++) {
          const product = bounded(c.type, 'mul', [a[row][inner], b[inner][column]]);
          if (product.kind === 'error') return { ...product, row, column, inner };
          const next = bounded(c.type, 'add', [sum, product.value]);
          if (next.kind === 'error') return { ...next, row, column, inner };
          sum = next.value;
        }
        dst.push(sum);
      }
      out.push(dst);
    }
    return { kind: 'value', value: out };
  }
  if (domain === 'dimension') {
    if (op === 'add_points') return error('affine_point_addition');
    const a = c.left.unit, b = c.right.unit;
    if (op === 'add' && [...new Set([...Object.keys(a), ...Object.keys(b)])].some(key => (a[key] ?? 0) !== (b[key] ?? 0))) return error('dimension_mismatch');
    const unit = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const exponent = (a[key] ?? 0) + (op === 'divide' ? -(b[key] ?? 0) : 0);
      if (exponent) unit[key] = exponent;
    }
    // Quantity values here use exact decimal representation, never BigInt truncation.
    // Recurring quotients require a caller-supplied context rather than silent rounding.
    const left = parseDecimal(c.left.value), right = parseDecimal(c.right.value);
    if (op === 'divide') {
      const quotient = exactDivide(left, right);
      return quotient.kind === 'error' ? quotient : { kind: 'value', unit, value: quotient.value };
    }
    assert.equal(op, 'add');
    const scale = Math.max(left.scale, right.scale);
    const coeff = left.coeff * pow10(scale - left.scale) + right.coeff * pow10(scale - right.scale);
    return { kind: 'value', unit, value: renderDecimal({ coeff, scale }) };
  }
  assert.fail(`unknown domain ${domain}`);
}

test('numeric v1 registry is a source-only, fail-closed proposal', () => {
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.status, 'TARGET_NOT_GUEST_EXECUTED');
  assert.ok(contract.cases.length >= 25);
  assert.equal(new Set(contract.cases.map(c => c.id)).size, contract.cases.length);
  assert.deepEqual(Object.keys(contract.backendResults).sort(), [...contract.requiredBackends].sort());
  for (const state of Object.values(contract.backendResults)) assert.equal(state, 'not_executed');
  for (const c of contract.cases) assert.ok(['value', 'error'].includes(c.expected.kind));
});

test('numeric v1 golden outcomes agree with independent exact integer reference', () => {
  for (const c of contract.cases) assert.deepEqual(evaluate(c), c.expected, c.id);
});

test('checked width, exact decimal, rounding and deterministic vector failures are not host Number coercions', () => {
  assert.deepEqual(bounded('u8', 'add', ['255', '1']), error('integer_overflow'));
  assert.deepEqual(bounded('i8', 'literal', ['128']), error('integer_literal_out_of_range'));
  assert.deepEqual(bounded('i64', 'div', ['-7', '3']), ok('-2'));
  assert.equal(quantize(parseDecimal('2.345'), 2, 'half_even'), '2.34');
  assert.equal(quantize(parseDecimal('2.355'), 2, 'half_even'), '2.36');
  assert.equal(quantize(parseDecimal('-2.355'), 2, 'half_even'), '-2.36');
  assert.equal(renderDecimal(parseDecimal('100000000000000000000.1')), '100000000000000000000.1');
  assert.deepEqual(evaluate({ domain: 'vector', op: 'add', type: 'i8', args: [['127','127'],['1','1']] }), { kind: 'error', code: 'integer_overflow', index: 0 });
});

test('quantity division never truncates and matrix error coordinates follow logical row-major order', () => {
  const byId = id => contract.cases.find(c => c.id === id);
  for (const id of ['dimension-fractional-exact', 'dimension-nonterminating', 'dimension-zero-divisor',
                    'dimension-decimal-add', 'matrix-checked-matmul', 'matrix-product-overflow',
                    'matrix-accumulate-overflow', 'matrix-ragged-rejected', 'matrix-inner-mismatch']) {
    assert.deepEqual(evaluate(byId(id)), byId(id).expected, id);
  }
  assert.equal(evaluate(byId('dimension-fractional-exact')).value, '1.5');
  assert.deepEqual(evaluate(byId('matrix-accumulate-overflow')).inner, 1);
});
