// Non-tree props: granite kopje boulders, termite mounds, fallen logs, thorn scrub.
// All code-built, all instanced by index.js. UVs are baked per-triangle by dominant-axis projection
// (a baked triplanar) so the granite set tiles across an irregular boulder without a visible seam.
import * as THREE from 'three';

function projectUv(geo, scale = 0.5) {
  const p = geo.attributes.position.array;
  const n = geo.attributes.normal.array;
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0; i < p.length; i += 9) {          // per triangle (non-indexed)
    const nx = Math.abs(n[i] + n[i + 3] + n[i + 6]);
    const ny = Math.abs(n[i + 1] + n[i + 4] + n[i + 7]);
    const nz = Math.abs(n[i + 2] + n[i + 5] + n[i + 8]);
    let a = 0, b = 2;                              // project on XZ (ny dominant)
    if (nx > ny && nx > nz) { a = 2; b = 1; }      // YZ
    else if (nz > ny && nz > nx) { a = 0; b = 1; } // XY
    for (let v = 0; v < 3; v++) {
      const o = i + v * 3;
      uv[(i / 3 + v) * 2] = p[o + a] * scale;
      uv[(i / 3 + v) * 2 + 1] = p[o + b] * scale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * Angular granite boulder: an icosphere pushed by ridged noise and cut by a handful of random
 * planes so it breaks along flat faces the way exfoliating granite does.
 */
export function buildBoulder(rng, noise, { detail = 2, radius = 1 } = {}) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const seed = rng.range(0, 100);
  // 3–5 cutting planes
  const planes = [];
  const np = rng.int(3, 5);
  for (let i = 0; i < np; i++) {
    const th = rng.range(0, Math.PI * 2), ph = Math.acos(rng.range(-0.75, 0.95));
    planes.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), rng.range(0.62, 0.90)]);
  }
  const sx = rng.range(0.75, 1.35), sy = rng.range(0.55, 1.0), sz = rng.range(0.75, 1.35);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1
      + 0.20 * noise.fbm3D(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7 + seed, 3)
      + 0.10 * noise.ridged2D(v.x * 4.3 + seed, v.z * 4.3, 3)
      + 0.05 * noise.fbm3D(v.x * 9 + seed, v.y * 9, v.z * 9, 2);
    // planar cuts
    for (const pl of planes) {
      const d = v.x * pl[0] + v.y * pl[1] + v.z * pl[2];
      if (d > pl[3]) r -= (d - pl[3]) * 0.85;
    }
    r = Math.max(0.35, r);
    pos.setXYZ(i, v.x * r * sx, v.y * r * sy, v.z * r * sz);
  }
  geo.computeVertexNormals();
  const flat = geo.index ? geo.toNonIndexed() : geo;   // PolyhedronGeometry is already non-indexed
  if (flat !== geo) geo.dispose();
  flat.computeVertexNormals();
  projectUv(flat, 0.34);
  flat.computeBoundingSphere();
  return flat;
}

/**
 * Cathedral termite mound: a tall fluted cone with buttress ridges and a couple of side chimneys.
 * Height 1.4 – 3.2 m; footprint ~ 1.3 × height / 2.
 */
