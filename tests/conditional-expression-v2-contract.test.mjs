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

test('canonical suffix do and enclosing fi', () => {
  assert.match(c.forms.statement_if.keyword_canonical, /^if bool do /);
  assert.match(c.forms.statement_if.keyword_legacy, /^migration only:/);
  assert.match(c.cases.find(x => x.id === 'nested_brace_preserves_parent_fi').source, /if true do if true/);
  assert.equal(c.cases.find(x => x.id === 'reject_strict_bare_statement_if').kind, 'reject_compile');
});

test('value sequences and explicit ternary results are distinct', () => {
  assert.equal(c.forms.expression_if.value_sequence.trailing_semicolon, 'preserves_final_value');
  assert.equal(c.arm_block.tail, 'ternary_requires_explicit_arm_result');
  for (const [id, value] of [['value_if_comma_true',300],['value_if_comma_false',400],['value_if_semicolon_tail',400],['ternary_caret_local',301],['value_if_lazy_order',42],['imperative_suffix_do',42]]) assert.equal(c.cases.find(x => x.id === id).expected_result,value);
  for (const id of ['value_if_declaration_only','ternary_implicit_tail']) assert.equal(c.cases.find(x => x.id === id).kind,'reject_compile');
});


test('direct ternary arms distinguish aggregate constructors from executable blocks', () => {
  const a = c.forms.ternary.arm_entry;
  assert.equal(a.bare_braces, 'executable_arm_block_only');
  assert.equal(a.struct_literal, 'struct{...}');
  assert.equal(a.record_constructor, 'Record.of(...)');
  assert.equal(a.fallback, 'never_reinterpret_block_as_aggregate');
  assert.equal(a.scope, 'direct_ternary_arm_entry_only');
  const byId = new Map(c.cases.map(x => [x.id, x]));
  for (const [id, expected] of [['ternary_struct_true',42],['ternary_struct_false',7],['ternary_record_true',42],['ternary_record_false',7],['ternary_struct_block_return',42],['ternary_record_block_caret',42],['ternary_nested_record_field',42],['ternary_empty_struct',42],['ternary_empty_record',42]]) {
    assert.equal(byId.get(id).kind,'accept_execute');
    assert.equal(byId.get(id).expected_result,expected);
  }
  for (const id of ['ternary_empty_bare_block','ternary_bare_record_no_fallback','ternary_bare_map_no_fallback']) assert.equal(byId.get(id).kind,'reject_compile');
  for (const id of ['ternary_empty_bare_block','ternary_bare_record_no_fallback','ternary_bare_map_no_fallback']) assert.equal(byId.get(id).expected_diagnostic,'E_VALUE_ARM');
});
