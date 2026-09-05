// SimSafari headless simulation: habitats → animal happiness → breeding/migration; visitors → satisfaction →
// reputation → arrivals; economy (tickets/lodge/shop vs staff/upkeep/feed/vet/interest); staff morale + village;
// seeded random events; daily report. Pure JS: runs in Node (test.mjs) and in the browser (index.js wrapper).
// No three, no DOM, no Math.random — every random draw goes through the injected Rng.
import { Rng } from '../../core/Rng.js';
import { SPECIES, SPECIES_ORDER, HABITAT_WEIGHTS, BUILDINGS, ROADS, STAFF, STAFF_ORDER, CONST } from './tables.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Poisson sample with the injected rng (Knuth for small λ, gaussian approximation above 30). */
function poisson(rng, lambda) {
  if (!(lambda > 0)) return 0;
  if (lambda > 30) return Math.max(0, Math.round(rng.gaussian(lambda, Math.sqrt(lambda))));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng.float(); } while (p > L);
  return k - 1;
}

/** Closeness of an actual stat to a preferred one, 1 at match, 0 when |Δ| ≥ 0.8. */
function match(pref, actual) { return clamp01(1 - Math.abs(pref - actual) * 1.25); }

/** Building type → catalogue entry (fallback table, keyword match). */
function buildingKind(type) {
  const t = String(type || '').toLowerCase().replace(/[^a-z]/g, '');
  for (const b of BUILDINGS) for (const m of b.match) if (t.includes(m)) return b;
  return BUILDINGS[BUILDINGS.length - 1];
}

function edgeLength(edge) {
  if (Number.isFinite(edge.length) && edge.length > 0) return edge.length;
  const p = edge.points;
  if (!p || p.length < 4) return 0;
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
}

/** Bell-shaped hourly arrival weights over the gate window, normalised to sum 1. */
function arrivalProfile() {
  const w = new Float64Array(24);
  const a = CONST.gateOpen, b = CONST.gateClose, mid = a + (b - a) * 0.4, sd = (b - a) / 3.2;
  let s = 0;
  for (let h = a; h < b; h++) { w[h] = Math.exp(-0.5 * ((h + 0.5 - mid) / sd) ** 2); s += w[h]; }
  for (let h = 0; h < 24; h++) w[h] /= s;
  return w;
}
const ARRIVAL_PROFILE = arrivalProfile();

export class Simulation {
  /**
   * @param {object} world  shared world model (World instance or a plain object with the same shape)
   * @param {Rng} rng       seeded generator (ctx.rng.fork('sim') in the game, new Rng(seed) in tests)
   * @param {object} hooks  optional bridges to other modules; every hook may be absent:
   *   speciesInfo(species) → partial species record merged over the fallback table
   *   buildingInfo(type)   → {upkeep, beds, quality, rate, ...} merged over the fallback catalogue
   *   spawn(species, habitatId, n) / remove(species, habitatId, n) → animals module keeps world.animals in sync
   *   takeSightings()      → Map<species, count> of real sightings since the last call (traffic module)
   *   notify(level, text)  → ui:notify
   *   emit(name, payload)  → event bus
   *   setSpeed(n)          → core time speed
   *   hasModule(id)        → whether another module is present (environment owns weather/season)
   *   log(text)
   */
  constructor(world, rng, hooks = {}) {
    this.world = world;
    this.hooks = hooks || {};
    this.rng = rng || new Rng(world?.seed ?? 1);
    this.seed = this.rng.seed;
    this._speciesCache = new Map();
    this._buildingCache = new Map();
    this.initialPopulation = null;
    this._init();
  }

  // ------------------------------------------------------------------ lifecycle

  _init() {
    const w = this.world;
    this.clock = { hour: w.time?.hour ?? 8, day: w.time?.day ?? 1, prevHour: w.time?.hour ?? 8 };
    this._lastDay = this.clock.day;
    this._peakInPark = 0;
    this._overnight = 0;
    this._arrivalAcc = 0;
    this.pop = new Map();          // habitatId → Map<species, record>
    this.staff = {};
    for (const r of STAFF_ORDER) this.staff[r] = { n: 0, wage: STAFF[r].wage };
    this.morale = 0.6;
    this.prosperity = 0.5;
    this.efficiency = 0.8;
    this.reputation = 0.5;
    this.satisfaction = w.visitors?.satisfaction ?? 0.5;
    this.attraction = 0;
    this.roadComfort = 0.15;
    this.staffCoverage = {};
    this.dayPlan = { arrivals: 0, weatherFactor: 1, seasonFactor: 1 };
    this.departures = new Float64Array(24);
    this.todayArrivals = 0;
    this.inPark = 0;
    this.lodgeNights = 0;
    this.expectedSightings = new Map();
    this.activeEvents = [];
    this.arrivalsMult = 1;
    this.eventsToday = [];
    this.negativeDays = 0;
    this.bankrupt = false;
    this.speedValue = 1;
    this.lastReport = null;
    this.reports = [];
    this.habitatStats = new Map();
    this.totals = { born: 0, died: 0, left: 0, poached: 0, predation: 0 };
    if (w.visitors) {
      w.visitors.count = 0; w.visitors.inPark = 0;
      if (!(w.visitors.seenSpecies instanceof Map)) w.visitors.seenSpecies = new Map();
      if (!Array.isArray(w.visitors.log)) w.visitors.log = [];
    }
    if (w.economy) {
      w.economy.income = 0; w.economy.expenses = 0;
      if (!Array.isArray(w.economy.history)) w.economy.history = [];
      if (!Number.isFinite(w.economy.loans)) w.economy.loans = 0;
    }
    this._planDay();
  }

  /** Restart with a new seed. Keeps the world (habitats, buildings, roads) and restores the starting population. */
  reset(seed = this.seed) {
    this.rng = new Rng(seed);
    this.seed = seed;
    const w = this.world;
    if (w.economy) { w.economy.cash = this._startCash ?? w.economy.cash; w.economy.loans = this._startLoans ?? 0; w.economy.history = []; }
    if (w.visitors) { w.visitors.seenSpecies = new Map(); w.visitors.log = []; w.visitors.satisfaction = 0.5; }
    const staff = this.staff;
    this._init();
    for (const r of STAFF_ORDER) if (staff[r]) this.staff[r] = { ...staff[r] };
    if (this.initialPopulation) for (const [hid, m] of this.initialPopulation) for (const [s, n] of m) this.setPopulation(hid, s, n);
  }

  /** Snapshot the current population/cash as the "start" state used by reset(). */
  markStart() {
    this.initialPopulation = new Map();
    for (const [hid, m] of this.pop) this.initialPopulation.set(hid, new Map([...m].map(([s, r]) => [s, r.n])));
    this._startCash = this.world.economy?.cash;
    this._startLoans = this.world.economy?.loans;
  }

  // ------------------------------------------------------------------ species / buildings

