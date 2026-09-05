// Synthetic park builder. Pure JS. Used by test.mjs (on a plain world object) and by showcase.js (on ctx.world)
// when the zoning / buildings / roads / animals modules are absent. It writes only world.habitats, world.grid,
// world.buildings, world.roads, world.economy.* and staff — never terrain.

/** Plain object with the World shape the simulation reads (no three import). */
export function createPlainWorld({ seed = 1, size = 1024, res = 513, gridCell = 4 } = {}) {
  const half = size / 2;
  const cell = size / (res - 1);
  const gres = Math.round(size / gridCell);
  const w = {
    seed, size, half,
    terrain: { res, cell, heights: new Float32Array(res * res), biome: new Uint8Array(res * res), waterLevel: -1e9, minHeight: 0, maxHeight: 0, version: 0 },
    grid: { cell: gridCell, res: gres, zone: new Uint8Array(gres * gres), habitatId: new Uint16Array(gres * gres), occupancy: new Uint8Array(gres * gres), version: 0 },
    habitats: new Map(), roads: { nodes: new Map(), edges: new Map(), version: 0 }, buildings: new Map(), animals: new Map(), vehicles: new Map(),
    visitors: { count: 0, inPark: 0, satisfaction: 0.5, seenSpecies: new Map(), log: [] },
    economy: { cash: 250000, income: 0, expenses: 0, ticketPrice: 25, loans: 0, history: [] },
    time: { hour: 8, day: 1, speed: 1, paused: false },
    weather: { cloud: 0.25, rain: 0, wind: { x: 1, z: 0.2, speed: 3 }, temperature: 28, season: 'dry', haze: 0.3 },
    selection: { kind: null, id: null },
    _nextId: 1,
    nextId(prefix = 'e') { return `${prefix}_${this._nextId++}`; },
    inBounds(x, z) { return x >= -half && x <= half && z >= -half && z <= half; },
    cellAt(x, z) {
      let ix = Math.floor((x + half) / gridCell), iz = Math.floor((z + half) / gridCell);
      ix = ix < 0 ? 0 : ix >= gres ? gres - 1 : ix; iz = iz < 0 ? 0 : iz >= gres ? gres - 1 : iz;
      return { ix, iz, index: iz * gres + ix };
    },
    cellCenter(ix, iz) { return { x: (ix + 0.5) * gridCell - half, z: (iz + 0.5) * gridCell - half }; },
    cellIndex(ix, iz) { return iz * gres + ix; },
    getHeight(x, z) {
      const t = this.terrain, r = t.res, c = t.cell, h = t.heights;
      let fx = (x + half) / c, fz = (z + half) / c;
      fx = fx < 0 ? 0 : fx > r - 1 ? r - 1 : fx; fz = fz < 0 ? 0 : fz > r - 1 ? r - 1 : fz;
      const ix = Math.floor(fx), iz = Math.floor(fz), ix1 = ix < r - 1 ? ix + 1 : ix, iz1 = iz < r - 1 ? iz + 1 : iz;
      const tx = fx - ix, tz = fz - iz;
      return (h[iz * r + ix] * (1 - tx) + h[iz * r + ix1] * tx) * (1 - tz) + (h[iz1 * r + ix] * (1 - tx) + h[iz1 * r + ix1] * tx) * tz;
    },
    biomeAt(x, z) {
      const t = this.terrain, r = t.res, c = t.cell;
      const ix = Math.max(0, Math.min(r - 1, Math.round((x + half) / c))), iz = Math.max(0, Math.min(r - 1, Math.round((z + half) / c)));
      return t.biome[iz * r + ix];
    },
    isWater(x, z) { return this.getHeight(x, z) < this.terrain.waterLevel; },
  };
  return w;
}

