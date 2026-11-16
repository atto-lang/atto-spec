// HOST-ONLY reference model for sequence-pattern-matching-v2.md.
// NOT a compiler parser, NOT AttoLang guest execution, NOT backend parity.
import assert from 'node:assert/strict';
import test from 'node:test';

const tuple = (...items) => ({kind:'Tuple', items});
const array = (...items) => ({kind:'Array', items});
const MAX_SOURCE = 4096;
const MAX_ITEMS = 128;
const MAX_VALUES = 256;
const MAX_DEPTH = 8;
const MAX_REPEAT_SEGMENTS = 32;
const MAX_STATES = (MAX_ITEMS + 1) * (MAX_VALUES + 1);

function comma_parts(source) {
  if (!source.trim()) return [];
  const parts=[];
  let start=0, round=0, square=0, quote=false, escaped=false;
  for(let i=0;i<source.length;i++) {
    const ch=source[i];
    if(quote) {
      if(escaped) escaped=false;
      else if(ch==='\\') escaped=true;
      else if(ch==='"') quote=false;
    } else if(ch==='"') quote=true;
    else if(ch==='(') round++;
    else if(ch===')') round--;
    else if(ch==='[') square++;
    else if(ch===']') square--;
    else if(ch===',' && round===0 && square===0) {
      parts.push(source.slice(start,i).trim()); start=i+1;
    }
    if(round<0 || square<0) throw Error('unbalanced delimiters');
  }
  if(quote || round || square) throw Error('unbalanced delimiters');
  parts.push(source.slice(start).trim());
  if(parts.some(x=>!x)) throw Error('empty pattern item');
  if(parts.length>MAX_ITEMS) throw Error('too many pattern items');
  return parts;
}

function type_pattern(source) {
  const negative=source.startsWith('!');
  const name=negative? source.slice(1):source;
  if(!['int','float','bool','string','List','Array','Tuple'].includes(name))
    throw Error('unsupported type name');
  return {kind:'type', name, negative};
}

function parse(source) {
  if(source.length>MAX_SOURCE) throw Error('pattern source too large');
  const binders=new Set();
  function item(text, depth=0, inside_repeat=false) {
    text=text.trim();
    if(depth>MAX_DEPTH) throw Error('pattern nesting limit');
    if(text==='...') return {kind:'rest'};
    if(text==='_' ) return {kind:'any'};
    if(text.startsWith('...(') && text.endsWith(')')) {
      if(inside_repeat) throw Error('nested repetition forbidden');
      const parts=comma_parts(text.slice(4,-1));
      if(!parts.length || parts.length>MAX_REPEAT_SEGMENTS)
        throw Error('invalid repetition segment count');
      const atoms=[];
      for(const part of parts) {
        const m=/^(0|[1-9][0-9]*)\s+of\s+(.+)$/.exec(part);
        if(!m) throw Error('expected N of pattern');
        const count=Number(m[1]);
        if(!Number.isSafeInteger(count) || count>MAX_ITEMS-atoms.length)
          throw Error('repetition expansion budget exceeded');
        const base=m[2].trim();
        const atom=['int','float','bool','string','List','Array','Tuple'].includes(base)
          ?type_pattern(base):item(base,depth+1,true);
        if(['rest','repeat','bind'].includes(atom.kind))
          throw Error('repeated pattern cannot contain a rest or binder');
        for(let i=0;i<count;i++) atoms.push(atom);
      }
      return {kind:'repeat', atoms};
    }
    const bind=/^(.*?)\s+as\s+(val mut|let mut|const mut|val|let|const)\s+([a-z][a-z0-9_]*)$/.exec(text);
    if(bind) {
      if(inside_repeat) throw Error('repetition cannot capture same name repeatedly');
      const [,base,qualifier,name]=bind;
      if(base.includes(' as ')) throw Error('stacked binder');
      if(binders.has(name)) throw Error('duplicate binder');
      binders.add(name);
      const inner=item(base,depth+1);
      if(inner.kind==='rest'||inner.kind==='repeat') throw Error('cannot bind rest/repetition');
      return {kind:'bind',qualifier,name,inner};
    }
    if(/^-?(0|[1-9][0-9]*)$/.test(text)) {
      const value=Number(text);
      if(!Number.isSafeInteger(value)) throw Error('host model integer exceeds safe range');
      return {kind:'lit',value};
    }
    if(text==='true'||text==='false') return {kind:'lit',value:text==='true'};
    if(text.startsWith('"') && text.endsWith('"')) {
      const value=JSON.parse(text);
      if(typeof value!=='string') throw Error('expected string literal');
      return {kind:'lit',value};
    }
    if(text.startsWith('is Tuple[')&&text.endsWith(']')) {
      const parts=comma_parts(text.slice(9,-1));
      return {kind:'tuple-type',items:parts.map(t=>t==='_'?{kind:'any'}:type_pattern(t))};
    }
    if(text.startsWith('is ')) return type_pattern(text.slice(3).trim());
    for(const kind of ['List','Array','Tuple']) {
      const prefix=kind+'.of(';
      if(text.startsWith(prefix)&&text.endsWith(')')) {
        const raw=comma_parts(text.slice(prefix.length,-1)).map(x=>item(x,depth+1));
        const items=[];
        for(const p of raw) {
          if(p.kind==='repeat') items.push(...p.atoms);
          else items.push(p);
          if(items.length>MAX_ITEMS) throw Error('pattern expansion budget exceeded');
        }
        if(kind==='Tuple' && items.some(x=>x.kind==='rest'))
          throw Error('tuple has exact arity; bare rest forbidden');
        if(items.some((x,i)=>x.kind==='rest' && i>0 && items[i-1].kind==='rest'))
          throw Error('adjacent rest wildcards');
        return {kind:'seq',type:kind,items};
      }
    }
    throw Error('invalid pattern: '+text);
  }
  const ast=item(source);
  if(['rest','repeat'].includes(ast.kind)) throw Error('repetition needs sequence-pattern context');
  return ast;
}