  species(name) {
    let s = this._speciesCache.get(name);
    if (s) return s;
    const base = SPECIES[name] || { diet: 'grazer', rarity: 0.4, visibility: 0.7, herd: 8, space: 1500, prefs: { grass: 0.6, trees: 0.3, water: 0.5, roughness: 0.2, cover: 0.3 }, predatorTolerance: 0.4, breed: 0.004, lifespan: 15 * 365, feed: 15, vet: 3, price: 1500, nocturnal: 0.2 };
    let ext = null;
    try { ext = this.hooks.speciesInfo?.(name) || null; } catch { ext = null; }
    s = { ...base, prefs: { ...base.prefs }, name };
    if (ext) {
      // Accept the animals module's shape defensively: flat numeric fields and a nested prefs/habitat object.
      const src = ext.prefs || ext.habitat || ext.preferences || {};
      const map = { grass: ['grass', 'grassDensity'], trees: ['trees', 'treeCover', 'shade'], water: ['water', 'waterNeed'], roughness: ['roughness', 'terrainRoughness'], cover: ['cover'] };
      for (const k in map) for (const alias of map[k]) if (Number.isFinite(src[alias])) { s.prefs[k] = clamp01(src[alias]); break; }
      for (const k of ['rarity', 'visibility', 'herd', 'space', 'predatorTolerance', 'breed', 'lifespan', 'feed', 'vet', 'price', 'nocturnal']) if (Number.isFinite(ext[k])) s[k] = ext[k];
      if (Number.isFinite(ext.appeal)) s.rarity = clamp01(ext.appeal);
      if (Number.isFinite(ext.spacePerAnimal)) s.space = ext.spacePerAnimal;
      if (Number.isFinite(ext.cost)) s.price = ext.cost;
      if (typeof ext.diet === 'string') s.diet = ext.diet;
    }
    this._speciesCache.set(name, s);
    return s;
  }

  allSpecies() { return SPECIES_ORDER.slice(); }

  building(type) {
    let b = this._buildingCache.get(type);
    if (b) return b;
    b = { ...buildingKind(type), type };
    let ext = null;
    try { ext = this.hooks.buildingInfo?.(type) || null; } catch { ext = null; }
    if (ext) for (const k of ['upkeep', 'beds', 'quality', 'rate', 'closeness', 'water', 'shop', 'vet', 'morale', 'efficiency', 'patrol', 'lodgeQuality']) if (Number.isFinite(ext[k])) b[k] = ext[k];
    this._buildingCache.set(type, b);
    return b;
  }

  invalidateCaches() { this._speciesCache.clear(); this._buildingCache.clear(); }

  // ------------------------------------------------------------------ population API

  _rec(habitatId, species, create = true) {
    let m = this.pop.get(habitatId);
    if (!m) { if (!create) return null; m = new Map(); this.pop.set(habitatId, m); }
    let r = m.get(species);
    if (!r && create) { r = { n: 0, happiness: 0.6, quality: 0.6, unhappyDays: 0, born: 0, died: 0, left: 0, capacity: 1 }; m.set(species, r); }
    return r || null;
  }

  /** Set the count of a species in a habitat (no cost, no spawn hook) — used by staging and tests. */
  setPopulation(habitatId, species, n) {
    const r = this._rec(habitatId, species);
    r.n = Math.max(0, Math.round(n));
    return r;
  }

  /** Buy animals: costs cash (price × n), asks the animals module to spawn them. Returns {ok, cost}. */
  buyAnimals(species, habitatId, n = 1) {
    const sp = this.species(species);
    const cost = sp.price * n;
    const eco = this.world.economy;
    if (eco && eco.cash < cost) { this._notify('warn', `Cannot afford ${n} ${species} ($${cost.toLocaleString()})`); return { ok: false, cost }; }
    if (eco) eco.cash -= cost;
    const r = this._rec(habitatId, species);
    r.n += n;
    this._spawn(species, habitatId, n);
    this._notify('info', `Bought ${n} ${species} for $${cost.toLocaleString()}`);
    return { ok: true, cost };
  }

  /** Total count of a species across the park (or all animals when species is omitted). */
  count(species) {
    let n = 0;
    for (const m of this.pop.values()) for (const [s, r] of m) if (!species || s === species) n += r.n;
    return n;
  }

  population() {
    const out = {};
    for (const m of this.pop.values()) for (const [s, r] of m) if (r.n > 0) out[s] = (out[s] || 0) + r.n;
    return out;
  }

  happinessBySpecies() {
    const sum = {}, cnt = {};
    for (const m of this.pop.values()) for (const [s, r] of m) if (r.n > 0) { sum[s] = (sum[s] || 0) + r.happiness * r.n; cnt[s] = (cnt[s] || 0) + r.n; }
    const out = {};
    for (const s in sum) out[s] = +(sum[s] / cnt[s]).toFixed(3);
    return out;
  }

  _spawn(species, habitatId, n) { try { this.hooks.spawn?.(species, habitatId, n); } catch (e) { this._log('spawn hook failed: ' + e.message); } }
  _remove(species, habitatId, n) { try { this.hooks.remove?.(species, habitatId, n); } catch (e) { this._log('remove hook failed: ' + e.message); } }
  _notify(level, text) { try { this.hooks.notify?.(level, text); } catch {} }
  _emit(name, payload) { try { this.hooks.emit?.(name, payload); } catch {} }
  _log(text) { try { this.hooks.log?.(text); } catch {} }

  /** When the animals module owns world.animals, take its counts as truth (habitat = grid cell the animal stands on). */
  reconcileFromWorld() {
    const w = this.world;
    if (!w.animals || w.animals.size === 0 || !w.grid || typeof w.cellAt !== 'function') return false;
    for (const m of this.pop.values()) for (const r of m.values()) r.n = 0;
    for (const a of w.animals.values()) {
      if (!a || !a.species) continue;
      let hid = a.habitat ?? a.habitatId;
      if (hid === undefined || hid === null) {
        const c = w.cellAt(a.x, a.z);
        const id = w.grid.habitatId[c.index];
        hid = id || 0;
      }
      this._rec(hid, a.species).n++;
    }
    return true;
  }

  // ------------------------------------------------------------------ habitat statistics + quality

