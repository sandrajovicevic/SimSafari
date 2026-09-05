// Flood-fills contiguous HABITAT cells into world.habitats, computes per-habitat stats (area, water,
// shade, cover, roughness, grass, species, quality), traces boundary edges (fences.js) and polylines
// (the public boundary() API), and the habitat-quality formula (delegates to simulation when present).
import { ZONE } from '../../core/World.js';
import { Z } from './state.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------------------------------------
// flood fill: contiguous HABITAT cells -> stable habitat ids
// ---------------------------------------------------------------------------------------------------------

function floodComponents(world) {
  const g = world.grid, res = g.res, N = res * res, zone = g.zone;
  const visited = new Uint8Array(N);
  const comps = [];
  const stack = [];
  for (let i = 0; i < N; i++) {
    if (visited[i] || zone[i] !== ZONE.HABITAT) continue;
    const cells = [];
    stack.length = 0; stack.push(i); visited[i] = 1;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const cx = c % res, cz = (c - cx) / res;
      if (cx > 0) { const n = c - 1; if (!visited[n] && zone[n] === ZONE.HABITAT) { visited[n] = 1; stack.push(n); } }
      if (cx < res - 1) { const n = c + 1; if (!visited[n] && zone[n] === ZONE.HABITAT) { visited[n] = 1; stack.push(n); } }
      if (cz > 0) { const n = c - res; if (!visited[n] && zone[n] === ZONE.HABITAT) { visited[n] = 1; stack.push(n); } }
      if (cz < res - 1) { const n = c + res; if (!visited[n] && zone[n] === ZONE.HABITAT) { visited[n] = 1; stack.push(n); } }
    }
    comps.push(cells);
  }
  return comps;
}

function centroidBBox(world, cells) {
  let sx = 0, sz = 0, x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const idx of cells) {
    const g = world.grid, ix = idx % g.res, iz = (idx - ix) / g.res;
    const { x, z } = world.cellCenter(ix, iz);
    sx += x; sz += z;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const n = cells.length || 1;
  return { x: sx / n, z: sz / n, bbox: { x0, z0, x1, z1 } };
}

function speciesPerHabitat(world) {
  const map = new Map();
  const g = world.grid;
  for (const a of world.animals.values()) {
    if (!a || !a.species) continue;
    const c = world.cellAt(a.x, a.z);
    const hid = g.habitatId[c.index];
    if (!hid) continue;
    let s = map.get(hid);
    if (!s) { s = new Set(); map.set(hid, s); }
    s.add(a.species);
  }
  return map;
}

/**
 * Per-habitat physical stats. `shade` comes from props.coverAt (tree canopy); `cover` (shrubs/rocks)
 * has no direct query in any module, so it is approximated from rocky biome fraction blended with
 * shade — see README "Known gaps".
 */
function computeStats(ctx, world, cells) {
  const terrain = ctx.modules.get('terrain');
  const props = ctx.modules.get('props');
  const g = world.grid;
  const N = cells.length;
  const area = N * g.cell * g.cell;
  const step = Math.max(1, Math.floor(N / 220));
  const DIRS = 8, WATER_R = 30;
  let waterHits = 0, shadeSum = 0, rockSum = 0, roughSum = 0, grassSum = 0, n = 0;
  for (let i = 0; i < N; i += step) {
    const idx = cells[i];
    const ix = idx % g.res, iz = (idx - ix) / g.res;
    const { x, z } = world.cellCenter(ix, iz);
    const isWaterAt = terrain?.isWaterAt ? (px, pz) => terrain.isWaterAt(px, pz) : (px, pz) => world.isWater(px, pz);
    let near = isWaterAt(x, z);
    for (let d = 0; d < DIRS && !near; d++) {
      const ang = (d / DIRS) * Math.PI * 2;
      near = isWaterAt(x + Math.cos(ang) * WATER_R, z + Math.sin(ang) * WATER_R);
    }
    if (near) waterHits++;
    shadeSum += props?.coverAt ? clamp01(props.coverAt(x, z)) : 0;
    const biome = world.biomeAt(x, z);
    grassSum += biome === 0 ? 1 : biome === 1 ? 0.62 : biome === 5 ? 0.75 : biome === 2 ? 0.08 : 0;
    rockSum += biome === 3 ? 1 : 0;
    roughSum += Math.min(1, world.getSlope(x, z) * 2.3);
    n++;
  }
  const shade = n ? shadeSum / n : 0;
  const rockFrac = n ? rockSum / n : 0;
  return {
    area,
    water: clamp01(n ? waterHits / n : 0),
    shade: clamp01(shade),
    cover: clamp01(rockFrac * 0.7 + shade * 0.35),
    roughness: clamp01(n ? roughSum / n : 0),
    grass: clamp01(n ? grassSum / n : 0),
  };
}

