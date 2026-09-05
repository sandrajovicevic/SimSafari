// Procedural trees. A species is grown once per variant into a skeleton (branch segments + foliage tips),
// then baked into two BufferGeometries: `bark` (tapered tubes) and `leaf` (alpha-cut foliage cards).
// The same skeleton feeds LOD0 and LOD1 — LOD1 prunes by depth and uses fewer, larger cards.
//
// Shapes are driven from a crown surface  y(r) = H - crownDepth * (r / crownR)^p, so the umbrella-thorn acacia
// really is flat-topped: every branch is grown toward a target point ON that surface.
import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------
// small geometry accumulator
// ---------------------------------------------------------------------------------------------------------
class MeshBuf {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v) {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

function frame(dx, dy, dz, u, v) {
  // orthonormal basis with the given direction as the axis
  const ax = Math.abs(dy) > 0.92 ? 1 : 0;
  u.set(ax ? 1 : 0, ax ? 0 : 1, 0).cross(_a.set(dx, dy, dz)).normalize();
  if (!Number.isFinite(u.x) || u.lengthSq() < 1e-6) u.set(1, 0, 0);
  v.copy(_a).cross(u).normalize();
}

/** Tapered tube from p0 (radius r0) to p1 (radius r1). `sides` adapts to radius outside. */
function tube(buf, p0, r0, p1, r1, sides, vScale, v0) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const len = Math.hypot(dx, dy, dz) || 1e-4;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  frame(ux, uy, uz, _b, _c);
  const v1 = v0 + len / vScale;
  const base = buf.count;
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const nx = _b.x * ca + _c.x * sa, ny = _b.y * ca + _c.y * sa, nz = _b.z * ca + _c.z * sa;
    const u = i / sides;
    buf.vert(p0[0] + nx * r0, p0[1] + ny * r0, p0[2] + nz * r0, nx, ny, nz, u, v0);
    buf.vert(p1[0] + nx * r1, p1[1] + ny * r1, p1[2] + nz * r1, nx, ny, nz, u, v1);
  }
  for (let i = 0; i < sides; i++) {
    const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
    buf.quad(a, c, d, b);
  }
  return v1;
}

/**
 * One foliage card: a quad centred at c, spanning `half` metres, with in-plane axes derived from
 * `yaw` (rotation about Y) and `tilt` (0 = horizontal card, PI/2 = vertical card).
 * Normals are bent toward +Y and away from the crown centre so clusters shade like a soft volume.
 */
function card(buf, cx, cy, cz, half, aspect, yaw, tilt, roll, bendX, bendZ) {
  const cy0 = Math.cos(yaw), sy0 = Math.sin(yaw);
  // plane basis: e1 in the horizontal plane rotated by yaw, e2 tilted out of it
  const e1x = cy0, e1y = 0, e1z = -sy0;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const e2x = sy0 * ct, e2y = st, e2z = cy0 * ct;
  // roll the card in its own plane so cards in a cluster do not align
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const ax = e1x * cr + e2x * sr, ay = e1y * cr + e2y * sr, az = e1z * cr + e2z * sr;
  const bx = -e1x * sr + e2x * cr, by = -e1y * sr + e2y * cr, bz = -e1z * sr + e2z * cr;
  const hw = half, hh = half * aspect;
  // face normal
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  // bend toward +Y / outward from the crown axis: soft, non-flat foliage shading
  nx = nx * 0.30 + bendX * 0.45; ny = ny * 0.30 + 0.80; nz = nz * 0.30 + bendZ * 0.45;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  const i0 = buf.vert(cx - ax * hw - bx * hh, cy - ay * hw - by * hh, cz - az * hw - bz * hh, nx, ny, nz, 0, 0);
  const i1 = buf.vert(cx + ax * hw - bx * hh, cy + ay * hw - by * hh, cz + az * hw - bz * hh, nx, ny, nz, 1, 0);
  const i2 = buf.vert(cx + ax * hw + bx * hh, cy + ay * hw + by * hh, cz + az * hw + bz * hh, nx, ny, nz, 1, 1);
  const i3 = buf.vert(cx - ax * hw + bx * hh, cy - ay * hw + by * hh, cz - az * hw + bz * hh, nx, ny, nz, 0, 1);
  buf.quad(i0, i1, i2, i3);
}

// ---------------------------------------------------------------------------------------------------------
// skeleton growth
// ---------------------------------------------------------------------------------------------------------