  /** Derive the per-habitat statistics the scorer needs. Cached per day; call with force=true after edits. */
  habitatStat(habitat, force = false) {
    const hid = habitat.id;
    const key = `${this.clock.day}`;
    let st = this.habitatStats.get(hid);
    if (st && st.key === key && !force) return st;
    const w = this.world;
    const cells = habitat.cells || [];
    const cellArea = (w.grid?.cell || 4) ** 2;
    const area = habitat.area > 0 ? habitat.area : cells.length * cellArea;
    // grass / roughness from terrain when the terrain module has built it, otherwise from hints on the habitat
    let grass = Number.isFinite(habitat.grass) ? habitat.grass : 0.6;
    let roughness = Number.isFinite(habitat.roughness) ? habitat.roughness : 0.15;
    const terrainReady = w.terrain && w.terrain.version > 0 && cells.length > 0 && w.grid;
    if (terrainReady) {
      const step = Math.max(1, Math.floor(cells.length / 48));
      let g = 0, rsum = 0, n = 0;
      const gres = w.grid.res, gcell = w.grid.cell, half = w.half ?? w.size / 2;
      for (let i = 0; i < cells.length; i += step) {
        const idx = cells[i];
        const ix = idx % gres, iz = (idx - ix) / gres;
        const x = (ix + 0.5) * gcell - half, z = (iz + 0.5) * gcell - half;
        const b = typeof w.biomeAt === 'function' ? w.biomeAt(x, z) : 0;
        g += b === 0 ? 1 : b === 1 ? 0.6 : b === 5 ? 0.7 : 0;
        if (typeof w.getHeight === 'function') {
          const h0 = w.getHeight(x, z), h1 = w.getHeight(x + gcell, z), h2 = w.getHeight(x, z + gcell);
          rsum += (Math.abs(h1 - h0) + Math.abs(h2 - h0)) / gcell;
        }
        n++;
      }
      if (n > 0) { grass = g / n; roughness = clamp01(rsum / n * 2.5); }
    }
    // buildings inside the habitat
    let waterholes = 0, hidesNear = 0;
    if (w.buildings && w.grid && typeof w.cellAt === 'function') {
      for (const b of w.buildings.values()) {
        if (!b) continue;
        const c = w.cellAt(b.x, b.z);
        const k = this.building(b.type);
        if (w.grid.habitatId[c.index] === hid) { if (k.water) waterholes += k.water; if (k.closeness) hidesNear++; }
      }
    }
    const drought = this._eventStrength('drought');
    const water = clamp01((habitat.water ?? 0.3) + waterholes - drought * 0.35);
    const shade = clamp01(habitat.shade ?? 0.3);
    const cover = clamp01(habitat.cover ?? 0.3);
    const roadCoverage = this._roadCoverage(habitat);
    st = { key, id: hid, area, water, shade, cover, grass: clamp01(grass * (1 - drought * 0.3)), roughness, roadCoverage, waterholes, hidesNear, drought };
    this.habitatStats.set(hid, st);
    return st;
  }

  /** Fraction of a habitat's cells within 80 m of a road point (visitors can only see what roads reach). */
  _roadCoverage(habitat) {
    const w = this.world;
    const cells = habitat.cells || [];
    const edges = w.roads?.edges;
    if (!edges || edges.size === 0 || !cells.length || !w.grid) return Number.isFinite(habitat.roadCoverage) ? habitat.roadCoverage : 0;
    // road points (subsampled)
    const pts = [];
    for (const e of edges.values()) { const p = e.points; if (!p) continue; for (let i = 0; i < p.length; i += 8) pts.push(p[i], p[i + 1]); }
    if (!pts.length) return 0;
    const gres = w.grid.res, gcell = w.grid.cell, half = w.half ?? w.size / 2;
    const step = Math.max(1, Math.floor(cells.length / 40));
    let near = 0, n = 0;
    const R2 = 80 * 80;
    for (let i = 0; i < cells.length; i += step) {
      const idx = cells[i];
      const ix = idx % gres, iz = (idx - ix) / gres;
      const x = (ix + 0.5) * gcell - half, z = (iz + 0.5) * gcell - half;
      let hit = false;
      for (let j = 0; j < pts.length; j += 2) { const dx = pts[j] - x, dz = pts[j + 1] - z; if (dx * dx + dz * dz < R2) { hit = true; break; } }
      if (hit) near++;
      n++;
    }
    return n ? near / n : 0;
  }

  _habitatCounts(hid) {
    const m = this.pop.get(hid);
    let predators = 0, prey = 0;
    if (m) for (const [s, r] of m) { if (r.n <= 0) continue; if (this.species(s).diet === 'predator') predators += r.n; else prey += r.n; }
    return { predators, prey };
  }

  /**
   * Habitat quality for a species in [0,1]: weighted match of preferences (grass, trees/shade, water, roughness,
   * cover) + space (area vs carrying capacity) + predator pressure (prey) / prey availability (predators).
   * habitat: habitat object or id. opts.n overrides the animal count used for the space term.
   */
  scoreHabitat(habitat, species, opts = {}) {
    const w = this.world;
    const h = typeof habitat === 'object' && habitat ? habitat : w.habitats?.get(habitat);
    if (!h) return 0;
    const sp = this.species(species);
    const st = this.habitatStat(h);
    const W = HABITAT_WEIGHTS, p = sp.prefs;
    const waterScore = st.water >= p.water ? 1 : clamp01(st.water / Math.max(0.05, p.water)) ** 1.5;
    const rec = this._rec(h.id, species, false);
    const n = Number.isFinite(opts.n) ? opts.n : rec ? rec.n : 0;
    const capacity = Math.max(1, Math.floor(st.area / sp.space));
    const spaceScore = n <= 0 ? 1 : clamp01(capacity / n) ** 0.7;
    const { predators, prey } = this._habitatCounts(h.id);
    let predScore;
    if (sp.diet === 'predator') predScore = clamp01(prey / Math.max(1, predators * 8)); // 8 prey per predator
    else { const pressure = clamp01(predators * 3 / Math.max(1, prey)); predScore = 1 - pressure * (1 - sp.predatorTolerance); }
    const q = W.grass * match(p.grass, st.grass) + W.trees * match(p.trees, st.shade) + W.water * waterScore
      + W.roughness * match(p.roughness, st.roughness) + W.cover * match(p.cover, st.cover) + W.space * spaceScore + W.predator * predScore;
    // vital needs gate the whole score: no water for a water-dependent species, or no prey for a predator,
    // makes the habitat unliveable no matter how nice the grass is.
    const vital = Math.pow(0.3 + 0.7 * waterScore, p.water) * (sp.diet === 'predator' ? 0.4 + 0.6 * predScore : 1);
    return clamp01(q * vital);
  }

  /** Per-term breakdown of a habitat score (for UI tooltips and tests). */
  explainHabitat(habitat, species) {
    const h = typeof habitat === 'object' && habitat ? habitat : this.world.habitats?.get(habitat);
    if (!h) return null;
    const sp = this.species(species), st = this.habitatStat(h), p = sp.prefs;
    const { predators, prey } = this._habitatCounts(h.id);
    const rec = this._rec(h.id, species, false);
    const n = rec ? rec.n : 0;
    const capacity = Math.max(1, Math.floor(st.area / sp.space));
    const water = st.water >= p.water ? 1 : clamp01(st.water / Math.max(0.05, p.water)) ** 1.5;
    const predator = sp.diet === 'predator' ? clamp01(prey / Math.max(1, predators * 8)) : 1 - clamp01(predators * 3 / Math.max(1, prey)) * (1 - sp.predatorTolerance);
    return {
      grass: match(p.grass, st.grass), trees: match(p.trees, st.shade), water,
      roughness: match(p.roughness, st.roughness), cover: match(p.cover, st.cover), space: n <= 0 ? 1 : clamp01(capacity / n) ** 0.7,
      predator, vital: Math.pow(0.3 + 0.7 * water, p.water) * (sp.diet === 'predator' ? 0.4 + 0.6 * predator : 1),
      weights: HABITAT_WEIGHTS, capacity, n, stats: st, total: this.scoreHabitat(h, species),
    };
  }

