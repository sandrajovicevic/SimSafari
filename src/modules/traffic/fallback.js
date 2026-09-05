// Minimal built-in road graph, used only when the `roads` module is not present. Same shape as
// roads' public API subset traffic needs (sampleEdge/nearestEdge/pathfind/route/getLanes/edges/nodes)
// so movement.js never has to know which one it is talking to. Deliberately tiny: an oval loop with
// one spur (a 3-way junction), enough for the showcase and for a standalone game run without roads.
import * as THREE from 'three';

function cumulative(points) {
  const n = points.length >> 1;
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const dx = points[i * 2] - points[i * 2 - 2], dz = points[i * 2 + 1] - points[i * 2 - 1];
    cum[i] = cum[i - 1] + Math.hypot(dx, dz);
  }
  return cum;
}

function nearestOnPolyline(points, cum, x, z) {
  const n = points.length >> 1;
  let best = { s: 0, dist: Infinity, x: points[0], z: points[1] };
  for (let i = 0; i < n - 1; i++) {
    const ax = points[i * 2], az = points[i * 2 + 1], bx = points[i * 2 + 2], bz = points[i * 2 + 3];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < best.dist) best = { s: cum[i] + (cum[i + 1] - cum[i]) * t, dist: d, x: px, z: pz };
  }
  return best;
}

function ovalPoints(cx, cz, rx, rz, n = 96) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * rx, cz + Math.sin(a) * rz);
  }
  return pts;
}

export class FallbackGraph {
  constructor(world) {
    this.world = world;
    this.nodes = new Map();
    this.edges = new Map();
    this._v = 1;
    this._build();
  }

  _addNode(x, z) { const id = this.world.nextId('tn'); this.nodes.set(id, { id, x, z, edges: [] }); return id; }
  _addEdge(a, b, kind, width, points) {
    const id = this.world.nextId('te');
    const cum = cumulative(points);
    const e = { id, a, b, kind, width, points, cum, length: cum[cum.length - 1] };
    this.edges.set(id, e);
    this.nodes.get(a).edges.push(id);
    this.nodes.get(b).edges.push(id);
    return e;
  }

  _build() {
    // oval loop split into two edges (paved + gravel half) sharing two nodes, plus a dirt spur off
    // one of them ending at a dead end (so "reverse on a dead end" has something to exercise).
    const loop = ovalPoints(0, 0, 190, 130, 96);
    const half = loop.length / 2;
    const first = loop.slice(0, half + 2), second = loop.slice(half, loop.length).concat(loop.slice(0, 2));
    const nA = this._addNode(first[0], first[1]);
    const nB = this._addNode(first[first.length - 2], first[first.length - 1]);
    this.gate = nA;
    this._addEdge(nA, nB, 'paved', 6, first);
    this._addEdge(nB, nA, 'gravel', 5, second);
    // dirt spur from the mid-point of the gravel half out to a dead-end node (creates a 3-way junction)
    const mid = nearestOnPolyline(second, cumulative(second), 60, -170);
    const spurStart = { x: mid.x, z: mid.z };
    const spurEnd = { x: spurStart.x + 70, z: spurStart.z - 40 };
    const junction = this._addNode(spurStart.x, spurStart.z);
    // splice the junction node into the gravel edge by replacing it with two edges
    const gravelId = [...this.edges.values()].find((e) => e.kind === 'gravel').id;
    const ge = this.edges.get(gravelId);
    this.edges.delete(gravelId);
    this.nodes.get(ge.a).edges = this.nodes.get(ge.a).edges.filter((id) => id !== gravelId);
    this.nodes.get(ge.b).edges = this.nodes.get(ge.b).edges.filter((id) => id !== gravelId);
    const cutIdx = Math.round((mid.s / ge.length) * ((ge.points.length >> 1) - 1)) * 2;
    const p1 = ge.points.slice(0, cutIdx + 2).concat([spurStart.x, spurStart.z]);
    const p2 = [spurStart.x, spurStart.z].concat(ge.points.slice(cutIdx + 2));
    this._addEdge(ge.a, junction, 'gravel', ge.width, p1);
    this._addEdge(junction, ge.b, 'gravel', ge.width, p2);
    const dead = this._addNode(spurEnd.x, spurEnd.z);
    this._addEdge(junction, dead, 'dirt', 4.5, [spurStart.x, spurStart.z, spurEnd.x, spurEnd.z]);
  }

  version() { return this._v; }

  sampleEdge(edgeId, s, out) {
    const e = this.edges.get(edgeId);
    if (!e) return null;
    if (!out) out = { position: new THREE.Vector3(), tangent: new THREE.Vector3() };
    const cum = e.cum, p = e.points, n = p.length >> 1;
    if (s < 0) s = 0; else if (s > e.length) s = e.length;
    let lo = 0, hi = n - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const i = lo, l = cum[i + 1] - cum[i];
    const t = l > 1e-9 ? (s - cum[i]) / l : 0;
    const x = p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * t, z = p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * t;
    const y = this.world.getHeight(x, z) + 0.05;
    out.position.set(x, y, z);
    out.tangent.set(p[i * 2 + 2] - p[i * 2], 0, p[i * 2 + 3] - p[i * 2 + 1]).normalize();
    out.s = s; out.edge = e;
    return out;
  }

  nearestEdge(x, z, maxDist = Infinity) {
    let best = null, bd = maxDist;
    for (const e of this.edges.values()) {
      const r = nearestOnPolyline(e.points, e.cum, x, z);
      if (r.dist < bd) { bd = r.dist; best = { edge: e, s: r.s, dist: r.dist, point: { x: r.x, z: r.z } }; }
    }
    return best;
  }

  getLanes(edgeId) {
    const e = this.edges.get(edgeId);
    if (!e) return null;
    const lw = e.width * 0.5;
    return {
      width: e.width, laneWidth: lw, count: 2, leftHand: true,
      lanes: [
        { index: 0, offset: +lw * 0.5, forward: true, from: e.a, to: e.b },
        { index: 1, offset: -lw * 0.5, forward: false, from: e.b, to: e.a },
      ],
    };
  }

  route(a, b) {
    const h = (id) => { const n = this.nodes.get(id), g = this.nodes.get(b); return Math.hypot(n.x - g.x, n.z - g.z); };
    if (!this.nodes.has(a) || !this.nodes.has(b)) return null;
    const g = new Map([[a, 0]]), came = new Map(), open = [a], closed = new Set(), f = new Map([[a, h(a)]]);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f.get(open[i]) < f.get(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === b) {
        const ns = [cur], es = []; let c = cur;
        while (came.has(c)) { const [prev, e] = came.get(c); ns.push(prev); es.push(e); c = prev; }
        ns.reverse(); es.reverse();
        return { nodes: ns, edges: es, length: g.get(b) };
      }
      closed.add(cur);
      for (const eid of this.nodes.get(cur).edges) {
        const e = this.edges.get(eid);
        const nb = e.a === cur ? e.b : e.a;
        if (closed.has(nb)) continue;
        const ng = g.get(cur) + e.length;
        if (ng < (g.get(nb) ?? Infinity)) { g.set(nb, ng); f.set(nb, ng + h(nb)); came.set(nb, [cur, eid]); if (!open.includes(nb)) open.push(nb); }
      }
    }
    return null;
  }

  pathfind(a, b) { const r = this.route(a, b); return r ? r.nodes : null; }
  edgesMap() { return this.edges; }
  nodesMap() { return this.nodes; }
}
