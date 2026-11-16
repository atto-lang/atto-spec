// HOST-ONLY abstract-interpretation oracle. Does NOT invoke the AttoLang compiler.
import test from 'node:test';
import assert from 'node:assert/strict';

const fault = code => { const e = new Error(code); e.code = code; throw e; };
const existing = () => ({fresh:false, unique:false, origin:'old'});
const allocated = origin => ({fresh:true, unique:true, origin});
const audit = ({result='new Foo', copyOverride=false, steps=[]}) => {
  let allocation=0;
  const go = (steps, vars=new Map([['self',existing()],['arg',existing()]]), baseline=0, baselineOrigin='') => {
    let states=[{vars,baseline,baselineOrigin}];
    let returned=0;
    for (const step of steps) {
      const pending=[];
      for (const state of states) {
        const {vars}=state;
        const read=k => { if (!vars.has(k)) fault('E_FRESH_UNPROVEN'); return vars.get(k); };
        if (step.op==='alloc') vars.set(step.to,allocated('alloc:'+ ++allocation));
        else if (step.op==='cached') vars.set(step.to,existing());
        else if (step.op==='alias') vars.set(step.to,read(step.from));
        else if (step.op==='move') { vars.set(step.to,read(step.from)); vars.delete(step.from); }
        else if (step.op==='cast') vars.set(step.to,{...read(step.from)});
        else if (step.op==='call') {
          const valid=step.verified && (step.contract==='new Foo' || step.contract==='new unique Foo');
          vars.set(step.to,valid ? {...allocated('call:'+ ++allocation),unique:step.contract==='new unique Foo'} : existing());
        }
        else if (step.op==='publish') read(step.from).unique=false;
        else if (step.op==='baseline') {
          if (!copyOverride || ++state.baseline!==1) fault('E_COPY_OVERRIDE');
          state.baselineOrigin='baseline:'+ ++allocation;
          vars.set(step.to,allocated(state.baselineOrigin));
        }
        else if (step.op==='branch') {
          // Both paths must return; branch-local vars cannot silently leak across joins.
          const fork=() => new Map([...vars].map(([k,v])=>[k,{...v}]));
          returned+=go(step.yes,fork(),state.baseline,state.baselineOrigin);
          returned+=go(step.no,fork(),state.baseline,state.baselineOrigin);
          continue;
        }
        else if (step.op==='return') {
          const v=read(step.from);
          if (result.startsWith('new ') && !v.fresh) fault('E_FRESH_UNPROVEN');
          if (result==='new unique Foo' && !v.unique) fault('E_FRESH_NOT_UNIQUE');
          if (copyOverride && (state.baseline!==1 || v.origin!==state.baselineOrigin)) fault('E_COPY_OVERRIDE');
          returned++;
          continue;
        }
        else fault('E_FRESH_UNPROVEN');
        pending.push(state);
      }
      states=pending;
    }
    if(states.length) fault('E_FRESH_MISSING_RETURN');
    return returned;
  };
  if (!go(steps)) fault('E_FRESH_MISSING_RETURN');
};
const yes = v => assert.doesNotThrow(()=>audit(v));
const no = (v,c) => assert.throws(()=>audit(v),{code:c});
const steps = (...s) => ({steps:s});

test('new T accepts new instance, alias and moved local', () => {
  yes(steps({op:'alloc',to:'x'},{op:'return',from:'x'}));
  yes(steps({op:'alloc',to:'x'},{op:'alias',to:'y',from:'x'},{op:'return',from:'y'}));
  yes(steps({op:'alloc',to:'x'},{op:'move',to:'y',from:'x'},{op:'return',from:'y'}));
});
test('self, parameters and caches are not fresh', () => {
  for(const from of ['self','arg']) no(steps({op:'return',from}),'E_FRESH_UNPROVEN');
  no(steps({op:'cached',to:'x'},{op:'return',from:'x'}),'E_FRESH_UNPROVEN');
});
test('cast or move of old object cannot forge freshness', () => {
  no(steps({op:'cast',to:'x',from:'self'},{op:'return',from:'x'}),'E_FRESH_UNPROVEN');
  no(steps({op:'move',to:'x',from:'arg'},{op:'return',from:'x'}),'E_FRESH_UNPROVEN');
});
test('verified helper contract required', () => {
  yes(steps({op:'call',to:'x',verified:true,contract:'new Foo'},{op:'return',from:'x'}));
  no(steps({op:'call',to:'x',verified:false,contract:'new Foo'},{op:'return',from:'x'}),'E_FRESH_UNPROVEN');
  no(steps({op:'call',to:'x',verified:true,contract:'Foo'},{op:'return',from:'x'}),'E_FRESH_UNPROVEN');
});
test('each branch must return a fresh identity', () => {
  yes(steps({op:'branch',yes:[{op:'alloc',to:'x'},{op:'return',from:'x'}],no:[{op:'alloc',to:'y'},{op:'return',from:'y'}]}));
  no(steps({op:'branch',yes:[{op:'alloc',to:'x'},{op:'return',from:'x'}],no:[{op:'return',from:'self'}]}),'E_FRESH_UNPROVEN');
  no(steps({op:'branch',yes:[{op:'alloc',to:'x'},{op:'return',from:'x'}],no:[]}), 'E_FRESH_MISSING_RETURN');
});
test('new and new unique are different guarantees', () => {
  yes(steps({op:'alloc',to:'x'},{op:'publish',from:'x'},{op:'return',from:'x'}));
  no({result:'new unique Foo',steps:[{op:'alloc',to:'x'},{op:'publish',from:'x'},{op:'return',from:'x'}]},'E_FRESH_NOT_UNIQUE');
  yes({result:'new unique Foo',steps:[{op:'alloc',to:'x'},{op:'return',from:'x'}]});
  no({result:'new unique Foo',steps:[{op:'call',to:'x',contract:'new Foo',verified:true},{op:'return',from:'x'}]},'E_FRESH_NOT_UNIQUE');
});
test('ordinary Foo return may return self', () => yes({result:'Foo',steps:[{op:'return',from:'self'}]}));
test('Copyable override must return exactly one synthesized baseline', () => {
  yes({copyOverride:true,steps:[{op:'baseline',to:'c'},{op:'return',from:'c'}]});
  no({copyOverride:true,steps:[{op:'alloc',to:'c'},{op:'return',from:'c'}]},'E_COPY_OVERRIDE');
  no({copyOverride:true,steps:[{op:'baseline',to:'c'},{op:'baseline',to:'d'},{op:'return',from:'d'}]},'E_COPY_OVERRIDE');
  no({copyOverride:true,steps:[{op:'baseline',to:'c'},{op:'alloc',to:'d'},{op:'return',from:'d'}]},'E_COPY_OVERRIDE');
});