  // ------------------------------------------------------------------ time

  /**
   * Advance the simulation. simDt in game-hours. When hour/day are given (core-driven), the clock follows them;
   * otherwise it advances internally (headless runs).
   */
  tick(simDt, hour, day) {
    const c = this.clock;
    if (Number.isFinite(hour) && Number.isFinite(day)) { c.hour = hour; c.day = day; }
    else { c.hour += simDt; while (c.hour >= 24) { c.hour -= 24; c.day++; } }
    // day rollover(s) — bounded so a paused/jumped clock cannot run away
    let guard = 0;
    while (c.day > (this._lastDay ?? c.day) && guard++ < 5) { this._endDay(this._lastDay); this._lastDay++; this._planDay(); }
    this._lastDay = c.day;
    // hour boundary
    const h0 = Math.floor(c.prevHour), h1 = Math.floor(c.hour);
    if (h1 !== h0) this._hourBoundary(h1);
    // continuous visitor arrivals inside the gate window
    if (c.hour >= CONST.gateOpen && c.hour < CONST.gateClose) {
      const slot = Math.floor(c.hour);
      const n = this.dayPlan.arrivals * ARRIVAL_PROFILE[slot] * simDt;
      this._arrivalAcc = (this._arrivalAcc || 0) + n;
      const whole = Math.floor(this._arrivalAcc);
      if (whole > 0) {
        this._arrivalAcc -= whole;
        this.todayArrivals += whole;
        this.inPark += whole;
        this.departures[(slot + CONST.tourHours) % 24] += whole;
      }
    }
    c.prevHour = c.hour;
    if (this.inPark > this._peakInPark) this._peakInPark = this.inPark;
    const v = this.world.visitors;
    if (v) { v.count = this.todayArrivals; v.inPark = Math.round(this.inPark); }
  }

  /** Run n whole days headlessly at 10 ticks per game-hour (matches core's fixed sim rate). */
  runDays(n, ticksPerHour = 10) {
    const step = 1 / ticksPerHour;
    const total = n * 24 * ticksPerHour;
    for (let i = 0; i < total; i++) this.tick(step);
    return this.lastReport;
  }

  _hourBoundary(h) {
    const leaving = this.departures[h];
    if (leaving > 0) { this.inPark = Math.max(0, this.inPark - leaving); this.departures[h] = 0; }
    if (h === 17) {
      // lodge check-in
      const lodge = this._lodge();
      const want = Math.round(this.todayArrivals * CONST.lodgeShare * lodge.quality * (0.5 + 0.5 * this.satisfaction));
      this.lodgeNights = lodge.beds > 0 ? Math.min(lodge.beds, want) : 0;
      this.inPark += this.lodgeNights;
    }
    if (h === 9 && this._overnight > 0) { this.inPark = Math.max(0, this.inPark - this._overnight); this._overnight = 0; }
  }

  // ------------------------------------------------------------------ daily plan

  _season() {
    const w = this.world;
    const owned = this.hooks.hasModule?.('environment');
    if (owned && w.weather?.season) return w.weather.season;
    return Math.floor((this.clock.day - 1) / CONST.seasonLength) % 2 === 0 ? 'dry' : 'wet';
  }

  _weatherToday() {
    const w = this.world.weather || {};
    const owned = this.hooks.hasModule?.('environment');
    if (owned) return { cloud: w.cloud ?? 0.2, rain: w.rain ?? 0 };
    // internal fallback: wet season rains ~40 % of days, dry season ~5 %
    const wet = this._season() === 'wet';
    const rain = this.rng.bool(wet ? 0.4 : 0.05) ? this.rng.range(0.3, 1) : 0;
    const cloud = clamp01(rain > 0 ? 0.6 + rain * 0.4 : this.rng.range(0, wet ? 0.6 : 0.35));
    return { cloud, rain };
  }

  _planDay() {
    const eco = this.world.economy || { ticketPrice: CONST.refPrice };
    const price = Math.max(1, eco.ticketPrice || CONST.refPrice);
    const priceFactor = clamp(Math.pow(CONST.refPrice / price, CONST.priceElasticity), 0.05, 2.0);
    const season = this._season();
    const seasonFactor = season === 'dry' ? 1.0 : 0.8;
    const wx = this._weatherToday();
    const weatherFactor = clamp(1 - 0.5 * wx.rain - 0.2 * wx.cloud, 0.3, 1);
    const repFactor = 0.25 + 1.5 * this.reputation;
    this.attraction = this._attraction();
    const attractionFactor = 0.4 + 0.8 * this.attraction;
    const noise = clamp(this.rng.gaussian(1, 0.08), 0.7, 1.3);
    const arrivals = CONST.baseArrivals * repFactor * priceFactor * seasonFactor * weatherFactor * attractionFactor * this.arrivalsMult * noise;
    this.dayPlan = { arrivals: this.bankrupt ? 0 : Math.max(0, arrivals), price, priceFactor, season, seasonFactor, weather: wx, weatherFactor, repFactor, attractionFactor, noise };
    this.todayArrivals = 0;
    this._arrivalAcc = 0;
    this._overnight = this.lodgeNights;
    this.lodgeNights = 0;
    this.eventsToday = [];
  }

  /** Attraction index of the park: rarity-weighted species presence (0..1). */
  _attraction() {
    const pop = this.population();
    let a = 0;
    for (const s in pop) { const sp = this.species(s); a += sp.rarity * Math.min(1, pop[s] / Math.max(1, sp.herd * 0.5)); }
    return clamp01(a / 6);
  }

  // ------------------------------------------------------------------ end of day