/**
 * Grow a canopy skeleton toward a crown surface.
 * P: { H, trunkH, trunkR, crownR, crownDepth, crownPow, limbs, maxDepth, forkP, jitter, taper, stepF, lean }
 * Returns { segs:[{p0,p1,r0,r1,depth}], tips:[{p,dir,r,depth}], H, crownR }
 */
export function growCanopy(rng, P) {
  const segs = [], tips = [];
  const surfaceY = (r) => P.H - P.crownDepth * Math.pow(Math.min(1, r / P.crownR), P.crownPow ?? 2);

  // ---- trunk: 3 curved sub-segments, bare to trunkH ----
  const leanA = rng.range(0, Math.PI * 2);
  const lean = P.lean ?? 0.12;
  let px = 0, py = 0, pz = 0;
  const topX = Math.cos(leanA) * P.trunkH * lean, topZ = Math.sin(leanA) * P.trunkH * lean;
  const N = 3;
  for (let i = 1; i <= N; i++) {
    const t0 = (i - 1) / N, t1 = i / N;
    const bow = (t) => Math.sin(t * Math.PI) * P.trunkH * 0.055;
    const nx = topX * t1 + Math.cos(leanA + 2.1) * bow(t1);
    const nz = topZ * t1 + Math.sin(leanA + 2.1) * bow(t1);
    const ny = P.trunkH * t1;
    const r0 = P.trunkR * (1 - 0.30 * t0), r1 = P.trunkR * (1 - 0.30 * t1);
    segs.push({ p0: [px, py, pz], p1: [nx, ny, nz], r0, r1, depth: -1 });
    px = nx; py = ny; pz = nz;
  }
  const top = [px, py, pz];
  const trunkTopR = P.trunkR * 0.70;

  const grow = (p, target, r, depth) => {
    let dx = target[0] - p[0], dy = target[1] - p[1], dz = target[2] - p[2];
    let len = Math.hypot(dx, dy, dz);
    if (depth >= P.maxDepth || r < 0.016 || len < 0.30) {
      const l = len || 1;
      tips.push({ p: [p[0], p[1], p[2]], dir: [dx / l, dy / l, dz / l], r, depth });
      return;
    }
    dx /= len; dy /= len; dz /= len;
    // gnarly wander
    const j = P.jitter * (1 - 0.4 * depth / P.maxDepth);
    frame(dx, dy, dz, _b, _c);
    const j1 = rng.gaussian(0, j), j2 = rng.gaussian(0, j);
    dx += _b.x * j1 + _c.x * j2; dy += _b.y * j1 + _c.y * j2; dz += _b.z * j1 + _c.z * j2;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;

    let step = Math.min(len, len * (P.stepF ?? 0.5) * rng.range(0.85, 1.25));
    step = Math.max(step, 0.30);
    const p1 = [p[0] + dx * step, p[1] + dy * step, p[2] + dz * step];
    const r1 = r * (P.taper ?? 0.78);
    segs.push({ p0: [p[0], p[1], p[2]], p1, r0: r, r1, depth });

    const fork = depth >= (P.forkFrom ?? 0) && rng.float() < P.forkP && depth < P.maxDepth - 1;
    const kids = fork ? 2 : 1;
    for (let k = 0; k < kids; k++) {
      let nt = target;
      if (kids > 1 || rng.bool(0.55)) {
        const spread = P.crownR * (0.16 + 0.34 * rng.float()) * (1 - 0.55 * depth / P.maxDepth);
        const a = rng.range(0, Math.PI * 2);
        const nx2 = target[0] + Math.cos(a) * spread, nz2 = target[2] + Math.sin(a) * spread;
        nt = [nx2, surfaceY(Math.hypot(nx2, nz2)), nz2];
      }
      grow(p1, nt, r1 * (kids > 1 ? 0.86 : 1), depth + 1);
    }
  };

  const limbs = P.limbs;
  const a0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < limbs; i++) {
    const a = a0 + (i / limbs) * Math.PI * 2 + rng.gaussian(0, 0.28);
    const rr = P.crownR * rng.range(0.55, 1.0);
    const target = [Math.cos(a) * rr, surfaceY(rr), Math.sin(a) * rr];
    grow(top, target, trunkTopR * rng.range(0.72, 0.95), 0);
  }
  return { segs, tips, H: P.H, crownR: P.crownR, trunkH: P.trunkH, trunkR: P.trunkR };
}

// ---------------------------------------------------------------------------------------------------------
// baking
// ---------------------------------------------------------------------------------------------------------

function sidesFor(r, lod) {
  if (lod > 0) return r > 0.18 ? 5 : 3;
  if (r > 0.20) return 9;
  if (r > 0.09) return 7;
  if (r > 0.04) return 5;
  return 4;
}

