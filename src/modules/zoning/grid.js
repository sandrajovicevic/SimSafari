// Zone grid: paint/erase/fill/getZone, the auto NO_BUILD sweep (water + roads), and read-only queries
// (cellsInRadius, isBuildable, nearestHabitat). Owns world.grid.zone; world.grid.habitatId is written
// by habitats.js right after any edit here.
import { ZONE, OCC } from '../../core/World.js';
import { Z } from './state.js';
import { rebuildHabitats } from './habitats.js';
import { markOverlayDirty } from './overlay.js';
import { rebuildFences } from './fences.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function validPaintZone(z) { return z === ZONE.HABITAT || z === ZONE.VISITOR || z === ZONE.SERVICE || z === ZONE.NONE; }

function rectFor(x, z, r) {
  const w = Z.world, g = w.grid, half = w.half, cell = g.cell;
  return {
    ix0: clamp(Math.floor((x - r + half) / cell), 0, g.res - 1),
    ix1: clamp(Math.ceil((x + r + half) / cell), 0, g.res - 1),
    iz0: clamp(Math.floor((z - r + half) / cell), 0, g.res - 1),
    iz1: clamp(Math.ceil((z + r + half) / cell), 0, g.res - 1),
  };
}

/** World-space rect (metres) → grid-cell rect, padded by `pad` cells and clamped to the grid. */
export function rectFromWorld(x0, z0, x1, z1, pad = 1) {
  const w = Z.world, g = w.grid, half = w.half, cell = g.cell;
  return {
    ix0: clamp(Math.floor((x0 + half) / cell) - pad, 0, g.res - 1),
    ix1: clamp(Math.ceil((x1 + half) / cell) + pad, 0, g.res - 1),
    iz0: clamp(Math.floor((z0 + half) / cell) - pad, 0, g.res - 1),
    iz1: clamp(Math.ceil((z1 + half) / cell) + pad, 0, g.res - 1),
  };
}

function rectForCells(cells, pad = 1) {
  const g = Z.world.grid, res = g.res;
  let ix0 = res, ix1 = -1, iz0 = res, iz1 = -1;
  for (const idx of cells) {
    const ix = idx % res, iz = (idx - ix) / res;
    if (ix < ix0) ix0 = ix; if (ix > ix1) ix1 = ix;
    if (iz < iz0) iz0 = iz; if (iz > iz1) iz1 = iz;
  }
  return {
    ix0: clamp(ix0 - pad, 0, res - 1), ix1: clamp(ix1 + pad, 0, res - 1),
    iz0: clamp(iz0 - pad, 0, res - 1), iz1: clamp(iz1 + pad, 0, res - 1),
  };
}

/** Cells (grid indices) whose centre lies within `radius` metres of (x, z). Public + used internally. */
export function cellsInRadius(x, z, radius) {
  const w = Z.world, g = w.grid;
  const { ix0, ix1, iz0, iz1 } = rectFor(x, z, radius);
  const out = [];
  const r2 = radius * radius;
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const { x: cx, z: cz } = w.cellCenter(ix, iz);
    const dx = cx - x, dz = cz - z;
    if (dx * dx + dz * dz <= r2) out.push(iz * g.res + ix);
  }
  return out;
}

/** Auto zone: water or road/building occupancy always reads as NO_BUILD, regardless of manual paint. */
function autoBlocked(world, terrain, x, z, ix, iz) {
  const occ = world.grid.occupancy[iz * world.grid.res + ix];
  if (occ === OCC.ROAD || occ === OCC.BUILDING) return true;
  return terrain?.isWaterAt ? terrain.isWaterAt(x, z) : world.isWater(x, z);
}

/** Recompute the derived NO_BUILD flag over a rect (default: whole grid). Never touches manual zones elsewhere. */
export function recomputeNoBuild(rect) {
  const world = Z.world, ctx = Z.ctx, g = world.grid;
  const terrain = ctx.modules.get('terrain');
  const r = rect || { ix0: 0, iz0: 0, ix1: g.res - 1, iz1: g.res - 1 };
  let changed = false;
  for (let iz = r.iz0; iz <= r.iz1; iz++) {
    for (let ix = r.ix0; ix <= r.ix1; ix++) {
      const idx = iz * g.res + ix;
      const { x, z } = world.cellCenter(ix, iz);
      const blocked = autoBlocked(world, terrain, x, z, ix, iz);
      if (blocked) {
        if (g.zone[idx] !== ZONE.NO_BUILD) { g.zone[idx] = ZONE.NO_BUILD; g.habitatId[idx] = 0; changed = true; }
      } else if (g.zone[idx] === ZONE.NO_BUILD) { g.zone[idx] = ZONE.NONE; changed = true; }
    }
  }
  return changed;
}

