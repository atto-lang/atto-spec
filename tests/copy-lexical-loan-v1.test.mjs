// HOST-ONLY abstract lexical loan model; no parser, runtime or scheduler evidence.
function runSuite(){
 const check=(ok,msg="assertion failed")=>{if(!ok)throw Error(msg)};
 const deny=(f,code)=>{let actual;try{f()}catch(e){actual=e.message}check(actual===code,`expected ${code}; got ${actual}`)};
 const fail=code=>{throw Error(code)};
 class Model {
   constructor(){this.nodes=new Map();this.handles=new Map();this.loans=[];this.scopes=[{active:true,parent:null}];this.next=0}
   node(value,edges=[],consent=true){const id=++this.next;this.nodes.set(id,{value,edges:[...edges],consent});return id}
   scope(){const p=this.scopes.at(-1),s={active:true,parent:p};this.scopes.push(s);return s}
   exit(s){check(s===this.scopes.at(-1)&&s.parent!==null);for(const l of this.loans)if(l.scope===s)l.live=false;for(const h of this.handles.values())if(h.scope===s)h.live=false;s.active=false;this.scopes.pop()}
   block(f){const s=this.scope();try{return f(s)}finally{this.exit(s)}}
   root(id){const h=Symbol();this.handles.set(h,{id,scope:this.scopes.at(-1),live:true,dependent:false});return h}
   handle(h){const x=this.handles.get(h);if(!x?.live||!x.scope.active)fail("STALE");return x}
   reach(ids){const seen=new Set(),q=[...ids];while(q.length){const id=q.pop();if(seen.has(id))continue;const n=this.nodes.get(id);if(!n)fail("STALE");seen.add(id);q.push(...n.edges)}return seen}
   held(id){return this.loans.some(l=>l.live&&l.ids.has(id))}
   read(h,id){const x=this.handle(h);if(!this.reach([x.id]).has(id))fail("DOMAIN");return this.nodes.get(id).value}
   write(h,id,v){this.read(h,id);if(this.held(id))fail("READONLY");this.nodes.get(id).value=v}
   copy(h,limit=100){const x=this.handle(h),n=this.nodes.get(x.id),ids=this.reach(n.edges);if(ids.size>limit)fail("BUDGET");if([...ids].some(id=>this.loans.some(l=>l.live&&l.exclusive&&l.ids.has(id))))fail("CONFLICT");if(this.loans.some(l=>l.live&&l.exclusive&&l.ids.has(x.id)))fail("CONFLICT");
     const dest=this.root(this.node(n.value,n.edges,n.consent));const d=this.handle(dest);d.dependent=ids.size>0||x.dependent;this.loans.push({ids,scope:d.scope,live:true,exclusive:false,copy:dest,source:h});return dest}
   loan(h,id,exclusive=false){this.read(h,id);const ids=this.reach([id]);if(this.loans.some(l=>l.live&&(l.exclusive||exclusive)&&[...ids].some(i=>l.ids.has(i))))fail("CONFLICT");const l={ids,scope:this.scopes.at(-1),live:true,exclusive};this.loans.push(l);return l}
   escape(h){if(this.handle(h).dependent)fail("ESCAPE")}
   take(h){const x=this.handle(h);if([...this.reach([x.id])].some(id=>this.held(id))||this.loans.some(l=>l.live&&l.source===h))fail("CONFLICT");x.live=false;return this.root(x.id)}
   deep(h){const x=this.handle(h),ids=this.reach([x.id]);if([...ids].some(id=>!this.nodes.get(id).consent))fail("OPT_IN");if(this.loans.some(l=>l.live&&l.exclusive&&[...ids].some(id=>l.ids.has(id))))fail("CONFLICT");const m=new Map();for(const id of ids)m.set(id,this.node(this.nodes.get(id).value));for(const id of ids)this.nodes.get(m.get(id)).edges=this.nodes.get(id).edges.map(i=>m.get(i));return this.root(m.get(x.id))}
 }
 const fixture=()=>{const m=new Model(),leaf=m.node(10),child=m.node(20,[leaf]),r=m.node(1,[child]),a=m.root(r);return {m,leaf,child,r,a}};
 const cases=[
 ["fresh root and copied scalar",()=>{const {m,a,r}=fixture();m.block(()=>{const b=m.copy(a),br=m.handle(b).id;check(br!==r);m.write(b,br,2);check(m.read(a,r)===1)})}],
 ["source descendant readonly",()=>{const {m,a,leaf}=fixture();m.block(()=>{m.copy(a);deny(()=>m.write(a,leaf,99),"READONLY")})}],
 ["copy descendant readonly",()=>{const {m,a,leaf}=fixture();m.block(()=>{const b=m.copy(a);deny(()=>m.write(b,leaf,99),"READONLY")})}],
 ["preexisting alias denied",()=>{const {m,a,leaf}=fixture();const old=leaf;m.block(()=>{m.copy(a);deny(()=>m.write(a,old,99),"READONLY")})}],
 ["restore after block",()=>{const {m,a,leaf}=fixture();m.block(()=>m.copy(a));m.write(a,leaf,42);check(m.read(a,leaf)===42)}],
 ["nested blocks release only inner loan",()=>{const {m,a,leaf}=fixture();m.block(()=>{m.copy(a);m.block(()=>m.copy(a));deny(()=>m.write(a,leaf,42),"READONLY")});m.write(a,leaf,42)}],
 ["copy of copy retains dependency",()=>{const {m,a,leaf}=fixture();m.block(()=>{const b=m.copy(a);m.block(()=>{const c=m.copy(b);deny(()=>m.escape(c),"ESCAPE");deny(()=>m.write(c,leaf,2),"READONLY")})})}],
 ["read view delays recovery",()=>{const {m,a,leaf}=fixture();m.block(()=>{m.loan(a,leaf);m.block(()=>m.copy(a));deny(()=>m.write(a,leaf,2),"READONLY")});m.write(a,leaf,2)}],
 ["exclusive borrow conflicts",()=>{const {m,a,leaf}=fixture();m.block(()=>{m.loan(a,leaf,true);deny(()=>m.copy(a),"CONFLICT")})}],
 ["cannot obtain mutable borrow while shared",()=>{const {m,a,leaf}=fixture();m.block(()=>{m.copy(a);deny(()=>m.loan(a,leaf,true),"CONFLICT")})}],
 ["cannot move source while shared",()=>{const {m,a}=fixture();m.block(()=>{m.copy(a);deny(()=>m.take(a),"CONFLICT")});const b=m.take(a);deny(()=>m.handle(a),"STALE");check(m.handle(b).live)}],
 ["dependent copy cannot escape",()=>{const {m,a}=fixture();m.block(()=>deny(()=>m.escape(m.copy(a)),"ESCAPE"))}],
 ["stale copy after block",()=>{const {m,a}=fixture();const b=m.block(()=>m.copy(a));deny(()=>m.handle(b),"STALE")}],
 ["exception unwinds",()=>{const {m,a,leaf}=fixture();deny(()=>m.block(()=>{m.copy(a);fail("EXCEPTION")}),"EXCEPTION");m.write(a,leaf,42)}],
 ["early return unwinds",()=>{const {m,a,leaf}=fixture();check(m.block(()=>{m.copy(a);return 42})===42);m.write(a,leaf,42)}],
 ["budget denial atomic",()=>{const {m,a,leaf}=fixture();m.block(()=>deny(()=>m.copy(a,1),"BUDGET"));m.write(a,leaf,42)}],
 ["self cycle restricts original root",()=>{const m=new Model(),r=m.node(1);m.nodes.get(r).edges.push(r);const a=m.root(r);m.block(()=>{m.copy(a);deny(()=>m.write(a,r,2),"READONLY")});m.write(a,r,2)}],
 ["deep detach while shallow loan exists",()=>{const {m,a,leaf}=fixture();m.block(()=>{m.copy(a);const c=m.deep(a),cr=m.handle(c).id,cl=m.nodes.get(m.nodes.get(cr).edges[0]).edges[0];m.write(c,cl,99);check(m.read(a,leaf)===10)})}],
 ["deep root without consent denied",()=>{const {m,a,r}=fixture();m.nodes.get(r).consent=false;deny(()=>m.deep(a),"OPT_IN");m.block(()=>m.copy(a))}],
 ["deep nested without consent denied",()=>{const {m,a,child}=fixture();m.nodes.get(child).consent=false;deny(()=>m.deep(a),"OPT_IN")}],
 ["deep cycle preserves identity",()=>{const m=new Model(),r=m.node(1);m.nodes.get(r).edges.push(r);const a=m.root(r),b=m.deep(a),br=m.handle(b).id;check(br!==r&&m.nodes.get(br).edges[0]===br);m.write(b,br,3);check(m.read(a,r)===1)}]
 ];
 return cases.map(([name,fn])=>{fn();return name});
}
const passed = runSuite();
for (const name of passed) console.log('PASS '+name);
console.log(`${passed.length}/${passed.length} host-only checks passed`);
