// Host-only event-sourcing reference model. NOT an AttoLang parser/compiler/runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const contract = JSON.parse(readFileSync(new URL('../conformance/actor-event-sourcing-v1.json', import.meta.url), 'utf8'));

class JournalStream {
  constructor(identity) {
    this.identity = Object.freeze({...identity});
    this.epoch = 1;
    this.version = 0;
    this.events = [];
    this.operations = new Map();
    this.published = 0;
  }

  activate(identity) {
    assert.deepEqual(identity, this.identity, 'identity cannot switch tenants');
    this.epoch += 1;
    return this.epoch;
  }

  // This is a linear in-memory model of a provider transaction. It is not I/O.
  // Epoch check must precede operation dedupe to fence stale incarnations.
  append({identity, epoch, expected_version, operation_id, payload_digest, events, failure, reply_lost}) {
    if (!identity || JSON.stringify(identity) !== JSON.stringify(this.identity))
      return {status: 'REJECT_TENANT'};
    if (epoch !== this.epoch) return {status: 'REJECT_STALE_EPOCH'};
    if (typeof operation_id !== 'string' || !operation_id)
      return {status: 'REJECT_OPERATION_ID'};
    if (typeof payload_digest !== 'string' || !payload_digest)
      return {status: 'REJECT_DIGEST'};
    if (!Array.isArray(events) || !events.length)
      return {status: 'REJECT_EVENTS'};
    if (events.some(x => !Number.isSafeInteger(x)))
      return {status: 'REJECT_EVENT_SCHEMA'};
    const prior = this.operations.get(operation_id);
    if (prior) {
      if (prior.payload_digest !== payload_digest)
        return {status: 'REJECT_PAYLOAD_MISMATCH'};
      return {...prior.receipt, replayed: true};
    }
    if (expected_version !== this.version)
      return {status: 'REJECT_CONFLICT'};
    // Model an atomic provider failure: no staged event, operation receipt, or
    // authoritative state is published.
    if (failure === 'before_commit') return {status: 'REJECT_IO'};
    const next = this.version + events.length;
    const entries = events.map((event, i) => ({
      sequence: this.version + i + 1,
      event
    }));
    const receipt = {status: 'COMMITTED', from: this.version, to: next, operation_id};
    this.events.push(...entries);
    this.version = next;
    this.operations.set(operation_id, {payload_digest, receipt});
    if (reply_lost) return {status: 'OUTCOME_UNKNOWN', operation_id};
    return receipt;
  }

  reconcile(operation_id, payload_digest) {
    const prior = this.operations.get(operation_id);
    if (!prior) return {status: 'ABSENT'};
    return prior.payload_digest === payload_digest
      ? {...prior.receipt, reconciled: true}
      : {status: 'REJECT_PAYLOAD_MISMATCH'};
  }

  // Pure replay: do not publish state if a gap or corruption is detected.
  replay(initial = 0) {
    let next = initial;
    let sequence = 0;
    for (const entry of this.events) {
      if (entry.sequence !== sequence + 1)
        return {status: 'REJECT_CORRUPT_JOURNAL'};
      if (!Number.isSafeInteger(entry.event) || !Number.isSafeInteger(next + entry.event))
        return {status: 'REJECT_EVENT_SCHEMA'};
      next += entry.event;
      sequence += 1;
    }
    this.published = next;
    return {status: 'RECOVERED', state: next, sequence};
  }
}
const ID = Object.freeze({tenant: 't1', namespace: 'billing', actor_type: 'BankAccount', actor_key: 'A1', state_slot: 'main'});

test('policy vocabulary preserves durable keyword and Symbol identity', () => {
  assert.deepEqual(contract.policies, ['#none', '#snapshot', '#event_sourced']);
  assert.equal(contract.transport, '#batched_sidecar');
  assert.equal(contract.storageModes.durable, 'runtime-managed disk');
  assert.equal(contract.storageModes.persistent, 'developer-provided load/save hooks');
  assert.equal(contract.status, 'DESIGN_CONTRACT_HOST_ONLY_NOT_COMPILER_EXECUTED');
  assert.ok(Object.values(contract.backendStatus).every(s => s === 'NOT_EXECUTED'));
  assert.equal(new Set(contract.invariants).size, 12);
  const fixture = readFileSync(new URL('../conformance/actor-event-sourced-declaration-v1.atto', import.meta.url), 'utf8');
  assert.match(fixture, /define durable actor BankAccount as/);
  assert.match(fixture, /state balance: int = 0;/);
  assert.match(fixture, /receive\(ActorMail<int> mail\): void/);
  assert.doesNotMatch(fixture, /define event actor|define event_sourced actor|\bobject BankAccount\b/);
});

