// Contextual invocation-prefix reference checks, not full lexical/parser or expansion evidence.
function suite(report){
 // A lexical oracle only: callers supply a code-position token, never text inside a comment or literal.
 const isExpand=(s)=>/^expand!(?!=)[ \t\r\n\v\f]+[A-Za-z_][A-Za-z0-9_]*(?:(?:\.|::)[A-Za-z_][A-Za-z0-9_]*)*\s*\(/u.test(s);
 const positives=["expand! literal(const 42)","expand! m.literal(const 42)","expand! m::literal(const 42)","expand!\nidentity(syntax expr 42)","expand! derive_eq(type User)"];
 const negatives=["expand!literal(const 42)","expand ! literal(const 42)","expand/*gap*/! literal()","expand\n! literal()","expand!=value","expand!! literal()","expand! m.literal!(const 42)","expand! m..literal()","expand! m::()","expand! 1()","expanded! literal()","take! literal()","share! value","borrow! value","trap! literal()","stop! literal()","m.literal!(const 42)","expand!(42)","expand! @Annotation()","expand! #ready","expand! macro_name","expand! m:literal()"];
 for(const s of positives)if(!isExpand(s))throw Error("rejected "+s);
 for(const s of negatives)if(isExpand(s))throw Error("accepted "+s);
 report(`${positives.length+negatives.length} contextual macro lexical prefix cases passed`);
}
suite(console.log);