/** Rebuild world.habitats from world.grid.zone. Call after any zone edit. Ids are kept stable by cell overlap. */
export function rebuildHabitats() {
  const ctx = Z.ctx, world = Z.world, g = world.grid;
  const oldHid = Uint16Array.from(g.habitatId);
  g.habitatId.fill(0);
  const comps = floodComponents(world);

  const usedOld = new Set();
  const assigned = [];
  for (const cells of comps) {
    const counts = new Map();
    for (const c of cells) { const o = oldHid[c]; if (o) counts.set(o, (counts.get(o) || 0) + 1); }
    let bestId = 0, bestN = 0;
    for (const [o, n] of counts) if (n > bestN && !usedOld.has(o)) { bestN = n; bestId = o; }
    const id = (bestId && bestN >= Math.max(1, cells.length * 0.15)) ? bestId : Z.nextHabitatId++;
    if (bestId === id) usedOld.add(id);
    assigned.push({ id, cells });
  }
  for (const { id, cells } of assigned) for (const c of cells) g.habitatId[c] = id;

  const speciesByHid = speciesPerHabitat(world);
  const prevMap = world.habitats;
  const touchedIds = new Set([...prevMap.keys()]);
  // pass 1: stats + species, written into world.habitats before any quality lookup (quality reads the
  // habitat object back out of world.habitats, so it must already be there).
  for (const { id, cells } of assigned) {
    touchedIds.add(id);
    const prev = prevMap.get(id);
    const { x, z, bbox } = centroidBBox(world, cells);
    const stats = computeStats(ctx, world, cells);
    const species = speciesByHid.get(id) || new Set();
    const entry = {
      id, name: prev?.name || `Habitat ${id}`,
      cells: Int32Array.from(cells), area: stats.area,
      water: stats.water, shade: stats.shade, cover: stats.cover, roughness: stats.roughness, grass: stats.grass,
      species, quality: prev?.quality ?? 0.6,
      fenced: prev?.fenced ?? 0, centroid: { x, z }, bbox,
    };
    prevMap.set(id, entry);
  }
  const keepIds = new Set(assigned.map((a) => a.id));
  for (const id of prevMap.keys()) if (!keepIds.has(id)) prevMap.delete(id);

  // pass 2: quality, an average over the species actually present (needs every habitat's stats in place —
  // simulation.scoreHabitat and the local fallback both read the habitat back out of world.habitats).
  for (const { id } of assigned) {
    const entry = prevMap.get(id);
    let qSum = 0, qN = 0;
    for (const sp of entry.species) { qSum += getHabitatQuality(id, sp); qN++; }
    if (qN) entry.quality = qSum / qN;
  }

  for (const id of touchedIds) ctx.events.emit('habitat:changed', { id });
  return assigned.map((a) => a.id);
}

// ---------------------------------------------------------------------------------------------------------
// boundary tracing (fences.js consumes traceBoundaryEdges directly; boundary() chains it into polylines)
// ---------------------------------------------------------------------------------------------------------

/** Every grid-cell edge on the outside of habitat `id`: {x0,z0,x1,z1,nx,nz} (nx,nz = outward normal). */
export function traceBoundaryEdges(world, id) {
  const g = world.grid, res = g.res, cell = g.cell, half = world.half, hid = g.habitatId;
  const isMine = (ix, iz) => (ix >= 0 && iz >= 0 && ix < res && iz < res && hid[iz * res + ix] === id);
  const edges = [];
  for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
    if (hid[iz * res + ix] !== id) continue;
    const x0 = ix * cell - half, z0 = iz * cell - half, x1 = x0 + cell, z1 = z0 + cell;
    if (!isMine(ix - 1, iz)) edges.push({ x0, z0, x1: x0, z1, nx: -1, nz: 0 });
    if (!isMine(ix + 1, iz)) edges.push({ x0: x1, z0, x1, z1, nx: 1, nz: 0 });
    if (!isMine(ix, iz - 1)) edges.push({ x0, z0, x1, z1: z0, nx: 0, nz: -1 });
    if (!isMine(ix, iz + 1)) edges.push({ x0, z0: z1, x1, z1, nx: 0, nz: 1 });
  }
  return edges;
}

