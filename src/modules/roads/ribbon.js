// Road mesh builder: terrain-conforming ribbons per edge, junction patches at nodes, bridge decks over water.
// Output: one BufferGeometry per road kind (+ bridge geometries), all in world space.
import * as THREE from 'three';
import { KINDS } from './graph.js';
import { ROAD_REPEAT, SKIRT } from './materials.js';

const LIFT = 0.05;          // ribbon above terrain
const SKIRT_LIFT = 0.02;    // outer skirt edge above terrain
const CROWN = { dirt: 0.05, gravel: 0.06, paved: 0.07 };
const RUT_DEPTH = { dirt: 0.045, gravel: 0.022, paved: 0 };
const RUT_POS = 0.82, RUT_W = 0.25;

// ---------------------------------------------------------------------------
// geometry accumulator
class Acc {
  constructor() { this.pos = []; this.uv = []; this.road = []; this.idx = []; this.n = 0; }
  vert(x, y, z, u, v, a, s, ed, jn) {
    this.pos.push(x, y, z); this.uv.push(u, v); this.road.push(a, s, ed, jn);
    return this.n++;
  }
  /** Triangle with +Y-facing winding enforced. */
  tri(i, j, k) {
    const p = this.pos;
    const ax = p[j * 3] - p[i * 3], az = p[j * 3 + 2] - p[i * 3 + 2];
    const bx = p[k * 3] - p[i * 3], bz = p[k * 3 + 2] - p[i * 3 + 2];
    const ny = az * bx - ax * bz;
    if (Math.abs(ny) < 1e-9) return;
    if (ny > 0) this.idx.push(i, j, k); else this.idx.push(i, k, j);
  }
  /** Connect two rows of equal length with quads. */
  strip(r0, r1) {
    for (let i = 0; i < r0.length - 1; i++) {
      this.tri(r0[i], r0[i + 1], r1[i]);
      this.tri(r0[i + 1], r1[i + 1], r1[i]);
    }
  }
  /** Triangle with explicit winding (for vertical / underside faces). */
  triRaw(i, j, k) { this.idx.push(i, j, k); }
  /** Triangle with -Y-facing winding enforced (undersides). */
  triDown(i, j, k) {
    const p = this.pos;
    const ax = p[j * 3] - p[i * 3], az = p[j * 3 + 2] - p[i * 3 + 2];
    const bx = p[k * 3] - p[i * 3], bz = p[k * 3 + 2] - p[i * 3 + 2];
    const ny = az * bx - ax * bz;
    if (Math.abs(ny) < 1e-9) return;
    if (ny < 0) this.idx.push(i, j, k); else this.idx.push(i, k, j);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aRoad', new THREE.Float32BufferAttribute(this.road, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.idx.length === 0; }
}

// ---------------------------------------------------------------------------
/** Arc-length sampler over an edge polyline: position + smoothed tangent at s. */
class Sampler {
  constructor(edge) {
    this.p = edge.points; this.cum = edge.cum; this.n = edge.points.length >> 1; this.length = edge.length;
  }
  at(s, out) {
    const p = this.p, cum = this.cum, n = this.n;
    if (s < 0) s = 0; else if (s > this.length) s = this.length;
    let lo = 0, hi = n - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const i = lo, l = cum[i + 1] - cum[i];
    const t = l > 1e-9 ? (s - cum[i]) / l : 0;
    out.x = p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * t;
    out.z = p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * t;
    // tangent: blend adjacent segment directions
    const dir = (k) => {
      k = Math.max(0, Math.min(n - 2, k));
      const dx = p[k * 2 + 2] - p[k * 2], dz = p[k * 2 + 3] - p[k * 2 + 1], L = Math.hypot(dx, dz) || 1;
      return [dx / L, dz / L];
    };
    const d0 = dir(i), dPrev = dir(i - 1), dNext = dir(i + 1);
    let dx, dz;
    if (t < 0.5) { const w = 0.5 - t; dx = d0[0] * (1 - w) + dPrev[0] * w; dz = d0[1] * (1 - w) + dPrev[1] * w; }
    else { const w = t - 0.5; dx = d0[0] * (1 - w) + dNext[0] * w; dz = d0[1] * (1 - w) + dNext[1] * w; }
    const L = Math.hypot(dx, dz) || 1;
    out.dx = dx / L; out.dz = dz / L;
    return out;
  }
}

function leftOf(dx, dz) { return { x: dz, z: -dx }; }
function angleOf(dx, dz) { return Math.atan2(dz, dx); }

/** Cross-section stops (across metres) for a kind and half width. */
function stops(kind, W) {
  let s;
  if (kind === 'paved') s = [-W, -W + 0.45, -W * 0.55, -W * 0.2, 0, W * 0.2, W * 0.55, W - 0.45, W];
  else s = [-W, -W + 0.4, -1.3, -RUT_POS, -0.4, 0, 0.4, RUT_POS, 1.3, W - 0.4, W];
  s = s.filter((v, i, arr) => i === 0 || v - arr[i - 1] > 0.15);
  return s;
}

function profile(kind, W, a) {
  const aa = Math.abs(a);
  let h = CROWN[kind] * (1 - (a / W) * (a / W));
  const rd = RUT_DEPTH[kind];
  if (rd > 0) { const q = (aa - RUT_POS) / RUT_W; h -= rd * Math.exp(-(q * q)); }
  if (kind === 'paved' && aa > W - 0.45) h -= 0.02 * (aa - (W - 0.45)) / 0.45;
  return h;
}

// ---------------------------------------------------------------------------
/**
 * Build all road meshes.
 * @param graph RoadGraph
 * @param world World
 * @param opts { flatten?: fn(edge, samples) } — optional terrain flattening callback (already applied)
 * @returns { kinds: {dirt,gravel,paved: BufferGeometry|null}, bridges: {wood, concrete: BufferGeometry|null},
 *            junctions: [{node, x, z, R, W, wedgeDir:{x,z}, dirs:[{x,z}], kind}], deadEnds: [...], bridgeSpans: [...] }
 */
export function buildRoadMeshes(graph, world, opts = {}) {
  const H = (x, z) => world.getHeight(x, z);
  const wet = opts.isWater || ((x, z) => world.isWater(x, z));
  const accs = { dirt: new Acc(), gravel: new Acc(), paved: new Acc() };
  const bridgeAccs = { wood: new Acc(), concrete: new Acc() };
  const junctions = [];
  const bridgeSpans = [];

  // ---- 1. node analysis: trim distances and end frames ----
  // endInfo: Map<edgeId, { a: {trim, frame|null, flag}, b: {...} }>
  const endInfo = new Map();
  const nodeInfo = new Map();
  for (const e of graph.edges.values()) endInfo.set(e.id, { a: { trim: 0, frame: null, flag: 0 }, b: { trim: 0, frame: null, flag: 0 } });

  for (const node of graph.nodes.values()) {
    const inc = node.edges.map((id) => graph.edges.get(id)).filter(Boolean);
    if (inc.length === 0) continue;
    const arms = inc.map((e) => {
      const d = graph.edgeDirAt(e, node.id);
      return { e, d, W: e.width * 0.5, ang: angleOf(d.x, d.z), end: e.a === node.id ? 'a' : 'b' };
    });
    const deg = arms.length;
    const sameKind = deg === 2 && arms[0].e.kind === arms[1].e.kind && Math.abs(arms[0].e.width - arms[1].e.width) < 1e-6;
    if (deg === 2 && sameKind) {
      // continuous: shared cross-section frame along the bisector
      const tx = arms[1].d.x - arms[0].d.x, tz = arms[1].d.z - arms[0].d.z;
      const L = Math.hypot(tx, tz);
      if (L > 1e-6) {
        const frame = { x: node.x, z: node.z, dx: tx / L, dz: tz / L };
        for (const arm of arms) { const ei = endInfo.get(arm.e.id)[arm.end]; ei.frame = frame; ei.flag = 0; }
      }
      continue;
    }
    if (deg === 1) {
      const arm = arms[0];
      endInfo.get(arm.e.id)[arm.end].flag = 0.5;
      nodeInfo.set(node.id, { node, arms, deg, kind: arm.e.kind, Wmax: arm.W, Wmin: arm.W });
      continue;
    }
    arms.sort((p, q) => p.ang - q.ang);
    let Wmax = 0, Wmin = Infinity, rank = -1, kind = 'dirt';
    for (const arm of arms) {
      Wmax = Math.max(Wmax, arm.W); Wmin = Math.min(Wmin, arm.W);
      const r = KINDS[arm.e.kind].rank; if (r > rank) { rank = r; kind = arm.e.kind; }
    }
    for (let i = 0; i < deg; i++) {
      const arm = arms[i];
      let x = 0;
      for (const j of [(i + 1) % deg, (i - 1 + deg) % deg]) {
        if (j === i) continue;
        const o = arms[j];
        let th = Math.abs(o.ang - arm.ang); if (th > Math.PI) th = 2 * Math.PI - th;
        const sn = Math.sin(th);
        if (sn > 0.05) x = Math.max(x, (o.W + arm.W * Math.cos(th)) / sn);
      }
      x = Math.min(x, 3.5 * Wmax);
      let trim = Math.max(x, 0) + arm.W * 0.9;
      trim = Math.min(trim, arm.e.length * 0.45);
      const ei = endInfo.get(arm.e.id)[arm.end];
      ei.trim = trim; ei.flag = 1;
      arm.trim = trim;
    }
    nodeInfo.set(node.id, { node, arms, deg, kind, Wmax, Wmin });
  }

  // ---- 2. ribbons per edge (split around bridge spans) ----
  const endRows = new Map(); // edgeId → { a: row, b: row } (vertex descriptors of the trimmed end cross-sections)
  const tmp = { x: 0, z: 0, dx: 0, dz: 0 };

  for (const e of graph.edges.values()) {
    const kind = e.kind, W = e.width * 0.5, rep = ROAD_REPEAT[kind], sk = SKIRT[kind];
    const sampler = new Sampler(e);
    const info = endInfo.get(e.id);
    const acc = accs[kind];
    const st = stops(kind, W);
    const fullStops = [-(W + sk), ...st, W + sk];
    // per-edge centre heights for traffic (2 m samples)
    const np = e.points.length >> 1;
    const ys = new Float32Array(np);
    for (let i = 0; i < np; i++) ys[i] = H(e.points[i * 2], e.points[i * 2 + 1]) + LIFT + CROWN[kind];

    // water spans along the edge
    const spans = [];
    let inWater = false, ws = 0;
    const isWater = (s) => { sampler.at(s, tmp); return wet(tmp.x, tmp.z); };
    for (let s = 0; s <= e.length; s += 1) {
      const w = isWater(s);
      if (w && !inWater) { inWater = true; ws = s; }
      if (!w && inWater) { inWater = false; spans.push([ws, s]); }
    }
    if (inWater) spans.push([ws, e.length]);
    const margin = 4;
    const merged = [];
    for (const [s0, s1] of spans) {
      const a0 = Math.max(info.a.trim + 1, s0 - margin), a1 = Math.min(e.length - info.b.trim - 1, s1 + margin);
      if (a1 - a0 < 2) continue;
      const last = merged[merged.length - 1];
      if (last && a0 <= last[1] + 2) last[1] = Math.max(last[1], a1); else merged.push([a0, a1]);
    }

    // ribbon pieces between spans
    const pieces = [];
    let cur = info.a.trim;
    for (const [s0, s1] of merged) { pieces.push([cur, s0]); cur = s1; }
    pieces.push([cur, e.length - info.b.trim]);

    const rows = { a: null, b: null };
    for (let pi = 0; pi < pieces.length; pi++) {
      const [s0, s1] = pieces[pi];
      if (s1 - s0 < 0.5) continue;
      const nSeg = Math.max(1, Math.ceil((s1 - s0) / 2));
      const ds = (s1 - s0) / nSeg;
      let prevRow = null;
      for (let k = 0; k <= nSeg; k++) {
        const s = s0 + k * ds;
        let cx, cz, dx, dz;
        if (k === 0 && pi === 0 && info.a.frame) { cx = info.a.frame.x; cz = info.a.frame.z; dx = info.a.frame.dx; dz = info.a.frame.dz; }
        else if (k === nSeg && pi === pieces.length - 1 && info.b.frame) { cx = info.b.frame.x; cz = info.b.frame.z; dx = info.b.frame.dx; dz = info.b.frame.dz; }
        else { sampler.at(s, tmp); cx = tmp.x; cz = tmp.z; dx = tmp.dx; dz = tmp.dz; }
        const n = leftOf(dx, dz);
        // junction flag fades in over the last 3 m of a trimmed end
        let flag = 0;
        const dA = s - info.a.trim, dB = (e.length - info.b.trim) - s;
        if (info.a.flag > 0) flag = Math.max(flag, info.a.flag * Math.max(0, 1 - dA / 3));
        if (info.b.flag > 0) flag = Math.max(flag, info.b.flag * Math.max(0, 1 - dB / 3));
        const row = [], desc = [];
        for (const a of fullStops) {
          const x = cx + n.x * a, z = cz + n.z * a;
          const aa = Math.abs(a);
          const onRoad = aa <= W + 1e-6;
          const y = onRoad ? H(x, z) + LIFT + profile(kind, W, a) : H(x, z) + SKIRT_LIFT;
          const ed = W - aa;
          const vi = acc.vert(x, y, z, x / rep, z / rep, a, s, ed, flag);
          row.push(vi);
          desc.push({ x, y, z, a, ed, vi });
        }
        if (prevRow) acc.strip(prevRow, row);
        prevRow = row;
        if (k === 0 && pi === 0) rows.a = { desc, cx, cz, nx: n.x, nz: n.z, dx, dz };
        if (k === nSeg && pi === pieces.length - 1) rows.b = { desc, cx, cz, nx: n.x, nz: n.z, dx, dz };
      }
    }
    endRows.set(e.id, rows);

    // bridges
    for (const [s0, s1] of merged) {
      const span = buildBridge(e, sampler, s0, s1, world, kind === 'paved' ? bridgeAccs.concrete : bridgeAccs.wood, kind);
      bridgeSpans.push(span);
      // deck heights into ys
      for (let i = 0; i < np; i++) {
        const s = e.cum[i];
        if (s >= s0 && s <= s1) ys[i] = span.deckY(s) + 0.02;
      }
    }
    e.ys = ys;
  }

  // ---- 3. junction / dead-end patches ----
  for (const ni of nodeInfo.values()) {
    const { node, arms, deg, kind, Wmin } = ni;
    const acc = accs[kind];
    const rep = ROAD_REPEAT[kind], sk = SKIRT[kind];
    const P = { x: node.x, z: node.z };
    const crown = Math.max(...arms.map((a) => CROWN[a.e.kind]));
    const Py = H(P.x, P.z) + LIFT + crown;
    const sP = 0;
    const pc = acc.vert(P.x, Py, P.z, P.x / rep, P.z / rep, 0, sP, Wmin, 1);
    // boundary: array of {x,y,z,a,ed, out:{x,z}, vi?, skirt:boolean}
    const boundary = [];
    let Rmax = 0;
    const gateSets = [];
    for (let i = 0; i < deg; i++) {
      const arm = arms[i];
      const rows = endRows.get(arm.e.id);
      const row = rows ? rows[arm.end] : null;
      if (!row) continue;
      Rmax = Math.max(Rmax, arm.trim || 0);
      // gate vertices from a=+W → a=-W (increasing angle), excluding skirt verts (first/last)
      const inner = row.desc.slice(1, -1);
      const gate = deg === 1 ? [] : inner.slice().reverse().map((d) => ({ ...d, gate: true }));
      // the +W and -W endpoints (for fillets); left normal n → +a side
      const plus = inner[inner.length - 1], minus = inner[0];
      gateSets.push({ arm, gate, plus, minus, n: { x: row.nx, z: row.nz }, d: { x: row.dx, z: row.dz }, W: arm.W });
    }
    for (let i = 0; i < gateSets.length; i++) {
      const g = gateSets[i], gn = gateSets[(i + 1) % gateSets.length];
      // gate (ribbon end) — patch duplicates these with junction flag 1
      for (const d of g.gate) boundary.push({ x: d.x, y: d.y, z: d.z, a: d.a, ed: d.ed, gate: true, out: null });
      // fillet from g.minus (a=-W, outward -n) to gn.plus (a=+W, outward +n)
      const B = g.minus, E = gn.plus;
      const outB = { x: -g.n.x, z: -g.n.z }, outE = { x: gn.n.x, z: gn.n.z };
      let th = gn.arm.ang - g.arm.ang;
      if (gateSets.length === 1) th = 2 * Math.PI;
      while (th <= 0) th += 2 * Math.PI;
      const pts = [];
      if (th < Math.PI - 0.06 && deg > 1) {
        // inside corner: quadratic bezier with control at the intersection of the two road edges
        const Q = lineIntersect(B.x, B.z, -g.d.x, -g.d.z, E.x, E.z, -gn.d.x, -gn.d.z);
        const ctrl = Q || { x: (B.x + E.x) * 0.5, z: (B.z + E.z) * 0.5 };
        const len = Math.hypot(E.x - B.x, E.z - B.z);
        const nS = Math.max(2, Math.ceil(len / 1.0));
        for (let k = 0; k <= nS; k++) {
          const t = k / nS, mt = 1 - t;
          pts.push({ x: mt * mt * B.x + 2 * mt * t * ctrl.x + t * t * E.x, z: mt * mt * B.z + 2 * mt * t * ctrl.z + t * t * E.z });
        }
      } else if (Math.abs(th - Math.PI) <= 0.06 && deg > 1) {
        const len = Math.hypot(E.x - B.x, E.z - B.z);
        const nS = Math.max(1, Math.ceil(len / 1.5));
        for (let k = 0; k <= nS; k++) { const t = k / nS; pts.push({ x: B.x + (E.x - B.x) * t, z: B.z + (E.z - B.z) * t }); }
      } else {
        // outside: arc around P
        const a0 = Math.atan2(B.z - P.z, B.x - P.x), r0 = Math.hypot(B.x - P.x, B.z - P.z);
        let a1 = Math.atan2(E.z - P.z, E.x - P.x); const r1 = Math.hypot(E.x - P.x, E.z - P.z);
        while (a1 <= a0 + 1e-6) a1 += 2 * Math.PI;
        if (deg === 1) { a1 = a0 + Math.PI; }
        const arcLen = (a1 - a0) * (r0 + r1) * 0.5;
        const nS = Math.max(3, Math.ceil(arcLen / 0.8));
        for (let k = 0; k <= nS; k++) {
          const t = k / nS, ang = a0 + (a1 - a0) * t, r = r0 + (r1 - r0) * t;
          pts.push({ x: P.x + Math.cos(ang) * r, z: P.z + Math.sin(ang) * r });
        }
      }
      // outward directions: ends exact, interior from polyline normals pointing away from P
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        let out;
        if (k === 0) out = outB;
        else if (k === pts.length - 1) out = outE;
        else {
          const pr = pts[k - 1], nx = pts[k + 1];
          const tx = nx.x - pr.x, tz = nx.z - pr.z, L = Math.hypot(tx, tz) || 1;
          out = { x: tz / L, z: -tx / L };
          if (out.x * (p.x - P.x) + out.z * (p.z - P.z) < 0) { out.x = -out.x; out.z = -out.z; }
        }
        const isEnd = k === 0 || k === pts.length - 1;
        const y = isEnd ? (k === 0 ? B.y : E.y) : H(p.x, p.z) + LIFT + profile(kind, Wmin, Wmin) * 0;
        boundary.push({ x: p.x, y, z: p.z, a: k === 0 ? B.a : E.a, ed: 0, gate: false, out, endB: k === 0, endE: k === pts.length - 1 });
      }
    }
    if (boundary.length < 3) continue;
    // fan
    const bv = boundary.map((b) => acc.vert(b.x, b.y, b.z, b.x / rep, b.z / rep, b.a, sP, b.ed, 1));
    for (let k = 0; k < bv.length; k++) {
      const b0 = boundary[k], b1 = boundary[(k + 1) % bv.length];
      if (b0.gate && b1.gate) { acc.tri(pc, bv[k], bv[(k + 1) % bv.length]); continue; }
      acc.tri(pc, bv[k], bv[(k + 1) % bv.length]);
    }
    // skirt ring along fillets (not gates)
    let prevOuter = -1, prevInner = -1;
    for (let k = 0; k < boundary.length; k++) {
      const b = boundary[k];
      if (!b.out) { prevOuter = -1; continue; }
      const ox = b.x + b.out.x * sk, oz = b.z + b.out.z * sk;
      const ov = acc.vert(ox, H(ox, oz) + SKIRT_LIFT, oz, ox / rep, oz / rep, b.a > 0 ? Wmin + sk : -(Wmin + sk), sP, -sk, 1);
      if (prevOuter >= 0) { acc.tri(bv[prevInner], bv[k], prevOuter); acc.tri(bv[k], ov, prevOuter); }
      prevOuter = ov; prevInner = k;
      if (b.endE) prevOuter = -1;
    }
    // wedge for signpost: the largest angular gap
    let bestGap = -1, bestDir = null;
    if (deg >= 3) {
      for (let i = 0; i < arms.length; i++) {
        const a0 = arms[i].ang; let a1 = arms[(i + 1) % arms.length].ang;
        while (a1 <= a0) a1 += 2 * Math.PI;
        const gap = a1 - a0;
        if (gap > bestGap) { bestGap = gap; const m = (a0 + a1) * 0.5; bestDir = { x: Math.cos(m), z: Math.sin(m), gap }; }
      }
      junctions.push({ node: node.id, x: P.x, z: P.z, R: Rmax, W: ni.Wmax, wedgeDir: bestDir, dirs: arms.map((a) => ({ x: a.d.x, z: a.d.z, kind: a.e.kind })), kind });
    }
  }

