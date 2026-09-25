// Vegetation stock for the food web (Wave P1, docs/specs/p1-food-web.md). Pure JS (runs in Node tests).
// Owns the writes to world.vegetation.cover: seeding from terrain biomes, daily logistic spread with
// neighbour seeding, grazing pressure from the herds (set by sim.js), planting. Readers (props) rebuild
// from 'vegetation:changed' rects. No per-day allocations: every scratch buffer is allocated once.
import { Rng } from '../../core/Rng.js';
import { PLANTS, PLANT_IDS, PLANT_INDEX, rainfallFit } from '../../core/Plants.js';
import { SITE, VEG } from './tables.js';

const NT = PLANTS.length;
const FORM_LOSS = PLANTS.map((p) => VEG.overgraze[p.form] ?? 0.05);

export class Vegetation {
  /** @param world shared world; world.vegetation is created here when absent (plain test worlds). */
  constructor(world, seed = 1) {
    this.world = world;
    this.seed = seed;
    if (!world.vegetation) {
      const res = 64;
      world.vegetation = { res, cell: world.size / res, types: PLANT_IDS, cover: new Float32Array(NT * res * res), natural: new Float32Array(NT * res * res), version: 0 };
    }
    const v = world.vegetation;
    this.res = v.res;
    this.cell = v.cell;
    this.nCells = v.res * v.res;
    this.cellHa = (v.cell * v.cell) / 10000;
    this.site = new Float32Array(NT * this.nCells);     // per plant per cell: 0..1 suitability (cover ceiling multiplier)
    this.pressure = new Float32Array(NT * this.nCells); // per plant per cell: grazing pressure P set by sim each day
    this._scratch = new Float32Array(this.nCells);       // one plant layer, pre-step copy (neighbour term)
    this._emitted = new Float32Array(NT * this.nCells);  // cover as of the last vegetation:changed
    this._fit = new Float32Array(NT);
    this.seeded = false;
    this.lastStepMs = 0;
    this.lastRain = 0;
  }

  get cover() { return this.world.vegetation.cover; }

  /** World (x, z) → vegetation cell index (clamped). */
  cellIndex(x, z) {
    const r = this.res, half = this.world.half ?? this.world.size / 2;
    let ix = Math.floor((x + half) / this.cell), iz = Math.floor((z + half) / this.cell);
    ix = ix < 0 ? 0 : ix >= r ? r - 1 : ix;
    iz = iz < 0 ? 0 : iz >= r ? r - 1 : iz;
    return iz * r + ix;
  }

  _biomeAt(x, z) {
    const w = this.world;
    if (typeof w.biomeAt === 'function') return w.biomeAt(x, z);
    const t = w.terrain; if (!t?.biome) return 0;
    const half = w.half ?? w.size / 2, r = t.res;
    const ix = Math.max(0, Math.min(r - 1, Math.round((x + half) / t.cell))), iz = Math.max(0, Math.min(r - 1, Math.round((z + half) / t.cell)));
    return t.biome[iz * r + ix];
  }

  _isWater(x, z) {
    const w = this.world;
    if (typeof w.isWater === 'function') return w.isWater(x, z);
    return typeof w.getHeight === 'function' && w.terrain ? w.getHeight(x, z) < w.terrain.waterLevel : false;
  }

