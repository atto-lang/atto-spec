import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import test from "node:test";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const spec=JSON.parse(readFileSync(path.join(root,"contracts/ifnot-unless-v1.json"),"utf8"));
const catalog=JSON.parse(readFileSync(path.join(root,"contracts/keyword-taxonomy-v1/catalog.json"),"utf8"));
test("both negated keywords have identical boolean semantics",()=>{
  assert.deepEqual(spec.keywords,["ifnot","unless"]);
  assert.equal(spec.kind,"statement_only");
  assert.equal(spec.predicate_type,"bool");
  assert.equal(spec.evaluate_once,true);
  assert.equal(spec.invert_initial_only,true);
  assert.equal(spec.remaining_elif_predicates_positive,true);
  assert.equal(spec.terminator,"fi");
  assert.equal(spec.no_postfix_unless,true);
  assert.equal(spec.negative_binding_head,"REJECT_UNTIL_SCOPE_PROOF");
  const reserved=new Set(catalog.reserved_groups.flatMap(g=>g.words));
  for(const word of spec.keywords)assert.ok(reserved.has(word));
  for(const row of spec.truth_table)assert.equal(row.first_taken,!row.value);
  assert.equal(spec.truth_table.length,2);
});
test("a draft compiler PR is never counted as executed conformance",()=>{
  assert.equal(spec.evidence.guest_execution,"NOT_EXECUTED");
  assert.equal(spec.evidence.other_backends,"NOT_EXECUTED");
});
