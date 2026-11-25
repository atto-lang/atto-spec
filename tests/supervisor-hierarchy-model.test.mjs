import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateHierarchy, restartTargets, shutdownOrder } from "../scripts/supervisor-hierarchy-model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(here, "supervisor-hierarchy-v1.json"), "utf8"));
const copy = value => JSON.parse(JSON.stringify(value));

test("fixture is explicitly source-free and not backend evidence", () => {
  assert.equal(fixture.schema, "attolang.supervisor-hierarchy.reference.v1");
  assert.equal(fixture.evidence, "SOURCE_FREE_MODEL_ONLY_NOT_GUEST_EXECUTION");
  assert.equal(validateHierarchy(fixture).root.id, "root");
});

test("restart is local; supervisor children are unit restart boundaries", () => {
  assert.deepEqual(restartTargets(fixture,"cache_worker"), fixture.expected.local_cache_failure);
  assert.deepEqual(restartTargets(fixture,"cache"), fixture.expected.escalated_cache_supervisor);
  assert.deepEqual(restartTargets(fixture,"http"), fixture.expected.api_failure);
  assert.deepEqual(restartTargets(fixture,"api"), fixture.expected.root_api_failure);
  assert.deepEqual(restartTargets(fixture,"cache_worker",false), fixture.expected.transient_normal_exit);
});

test("fence complete subtree and retire descendants before parent, reverse sibling order", () => {
  assert.deepEqual(shutdownOrder(fixture), fixture.expected.shutdown);
});

const bad = [
  ["duplicate identity", t=>{t.nodes[2].id="api";}],
  ["orphan", t=>{t.nodes[4].parent="missing";}],
  ["actor becomes parent", t=>{t.nodes[6].parent="http";}],
  ["self parenting", t=>{t.nodes[5].parent="cache";}],
  ["cross tenant", t=>{t.nodes[7].tenant="tenant_b";}],
  ["unknown restart policy", t=>{t.nodes[7].restart="all";}],
  ["duplicate sibling position", t=>{t.nodes[4].order=0;}],
  ["unknown restart strategy", t=>{t.nodes[1].policy.strategy="restart_all";}],
  ["negative restart credits", t=>{t.nodes[1].policy.max_restarts=-1;}],
  ["no root", t=>{t.nodes[0].parent="data";}],
  ["actor root", t=>{t.nodes[0].kind="actor";}],
  ["actor masquerades as supervisor", t=>{t.nodes[6].policy={strategy:"one_for_one",max_restarts:1,window_ms:5};}],
  ["two roots", t=>{t.nodes[1].parent=null;delete t.nodes[1].order;delete t.nodes[1].restart;}],
  ["duplicate root sibling position", t=>{t.nodes[2].order=0;}],
  ["invalid id", t=>{t.nodes[2].id="__bad";}]
];
for (const [title, mutate] of bad) {
  test("reject: "+title, () => {
    const changed=copy(fixture); mutate(changed);
    assert.throws(()=>validateHierarchy(changed));
  });
}