  const out = { kinds: {}, bridges: {}, junctions, bridgeSpans };
  for (const k of Object.keys(accs)) out.kinds[k] = accs[k].empty ? null : accs[k].build();
  for (const k of Object.keys(bridgeAccs)) out.bridges[k] = bridgeAccs[k].empty ? null : bridgeAccs[k].build();
  return out;
}

function lineIntersect(px, pz, dx, dz, qx, qz, ex, ez) {
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((qx - px) * ez - (qz - pz) * ex) / den;
  if (t < -0.5 || t > 60) return null;
  return { x: px + dx * t, z: pz + dz * t };
}

// ---------------------------------------------------------------------------
// Bridges

/** Sweep a closed rectangular profile [(a, dy)...] along the sampler between s0..s1 at height fn. */
function sweepBox(acc, sampler, s0, s1, aMin, aMax, yBot, yTop, heightAt, rep, aOffset = 0) {
  const nSeg = Math.max(1, Math.ceil((s1 - s0) / 2));
  const ds = (s1 - s0) / nSeg;
  const tmp = { x: 0, z: 0, dx: 0, dz: 0 };
  const faces = [
    { a0: aMin, a1: aMax, y0: yTop, y1: yTop, top: true },   // top
    { a0: aMax, a1: aMax, y0: yTop, y1: yBot },              // right side
    { a0: aMax, a1: aMin, y0: yBot, y1: yBot },              // bottom
    { a0: aMin, a1: aMin, y0: yBot, y1: yTop },              // left side
  ];
  const rows = faces.map(() => []);
  for (let k = 0; k <= nSeg; k++) {
    const s = s0 + k * ds;
    sampler.at(s, tmp);
    const n = leftOf(tmp.dx, tmp.dz);
    const yc = heightAt(s);
    faces.forEach((f, fi) => {
      const x0 = tmp.x + n.x * (f.a0 + aOffset), z0 = tmp.z + n.z * (f.a0 + aOffset);
      const x1 = tmp.x + n.x * (f.a1 + aOffset), z1 = tmp.z + n.z * (f.a1 + aOffset);
      const u0 = f.top ? (f.a0 + aOffset) / rep : s / rep, u1 = f.top ? (f.a1 + aOffset) / rep : s / rep;
      const v0 = f.top ? s / rep : (yc + f.y0) / rep, v1 = f.top ? s / rep : (yc + f.y1) / rep;
      const i0 = acc.vert(x0, yc + f.y0, z0, u0, v0, f.a0, s, 1, 0);
      const i1 = acc.vert(x1, yc + f.y1, z1, u1, v1, f.a1, s, 1, 0);
      rows[fi].push([i0, i1]);
    });
  }
  // stitch each face; orientation: outward.
  rows.forEach((r, fi) => {
    for (let k = 0; k < r.length - 1; k++) {
      const [a0, a1] = r[k], [b0, b1] = r[k + 1];
      if (fi === 0) { acc.tri(a0, a1, b0); acc.tri(a1, b1, b0); }
      else if (fi === 2) { acc.triDown(a0, a1, b0); acc.triDown(a1, b1, b0); }
      else {
        // vertical faces: pick winding so normal points away from the box centre (a=aOffset+(aMin+aMax)/2)
        const outward = fi === 1 ? 1 : -1;
        // compute normal of (a0,a1,b0) and compare with outward lateral
        const p = acc.pos;
        const ax = p[a1 * 3] - p[a0 * 3], ay = p[a1 * 3 + 1] - p[a0 * 3 + 1], az = p[a1 * 3 + 2] - p[a0 * 3 + 2];
        const bx = p[b0 * 3] - p[a0 * 3], by = p[b0 * 3 + 1] - p[a0 * 3 + 1], bz = p[b0 * 3 + 2] - p[a0 * 3 + 2];
        const nx = ay * bz - az * by, nz = ax * by - ay * bx;
        sampler.at(s0 + k * ds, tmp);
        const n = leftOf(tmp.dx, tmp.dz);
        const dot = (nx * n.x + nz * n.z) * outward;
        if (dot >= 0) { acc.triRaw(a0, a1, b0); acc.triRaw(a1, b1, b0); }
        else { acc.triRaw(a0, b0, a1); acc.triRaw(a1, b0, b1); }
      }
    }
  });
}