  _endDay(day) {
    const w = this.world;
    // 0. take the animals module's counts as truth if it is running
    this.reconcileFromWorld();
    // 1. visitors of the day → satisfaction → reputation
    const vis = this._visitorsEndDay();
    // 2. habitats → happiness → births/deaths/migration
    const popInfo = this._populationStep(day);
    // 3. staff morale, upkeep efficiency, village prosperity
    this._staffStep(vis);
    // 4. random events
    this._eventsStep(day, vis);
    // 5. economy
    const eco = this._economyStep(day, vis);
    // 6. report
    const report = {
      day, cash: Math.round(eco.cash), income: Math.round(eco.income), expenses: Math.round(eco.expenses), net: Math.round(eco.income - eco.expenses),
      incomeBreakdown: eco.incomeBreakdown, expenseBreakdown: eco.expenseBreakdown,
      visitors: vis.arrivals, inParkPeak: vis.peak, lodgeNights: vis.lodgeNights, satisfaction: +vis.satisfaction.toFixed(3), satisfactionBreakdown: vis.breakdown,
      reputation: +this.reputation.toFixed(3), attraction: +this.attraction.toFixed(3),
      population: this.population(), happiness: this.happinessBySpecies(), habitats: popInfo.habitats,
      born: popInfo.born, died: popInfo.died, left: popInfo.left, predation: popInfo.predation,
      staff: Object.fromEntries(STAFF_ORDER.map((r) => [r, this.staff[r].n])), staffCoverage: this.staffCoverage,
      morale: +this.morale.toFixed(3), prosperity: +this.prosperity.toFixed(3), efficiency: +this.efficiency.toFixed(3),
      season: this.dayPlan.season, weather: this.dayPlan.weather, loans: Math.round(w.economy?.loans || 0), bankrupt: this.bankrupt,
      events: this.eventsToday.slice(), activeEvents: this.activeEvents.map((e) => ({ type: e.type, daysLeft: e.until - day, species: e.species })),
    };
    this.lastReport = report;
    this.reports.push(report);
    if (this.reports.length > 120) this.reports.shift();
    if (w.visitors) {
      w.visitors.satisfaction = vis.satisfaction;
      w.visitors.log.push({ day, arrivals: vis.arrivals, satisfaction: +vis.satisfaction.toFixed(3), sightings: vis.sightings });
      if (w.visitors.log.length > 60) w.visitors.log.shift();
    }
    this._emit('economy:updated', { cash: report.cash, income: report.income, expenses: report.expenses, day });
    this._emit('sim:day', { day, report });
  }

  // ---- visitors

  _lodge() {
    let beds = 0, quality = 0, extra = 0, count = 0;
    const w = this.world;
    if (w.buildings) for (const b of w.buildings.values()) {
      if (!b || b.state === 'construction' || b.state === 'building') continue;
      const k = this.building(b.type);
      if (k.beds) { beds += k.beds; quality += k.quality ?? 0.6; count++; }
      if (k.lodgeQuality) extra += k.lodgeQuality;
    }
    quality = count ? clamp01(quality / count + extra) : 0;
    return { beds, quality, rate: this.building('lodge').rate || 120 };
  }

  _buildingCounts() {
    const out = { hides: 0, shops: 0, vet: 0, rangerStations: 0, morale: 0, efficiency: 0, closeness: 0, total: 0 };
    const w = this.world;
    if (w.buildings) for (const b of w.buildings.values()) {
      if (!b || b.state === 'construction' || b.state === 'building') continue;
      const k = this.building(b.type);
      out.total++;
      if (k.closeness) { out.hides++; out.closeness += k.closeness; }
      if (k.shop) out.shops += k.shop;
      if (k.vet) out.vet += k.vet;
      if (k.patrol) out.rangerStations += k.patrol;
      if (k.morale) out.morale += k.morale;
      if (k.efficiency) out.efficiency += k.efficiency;
    }
    return out;
  }

  _roads() {
    const w = this.world;
    let km = 0, comfortSum = 0;
    const byKind = { dirt: 0, gravel: 0, paved: 0 };
    if (w.roads?.edges) for (const e of w.roads.edges.values()) {
      const L = edgeLength(e) / 1000;
      const kind = ROADS[e.kind] ? e.kind : 'dirt';
      km += L; byKind[kind] += L; comfortSum += L * ROADS[kind].comfort;
    }
    return { km, byKind, comfort: km > 0 ? comfortSum / km : 0 };
  }

  _visitorsEndDay() {
    const w = this.world;
    const arrivals = this.todayArrivals;
    const roads = this._roads();
    const bld = this._buildingCounts();
    const lodge = this._lodge();
    // expected sighting probability per species (statistical tour)
    const P = new Map();
    let realTotal = 0, real = null;
    try { real = this.hooks.takeSightings?.() || null; } catch { real = null; }
    if (real) for (const n of real.values()) realTotal += n;
    const hids = [...this.pop.keys()].sort();
    const bySpecies = {};
    for (const hid of hids) {
      const h = w.habitats?.get(hid);
      const cov = h ? this.habitatStat(h).roadCoverage : 0.5;
      for (const [s, r] of this.pop.get(hid)) { if (r.n <= 0) continue; bySpecies[s] = (bySpecies[s] || 0) + r.n * (0.25 + 0.75 * cov); }
    }
    for (const s in bySpecies) {
      const sp = this.species(s);
      let p = 1 - Math.exp(-bySpecies[s] * sp.visibility * (1 - 0.5 * sp.nocturnal) * CONST.sightingK);
      if (realTotal > 0 && real.has(s)) p = 0.5 * p + 0.5 * clamp01(real.get(s) * CONST.groupSize / Math.max(CONST.groupSize, arrivals));
      P.set(s, p);
    }
    this.expectedSightings = P;
    // seenSpecies bookkeeping
    let sightings = 0, variety = 0, rarity = 0;
    for (const [s, p] of P) {
      const seen = Math.round(p * arrivals);
      if (w.visitors?.seenSpecies) w.visitors.seenSpecies.set(s, (w.visitors.seenSpecies.get(s) || 0) + seen);
      sightings += seen; variety += p; rarity += p * this.species(s).rarity;
    }
    // road condition (maintenance efficiency) → comfort
    const condition = 0.6 + 0.4 * this.efficiency;
    this.roadComfort = roads.km > 0 ? roads.comfort * condition : 0.15;
    const guideCov = this.staffCoverage.guide ?? 0;
    const closeness = clamp01(bld.closeness + 0.5 * this._avgRoadCoverage() + 0.2 * guideCov);
    const lodgeScore = lodge.beds > 0 ? clamp01(0.4 + 0.6 * lodge.quality) : 0.35;
    const price = this.dayPlan.price;
    const fairPrice = 12 + 40 * this.attraction;
    const fairness = clamp01(1 - (price - fairPrice) / fairPrice); // gouging above the fair price is punished linearly
    const capacity = roads.km * 25 + bld.hides * 10 + 30;
    const crowd = clamp01(this._peakInPark / capacity);
    const breakdown = {
      variety: clamp01(variety / 7), rarity: clamp01(rarity / 2.5), closeness, roadComfort: clamp01(this.roadComfort), lodge: lodgeScore, fairness, crowding: 1 - crowd,
    };
    let S = 0.25 * breakdown.variety + 0.15 * breakdown.rarity + 0.15 * breakdown.closeness + 0.10 * breakdown.roadComfort + 0.10 * breakdown.lodge + 0.15 * breakdown.fairness + 0.10 * breakdown.crowding;
    S += this._eventStrength('badpress') * -0.1;
    S = clamp01(S + this.rng.gaussian(0, 0.02));
    if (arrivals > 0) this.satisfaction = S; // no visitors → no new opinion
    // reputation: EMA of satisfaction, weighted by how many people had an opinion
    const weight = clamp01(arrivals / 20);
    this.reputation = clamp01(this.reputation + CONST.reputationRate * weight * (S - this.reputation));
    const out = { arrivals, peak: Math.round(this._peakInPark || 0), lodgeNights: this.lodgeNights, satisfaction: this.satisfaction, breakdown, sightings, roads, buildings: bld, lodge, P };
    this._peakInPark = 0;
    return out;
  }

