// Host-only reference conformance for language/sequence-pattern-matching-v1.md.
// This is NOT the AttoLang compiler, parser, or guest runtime.
import test from 'node:test';
import assert from 'node:assert/strict';

const tuple = (...items) => ({kind: 'Tuple', items});
const MAX_ITEMS = 64;
const MAX_VALUES = 256;
const MAX_DEPTH = 8;

function comma_parts(src) {
  if (src.trim() === '') return [];
  const parts = [];
  let start = 0, square = 0, round = 0, quoted = false, escaped = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[') square++;
    else if (c === ']') square--;
    else if (c === '(') round++;
    else if (c === ')') round--;
    else if (c === ',' && !square && !round) {
      parts.push(src.slice(start, i).trim());
      start = i + 1;
    }
    if (square < 0 || round < 0) throw Error('unbalanced pattern delimiters');
  }
  if (quoted || square || round) throw Error('unbalanced pattern delimiters');
  parts.push(src.slice(start).trim());
  if (parts.some(p => !p)) throw Error('empty pattern item');
  if (parts.length > MAX_ITEMS) throw Error('too many pattern items');
  return parts;
}

function type_name(s) {
  const negative = s.startsWith('!');
  const name = negative ? s.slice(1) : s;
  if (!['int','float','bool','string','List','Tuple'].includes(name))
    throw Error('unsupported type name');
  return {kind:'type', name, negative};
}

function parse(source) {
  if (source.length > 4096) throw Error('pattern source too large');
  const bindings = new Set();
  function item(s, depth = 0) {
    s = s.trim();
    if (depth > MAX_DEPTH) throw Error('pattern nesting limit');
    const binder = /^(.*?)\s+as\s+(val mut|let mut|const mut|val|let|const)\s+([a-z][a-z0-9_]*)$/.exec(s);
    if (binder) {
      const [, base, qualifier, name] = binder;
      if (bindings.has(name)) throw Error('duplicate pattern binder');
      bindings.add(name);
      return {kind:'bind', qualifier, name, inner:item(base,depth+1)};
    }
    if (s === '_') return {kind:'any'};
    if (s === '..._' || s === '_...') return {kind:'rest', spelling:s};
    if (/^-?(0|[1-9][0-9]*)$/.test(s)) return {kind:'lit', value:Number(s)};
    if (s === 'true' || s === 'false') return {kind:'lit',value:s==='true'};
    if (s.startsWith('"') && s.endsWith('"')) {
      const v = JSON.parse(s);
      if (typeof v !== 'string') throw Error('expected string literal');
      return {kind:'lit',value:v};
    }
    if (s.startsWith('is Tuple[') && s.endsWith(']')) {
      const sub = comma_parts(s.slice(9,-1)).map(t => t==='_' ? {kind:'any'} : type_name(t));
      return {kind:'tuple-type', items:sub};
    }
    if (s.startsWith('is ')) return type_name(s.slice(3).trim());
    for (const kind of ['List','Tuple']) {
      const prefix = kind+'.of(';
      if (s.startsWith(prefix) && s.endsWith(')')) {
        const items = comma_parts(s.slice(prefix.length,-1)).map(p=>item(p,depth+1));
        for (let i=0;i<items.length;i++) {
          const p=items[i];
          if (p.kind!=='rest') continue;
          if (kind==='Tuple') throw Error('tuple rest patterns unsupported in v1');
          if (p.spelling==='_...' && i!==items.length-1) throw Error('suffix rest must be last');
          if (i && items[i-1].kind==='rest') throw Error('adjacent rest wildcards');
        }
        return {kind:'seq',type:kind,items};
      }
    }
    throw Error('invalid pattern: '+s);
  }
  const result=item(source);
  if (result.kind==='rest') throw Error('rest requires a List pattern');
  return result;
}

function tag(value) {
  if (Array.isArray(value)) return 'List';
  if (value && value.kind==='Tuple' && Array.isArray(value.items)) return 'Tuple';
  if (typeof value==='number') return Number.isInteger(value) ? 'int' : 'float';
  if (typeof value==='boolean') return 'bool';
  if (typeof value==='string') return 'string';
  return 'other';
}