export function bakeBark(skel, { lod = 0, maxDepth = 99, vScale = 1.4 } = {}) {
  const buf = new MeshBuf();
  for (const s of skel.segs) {
    if (s.depth > maxDepth) continue;
    const sides = sidesFor(Math.max(s.r0, s.r1), lod);
    tube(buf, s.p0, s.r0, s.p1, s.r1, sides, vScale, 0);
  }
  return buf.geometry();
}

/**
 * Canopy foliage. Cards are distributed over the crown VOLUME defined by the same flattened-dome
 * surface the branches grew toward, not along branch directions — that is what makes an umbrella
 * thorn read as one wide flat mass instead of a spray of palm fronds. Each card is then nudged
 * toward the nearest branch tip so the foliage still hangs off wood.
 *
 * plan: { count, size, shell, tiltBias, aspect, sizeJitter, ragged, rimDroop }
 */
export function bakeLeafDisc(skel, rng, plan) {
  const buf = new MeshBuf();
  const R = skel.crownR;
  const H = skel.H;
  const depth = skel.crownDepth ?? H * 0.20;
  const pow = skel.crownPow ?? 2.4;
  const shell = plan.shell ?? Math.max(0.8, depth * 0.95);
  const tips = skel.tips.filter((t) => t.depth >= 1);
  const surf = (r) => H - depth * Math.pow(Math.min(1, r / R), pow);
  const cards = [];

  const push = (cx, cy, cz, half, aspect, tilt) => {
    const rr = Math.hypot(cx, cz) || 1e-3;
    cards.push([cx, cy, cz, half, aspect, rng.range(0, Math.PI * 2), tilt, rng.range(0, Math.PI * 2), cx / rr, cz / rr]);
  };

  // 1. Roof course: big horizontal cards sitting ON the crown surface. These are what make the top
  //    edge read as one level line instead of a spray of branch tips against the sky.
  const roof = plan.roof ?? Math.round(plan.count * 0.16);
  for (let i = 0; i < roof; i++) {
    const r = R * Math.sqrt(rng.float()) * 0.94;
    const az = rng.range(0, Math.PI * 2);
    const cx = Math.cos(az) * r, cz = Math.sin(az) * r;
    push(cx, surf(r) - rng.range(0.02, 0.30) + rng.gaussian(0, plan.ragged ?? 0.12), cz,
      plan.size * rng.range(1.35, 2.0) * 0.5, plan.aspect ?? 0.8, rng.range(0, 0.20));
  }

  // 2. Body: the canopy volume. Uniform in area (sqrt) so the middle is as dense as the rim, with a
  //    quarter of the cards forced into the outer third to keep the umbrella's edge solid.
  const body = plan.count - roof;
  for (let i = 0; i < body; i++) {
    const u = rng.float();
    const r = R * (i % 4 === 0 ? 0.66 + 0.34 * u : Math.sqrt(u));
    const az = rng.range(0, Math.PI * 2);
    let cx = Math.cos(az) * r, cz = Math.sin(az) * r;
    const t = Math.pow(rng.float(), 1.15);            // 0 at the surface, 1 at the underside
    let cy = surf(r) - shell * t + rng.gaussian(0, plan.ragged ?? 0.12);
    if (tips.length) {                                 // hang it off the nearest branch tip
      let best = null, bd = 1e9;
      for (const tp of tips) {
        const dx = tp.p[0] - cx, dy = tp.p[1] - cy, dz = tp.p[2] - cz;
        const d = dx * dx + dy * dy * 0.35 + dz * dz;
        if (d < bd) { bd = d; best = tp; }
      }
      if (best) {
        const k = plan.snap ?? 0.22;
        cx += (best.p[0] - cx) * k; cy += (best.p[1] - cy) * k * 0.7; cz += (best.p[2] - cz) * k;
      }
    }
    // near the top of the shell cards lie flat (crisp level roof); deeper down they stand up so the
    // canopy still has body when the camera is at eye level
    const horizontal = t < 0.45 ? rng.float() < 0.86 : rng.float() < (plan.tiltBias ?? 0.5);
    const tilt = horizontal ? rng.range(0, 0.34) : rng.range(0.62, 1.5708);
    const j = plan.sizeJitter ?? 0.32;
    push(cx, cy, cz, plan.size * rng.range(1 - j, 1 + j) * 0.5, plan.aspect ?? 0.8, tilt);
  }

  if (!cards.length) return null;
  cards.sort((a2, b2) => a2[1] - b2[1]);
  for (const c of cards) card(buf, c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9]);
  return buf.geometry();
}