/** Default park layout: 5 habitats, a loop road with spurs, gate/lodge/shop/hides/water holes, starting herds. */
export const PARK_LAYOUT = Object.freeze({
  habitats: [
    { name: 'Acacia Plains',     rect: [-440, -440, -60, -60],  water: 0.45, shade: 0.25, cover: 0.20, grass: 0.85, roughness: 0.10, animals: { zebra: 14, wildebeest: 22, ostrich: 6, impala: 20, rhino: 3 } },
    { name: 'River Bend',        rect: [60, -440, 440, -80],    water: 0.85, shade: 0.35, cover: 0.30, grass: 0.60, roughness: 0.15, animals: { hippo: 6, buffalo: 12, elephant: 6 } },
    { name: 'Giraffe Woodland',  rect: [-440, 60, -80, 440],    water: 0.35, shade: 0.75, cover: 0.45, grass: 0.45, roughness: 0.20, animals: { giraffe: 5, impala: 12, warthog: 6 } },
    { name: 'Lion Ridge',        rect: [100, 100, 440, 290],    water: 0.50, shade: 0.45, cover: 0.50, grass: 0.60, roughness: 0.35, animals: { lion: 5, wildebeest: 24, zebra: 12, impala: 20 } },
    { name: 'Cheetah Flats',     rect: [100, 320, 440, 470],    water: 0.45, shade: 0.15, cover: 0.25, grass: 0.75, roughness: 0.08, animals: { cheetah: 2, impala: 18 } },
  ],
  buildings: [
    { type: 'gate', x: 0, z: 490 }, { type: 'lodge', x: -40, z: 455, w: 30, d: 20 }, { type: 'shop', x: 40, z: 460 },
    { type: 'ranger_station', x: 0, z: 0 }, { type: 'staff_village', x: -200, z: 480 }, { type: 'workshop', x: -150, z: 480 },
    { type: 'vet_clinic', x: 60, z: 20 },
    { type: 'hide', x: -250, z: -250 }, { type: 'hide', x: 250, z: -260 }, { type: 'hide', x: 270, z: 200 },
    { type: 'waterhole', x: -250, z: -200 }, { type: 'waterhole', x: 250, z: -300 }, { type: 'waterhole', x: 270, z: 150 },
  ],
  loop: [[0, 470], [-470, 300], [-470, -300], [0, -470], [470, -300], [470, 300], [0, 470]],
  spurs: [[[-470, 0], [-250, -250], [-60, -250]], [[470, 0], [250, -260], [250, -400]], [[-470, 300], [-260, 250], [-260, 100]], [[470, 300], [270, 200], [120, 150]], [[470, 300], [300, 400]]],
});

/**
 * Build the park onto `world`. opts:
 *   water/shade offsets (added to every habitat), waterholes (bool), hides (bool), lodge (bool), shop (bool),
 *   roadKind 'dirt'|'gravel'|'paved', roads 'none'|'loop'|'full', ticketPrice, cash, loan, animalScale,
 *   staff {role:n}, biome (bool: paint terrain biome on a plain world so terrain-derived stats are exercised)
 * Returns { staff, populations: [{habitatId, species, n}] } for the simulation to apply.
 */