/** Axis-aligned-in-frame box at (s, a) — used for posts, piers. */
function frameBox(acc, sampler, s, a, w, d, y0, y1, rep) {
  const tmp = { x: 0, z: 0, dx: 0, dz: 0 };
  sampler.at(s, tmp);
  const n = leftOf(tmp.dx, tmp.dz);
  const cx = tmp.x + n.x * a, cz = tmp.z + n.z * a;
  const corners = [];
  for (const [sa, sd] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    corners.push({ x: cx + n.x * sa * w * 0.5 + tmp.dx * sd * d * 0.5, z: cz + n.z * sa * w * 0.5 + tmp.dz * sd * d * 0.5 });
  }
  const bot = corners.map((c, i) => acc.vert(c.x, y0, c.z, (i % 2) * w / rep, y0 / rep, a, s, 1, 0));
  const top = corners.map((c, i) => acc.vert(c.x, y1, c.z, (i % 2) * w / rep, y1 / rep, a, s, 1, 0));
  // sides (outward winding via cross check against centre)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const p = acc.pos;
    const mx = (p[bot[i] * 3] + p[bot[j] * 3]) * 0.5 - cx, mz = (p[bot[i] * 3 + 2] + p[bot[j] * 3 + 2]) * 0.5 - cz;
    // normal of (bot i, bot j, top i)
    const ax = p[bot[j] * 3] - p[bot[i] * 3], az = p[bot[j] * 3 + 2] - p[bot[i] * 3 + 2];
    const nx = -az * (y1 - y0), nz = ax * (y1 - y0); // cross((a,0,az),(0,h,0)) = (-az*h, 0, ax*h)
    if (nx * mx + nz * mz > 0) { acc.triRaw(bot[i], bot[j], top[i]); acc.triRaw(bot[j], top[j], top[i]); }
    else { acc.triRaw(bot[i], top[i], bot[j]); acc.triRaw(bot[j], top[i], top[j]); }
  }
  acc.tri(top[0], top[1], top[2]); acc.tri(top[0], top[2], top[3]);
}

