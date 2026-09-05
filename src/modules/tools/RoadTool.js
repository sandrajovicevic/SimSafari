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
  },

  deactivate(ctx, S) {
    S.road = { points: [], lastClickT: 0, lastClickPt: null };
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

    S.road.points.push(snapped);
    if (isDouble || S.road.points.length >= 24) commitPath(ctx, S, roads);
  },

  update(ctx, S, dt) {
    const roads = ctx.modules.get('roads');
    const input = ctx.app.input;
    if (!roads) { S.ribbon.hide(); return; }
    if (S.options.bulldoze) { S.ribbon.hide(); return; }
    const pts = S.road.points.slice();
    let snap = null;
    if (input.groundValid) {
      const p = snapPoint(roads, input.ground.x, input.ground.z);
      pts.push(p);
      if (p.snapped) snap = p;
    }
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

function snapPoint(roads, x, z) {
  const node = roads.nearestNode?.(x, z, SNAP_DIST);
  if (node) return { x: node.x, z: node.z, snapped: 'node' };
  const edge = roads.nearestEdge?.(x, z, SNAP_DIST);
  if (edge) return { x: edge.point.x, z: edge.point.z, snapped: 'edge' };
  return { x, z, snapped: null };
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
