// Pub/sub with per-listener error isolation. A listener that throws 5 times in a row is detached.

export class EventBus {
  constructor(log) {
    this._map = new Map();
    this._log = log;
    this.stats = { emitted: 0, detached: 0 };
  }

  /** @returns {() => void} unsubscribe */
  on(name, fn, owner = 'anon') {
    if (typeof fn !== 'function') throw new Error(`EventBus.on(${name}): listener is not a function`);
    let list = this._map.get(name);
    if (!list) { list = []; this._map.set(name, list); }
    const entry = { fn, owner, errors: 0 };
    list.push(entry);
    return () => this.off(name, fn);
  }

  once(name, fn, owner) {
    const off = this.on(name, (p) => { off(); fn(p); }, owner);
    return off;
  }

  off(name, fn) {
    const list = this._map.get(name);
    if (!list) return;
    const i = list.findIndex((e) => e.fn === fn);
    if (i >= 0) list.splice(i, 1);
  }

  /** Remove every listener registered by an owner (used on module dispose / quarantine). */
  offOwner(owner) {
    for (const list of this._map.values()) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].owner === owner) list.splice(i, 1);
    }
  }

  emit(name, payload = {}) {
    const list = this._map.get(name);
    this.stats.emitted++;
    if (!list || list.length === 0) return;
    // copy so listeners can unsubscribe during emit
    const snapshot = list.slice();
    for (const entry of snapshot) {
      try {
        entry.fn(payload);
        entry.errors = 0;
      } catch (err) {
        entry.errors++;
        this._log?.error(`[events] listener for "${name}" (owner ${entry.owner}) threw: ${err?.message || err}`, err);
        if (entry.errors >= 5) {
          this.off(name, entry.fn);
          this.stats.detached++;
          this._log?.warn(`[events] detached listener for "${name}" (owner ${entry.owner}) after 5 consecutive errors`);
        }
      }
    }
  }

  listenerCount(name) { return this._map.get(name)?.length || 0; }
  names() { return [...this._map.keys()]; }
}