function buildBridge(edge, sampler, s0, s1, world, acc, kind) {
  const concrete = kind === 'paved';
  const W = edge.width * 0.5, Wd = W + (concrete ? 0.6 : 0.35);
  const rep = concrete ? 3 : 2;
  const tmp = { x: 0, z: 0, dx: 0, dz: 0 };
  sampler.at(s0, tmp); const hA = world.getHeight(tmp.x, tmp.z) + LIFT;
  sampler.at(s1, tmp); const hB = world.getHeight(tmp.x, tmp.z) + LIFT;
  const wl = world.terrain.waterLevel;
  const L = s1 - s0;
  const need = Math.max(0, (wl + (concrete ? 1.6 : 1.1)) - Math.min(hA, hB));
  const arch = Math.max(concrete ? 0.15 : 0.25, need);
  const deckY = (s) => { const u = (s - s0) / L; return hA + (hB - hA) * u + arch * Math.sin(Math.PI * u); };
  const thick = concrete ? 0.55 : 0.32;

  // deck slab
  sweepBox(acc, sampler, s0, s1, -Wd, Wd, -thick, 0, deckY, rep);
  // deck top gets its own planked / concrete surface: the slab top is the road surface
  if (concrete) {
    // parapets
    for (const side of [-1, 1]) sweepBox(acc, sampler, s0, s1, side * (Wd - 0.3) - 0.15, side * (Wd - 0.3) + 0.15, 0, 0.95, deckY, rep);
    // piers
    const nP = Math.max(1, Math.floor(L / 8));
    for (let k = 1; k <= nP; k++) {
      const s = s0 + (L * k) / (nP + 1);
      sampler.at(s, tmp);
      const bed = world.getHeight(tmp.x, tmp.z) - 0.8;
      frameBox(acc, sampler, s, 0, 2 * Wd - 1.2, 0.9, bed, deckY(s) - thick + 0.02, rep);
    }
  } else {
    // longitudinal beams
    for (const a of [-Wd + 0.5, 0, Wd - 0.5]) sweepBox(acc, sampler, s0, s1, a - 0.15, a + 0.15, -thick - 0.35, -thick + 0.02, deckY, rep);
    // kerb timbers
    for (const side of [-1, 1]) sweepBox(acc, sampler, s0, s1, side * (Wd - 0.25) - 0.09, side * (Wd - 0.25) + 0.09, 0, 0.14, deckY, rep);
    // rails
    for (const side of [-1, 1]) for (const h of [0.55, 0.98]) {
      sweepBox(acc, sampler, s0, s1, side * (Wd - 0.12) - 0.045, side * (Wd - 0.12) + 0.045, h - 0.045, h + 0.045, deckY, rep);
    }
    // rail posts every 2 m
    const nPost = Math.max(2, Math.round(L / 2));
    for (let k = 0; k <= nPost; k++) {
      const s = s0 + (L * k) / nPost;
      for (const side of [-1, 1]) frameBox(acc, sampler, s, side * (Wd - 0.12), 0.12, 0.12, deckY(s) - 0.05, deckY(s) + 1.08, rep);
    }
    // timber piers every ~6 m
    const nP = Math.max(1, Math.round(L / 6) - 1);
    for (let k = 1; k <= nP; k++) {
      const s = s0 + (L * k) / (nP + 1);
      sampler.at(s, tmp);
      const bed = world.getHeight(tmp.x, tmp.z) - 0.8;
      for (const a of [-Wd + 0.5, Wd - 0.5]) frameBox(acc, sampler, s, a, 0.32, 0.32, bed, deckY(s) - thick - 0.3, rep);
      // cross beam
      frameBox(acc, sampler, s, 0, 2 * Wd - 0.6, 0.3, deckY(s) - thick - 0.35, deckY(s) - thick - 0.05, rep);
    }
  }
  return { edge: edge.id, s0, s1, deckY, concrete, length: L };
}
