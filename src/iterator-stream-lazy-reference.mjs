// SOURCE-FREE reference oracle only. This is not an AttoLang compiler or runtime.
export const done = Object.freeze({kind: 'done'});
export const yielded = value => ({kind: 'yielded', value});
const requireResult = result => {
  if (!result || (result.kind !== 'done' && result.kind !== 'yielded'))
    throw new Error('InvalidIteratorResult');
  return result;
};
const requireBound = value => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('InvalidBound');
  return value;
};

export class PullCursor {
  constructor(pull, close = () => {}) {
    this.pull = pull;
    this.cleanup = close;
    this.state = 'OPEN';
    this.failure = null;
    this.closeCount = 0;
  }
  next() {
    if (this.state === 'CLOSED' || this.state === 'DONE') return done;
    if (this.failure) throw this.failure;
    try {
      const item = requireResult(this.pull());
      if (item.kind === 'done') this.state = 'DONE';
      return item;
    } catch (error) { this.failure = error; throw error; }
  }
  close() {
    if (this.state === 'CLOSED') return;
    this.state = 'CLOSED';
    this.closeCount++;
    this.cleanup();
  }
  map(callback) {
    return new PullCursor(() => {
      const item = this.next();
      return item.kind === 'yielded' ? yielded(callback(item.value)) : done;
    }, () => this.close());
  }
  filter(predicate, cooperate = () => {}) {
    return new PullCursor(() => {
      while (true) {
        const item = this.next();
        if (item.kind === 'done') return done;
        cooperate();
        if (predicate(item.value)) return item;
      }
    }, () => this.close());
  }
  take(count) {
    let remaining = requireBound(count);
    return new PullCursor(() => {
      if (remaining === 0) { this.close(); return done; }
      const item = this.next();
      if (item.kind === 'done') return done;
      remaining--;
      if (remaining === 0) this.close();
      return item;
    }, () => this.close());
  }
  fold(seed, reducer) {
    let acc = seed;
    try {
      while (true) {
        const item = this.next();
        if (item.kind === 'done') return acc;
        acc = reducer(acc, item.value);
      }
    } finally { this.close(); }
  }
  collect(maxItems, release = () => {}) {
    requireBound(maxItems);
    const items = [];
    try {
      while (true) {
        const item = this.next();
        if (item.kind === 'done') return {ok: true, value: items};
        if (items.length === maxItems) {
          release(item.value);
          items.forEach(release);
          return {ok: false, error: 'CollectLimitExceeded'};
        }
        items.push(item.value);
      }
    } catch (error) {
      items.forEach(release);
      throw error;
    } finally { this.close(); }
  }
  static fromArray(values, onClose = () => {}) {
    let index = 0;
    return new PullCursor(() => index < values.length ? yielded(values[index++]) : done, onClose);
  }
}

export class AsyncPullCursor {
  constructor(pull, cancel = () => {}, cleanup = () => {}) {
    this.pull = pull;
    this.cancel = cancel;
    this.cleanup = cleanup;
    this.pending = null;
    this.closing = false;
    this.closed = false;
    this.completed = false;
    this.failure = null;
    this.closePromise = null;
    this.closeCount = 0;
  }
  next() {
    if (this.pending) return Promise.reject(new Error('ConcurrentPull'));
    if (this.closing || this.closed || this.completed) return Promise.resolve(done);
    if (this.failure) return Promise.reject(this.failure);
    const pending = Promise.resolve().then(() => {
      if (this.closing) throw new Error('CancelledPull');
      return this.pull();
    });
    this.pending = pending;
    return pending.then(result => {
      const item = requireResult(result);
      if (item.kind === 'done') this.completed = true;
      return item;
    }, error => {
      if (!this.closing) this.failure = error;
      throw error;
    }).finally(() => { if (this.pending === pending) this.pending = null; });
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (async () => {
      try {
        await this.cancel();
        if (this.pending) await this.pending.catch(() => {});
        await this.cleanup();
      } finally { this.closed = true; this.closeCount++; }
    })();
    return this.closePromise;
  }
  map(callback) {
    return new AsyncPullCursor(async () => {
      const item = await this.next();
      if (item.kind === 'done') return done;
      const mapped = callback(item.value);
      if (mapped && typeof mapped.then === 'function')
        throw new Error('AsyncCallbackRequiresMapAsync');
      return yielded(mapped);
    }, () => this.close());
  }
  filter(predicate, cooperate = () => {}) {
    return new AsyncPullCursor(async () => {
      while (true) {
        const item = await this.next();
        if (item.kind === 'done') return done;
        cooperate();
        const accepted = predicate(item.value);
        if (accepted && typeof accepted.then === 'function')
          throw new Error('AsyncCallbackRequiresFilterAsync');
        if (accepted) return item;
      }
    }, () => this.close());
  }
  async collect(maxItems, release = () => {}) {
    requireBound(maxItems);
    const items = [];
    try {
      while (true) {
        const item = await this.next();
        if (item.kind === 'done') return {ok: true, value: items};
        if (items.length === maxItems) {
          release(item.value);
          items.forEach(release);
          return {ok: false, error: 'CollectLimitExceeded'};
        }
        items.push(item.value);
      }
    } catch (error) {
      items.forEach(release);
      throw error;
    } finally { await this.close(); }
  }
}

