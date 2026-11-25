import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pipeShape, connectShape} from "../scripts/actor-pipe-factory-model.mjs";

const fixture = JSON.parse(readFileSync(new URL("./actor-pipe-factory-v0.json", import.meta.url),"utf8"));
const stages = () => fixture.stages.map(s => ({...s}));

test("versioned fixture is explicitly source-free and all five backends remain unverified", () => {
  assert.equal(fixture.schema, "attolang.actor-pipe-factory.v0");
  assert.equal(fixture.evidence, "REFERENCE_MODEL_ONLY_NOT_GUEST_COMPILER_EXECUTION");
  assert.deepEqual(Object.keys(fixture.expected_backend_status).sort(),
    ["forge","java","llvm","net","wasm"]);
  assert.ok(Object.values(fixture.expected_backend_status).every(x => x === "NOT_VERIFIED"));
  assert.ok(fixture.required_guest_cases.length >= 12);
});

test("infix, constructor and bare-type sugar are specified to lower to one typed chain", () => {
  assert.match(fixture.source_forms.keyword, / pipe /);
  assert.match(fixture.source_forms.factory_constructors, /Actor\.pipe\(Reader\(\)/);
  assert.match(fixture.source_forms.factory_type_sugar, /Actor\.pipe\(Reader,/);
  const plans = Array.from({length:3}, () => pipeShape(stages()));
  for (const plan of plans) assert.deepEqual(plan.edges, fixture.expected_edges);
  assert.deepEqual(plans[0].edges, plans[1].edges);
  assert.deepEqual(plans[1].edges, plans[2].edges);
  assert.equal(connectShape(stages()[1], stages()[2]).payload, "Rows");
});

test("type, role, instance and source/sink errors reject before any published result", () => {
  for (const mutate of [
    s => {s[0].outbound="NotBytes";},
    s => {s[1].inbound="WrongBytes";},
    s => {s[1].role="supervisor";},
    s => {s[0].role="transform";s[0].inbound="Bytes";},
    s => {s[2].role="duplex";s[2].outbound="Rows";},
    s => {s[1].id=s[0].id;},
    s => {s[1].inbound="";},
    s => {s[1].actor_type="";}
  ]) {
    const s = stages(); mutate(s);
    assert.throws(() => pipeShape(s));
  }
  assert.throws(() => connectShape(stages()[0], stages()[2]), /incompatible/);
  assert.throws(() => connectShape(stages()[0], stages()[0]), /incompatible/);
});

test("metadata arrays and stages use own data slots, never caller iterators/getters", () => {
  let evaluated = 0;
  const s = stages();
  Object.defineProperty(s[1],"outbound",{get(){evaluated++;return "Rows";}});
  assert.throws(() => pipeShape(s), /own data fields/);
  assert.equal(evaluated,0);

  const a = stages();
  Object.defineProperty(a,"1",{get(){evaluated++;return stages()[1];}});
  assert.throws(() => pipeShape(a), /own data fields/);
  assert.equal(evaluated,0);

  const b = stages();
  Object.defineProperty(b,Symbol.iterator,{value(){evaluated++;throw Error("iterator");}});
  assert.equal(pipeShape(b).edges.length,2);
  assert.equal(evaluated,0);

  const sparse = stages(); delete sparse[1];
  assert.throws(() => pipeShape(sparse), /own data fields/);
});

test("metadata snapshots cannot be changed by caller mutation after planning", () => {
  const original = stages(), result = pipeShape(original);
  original[0].id="spoofed";
  original[1].outbound="Spoofed";
  original[2].id="wrong";
  assert.deepEqual(result.edges, fixture.expected_edges);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.stages));
  assert.ok(Object.isFrozen(result.edges[0]));
  assert.throws(() => {result.edges[0].target="wrong";}, TypeError);
});

test("byte budgets, stage limits, malformed unicode and duplicate names fail closed", () => {
  assert.throws(() => pipeShape([]), /stage count/);
  assert.throws(() => pipeShape([stages()[0]]), /stage count/);
  assert.throws(() => pipeShape(Array(3)), /own data fields/);
  for (const invalidName of ["x\0y", "\ud800", "🌍".repeat(65)]) {
    const s = stages(); s[0].id=invalidName;
    assert.throws(() => pipeShape(s));
  }
  const count=1024;
  const list=Array.from({length:count},(_,i)=>({
    id:"n-"+i, actor_type:"T", role:i===0?"readable":i===count-1?"writable":"transform",
    inbound:i===0?"":"T", outbound:i===count-1?"":"T"
  }));
  assert.equal(pipeShape(list).edges.length,count-1);
  assert.throws(() => pipeShape([...list, {...list[0], id:"overflow"}]),/stage count/);
});
