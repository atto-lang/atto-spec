import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync(new URL('../contracts/conditional-expression-v2.json', import.meta.url), 'utf8'));
test('conditional-expression v2 stays target-only and has three distinct forms', () => {
  assert.equal(c.schema, 'attolang.conditional-expression.v2');
  assert.equal(c.status, 'TARGET_COMPILER_VERIFICATION_PENDING');
  assert.equal(c.requires_compiled_guest_for_pass, true);
  assert.equal(c.forms.statement_if.produces_value, false);
  assert.equal(c.forms.expression_if.produces_value, true);
  assert.equal(c.forms.expression_if.else_required, true);
  assert.equal(c.forms.expression_if.max_arms, 128);
  assert.match(c.forms.statement_if.terminator, /never consumes fi/);
  assert.equal(c.forms.ternary.associativity, 'right');
  assert.match(c.arm_block.final_return, /arm_only/);
  assert.equal(c.arm_block.required_value_type, 'non_void');
  const ids = new Set(c.cases.map(x => x.id));
  assert.equal(ids.size, c.cases.length);
  for (const id of ['if_expression_true','ternary_return_arms','braced_statement_no_fi','unselected_arm_effects','if_requires_else','if_types_join','block_semi_discards_tail','block_scope_is_lexical','reject_mixed_braces_fi','nested_brace_preserves_parent_fi','reject_excessive_elif','reject_void_ternary_expression','reject_void_if_expression','allow_imperative_void_effect']) assert.ok(ids.has(id), id);
  for (const item of c.cases) {
    assert.match(item.source, /pub fnc main/);
    if (item.kind === 'accept_execute') assert.equal(typeof item.expected_result, 'number');
    else assert.match(item.expected_diagnostic, /^E_/);
  }
});

test('strict statements require do and retain the enclosing fi', () => {
  assert.match(c.forms.statement_if.keyword_canonical, /^do if /);
  assert.match(c.forms.statement_if.keyword_legacy, /^legacy edition only:/);
  assert.match(c.cases.find(x => x.id === 'nested_brace_preserves_parent_fi').source, /do if true then if true/);
  assert.equal(c.cases.find(x => x.id === 'reject_strict_bare_statement_if').kind, 'reject_compile');
});
