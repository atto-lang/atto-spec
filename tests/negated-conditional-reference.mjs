import {readFileSync} from 'node:fs';
function check(contract,report){
  const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
  const evaluate=(head,elifs,fallback)=>{const x=head();if(typeof x!=="boolean")throw Error("E_BOOL");if(!x)return "first";for(const [cond,result] of elifs){const v=cond();if(typeof v!=="boolean")throw Error("E_BOOL");if(v)return result;}return fallback()};
  eq(contract.kind,"expression_and_statement");eq(contract.keywords,["ifnot","unless"]);eq(contract.forms.map(x=>[x.context,x.else,x.terminator]),[["expression","required","fi"],["statement","optional","fi"],["statement","optional","matching_braces_only"]]);eq(contract.forms[0].control_transfer_value,"reject");eq(contract.negative_binding_head,"REJECT_UNTIL_SCOPE_PROOF");eq(contract.evidence.guest_execution,"NOT_EXECUTED");report("PASS grammar form and evidence boundaries");
  for(const keyword of contract.keywords)for(const row of contract.truth_table){let trace=[];const result=evaluate(()=>{trace.push("head");return row.value},[[()=>{trace.push("elif");return true},"elif"]],()=>{trace.push("else");return "else"});eq(result,row.first_taken?"first":"elif");eq(trace,row.first_taken?["head"]:["head","elif"]);report(`PASS ${keyword} head=${row.value} exactly once; positive elif`);}
  let trace=[];eq(evaluate(()=>{trace.push("head");return true},[[()=>{trace.push("a");return false},"a"],[()=>{trace.push("b");return false},"b"]],()=>{trace.push("else");return "else"}),"else");eq(trace,["head","a","b","else"]);report("PASS fallback order");
  for(const bad of [0,"false",null,{}]){let rejected=false;try{evaluate(()=>bad,[],()=>null)}catch(e){rejected=e.message==="E_BOOL"}eq(rejected,true);}report("PASS no implicit truthiness");
}
check(JSON.parse(readFileSync(new URL('../contracts/ifnot-unless-v1.json',import.meta.url),'utf8')),console.log);
