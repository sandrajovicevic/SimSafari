// Road tool: click-to-place control points, Catmull-Rom preview ribbon, node/edge snapping,
// grade warning (>12% shown red, see cursors.js), kind selector, bulldoze mode.
import { spend } from './common.js';

const SNAP_DIST = 6;
const DOUBLE_CLICK_MS = 320;

export const RoadTool = {
  id: 'road',
  needs: ['roads'],
  defaults: { kind: 'dirt', bulldoze: false },

  activate(ctx, S) {
    S.road = { points: [], lastClickT: 0, lastClickPt: null };
    _committedSnap.valid = false;
  },

  deactivate(ctx, S) {
    S.road = { points: [], lastClickT: 0, lastClickPt: null };
    _committedSnap.valid = false;
    S.ribbon.hide();
  },

  pointerDown(ctx, S, e) {
    if (e.button !== 0) return;
    const roads = ctx.modules.get('roads');
    if (!roads || !e.ground) return;

    if (S.options.bulldoze) {
      const near = roads.nearestEdge(e.ground.x, e.ground.z, 8);
      if (near) bulldozeEdge(ctx, S, roads, near.edge.id);
      return;
    }

    const now = performance.now();
    const snapped = snapPoint(roads, e.ground.x, e.ground.z);
    const isDouble = S.road.lastClickPt && now - S.road.lastClickT < DOUBLE_CLICK_MS
      && Math.hypot(snapped.x - S.road.lastClickPt.x, snapped.z - S.road.lastClickPt.z) < 2;
    S.road.lastClickT = now; S.road.lastClickPt = { x: snapped.x, z: snapped.z };
    if (snapped.snapped) { _committedSnap.x = snapped.x; _committedSnap.z = snapped.z; _committedSnap.valid = true; }

    S.road.points.push(snapped);
    if (isDouble || S.road.points.length >= 24) commitPath(ctx, S, roads);
  },

  update(ctx, S, dt) {
    const roads = ctx.modules.get('roads');
    const input = ctx.app.input;
    if (!roads) { S.ribbon.hide(); return; }
    if (S.options.bulldoze) { S.ribbon.hide(); return; }
    // committed points + the live cursor point, in reused scratch (no per-frame arrays/objects)
    const pts = _preview;
    pts.length = 0;
    for (let i = 0; i < S.road.points.length; i++) pts.push(S.road.points[i]);
    let snap = null;
    if (input.groundValid) {
      const p = snapPoint(roads, input.ground.x, input.ground.z, _cursor);
      pts.push(p);
      if (p.snapped) snap = p;
    }
    if (!snap && _committedSnap.valid) snap = _committedSnap; // ring also marks the snapped committed point
    const kind = roads.KINDS?.[S.options.kind];
    S.ribbon.update(ctx.world, pts, kind?.width || 5, snap);
  },

  key(ctx, S, e) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      const roads = ctx.modules.get('roads');
      if (roads) commitPath(ctx, S, roads);
    } else if (e.code === 'Backspace') {
      S.road.points.pop();
    }
  },

  /** Called by the global Escape handler before it considers leaving the tool. Returns true if it
   * consumed the escape (had pending points to clear). */
  cancelPending(S) {
    if (S.road.points.length) { S.road.points = []; return true; }
    return false;
  },
};

const _preview = [];
const _cursor = { x: 0, z: 0, snapped: null };
// The most recent committed point that snapped to a road node/edge (module-level scratch — no
// per-frame allocation). The snap ring marks it as well as the live cursor, so a preview visibly
// hangs off the node it snapped to (critic tools r4: the ring never showed in the road preset,
// whose committed start point snaps but whose live cursor point does not). Lasts until the tool
// is (de)activated — a later non-snapped point does not unmark the junction the path is pinned to.
const _committedSnap = { x: 0, z: 0, valid: false };

/** Snap (x,z) to a road node or edge. Writes into `out` when given (per-frame preview), else allocates
 *  (committed points must be their own objects). */
function snapPoint(roads, x, z, out = { x: 0, z: 0, snapped: null }) {
  const node = roads.nearestNode?.(x, z, SNAP_DIST);
  if (node) { out.x = node.x; out.z = node.z; out.snapped = 'node'; return out; }
  const edge = roads.nearestEdge?.(x, z, SNAP_DIST);
  if (edge) { out.x = edge.point.x; out.z = edge.point.z; out.snapped = 'edge'; return out; }
  out.x = x; out.z = z; out.snapped = null;
  return out;
}

function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return len;
}

function roadCost(roads, points, kind) {
  const rate = roads.KINDS?.[kind]?.cost ?? 1;
  return pathLength(points) * 22 * rate;
}

function commitPath(ctx, S, roads) {
  const points = S.road.points;
  S.road.points = [];
  if (points.length < 2) return;
  const kind = S.options.kind;
  const pts = points.map((p) => [p.x, p.z]);
  const cost = roadCost(roads, points, kind);
  const ids = roads.addRoad(pts, kind) || [];
  spend(ctx, cost);
  const state = { ids };
  S.undo.push({
    label: 'road:add',
    undo(ctx) { const r = ctx.modules.get('roads'); if (r) for (const id of state.ids) r.removeRoad(id); spend(ctx, -cost); },
    redo(ctx) { const r = ctx.modules.get('roads'); if (r) state.ids = r.addRoad(pts, kind) || []; spend(ctx, cost); },
  });
  ctx.events.emit('tool:applied', { tool: 'road', detail: { kind, points: points.length, cost: +cost.toFixed(0), ids } });
}

function bulldozeEdge(ctx, S, roads, edgeId) {
  const edge = roads.getEdge(edgeId);
  if (!edge) return;
  const pts = [];
  for (let i = 0; i < edge.points.length; i += 2) pts.push([edge.points[i], edge.points[i + 1]]);
  const kind = edge.kind, width = edge.width;
  if (!roads.removeRoad(edgeId)) return;
  const refund = pathLength(pts.map(([x, z]) => ({ x, z }))) * 22 * (roads.KINDS?.[kind]?.cost ?? 1) * 0.5;
  spend(ctx, -refund);
  const state = { ids: [] };
  S.undo.push({
    label: 'road:bulldoze',
    undo(ctx) { const r = ctx.modules.get('roads'); if (r) state.ids = r.addRoad(pts, kind, width) || []; spend(ctx, refund); },
    redo(ctx) { const r = ctx.modules.get('roads'); if (r) for (const id of state.ids) r.removeRoad(id); spend(ctx, -refund); },
  });
  ctx.events.emit('tool:applied', { tool: 'road', detail: { bulldoze: true, edgeId, refund: +refund.toFixed(0) } });
}