  _avgRoadCoverage() {
    const w = this.world;
    if (!w.habitats || w.habitats.size === 0) return 0.5;
    let s = 0, n = 0;
    for (const h of w.habitats.values()) { s += this.habitatStat(h).roadCoverage; n++; }
    return n ? s / n : 0;
  }

  // ---- population

  _populationStep(day) {
    const w = this.world;
    const wet = this._season() === 'wet';
    const keeperCov = this.staffCoverage.keeper ?? 0.5;
    const bld = this._buildingCounts();
    const habitats = {};
    let born = 0, died = 0, left = 0, predation = 0;
    const hids = [...this.pop.keys()].sort();
    for (const hid of hids) {
      const m = this.pop.get(hid);
      const h = w.habitats?.get(hid);
      const st = h ? this.habitatStat(h) : null;
      const { predators, prey } = this._habitatCounts(hid);
      // predation: each predator takes CONST.predationRate prey per day, spread over prey species by count
      const kills = predators > 0 && prey > 0 ? poisson(this.rng, Math.min(prey, predators * CONST.predationRate)) : 0;
      let killsLeft = kills;
      const info = { id: hid, name: h?.name || String(hid), species: {} };
      const order = SPECIES_ORDER.filter((k) => m.has(k)).concat([...m.keys()].filter((k) => !SPECIES[k]).sort());
      for (const s of order) {
        const r = m.get(s);
        const sp = this.species(s);
        if (r.n <= 0) { r.happiness = 0.6; r.unhappyDays = 0; continue; }
        // quality + happiness
        const Q = h ? this.scoreHabitat(h, s) : 0.4;
        r.quality = Q;
        r.capacity = st ? Math.max(1, Math.floor(st.area / sp.space)) : 1;
        const disease = this._diseaseFor(s);
        // happiness = habitat quality, modulated by keeper care (a well-kept animal in a bad habitat is still unhappy)
        const care = clamp01(keeperCov) * (0.6 + 0.4 * this.morale);
        let hTarget = Q * (0.7 + 0.3 * care) - 0.10 * disease;
        if (r.n > r.capacity) hTarget -= 0.2 * (r.n / r.capacity - 1);
        hTarget = clamp01(hTarget);
        // blend with the animals module's own happiness if it reports one
        const observed = this._observedHappiness(hid, s);
        if (observed !== null) hTarget = 0.5 * hTarget + 0.5 * observed;
        r.happiness = clamp01(lerp(r.happiness, hTarget, 0.35));
        // births
        let b = 0;
        if (r.n >= 2) {
          const drive = clamp01((r.happiness - 0.5) / 0.5);
          const room = clamp01(1 - r.n / r.capacity);
          b = poisson(this.rng, r.n * sp.breed * drive * room * (wet ? 1.3 : 1));
        }
        // deaths: age + unhappiness + disease + drought (water lovers)
        let mort = 1 / sp.lifespan + CONST.unhappyMortality * clamp01((0.55 - r.happiness) / 0.55) ** 2;
        if (disease) mort += 0.03 * (1 - 0.5 * Math.min(1, bld.vet)) * (1 - 0.3 * keeperCov);
        if (st && st.drought > 0 && sp.prefs.water > 0.6) mort += 0.004 * st.drought;
        let d = Math.min(r.n, poisson(this.rng, r.n * mort));
        // predation share for prey
        if (killsLeft > 0 && sp.diet !== 'predator' && prey > 0) {
          const share = Math.min(killsLeft, Math.round(kills * r.n / prey));
          d = Math.min(r.n, d + share); killsLeft -= share; predation += share;
        }
        // migration: 3 consecutive days under the threshold → a share leaves each day
        let l = 0;
        if (r.happiness < CONST.migrationThreshold) r.unhappyDays++; else r.unhappyDays = 0;
        if (r.unhappyDays >= CONST.migrationDays && r.n - d > 0) {
          l = Math.min(r.n - d, Math.max(1, Math.round((r.n - d) * CONST.migrationShare)));
          if (r.unhappyDays === CONST.migrationDays) this._notify('warn', `${s} are leaving ${info.name}: habitat unsuitable (happiness ${(r.happiness * 100).toFixed(0)} %)`);
        }
        const n0 = r.n;
        r.n = Math.max(0, r.n + b - d - l);
        r.born += b; r.died += d; r.left += l;
        born += b; died += d; left += l;
        if (b > 0) this._spawn(s, hid, b);
        if (d + l > 0) this._remove(s, hid, Math.min(n0, d + l));
        if (b > 0 && sp.rarity >= 0.8) this._notify('info', `A ${s} was born in ${info.name}`);
        info.species[s] = { n: r.n, happiness: +r.happiness.toFixed(3), quality: +Q.toFixed(3), capacity: r.capacity, born: b, died: d, left: l, unhappyDays: r.unhappyDays };
      }
      habitats[hid] = info;
    }
    this.totals.born += born; this.totals.died += died; this.totals.left += left; this.totals.predation += predation;
    return { habitats, born, died, left, predation };
  }

  _observedHappiness(hid, species) {
    const w = this.world;
    if (!w.animals || w.animals.size === 0 || !w.grid || typeof w.cellAt !== 'function') return null;
    let s = 0, n = 0;
    for (const a of w.animals.values()) {
      if (!a || a.species !== species || !Number.isFinite(a.happiness)) continue;
      const ahid = a.habitat ?? a.habitatId ?? (w.grid.habitatId[w.cellAt(a.x, a.z).index] || 0);
      if (ahid !== hid) continue;
      s += a.happiness; n++;
    }
    return n ? clamp01(s / n) : null;
  }

  // ---- staff / village

  _staffNeeds(arrivals) {
    const w = this.world;
    let areaHa = 0;
    if (w.habitats) for (const h of w.habitats.values()) areaHa += this.habitatStat(h).area / 10000;
    const animals = this.count();
    const roads = this._roads();
    const bld = this._buildingCounts();
    const lodge = this._lodge();
    return {
      ranger: Math.max(1, Math.ceil(areaHa / STAFF.ranger.covers)),
      keeper: Math.max(animals > 0 ? 1 : 0, Math.ceil(animals / STAFF.keeper.covers)),
      guide: Math.max(1, Math.ceil(Math.max(arrivals, this.dayPlan.arrivals) / STAFF.guide.covers)),
      maintenance: Math.max(1, Math.ceil((bld.total + roads.km) / STAFF.maintenance.covers)),
      lodge: lodge.beds > 0 ? Math.max(1, Math.ceil(lodge.beds / STAFF.lodge.covers)) : 0,
    };
  }

