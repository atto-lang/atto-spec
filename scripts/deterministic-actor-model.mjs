// Bounded source-free scheduler oracle. NOT an AttoLang actor runtime or guest proof.
import {createHash} from 'node:crypto';

const SCHEMA = 'atto.actor-schedule.v1';
const MAX_STEPS = 10_000;
const MAX_TASKS = 256;
const MAX_MESSAGES = 1024;
const MAX_CLOCK = Number.MAX_SAFE_INTEGER;
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validId = x => typeof x === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(x);
function demand(condition, message) {if (!condition) throw Error(message);}
function jsonCopy(x) {
  const encoded = JSON.stringify(x);
  demand(encoded !== undefined && encoded.length <= 1_000_000, 'invalid or oversized scenario');
  const value = JSON.parse(encoded);
  demand(JSON.stringify(value) === encoded, 'noncanonical scenario');
  return value;
}
function safeInteger(x, min = 0) {return Number.isSafeInteger(x) && x >= min;}
function validateSteps(steps) {
  demand(Array.isArray(steps) && steps.length <= MAX_STEPS, 'invalid steps');
  for (const s of steps) {
    demand(s && typeof s === 'object' && !Array.isArray(s), 'invalid operation');
    demand(['send','cancel','restart','upgrade','sleep','timer_send','transfer','load','store','add','assert','yield'].includes(s.op), 'unsupported operation');
    for (const k of ['to','tag','target','from','asset','key','as','local']) {
      if (s[k] !== undefined) demand(validId(s[k]), 'invalid '+k);
    }
    if (['sleep','timer_send'].includes(s.op)) demand(safeInteger(s.after, 1), 'invalid timer delay');
    if (s.op === 'add') demand(safeInteger(s.by ?? 1), 'invalid delta');
  }
}
function build(scenario) {
  demand(scenario && Array.isArray(scenario.actors) && Array.isArray(scenario.tasks), 'invalid scenario');
  demand(scenario.actors.length <= MAX_TASKS && scenario.tasks.length <= MAX_TASKS, 'actor/task budget exceeded');
  const actors = Object.create(null);
  for (const a of scenario.actors) {
    demand(validId(a.id) && !actors[a.id], 'duplicate or invalid actor');
    demand(a.handlers && typeof a.handlers === 'object' && !Array.isArray(a.handlers), 'missing handlers');
    for (const [tag, steps] of Object.entries(a.handlers)) {demand(validId(tag), 'invalid message tag');validateSteps(steps);}
    actors[a.id] = {generation:1, version:1, serial:a.serial !== false, handlers:a.handlers};
  }
  const tasks = Object.create(null);
  for (const t of scenario.tasks) {
    demand(validId(t.id) && !tasks[t.id] && !t.id.startsWith('delivery.'), 'duplicate or invalid task');
    validateSteps(t.steps);
    tasks[t.id] = {pc:0, steps:t.steps, locals:{}, wake:null, actor:null, generation:null};
  }
  const shared = scenario.shared ?? {};
  demand(shared && typeof shared === 'object' && !Array.isArray(shared), 'invalid shared state');
  for (const [key,value] of Object.entries(shared)) demand(validId(key) && safeInteger(value), 'invalid shared counter');
  const owners = scenario.owners ?? {};
  for (const [asset, owner] of Object.entries(owners)) demand(validId(asset) && actors[owner], 'invalid asset ownership');
  return {clock:0, actors, tasks, mailbox:[], timers:[], shared, owners, nextId:1, transitions:0, consumed:0, cancelled:0, fenced:0};
}
function ready(s) {
  const choices = [];
  for (const [id,t] of Object.entries(s.tasks)) if (t.wake === null || t.wake <= s.clock) choices.push('step:'+id);
  for (const m of s.mailbox) {
    const a = s.actors[m.to];
    const busy = Object.values(s.tasks).some(t => t.actor === m.to && t.generation === a.generation);
    if (a.generation === m.generation && (!a.serial || !busy)) choices.push('deliver:'+m.id);
  }
  for (const timer of s.timers) if (timer.due <= s.clock) choices.push('timer:'+timer.id);
  return choices.sort();
}
function advance(s) {
  let next = Infinity;
  for (const t of Object.values(s.tasks)) if (t.wake !== null) next = Math.min(next, t.wake);
  for (const t of s.timers) next = Math.min(next, t.due);
  if (!Number.isFinite(next)) return false;
  demand(safeInteger(next) && next > s.clock, 'invalid virtual time advancement');
  s.clock = next;
  return true;
}
function execute(s, choice) {
  const [kind,id] = [choice.slice(0, choice.indexOf(':')), choice.slice(choice.indexOf(':')+1)];
  if (kind === 'deliver') {
    const index = s.mailbox.findIndex(m => m.id === id);
    demand(index >= 0, 'nonexistent mailbox entry');
    const [m] = s.mailbox.splice(index,1);
    const a = s.actors[m.to];
    demand(a.generation === m.generation, 'stale mailbox admission');
    const steps = a.handlers[m.tag];
    demand(steps, 'unknown message handler');
    const tid = 'delivery.'+m.id;
    demand(!s.tasks[tid], 'duplicate handler task');
    if (steps.length) s.tasks[tid] = {pc:0, steps, locals:{}, wake:null, actor:m.to, generation:a.generation};
    s.consumed++;
  } else if (kind === 'timer') {
    const i = s.timers.findIndex(t => t.id === id);
    demand(i >= 0, 'unknown timer');
    const [timer] = s.timers.splice(i,1);
    if (s.actors[timer.to].generation !== timer.generation) s.fenced++;
    else enqueue(s,timer.to,timer.tag);
  } else {
    demand(kind === 'step', 'unknown choice');
    const t = s.tasks[id]; demand(t && t.pc < t.steps.length, 'unknown task step');
    if (t.actor) demand(s.actors[t.actor].generation === t.generation, 'stale actor task');
    const op = t.steps[t.pc++];
    const actor = id;
    switch(op.op) {
      case 'send': enqueue(s,op.to,op.tag); break;
      case 'cancel': {
        const target = op.target;
        if (s.tasks[target] && target !== actor) {delete s.tasks[target];s.cancelled++;}
        else if (target.startsWith('m')) {const i=s.mailbox.findIndex(m=>m.id===target);if(i>=0){s.mailbox.splice(i,1);s.cancelled++;}}
        else if (target.startsWith('t')) {const i=s.timers.findIndex(m=>m.id===target);if(i>=0){s.timers.splice(i,1);s.cancelled++;}}
        break;
      }
      case 'restart': {
        demand(s.actors[op.target], 'unknown actor restart');
        const a = s.actors[op.target];demand(safeInteger(a.generation+1,1), 'generation overflow');
        a.generation++;
        for (const tid of Object.keys(s.tasks)) if (s.tasks[tid].actor === op.target) {delete s.tasks[tid];s.fenced++;}
        const old = s.mailbox.length;
        s.mailbox=s.mailbox.filter(m=>m.to!==op.target);
        s.fenced+=old-s.mailbox.length;
        for (const [asset,owner] of Object.entries(s.owners)) if(owner===op.target) delete s.owners[asset];
        break;
      }
      case 'upgrade': {
        const a = s.actors[op.target];demand(a, 'unknown actor upgrade');
        demand(!Object.values(s.tasks).some(x=>x.actor===op.target), 'upgrade requires quiescence');
        demand(safeInteger(a.version+1,1),'version overflow');a.version++;break;
      }
      case 'sleep': {
        const due=s.clock+op.after;demand(safeInteger(due)&&due<=MAX_CLOCK,'virtual clock overflow');t.wake=due;break;
      }
      case 'timer_send': {
        const due=s.clock+op.after;demand(safeInteger(due),'timer overflow');
        demand(s.timers.length<MAX_MESSAGES,'timer budget exceeded');
        demand(s.actors[op.to] && Object.hasOwn(s.actors[op.to].handlers,op.tag), 'unknown timer receiver');
        s.timers.push({id:'t'+s.nextId++,to:op.to,tag:op.tag,due,generation:s.actors[op.to].generation});break;
      }
      case 'transfer': {
        demand(s.actors[op.from] && s.actors[op.to], 'unknown transfer actor');
        demand(s.owners[op.asset]===op.from, 'ownership transfer without authority');
        s.owners[op.asset]=op.to;break;
      }
      case 'load': demand(Object.hasOwn(s.shared,op.key),'unknown shared key');t.locals[op.as]=s.shared[op.key];break;
      case 'store': {
        const val = op.local === undefined ? op.value : t.locals[op.local];
        demand(Object.hasOwn(s.shared,op.key) && safeInteger(val), 'invalid store');s.shared[op.key]=val;break;
      }
      case 'add': {
        const prev=s.shared[op.key];demand(safeInteger(prev) && safeInteger(prev+(op.by??1)), 'invalid counter addition');
        s.shared[op.key]=prev+(op.by??1);break;
      }
      case 'assert': demand(s.shared[op.key]===op.value,'property failed: '+op.key);break;
      case 'yield': break;
      default: throw Error('unsupported operation');
    }
    if (s.tasks[id] && t.pc >= t.steps.length) delete s.tasks[id];
  }
  s.transitions++;
}
function enqueue(s,to,tag) {
  demand(s.actors[to] && Object.hasOwn(s.actors[to].handlers,tag), 'unknown message receiver');
  demand(s.mailbox.length < MAX_MESSAGES, 'mailbox budget exceeded');
  s.mailbox.push({id:'m'+s.nextId++,to,tag,generation:s.actors[to].generation});
}
function rng(seed) {let x=seed>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};}
/** Returns a source-free oracle trace. Replays are exact and fail closed on divergence. */
export function schedule(scenarioInput,{seed=1,replay=null,prefix=[],maxSteps=MAX_STEPS}={}) {
  demand(safeInteger(seed) && seed<=0xffffffff, 'invalid seed');
  demand(Array.isArray(prefix) && prefix.length <= MAX_STEPS && prefix.every(x=>typeof x==='string'), 'invalid forced choices');
  demand(!(replay && prefix.length), 'replay and forced choices cannot be combined');
  demand(safeInteger(maxSteps,1)&&maxSteps<=MAX_STEPS,'invalid step budget');
  const scenario = jsonCopy(scenarioInput), scenarioHash=hash(scenario);
  const state = build(scenario), choices = [], random = rng(seed);
  let failure = null;
  if (replay) demand(replay.schema === SCHEMA && replay.seed === seed &&
    replay.scenario_hash === scenarioHash && Array.isArray(replay.events), 'replay header mismatch');
  for(let count=0; ; count++) {
    demand(count <= maxSteps,'schedule step budget exhausted');
    let enabled=ready(state);
    if (!enabled.length && advance(state)) enabled=ready(state);
    if (!enabled.length) break;
    demand(count < maxSteps,'schedule step budget exhausted');
    const before=hash(state);
    const expected = replay?.events[count];
    const selected = replay ? expected?.choice : count < prefix.length ? prefix[count] : enabled[random()%enabled.length];
    demand(enabled.includes(selected), 'replay choice not enabled');
    const event={seq:count,time:state.clock,enabled,choice:selected,before};
    if (replay) demand(expected?.seq===event.seq && expected.time===event.time &&
      expected.choice===event.choice && expected.before===event.before &&
      JSON.stringify(expected.enabled)===JSON.stringify(event.enabled),'replay event mismatch');
    try { execute(state,selected); }
    catch (error) { failure = {seq:count,message:String(error.message)}; }
    event.after=hash(state);
    if (failure) event.failure=failure.message;
    if (replay) demand(JSON.stringify(expected)===JSON.stringify(event),'replay state divergence');
    choices.push(event);
    if (failure) break;
  }
  const result={schema:SCHEMA,evidence:'REFERENCE_MODEL_ONLY_NOT_GUEST_EXECUTION',seed,scenario_hash:scenarioHash,status:failure?'failed':'completed',failure,events:choices,final_hash:hash(state),final_state:state};
  if (replay) demand(replay.events.length===choices.length && replay.final_hash===result.final_hash &&
    JSON.stringify(replay.final_state)===JSON.stringify(result.final_state) &&
    replay.status===result.status && JSON.stringify(replay.failure)===JSON.stringify(failure),'replay terminal divergence');
  return result;
}

/** Bounded deliberate schedule exploration; not a proof over infinite schedules. */
export function explore(scenario,{seed=1,maxSchedules=128,maxSteps=MAX_STEPS}={}) {
  demand(safeInteger(maxSchedules,1)&&maxSchedules<=1024,'invalid exploration budget');
  const pending=[[]],seen=new Set(['[]']),traces=[];
  while(pending.length && traces.length<maxSchedules) {
    const prefix=pending.shift();
    const trace=schedule(scenario,{seed,prefix,maxSteps});
    traces.push(trace);
    for(let i=prefix.length;i<trace.events.length;i++) {
      const event=trace.events[i];
      for(const alternative of event.enabled) {
        if(alternative===event.choice)continue;
        const path=[...trace.events.slice(0,i).map(e=>e.choice),alternative];
        const key=JSON.stringify(path);
        if(!seen.has(key)&&pending.length+traces.length<maxSchedules*16) {seen.add(key);pending.push(path);}
      }
    }
  }
  return {schema:SCHEMA,evidence:'REFERENCE_MODEL_ONLY_NOT_GUEST_EXECUTION',explored:traces.length,exhausted:pending.length===0,traces};
}