  /** Seed natural vegetation from the terrain biomes (deterministic on `seed`). Each 16 m cell samples
   * its biome at 4 points; the site suitability is the mean of the biome rows (water points count 0).
   * Grasses start near their dry-season ceiling; shrubs/trees are individuals: present in a cell with
   * P = site × treeDensity. Replaces the whole layer; emits a whole-world vegetation:changed via the caller. */
  seedFromBiomes() {
    const rng = new Rng(`veg:${this.seed}`);
    const w = this.world, r = this.res, c = this.cell, half = w.half ?? w.size / 2, N = this.nCells;
    const cover = this.cover, site = this.site;
    const fitDry = PLANTS.map((p) => rainfallFit(p.rainfall, VEG.rainDry));
    const off = [0.25, 0.75];
    for (let iz = 0; iz < r; iz++) for (let ix = 0; ix < r; ix++) {
      const i = iz * r + ix;
      for (let t = 0; t < NT; t++) site[t * N + i] = 0;
      for (const oz of off) for (const ox of off) {
        const x = (ix + ox) * c - half, z = (iz + oz) * c - half;
        if (this._isWater(x, z)) continue;
        const row = SITE[this._biomeAt(x, z)] || SITE[0];
        for (let t = 0; t < NT; t++) site[t * N + i] += row[t] * 0.25;
      }
      for (let t = 0; t < NT; t++) {
        const p = PLANTS[t], k = t * N + i, s = site[k];
        const K = p.maxCover * fitDry[t] * s;
        if (K <= 0) { cover[k] = 0; continue; }
        if (p.form === 'grass') cover[k] = K * rng.range(0.6, 1.0);
        else cover[k] = rng.bool(s * VEG.treeDensity) ? K * rng.range(0.5, 1.0) : 0;
      }
    }
    this._emitted.set(cover);
    if (this.world.vegetation.natural) this.world.vegetation.natural.set(cover);
    this.seeded = true;
    this.world.vegetation.version++;
  }

  /** Rainfall 0..1 for today from season, drought strength and today's weather. */
  rainfall(season, drought, weatherRain = 0) {
    const base = season === 'wet' ? VEG.rainWet : VEG.rainDry;
    const r = base - VEG.droughtRain * drought + VEG.weatherRain * (weatherRain || 0);
    return r < 0 ? 0 : r > 1 ? 1 : r;
  }