function tag(value) {
  if(Array.isArray(value)) return 'List';
  if(value && (value.kind==='Array'||value.kind==='Tuple') && Array.isArray(value.items)) return value.kind;
  if(typeof value==='number') return Number.isSafeInteger(value)?'int':'float';
  if(typeof value==='string') return 'string';
  if(typeof value==='boolean') return 'bool';
  return 'other';
}

function match(pattern,value) {
  function type_ok(p,v) {
    const equal=tag(v)===p.name;
    return p.negative?!equal:equal;
  }
  function atom(p,v) {
    if(p.kind==='bind') return atom(p.inner,v);
    if(p.kind==='any') return true;
    if(p.kind==='lit') return Object.is(p.value,v);
    if(p.kind==='type') return type_ok(p,v);
    if(p.kind==='tuple-type') return tag(v)==='Tuple' &&
      p.items.length===v.items.length && p.items.every((t,i)=>t.kind==='any'||type_ok(t,v.items[i]));
    if(p.kind==='seq') return seq_match(p,v)!==null;
    return false;
  }
  function captures(p,v) {
    if(p.kind==='bind') return {...captures(p.inner,v),[p.name]:v};
    if(p.kind==='seq') return seq_match(p,v)??{};
    return {};
  }
  function seq_match(p,v) {
    if(tag(v)!==p.type) return null;
    const values=p.type==='List'?v:v.items;
    if(values.length>MAX_VALUES) throw Error('sequence match budget exceeded');
    const ps=p.items, n=values.length,m=ps.length;
    if((n+1)*(m+1)>MAX_STATES) throw Error('matcher DP budget exceeded');
    const table=Array.from({length:m+1},()=>new Uint8Array(n+1));
    table[m][n]=1;
    for(let i=m-1;i>=0;i--) for(let j=n;j>=0;j--) {
      if(ps[i].kind==='rest')
        table[i][j]=table[i+1][j] || (j<n && table[i][j+1]) ? 1:0;
      else table[i][j]=j<n && atom(ps[i],values[j]) && table[i+1][j+1] ? 1:0;
    }
    if(!table[0][0]) return null;
    const bindings={};
    let i=0,j=0;
    while(i<m) {
      if(ps[i].kind==='rest') {
        if(table[i+1][j]) i++; // leftmost-shortest
        else j++;
      } else {
        Object.assign(bindings,captures(ps[i],values[j]));
        i++;j++;
      }
    }
    return bindings;
  }
  if(!atom(pattern,value)) return {matched:false,bindings:{}};
  return {matched:true,bindings:captures(pattern,value)};
}

test('bare rests match prefix, suffix, infix, zero-length and exact arity',()=>{
  const cases=[
    ['List.of(1, ...)',[1],true],['List.of(1, ...)',[0,1],false],
    ['List.of(..., 3)',[0,3],true],['List.of(..., 3)',[3],true],
    ['List.of(..., 2, ...)',[1,2,3],true],['List.of(..., 2, ...)',[1,3],false],
    ['List.of(..., 5, 3, 2, ...)',[8,5,3,2,9],true],
    ['List.of(..., 5, 3, 2, ...)',[8,5,7,3,2],false],
    ['List.of(..., 5, 3, 2, ...)',[5,3,2],true],
    ['List.of(..., 3, ..., 3)',[3],false],
    ['List.of(..., 3, ..., 3)',[3,2,3],true],
    ['Tuple.of(1)',tuple(1),true],['Tuple.of(1)',[1],false],
    ['Tuple.of(1, _)',tuple(1,2),true],['Tuple.of(1, _)',tuple(1),false],
    ['Array.of(1, ..., 9)',array(1,2,3,9),true],
    ['List.of()',[],true],['Array.of()',array(),true]
  ];
  for(const [src,value,expected] of cases)
    assert.equal(match(parse(src),value).matched,expected,src);
});

