// Shared world data model. See ARCHITECTURE.md §3 for ownership. Everyone reads; owners write + emit.
import * as THREE from 'three';

export const BIOME = Object.freeze({
  GRASS: 0, DRY_GRASS: 1, DIRT: 2, ROCK: 3, SAND: 4, WETLAND: 5, RIVERBED: 6, ROAD_DUST: 7,
});
export const ZONE = Object.freeze({ NONE: 0, HABITAT: 1, VISITOR: 2, SERVICE: 3, NO_BUILD: 4 });
export const OCC = Object.freeze({ FREE: 0, BUILDING: 1, ROAD: 2, PROP: 3, WATER: 4 });

export class World {
  constructor({ seed = 1, size = 1024, res = 513, gridCell = 4 } = {}) {
    this.seed = seed;
    this.size = size;
    this.half = size / 2;

    const cell = size / (res - 1);
    this.terrain = {
      res, cell,
      heights: new Float32Array(res * res),
      biome: new Uint8Array(res * res),
      waterLevel: -1e9,   // no water until terrain sets it
      minHeight: 0, maxHeight: 0,
      version: 0,
    };

    const gres = Math.round(size / gridCell);
    this.grid = {
      cell: gridCell, res: gres,
      zone: new Uint8Array(gres * gres),
      habitatId: new Uint16Array(gres * gres),
      occupancy: new Uint8Array(gres * gres),
      version: 0,
    };

    this.habitats = new Map();
    this.roads = { nodes: new Map(), edges: new Map(), version: 0 };
    this.buildings = new Map();
    this.animals = new Map();
    this.vehicles = new Map();
    this.visitors = { count: 0, inPark: 0, satisfaction: 0.5, seenSpecies: new Map(), log: [] };
    this.economy = { cash: 250000, income: 0, expenses: 0, ticketPrice: 25, loans: 0, history: [] };
    this.time = { hour: 12, day: 1, speed: 0.05, paused: false };
    this.weather = { cloud: 0.25, rain: 0, wind: { x: 1, z: 0.2, speed: 3 }, temperature: 28, season: 'dry', haze: 0.3 };
    this.selection = { kind: null, id: null };

    this._nextId = 1;
    this._n = new THREE.Vector3();
  }

  nextId(prefix = 'e') { return `${prefix}_${this._nextId++}`; }

  inBounds(x, z) { return x >= -this.half && x <= this.half && z >= -this.half && z <= this.half; }

  /** Heightfield sample index for integer sample coords (clamped). */
  sampleIndex(ix, iz) {
    const r = this.terrain.res;
    ix = ix < 0 ? 0 : ix >= r ? r - 1 : ix;
    iz = iz < 0 ? 0 : iz >= r ? r - 1 : iz;
    return iz * r + ix;
  }

  /** World (x,z) → fractional sample coords. */
  toSample(x, z) {
    const c = this.terrain.cell;
    return { fx: (x + this.half) / c, fz: (z + this.half) / c };
  }

  sampleToWorld(ix, iz) {
    const c = this.terrain.cell;
    return { x: ix * c - this.half, z: iz * c - this.half };
  }

