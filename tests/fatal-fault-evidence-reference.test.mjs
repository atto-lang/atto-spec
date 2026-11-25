// Host-only evidence classifier; never executes a fault or certifies a backend.
import test from 'node:test';import assert from 'node:assert/strict';
const fatal=new Set(['native-segv','host-oom','os-process-kill','vm-corruption']);
function assess(x){if(fatal.has(x.kind)&&x.scope==='actor'&&!['process','hardware'].includes(x.mechanism))return 'DENIED';if(!x.executed||!x.retired||!x.siblingAfter||!x.fenced||!x.exactArtifacts)return 'NOT_EXECUTED';return 'REQUIRES_INDEPENDENT_PHYSICAL_EVIDENCE'}
test('in-process fatal actor claims denied',()=>{for(const kind of fatal)assert.equal(assess({kind,scope:'actor',mechanism:'same-process'}),'DENIED')});
test('logical model never certifies physical survival',()=>{const x={kind:'guest-panic',scope:'actor',executed:true,retired:true,siblingAfter:true,fenced:true,exactArtifacts:true};assert.equal(assess(x),'REQUIRES_INDEPENDENT_PHYSICAL_EVIDENCE');for(const k of ['executed','retired','siblingAfter','fenced','exactArtifacts'])assert.equal(assess({...x,[k]:false}),'NOT_EXECUTED')});