export function buildPark(world, rng, opts = {}) {
  const o = { water: 0, shade: 0, waterholes: true, hides: true, lodge: true, shop: true, roadKind: 'dirt', roads: 'full', ticketPrice: 25, cash: 250000, loan: 0, animalScale: 1, ...opts };
  const g = world.grid, gres = g.res, gc = g.cell, half = world.half ?? world.size / 2;
  world.habitats.clear(); world.buildings.clear(); world.roads.nodes.clear(); world.roads.edges.clear();
  g.zone.fill(0); g.habitatId.fill(0); g.occupancy.fill(0);
  const populations = [];
  let hid = 1;
  for (const H of PARK_LAYOUT.habitats) {
    const [x0, z0, x1, z1] = H.rect;
    const c0 = world.cellAt(x0, z0), c1 = world.cellAt(x1 - 0.01, z1 - 0.01);
    const cells = [];
    for (let iz = c0.iz; iz <= c1.iz; iz++) for (let ix = c0.ix; ix <= c1.ix; ix++) { const i = iz * gres + ix; cells.push(i); g.zone[i] = 1; g.habitatId[i] = hid; }
    const area = cells.length * gc * gc;
    const water = Math.max(0, Math.min(1, H.water + o.water)), shade = Math.max(0, Math.min(1, H.shade + o.shade));
    const habitat = { id: hid, name: H.name, cells: Int32Array.from(cells), area, species: new Set(Object.keys(H.animals)), water, shade, cover: H.cover, grass: H.grass, roughness: H.roughness, quality: 0, rect: H.rect.slice() };
    world.habitats.set(hid, habitat);
    for (const s in H.animals) { const n = Math.round(H.animals[s] * o.animalScale); if (n > 0) populations.push({ habitatId: hid, species: s, n }); }
    hid++;
  }
  g.version++;
  for (const B of PARK_LAYOUT.buildings) {
    if (B.type === 'lodge' && !o.lodge) continue;
    if (B.type === 'shop' && !o.shop) continue;
    if (B.type === 'hide' && !o.hides) continue;
    if (B.type === 'waterhole' && !o.waterholes) continue;
    const id = world.nextId('b');
    world.buildings.set(id, { id, type: B.type, x: B.x, z: B.z, rot: 0, w: B.w || 8, d: B.d || 8, state: 'ok', staff: 0, visitors: 0 });
    g.occupancy[world.cellAt(B.x, B.z).index] = 1;
  }
  const addRoad = (pts, kind) => {
    const flat = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 10));
      for (let k = 0; k < n; k++) { const t = k / n; flat.push(ax + (bx - ax) * t, az + (bz - az) * t); }
    }
    flat.push(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    const a = world.nextId('n'), b = world.nextId('n');
    world.roads.nodes.set(a, { id: a, x: pts[0][0], z: pts[0][1] });
    world.roads.nodes.set(b, { id: b, x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] });
    const id = world.nextId('r');
    world.roads.edges.set(id, { id, a, b, kind, width: kind === 'paved' ? 6 : 5, points: flat });
    for (let i = 0; i < flat.length; i += 2) { const c = world.cellAt(flat[i], flat[i + 1]); if (!g.occupancy[c.index]) g.occupancy[c.index] = 2; }
  };
  if (o.roads !== 'none') {
    addRoad(PARK_LAYOUT.loop, o.roadKind);
    if (o.roads === 'full') for (const s of PARK_LAYOUT.spurs) addRoad(s, 'dirt');
  } else addRoad([[0, 470], [0, 380]], 'dirt');
  world.roads.version++;
  if (o.biome && world.terrain) {
    // paint a biome per habitat on a plain (test) world so the terrain-derived grass path is exercised
    const t = world.terrain, r = t.res, c = t.cell;
    for (const H of world.habitats.values()) {
      const [x0, z0, x1, z1] = H.rect;
      const b = H.grass > 0.8 ? 0 : H.grass > 0.55 ? 1 : 2;
      for (let z = z0; z < z1; z += c) for (let x = x0; x < x1; x += c) {
        const ix = Math.round((x + half) / c), iz = Math.round((z + half) / c);
        if (ix >= 0 && ix < r && iz >= 0 && iz < r) t.biome[iz * r + ix] = b;
      }
    }
    t.version++;
  }
  world.economy.cash = o.cash; world.economy.ticketPrice = o.ticketPrice; world.economy.loans = o.loan; world.economy.history = [];
  const staff = { ranger: 3, keeper: 10, guide: 3, maintenance: 4, lodge: o.lodge ? 3 : 0, ...(o.staff || {}) };
  return { staff, populations };
}

/** Apply a buildPark() result to a Simulation (staff + populations) and mark it as the start state. */
export function applyPark(sim, park) {
  for (const r in park.staff) { sim.staff[r] = sim.staff[r] || { n: 0, wage: 60 }; sim.staff[r].n = park.staff[r]; }
  for (const p of park.populations) sim.setPopulation(p.habitatId, p.species, p.n);
  sim.markStart();
}