  _staffStep(vis) {
    const needs = this._staffNeeds(vis.arrivals);
    const cov = {};
    let wageSum = 0, wageN = 0, covSum = 0, covN = 0;
    for (const r of STAFF_ORDER) {
      const have = this.staff[r].n, need = needs[r];
      cov[r] = need > 0 ? clamp01(have / need) : 1;
      if (need > 0) { covSum += cov[r]; covN++; }
      if (have > 0) { wageSum += (this.staff[r].wage / STAFF[r].wage) * have; wageN += have; }
    }
    this.staffCoverage = cov;
    this.staffNeeds = needs;
    const wageFactor = wageN ? clamp(wageSum / wageN, 0, 1.4) : 1;
    const coverage = covN ? covSum / covN : 1;
    const bld = this._buildingCounts();
    // morale: wages vs reference, park success (reputation), workload; staff village helps
    const target = clamp01(0.45 * clamp01(wageFactor - 0.3) / 0.7 * 0.7 + 0.30 * this.reputation + 0.25 * coverage + bld.morale);
    this.morale = clamp01(lerp(this.morale, target, CONST.moraleRate));
    this.efficiency = clamp01(0.5 + 0.5 * this.morale + bld.efficiency);
    // village prosperity: park visitors + morale + employment
    const totalStaff = STAFF_ORDER.reduce((a, r) => a + this.staff[r].n, 0);
    const totalNeed = STAFF_ORDER.reduce((a, r) => a + needs[r], 0);
    const pTarget = clamp01(0.5 * clamp01(vis.arrivals / 200) + 0.3 * this.morale + 0.2 * clamp01(totalStaff / Math.max(1, totalNeed)));
    this.prosperity = clamp01(lerp(this.prosperity, pTarget, CONST.prosperityRate));
  }

  // ---- events

  _eventStrength(type) {
    let s = 0;
    for (const e of this.activeEvents) if (e.type === type) s = Math.max(s, e.strength ?? 1);
    return s;
  }
  _diseaseFor(species) { for (const e of this.activeEvents) if (e.type === 'disease' && e.species === species) return 1; return 0; }

  _addEvent(day, ev) {
    ev.day = day;
    if (ev.duration) { ev.until = day + ev.duration; this.activeEvents.push(ev); }
    this.eventsToday.push({ type: ev.type, text: ev.text, day, level: ev.level || 'info', species: ev.species, duration: ev.duration || 0, cost: ev.cost || 0 });
    this._notify(ev.level || 'info', ev.text);
    this._emit('sim:event', { day, type: ev.type, text: ev.text, species: ev.species });
  }

  _eventsStep(day, vis) {
    const rng = this.rng;
    const season = this._season();
    // expire
    for (let i = this.activeEvents.length - 1; i >= 0; i--) {
      const e = this.activeEvents[i];
      if (day >= e.until) {
        this.activeEvents.splice(i, 1);
        if (e.type === 'viral') this.arrivalsMult = 1;
        if (e.type === 'drought') { this._notify('info', 'The rains have returned: the drought is over'); for (const h of this.habitatStats.values()) h.key = ''; }
        if (e.type === 'disease') this._notify('info', `The ${e.species} outbreak has run its course`);
      }
    }
    const rangerCov = this.staffCoverage.ranger ?? 0;
    const bld = this._buildingCounts();
    const pop = this.population();
    const speciesPresent = Object.keys(pop);
    // drought (dry season only, one at a time)
    if (season === 'dry' && !this._eventStrength('drought') && rng.bool(0.012)) {
      const d = rng.int(10, 25);
      this._addEvent(day, { type: 'drought', level: 'warn', duration: d, strength: rng.range(0.6, 1), text: `Drought: water holes are shrinking across the park (about ${d} days)` });
      for (const h of this.habitatStats.values()) h.key = '';
    }
    // poachers: more likely with low morale, poor ranger coverage, low village prosperity
    const poachP = clamp(0.004 + 0.03 * (1 - this.morale) + 0.02 * (1 - rangerCov) - 0.008 * this.prosperity - 0.004 * Math.min(2, bld.rangerStations), 0.001, 0.08);
    if (speciesPresent.length && rng.bool(poachP)) {
      const targets = speciesPresent.filter((s) => this.species(s).rarity >= 0.7);
      const s = targets.length ? rng.pick(targets) : rng.pick(speciesPresent);
      const n = Math.min(pop[s], rng.int(1, 3));
      if (n > 0) {
        this._killAnimals(s, n);
        this.totals.poached += n;
        this.reputation = clamp01(this.reputation - 0.05);
        this._addEvent(day, { type: 'poachers', level: 'error', species: s, text: `Poachers killed ${n} ${s}! Rangers ${rangerCov < 0.7 ? 'are stretched thin' : 'gave chase'}` });
      }
    }
    // disease: more likely when crowded, less with a vet clinic
    let crowding = 0;
    for (const m of this.pop.values()) for (const r of m.values()) if (r.n > 0) crowding = Math.max(crowding, r.n / Math.max(1, r.capacity));
    const diseaseP = clamp(0.005 * (1 + crowding) * (1 - 0.4 * Math.min(1, bld.vet)), 0.001, 0.05);
    if (speciesPresent.length && !this.activeEvents.some((e) => e.type === 'disease') && rng.bool(diseaseP)) {
      const s = rng.pick(speciesPresent);
      const d = rng.int(7, 14);
      this._addEvent(day, { type: 'disease', level: 'warn', species: s, duration: d, text: `Disease outbreak among the ${s} (vet costs up, ${d} days)` });
    }
    // viral review (good) / bad press
    if (vis.arrivals > 20 && vis.satisfaction > 0.7 && !this._eventStrength('viral') && rng.bool(0.02)) {
      this.reputation = clamp01(this.reputation + 0.12);
      this.arrivalsMult = 1.6;
      this._addEvent(day, { type: 'viral', level: 'info', duration: 5, text: 'A travel writer raved about the park: bookings surge for a week' });
    } else if (vis.arrivals > 20 && vis.satisfaction < 0.4 && !this._eventStrength('badpress') && rng.bool(0.03)) {
      this.reputation = clamp01(this.reputation - 0.10);
      this._addEvent(day, { type: 'badpress', level: 'warn', duration: 6, strength: 1, text: 'Bad press: a newspaper calls the park "a dusty disappointment"' });
    }
    // conservation grant
    if (this.reputation > 0.6 && rng.bool(0.005)) {
      const amt = 20000;
      if (this.world.economy) this.world.economy.cash += amt;
      this._addEvent(day, { type: 'grant', level: 'info', cost: -amt, text: `Conservation grant received: $${amt.toLocaleString()}` });
    }
    // vehicle breakdown
    if (vis.arrivals > 0 && rng.bool(0.01 * (1.5 - this.efficiency))) {
      this._addEvent(day, { type: 'breakdown', level: 'warn', cost: 1500, text: 'A safari vehicle broke down on the loop road: $1,500 repairs' });
    }
  }

