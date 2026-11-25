// Source-free reference model ONLY. Not an AttoLang parser or backend.
export class BindingError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new BindingError(code); };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isOption = t => t.startsWith("Option<") && t.endsWith(">");

export function normalize(formals) {
  if (!Array.isArray(formals)) fail("invalid_formals");
  const seen = new Set();
  return formals.map(p => {
    if (!p || typeof p.name !== "string" || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(p.name) || seen.has(p.name)) fail("duplicate_or_invalid_formal");
    seen.add(p.name);
    if (typeof p.type !== "string" || !p.type.trim() || p.type !== p.type.trim() || p.type.endsWith("??")) fail("invalid_type");
    const t = p.type.endsWith("?") ? "Option<" + p.type.slice(0, -1) + ">" : p.type;
    const omittable = p.omittable === true;
    if (omittable && (p.mutable || p.borrow || p.structural || p.rest)) fail("unsupported_omittable_formal");
    if (own(p, "default") && !omittable) fail("default_requires_omittable");
    if (own(p, "default") && p.defaultKind !== "constant") fail("unproved_default");
    if (own(p, "default") && p.defaultType !== t && !(p.default === "None" && isOption(t))) fail("default_type_mismatch");
    if (omittable && !isOption(t) && !own(p, "default")) fail("missing_nonoption_default");
    return Object.freeze({name:p.name, type:t, omittable, defaultValue:own(p,"default") ? p.default : undefined, defaultKind:own(p,"default") ? "explicit" : isOption(t) && omittable ? "typed_none" : null, rest:!!p.rest});
  });
}

export function bind(formals, items) {
  const params = normalize(formals);
  if (!Array.isArray(items)) fail("invalid_items");
  const occupied = Array(params.length).fill(null);
  const provenance = [];
  const evaluated = [];
  let afterNamed = false;
  let nextPositional = 0;
  items.forEach((item, rawIndex) => {
    if (!item || !["value","omit"].includes(item.kind) || item.spread) fail("malformed_item");
    if (item.kind === "omit" && (own(item,"expression") || own(item,"valueType"))) fail("omission_has_expression");
    if (item.kind === "value" && (typeof item.expression !== "string" || !item.expression.trim())) fail("missing_expression");
    let formalIndex;
    if (own(item,"label")) {
      if (typeof item.label !== "string" || !item.label) fail("malformed_label");
      afterNamed = true;
      formalIndex = params.findIndex(p=>p.name===item.label);
      if (formalIndex < 0) fail("unknown_label");
    } else {
      if (afterNamed) fail("positional_after_named");
      formalIndex = nextPositional++;
      if (formalIndex >= params.length) fail("too_many_arguments");
    }
    if (occupied[formalIndex] !== null) fail("duplicate_binding");
    const p = params[formalIndex];
    if (item.kind === "omit" && !p.omittable) fail("omit_required");
    if (item.kind === "value" && own(item,"valueType") && item.valueType !== p.type && !(item.valueType==="None" && isOption(p.type))) fail("wrong_type");
    const origin = Object.freeze({rawIndex, formalIndex, kind:item.kind});
    provenance.push(origin);
    occupied[formalIndex] = origin;
    if (item.kind === "value") evaluated.push(origin);
  });
  const slots = params.map((p,i)=>{
    const source = occupied[i];
    if (!source && !p.omittable) fail("missing_required");
    if (source?.kind === "value") return "value@" + source.rawIndex;
    if (source?.kind === "omit") return "omit@" + source.rawIndex + ":" + p.defaultKind;
    return "absent:" + p.defaultKind;
  });
  return Object.freeze({
    types:params.map(p=>p.type),
    slots, provenance, 
    evaluatedCallItemIndices:evaluated.map(p=>p.rawIndex),
    evaluatedFormalIndices:evaluated.map(p=>p.formalIndex),
    omittedCallItemIndices:provenance.filter(p=>p.kind==="omit").map(p=>p.rawIndex)
  });
}

// Conservative shape-only overlap. Nominal overload distinctions require
// the real type resolver, not these labels and intervals.
export function arityIntervalsOverlap(a,b) {
  const pa=normalize(a), pb=normalize(b);
  const amin=pa.filter(p=>!p.omittable).length;
  const bmin=pb.filter(p=>!p.omittable).length;
  return Math.max(amin,bmin) <= Math.min(pa.length,pb.length);
}
