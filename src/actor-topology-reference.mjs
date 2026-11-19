// HOST-ONLY reference model for the actor-self-organization-v1 contract.
// This is NOT a guest runtime, secure capability implementation, or source lowering.
const keyOf = (tenant, graph, type, purpose, key) =>
  JSON.stringify([tenant, graph, type, purpose, key]);

export class TopologyModel {
  #actors = new Map();
  #reservations = new Set();
  #grants = new WeakSet();
  #edges = new Map();
  #revision = 0;
  #next = 1;
  #observations = new Map();
  constructor({maxActors=32, maxEdges=64, maxChildren=8}={}) {
    if (![maxActors, maxEdges, maxChildren].every(n => Number.isSafeInteger(n) && n > 0))
      throw new RangeError('invalid topology budget');
    this.maxActors=maxActors;
    this.maxEdges=maxEdges;
    this.maxChildren=maxChildren;
  }
  get revision() { return this.#revision; }
  get count() { return this.#actors.size; }
  // The host creates a trusted root. A caller cannot create one by supplying an ID.
  seed({tenant, graph, type, purpose, key, generation=1, parent=null, input=null, output=null}) {
    const id = keyOf(tenant, graph, type, purpose, key);
    if (this.#actors.has(id) || generation < 1) throw new Error('duplicate or invalid actor');
    const actor = Object.freeze({
      id, tenant, graph, type, purpose, key, generation, parent,
      input, output, address: this.#next++
    });
    this.#actors.set(id, actor);
    return actor;
  }
  grant(actor, {actions, types, purposes}={}) {
    if (!this.#alive(actor)) throw new Error('stale owner');
    const cap = Object.freeze({
      actor, actions:new Set(actions || []), types:new Set(types || []),
      purposes:new Set(purposes || []), issuedRevision:this.#revision
    });
    this.#grants.add(cap);
    return cap;
  }
  revoke(cap) { this.#grants.delete(cap); }
  #alive(ref) {
    return !!ref && this.#actors.get(ref.id) === ref;
  }
  #check(cap, action, type, purpose) {
    if (!cap || !this.#grants.has(cap) || !this.#alive(cap.actor) ||
        !cap.actions.has(action) ||
        (type !== undefined && !cap.types.has(type)) ||
        (purpose !== undefined && !cap.purposes.has(purpose)))
      throw new Error('DENIED');
  }
  find(cap, {type, purpose, key}) {
    this.#check(cap, 'find', type, purpose);
    const id=keyOf(cap.actor.tenant,cap.actor.graph,type,purpose,key);
    return this.#actors.get(id) ?? null;
  }
  children(cap,{type,purpose}) {
    this.#check(cap,'find',type,purpose);
    return [...this.#actors.values()].filter(a=>a.parent === cap.actor.id &&
      a.type === type && a.purpose === purpose);
  }
  async ensureChildren(cap,{type,purpose,count}, factory) {
    this.#check(cap, 'create', type, purpose);
    if (!Number.isSafeInteger(count) || count < 1 || count > this.maxChildren)
      throw new Error('QUOTA');
    const slots=Array.from({length:count},(_,i)=>keyOf(
      cap.actor.tenant,cap.actor.graph,type,purpose,cap.actor.id + '/slot/' + i));
    if (slots.some(s=>this.#reservations.has(s))) throw new Error('BUSY');
    const prior=slots.map(s=>this.#actors.get(s) ?? null);
    if (prior.some(a=>a !== null && a.parent !== cap.actor.id)) throw new Error('OWNER');
    const missing=slots.filter((_,i)=>!prior[i]);
    if (this.#actors.size + missing.length > this.maxActors) throw new Error('QUOTA');
    missing.forEach(s=>this.#reservations.add(s));
    const staged=[];
    try {
      for(const id of missing) {
        // No trusted factory runs while the directory's synchronous reservation is held.
        const constructed=await factory(id);
        if (!constructed || typeof constructed.stop !== 'function')
          throw new Error('FACTORY');
        staged.push({id, constructed});
      }
      this.#check(cap, 'create', type, purpose);
      if (slots.some((s,i)=>this.#actors.get(s) !== prior[i]))
        throw new Error('CONFLICT');
      for (const {id} of staged) {
        const actor=Object.freeze({
          id, tenant:cap.actor.tenant, graph:cap.actor.graph,
          type, purpose, key:id, generation:1,
          parent:cap.actor.id, input:null, output:null, address:this.#next++
        });
        this.#actors.set(id,actor);
      }
      if (staged.length) this.#revision++;
      return slots.map(s=>this.#actors.get(s));
    } catch(err) {
      // A real runtime MUST await physical finalization; a JS model cannot prove it.
      for(const {constructed} of staged.reverse()) await constructed.stop();
      throw err;
    } finally {
      missing.forEach(s=>this.#reservations.delete(s));
    }
  }
  connect(cap,from,to,{payload,expectedRevision}) {
    this.#check(cap,'connect');
    if (expectedRevision !== this.#revision) throw new Error('STALE_GRAPH');
    if (!this.#alive(from) || !this.#alive(to)) throw new Error('STALE_ACTOR');
    if (from.tenant !== cap.actor.tenant || to.tenant !== cap.actor.tenant ||
        from.graph !== cap.actor.graph || to.graph !== cap.actor.graph) throw new Error('DENIED');
    if (from.output !== payload || to.input !== payload) throw new Error('TYPE');
    const edge=JSON.stringify([from.id,from.generation,to.id,to.generation]);
    if (this.#edges.has(edge)) throw new Error('DUPLICATE');
    if (this.#edges.size >= this.maxEdges) throw new Error('QUOTA');
    if (from === to || this.#reachable(to.id,from.id)) throw new Error('CYCLE');
    this.#edges.set(edge,Object.freeze({from,to,payload}));
    this.#revision++;
    return this.#revision;
  }
  #reachable(start,target) {
    const seen=new Set(), queue=[start];
    while(queue.length) {
      const node=queue.shift();
      if (node === target) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      for(const e of this.#edges.values()) if(e.from.id===node) queue.push(e.to.id);
    }
    return false;
  }
  upstream(cap,ref) {
    this.#check(cap,'find');
    if (!this.#alive(ref) || ref.tenant !== cap.actor.tenant ||
        ref.graph !== cap.actor.graph) throw new Error('DENIED');
    return [...this.#edges.values()].filter(e=>e.to===ref).map(e=>e.from);
  }
  retire(ref) {
    if(!this.#alive(ref)) return false;
    this.#actors.delete(ref.id);
    for(const [id,e] of this.#edges) if(e.from===ref || e.to===ref) this.#edges.delete(id);
    this.#revision++;
    return true;
  }
  observe(cap,{capacity=4}={}) {
    this.#check(cap,'observe');
    if (!Number.isSafeInteger(capacity) || capacity<1 || capacity>64) throw new Error('QUOTA');
    const s={tenant:cap.actor.tenant,graph:cap.actor.graph,events:[],loss:0,capacity};
    this.#observations.set(s,s);
    return Object.freeze({read:()=>s.events.shift()??null,loss:()=>s.loss,
      close:()=>this.#observations.delete(s)});
  }
  emitObservation({tenant,graph,kind,actorGeneration}) {
    // No guest objects or mutable actor state are ever placed on this lane.
    const receipt=Object.freeze({tenant,graph,kind,actorGeneration});
    for(const s of this.#observations.keys()) {
      if(s.tenant!==tenant || s.graph!==graph) continue;
      if(s.events.length>=s.capacity) s.loss++;
      else s.events.push(receipt);
    }
  }
}