/** Boundary of habitat `id` as one or more polylines [[x,z],...] (best-effort chaining; may split at T-junctions). */
export function boundary(id) {
  const world = Z.world;
  const edges = traceBoundaryEdges(world, id);
  if (!edges.length) return [];
  const key = (x, z) => Math.round(x * 50) + ',' + Math.round(z * 50);
  const pointOf = new Map();
  const adj = new Map();
  const addPt = (x, z) => { const k = key(x, z); if (!pointOf.has(k)) pointOf.set(k, [x, z]); return k; };
  const edgeKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  for (const e of edges) {
    const a = addPt(e.x0, e.z0), b = addPt(e.x1, e.z1);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  const used = new Set();
  const loops = [];
  for (const e of edges) {
    const a = key(e.x0, e.z0), b = key(e.x1, e.z1);
    if (used.has(edgeKey(a, b))) continue;
    const loop = [pointOf.get(a), pointOf.get(b)];
    used.add(edgeKey(a, b));
    let prev = a, cur = b, guard = 0;
    while (cur !== a && guard++ < edges.length + 4) {
      const neighbors = adj.get(cur) || [];
      let next = null;
      for (const cand of neighbors) { if (used.has(edgeKey(cur, cand))) continue; if (cand === prev && neighbors.length > 1) continue; next = cand; break; }
      if (next === null) break;
      used.add(edgeKey(cur, next));
      loop.push(pointOf.get(next));
      prev = cur; cur = next;
    }
    loops.push(loop);
  }
  return loops;
}

// ---------------------------------------------------------------------------------------------------------
// quality
// ---------------------------------------------------------------------------------------------------------

// Fallback preferences (0..1) used only when neither `simulation` nor `animals.speciesInfo` is present.
const FALLBACK_PREFS = {
  lion: { grass: 0.50, trees: 0.35, water: 0.35, roughness: 0.35, cover: 0.55 },
  cheetah: { grass: 0.60, trees: 0.20, water: 0.30, roughness: 0.15, cover: 0.35 },
  zebra: { grass: 0.85, trees: 0.15, water: 0.55, roughness: 0.15, cover: 0.15 },
  wildebeest: { grass: 0.80, trees: 0.10, water: 0.50, roughness: 0.10, cover: 0.10 },
  giraffe: { grass: 0.25, trees: 0.75, water: 0.40, roughness: 0.15, cover: 0.20 },
  elephant: { grass: 0.55, trees: 0.60, water: 0.75, roughness: 0.20, cover: 0.35 },
  rhino: { grass: 0.60, trees: 0.35, water: 0.45, roughness: 0.25, cover: 0.40 },
  buffalo: { grass: 0.70, trees: 0.30, water: 0.55, roughness: 0.20, cover: 0.30 },
  impala: { grass: 0.60, trees: 0.40, water: 0.50, roughness: 0.20, cover: 0.40 },
  hippo: { grass: 0.30, trees: 0.15, water: 0.95, roughness: 0.05, cover: 0.20 },
};
const DEFAULT_PREFS = { grass: 0.5, trees: 0.4, water: 0.4, roughness: 0.25, cover: 0.3 };

function localScore(world, id, species) {
  const h = world.habitats.get(id);
  if (!h) return 0;
  const animals = Z.ctx.modules.get('animals');
  let prefs = FALLBACK_PREFS[species] || DEFAULT_PREFS;
  try {
    const info = animals?.speciesInfo?.(species);
    const p = info?.prefs || info?.habitat || info?.preferences;
    if (p) prefs = { ...prefs, ...p };
  } catch { /* animals module misbehaving — keep the fallback table */ }
  const match = (p, a) => clamp01(1 - Math.abs(p - a) * 1.3);
  const q = 0.30 * match(prefs.grass, h.grass) + 0.20 * match(prefs.trees, h.shade) + 0.25 * match(prefs.water, h.water)
    + 0.10 * match(prefs.roughness, h.roughness) + 0.15 * match(prefs.cover, h.cover);
  return clamp01(q);
}

/** Habitat quality in [0,1] for `species`. Delegates to simulation.scoreHabitat when the module is present. */
export function getHabitatQuality(id, species) {
  const ctx = Z.ctx;
  const sim = ctx.modules.get('simulation');
  if (sim?.scoreHabitat) { try { return sim.scoreHabitat(id, species); } catch { /* fall through */ } }
  return localScore(ctx.world, id, species);
}
