// Mock world data for the ui showcase (other modules may be absent). Only fills the parts whose owner module is missing.
// Deterministic via ctx.rng / ctx.noise. Never runs in the full game.
import { SPECIES } from './species.js';

const HERDS = [
  { species: 'zebra', n: 14, x: -150, z: 60, r: 40 },
  { species: 'wildebeest', n: 18, x: -110, z: 110, r: 50 },
  { species: 'impala', n: 20, x: -40, z: -60, r: 35 },
  { species: 'elephant', n: 7, x: 110, z: -140, r: 30 },
  { species: 'giraffe', n: 5, x: 160, z: -60, r: 40 },
  { species: 'buffalo', n: 9, x: -220, z: -120, r: 30 },
  { species: 'warthog', n: 4, x: -30, z: 40, r: 15 },
  { species: 'ostrich', n: 6, x: 40, z: 120, r: 25 },
  { species: 'hippo', n: 5, x: 200, z: 200, r: 20 },
  { species: 'rhino', n: 2, x: 250, z: -220, r: 15 },
  { species: 'lion', n: 4, x: -300, z: 240, r: 15 },
  { species: 'cheetah', n: 2, x: 300, z: 60, r: 20 },
];
const STATES = { grazer: ['graze', 'graze', 'walk', 'drink', 'rest'], browser: ['browse', 'walk', 'drink', 'rest'], predator: ['rest', 'rest', 'stalk', 'walk'], mixed: ['graze', 'walk', 'rest'] };

