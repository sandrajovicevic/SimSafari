// Shared constants + small pure helpers used by every tool. No THREE objects live here except
// scratch math — geometry helpers live in cursors.js.

export const COST = {
  terrainPerM3: 3.5,       // raise/lower/flatten
  smoothPerApply: 4,       // flat rate per smooth application (radius-scaled)
  paintPerM2: 0.6,         // paintBiome
  roadPerMetre: { dirt: 18, gravel: 32, paved: 65 }, // fallback if roads.KINDS unavailable
  animal: 750,             // flat release cost per animal
  bulldozeRefundFrac: 0.5, // fraction of build cost refunded on bulldoze
};

export const DELETE_CONFIRM_WINDOW = 3; // seconds a second Delete press has to land

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** Subtract cost from world.economy.cash, only when a `simulation` module is loaded (per spec).
 * There is no public "spend" API on world.economy (it's owner-written by `simulation`) — this is a
 * pragmatic direct write, flagged as a core-change-request (docs/requests/tools.md). */
export function spend(ctx, amount) {
  if (!amount) return true;
  const sim = ctx.modules.get('simulation');
  if (!sim) return false;
  const eco = ctx.world.economy;
  eco.cash -= amount;
  ctx.events.emit('economy:updated', { cash: eco.cash, income: eco.income, expenses: eco.expenses, day: ctx.world.time.day });
  return true;
}

/** Iterate integer sample-grid cells whose centre falls within radius r of (x,z), against
 * world.terrain (res/cell/half). Mirrors the private falloff-iteration terrain's edit API uses
 * internally, reimplemented here (against public World fields only) purely for undo bookkeeping —
 * it does not touch terrain state. */
export function forEachTerrainCell(world, x, z, r, fn) {
  const T = world.terrain, cell = T.cell, half = world.half, res = T.res;
  const ix0 = Math.max(0, Math.floor((x - r + half) / cell)), ix1 = Math.min(res - 1, Math.ceil((x + r + half) / cell));
  const iz0 = Math.max(0, Math.floor((z - r + half) / cell)), iz1 = Math.min(res - 1, Math.ceil((z + r + half) / cell));
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const sx = ix * cell - half, sz = iz * cell - half;
    if (Math.hypot(sx - x, sz - z) > r) continue;
    fn(iz * res + ix, ix, iz);
  }
  return { ix0, ix1, iz0, iz1 };
}

/** Iterate zoning-grid cells (world.grid, 4 m) within radius r of (x,z). */
export function forEachGridCell(world, x, z, r, fn) {
  const g = world.grid, half = world.half;
  const ix0 = Math.max(0, Math.floor((x - r + half) / g.cell)), ix1 = Math.min(g.res - 1, Math.ceil((x + r + half) / g.cell));
  const iz0 = Math.max(0, Math.floor((z - r + half) / g.cell)), iz1 = Math.min(g.res - 1, Math.ceil((z + r + half) / g.cell));
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const cx = (ix + 0.5) * g.cell - half, cz = (iz + 0.5) * g.cell - half;
    if (Math.hypot(cx - x, cz - z) > r) continue;
    fn(iz * g.res + ix, ix, iz);
  }
  return { ix0, ix1, iz0, iz1 };
}

/** Pick the nearest world entity to (x,z): building | animal | road | habitat.
 * Implemented as radius/nearest-lookup against public world state and module query APIs rather than
 * a true mesh raycast — buildings/animals expose no per-instance pick id (their InstancedMesh slot
 * bookkeeping is private), so this is the robust option the public contract actually supports.
 * Returns { kind, id, dist } | null. */
export function pickEntity(ctx, x, z, opts = {}) {
  const world = ctx.world;
  const kinds = opts.kinds || ['building', 'animal', 'road', 'habitat'];
  const candidates = [];

  if (kinds.includes('building')) {
    for (const rec of world.buildings.values()) {
      const rad = Math.max(2, Math.hypot(rec.w || 4, rec.d || 4) * 0.5);
      const d = Math.hypot(rec.x - x, rec.z - z);
      if (d <= rad + 1.2) candidates.push({ kind: 'building', id: rec.id, dist: d });
    }
  }
  if (kinds.includes('animal')) {
    for (const rec of world.animals.values()) {
      const rad = 2.4;
      const d = Math.hypot(rec.x - x, rec.z - z);
      if (d <= rad) candidates.push({ kind: 'animal', id: rec.id, dist: d });
    }
  }
  if (kinds.includes('road')) {
    const roads = ctx.modules.get('roads');
    if (roads?.nearestEdge) {
      const near = roads.nearestEdge(x, z, 6);
      if (near) candidates.push({ kind: 'road', id: near.edge.id, dist: near.dist });
    }
  }
  if (kinds.includes('habitat')) {
    const cell = world.cellAt(x, z);
    const hid = world.grid.habitatId[cell.index];
    if (hid) candidates.push({ kind: 'habitat', id: hid, dist: 999 }); // lowest priority
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0];
}

/** Approximate world-space anchor point for a selected entity (for the selection marker / camera). */
export function entityPosition(ctx, kind, id) {
  const world = ctx.world;
  if (kind === 'building') { const r = world.buildings.get(id); return r ? { x: r.x, y: r.y, z: r.z } : null; }
  if (kind === 'animal') { const r = world.animals.get(id); return r ? { x: r.x, y: r.y ?? world.getHeight(r.x, r.z), z: r.z } : null; }
  if (kind === 'road') {
    const roads = ctx.modules.get('roads');
    const edge = roads?.getEdge?.(id);
    if (!edge) return null;
    const mid = Math.floor(edge.points.length / 4) * 2;
    const x = edge.points[mid] ?? edge.points[0], z = edge.points[mid + 1] ?? edge.points[1];
    return { x, y: world.getHeight(x, z), z };
  }
  if (kind === 'habitat') {
    const h = world.habitats.get(id);
    if (!h || !h.cells || !h.cells.length) return null;
    let sx = 0, sz = 0;
    for (const idx of h.cells) { const ix = idx % world.grid.res, iz = (idx - ix) / world.grid.res; const c = world.cellCenter(ix, iz); sx += c.x; sz += c.z; }
    const x = sx / h.cells.length, z = sz / h.cells.length;
    return { x, y: world.getHeight(x, z), z };
  }
  return null;
}