function afterEdit(cells, zone) {
  if (!cells.length) return;
  const rect = rectForCells(cells, 1);
  recomputeNoBuild(rect);
  rebuildHabitats();
  rebuildFences();
  Z.world.grid.version++;
  markOverlayDirty(rect);
  Z.ctx.events.emit('zone:changed', { cells: cells.slice(), zone });
}

/** Paint a disc of `zone` at (x, z). Cells under water/roads are forced to NO_BUILD instead. */
export function paint(x, z, radius, zone) {
  if (!validPaintZone(zone)) { Z.ctx.log.warn(`[zoning] paint(): invalid zone ${zone}`); return []; }
  const cells = cellsInRadius(x, z, Math.max(0, radius));
  const g = Z.world.grid;
  const touched = [];
  for (const idx of cells) {
    if (g.zone[idx] === zone) continue;
    g.zone[idx] = zone;
    touched.push(idx);
  }
  afterEdit(touched, zone);
  return touched;
}

/** Paint an explicit list of cell indices to `zone`. */
export function paintCells(indices, zone) {
  if (!validPaintZone(zone)) { Z.ctx.log.warn(`[zoning] paintCells(): invalid zone ${zone}`); return []; }
  const g = Z.world.grid;
  const touched = [];
  for (const idx of indices) {
    if (idx < 0 || idx >= g.zone.length || g.zone[idx] === zone) continue;
    g.zone[idx] = zone;
    touched.push(idx);
  }
  afterEdit(touched, zone);
  return touched;
}

/** Clear a disc back to NONE (auto NO_BUILD cells are left alone — they are not manually paintable). */
export function erase(x, z, radius) {
  const cells = cellsInRadius(x, z, Math.max(0, radius));
  const g = Z.world.grid;
  const touched = [];
  for (const idx of cells) {
    if (g.zone[idx] === ZONE.NO_BUILD || g.zone[idx] === ZONE.NONE) continue;
    g.zone[idx] = ZONE.NONE;
    touched.push(idx);
  }
  afterEdit(touched, ZONE.NONE);
  return touched;
}

/** Paint-bucket: flood-fill every cell 4-connected to (x, z) sharing its current zone, to `zone`. */
export function fill(x, z, zone) {
  if (!validPaintZone(zone)) { Z.ctx.log.warn(`[zoning] fill(): invalid zone ${zone}`); return []; }
  const world = Z.world, g = world.grid, res = g.res;
  const start = world.cellAt(x, z).index;
  const startZone = g.zone[start];
  if (startZone === ZONE.NO_BUILD || startZone === zone) return [];
  const visited = new Uint8Array(res * res);
  const stack = [start];
  visited[start] = 1;
  const touched = [];
  while (stack.length) {
    const c = stack.pop();
    touched.push(c);
    const cx = c % res, cz = (c - cx) / res;
    if (cx > 0) { const n = c - 1; if (!visited[n] && g.zone[n] === startZone) { visited[n] = 1; stack.push(n); } }
    if (cx < res - 1) { const n = c + 1; if (!visited[n] && g.zone[n] === startZone) { visited[n] = 1; stack.push(n); } }
    if (cz > 0) { const n = c - res; if (!visited[n] && g.zone[n] === startZone) { visited[n] = 1; stack.push(n); } }
    if (cz < res - 1) { const n = c + res; if (!visited[n] && g.zone[n] === startZone) { visited[n] = 1; stack.push(n); } }
  }
  for (const c of touched) g.zone[c] = zone;
  afterEdit(touched, zone);
  return touched;
}

export function getZone(x, z) {
  const { index } = Z.world.cellAt(x, z);
  return Z.world.grid.zone[index];
}

/** Every grid cell under a w×d rectangle centred at (x,z) must be zone-buildable and occupancy-free. */
export function isBuildable(x, z, w, d) {
  const world = Z.world, g = world.grid;
  const { ix0, ix1, iz0, iz1 } = rectFor(x, z, Math.max(w, d) * 0.5 + g.cell);
  const hw = w / 2, hd = d / 2;
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const { x: cx, z: cz } = world.cellCenter(ix, iz);
    if (cx < x - hw - g.cell * 0.5 || cx > x + hw + g.cell * 0.5) continue;
    if (cz < z - hd - g.cell * 0.5 || cz > z + hd + g.cell * 0.5) continue;
    const idx = iz * g.res + ix;
    if (g.zone[idx] === ZONE.NO_BUILD) return false;
    if (g.occupancy[idx] === OCC.BUILDING || g.occupancy[idx] === OCC.ROAD) return false;
  }
  return true;
}

/** Nearest habitat to (x,z) by distance to its bounding box (0 if (x,z) is inside it). Null if none exist. */
export function nearestHabitat(x, z) {
  let best = null, bestD = Infinity;
  for (const h of Z.world.habitats.values()) {
    const b = h.bbox;
    const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; best = h; }
  }
  return best ? { id: best.id, distance: bestD } : null;
}
