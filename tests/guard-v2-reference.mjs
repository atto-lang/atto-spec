// Abstract guard v2 CFG model; not compiler or parser evidence.
function suite(report){
 const assert=(ok,m)=>{if(!ok)throw Error(m)};
 // Model a bounded typed CFG, not parsing. Branches are feasible unless already proven unreachable.
 const outcomes=(nodes)=>{let exits=new Set(["fallthrough"]);for(const n of nodes){if(!exits.has("fallthrough"))break;exits.delete("fallthrough");if(n.kind==="if"){for(const e of outcomes(n.yes))exits.add(e);for(const e of outcomes(n.no||[]))exits.add(e);}else if(n.kind==="return")exits.add(n.valid===false?"invalid_return":"return");else if(["throw","raise","panic","break","continue","never"].includes(n.kind))exits.add(n.kind);else exits.add("fallthrough");}return exits;};
 const admitted=nodes=>{const e=outcomes(nodes);return e.size===1&&e.has("return");};
 const ret={kind:"return"},log={kind:"log"};
 const cases=[[[ret],true],[[log,ret],true],[[log],false],[[],false],[[{kind:"return",valid:false}],false],[[{kind:"if",yes:[ret],no:[ret]}],true],[[{kind:"if",yes:[ret]}],false],[[{kind:"if",yes:[ret]},ret],true],[[{kind:"if",yes:[{kind:"throw"}],no:[ret]}],false],...[ "throw","raise","panic","break","continue","never"].map(kind=>[[{kind}],false])];
 for(const [tree,expected] of cases)assert(admitted(tree)===expected,"CFG mismatch "+JSON.stringify(tree));
 let paths=0;
 for(const form of ["brace","else_end"])for(const flags of [[true,true,true],[false,true,true],[true,false,true],[true,true,false]]){let trace=[],early=false;for(let i=0;i<flags.length;i++){trace.push(i);if(!flags[i]){early=true;trace.push("return");break}}const first=flags.indexOf(false);assert(early===(first>=0),"incorrect early exit "+form);assert(JSON.stringify(trace)===JSON.stringify(first<0?[0,1,2]:[...flags.slice(0,first+1).map((_,i)=>i),"return"]),"short circuit");paths++}
 report(`${cases.length+paths} guard CFG and short-circuit reference cases passed`);
}
suite(console.log);
