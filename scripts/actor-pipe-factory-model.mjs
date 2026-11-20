// Source-free graph shape reference. No AttoLang parser, actor runtime or authority.
const encoder = new TextEncoder();

function ownValue(object, field) {
  if (typeof object !== "object" || object === null)
    throw new TypeError("actor factory metadata must be plain data");
  const property = Object.getOwnPropertyDescriptor(object, field);
  if (!property || !Object.hasOwn(property, "value"))
    throw new TypeError("actor factory requires own data fields");
  return property.value;
}
function name(value, optional = false) {
  if (typeof value !== "string" || (!optional && !value) || value.includes("\0"))
    throw new TypeError("invalid actor factory name");
  if (value.length > 256)
    throw new RangeError("actor factory name byte budget");
  for (let i = 0; i < value.length; i++) {
    const u = value.charCodeAt(i);
    if (u >= 0xd800 && u <= 0xdbff) {
      if (++i >= value.length || value.charCodeAt(i) < 0xdc00 ||
          value.charCodeAt(i) > 0xdfff)
        throw new TypeError("invalid actor factory Unicode");
    } else if (u >= 0xdc00 && u <= 0xdfff) {
      throw new TypeError("invalid actor factory Unicode");
    }
  }
  if (encoder.encode(value).length > 256)
    throw new RangeError("actor factory name byte budget");
}
function stage(input) {
  const value = Object.freeze({
    id:ownValue(input,"id"),
    actor_type:ownValue(input,"actor_type"),
    role:ownValue(input,"role"),
    inbound:ownValue(input,"inbound"),
    outbound:ownValue(input,"outbound")
  });
  for (const field of ["id","actor_type"]) name(value[field]);
  for (const field of ["inbound","outbound"]) name(value[field], true);
  const hasIn = !!value.inbound, hasOut = !!value.outbound;
  if (!((value.role === "readable" && !hasIn && hasOut) ||
        (value.role === "writable" && hasIn && !hasOut) ||
        ((value.role === "transform" || value.role === "duplex") && hasIn && hasOut)))
    throw new TypeError("invalid stage role");
  return value;
}
export function connectShape(left, right) {
  const a = stage(left), b = stage(right);
  if (a.id === b.id || !a.outbound || !b.inbound || a.outbound !== b.inbound)
    throw new TypeError("incompatible pipe ports");
  return Object.freeze({source:a.id, target:b.id, payload:a.outbound});
}
export function pipeShape(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 2 || inputs.length > 1024)
    throw new RangeError("actor factory stage count");
  const stages = new Array(inputs.length);
  const seen = new Set();
  for (let i = 0; i < inputs.length; i++) {
    const entry = stage(ownValue(inputs, String(i)));
    if (seen.has(entry.id)) throw new TypeError("duplicate stage instance");
    seen.add(entry.id);
    stages[i] = entry;
  }
  const edges = new Array(stages.length - 1);
  for (let i = 0; i < stages.length - 1; i++)
    edges[i] = connectShape(stages[i], stages[i + 1]);
  if (stages[0].role !== "readable" ||
      stages[stages.length - 1].role !== "writable")
    throw new TypeError("linear factory requires source and sink");
  return Object.freeze({
    stages:Object.freeze(stages),
    edges:Object.freeze(edges)
  });
}