export function populateMockWorld(ctx, preset) {
  const w = ctx.world, rng = ctx.rng.fork('mock'), has = (id) => !!ctx.modules.get(id);
  const out = { selectedAnimal: null, lodge: null, habitat: null, road: null };

  // Rule: mock only what is EMPTY. A present module that already wrote its data is never overwritten.
  // ---- terrain: never written (the fallback ground plane is flat); a preview heightfield feeds the minimap instead
  if (w.terrain.maxHeight === w.terrain.minHeight) out.terrainPreview = mockTerrainPreview(ctx);

  // ---- zoning / habitats
  if (w.habitats.size === 0) {
    const defs = [
      { id: 1, name: 'Acacia Flats', x: -130, z: 80, rx: 150, rz: 110, species: ['zebra', 'wildebeest', 'warthog'], water: 0.7, shade: 0.45, cover: 0.35, quality: 0.78 },
      { id: 2, name: 'Kopje Springs', x: 140, z: -110, rx: 130, rz: 100, species: ['elephant', 'giraffe'], water: 0.55, shade: 0.7, cover: 0.6, quality: 0.66 },
      { id: 3, name: 'Riverbend', x: 200, z: 190, rx: 90, rz: 70, species: ['hippo'], water: 0.95, shade: 0.5, cover: 0.55, quality: 0.84 },
      { id: 4, name: 'Lion Ridge', x: -300, z: 240, rx: 90, rz: 70, species: ['lion'], water: 0.3, shade: 0.6, cover: 0.7, quality: 0.52 },
    ];
    const g = w.grid;
    for (const d of defs) {
      const cells = [];
      for (let iz = 0; iz < g.res; iz++) for (let ix = 0; ix < g.res; ix++) {
        const c = w.cellCenter(ix, iz);
        const u = (c.x - d.x) / d.rx, v = (c.z - d.z) / d.rz;
        if (u * u + v * v <= 1) { const i = w.cellIndex(ix, iz); g.zone[i] = 1; g.habitatId[i] = d.id; cells.push(i); }
      }
      w.habitats.set(d.id, { id: d.id, name: d.name, cells: Int32Array.from(cells), area: cells.length * g.cell * g.cell, species: new Set(d.species), water: d.water, shade: d.shade, cover: d.cover, quality: d.quality, x: d.x, z: d.z });
    }
    // visitor zone around the lodge + service zone at ranger station
    stampZone(w, 40, 330, 70, 50, 2); stampZone(w, -120, 330, 30, 22, 3);
    g.version++;
    out.habitat = 1;
  }

  // ---- roads
  if (w.roads.edges.size === 0) {
    const add = (kind, width, pts) => {
      const id = w.nextId('r');
      const a = w.nextId('n'), b = w.nextId('n');
      w.roads.nodes.set(a, { id: a, x: pts[0], z: pts[1] }); w.roads.nodes.set(b, { id: b, x: pts[pts.length - 2], z: pts[pts.length - 1] });
      w.roads.edges.set(id, { id, a, b, kind, width, points: pts, traffic: rng.range(0.2, 0.9) });
      return id;
    };
    out.road = add('paved', 6, curve([0, 400, 10, 360, 40, 330, 60, 300], 12));
    add('gravel', 5, curve([60, 300, 20, 220, -60, 160, -140, 140, -220, 60, -240, -60, -180, -160, -80, -200, 40, -200, 140, -180, 220, -120, 260, 0, 230, 120, 160, 200, 80, 260, 60, 300], 8));
    add('dirt', 4, curve([-180, -160, -260, -200, -320, -260], 8));
    add('dirt', 4, curve([140, -180, 200, -240, 280, -260], 8));
    add('gravel', 5, curve([230, 120, 300, 80, 340, 20], 8));
    w.roads.version++;
  }

  // ---- buildings
  if (w.buildings.size === 0) {
    const put = (type, x, z, rot, w_, d, staff, visitors, extra = {}) => { const id = w.nextId('b'); w.buildings.set(id, { id, type, x, z, rot, w: w_, d, state: 'operating', staff, visitors, ...extra }); return id; };
    put('gate', 0, 400, 0, 12, 6, 2, 22);
    out.lodge = put('lodge', 60, 300, 0.4, 30, 18, 12, 86, { name: 'Baobab Lodge', capacity: 120, income: 6800 });
    put('shop', 30, 330, 0, 12, 8, 3, 14);
    put('ranger', -120, 330, 0, 14, 10, 6, 0);
    put('hide', 180, 160, 1.2, 6, 6, 0, 6);
    put('hide', -160, 30, 0.6, 6, 6, 0, 4);
    put('waterhole', 120, -110, 0, 16, 16, 0, 0);
    put('waterhole', -90, 90, 0, 16, 16, 0, 0);
    put('viewpoint', 260, -40, 0, 8, 8, 0, 9);
  }

  // ---- animals
  if (w.animals.size === 0) {
    for (const h of HERDS) {
      const sp = SPECIES[h.species];
      const herdId = w.nextId('h');
      for (let i = 0; i < h.n; i++) {
        const id = w.nextId('a');
        const ang = rng.float() * Math.PI * 2, rad = Math.sqrt(rng.float()) * h.r;
        const x = h.x + Math.cos(ang) * rad, z = h.z + Math.sin(ang) * rad;
        const base = h.species === 'lion' ? 0.48 : h.species === 'rhino' ? 0.9 : 0.72;
        const needs = { food: clamp(base + rng.range(-0.25, 0.25)), water: clamp(base + rng.range(-0.3, 0.2)), rest: clamp(0.6 + rng.range(-0.3, 0.35)), safety: clamp(0.85 + rng.range(-0.3, 0.1)), social: clamp(0.7 + rng.range(-0.3, 0.25)) };
        const happiness = clamp((needs.food + needs.water + needs.rest + needs.safety + needs.social) / 5 * 0.8 + 0.2 * (h.species === 'lion' ? 0.5 : 0.8));
        w.animals.set(id, { id, species: h.species, x, z, y: w.getHeight(x, z), heading: rng.float() * Math.PI * 2, speed: 0, state: rng.pick(STATES[sp.diet] || STATES.grazer), herd: herdId, needs, happiness, age: rng.range(0.5, sp.mass > 1000 ? 30 : 9), sex: rng.bool() ? 'f' : 'm' });
        if (h.species === 'elephant' && i === 0) out.selectedAnimal = id;
      }
    }
  } else if (w.animals.size) { out.selectedAnimal = w.animals.keys().next().value; }

  // ---- economy / visitors (simulation owner) — only while the sim has produced no history yet
  if (w.economy.history.length === 0) {
    const e = w.economy;
    w.time.day = Math.max(w.time.day, 34);
    e.cash = 312450; e.income = 18640; e.expenses = 14210; e.ticketPrice = 35; e.loans = 50000;
    e.history.length = 0;
    let cash = 148000;
    for (let i = 29; i >= 0; i--) {
      const day = w.time.day - i;
      const trend = 1 - i / 29;
      const visitors = Math.round(520 + 720 * trend + rng.gaussian(0, 60) + (day % 7 === 0 ? 180 : 0));
      const income = Math.round(visitors * 12.5 + 3800 + 2600 * trend + rng.gaussian(0, 500));
      const expenses = Math.round(11200 + 3200 * trend + rng.gaussian(0, 350) + (i === 9 ? 22000 : 0));
      cash += income - expenses;
      if (i === 17) cash += 50000; // loan taken
      e.history.push({ day, cash, income, expenses, visitors });
    }
    e.history[e.history.length - 1].cash = e.cash;
    w.visitors.count = 1240; w.visitors.inPark = 386; w.visitors.satisfaction = 0.72;
    w.visitors.seenSpecies = new Map([['zebra', 980], ['wildebeest', 940], ['elephant', 610], ['giraffe', 560], ['impala', 720], ['lion', 210], ['hippo', 330], ['ostrich', 400]]);
  }

  // ---- weather (environment owner)
  if (!has('environment')) {
    const h = w.time.hour;
    w.weather.temperature = Math.round(19 + 13 * Math.max(0, Math.sin(((h - 7) / 12) * Math.PI)));
    w.weather.cloud = 0.22; w.weather.rain = 0; w.weather.wind = { x: 1, z: 0.3, speed: 3.4 }; w.weather.season = 'dry'; w.weather.haze = 0.3;
  }
  return out;
}

