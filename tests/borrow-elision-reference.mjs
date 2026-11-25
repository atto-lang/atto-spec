// Abstract optimization admission model. Not compiler/disassembly evidence.
function suite(report){
 const must=(x,m)=>{if(!x)throw Error(m)};
 const eligible=p=>p.resolved&&p.monomorphic&&p.topLevel&&p.synchronous&&p.formalCount===1&&p.mode==="BorrowRead"&&p.body==="direct_return_field"&&p.fieldOwnerSlot===0&&p.fieldPublic&&p.fieldOrdinary&&["int","bool","float"].includes(p.fieldType)&&p.loanProven&&p.evalOnceProven&&p.orderProven&&p.cleanupProven&&p.observabilityProven&&p.authorityProven;
 const good={resolved:true,monomorphic:true,topLevel:true,synchronous:true,formalCount:1,mode:"BorrowRead",body:"direct_return_field",fieldOwnerSlot:0,fieldPublic:true,fieldOrdinary:true,fieldType:"int",loanProven:true,evalOnceProven:true,orderProven:true,cleanupProven:true,observabilityProven:true,authorityProven:true};let n=0;
 for(const type of ["int","bool","float"]){must(eligible({...good,fieldType:type}),"pure scalar getter "+type);n++}
 for(const [key,value] of Object.entries(good)){const replacement=typeof value==="boolean"?false:typeof value==="number"?value+1:"unknown";must(!eligible({...good,[key]:replacement}),"unsafe elision admitted: "+key);n++}
 for(const mode of ["BorrowWrite","Take","Share","LegacyOwned"]){must(!eligible({...good,mode}),"incorrect ownership mode "+mode);n++}
 const loanMetadata=(mode,exclusive)=>({noalias:mode==="BorrowWrite"&&exclusive===true});must(!loanMetadata("BorrowRead",true).noalias,"read alias falsely excluded");must(!loanMetadata("BorrowWrite",false).noalias,"unproven exclusive loan");must(loanMetadata("BorrowWrite",true).noalias,"proven write loan");n+=3;
 for(const spell of ["implicit","explicit"]){let calls=0;const get=()=>{calls++;return {value:42}};const direct=(p)=>p.value;const result=eligible(good)?get().value:direct(get());must(result===42&&calls===1,"once-only "+spell);n++}
 report(`${n} abstract borrow-elision proof-gate scenarios passed`);
}
suite(console.log);
