// Road graph: nodes + edges in world.roads, snapping/splitting, crossings, A*, arc-length sampling.
// Pure data — no rendering. All coordinates in metres, XZ plane.
import * as THREE from 'three';
import { OCC } from '../../core/World.js';

export const KINDS = Object.freeze({
  dirt:   { width: 4.5, cost: 1.35, rank: 0 },
  gravel: { width: 5.0, cost: 1.15, rank: 1 },
  paved:  { width: 6.0, cost: 1.0,  rank: 2 },
});
export const SNAP_DIST = 6;   // m — endpoints/control points snap to nodes or edges within this
export const STEP = 2;        // m — polyline sample spacing

/** Cumulative arc length of a flat [x,z,...] polyline. */
export function cumulative(points) {
  const n = points.length >> 1;
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const dx = points[i * 2] - points[i * 2 - 2], dz = points[i * 2 + 1] - points[i * 2 - 1];
    cum[i] = cum[i - 1] + Math.hypot(dx, dz);
  }
  return cum;
}

/** Resample a polyline ({x,z}[]) to uniform spacing ≈ step, keeping both ends exactly. Returns [x,z,...]. */
export function resample(pts, step = STEP) {
  const out = [];
  if (pts.length === 0) return out;
  if (pts.length === 1) return [pts[0].x, pts[0].z];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const n = Math.max(1, Math.round(total / step));
  const ds = total / n;
  let seg = 0, segStart = 0, segLen = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
  for (let k = 0; k <= n; k++) {
    const s = Math.min(total, k * ds);
    while (seg < pts.length - 2 && s > segStart + segLen) {
      segStart += segLen; seg++;
      segLen = Math.hypot(pts[seg + 1].x - pts[seg].x, pts[seg + 1].z - pts[seg].z);
    }
    const t = segLen > 1e-9 ? Math.min(1, Math.max(0, (s - segStart) / segLen)) : 0;
    out.push(pts[seg].x + (pts[seg + 1].x - pts[seg].x) * t, pts[seg].z + (pts[seg + 1].z - pts[seg].z) * t);
  }
  // exact end
  out[out.length - 2] = pts[pts.length - 1].x; out[out.length - 1] = pts[pts.length - 1].z;
  return out;
}

/** Smooth centripetal Catmull-Rom through control points ({x,z}[]) → dense {x,z}[] (≈0.5 m). */
export function smoothCurve(ctrl) {
  if (ctrl.length < 2) return ctrl.slice();
  if (ctrl.length === 2) return ctrl.slice();
  const v3 = ctrl.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const curve = new THREE.CatmullRomCurve3(v3, false, 'centripetal', 0.5);
  let len = 0;
  for (let i = 1; i < ctrl.length; i++) len += Math.hypot(ctrl[i].x - ctrl[i - 1].x, ctrl[i].z - ctrl[i - 1].z);
  const n = Math.max(4, Math.ceil(len / 0.5));
  return curve.getSpacedPoints(n).map((p) => ({ x: p.x, z: p.z }));
}

/** Nearest point on a flat polyline. Returns {s, dist, x, z, seg}. */
export function nearestOnPolyline(points, cum, x, z) {
  const n = points.length >> 1;
  let best = { s: 0, dist: Infinity, x: points[0], z: points[1], seg: 0 };
  for (let i = 0; i < n - 1; i++) {
    const ax = points[i * 2], az = points[i * 2 + 1], bx = points[i * 2 + 2], bz = points[i * 2 + 3];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < best.dist) best = { s: cum[i] + (cum[i + 1] - cum[i]) * t, dist: d, x: px, z: pz, seg: i };
  }
  return best;
}

function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz;
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: ax + r1x * t, z: az + r1z * t };
}

export class RoadGraph {
  constructor(world, events, log) {
    this.world = world;
    this.events = events;
    this.log = log;
    this.roads = world.roads;
    if (!this.roads.nodes) this.roads.nodes = new Map();
    if (!this.roads.edges) this.roads.edges = new Map();
    if (this.roads.version === undefined) this.roads.version = 0;
    this._occDirty = true;
  }

