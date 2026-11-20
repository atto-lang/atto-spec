// Source-free topology/policy model: never count as compiled AttoLang guest evidence.

function validateHierarchy(tree) {
  const fail = code => { throw new Error(code); };
  if (!tree || !Array.isArray(tree.nodes) || tree.nodes.length < 1 || tree.nodes.length > 2048) fail("invalid node count");
  const byId = new Map();
  const childMap = new Map();
  let root = null;
  for (const node of tree.nodes) {
    if (!node || typeof node.id !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(node.id) || byId.has(node.id)) fail("duplicate/invalid identity");
    if (node.kind !== "supervisor" && node.kind !== "actor") fail("invalid kind");
    if (typeof node.tenant !== "string" || !node.tenant) fail("missing tenant");
    if (node.parent === null) {
      if (root || node.kind !== "supervisor") fail("multiple/invalid roots");
      root = node;
      if (node.order !== undefined || node.restart !== undefined) fail("root child fields");
    } else {
      if (typeof node.parent !== "string" || !Number.isSafeInteger(node.order) || node.order < 0 || node.order > 4095) fail("invalid parent/order");
      if (!["permanent","transient","temporary"].includes(node.restart)) fail("invalid restart");
      if (!childMap.has(node.parent)) childMap.set(node.parent, []);
      childMap.get(node.parent).push(node);
    }
    if (node.kind === "supervisor") {
      const p = node.policy;
      if (!p || !["one_for_one","one_for_all","rest_for_one"].includes(p.strategy)
          || !Number.isSafeInteger(p.max_restarts) || p.max_restarts < 0 || p.max_restarts > 100000
          || !Number.isSafeInteger(p.window_ms) || p.window_ms < 1) fail("invalid supervisor policy");
    } else if (node.policy !== undefined) fail("actor has supervisor policy");
    byId.set(node.id, node);
  }
  if (!root) fail("no root supervisor");
  for (const node of tree.nodes) {
    if (node.parent === null) continue;
    const parent = byId.get(node.parent);
    if (!parent || parent.kind !== "supervisor" || parent.tenant !== node.tenant) fail("invalid owner/tenant");
    const siblings = childMap.get(node.parent);
    if (siblings.length > 512 || siblings.some(other => other !== node && other.order === node.order)) fail("capacity/duplicate order");
    const visited = new Set([node.id]);
    let cursor = node;
    let depth = 0;
    while (cursor.parent !== null) {
      if (++depth > 32 || visited.has(cursor.parent)) fail("cycle/depth");
      visited.add(cursor.parent);
      cursor = byId.get(cursor.parent);
      if (!cursor) fail("orphan");
    }
    if (cursor.id !== root.id) fail("disconnected");
  }
  return { root, byId, childMap };
}

function restartTargets(tree, childId, abnormal = true) {
  const { byId, childMap } = validateHierarchy(tree);
  const child = byId.get(childId);
  if (!child || child.parent === null) throw new Error("not a direct child");
  const parent = byId.get(child.parent);
  if (child.restart === "temporary" || (!abnormal && child.restart === "transient")) return [];
  const siblings = [...(childMap.get(parent.id) || [])].sort((a,b)=>a.order-b.order);
  let selected;
  if (parent.policy.strategy === "one_for_one") selected = [child];
  else if (parent.policy.strategy === "one_for_all") selected = siblings;
  else selected = siblings.filter(x => x.order >= child.order);
  return selected.filter(x => x.restart !== "temporary").map(x => x.id);
}

function shutdownOrder(tree) {
  const { root, childMap } = validateHierarchy(tree);
  const ordered = [];
  function descend(node) {
    const children = [...(childMap.get(node.id) || [])].sort((a,b)=>b.order-a.order);
    for (const child of children) descend(child);
    ordered.push(node.id);
  }
  descend(root);
  return ordered;
}

export { validateHierarchy, restartTargets, shutdownOrder };