  /** Bilinear height at world (x,z), clamped to bounds. */
  getHeight(x, z) {
    const t = this.terrain, r = t.res, c = t.cell, h = t.heights;
    let fx = (x + this.half) / c, fz = (z + this.half) / c;
    if (fx < 0) fx = 0; else if (fx > r - 1) fx = r - 1;
    if (fz < 0) fz = 0; else if (fz > r - 1) fz = r - 1;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const ix1 = ix < r - 1 ? ix + 1 : ix, iz1 = iz < r - 1 ? iz + 1 : iz;
    const tx = fx - ix, tz = fz - iz;
    const h00 = h[iz * r + ix], h10 = h[iz * r + ix1], h01 = h[iz1 * r + ix], h11 = h[iz1 * r + ix1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  /** Surface normal at (x,z) by central differences. */
  getNormal(x, z, out = new THREE.Vector3()) {
    const e = this.terrain.cell * 0.5;
    const hl = this.getHeight(x - e, z), hr = this.getHeight(x + e, z);
    const hd = this.getHeight(x, z - e), hu = this.getHeight(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  /** Slope in radians at (x,z). */
  getSlope(x, z) {
    const n = this.getNormal(x, z, this._n);
    return Math.acos(Math.min(1, Math.max(-1, n.y)));
  }

  isWater(x, z) { return this.getHeight(x, z) < this.terrain.waterLevel; }

  biomeAt(x, z) {
    const { fx, fz } = this.toSample(x, z);
    return this.terrain.biome[this.sampleIndex(Math.round(fx), Math.round(fz))];
  }

  /** Recompute min/max after the terrain owner edits heights. */
  updateHeightStats() {
    const h = this.terrain.heights;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < h.length; i++) { const v = h[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    this.terrain.minHeight = mn; this.terrain.maxHeight = mx;
    this.terrain.version++;
  }

  // ---- zoning / occupancy grid (4 m cells) ----
  cellAt(x, z) {
    const g = this.grid;
    let ix = Math.floor((x + this.half) / g.cell), iz = Math.floor((z + this.half) / g.cell);
    ix = ix < 0 ? 0 : ix >= g.res ? g.res - 1 : ix;
    iz = iz < 0 ? 0 : iz >= g.res ? g.res - 1 : iz;
    return { ix, iz, index: iz * g.res + ix };
  }
  cellCenter(ix, iz) {
    const g = this.grid;
    return { x: (ix + 0.5) * g.cell - this.half, z: (iz + 0.5) * g.cell - this.half };
  }
  cellIndex(ix, iz) { return iz * this.grid.res + ix; }

  /**
   * Ray vs heightfield. ray: THREE.Ray in world space. out: THREE.Vector3 hit point.
   * Returns true on hit. Coarse march at cell size then bisection refine.
   */
  raycastGround(ray, out, maxDist = 6000) {
    const o = ray.origin, d = ray.direction;
    const step = Math.max(1, this.terrain.cell);
    let t = 0;
    let px = o.x, py = o.y, pz = o.z;
    let prevAbove = py > this.getHeight(px, pz);
    // If we start below ground, treat origin as hit
    if (!prevAbove) { out.set(px, this.getHeight(px, pz), pz); return true; }
    let prevT = 0;
    while (t < maxDist) {
      t += step;
      px = o.x + d.x * t; py = o.y + d.y * t; pz = o.z + d.z * t;
      // Outside the world: allow a bounded plane hit at terrain min height so pans keep working.
      const outside = !this.inBounds(px, pz);
      const h = outside ? this.terrain.minHeight : this.getHeight(px, pz);
      const above = py > h;
      if (!above) {
        // bisection between prevT and t
        let a = prevT, b = t;
        for (let i = 0; i < 12; i++) {
          const m = (a + b) * 0.5;
          const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
          const mh = this.inBounds(mx, mz) ? this.getHeight(mx, mz) : this.terrain.minHeight;
          if (my > mh) a = m; else b = m;
        }
        const f = (a + b) * 0.5;
        out.set(o.x + d.x * f, o.y + d.y * f, o.z + d.z * f);
        return true;
      }
      prevT = t;
      if (outside && d.y >= 0) return false;
      if (outside && t > maxDist) return false;
    }
    return false;
  }

  /** Lightweight serialisable snapshot (for save/load & debugging). */
  snapshot() {
    return {
      seed: this.seed, size: this.size,
      time: { ...this.time }, weather: JSON.parse(JSON.stringify(this.weather)),
      economy: { ...this.economy, history: this.economy.history.slice(-30) },
      counts: {
        animals: this.animals.size, buildings: this.buildings.size, vehicles: this.vehicles.size,
        roadEdges: this.roads.edges.size, habitats: this.habitats.size,
      },
      visitors: { count: this.visitors.count, inPark: this.visitors.inPark, satisfaction: this.visitors.satisfaction },
    };
  }
}
