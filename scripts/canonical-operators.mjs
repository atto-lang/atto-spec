// Bounded source-fixture scanner, NOT the language lexer or parser.
export function operatorTokens(source) {
 if(typeof source!=='string')throw new TypeError('expected source text');
 const tokens=[]; let i=0,block=0,line=false,quote=null,escaped=false;
 while(i<source.length){
   const c=source[i],n=source[i+1];
   if(line){if(c==='\n')line=false;i++;continue;}
   if(block){
     if(c==='/'&&n==='*'){if(++block>128)throw Error('comment nesting exceeds 128');i+=2;continue;}
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
   if(c==='`')throw Error('template syntax needs compiler parsing');
   if(/\s/.test(c)){i++;continue;}
   const m=/^(?:\^\^=|\^\^|\^=|\^|%=|%|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|.)/.exec(source.slice(i));
   const token=m[0];tokens.push({offset:i,token});i+=token.length;
 }
 if(block||quote)throw Error('unterminated comment or literal');
 return tokens;
}
// Only the simple fixture shapes are classified. Unknown syntax needs a parser.
export function caretSites(source){
 const ts=operatorTokens(source);
 return ts.flatMap((t,i)=>{
   if(t.token!=='^')return [];
   const prev=ts[i-1]?.token,next=ts[i+1]?.token;
   const kind=prev==='return'&&next==='('?'contextual-return':
     prev===undefined||prev==='{'||prev===';'?'statement-return':
     /^[0-9]+$/.test(prev||'')&&/^[0-9]+$/.test(next||'')?'removed-infix':
     'requires-parser';
   return [{...t,kind}];
 });
}