  /**
   * One day of growth. For every cell and plant: logistic growth toward K = maxCover × fit × site at rate
   * spread × fit, plus neighbour seeding (spread × fit × neighbourSeed × 4-neighbour mean × (1 − c/K)).
   * Grazing pressure P (this.pressure, set by the sim from herd demand ÷ plant yield): P ≤ 1 scales the
   * regrowth by (1 − grazeDamp·P); P > 1 bites into the standing stock at overgraze[form] × (P − 1)/day.
   * Returns the dirty rect {x0,z0,x1,z1} in world metres (null when nothing moved past emitThreshold).
   */
  step(rain) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const r = this.res, N = this.nCells, cover = this.cover, site = this.site, P = this.pressure, S = this._scratch;
    this.lastRain = rain;
    const nb = VEG.neighbourSeed, damp = VEG.grazeDamp, maxLoss = VEG.maxLoss;
    for (let t = 0; t < NT; t++) {
      const p = PLANTS[t], fit = rainfallFit(p.rainfall, rain);
      this._fit[t] = fit;
      const rate = p.spread * fit, Kp = p.maxCover * fit, base = t * N, lossK = FORM_LOSS[t];
      S.set(cover.subarray(base, base + N));
      for (let iz = 0; iz < r; iz++) {
        const row = iz * r;
        for (let ix = 0; ix < r; ix++) {
          const i = row + ix, k = base + i;
          const K = Kp * site[k];
          const c = S[i];
          if (K <= 0) { if (c > 0) cover[k] = c * 0.9 < 1e-4 ? 0 : c * 0.9; continue; }
          // 4-neighbour mean (clamped at the edge)
          const nm = (S[ix > 0 ? i - 1 : i] + S[ix < r - 1 ? i + 1 : i] + S[iz > 0 ? i - r : i] + S[iz < r - 1 ? i + r : i]) * 0.25;
          const room = 1 - c / K;
          let g = rate * c * room + (room > 0 && nm > c ? rate * nb * (nm - c) * room : 0);
          if (g < -0.1 * c) g = -0.1 * c; // die-back toward a much lower ceiling is gradual, not a cliff
          const pr = P[k];
          let nc;
          if (pr <= 1) nc = c + (g > 0 ? g * (1 - damp * pr) : g);
          else {
            let loss = lossK * (pr - 1); if (loss > maxLoss) loss = maxLoss;
            nc = c * (1 - loss) + (g < 0 ? g : 0);
          }
          cover[k] = nc < 1e-4 ? 0 : nc > 1 ? 1 : nc;
        }
      }
    }
    this.world.vegetation.version++;
    const rect = this._dirtyRect();
    if (t0) this.lastStepMs = performance.now() - t0;
    return rect;
  }

  /** Bounding rect (world metres) of the cells whose cover moved ≥ emitThreshold since the last emit;
   * the emitted snapshot is updated for those cells only (so slow drift still accumulates to an emit). */
  _dirtyRect() {
    const r = this.res, N = this.nCells, cover = this.cover, E = this._emitted, th = VEG.emitThreshold;
    let x0 = r, z0 = r, x1 = -1, z1 = -1;
    for (let i = 0; i < N; i++) {
      let moved = false;
      for (let t = 0; t < NT; t++) { const k = t * N + i; const d = cover[k] - E[k]; if (d > th || d < -th) { moved = true; break; } }
      if (!moved) continue;
      for (let t = 0; t < NT; t++) { const k = t * N + i; E[k] = cover[k]; }
      const ix = i % r, iz = (i - ix) / r;
      if (ix < x0) x0 = ix; if (ix > x1) x1 = ix; if (iz < z0) z0 = iz; if (iz > z1) z1 = iz;
    }
    if (x1 < 0) return null;
    return this.rectOf(x0, z0, x1, z1);
  }

  rectOf(ix0, iz0, ix1, iz1) {
    const half = this.world.half ?? this.world.size / 2, c = this.cell;
    return { x0: ix0 * c - half, z0: iz0 * c - half, x1: (ix1 + 1) * c - half, z1: (iz1 + 1) * c - half };
  }

  wholeRect() { return this.rectOf(0, 0, this.res - 1, this.res - 1); }

  /**
   * Plant `type` in a disc: every cell whose centre lies within `radius` m of (x, z) — and is not water —
   * gets cover ≥ min(cover, maxCover) and its site raised to ≥ plantSite (prepared ground, so the planted
   * cover holds). Returns {cells, ha, rect} (rect null when nothing was planted). Cost is charged by the sim;
   * dryRun only counts the cells (pricing before the write).
   */
  plant(type, x, z, radius, cover = 0.25, dryRun = false) {
    const t = typeof type === 'number' ? type : PLANT_INDEX[type];
    if (t === undefined || t < 0 || t >= NT) return { cells: 0, ha: 0, rect: null, error: `unknown plant "${type}"` };
    const p = PLANTS[t], r = this.res, c = this.cell, half = this.world.half ?? this.world.size / 2, N = this.nCells;
    const R = Math.max(c * 0.5, +radius || 0);
    const target = Math.min(p.maxCover, Math.max(0, +cover || 0));
    const ix0 = Math.max(0, Math.floor((x - R + half) / c)), ix1 = Math.min(r - 1, Math.floor((x + R + half) / c));
    const iz0 = Math.max(0, Math.floor((z - R + half) / c)), iz1 = Math.min(r - 1, Math.floor((z + R + half) / c));
    let cells = 0;
    let bx0 = r, bz0 = r, bx1 = -1, bz1 = -1;
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const cx = (ix + 0.5) * c - half, cz = (iz + 0.5) * c - half;
      const dx = cx - x, dz = cz - z;
      if (dx * dx + dz * dz > R * R) continue;
      if (this._isWater(cx, cz)) continue;
      cells++;
      if (dryRun) continue;
      const k = t * N + iz * r + ix;
      if (this.site[k] < VEG.plantSite) this.site[k] = VEG.plantSite;
      if (this.cover[k] < target) this.cover[k] = target;
      if (ix < bx0) bx0 = ix; if (ix > bx1) bx1 = ix; if (iz < bz0) bz0 = iz; if (iz > bz1) bz1 = iz;
    }
    if (!cells || dryRun) return { cells, ha: cells * this.cellHa, rect: null };
    this.world.vegetation.version++;
    return { cells, ha: cells * this.cellHa, rect: this.rectOf(bx0, bz0, bx1, bz1) };
  }

  /** { [plantId]: cover } at world (x, z). */
  at(x, z) {
    const i = this.cellIndex(x, z), N = this.nCells, out = {};
    for (let t = 0; t < NT; t++) out[PLANT_IDS[t]] = +this.cover[t * N + i].toFixed(4);
    return out;
  }

  /** Vegetation cells a habitat overlaps, with the overlapped fraction of each 16 m cell (16 grid cells
   * of 4 m each). Cached on the habitat's cells array identity. */
  habitatCells(h) {
    const cache = this._hc || (this._hc = new Map());
    const hit = cache.get(h.id);
    if (hit && hit.src === h.cells && hit.len === (h.cells?.length ?? 0)) return hit;
    const w = this.world, g = w.grid, cells = h.cells || [];
    const acc = new Map();
    if (g && cells.length) {
      const gres = g.res, gc = g.cell, half = w.half ?? w.size / 2;
      const fracPer = (gc * gc) / (this.cell * this.cell);
      for (let j = 0; j < cells.length; j++) {
        const idx = cells[j], gx = idx % gres, gz = (idx - gx) / gres;
        const vi = this.cellIndex((gx + 0.5) * gc - half, (gz + 0.5) * gc - half);
        acc.set(vi, (acc.get(vi) || 0) + fracPer);
      }
    }
    const keys = [...acc.keys()].sort((a, b) => a - b);
    const out = { src: h.cells, len: cells.length, idx: Int32Array.from(keys), frac: Float32Array.from(keys.map((k) => Math.min(1, acc.get(k)))) };
    cache.set(h.id, out);
    return out;
  }

  /** Daily food yield per plant for a habitat: out[t] = Σ cells frac × cellHa × cover × food. */
  habitatYield(h, out = new Float64Array(NT)) {
    const hc = this.habitatCells(h), N = this.nCells, cover = this.cover, ha = this.cellHa;
    out.fill(0);
    for (let t = 0; t < NT; t++) {
      let s = 0; const base = t * N;
      for (let j = 0; j < hc.idx.length; j++) s += cover[base + hc.idx[j]] * hc.frac[j];
      out[t] = s * ha * PLANTS[t].food;
    }
    return out;
  }

  /** Write grazing pressure P[t] (one value per plant) into a habitat's cells, weighted by overlap
   * (cells shared by two habitats take the overlap-weighted sum). */
  addPressure(h, Pt) {
    const hc = this.habitatCells(h), N = this.nCells, P = this.pressure;
    for (let t = 0; t < NT; t++) {
      const v = Pt[t]; if (!(v > 0)) continue;
      const base = t * N;
      for (let j = 0; j < hc.idx.length; j++) P[base + hc.idx[j]] += v * hc.frac[j];
    }
  }

  clearPressure() { this.pressure.fill(0); }

  invalidateHabitats() { this._hc?.clear(); }

  /** Covered area (ha) of one plant: Σ cells with cover ≥ threshold, optionally inside a disc. */
  coveredHa(type, threshold = 0.1, x = null, z = null, radius = Infinity) {
    const t = typeof type === 'number' ? type : PLANT_INDEX[type];
    if (t === undefined) return 0;
    const r = this.res, c = this.cell, half = this.world.half ?? this.world.size / 2, N = this.nCells, cover = this.cover;
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (cover[t * N + i] < threshold) continue;
      if (x !== null) { const ix = i % r, iz = (i - ix) / r; const dx = (ix + 0.5) * c - half - x, dz = (iz + 0.5) * c - half - z; if (dx * dx + dz * dz > radius * radius) continue; }
      n++;
    }
    return n * this.cellHa;
  }

  snapshot() { return { cover: Float32Array.from(this.cover), site: Float32Array.from(this.site) }; }
  restore(s) {
    if (!s) return;
    this.cover.set(s.cover); this.site.set(s.site); this._emitted.set(s.cover);
    this.world.vegetation.version++;
  }
}

export { NT as PLANT_COUNT };