// ---------------------------------------------------------------------------------------------------------
// species
// ---------------------------------------------------------------------------------------------------------

/** Umbrella thorn (Vachellia tortilis): bare trunk, limbs spreading up-and-out, wide flat crown. */
export function acaciaSkeleton(rng) {
  const H = rng.range(6.5, 11.5);
  const trunkH = H * rng.range(0.30, 0.38);        // bare bole, forks high, then spreads outward
  const crownR = H * rng.range(0.66, 0.82);        // radius ≈ 2× the height above the fork
  const crownDepth = H * rng.range(0.11, 0.16);    // thin, level canopy layer
  const sk = growCanopy(rng, {
    H, trunkH,
    trunkR: H * rng.range(0.030, 0.040),
    crownR, crownDepth,
    crownPow: 3.2,                                  // flat until the rim, then drops away
    limbs: rng.int(4, 6),
    maxDepth: 5, forkP: 0.74, forkFrom: 1, jitter: 0.16, taper: 0.76, stepF: 0.46, lean: 0.10,
  });
  sk.crownDepth = crownDepth; sk.crownPow = 3.2;
  return sk;
}

/** Fever tree (V. xanthophloea): taller, straighter, crown rounder and higher, smooth lime bark. */
export function feverSkeleton(rng) {
  const H = rng.range(9.0, 14.0);
  const trunkH = H * rng.range(0.38, 0.48);
  const crownR = H * rng.range(0.46, 0.62);
  const crownDepth = H * rng.range(0.26, 0.34);
  const sk = growCanopy(rng, {
    H, trunkH,
    trunkR: H * rng.range(0.024, 0.032),
    crownR, crownDepth,
    crownPow: 1.7,
    limbs: rng.int(3, 5),
    maxDepth: 5, forkP: 0.72, forkFrom: 0, jitter: 0.13, taper: 0.78, stepF: 0.48, lean: 0.06,
  });
  sk.crownDepth = crownDepth; sk.crownPow = 1.7;
  return sk;
}

/** Skeletal dead tree: no leaves, more forks, thinner tips, wilder wander. */
export function deadSkeleton(rng) {
  const H = rng.range(5.0, 9.0);
  const trunkH = H * rng.range(0.30, 0.45);
  return growCanopy(rng, {
    H, trunkH,
    trunkR: H * rng.range(0.030, 0.042),
    crownR: H * rng.range(0.45, 0.70),
    crownDepth: H * rng.range(0.30, 0.45),
    crownPow: 1.6,
    limbs: rng.int(3, 4),
    maxDepth: 6, forkP: 0.78, forkFrom: 0, jitter: 0.30, taper: 0.72, stepF: 0.50, lean: 0.16,
  });
}

/**
 * Baobab (Adansonia digitata): a fat bottle trunk built as a lathe with circumferential lobes,
 * then a few stubby root-like limbs. Returns a skeleton plus its own trunk geometry builder.
 */
export function baobabSkeleton(rng) {
  const H = rng.range(11.0, 17.0);
  const trunkH = H * rng.range(0.50, 0.62);
  const R = H * rng.range(0.15, 0.21);      // base radius: 1.8 – 3.5 m
  const crownR = H * rng.range(0.34, 0.46);
  const crownDepth = H * rng.range(0.20, 0.28);
  const skel = growCanopy(rng, {
    H, trunkH,
    trunkR: R * 0.42,
    crownR, crownDepth,
    crownPow: 1.4,
    limbs: rng.int(4, 6),
    maxDepth: 4, forkP: 0.68, forkFrom: 0, jitter: 0.26, taper: 0.66, stepF: 0.55, lean: 0.05,
  });
  skel.crownDepth = crownDepth; skel.crownPow = 1.4;
  // replace the slender trunk segments with a lathe profile
  skel.segs = skel.segs.filter((s) => s.depth >= 0);
  skel.lathe = { H: trunkH, R, lobes: rng.int(5, 8), lobeAmp: rng.range(0.06, 0.13), seedA: rng.range(0, 6.28), bulge: rng.range(0.10, 0.22) };
  skel.trunkR = R;
  return skel;
}

