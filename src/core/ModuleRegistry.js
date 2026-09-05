// Module discovery, dependency ordering and failure isolation. See ARCHITECTURE.md §2, §5.
import { Rng } from './Rng.js';
import { Noise } from './Noise.js';

const loaders = import.meta.glob('../modules/*/index.js');
const QUARANTINE_AFTER = 5;

function idFromPath(p) { return p.split('/').slice(-2, -1)[0]; }

export class ModuleRegistry {
  constructor(app) {
    this.app = app;
    this.available = Object.keys(loaders).map(idFromPath).sort();
    this.modules = new Map(); // id → record
    this.order = [];          // init order
  }

  status() {
    const out = {};
    for (const [id, r] of this.modules) {
      out[id] = { status: r.status, error: r.error ? String(r.error?.message || r.error) : undefined,
        updateMs: +(this.app.perf.moduleMs.get(id) || 0).toFixed(3), errors: r.errorCount, consecutive: r.consecutive };
    }
    return out;
  }

  get(id) {
    const r = this.modules.get(id);
    return r && r.status === 'ok' ? r.def.api : null;
  }

  has(id) { return this.modules.has(id) && this.modules.get(id).status === 'ok'; }

  /** Import a set of module ids (with dependency closure). Failed imports are recorded, not thrown. */
  async load(ids) {
    const wanted = new Set();
    const queue = [...ids];
    while (queue.length) {
      const id = queue.shift();
      if (wanted.has(id)) continue;
      if (!this.available.includes(id)) { this.app.log.warn(`[core] module "${id}" not found (available: ${this.available.join(', ')})`); continue; }
      wanted.add(id);
      const rec = await this._import(id);
      if (rec.def) {
        for (const d of rec.def.dependencies || []) queue.push(d);
        for (const d of rec.def.optional || []) if (this.available.includes(d)) queue.push(d);
      }
    }
    this.order = this._topo([...wanted]);
    return this.order;
  }

  async _import(id) {
    if (this.modules.has(id)) return this.modules.get(id);
    const rec = { id, def: null, status: 'loading', error: null, errorCount: 0, consecutive: 0, ctx: null };
    this.modules.set(id, rec);
    const key = Object.keys(loaders).find((k) => idFromPath(k) === id);
    try {
      const mod = await loaders[key]();
      const def = mod.default;
      if (!def || typeof def !== 'object') throw new Error('index.js must default-export a module definition object');
      if (def.id !== id) this.app.log.warn(`[core] module in folder "${id}" declares id "${def.id}"`);
      def.id = id;
      def.dependencies = def.dependencies || [];
      def.optional = def.optional || [];
      def.api = def.api || {};
      def.showcase = def.showcase || { presets: {}, stage: async () => {} };
      def.showcase.presets = def.showcase.presets || {};
      rec.def = def;
      rec.status = 'loaded';
    } catch (err) {
      rec.status = 'failed';
      rec.error = err;
      this.app.log.error(`[core] module "${id}" failed to import: ${err?.message || err}`, err);
      this.app.events.emit('module:failed', { id, phase: 'import', error: String(err?.message || err) });
    }
    return rec;
  }

  _topo(ids) {
    const out = [], temp = new Set(), perm = new Set();
    const visit = (id) => {
      if (perm.has(id)) return;
      if (temp.has(id)) { this.app.log.warn(`[core] dependency cycle at "${id}"`); return; }
      temp.add(id);
      const def = this.modules.get(id)?.def;
      if (def) for (const d of [...def.dependencies, ...def.optional]) if (ids.includes(d)) visit(d);
      temp.delete(id); perm.add(id); out.push(id);
    };
    for (const id of ids) visit(id);
    return out;
  }

