// Zone tool: brush-paints world.grid.zone through the `zoning` module (paint/erase/fill/setOverlay),
// live overlay while active (`zoning.setOverlay(true)`). Every write goes through zoning's own public
// functions so its habitat rebuild / fence rebuild / NO_BUILD recompute / overlay-dirty / `zone:changed`
// pipeline always runs correctly — undo/redo replay through `zoning.paintCells(indices, zone)` (which
// exists precisely for "set this exact set of cells to this exact zone"), grouped by each cell's
// captured before/after zone, rather than writing world.grid.zone directly.
import { ZONE } from '../../core/World.js';
import { forEachGridCell, spend } from './common.js';

export const ZoneTool = {
  id: 'zone',
  needs: ['zoning'],
  defaults: { zone: ZONE.HABITAT, radius: 12, mode: 'paint' }, // mode: paint | erase | fill

  activate(ctx, S) {
    S.zoneStroke = null;
    ctx.modules.get('zoning')?.setOverlay?.(true);
  },

  deactivate(ctx, S) {
    if (S.zoneStroke) endStroke(ctx, S);
    ctx.modules.get('zoning')?.setOverlay?.(false);
    S.ring.mesh.visible = false;
  },

  pointerDown(ctx, S, e) {
    if (e.button !== 0) return;
    const zoning = ctx.modules.get('zoning');
    if (!zoning || !e.ground) return;
    if (S.options.mode === 'fill') { fillAt(ctx, S, zoning, e.ground.x, e.ground.z); return; }
    beginStroke(ctx, S);
    applyAt(ctx, S, zoning, e.ground.x, e.ground.z);
  },

  pointerUp(ctx, S, e) {
    if (e.button !== 0) return;
    if (S.zoneStroke) endStroke(ctx, S);
  },

  update(ctx, S) {
    const zoning = ctx.modules.get('zoning');
    const input = ctx.app.input;
    if (S.zoneStroke && (input.buttons & 1) && input.groundValid && zoning) applyAt(ctx, S, zoning, input.ground.x, input.ground.z);
    else if (S.zoneStroke && !(input.buttons & 1)) endStroke(ctx, S);
    S.ring.setColor(S.options.mode === 'erase' ? 0xff5a5a : 0xffcf5c);
    if (zoning && input.groundValid) { S.ring.update(ctx.world, input.ground.x, input.ground.z, S.options.radius); S.ring.mesh.visible = true; }
    else S.ring.mesh.visible = false;
  },

  key(ctx, S, e) {
    if (e.code === 'BracketLeft') S.options.radius = Math.max(4, S.options.radius - 2);
    else if (e.code === 'BracketRight') S.options.radius = Math.min(80, S.options.radius + 2);
  },
};

function beginStroke(ctx, S) {
  S.zoneStroke = { before: new Map(), mode: S.options.mode };
}

function applyAt(ctx, S, zoning, x, z) {
  const { radius, zone, mode } = S.options;
  const before = S.zoneStroke.before;
  forEachGridCell(ctx.world, x, z, radius, (i) => { if (!before.has(i)) before.set(i, ctx.world.grid.zone[i]); });
  if (mode === 'erase') zoning.erase(x, z, radius);
  else zoning.paint(x, z, radius, zone);
}

/** Group a Map<index, zone> into zone -> indices[], remapping the non-paintable NO_BUILD value to
 * NONE (zoning's own NO_BUILD recompute re-asserts it on any cell that is actually blocked). */
function groupByZone(map) {
  const groups = new Map();
  for (const [idx, z] of map) {
    const key = z === ZONE.NO_BUILD ? ZONE.NONE : z;
    let arr = groups.get(key); if (!arr) { arr = []; groups.set(key, arr); }
    arr.push(idx);
  }
  return groups;
}

function fillAt(ctx, S, zoning, x, z) {
  const cell = ctx.world.cellAt(x, z);
  const startZone = ctx.world.grid.zone[cell.index];
  if (startZone === S.options.zone || startZone === ZONE.NO_BUILD) return;
  const touched = zoning.fill(x, z, S.options.zone);
  if (!touched.length) return;
  const before = new Map(touched.map((i) => [i, startZone]));
  const cost = touched.length * 0.15;
  spend(ctx, cost);
  S.undo.push({
    label: 'zone:fill',
    undo(ctx) { const z2 = ctx.modules.get('zoning'); if (z2) for (const [zn, idxs] of groupByZone(before)) z2.paintCells(idxs, zn); spend(ctx, -cost); },
    redo(ctx) { const z2 = ctx.modules.get('zoning'); if (z2) z2.paintCells(touched, S.options.zone); spend(ctx, cost); },
  });
  ctx.events.emit('tool:applied', { tool: 'zone', detail: { mode: 'fill', zone: S.options.zone, cells: touched.length, cost: +cost.toFixed(0) } });
}

function endStroke(ctx, S) {
  const stroke = S.zoneStroke;
  S.zoneStroke = null;
  if (!stroke || !stroke.before.size) return;
  const { before, mode } = stroke;
  const grid = ctx.world.grid;
  const afterMap = new Map();
  for (const idx of before.keys()) afterMap.set(idx, grid.zone[idx]);
  const cost = before.size * 0.15;
  spend(ctx, cost);
  S.undo.push({
    label: `zone:${mode}`,
    undo(ctx) { const z2 = ctx.modules.get('zoning'); if (z2) for (const [zn, idxs] of groupByZone(before)) z2.paintCells(idxs, zn); spend(ctx, -cost); },
    redo(ctx) { const z2 = ctx.modules.get('zoning'); if (z2) for (const [zn, idxs] of groupByZone(afterMap)) z2.paintCells(idxs, zn); spend(ctx, cost); },
  });
  ctx.events.emit('tool:applied', { tool: 'zone', detail: { mode, cells: before.size, cost: +cost.toFixed(0) } });
}
