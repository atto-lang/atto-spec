// HOST-ONLY typed-fragment reference oracle. This is NOT an Atto compiler,
// a std.pattern implementation, a formatter, or compiled guest evidence.
import test from 'node:test';
import assert from 'node:assert/strict';

const TYPES = new Set(['Any','int','float','bool','string']);
const MAX_BYTES = 4096, MAX_ITEMS = 128, MAX_SEGMENTS = 32, MAX_VALUES = 256;
function fail(message) { throw new Error(message); }

function split_items(source) {
  let depth=0, inString=false, escape=false, at=0;
  const parts=[];
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(inString) {
      if(escape) escape=false;
      else if(c==='\\') escape=true;
      else if(c==='"') inString=false;
    } else if(c==='"') inString=true;
    else if(c==='(') depth++;
    else if(c===')') { depth--; if(depth<0) fail('unbalanced'); }
    else if(c===',' && depth===0) {
      parts.push(source.slice(at,i).trim()); at=i+1;
    }
  }
  if(depth!==0||inString) fail('unbalanced');
  parts.push(source.slice(at).trim());
  if(parts.some(s=>s.length===0)) fail('empty fragment');
  if(parts.length>MAX_ITEMS) fail('fragment budget');
  return parts;
}

function atom(item, expectedType) {
  if(item==='_') return {kind:'any'};
  if(item==='...') return {kind:'rest'};
  if(item.startsWith('"')) {
    let value;
    try { value=JSON.parse(item); } catch { fail('invalid quoted literal'); }
    if(typeof value!=='string') fail('invalid quoted literal');
    if(expectedType!=='Any' && expectedType!=='string') fail('literal type mismatch');
    return {kind:'lit',value};
  }
  if(/^-?(0|[1-9][0-9]*)$/.test(item)) {
    const value=Number(item);
    if(!Number.isSafeInteger(value)) fail('unsafe literal');
    if(expectedType!=='Any' && expectedType!=='int') fail('literal type mismatch');
    return {kind:'lit',value};
  }
  if(item==='true'||item==='false') {
    if(expectedType!=='Any'&&expectedType!=='bool') fail('literal type mismatch');
    return {kind:'lit',value:item==='true'};
  }
  const m=/^is\s+(!?)(int|float|bool|string)$/.exec(item);
  if(m) {
    // A statically impossible positive type test is an error in this
    // conservative reference subset, rather than a dynamic cast.
    if(!m[1]&&expectedType!=='Any'&&expectedType!==m[2]) fail('impossible type');
    return {kind:'type',name:m[2],negative:Boolean(m[1])};
  }
  fail('unsupported fragment syntax');
}
function parse_fragment(source, expectedType) {
  if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>MAX_BYTES)
    fail('fragment source budget');
  if(!TYPES.has(expectedType)) fail('unknown expected type');
  const expanded=[];
  for(const part of split_items(source)) {
    if(part.startsWith('...(')&&part.endsWith(')')) {
      const segments=split_items(part.slice(4,-1));
      if(segments.length>MAX_SEGMENTS) fail('repetition segment budget');
      for(const segment of segments) {
        const m=/^(0|[1-9][0-9]*)\s+of\s+(.+)$/.exec(segment);
        if(!m) fail('invalid counted segment');
        const count=Number(m[1]);
        if(!Number.isSafeInteger(count)||count>MAX_ITEMS-expanded.length)
          fail('repetition expansion budget');
        const raw=m[2].trim();
        const unit=TYPES.has(raw)&&raw!=='Any'
          ?atom('is '+raw,expectedType):atom(raw,expectedType);
        if(unit.kind==='rest') fail('rest repeated');
        for(let i=0;i<count;i++) expanded.push(unit);
      }
    } else {
      expanded.push(atom(part,expectedType));
    }
    if(expanded.length>MAX_ITEMS) fail('fragment expansion budget');
  }
  if(expanded.some((x,i)=>i>0&&x.kind==='rest'&&expanded[i-1].kind==='rest'))
    fail('adjacent rest');
  return expanded;
}
function compile_call(expression, contextType, resolvedStdSymbol=true) {
  if(!resolvedStdSymbol) fail('not canonical std.pattern symbol');
  if(!TYPES.has(contextType)) fail('context type unavailable');
  const match=/^pattern\.of(?:<([A-Za-z][A-Za-z0-9_]*)>)?\(("(?:\\.|[^"\\])*")\)$/.exec(expression);
  if(!match) fail('pattern.of requires literal constexpr call in pattern context');
  const explicitType=match[1]??contextType;
  if(explicitType!==contextType) fail('SeqPart type mismatch');
  let source;
  try {source=JSON.parse(match[2]);}catch{fail('invalid literal');}
  return parse_fragment(source,explicitType);
}
function kind(value) {
  if(typeof value==='boolean') return 'bool';
  if(typeof value==='string') return 'string';
  if(typeof value==='number') return Number.isSafeInteger(value)?'int':'float';
  return 'other';
}
function check(node,value) {
  if(node.kind==='any') return true;
  if(node.kind==='bind') return kind(value)===node.type;
  if(node.kind==='lit') return Object.is(node.value,value);
  if(node.kind==='type') return (kind(value)===node.name)!==node.negative;
  return false;
}
// Bounded dynamic programming reconstruction: deterministic leftmost-shortest.
function match_sequence(nodes,values) {
  if(nodes.length>MAX_ITEMS||values.length>MAX_VALUES) fail('match budget');
  const n=values.length,m=nodes.length;
  const table=Array.from({length:m+1},()=>new Uint8Array(n+1));
  table[m][n]=1;
  for(let i=m-1;i>=0;i--)for(let j=n;j>=0;j--){
    const p=nodes[i];
    table[i][j]=p.kind==='rest'
      ? Number(Boolean(table[i+1][j]||(j<n&&table[i][j+1])))
      : Number(Boolean(j<n&&check(p,values[j])&&table[i+1][j+1]));
  }
  if(!table[0][0]) return {matched:false,bindings:{}};
  const bindings={};const restStarts=new Map();let i=0,j=0;
  while(i<m){
    const p=nodes[i];
    if(p.kind==='rest') {
      if(!restStarts.has(i)) restStarts.set(i,j);
      if(table[i+1][j]){
        if(p.capture) bindings[p.capture]={start:restStarts.get(i),end:j};
        i++;
      } else j++;
    } else {
      if(p.kind==='bind') {
        if(kind(values[j])!==p.type) fail('binding type mismatch');
        bindings[p.name]=values[j];
      }
      i++;j++;
    }
  }
  return {matched:true,bindings};
}
function composition(...fragments) {
  const nodes=fragments.flat();
  if(nodes.some((p,i)=>p.kind==='rest'&&i>0&&nodes[i-1].kind==='rest'))
    fail('adjacent rests after expansion');
  return nodes;
}
test('literal and explicit typed fragments lower to identical structural rest',()=>{
  const inferred=compile_call('pattern.of("...")','int');
  const explicit=compile_call('pattern.of<int>("...")','int');
  assert.deepEqual(inferred,explicit);
  const nodes=composition(inferred,
    [{kind:'bind',type:'int',name:'a'},{kind:'bind',type:'int',name:'b'},
     {kind:'bind',type:'int',name:'c'}],explicit);
  assert.deepEqual(match_sequence(nodes,[1,2,3,4,5]).bindings,{a:1,b:2,c:3});
  assert.deepEqual(match_sequence(nodes,[9,10]).matched,false);
});
test('infix, exact typed repetition and value-vs-type distinction',()=>{
  assert.deepEqual(parse_fragment('...(3 of int)','int').length,3);
  const nodes=composition(parse_fragment('...','int'),
      parse_fragment('...(3 of int)','int'),parse_fragment('...','int'));
  assert.equal(match_sequence(nodes,[9,8,7,6,5]).matched,true);
  assert.equal(match_sequence(nodes,[9,true,7,false,5]).matched,false);
  assert.equal(match_sequence(parse_fragment('...(3 of 7)','int'),[7,7,7]).matched,true);
  assert.equal(match_sequence(parse_fragment('...(3 of 7)','int'),[7,8,7]).matched,false);
  assert.equal(match_sequence(parse_fragment('is int','Any'),[3]).matched,true);
  assert.equal(match_sequence(parse_fragment('is int','Any'),['3']).matched,false);
  assert.deepEqual(parse_fragment('"hello"','string'),[{kind:'lit',value:'hello'}]);
});
test('source strings cannot introduce binders, arbitrary code or runtime evaluation',()=>{
  for(const source of ['is int as val x','call_user_function()','await read()',
    '...(2 of ...)', '...(3 of List.of(is int))','...', '']) {
    if(source==='...') continue;
    assert.throws(()=>parse_fragment(source,'Any'),source);
  }
  for(const call of ['pattern.of(value)','pattern.of(os.read_env("X"))',
      'pattern.of("..." + suffix)','pattern.of<Any>(value)',
      'pattern.of(\'...\')']) {
    assert.throws(()=>compile_call(call,'Any'),call);
  }
  assert.throws(()=>compile_call('pattern.of("...")','Any',false));
});
test('rejects type confusion, malformed syntax, overflow and late adjacency',()=>{
  assert.throws(()=>compile_call('pattern.of<int>("...")','Any'));
  assert.throws(()=>compile_call('pattern.of<int>("...")','string'));
  assert.throws(()=>parse_fragment('is int','string'));
  for(const source of ['..., ...','...,','...(99999999999999 of int)',
      '...(2..4 of int)','...(2 of int, 3 of bool)','...(1 of ...(2 of int))',
      '..._', '_...', 'is int as val a', '...(2 of int','"...']) {
    assert.throws(()=>parse_fragment(source,'int'),source);
  }
  assert.throws(()=>composition(parse_fragment('...','int'),parse_fragment('...','int')));
  assert.throws(()=>parse_fragment('x'.repeat(MAX_BYTES+1),'int'));
});
test('a failing guard does not trigger another witness',()=>{
  const nodes=composition(parse_fragment('...','int'),
    [{kind:'bind',type:'int',name:'x'}],parse_fragment('...','int'));
  let count=0;
  const candidate=match_sequence(nodes,[1,8]);
  const accepted=candidate.matched&&(++count,candidate.bindings.x>5);
  assert.equal(accepted,false);
  assert.equal(candidate.bindings.x,1);
  assert.equal(count,1);
});

test('rest captures track borrowed-view ranges rather than implicit copies',()=>{
  const before=parse_fragment('...','Any').map(x=>({...x,capture:'before'}));
  const after=parse_fragment('...','Any').map(x=>({...x,capture:'after'}));
  const nodes=composition(before,
    [{kind:'bind',name:'a',type:'int'},{kind:'bind',name:'b',type:'int'},
     {kind:'bind',name:'c',type:'int'}],after);
  assert.deepEqual(match_sequence(nodes,[false,1,2,3,true]).bindings,{
    before:{start:0,end:1},a:1,b:2,c:3,after:{start:4,end:5}
  });
});
