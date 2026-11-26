// HOST ONLY: deterministic counted-select state machine, no guest callbacks.
export class CountedSelect {
  constructor(count, sources, { max = 1024, generation = 1, policy = 'fair' } = {}) {
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(max) || max < count)
      throw new RangeError('SelectCountInvalid');
    if (!['fair', 'first'].includes(policy)) throw new Error('unsupported oracle policy');
    if (count && (!sources.length || sources.some(s => !['channel','future'].includes(s.kind))))
      throw new Error('unsupported counted source');
    this.count = count;
    this.sources = count ? sources.map(s => ({ ...s, identity: s.identity ?? Symbol() })) : [];
    this.generation = generation;
    this.policy = policy;
    this.cursor = 0;
    this.round = 0;
    this.active = null;
    this.retired = new Set();
    this.values = [];
    this.dropped = [];
    this.commits = [];
    this.state = count ? 'waiting' : 'success';
    this.stop = null;
  }
  choose(ready, generation = this.generation, round = this.round) {
    if (this.state !== 'waiting' || generation !== this.generation || round !== this.round) return null;
    const n = this.sources.length;
    const start = this.policy === 'first' ? 0 : this.cursor;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const s = this.sources[i];
      if (this.retired.has(s.identity) || !ready.includes(i)) continue;
      this.active = { index: i, generation, round };
      this.state = 'running';
      this.commits.push(i);
      this.cursor = (i + 1) % n;
      if (s.kind === 'future') this.retired.add(s.identity);
      return this.active;
    }
    return null;
  }
  // A finish event represents completed arm AND cleanup. No next-round
  // admission or terminal publication can precede this event.
  finish(ticket, value, error = null) {
    if (this.state !== 'running' || ticket !== this.active) return false;
    this.active = null;
    if (this.stop || error !== null) {
      if (error === null) this.dropped.push(value);
      this.terminate(this.stop || 'failed');
      return true;
    }
    this.values.push(value);
    this.round++;
    this.state = this.values.length === this.count ? 'success' : 'waiting';
    return true;
  }
  terminate(state) {
    this.dropped.push(...this.values);
    this.values = [];
    this.state = state;
  }
  cancel() {
    if (this.state === 'running') { this.stop = 'cancelled'; return true; }
    if (this.state !== 'waiting') return false;
    this.terminate('cancelled');
    return true;
  }
  exhaust() {
    if (this.state !== 'waiting') return false;
    this.terminate('exhausted');
    return true;
  }
  result() { return this.state === 'success' ? this.values.slice() : null; }
}
