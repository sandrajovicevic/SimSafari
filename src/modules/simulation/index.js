// simulation — module wrapper around the headless Simulation (sim.js). Owns world.economy + world.visitors.
// Bridges to other modules through ctx.modules.get() with null checks; everything works when they are absent.
import * as THREE from 'three';
import { Simulation } from './sim.js';
import { STAFF_ORDER } from './tables.js';
import { presets, stage, updateStage, disposeStage } from './showcase.js';

let ctx = null;
let sim = null;
let group = null;
const sightings = new Map(); // species → count since the last daily report (fed by visitor:sighting)
const _catalogue = { list: null, version: -1 };

function catalogueLookup(type) {
  const b = ctx?.modules.get('buildings');
  if (!b?.catalogue) return null;
  try {
    const cat = b.catalogue();
    if (Array.isArray(cat)) return cat.find((e) => e && (e.type === type || e.id === type || e.key === type)) || null;
    if (cat && typeof cat === 'object') return cat[type] || null;
  } catch {}
  return null;
}

/** Random cell centre inside a habitat (for spawning). */
function habitatPoint(world, habitatId) {
  const h = world.habitats.get(habitatId);
  if (!h || !h.cells || !h.cells.length) return null;
  const idx = h.cells[Math.floor(ctx.rng.float() * h.cells.length)];
  const ix = idx % world.grid.res, iz = (idx - ix) / world.grid.res;
  return world.cellCenter(ix, iz);
}

function animalHabitat(world, a) {
  if (a.habitat !== undefined && a.habitat !== null) return a.habitat;
  if (a.habitatId !== undefined && a.habitatId !== null) return a.habitatId;
  return world.grid.habitatId[world.cellAt(a.x, a.z).index] || 0;
}

export function makeHooks(c) {
  return {
    speciesInfo: (s) => c.modules.get('animals')?.speciesInfo?.(s) ?? null,
    buildingInfo: (t) => catalogueLookup(t),
    spawn: (species, habitatId, n) => {
      const a = c.modules.get('animals');
      if (!a?.spawn) return;
      const p = habitatPoint(c.world, habitatId);
      if (!p) return;
      a.spawn(species, p.x, p.z, n, { habitat: habitatId, source: 'simulation' });
    },
    remove: (species, habitatId, n) => {
      const a = c.modules.get('animals');
      if (!a?.remove) return;
      let left = n;
      for (const an of c.world.animals.values()) {
        if (left <= 0) break;
        if (!an || an.species !== species) continue;
        if (animalHabitat(c.world, an) !== habitatId) continue;
        a.remove(an.id); left--;
      }
    },
    takeSightings: () => { if (!sightings.size) return null; const m = new Map(sightings); sightings.clear(); return m; },
    notify: (level, text) => c.events.emit('ui:notify', { level, text }),
    emit: (name, payload) => c.events.emit(name, payload),
    setSpeed: (n) => c.app?.setSpeed?.(n),
    hasModule: (id) => c.modules.has(id),
    log: (t) => c.log.warn(t),
  };
}

const api = {
  /** Habitat quality for a species in [0,1]. habitat: id or habitat object. */
  scoreHabitat: (habitat, species, opts) => (sim ? sim.scoreHabitat(habitat, species, opts) : 0),
  explainHabitat: (habitat, species) => (sim ? sim.explainHabitat(habitat, species) : null),
  getReport: () => sim?.getReport() ?? null,
  getReports: (days) => sim?.getReports(days) ?? [],
  getState: () => sim?.getState() ?? null,
  getHistory: (days) => sim?.getHistory(days) ?? [],
  getVisitorSatisfaction: () => sim?.getVisitorSatisfaction() ?? 0.5,
  setTicketPrice: (p) => sim?.setTicketPrice(p),
  takeLoan: (amount) => sim?.takeLoan(amount) ?? 0,
  repayLoan: (amount) => sim?.repayLoan(amount) ?? 0,
  hire: (role, n = 1) => sim?.hire(role, n) ?? 0,
  fire: (role, n = 1) => sim?.fire(role, n) ?? 0,
  setWage: (role, wage) => sim?.setWage(role, wage) ?? 0,
  buyAnimals: (species, habitatId, n = 1) => sim?.buyAnimals(species, habitatId, n) ?? { ok: false, cost: 0 },
  setPopulation: (habitatId, species, n) => sim?.setPopulation(habitatId, species, n),
  speed: (n) => sim?.speed(n),
  reset: (seed) => sim?.reset(seed),
  /** Fast-forward n whole days headlessly (used by the showcase and debugging). */
  runDays: (n) => sim?.runDays(n) ?? null,
  species: (name) => sim?.species(name) ?? null,
  allSpecies: () => sim?.allSpecies() ?? [],
  staffRoles: () => STAFF_ORDER.slice(),
  /** Mark the current population/cash as the state reset() returns to. */
  markStart: () => sim?.markStart(),
  /** Raw Simulation instance (debugging / demos). */
  getSim: () => sim,
};

export default {
  id: 'simulation',
  version: 1,
  dependencies: [],
  optional: [], // TEMP for isolated screenshots — restore ['animals', 'zoning', 'buildings', 'traffic', 'roads']
  api,

  async init(c) {
    ctx = c;
    group = new THREE.Group();
    group.name = 'simulation';
    ctx.scene.add(group);
    try {
      sim = new Simulation(ctx.world, ctx.rng.fork('sim'), makeHooks(ctx));
      sim.reconcileFromWorld();
      sim.markStart();
      const inval = () => { if (sim) sim.habitatStats.clear(); };
      ctx.events.on('visitor:sighting', (p) => { if (p?.species) sightings.set(p.species, (sightings.get(p.species) || 0) + 1); });
      for (const ev of ['habitat:changed', 'zone:changed', 'road:added', 'road:removed', 'road:changed', 'building:placed', 'building:removed', 'terrain:modified']) ctx.events.on(ev, inval);
      ctx.events.on('building:placed', () => sim?.invalidateCaches());
      ctx.log.info('simulation ready (headless)');
    } catch (err) {
      ctx.log.error('simulation init failed', err);
    }
  },

  update(dt, t) { updateStage(ctx, dt, t); },

  tick(simDt) {
    if (!sim || !ctx) return;
    const T = ctx.world.time;
    sim.tick(simDt, T.hour, T.day);
  },

  dispose() {
    disposeStage(ctx);
    group?.removeFromParent();
    group = null; sim = null; sightings.clear(); ctx = null;
  },

  showcase: {
    presets,
    stage: (c, preset) => stage(c, preset, { group, hooks: makeHooks(c), setSim: (s) => { sim = s; } }),
  },
};