  _killAnimals(species, n) {
    const hids = [...this.pop.keys()].sort();
    let left = n;
    for (const hid of hids) {
      const r = this.pop.get(hid).get(species);
      if (!r || r.n <= 0 || left <= 0) continue;
      const k = Math.min(r.n, left);
      r.n -= k; r.died += k; left -= k;
      this._remove(species, hid, k);
    }
  }

  // ---- economy

  _economyStep(day, vis) {
    const w = this.world;
    const eco = w.economy || (w.economy = { cash: 0, income: 0, expenses: 0, ticketPrice: CONST.refPrice, loans: 0, history: [] });
    const lodge = vis.lodge, bld = vis.buildings, roads = vis.roads;
    const S = vis.satisfaction;
    const income = {
      tickets: vis.arrivals * this.dayPlan.price,
      lodge: vis.lodgeNights * lodge.rate * (0.8 + 0.4 * lodge.quality),
      shop: vis.arrivals * CONST.shopSpend * Math.min(1.5, 0.25 + bld.shops) * (0.5 + S),
    };
    const upkeepMult = 1 + (1 - this.efficiency) * 0.6;
    let buildings = 0;
    if (w.buildings) for (const b of w.buildings.values()) if (b) buildings += this.building(b.type).upkeep;
    let roadsCost = 0;
    for (const k in roads.byKind) roadsCost += roads.byKind[k] * ROADS[k].upkeepPerKm;
    let staff = 0;
    for (const r of STAFF_ORDER) staff += this.staff[r].n * this.staff[r].wage;
    let feed = 0, vet = 0;
    const drought = this._eventStrength('drought');
    for (const m of this.pop.values()) for (const [s, r] of m) {
      if (r.n <= 0) continue;
      const sp = this.species(s);
      feed += r.n * sp.feed * (1 + 0.3 * drought) * (1.15 - 0.15 * this.prosperity);
      vet += r.n * sp.vet * (this._diseaseFor(s) ? 2.5 : 1);
    }
    let events = 0;
    for (const e of this.eventsToday) if (e.cost > 0) events += e.cost;
    const expenses = { staff, buildings: buildings * upkeepMult, roads: roadsCost * upkeepMult, feed, vet, interest: (eco.loans || 0) * CONST.loanInterestDaily, events };
    const inc = income.tickets + income.lodge + income.shop;
    const exp = Object.values(expenses).reduce((a, b) => a + b, 0);
    eco.cash += inc - exp;
    eco.income = inc; eco.expenses = exp;
    eco.history.push({ day, cash: Math.round(eco.cash), income: Math.round(inc), expenses: Math.round(exp), visitors: vis.arrivals, population: this.count(), satisfaction: +S.toFixed(3), reputation: +this.reputation.toFixed(3), morale: +this.morale.toFixed(3) });
    if (eco.history.length > CONST.historyCap) eco.history.shift();
    // bankruptcy
    if (eco.cash < CONST.bankruptcyCash) this.negativeDays++; else this.negativeDays = 0;
    if (this.negativeDays >= CONST.bankruptcyDays && !this.bankrupt) {
      this.bankrupt = true;
      this._notify('error', 'The park is bankrupt: the bank has foreclosed');
      this._emit('sim:bankrupt', { day, cash: eco.cash });
    } else if (this.negativeDays === 1) {
      this._notify('warn', `Cash below $${CONST.bankruptcyCash.toLocaleString()}: ${CONST.bankruptcyDays} days to recover`);
    }
    return { cash: eco.cash, income: inc, expenses: exp, incomeBreakdown: income, expenseBreakdown: expenses };
  }

  // ------------------------------------------------------------------ public API (mirrored by index.js api)

  setTicketPrice(p) { if (this.world.economy) this.world.economy.ticketPrice = clamp(+p || 0, 0, 500); return this.world.economy?.ticketPrice; }
  takeLoan(amount) {
    const eco = this.world.economy; if (!eco) return 0;
    amount = Math.max(0, Math.round(+amount || 0));
    const maxLoan = 500000;
    amount = Math.min(amount, Math.max(0, maxLoan - (eco.loans || 0)));
    eco.cash += amount; eco.loans = (eco.loans || 0) + amount;
    if (amount > 0) this._notify('info', `Loan taken: $${amount.toLocaleString()} (now owing $${eco.loans.toLocaleString()})`);
    return amount;
  }
  repayLoan(amount) {
    const eco = this.world.economy; if (!eco) return 0;
    amount = Math.min(Math.max(0, Math.round(+amount || 0)), eco.loans || 0, Math.max(0, eco.cash));
    eco.cash -= amount; eco.loans -= amount;
    return amount;
  }
  hire(role, n = 1) { if (!this.staff[role]) return 0; this.staff[role].n = Math.max(0, this.staff[role].n + Math.round(n)); return this.staff[role].n; }
  fire(role, n = 1) { if (!this.staff[role]) return 0; this.staff[role].n = Math.max(0, this.staff[role].n - Math.round(n)); return this.staff[role].n; }
  setWage(role, wage) { if (!this.staff[role]) return 0; this.staff[role].wage = clamp(+wage || 0, 0, 1000); return this.staff[role].wage; }
  speed(n) { this.speedValue = n; try { this.hooks.setSpeed?.(n); } catch {} return n; }
  getReport() { return this.lastReport; }
  getVisitorSatisfaction() { return this.satisfaction; }
  getState() {
    const eco = this.world.economy || {};
    return {
      day: this.clock.day, hour: this.clock.hour, seed: this.seed,
      cash: eco.cash, loans: eco.loans || 0, ticketPrice: eco.ticketPrice, bankrupt: this.bankrupt,
      visitorsToday: this.todayArrivals, inPark: Math.round(this.inPark), plannedArrivals: Math.round(this.dayPlan.arrivals),
      satisfaction: this.satisfaction, reputation: this.reputation, attraction: this.attraction,
      population: this.population(), happiness: this.happinessBySpecies(),
      staff: Object.fromEntries(STAFF_ORDER.map((r) => [r, { ...this.staff[r] }])), staffNeeds: this.staffNeeds || null, staffCoverage: this.staffCoverage,
      morale: this.morale, prosperity: this.prosperity, efficiency: this.efficiency,
      season: this._season(), activeEvents: this.activeEvents.map((e) => ({ type: e.type, until: e.until, species: e.species })),
      totals: { ...this.totals }, speed: this.speedValue,
    };
  }
  getHistory(days = 60) { return (this.world.economy?.history || []).slice(-days); }
  getReports(days = 30) { return this.reports.slice(-days); }
}

export { poisson, buildingKind, edgeLength };
