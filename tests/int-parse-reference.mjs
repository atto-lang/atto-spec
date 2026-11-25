// Host-only bounded decimal oracle; no compiler/runtime conformance claim.
function suite(report){
 const parse=(s)=>{const bad=()=>({tag:"Err",error:new Error("invalid integer")});if(typeof s!=="string")throw TypeError("string required");if(s.length<1||s.length>1024||!/^[+-]?[0-9]+$/.test(s))return bad(); // ASCII-only after regex; JS $ permits final newline, so consume all characters below.
 let i=0,negative=false,v=0n;if(s[0]==="+"||s[0]==="-"){negative=s[0]==="-";i++}const limit=negative?9223372036854775808n:9223372036854775807n;for(;i<s.length;i++){let digit=s.charCodeAt(i)-48;if(digit<0||digit>9)return bad();let n=BigInt(digit);if(v>(limit-n)/10n)return bad();v=v*10n+n}return {tag:"Ok",value:negative?-v:v}};
 let count=0;for(const [s,want] of [["42",42n],["+42",42n],["00042",42n],["-42",-42n],["-0",0n],["0",0n],["9223372036854775807",9223372036854775807n],["-9223372036854775808",-9223372036854775808n],["0".repeat(1024),0n]]){let got=parse(s);if(got.tag!=="Ok"||got.value!==want)throw Error("bad success "+s.slice(0,30));count++}
 for(const s of ["9223372036854775808","-9223372036854775809","","+","-"," 42","42 ","٤٢","4_2","42x","4\0","0".repeat(1025),"1\n","1\r\n","--1","1.0","1e2","＋1","1\t","9".repeat(1024)]){let a=parse(s),b=parse(s);if(a.tag!=="Err"||b.tag!=="Err"||a.error.message!=="invalid integer"||a.error===b.error)throw Error("bad failure "+JSON.stringify(s.slice(0,30)));count++}
 let rejected=false;try{parse(42)}catch(e){rejected=e instanceof TypeError}if(!rejected)throw Error("implicit coercion");count++;report(`${count} integer parsing reference cases passed`);
}
suite(console.log);