  _makeCtx(rec) {
    const app = this.app;
    const id = rec.id;
    const rng = new Rng(app.world.seed).fork(id);
    const log = app.log.scope(id, () => { rec.errorCount++; });
    const events = {
      on: (n, fn) => app.events.on(n, fn, id),
      once: (n, fn) => app.events.once(n, fn, id),
      off: (n, fn) => app.events.off(n, fn),
      emit: (n, p) => app.events.emit(n, p),
    };
    return {
      app, world: app.world, events, rng, noise: new Noise(rng.fork('noise')),
      scene: app.scene, camera: app.camera, renderer: app.renderer, rig: app.rig,
      modules: { get: (mid) => this.get(mid), has: (mid) => this.has(mid), status: () => this.status() },
      log, quality: app.params.quality, textures: app.textures, materials: app.materials,
      isShowcase: !!app.params.module, params: app.params, input: app.input,
    };
  }

  async initAll() {
    for (const id of this.order) {
      const rec = this.modules.get(id);
      if (!rec || rec.status !== 'loaded') continue;
      const missing = rec.def.dependencies.filter((d) => !this.has(d));
      if (missing.length) this.app.log.warn(`[core] "${id}" initialising without dependencies: ${missing.join(', ')}`);
      rec.ctx = this._makeCtx(rec);
      const t0 = performance.now();
      try {
        await rec.def.init?.(rec.ctx);
        rec.status = 'ok';
        rec.initMs = performance.now() - t0;
        this.app.log.info(`[core] init ${id} in ${rec.initMs.toFixed(0)} ms`);
      } catch (err) {
        rec.status = 'failed'; rec.error = err; rec.errorCount++;
        this.app.log.error(`[core] module "${id}" failed in init(): ${err?.message || err}`, err);
        this.app.events.emit('module:failed', { id, phase: 'init', error: String(err?.message || err) });
        this.app.events.offOwner(id);
      }
    }
  }

  async stage(id, preset) {
    const rec = this.modules.get(id);
    if (!rec || rec.status !== 'ok') return false;
    try {
      await rec.def.showcase.stage?.(rec.ctx, preset);
      return true;
    } catch (err) {
      rec.errorCount++;
      this.app.log.error(`[core] module "${id}" failed in showcase.stage(): ${err?.message || err}`, err);
      return false;
    }
  }

  update(dt, t) {
    const perf = this.app.perf;
    for (const id of this.order) {
      const rec = this.modules.get(id);
      if (!rec || rec.status !== 'ok' || !rec.def.update) continue;
      const t0 = performance.now();
      try {
        rec.def.update(dt, t);
        rec.consecutive = 0;
      } catch (err) {
        this._fault(rec, 'update', err);
      }
      perf.recordModule(id, performance.now() - t0);
    }
  }

  tick(simDt) {
    for (const id of this.order) {
      const rec = this.modules.get(id);
      if (!rec || rec.status !== 'ok' || !rec.def.tick) continue;
      try { rec.def.tick(simDt); rec.consecutive = 0; }
      catch (err) { this._fault(rec, 'tick', err); }
    }
  }

  _fault(rec, phase, err) {
    rec.errorCount++; rec.consecutive++;
    if (rec.consecutive <= 3 || rec.consecutive === QUARANTINE_AFTER) {
      this.app.log.error(`[core] module "${rec.id}" threw in ${phase}(): ${err?.message || err}`, err);
    }
    if (rec.consecutive >= QUARANTINE_AFTER) {
      rec.status = 'quarantined'; rec.error = err;
      this.app.events.offOwner(rec.id);
      this.app.log.warn(`[core] module "${rec.id}" quarantined after ${QUARANTINE_AFTER} consecutive errors`);
      this.app.events.emit('module:failed', { id: rec.id, phase, error: String(err?.message || err) });
    }
  }

  disposeAll() {
    for (const id of [...this.order].reverse()) {
      const rec = this.modules.get(id);
      try { rec?.def?.dispose?.(); } catch (err) { this.app.log.error(`[core] "${id}" dispose() threw`, err); }
      this.app.events.offOwner(id);
    }
    this.modules.clear(); this.order = [];
  }

  /** Probe: import everything, collect showcase presets, no init. */
  async probe() {
    const out = {};
    for (const id of this.available) {
      const rec = await this._import(id);
      out[id] = rec.def ? { status: 'loaded', dependencies: rec.def.dependencies, optional: rec.def.optional, presets: rec.def.showcase.presets, version: rec.def.version }
        : { status: 'failed', error: String(rec.error?.message || rec.error) };
    }
    return out;
  }
}
