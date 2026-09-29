// park — DEMO (wave 3): the complete playable demo park. Composes every other module through its
// public API into a running game state — generated terrain, an entrance gate + lodge complex, a
// gravel loop road with two dirt spurs, four fenced habitats, hides + a viewing tower, biome props,
// four safari vehicles on tour, the economy/simulation running at speed 1, ui + audio alive — and
// registers itself as the default full-game start. See README.md for the full story, the measured
// gameplay-loop numbers and an honest gap list.
import * as THREE from 'three';
import { buildPark, clearPark } from './build.js';
import { presets, stage } from './showcase.js';

let ctx = null;
let group = null;
let built = false;
const rebuilds = []; // {id, cost, at} — burnt buildings awaiting rebuild (Wave P2)
const REBUILD_DAYS = 8;

const api = {
  /** Build the demo park on the world's current seed. Idempotent: clears any prior park state first. */
  async loadDemo() {
    if (!ctx) return null;
    clearPark(ctx);
    rebuilds.length = 0; // buildings.clear() removed their owners; stale rebuilds would charge cash
    const report = await buildPark(ctx, { seed: ctx.world.seed });
    built = true;
    startUrlMission();
    return report;
  },
  /** Start a fresh game. If `seed` differs from the current world seed, terrain is regenerated on it
   * (see README "Known gaps" — every other module's own ctx.rng was already forked from the seed the
   * world was constructed with, so this reseeds terrain + this module's own placement decisions, not
   * every module's internal randomness). Then rebuilds the demo park exactly as loadDemo() does. */
  async newGame(seed) {
    if (!ctx) return null;
    clearPark(ctx);
    rebuilds.length = 0;
    const terrain = ctx.modules.get('terrain');
    const useSeed = Number.isFinite(seed) ? seed : ctx.world.seed;
    if (terrain?.generate && useSeed !== ctx.world.seed) {
      ctx.world.seed = useSeed;
      try { terrain.generate({ preset: 'savannah', seed: useSeed }); } catch (err) { ctx.log.error('[park] newGame: terrain.generate failed', err); }
    }
    const report = await buildPark(ctx, { seed: useSeed });
    built = true;
    startUrlMission();
    return report;
  },
  isBuilt: () => built,
  /** Wave P3 (harness/demo): undo the fire damage this module tracked — drop the rebuild queue and
   * un-burn every burnt building. sim.reset() restores vegetation and fire state but not buildings
   * (their burnt state and the rebuild charges would otherwise leak into the next run). → count of
   * buildings restored. */
  clearFireDamage() {
    if (!ctx) return 0;
    const buildings = ctx.modules.get('buildings');
    let n = 0;
    for (const r of rebuilds) { try { buildings?.setState?.(r.id, { state: 'ok' }); n++; } catch {} }
    rebuilds.length = 0;
    if (buildings?.setState) {
      for (const b of ctx.world.buildings.values()) {
        if (b?.state !== 'burnt') continue;
        try { buildings.setState(b.id, { state: 'ok' }); n++; } catch {}
      }
    }
    return n;
  },
};

/** &mission=<id> (Wave P3): start that mission after the demo park builds — the harness and the
 * mission screenshots use it; without the param the game stays in free play. */
function startUrlMission() {
  if (!ctx) return;
  const id = String(ctx.params?.mission || '');
  if (!id) return;
  const sim = ctx.modules.get('simulation');
  if (!sim?.startMission) { ctx.log.warn(`[park] ?mission=${id}: simulation module absent`); return; }
  const r = sim.startMission(id);
  if (r?.ok) {
    const m = (sim.listMissions?.() || []).find((x) => x.id === id);
    ctx.events.emit('ui:notify', { level: 'good', text: `${m?.name ?? id} — ${m?.deadlineDays ?? ''} days`, title: 'Mission started' });
  } else {
    ctx.log.warn(`[park] ?mission=${id} failed to start: ${r?.error ?? 'unknown'}`);
  }
}

export default {
  id: 'park',
  version: 1,
  dependencies: [],
  optional: ['terrain', 'environment', 'roads', 'zoning', 'buildings', 'props', 'animals', 'traffic', 'simulation', 'tools', 'ui', 'audio'],
  api,

  async init(c) {
    ctx = c;
    group = new THREE.Group();
    group.name = 'park';
    ctx.scene.add(group);

    if (!ctx.isShowcase) {
      // Full game (no ?module=). There is no save/load system anywhere in this project (checked:
      // no localStorage/save API in src/), so "no save exists" is unconditionally true today — the
      // demo is always the default start. Wait for core:ready: park is last in topological order
      // (every dependency above is optional, so the registry initialises them all first), but the
      // event is the documented, explicit hook per docs/specs/park.md rather than relying on
      // initialisation order alone.
      ctx.events.once('core:ready', () => {
        api.loadDemo().catch((err) => ctx.log.error('[park] loadDemo on core:ready failed', err));
      });
      // Wave P2: a building the fire consumed is marked burnt (stops contributing) and rebuilt
      // automatically after REBUILD_DAYS for 40 % of its base cost once the park can afford it.
      ctx.events.on('fire:building', ({ id, rebuildCost }) => {
        const buildings = ctx.modules.get('buildings');
        if (!buildings?.setState) return;
        buildings.setState(id, { state: 'burnt', staff: 0, visitors: 0 });
        rebuilds.push({ id, cost: rebuildCost ?? 2000, at: ctx.world.time.day + REBUILD_DAYS });
      });
    }
  },

  update() {},
  tick() {
    if (!ctx || rebuilds.length === 0) return;
    const sim = ctx.modules.get('simulation');
    const buildings = ctx.modules.get('buildings');
    if (!sim?.spend || !buildings?.setState) return;
    const eco = ctx.world.economy;
    for (let i = rebuilds.length - 1; i >= 0; i--) {
      const r = rebuilds[i];
      if (ctx.world.time.day < r.at) continue;
      if (eco.cash < r.cost) continue; // cannot afford it yet: stays burnt, retried daily
      sim.spend(r.cost, 'rebuild');
      buildings.setState(r.id, { state: 'ok' });
      ctx.events.emit('fire:rebuilt', { id: r.id, cost: r.cost, day: ctx.world.time.day });
      ctx.events.emit('ui:notify', { level: 'info', text: `Rebuilt a burned-down building for $${Math.round(r.cost).toLocaleString()}` });
      rebuilds.splice(i, 1);
    }
  },

  dispose() {
    try { clearPark(ctx); } catch {}
    rebuilds.length = 0;
    group?.removeFromParent();
    group = null; ctx = null; built = false;
  },

  showcase: { presets, stage },
};
