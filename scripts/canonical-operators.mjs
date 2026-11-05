// Source lexical model only: not a compiler or a parser acceptance receipt.
// Discovers the removed infix tokens %, ^ and ^^ outside literals/comments.
export function removedOperators(source) {
 if(typeof source!=='string')throw new TypeError('expected .atto source text');
 const hits=[];let i=0,block=0,line=false,quote=null,escaped=false;
 while(i<source.length){
   const c=source[i],n=source[i+1];
   if(line){if(c==='\n')line=false;i++;continue;}
   if(block>0){
     if(c==='/'&&n==='*'){block++;i+=2;continue;}
     if(c==='*'&&n==='/'){block--;i+=2;continue;}
     i++;continue;
   }
   if(quote){
     if(escaped){escaped=false;i++;continue;}
     if(c==='\\'){escaped=true;i++;continue;}
     if(c===quote){quote=null;i++;continue;}
     if(c==='\n')throw Error('unterminated line string');
     i++;continue;
   }
   if(c==='/'&&n==='/'){line=true;i+=2;continue;}
   if(c==='/'&&n==='*'){block++;i+=2;continue;}
   if(c==='"'||c==="'"){quote=c;i++;continue;}
   // Template interpolation is not modeled; no claimed parser parity.
   if(c==='`')throw Error('template syntax needs compiler parsing');
   if(c==='%'||c==='^'){
     const token=c==='^'&&n==='^'?'^^':c;
     hits.push({offset:i,token});
     i+=token.length;continue;
   }
   i++;
 }
 if(block!==0||quote)throw Error('unterminated comment or literal');
 return hits;
}
export function assertCanonicalOperators(source) {
 const hits=removedOperators(source);
 if(hits.length)throw Error('removed AttoLang operator: '+hits.map(x=>x.token).join(', '));
 return true;
}
