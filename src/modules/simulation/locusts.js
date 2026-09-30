// Locust swarms (Wave P5, docs/specs/p5-rainfall-locusts-licks.md §4). simulation owns world.locusts
// (single writer); effects reads it for the particle cloud. A swarm eats GRASS and SHRUB cover in
// its disc (trees untouched) at eatRate × density per day, drifts with the weather wind, never
// splits, and dies at density < dieAt or when its lifetime runs out. Every swarm carries a CELL
// BUDGET that caps total eaten cells — the seeded outbreak and every injectEvent are bounded by
// construction (rule 8). All randomness comes from the forked Rng('locust:<seed>') stream — the
// sim's main economy stream is never drawn from.
import { Rng } from '../../core/Rng.js';
import { PLANTS } from '../../core/Plants.js';
import { LOCUSTS as L } from './tables.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class LocustSwarms {
  /** @param {import('./sim.js').Simulation} sim */
  constructor(sim) {
    this.sim = sim;
    // plain test worlds are built without core/World.js — the single writer creates the field
    if (!sim.world.locusts) sim.world.locusts = { swarms: [], version: 0 };
    if (!sim.world.saltLicks) sim.world.saltLicks = new Map();
    this.rng = new Rng(`locust:${sim.seed}`); // outbreak rolls only — forked, never the main stream
    this.lastSeason = null;   // for the outbreak gate: a wet season that FOLLOWS a drought
    this.wetDays = 0;         // days into the current wet season
    this.eatenTotal = 0;      // lifetime cells eaten (report)
    this.eatenToday = 0;
  }

  /** Reset for sim.reset(): no swarms, fresh outbreak memory (the rng stream restarts too — the
   * forked seed makes the outbreak schedule deterministic per game). */
  reset() {
    const w = this.sim.world;
    if (w.locusts) { w.locusts.swarms.length = 0; w.locusts.version++; }
    this.rng = new Rng(`locust:${this.sim.seed}`);
    this.lastSeason = null;
    this.wetDays = 0;
    this.eatenTotal = 0;
    this.eatenToday = 0;
  }

  /** Seeded outbreak roll — called once per day end from the sim. Gate: the first 20 days of a wet
   * season that follows a dry one (desert locust ecology: eggs hatch after drought-breaking rain). */
  maybeOutbreak(day, season) {
    if (season === 'wet') {
      if (this.lastSeason === 'dry' && this.wetDays === 0) this.wetDays = 1;
      else if (this.wetDays > 0) this.wetDays++;
      if (this.lastSeason === 'dry' && this.wetDays >= 1 && this.wetDays <= 20 && this.rng.float() < L.outbreakP) {
        this.lastSeason = season;
        return this.inject({ x: (this.rng.float() - 0.5) * this.sim.world.size * 0.6, z: (this.rng.float() - 0.5) * this.sim.world.size * 0.6, radius: 48 });
      }
    } else {
      this.wetDays = 0;
    }
    this.lastSeason = season;
    return null;
  }

  /** A new swarm (injectEvent path — opts carry the explicit bounds; defaults are bounded too). */
  inject(opts = {}) {
    const w = this.sim.world;
    if (!w.locusts) return null;
    const swarm = {
      id: w.nextId ? w.nextId('locust') : `locust_${w.locusts.swarms.length + 1}`,
      x: opts.x ?? 0, z: opts.z ?? 0,
      radius: opts.radius ?? 48,
      density: clamp01(opts.density ?? 0.8),
      age: 0,
      days: opts.days ?? L.daysDefault,     // lifetime cap (rule 8)
      budget: opts.budget ?? L.budgetDefault, // total cells it may ever eat (rule 8)
      eaten: 0,
    };
    w.locusts.swarms.push(swarm);
    w.locusts.version++;
    this.sim._emit('locusts:changed', { version: w.locusts.version });
    this.sim._addEvent(this.sim.clock.day, { type: 'locusts', level: 'warn', text: `A locust swarm has settled over ${Math.round(swarm.radius * 2)} m of range near ${Math.round(swarm.x)}, ${Math.round(swarm.z)}.` });
    return swarm;
  }

  /** One sim-day of swarm life: drift, eat grass/shrub cover inside the budget, natural decay,
   * clearing losses on burnt/firebreak cells, death checks. Returns cells eaten today. */
  step(wind, season) {
    const w = this.sim.world, veg = this.sim.veg;
    if (!w.locusts || !w.locusts.swarms.length) { this.eatenToday = 0; return 0; }
    const N = veg.nCells, cover = veg.cover, res = veg.res, cell = veg.cell;
    const half = w.half ?? w.size / 2;
    const isHerb = PLANTS.map((p) => p.form !== 'tree');
    this.eatenToday = 0;
    for (let i = w.locusts.swarms.length - 1; i >= 0; i--) {
      const s = w.locusts.swarms[i];
      s.age++;
      // drift with the wind (normalised), stay in bounds
      const wl = Math.hypot(wind?.x ?? 0, wind?.z ?? 0) || 1;
      s.x = Math.max(-half + s.radius, Math.min(half - s.radius, s.x + (wind?.x ?? 0) / wl * L.drift));
      s.z = Math.max(-half + s.radius, Math.min(half - s.radius, s.z + (wind?.z ?? 0) / wl * L.drift));
      // eat grass/shrub cover in the disc, bounded by the swarm's cell budget
      const ix0 = Math.max(0, Math.floor((s.x - s.radius + half) / cell)), ix1 = Math.min(res - 1, Math.floor((s.x + s.radius + half) / cell));
      const iz0 = Math.max(0, Math.floor((s.z - s.radius + half) / cell)), iz1 = Math.min(res - 1, Math.floor((s.z + s.radius + half) / cell));
      let cells = 0, clearedCells = 0, ate = 0;
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const cx = (ix + 0.5) * cell - half, cz = (iz + 0.5) * cell - half;
        const dx = cx - s.x, dz = cz - s.z;
        if (dx * dx + dz * dz > s.radius * s.radius) continue;
        const idx = iz * res + ix;
        cells++;
        if (veg.cleared[idx] || veg.burn[idx]) { clearedCells++; continue; } // firebreak/burnt ground holds nothing and thins the swarm
        if (s.eaten >= s.budget) continue; // budget exhausted: the swarm persists but eats no more
        let bit = false;
        for (let t = 0; t < isHerb.length; t++) {
          if (!isHerb[t]) continue;
          const k = t * N + idx;
          if (cover[k] <= 0) continue;
          cover[k] = Math.max(0, cover[k] * (1 - L.eatRate * s.density));
          bit = true;
        }
        if (bit) { s.eaten++; ate++; }
      }
      // clearing loss + natural decay
      if (cells > 0) s.density -= L.clearLoss * (clearedCells / cells);
      s.density -= L.decay;
      s.density = clamp01(s.density);
      this.eatenToday += ate;
      this.eatenTotal += ate;
      if (s.density < L.dieAt || s.age >= s.days || s.eaten >= s.budget && s.density < L.dieAt + 0.02) {
        w.locusts.swarms.splice(i, 1);
      }
    }
    w.vegetation.version++;
    w.locusts.version++;
    this.sim._emit('locusts:changed', { version: w.locusts.version });
    if (this.eatenToday > 0) this.sim._emit('vegetation:changed', this.sim.veg.wholeRect());
    return this.eatenToday;
  }

  /** Player verb: insecticide over a disc — cuts every swarm whose centre lies within `radius` of
   * (x, z) by sprayCut (the sim charges sprayCost × ha). → { swarms, ha }. */
  spray(x, z, radius = 48) {
    const w = this.sim.world;
    let hit = 0;
    for (const s of w.locusts?.swarms || []) {
      if (Math.hypot(s.x - x, s.z - z) <= radius) { s.density = clamp01(s.density * (1 - L.sprayCut)); hit++; }
    }
    if (hit) {
      w.locusts.version++;
      this.sim._emit('locusts:changed', { version: w.locusts.version });
    }
    return { swarms: hit, ha: +((Math.PI * radius * radius) / 1e4).toFixed(2) };
  }

  /** Report slice. */
  stats() {
    const sw = this.sim.world.locusts?.swarms || [];
    return {
      swarms: sw.map((s) => ({ id: s.id, x: Math.round(s.x), z: Math.round(s.z), radius: s.radius, density: +s.density.toFixed(2), age: s.age, eaten: s.eaten, budget: s.budget })),
      cellsEatenToday: this.eatenToday,
      cellsEatenTotal: this.eatenTotal,
    };
  }
}