export function mockReport(ctx, s) {
  const w = ctx.world;
  const pop = {}, hap = {};
  for (const a of w.animals.values()) { pop[a.species] = (pop[a.species] || 0) + 1; hap[a.species] = (hap[a.species] || 0) + a.happiness; }
  for (const k in hap) hap[k] /= pop[k];
  return {
    day: w.time.day, cash: w.economy.cash, income: w.economy.income, expenses: w.economy.expenses,
    visitors: w.visitors.count, satisfaction: w.visitors.satisfaction, reputation: s.reputation, arrivalsTomorrow: 1310,
    breakdown: { income: { tickets: 12480, lodge: 4890, shop: 1270 }, expenses: { staff: 6200, upkeep: 3950, animals: 2860, roads: 640, interest: 560 } },
    population: pop, happiness: hap,
    events: [
      { level: 'good', text: 'Two zebra foals were born in Acacia Flats.', when: '06:40' },
      { level: 'info', text: 'A tour group watched the lion pride hunt at dusk (+8% satisfaction).', when: '18:10' },
      { level: 'warn', text: 'Water hole at Kopje Springs is running low — dry season.', when: '13:00' },
      { level: 'info', text: 'Loan interest paid: $560.', when: '00:00' },
    ],
  };
}

export function mockPopHistory(ctx, days = 30) {
  const rng = ctx.rng.fork('mock-pop');
  const total = ctx.world.animals.size || 96;
  const out = [];
  let n = Math.max(10, Math.round(total * 0.62));
  for (let i = days - 1; i >= 0; i--) { out.push({ day: ctx.world.time.day - i, n }); n += rng.int(0, 3) - (rng.bool(0.12) ? 1 : 0); }
  out[out.length - 1].n = total;
  return out;
}

// ---------- helpers ----------
/** A terrain-shaped object ({res, cell, heights, biome, waterLevel, min/maxHeight, version}) for the minimap only. */
function mockTerrainPreview(ctx) {
  const w = ctx.world, res = 129, cell = w.size / (res - 1), noise = ctx.noise;
  const h = new Float32Array(res * res), b = new Uint8Array(res * res);
  const t = { res, cell, heights: h, biome: b, waterLevel: 4, minHeight: 0, maxHeight: 0, version: 1, preview: true };
  const half = w.half;
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const x = ix * cell - half, z = iz * cell - half;
      const n1 = noise.fbm2D(x * 0.0022 + 3.1, z * 0.0022 + 7.7, 4);
      const ridge = noise.ridged2D(x * 0.0035 + 11, z * 0.0035 + 5, 3);
      // a river valley running roughly NE→SW
      const rv = (x * 0.55 + z * 0.83 + 90 + 60 * noise.noise2D(x * 0.004, z * 0.004)) / 90;
      const valley = Math.exp(-rv * rv);
      let H = 26 + n1 * 30 + ridge * 22 * Math.max(0, n1 + 0.2) - valley * 30;
      const i = iz * res + ix;
      h[i] = H;
      const moist = noise.fbm2D(x * 0.003 + 50, z * 0.003 + 20, 3) + valley * 0.8;
      let biome = moist > 0.15 ? 0 : 1;
      if (H > 62) biome = 3; else if (H > 52 && ridge > 0.55) biome = 3;
      if (valley > 0.55 && H < 12) biome = 5;
      if (moist < -0.35 && H < 40) biome = rng01(x, z) > 0.5 ? 2 : 4;
      b[i] = biome;
    }
  }
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < h.length; i++) { if (h[i] < mn) mn = h[i]; if (h[i] > mx) mx = h[i]; }
  t.minHeight = mn; t.maxHeight = mx;
  return t;
}
function rng01(x, z) { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); } // hash for biome speckle (deterministic, not Math.random)
function stampZone(w, cx, cz, rx, rz, zone) {
  const g = w.grid;
  for (let iz = 0; iz < g.res; iz++) for (let ix = 0; ix < g.res; ix++) {
    const c = w.cellCenter(ix, iz); const u = (c.x - cx) / rx, v = (c.z - cz) / rz;
    if (u * u + v * v <= 1) { const i = w.cellIndex(ix, iz); if (!g.zone[i]) g.zone[i] = zone; }
  }
}
function clamp(v) { return v < 0.02 ? 0.02 : v > 1 ? 1 : v; }
/** Catmull-Rom smoothing of a flat [x,z,...] polyline, `seg` samples per segment. */
function curve(p, seg) {
  const n = p.length / 2, out = [];
  const P = (i) => { i = Math.max(0, Math.min(n - 1, i)); return [p[i * 2], p[i * 2 + 1]]; };
  for (let i = 0; i < n - 1; i++) {
    const [x0, z0] = P(i - 1), [x1, z1] = P(i), [x2, z2] = P(i + 1), [x3, z3] = P(i + 2);
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push(0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3),
        0.5 * (2 * z1 + (-z0 + z2) * t + (2 * z0 - 5 * z1 + 4 * z2 - z3) * t2 + (-z0 + 3 * z1 - 3 * z2 + z3) * t3));
    }
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}