test('atomic batch assigns a contiguous sequence, and replay is pure', () => {
  const s = new JournalStream(ID);
  const r = s.append({identity: ID,epoch:1,expected_version:0,operation_id:'op1',payload_digest:'sha:p1',events:[10,20]});
  assert.deepEqual(r,{status:'COMMITTED',from:0,to:2,operation_id:'op1'});
  assert.deepEqual(s.events.map(e=>e.sequence), [1,2]);
  assert.equal(s.published,0, 'unpublished state must remain unchanged until replay/reducer');
  assert.deepEqual(s.replay(),{status:'RECOVERED',state:30,sequence:2});
});

test('fence old epoch before retry deduplication', () => {
  const s=new JournalStream(ID);
  const cmd={identity:ID,epoch:1,expected_version:0,operation_id:'op1',payload_digest:'sha:p1',events:[10]};
  assert.equal(s.append(cmd).status,'COMMITTED');
  assert.equal(s.activate(ID),2);
  assert.equal(s.append(cmd).status,'REJECT_STALE_EPOCH');
  assert.equal(s.append({...cmd,epoch:2}).status,'COMMITTED');
  assert.equal(s.events.length,1, 'same op must not append twice');
});

test('same operation id and payload returns original receipt; mismatch rejects', () => {
  const s=new JournalStream(ID);
  const cmd={identity:ID,epoch:1,expected_version:0,operation_id:'o',payload_digest:'sha:p1',events:[10]};
  const first=s.append(cmd);
  const retried=s.append({...cmd,expected_version:0});
  assert.equal(first.to,retried.to);
  assert.equal(retried.replayed,true);
  assert.equal(s.events.length,1);
  assert.equal(s.append({...cmd,payload_digest:'sha:p2'}).status,'REJECT_PAYLOAD_MISMATCH');
  assert.equal(s.events.length,1);
});

test('wrong expected version or precommit failure has no visible effect', () => {
  const s=new JournalStream(ID);
  const cmd={identity:ID,epoch:1,expected_version:0,operation_id:'o',payload_digest:'sha:p1',events:[1,2]};
  assert.equal(s.append({...cmd,expected_version:5}).status,'REJECT_CONFLICT');
  assert.equal(s.append({...cmd,failure:'before_commit'}).status,'REJECT_IO');
  assert.equal(s.version,0);
  assert.equal(s.events.length,0);
  assert.equal(s.operations.size,0);
  assert.equal(s.published,0);
});

test('lost receipt becomes UNKNOWN and resolves by original operation id', () => {
  const s=new JournalStream(ID);
  const cmd={identity:ID,epoch:1,expected_version:0,operation_id:'op1',payload_digest:'sha:p1',events:[42]};
  assert.deepEqual(s.append({...cmd,reply_lost:true}),{status:'OUTCOME_UNKNOWN',operation_id:'op1'});
  assert.equal(s.events.length,1);
  assert.deepEqual(s.reconcile('op1','sha:p1'),{status:'COMMITTED',from:0,to:1,operation_id:'op1',reconciled:true});
  assert.equal(s.reconcile('op1','sha:other').status,'REJECT_PAYLOAD_MISMATCH');
  assert.equal(s.append(cmd).replayed,true);
  assert.equal(s.events.length,1);
});

test('identity is trusted, and replay gaps fail without publishing partial state', () => {
  const s=new JournalStream(ID);
  const other={...ID,tenant:'attacker'};
  const cmd={identity:ID,epoch:1,expected_version:0,operation_id:'op1',payload_digest:'sha:p1',events:[5,6]};
  assert.equal(s.append({...cmd,identity:other}).status,'REJECT_TENANT');
  assert.equal(s.append(cmd).status,'COMMITTED');
  assert.equal(s.replay().state,11);
  s.events[1].sequence=3;
  assert.deepEqual(s.replay(),{status:'REJECT_CORRUPT_JOURNAL'});
  assert.equal(s.published,11,'failed replay must not publish a partial new state');
  assert.throws(()=>s.activate(other));
});