function match(pattern, value) {
  function type_ok(t,v) {
    const hit=tag(v)===t.name;
    return t.negative ? !hit : hit;
  }
  function seq_match(p,v) {
    if (tag(v)!==p.type) return null;
    const values=p.type==='List' ? v : v.items;
    if (values.length>MAX_VALUES) throw Error('sequence match budget exceeded');
    const ps=p.items;
    const memo=new Map();
    function feasible(i,j) {
      const key=i+':'+j;
      if (memo.has(key)) return memo.get(key);
      let ok;
      if (i===ps.length) ok=j===values.length;
      else if (ps[i].kind==='rest')
        ok=feasible(i+1,j) || (j<values.length && feasible(i,j+1));
      else ok=j<values.length && atom(ps[i],values[j]) && feasible(i+1,j+1);
      memo.set(key,ok);
      return ok;
    }
    if (!feasible(0,0)) return null;
    const bindings={};
    let i=0,j=0;
    while (i<ps.length) {
      if (ps[i].kind==='rest') {
        // Choose zero items whenever the remainder can still match.
        if (feasible(i+1,j)) i++;
        else j++;
      } else {
        Object.assign(bindings, captures(ps[i],values[j]));
        i++;j++;
      }
    }
    return bindings;
  }
  function atom(p,v) {
    if (p.kind==='bind') return atom(p.inner,v);
    if (p.kind==='any') return true;
    if (p.kind==='lit') return Object.is(p.value,v);
    if (p.kind==='type') return type_ok(p,v);
    if (p.kind==='tuple-type') return tag(v)==='Tuple' &&
      p.items.length===v.items.length &&
      p.items.every((t,i)=>t.kind==='any' || type_ok(t,v.items[i]));
    if (p.kind==='seq') return seq_match(p,v)!==null;
    return false;
  }
  function captures(p,v) {
    if (p.kind==='bind') return {...captures(p.inner,v), [p.name]:v};
    if (p.kind==='seq') return seq_match(p,v) ?? {};
    return {};
  }
  if (!atom(pattern,value)) return {matched:false,bindings:{}};
  return {matched:true,bindings:captures(pattern,value)};
}

test('contiguity, zero-length rest, and exact tuple/list length',()=>{
  const examples=[
    ['List.of(..._, 5, 3, 2, _...)',[8,5,3,2,9],true],
    ['List.of(..._, 5, 3, 2, _...)',[8,5,7,3,2],false],
    ['List.of(..._, 5, 3, 2, _...)',[5,3,2],true],
    ['List.of(5, _, 2)',[5,8,2],true],
    ['List.of(5, _, 2)',[5,2],false],
    ['List.of(5, 3, 2)',[5,3,2,0],false],
    ['List.of(..._, 3, ..._, 3)',[3],false],
    ['List.of(..._, 3, ..._, 3)',[3,2,3],true],
    ['Tuple.of(1)',tuple(1),true],
    ['Tuple.of(1)',[1],false],
    ['is Tuple[!int]',tuple('a'),true],
    ['is Tuple[!int]',tuple(7),false],
    ['is Tuple[!int]',tuple('a','b'),false],
    ['List.of()',[],true],
    ['List.of()',[1],false],
  ];
  for (const [pattern,value,expected] of examples)
    assert.equal(match(parse(pattern),value).matched,expected,pattern);
});

test('explicit binds and deterministic leftmost-shortest witness',()=>{
  const p=parse('List.of(..._, is int as val x, is int as val y, is int as val z, _...)');
  assert.deepEqual(match(p,['a',2,3,4,9]).bindings,{x:2,y:3,z:4});
  const q=parse('List.of(..._, 5 as val x, 3 as val y, 2 as val z, _...)');
  assert.deepEqual(match(q,[8,5,3,2,9]).bindings,{x:5,y:3,z:2});
  assert.deepEqual(match(parse('List.of(..._, is !int as let x, _...)'),[8,'a',2]).bindings,{x:'a'});
});

test('malformed patterns rejected instead of guessed',()=>{
  for (const source of [
    'List.of(..., 5)','List.of(... _,5)','List.of(5, _ ...)',
    'List.of(5, _..., 2)','List.of(..._, ..._, 5)',
    'Tuple.of(..._, 5)','List.of(5 as x)','List.of(x as 5)',
    'List.of(5 as val x, 3 as val x)','List.of(is Unknown)',
    'is Tuple[!imaginary]','List.of(5,,2)', 'List.of(5,)',
    'List.of(is int as val x as val y)',
  ]) assert.throws(()=>parse(source),undefined,source);
});

test('many rests are bounded and do not need exponential backtracking',()=>{
  const p=parse('List.of('+Array.from({length:20},()=> '..._, 3').join(', ')+', _...)');
  assert.equal(match(p,Array(240).fill(3)).matched,true);
  assert.equal(match(p,Array(240).fill(2)).matched,false);
  assert.throws(()=>match(parse('List.of(_...)'),Array(257).fill(1)),/budget/);
  assert.throws(()=>parse('List.of('+Array(65).fill('1').join(',')+')'),/too many/);
});