/** Lathe trunk for the baobab: r(t) = R * profile(t), modulated by circumferential lobes. */
export function bakeLatheTrunk(L, { lod = 0 } = {}) {
  const buf = new MeshBuf();
  const rings = lod > 0 ? 5 : 10;
  const sides = lod > 0 ? 8 : 16;
  const prof = (t) => (1 - Math.pow(t, 1.35)) * (1 + L.bulge * Math.sin(t * Math.PI * 1.15)) * (t > 0.86 ? (1 - (t - 0.86) * 2.2) : 1);
  const base = buf.count;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const y = L.H * t;
    const rr = Math.max(0.06, L.R * prof(t));
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const lobe = 1 + L.lobeAmp * Math.cos(a * L.lobes + L.seedA + t * 1.4);
      const ca = Math.cos(a), sa = Math.sin(a);
      const r2 = rr * lobe;
      // approximate normal: radial, tilted by the profile slope
      const dt = 0.02;
      const slope = (L.R * prof(Math.min(1, t + dt)) - L.R * prof(Math.max(0, t - dt))) / (L.H * 2 * dt);
      let nx = ca, ny = -slope, nz = sa;
      const nl = Math.hypot(nx, ny, nz) || 1;
      buf.vert(ca * r2, y, sa * r2, nx / nl, ny / nl, nz / nl, i / sides * 3, t * L.H / 3.0);
    }
  }
  const stride = sides + 1;
  for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) {
    const a = base + j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    buf.quad(a, b, d, c);
  }
  return buf.geometry();
}

/** Merge two geometries that share the same attribute layout. */
export function mergeGeom(a, b) {
  if (!a) return b; if (!b) return a;
  const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3);
  pos.set(a.attributes.position.array, 0); pos.set(b.attributes.position.array, a.attributes.position.count * 3);
  const nrm = new Float32Array(pos.length);
  nrm.set(a.attributes.normal.array, 0); nrm.set(b.attributes.normal.array, a.attributes.normal.count * 3);
  const uv = new Float32Array(a.attributes.uv.count * 2 + b.attributes.uv.count * 2);
  uv.set(a.attributes.uv.array, 0); uv.set(b.attributes.uv.array, a.attributes.uv.count * 2);
  const ia = a.index.array, ib = b.index.array, off = a.attributes.position.count;
  const idx = new Uint32Array(ia.length + ib.length);
  idx.set(ia, 0);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + off;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  a.dispose(); b.dispose();
  return g;
}

/**
 * Build every LOD of one tree variant.
 * kind: 'acacia' | 'fever' | 'baobab' | 'dead'
 * Returns { kind, height, crownR, lods: [{ bark, leaf }, ...] }
 */
export function buildTreeVariant(kind, rng) {
  let skel, leafPlan0, leafPlan1;
  if (kind === 'acacia') {
    skel = acaciaSkeleton(rng);
    leafPlan0 = { count: 820, size: skel.crownR * 0.235, tiltBias: 0.55, aspect: 0.80, ragged: 0.11, snap: 0.20, sizeJitter: 0.30 };
    leafPlan1 = { count: 140, size: skel.crownR * 0.52, tiltBias: 0.55, aspect: 0.80, ragged: 0.11, snap: 0.20, sizeJitter: 0.30 };
  } else if (kind === 'fever') {
    skel = feverSkeleton(rng);
    leafPlan0 = { count: 620, size: skel.crownR * 0.30, tiltBias: 0.40, aspect: 0.90, ragged: 0.26, snap: 0.26, roof: 60 };
    leafPlan1 = { count: 115, size: skel.crownR * 0.68, tiltBias: 0.40, aspect: 0.90, ragged: 0.26, snap: 0.26, roof: 20 };
  } else if (kind === 'baobab') {
    skel = baobabSkeleton(rng);
    leafPlan0 = { count: 300, size: skel.crownR * 0.26, tiltBias: 0.45, aspect: 0.9, ragged: 0.30, snap: 0.38, roof: 26 };
    leafPlan1 = { count: 58, size: skel.crownR * 0.58, tiltBias: 0.45, aspect: 0.9, ragged: 0.30, snap: 0.38, roof: 8 };
  } else {
    skel = deadSkeleton(rng);
    leafPlan0 = null; leafPlan1 = null;
  }

  const lods = [];
  for (let lod = 0; lod < 2; lod++) {
    let bark = bakeBark(skel, { lod, maxDepth: lod === 0 ? 99 : 3, vScale: kind === 'baobab' ? 3.0 : 1.4 });
    if (skel.lathe) bark = mergeGeom(bakeLatheTrunk(skel.lathe, { lod }), bark);
    const plan = lod === 0 ? leafPlan0 : leafPlan1;
    const leaf = plan ? bakeLeafDisc(skel, rng.fork('leaf' + lod), plan) : null;
    lods.push({ bark, leaf });
  }
  return { kind, height: skel.H, crownR: skel.crownR, trunkR: skel.trunkR, lods };
}