export function buildTermiteMound(rng, { rings = 12, sides = 16 } = {}) {
  const H = rng.range(1.4, 3.2);
  const R = H * rng.range(0.26, 0.40);
  const flutes = rng.int(5, 9);
  const fluteAmp = rng.range(0.14, 0.30);
  const phase = rng.range(0, Math.PI * 2);
  const lean = rng.range(0, 0.10), leanA = rng.range(0, Math.PI * 2);
  const pos = [], nrm = [], uv = [], idx = [];
  const prof = (t) => Math.pow(1 - t, 1.55) * (1 + 0.20 * Math.sin(t * 3.4));
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const y = H * t;
    const ox = Math.cos(leanA) * lean * H * t * t, oz = Math.sin(leanA) * lean * H * t * t;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const fl = 1 + fluteAmp * (1 - t * 0.55) * Math.cos(a * flutes + phase + t * 1.1);
      const rr = Math.max(0.03, R * prof(t) * fl);
      const ca = Math.cos(a), sa = Math.sin(a);
      const dt = 0.03;
      const slope = (R * prof(Math.min(1, t + dt)) - R * prof(Math.max(0, t - dt))) / (H * 2 * dt);
      let nx = ca, ny = -slope, nz = sa;
      const nl = Math.hypot(nx, ny, nz) || 1;
      pos.push(ox + ca * rr, y, oz + sa * rr);
      nrm.push(nx / nl, ny / nl, nz / nl);
      uv.push((i / sides) * 2.2, t * H * 0.55);
    }
  }
  const stride = sides + 1;
  for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) {
    const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Fallen log: a slightly bent, tapered trunk lying along +X with two broken stubs. */
export function buildLog(rng) {
  const L = rng.range(3.0, 6.5);
  const R = rng.range(0.16, 0.34);
  const sides = 8, rings = 7;
  const bend = rng.range(-0.10, 0.10), sag = rng.range(0.02, 0.09);
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const x = (t - 0.5) * L;
    const cz = bend * L * (t - 0.5) * (t - 0.5) * 4;
    const cy = R * 1.0 - sag * L * Math.sin(t * Math.PI) * 0.3;
    const rr = R * (0.62 + 0.55 * Math.sin((0.15 + t * 0.72) * Math.PI));
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(x, cy + sa * rr, cz + ca * rr);
      nrm.push(0, sa, ca);
      uv.push(t * L / 1.2, (i / sides) * 2.0);
    }
  }
  const stride = sides + 1;
  for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) {
    const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * Thorn scrub / bush: a few woody stems plus a dome of alpha-cut foliage cards.
 * Returns { stem, leaf } geometries (stem may be null for the smallest bushes).
 */
export function buildShrub(rng, { height = 1.4, cards = 16, cardSize = 0.75, stems = 4 } = {}) {
  const H = height;
  const R = H * rng.range(0.55, 0.95);
  // stems
  const sp = [], sn = [], su = [], si = [];
  const sides = 4;
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + rng.range(-0.5, 0.5);
    const lean = rng.range(0.15, 0.55);
    const len = H * rng.range(0.5, 0.9);
    const dx = Math.sin(lean) * Math.cos(a), dz = Math.sin(lean) * Math.sin(a), dy = Math.cos(lean);
    const r0 = H * 0.035, r1 = r0 * 0.35;
    const base = sp.length / 3;
    for (let i = 0; i <= sides; i++) {
      const th = (i / sides) * Math.PI * 2;
      const nx = Math.cos(th), nz = Math.sin(th);
      sp.push(nx * r0, 0, nz * r0); sn.push(nx, 0, nz); su.push(i / sides, 0);
      sp.push(dx * len + nx * r1, dy * len, dz * len + nz * r1); sn.push(nx, 0, nz); su.push(i / sides, len);
    }
    for (let i = 0; i < sides; i++) {
      const a0 = base + i * 2;
      si.push(a0, a0 + 2, a0 + 3, a0, a0 + 3, a0 + 1);
    }
  }
  const stem = new THREE.BufferGeometry();
  stem.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stem.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
  stem.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
  stem.setIndex(si);
  stem.computeBoundingSphere();

  // foliage dome
  const lp = [], ln = [], lu = [], li = [];
  const list = [];
  for (let i = 0; i < cards; i++) {
    // point in a squashed hemisphere
    const a = rng.range(0, Math.PI * 2);
    const rr = R * Math.sqrt(rng.float()) * 0.95;
    const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    const domeY = H * Math.sqrt(Math.max(0, 1 - (rr / (R * 1.05)) ** 2));
    const cy = H * 0.30 + domeY * rng.range(0.35, 0.85);
    list.push([cx, cy, cz, rr, a]);
  }
  list.sort((p, q) => p[1] - q[1]);
  for (const [cx, cy, cz, rr, a] of list) {
    const half = cardSize * rng.range(0.7, 1.3) * 0.5;
    const yaw = rng.range(0, Math.PI * 2);
    const tilt = rng.range(0.15, 1.45);
    const roll = rng.range(0, Math.PI * 2);
    const cy0 = Math.cos(yaw), sy0 = Math.sin(yaw);
    const e1 = [cy0, 0, -sy0];
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const e2 = [sy0 * ct, st, cy0 * ct];
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const ax = e1[0] * cr + e2[0] * sr, ay = e1[1] * cr + e2[1] * sr, az = e1[2] * cr + e2[2] * sr;
    const bx = -e1[0] * sr + e2[0] * cr, by = -e1[1] * sr + e2[1] * cr, bz = -e1[2] * sr + e2[2] * cr;
    // normal bent outward from the bush centre
    let nx = cx, ny = cy - H * 0.15, nz = cz;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const base = lp.length / 3;
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    for (const [u, v, tu, tv] of corners) {
      lp.push(cx + ax * half * u + bx * half * v, cy + ay * half * u + by * half * v, cz + az * half * u + bz * half * v);
      ln.push(nx, ny, nz); lu.push(tu, tv);
    }
    li.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const leaf = new THREE.BufferGeometry();
  leaf.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  leaf.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3));
  leaf.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2));
  leaf.setIndex(li);
  leaf.computeBoundingSphere();
  return { stem, leaf, height: H, radius: R };
}