// Reference channel/stream: bounded storage, one read lease, one waiting write
// registration. A real backend must integrate actor scheduler and runtime frame.
export class BoundedStream {
  constructor(capacity, onRelease = () => {}) {
    this.capacity = requireBound(capacity);
    this.onRelease = onRelease;
    this.buffer = [];
    this.readWaiter = null;
    this.writeWaiter = null;
    this.readLease = false;
    this.ended = false;
    this.failure = null;
    this.cancelled = false;
    this.maxObserved = 0;
    this.committed = 0;
    this.released = 0;
  }
  send(item) {
    if (this.ended || this.cancelled) return Promise.reject(new Error('StreamClosed'));
    if (this.readWaiter) {
      const {resolve} = this.readWaiter;
      this.readWaiter = null;
      this.committed++;
      resolve(yielded(item));
      return Promise.resolve();
    }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(item);
      this.committed++;
      this.maxObserved = Math.max(this.maxObserved, this.buffer.length);
      return Promise.resolve();
    }
    if (this.writeWaiter) return Promise.reject(new Error('StreamQuota'));
    return new Promise((resolve, reject) => { this.writeWaiter = {item, resolve, reject}; });
  }
  receive() {
    if (this.buffer.length) {
      const item = this.buffer.shift();
      if (this.writeWaiter && !this.ended && !this.cancelled) {
        const {item: incoming, resolve} = this.writeWaiter;
        this.writeWaiter = null;
        this.buffer.push(incoming);
        this.committed++;
        resolve();
      }
      return Promise.resolve(yielded(item));
    }
    if (this.writeWaiter && !this.ended && !this.cancelled) {
      const {item, resolve} = this.writeWaiter;
      this.writeWaiter = null;
      this.committed++;
      resolve();
      return Promise.resolve(yielded(item));
    }
    if (this.failure) return Promise.reject(this.failure);
    if (this.ended || this.cancelled) return Promise.resolve(done);
    if (this.readWaiter) return Promise.reject(new Error('ConcurrentPull'));
    return new Promise((resolve, reject) => { this.readWaiter = {resolve, reject}; });
  }
  releaseUncommitted() {
    if (this.writeWaiter) {
      const {item, reject} = this.writeWaiter;
      this.writeWaiter = null;
      this.onRelease(item);
      this.released++;
      reject(new Error('StreamClosed'));
    }
  }
  finish(error = null) {
    if (this.ended || this.cancelled) return;
    this.ended = true;
    this.failure = error;
    this.releaseUncommitted();
    if (this.readWaiter && this.buffer.length === 0) {
      const {resolve, reject} = this.readWaiter;
      this.readWaiter = null;
      if (error) reject(error); else resolve(done);
    }
  }
  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.ended = true;
    this.releaseUncommitted();
    while (this.buffer.length) {
      this.onRelease(this.buffer.shift());
      this.released++;
    }
    this.cancelPendingRead();
  }
  cancelPendingRead() {
    if (this.readWaiter) {
      const {reject} = this.readWaiter;
      this.readWaiter = null;
      reject(new Error('CancelledPull'));
    }
  }
  asyncIter() {
    if (this.readLease) throw new Error('ExclusiveReader');
    this.readLease = true;
    return new AsyncPullCursor(
      () => this.receive(),
      () => this.cancelPendingRead(),
      () => { this.readLease = false; }
    );
  }
}