  get nodes() { return this.roads.nodes; }
  get edges() { return this.roads.edges; }
  version() { return this.roads.version; }
  bump() { this.roads.version++; }

  // ---------- nodes ----------

  _addNode(x, z) {
    const id = this.world.nextId('n');
    const node = { id, x, z, edges: [] };
    this.nodes.set(id, node);
    return node;
  }

  nearestNode(x, z, maxDist = Infinity) {
    let best = null, bd = maxDist;
    for (const n of this.nodes.values()) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  degree(nodeId) { return this.nodes.get(nodeId)?.edges.length || 0; }

  /** Outward unit direction of an edge at one of its end nodes. */
  edgeDirAt(edge, nodeId) {
    const p = edge.points, n = p.length >> 1;
    let dx, dz;
    if (edge.a === nodeId) { dx = p[2] - p[0]; dz = p[3] - p[1]; }
    else { dx = p[n * 2 - 4] - p[n * 2 - 2]; dz = p[n * 2 - 3] - p[n * 2 - 1]; }
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  // ---------- edges ----------

  _addEdge(a, b, kind, width, points) {
    const id = this.world.nextId('e');
    const cum = cumulative(points);
    const edge = { id, a, b, kind, width, points, length: cum[cum.length - 1], cum, ys: null };
    this.edges.set(id, edge);
    this.nodes.get(a).edges.push(id);
    this.nodes.get(b).edges.push(id);
    this._occDirty = true;
    return edge;
  }

  _removeEdge(id, pruneNodes = true) {
    const e = this.edges.get(id);
    if (!e) return false;
    this.edges.delete(id);
    for (const nid of [e.a, e.b]) {
      const n = this.nodes.get(nid);
      if (!n) continue;
      const i = n.edges.indexOf(id);
      if (i >= 0) n.edges.splice(i, 1);
      if (pruneNodes && n.edges.length === 0) this.nodes.delete(nid);
    }
    this._occDirty = true;
    return true;
  }

  /** Split an edge at arc length s → node id. Reuses an end node when s is within 1.5 m of it. */
  splitEdge(edgeId, s) {
    const e = this.edges.get(edgeId);
    if (!e) return null;
    if (s <= 1.5) return e.a;
    if (s >= e.length - 1.5) return e.b;
    const pts = [], n = e.points.length >> 1;
    for (let i = 0; i < n; i++) pts.push({ x: e.points[i * 2], z: e.points[i * 2 + 1] });
    let seg = 0;
    while (seg < n - 2 && e.cum[seg + 1] < s) seg++;
    const segLen = e.cum[seg + 1] - e.cum[seg];
    const t = segLen > 1e-9 ? (s - e.cum[seg]) / segLen : 0;
    const P = { x: pts[seg].x + (pts[seg + 1].x - pts[seg].x) * t, z: pts[seg].z + (pts[seg + 1].z - pts[seg].z) * t };
    const first = pts.slice(0, seg + 1).concat([P]);
    const second = [P].concat(pts.slice(seg + 1));
    const node = this._addNode(P.x, P.z);
    const { a, b, kind, width } = e;
    this._removeEdge(edgeId, false);
    this.events.emit('road:removed', { edgeId, split: true });
    const e1 = this._addEdge(a, node.id, kind, width, resample(first));
    const e2 = this._addEdge(node.id, b, kind, width, resample(second));
    this.events.emit('road:added', { edgeId: e1.id, split: true });
    this.events.emit('road:added', { edgeId: e2.id, split: true });
    return node.id;
  }

  /** Snap (x,z) to an existing node/edge within SNAP_DIST. Returns node id or null. Splits edges. */
  snapPoint(x, z, excludeEdges = null) {
    const n = this.nearestNode(x, z, SNAP_DIST);
    if (n) return n.id;
    const ne = this.nearestEdge(x, z, excludeEdges);
    if (ne && ne.dist <= SNAP_DIST) return this.splitEdge(ne.edge.id, ne.s);
    return null;
  }

  /**
   * Add a road through control points [[x,z],...]. Returns array of new edge ids (may be several: the
   * road is split at every node it snaps to or crosses).
   */
  addRoad(points, kind = 'dirt', width) {
    if (!KINDS[kind]) kind = 'dirt';
    width = width || KINDS[kind].width;
    const ctrl = points.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z }));
    if (ctrl.length < 2) return [];
    // 1. snap control points (endpoints + intermediates) to nodes/edges
    const snapped = ctrl.map((p) => {
      const nid = this.snapPoint(p.x, p.z);
      if (nid) { const nd = this.nodes.get(nid); return { x: nd.x, z: nd.z, node: nid }; }
      return { x: p.x, z: p.z, node: null };
    });
    // drop consecutive duplicates
    const uniq = [snapped[0]];
    for (let i = 1; i < snapped.length; i++) {
      const p = snapped[i], q = uniq[uniq.length - 1];
      if (Math.hypot(p.x - q.x, p.z - q.z) > 0.5) uniq.push(p);
    }
    if (uniq.length < 2) return [];
    // 2. smooth + resample
    const dense = smoothCurve(uniq);
    const poly = resample(dense, STEP);
    const cum = cumulative(poly);
    const L = cum[cum.length - 1];
    if (L < 2) return [];
    // 3. markers: start, end, snapped intermediate ctrl points, crossings with existing edges
    const markers = [];
    for (let i = 0; i < uniq.length; i++) {
      const p = uniq[i];
      if (!p.node) continue;
      const s = i === 0 ? 0 : i === uniq.length - 1 ? L : nearestOnPolyline(poly, cum, p.x, p.z).s;
      markers.push({ s, node: p.node });
    }
    const crossings = [];
    const np = poly.length >> 1;
    for (const e of this.edges.values()) {
      const ep = e.points, en = ep.length >> 1;
      for (let i = 0; i < np - 1; i++) {
        const ax = poly[i * 2], az = poly[i * 2 + 1], bx = poly[i * 2 + 2], bz = poly[i * 2 + 3];
        for (let j = 0; j < en - 1; j++) {
          const hit = segIntersect(ax, az, bx, bz, ep[j * 2], ep[j * 2 + 1], ep[j * 2 + 2], ep[j * 2 + 3]);
          if (hit) {
            const s = cum[i] + (cum[i + 1] - cum[i]) * hit.t;
            // ignore crossings at already-marked nodes (snapped ends touching this edge)
            if (!markers.some((m) => Math.abs(m.s - s) < SNAP_DIST)) crossings.push({ s, x: hit.x, z: hit.z });
          }
        }
      }
    }
    crossings.sort((p, q) => p.s - q.s);
    for (const c of crossings) {
      if (markers.some((m) => Math.abs(m.s - c.s) < 3)) continue;
      const ne = this.nearestEdge(c.x, c.z);
      if (!ne) continue;
      const nid = this.splitEdge(ne.edge.id, ne.s);
      const nd = this.nodes.get(nid);
      markers.push({ s: c.s, node: nid, x: nd.x, z: nd.z });
    }
    if (!markers.some((m) => m.s === 0)) markers.push({ s: 0, node: null });
    if (!markers.some((m) => m.s === L)) markers.push({ s: L, node: null });
    markers.sort((p, q) => p.s - q.s);
    // dedupe close markers (keep the one with a node)
    const mk = [];
    for (const m of markers) {
      const last = mk[mk.length - 1];
      if (last && m.s - last.s < 3) { if (!last.node && m.node) mk[mk.length - 1] = m; continue; }
      mk.push(m);
    }
    // 4. create nodes for unsnapped markers and edges between consecutive markers
    const ids = [];
    for (const m of mk) {
      if (!m.node) {
        const p = this._pointAt(poly, cum, m.s);
        m.node = this._addNode(p.x, p.z).id;
      }
    }
    for (let k = 0; k < mk.length - 1; k++) {
      const m0 = mk[k], m1 = mk[k + 1];
      const n0 = this.nodes.get(m0.node), n1 = this.nodes.get(m1.node);
      const pts = [{ x: n0.x, z: n0.z }];
      for (let i = 0; i < np; i++) {
        if (cum[i] > m0.s + 0.75 && cum[i] < m1.s - 0.75) pts.push({ x: poly[i * 2], z: poly[i * 2 + 1] });
      }
      pts.push({ x: n1.x, z: n1.z });
      const e = this._addEdge(n0.id, n1.id, kind, width, resample(pts, STEP));
      ids.push(e.id);
    }
    this.bump();
    for (const id of ids) this.events.emit('road:added', { edgeId: id });
    return ids;
  }

  _pointAt(poly, cum, s) {
    const n = poly.length >> 1;
    let i = 0;
    while (i < n - 2 && cum[i + 1] < s) i++;
    const l = cum[i + 1] - cum[i];
    const t = l > 1e-9 ? Math.min(1, Math.max(0, (s - cum[i]) / l)) : 0;
    return { x: poly[i * 2] + (poly[i * 2 + 2] - poly[i * 2]) * t, z: poly[i * 2 + 1] + (poly[i * 2 + 3] - poly[i * 2 + 1]) * t };
  }

  removeRoad(edgeId) {
    if (!this._removeEdge(edgeId)) return false;
    this.bump();
    this.events.emit('road:removed', { edgeId });
    return true;
  }

  clear() {
    const ids = [...this.edges.keys()];
    for (const id of ids) this._removeEdge(id);
    this.nodes.clear();
    this.bump();
    for (const id of ids) this.events.emit('road:removed', { edgeId: id });
  }

  // ---------- queries ----------

  /** Nearest edge to (x,z) → {edge, s, dist, point:{x,z}} or null. */
  nearestEdge(x, z, excludeEdges = null, maxDist = Infinity) {
    let best = null, bd = maxDist;
    for (const e of this.edges.values()) {
      if (excludeEdges && excludeEdges.has(e.id)) continue;
      if (!e.bbox) this._bbox(e);
      const b = e.bbox;
      if (x < b.x0 - bd || x > b.x1 + bd || z < b.z0 - bd || z > b.z1 + bd) continue;
      const r = nearestOnPolyline(e.points, e.cum, x, z);
      if (r.dist < bd) { bd = r.dist; best = { edge: e, s: r.s, dist: r.dist, point: { x: r.x, z: r.z } }; }
    }
    return best;
  }

  _bbox(e) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < e.points.length; i += 2) {
      const x = e.points[i], z = e.points[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    e.bbox = { x0, z0, x1, z1 };
  }

  /**
   * Position + tangent at arc length s along an edge. out = { position: Vector3, tangent: Vector3 }.
   * y comes from the built mesh (crown / bridge deck) when available, else the heightfield + 0.05.
   */
  sampleEdge(edgeId, s, out) {
    const e = this.edges.get(edgeId);
    if (!e) return null;
    if (!out) out = { position: new THREE.Vector3(), tangent: new THREE.Vector3() };
    const cum = e.cum, p = e.points, n = p.length >> 1;
    if (s < 0) s = 0; else if (s > e.length) s = e.length;
    // binary search segment
    let lo = 0, hi = n - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const i = lo, l = cum[i + 1] - cum[i];
    const t = l > 1e-9 ? (s - cum[i]) / l : 0;
    const x = p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * t, z = p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * t;
    let y, y0, y1;
    if (e.ys) { y0 = e.ys[i]; y1 = e.ys[i + 1]; y = y0 + (y1 - y0) * t; }
    else { y0 = this.world.getHeight(p[i * 2], p[i * 2 + 1]) + 0.05; y1 = this.world.getHeight(p[i * 2 + 2], p[i * 2 + 3]) + 0.05; y = y0 + (y1 - y0) * t; }
    out.position.set(x, y, z);
    out.tangent.set(p[i * 2 + 2] - p[i * 2], y1 - y0, p[i * 2 + 3] - p[i * 2 + 1]).normalize();
    out.s = s; out.edge = e;
    return out;
  }

  /** A* over nodes. Returns array of node ids (a…b) or null. */
  pathfind(a, b) {
    const r = this.route(a, b);
    return r ? r.nodes : null;
  }

  /** A* → { nodes: [ids], edges: [ids], length } or null. Cost = length × kind.cost. */
  route(a, b) {
    const nodes = this.nodes;
    if (!nodes.has(a) || !nodes.has(b)) return null;
    const goal = nodes.get(b);
    const h = (id) => { const n = nodes.get(id); return Math.hypot(n.x - goal.x, n.z - goal.z); };
    const g = new Map([[a, 0]]), came = new Map(), open = [a], closed = new Set();
    const f = new Map([[a, h(a)]]);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f.get(open[i]) < f.get(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === b) {
        const ns = [cur], es = [];
        let c = cur;
        while (came.has(c)) { const [prev, e] = came.get(c); ns.push(prev); es.push(e); c = prev; }
        ns.reverse(); es.reverse();
        return { nodes: ns, edges: es, length: g.get(b) };
      }
      closed.add(cur);
      for (const eid of nodes.get(cur).edges) {
        const e = this.edges.get(eid);
        const nb = e.a === cur ? e.b : e.a;
        if (closed.has(nb)) continue;
        const ng = g.get(cur) + e.length * (KINDS[e.kind]?.cost ?? 1);
        if (ng < (g.get(nb) ?? Infinity)) {
          g.set(nb, ng); f.set(nb, ng + h(nb)); came.set(nb, [cur, eid]);
          if (!open.includes(nb)) open.push(nb);
        }
      }
    }
    return null;
  }

  /** Lane layout. Left-hand traffic (safari parks drive on the left). offset > 0 = left of the a→b tangent. */
  getLanes(edgeId) {
    const e = this.edges.get(edgeId);
    if (!e) return null;
    const lw = e.width * 0.5;
    return {
      width: e.width, laneWidth: lw, count: 2, leftHand: true,
      lanes: [
        { index: 0, offset: +lw * 0.5, forward: true,  from: e.a, to: e.b },
        { index: 1, offset: -lw * 0.5, forward: false, from: e.b, to: e.a },
      ],
    };
  }

  // ---------- occupancy ----------

  /** Re-mark world.grid.occupancy: clear ROAD cells then stamp every edge. */
  markOccupancy() {
    const w = this.world, g = w.grid;
    for (let i = 0; i < g.occupancy.length; i++) if (g.occupancy[i] === OCC.ROAD) g.occupancy[i] = OCC.FREE;
    for (const e of this.edges.values()) {
      const r = e.width * 0.5 + 0.5, p = e.points;
      for (let i = 0; i < p.length; i += 2) {
        const x = p[i], z = p[i + 1];
        const c0 = w.cellAt(x - r, z - r), c1 = w.cellAt(x + r, z + r);
        for (let iz = c0.iz; iz <= c1.iz; iz++) for (let ix = c0.ix; ix <= c1.ix; ix++) {
          const idx = iz * g.res + ix;
          if (g.occupancy[idx] === OCC.FREE || g.occupancy[idx] === OCC.PROP) g.occupancy[idx] = OCC.ROAD;
        }
      }
    }
    g.version++;
    this._occDirty = false;
  }

  /** Total length in metres by kind. */
  stats() {
    const out = { edges: this.edges.size, nodes: this.nodes.size, length: 0, dirt: 0, gravel: 0, paved: 0, junctions: 0 };
    for (const e of this.edges.values()) { out.length += e.length; out[e.kind] += e.length; }
    for (const n of this.nodes.values()) if (n.edges.length >= 3) out.junctions++;
    return out;
  }
}