test('counted typed segments are contiguous, anchored, and do not imply search',()=>{
  const cases=[
    ['Array.of(...(3 of int, 3 of bool))',array(1,2,3,true,false,true),true],
    ['Array.of(...(3 of int, 3 of bool))',array(1,2,3,true,false),false],
    ['Array.of(...(3 of int, 3 of bool))',array(true,1,2,3,true,false,true),false],
    ['List.of(..., ...(3 of int), ...)',[false,1,2,3,'end'],true],
    ['List.of(..., ...(3 of int), ...)',[1,false,2,3],false],
    ['Tuple.of(...(2 of int), is bool)',tuple(1,2,true),true],
    ['Tuple.of(...(2 of int), is bool)',tuple(1,true,2),false],
    ['List.of(...(0 of int), 9)',[9],true],
    ['List.of(...(3 of 7))',[7,7,7],true],
    ['List.of(...(3 of 7))',[7,8,7],false]
  ];
  for(const [src,value,expected] of cases)
    assert.equal(match(parse(src),value).matched,expected,src);
});

test('literal equality differs from type checks and bool is not int',()=>{
  assert.equal(match(parse('List.of(7)'),[7]).matched,true);
  assert.equal(match(parse('List.of(7)'),[8]).matched,false);
  assert.equal(match(parse('List.of(is int)'),[8]).matched,true);
  assert.equal(match(parse('List.of(is int)'),[true]).matched,false);
  assert.equal(match(parse('List.of(is !int)'),[true]).matched,true);
  assert.equal(match(parse('is Tuple[!int]'),tuple('a')).matched,true);
  assert.equal(match(parse('is Tuple[!int]'),tuple(4)).matched,false);
});

test('leftmost-shortest bindings; anchored suffix and once-only guard',()=>{
  const p=parse('List.of(is int as val y, ..., is int as val a, is int as val b, is int as val c, ..., is int as val x)');
  assert.deepEqual(match(p,[9,'skip',1,2,3,8,7]).bindings,{y:9,a:1,b:2,c:3,x:7});
  assert.equal(match(p,[9,1,2,3]).matched,false);
  const q=parse('List.of(..., is int as val x, ...)');
  assert.deepEqual(match(q,[1,8]).bindings,{x:1});
  let evaluations=0;
  function guarded_arm_then_fallback(value) {
    const candidate=match(q,value);
    if(candidate.matched && (++evaluations, candidate.bindings.x>5)) return 'guarded';
    return 'fallback';
  }
  assert.equal(guarded_arm_then_fallback([1,8]),'fallback');
  assert.equal(evaluations,1);
  assert.equal(guarded_arm_then_fallback([8,1]),'guarded');
  assert.equal(evaluations,2);
});

test('invalid legacy, ambiguous, over-budget, and out-of-context patterns fail closed',()=>{
  for(const source of [
    'List.of(..._, 1)','List.of(_..., 1)','List.of(..._)','List.of(_...)',
    'List.of(..., ..., 1)','List.of(1, ..._, ...)',
    'List.of(...(int)...)','List.of(...(3 of int)...)','List.of(...(int))',
    'List.of(...(3 of))','List.of(...(3 int))','List.of(...(-1 of int))',
    'List.of(...(1.5 of int))','List.of(...(1..3 of int))',
    'List.of(...(1 of ...))','List.of(...(1 of 1 as val x))',
    'List.of(...(1 of ...(1 of int)))','List.of(...(1000000 of int))',
    'List.of(5 as val x, 6 as val x)', 'List.of(5 as x)',
    'List.of(5,,2)','List.of(5,)','Tuple.of(..., 1)',
    '...','...(3 of int)', 'List.of(is Imaginary)',
    'List.of(is int as val x as val y)',
  ]) assert.throws(()=>parse(source),undefined,source);
});

test('many rests use bounded nonrecursive DP and retain distinct occurrences',()=>{
  const src='List.of('+Array.from({length:20},()=> '..., 3').join(', ')+', ...)';
  assert.equal(match(parse(src),Array(240).fill(3)).matched,true);
  assert.equal(match(parse(src),Array(240).fill(2)).matched,false);
  assert.throws(()=>match(parse('List.of(...)'),Array(257).fill(1)),/budget/);
  assert.throws(()=>parse('List.of('+Array(129).fill('1').join(',')+')'),/too many/);
  assert.throws(()=>parse('List.of(...(129 of int))'),/budget/);
});

test('nested sequences match without treating Array and List interchangeably',()=>{
  const p=parse('List.of(Array.of(...(2 of int)), Tuple.of(3, is bool))');
  assert.equal(match(p,[array(1,2),tuple(3,false)]).matched,true);
  assert.equal(match(p,[[1,2],tuple(3,false)]).matched,false);
  assert.equal(match(p,[array(1,2,3),tuple(3,false)]).matched,false);
});
