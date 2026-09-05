// Geometry toolkit for the procedural animal builder:
//  - catmull(): scalar/vector Catmull-Rom sampling
//  - Tube: rings along a path with per-ring radii, cross-section shaping, caps, bone weights, UV rect
//  - packAtlas(): shelf-packs part rectangles into one UV atlas at uniform texel density
//  - mergeParts(): merges parts into ONE indexed BufferGeometry with aBoneIndex/aBoneWeight/aInfo
//  - bakePositionMaps(): rasterises bind-pose position + info into UV space (CPU) for seamless 3D skins
import * as THREE from 'three';

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

/** Catmull-Rom on a list of numbers or Vector3s, t ∈ [0,1] over the whole list. */
export function catmull(points, t, out) {
  const n = points.length;
  if (n === 1) return out ? out.copy(points[0]) : points[0];
  const f = Math.min(Math.max(t, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(f), n - 2);
  const u = f - i;
  const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, n - 1)];
  const u2 = u * u, u3 = u2 * u;
  const c0 = -0.5 * u3 + u2 - 0.5 * u, c1 = 1.5 * u3 - 2.5 * u2 + 1, c2 = -1.5 * u3 + 2 * u2 + 0.5 * u, c3 = 0.5 * u3 - 0.5 * u2;
  if (typeof p0 === 'number') return p0 * c0 + p1 * c1 + p2 * c2 + p3 * c3;
  out = out || new THREE.Vector3();
  return out.set(
    p0.x * c0 + p1.x * c1 + p2.x * c2 + p3.x * c3,
    p0.y * c0 + p1.y * c1 + p2.y * c2 + p3.y * c3,
    p0.z * c0 + p1.z * c1 + p2.z * c2 + p3.z * c3,
  );
}

/** Piecewise Catmull-Rom of keyframes [[x, v...], ...] sorted by x; returns interpolated array of values. */
export function keyCurve(keys, x, col = 1) {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][col];
  if (x >= keys[n - 1][0]) return keys[n - 1][col];
  let i = 0;
  while (i < n - 2 && x > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(i + 2, n - 1)];
  const u = (x - k1[0]) / (k2[0] - k1[0]);
  const u2 = u * u, u3 = u2 * u;
  const c0 = -0.5 * u3 + u2 - 0.5 * u, c1 = 1.5 * u3 - 2.5 * u2 + 1, c2 = -1.5 * u3 + 2 * u2 + 0.5 * u, c3 = 0.5 * u3 - 0.5 * u2;
  return k0[col] * c0 + k1[col] * c1 + k2[col] * c2 + k3[col] * c3;
}

export function smoothstep(a, b, x) { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export const PI2 = Math.PI * 2;

/**
 * Weights along a bone chain. joints: [{bone, s}] sorted by s (the arc parameter where the bone starts).
 * Returns [i0, w0, i1, w1] in out. blend = half-width of the blend zone in s units.
 */
export function chainWeights(joints, s, blend, out) {
  let k = 0;
  for (let i = 0; i < joints.length; i++) if (s >= joints[i].s) k = i;
  const cur = joints[k];
  out[0] = cur.bone; out[1] = 1; out[2] = cur.bone; out[3] = 0;
  const nxt = joints[k + 1], prv = joints[k - 1];
  if (nxt && s > nxt.s - blend) { // approaching next joint
    const w = smoothstep(nxt.s - blend, nxt.s + blend, s);
    out[2] = nxt.bone; out[3] = w; out[1] = 1 - w;
  } else if (prv !== undefined && s < cur.s + blend) { // just after this joint
    const w = smoothstep(cur.s - blend, cur.s + blend, s);
    out[0] = prv.bone; out[1] = 1 - w; out[2] = cur.bone; out[3] = w;
  }
  return out;
}

/**
 * A tube part. Rings are placed at path points (already sampled) — each ring i has centre path[i],
 * radii rx[i], ry[i]. Frames are parallel-transported from the first ring, oriented so θ=0 is `up`.
 * opts: { segs, capStart, capEnd, capScale, shape(s, θ) → [xMul, yMul], weight(s, θ, pos, out),
 *         joints (chain for chainWeights), blend, uvRect [u0,v0,u1,v1], part (id), noise(s, θ) → radius mul,
 *         closed (ring 0 and last identical), flip }
 */
export class Tube {
  constructor(path, rx, ry, opts = {}) {
    this.path = path; this.rx = rx; this.ry = ry; this.opts = opts;
    this.part = opts.part ?? 0;
    this.segs = opts.segs ?? 16;
    this.length = 0;
    for (let i = 1; i < path.length; i++) this.length += path[i].distanceTo(path[i - 1]);
    let circ = 0;
    for (let i = 0; i < path.length; i++) circ += Math.PI * (rx[i] + ry[i]);
    this.circ = circ / path.length;
    this.uvRect = opts.uvRect || [0, 0, 1, 1];
  }

  /** Emit arrays. Returns {positions, uvs, info, bi, bw, indices}. */
  build() {
    const { path, rx, ry, segs } = this;
    const o = this.opts;
    const nR = path.length;
    const up = o.up || new THREE.Vector3(0, 1, 0);
    const positions = [], uvs = [], info = [], bi = [], bw = [], indices = [];
    const w4 = [0, 1, 0, 0];
    const [u0, v0, u1, v1] = this.uvRect;
    // arc-length parameter per ring
    const sArr = new Float32Array(nR);
    let acc = 0;
    for (let i = 1; i < nR; i++) { acc += path[i].distanceTo(path[i - 1]); sArr[i] = acc; }
    for (let i = 0; i < nR; i++) sArr[i] = acc > 0 ? sArr[i] / acc : i / Math.max(1, nR - 1);

    // frames (parallel transport)
    const frames = [];
    let prevT = null, N = new THREE.Vector3(), B = new THREE.Vector3();
    for (let i = 0; i < nR; i++) {
      const T = new THREE.Vector3();
      if (i === 0) T.subVectors(path[1], path[0]);
      else if (i === nR - 1) T.subVectors(path[nR - 1], path[nR - 2]);
      else T.subVectors(path[i + 1], path[i - 1]);
      if (T.lengthSq() < 1e-12) T.copy(prevT || new THREE.Vector3(0, 0, 1)); else T.normalize();
      if (i === 0) {
        // N = up projected off T
        N.copy(up).addScaledVector(T, -up.dot(T));
        if (N.lengthSq() < 1e-6) N.set(0, 0, 1).addScaledVector(T, -T.z);
        N.normalize();
        B.crossVectors(T, N).normalize();
      } else {
        // rotate previous frame by rotation from prevT to T
        _q.setFromUnitVectors(prevT, T);
        N.applyQuaternion(_q).normalize();
        B.crossVectors(T, N).normalize();
        N.crossVectors(B, T).normalize();
      }
      frames.push({ T: T.clone(), N: N.clone(), B: B.clone() });
      prevT = T;
    }

    const vertsPerRing = segs + 1;
    const ringStart = [];
    for (let i = 0; i < nR; i++) {
      ringStart.push(positions.length / 3);
      const s = sArr[i], f = frames[i], c = path[i];
      for (let j = 0; j <= segs; j++) {
        const v = j / segs;
        const th = v * PI2;
        let xm = 1, ym = 1;
        if (o.shape) { const m = o.shape(s, th); xm = m[0]; ym = m[1]; }
        let rmul = 1;
        if (o.noise) rmul = o.noise(s, th, i, j);
        let x = Math.sin(th) * rx[i] * xm * rmul, y = Math.cos(th) * ry[i] * ym * rmul;
        if (o.extrude) { const e = o.extrude(s, th, i, j); x += Math.sin(th) * e; y += Math.cos(th) * e; }
        _tmp.copy(c).addScaledVector(f.B, x).addScaledVector(f.N, y);
        if (o.offset) o.offset(s, th, _tmp);
        positions.push(_tmp.x, _tmp.y, _tmp.z);
        uvs.push(u0 + (u1 - u0) * s, v0 + (v1 - v0) * v);
        info.push(s, v, (rx[i] + ry[i]) * 0.5 * rmul, this.part);
        this._weights(s, th, _tmp, w4);
        bi.push(w4[0], w4[2], 0, 0); bw.push(w4[1], w4[3], 0, 0);
      }
    }
    for (let i = 0; i < nR - 1; i++) {
      const a = ringStart[i], b = ringStart[i + 1];
      for (let j = 0; j < segs; j++) {
        const a0 = a + j, a1 = a + j + 1, b0 = b + j, b1 = b + j + 1;
        if (o.flip) indices.push(a0, a1, b0, a1, b1, b0); else indices.push(a0, b0, a1, a1, b0, b1);
      }
    }
    // caps: pole vertex + fan
    const cap = (ringIdx, dir, sVal) => {
      const f = frames[ringIdx], c = path[ringIdx];
      const r = (rx[ringIdx] + ry[ringIdx]) * 0.5 * (o.capScale ?? 0.6);
      _tmp.copy(c).addScaledVector(f.T, dir * r);
      if (o.offset) o.offset(sVal, 0, _tmp);
      const pi = positions.length / 3;
      positions.push(_tmp.x, _tmp.y, _tmp.z);
      uvs.push(u0 + (u1 - u0) * sVal, (v0 + v1) * 0.5);
      info.push(sVal, 0.5, r, this.part);
      this._weights(sVal, 0, _tmp, w4);
      bi.push(w4[0], w4[2], 0, 0); bw.push(w4[1], w4[3], 0, 0);
      const a = ringStart[ringIdx];
      for (let j = 0; j < segs; j++) {
        if ((dir > 0) !== !!o.flip) indices.push(a + j, pi, a + j + 1); else indices.push(a + j, a + j + 1, pi);
      }
    };
    if (o.capStart) cap(0, -1, 0);
    if (o.capEnd) cap(nR - 1, 1, 1);
    return { positions, uvs, info, bi, bw, indices, vertsPerRing, ringStart };
  }

  _weights(s, th, pos, out) {
    const o = this.opts;
    if (o.weight) { o.weight(s, th, pos, out); return out; }
    if (o.joints) return chainWeights(o.joints, s, o.blend ?? 0.08, out);
    out[0] = o.bone ?? 0; out[1] = 1; out[2] = o.bone ?? 0; out[3] = 0;
    return out;
  }
}

/**
 * Shelf-pack parts into a square atlas. parts: [{length, circ}] in metres. Writes part.uvRect.
 * Uniform texel density; `gutter` in texels of `size`. Returns metres-per-atlas.
 */
export function packAtlas(parts, size = 1024, gutter = 6) {
  // binary search on scale (texels per metre) so everything fits
  const items = parts.map((p, i) => ({ i, w: Math.max(p.length, 0.02), h: Math.max(p.circ, 0.02) }));
  items.sort((a, b) => b.h - a.h);
  const tryPack = (tpm, commit) => {
    let x = gutter, y = gutter, rowH = 0;
    for (const it of items) {
      const w = Math.ceil(it.w * tpm), h = Math.ceil(it.h * tpm);
      if (w + 2 * gutter > size) return false;
      if (x + w + gutter > size) { x = gutter; y += rowH + gutter; rowH = 0; }
      if (y + h + gutter > size) return false;
      if (commit) parts[it.i].uvRect = [x / size, y / size, (x + w) / size, (y + h) / size];
      x += w + gutter; rowH = Math.max(rowH, h);
    }
    return true;
  };
  let lo = 1, hi = 4096;
  for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (tryPack(mid, false)) lo = mid; else hi = mid; }
  tryPack(lo, true);
  return lo;
}

/** Merge built part arrays into one indexed BufferGeometry. */
export function mergeParts(built) {
  let nv = 0, ni = 0;
  for (const b of built) { nv += b.positions.length / 3; ni += b.indices.length; }
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), info = new Float32Array(nv * 4);
  const bi = new Float32Array(nv * 4), bw = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const b of built) {
    pos.set(b.positions, vo * 3); uv.set(b.uvs, vo * 2); info.set(b.info, vo * 4); bi.set(b.bi, vo * 4); bw.set(b.bw, vo * 4);
    for (let i = 0; i < b.indices.length; i++) idx[io + i] = b.indices[i] + vo;
    vo += b.positions.length / 3; io += b.indices.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  g.setAttribute('aBoneIndex', new THREE.BufferAttribute(bi, 4));
  g.setAttribute('aBoneWeight', new THREE.BufferAttribute(bw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Rasterise the geometry's UV triangles into two float maps: pos (x,y,z,part) and info (s,v,r,mask).
 * Then dilate empty texels so mip-filtering and bilinear taps never read garbage at seams.
 */
export function bakePositionMaps(geo, size) {
  const pos = geo.attributes.position.array, uv = geo.attributes.uv.array, info = geo.attributes.aInfo.array;
  const idx = geo.index.array;
  const P = new Float32Array(size * size * 4), I = new Float32Array(size * size * 4);
  const mask = new Uint8Array(size * size);
  const S = size;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = uv[a * 2] * S, ay = uv[a * 2 + 1] * S, bx = uv[b * 2] * S, by = uv[b * 2 + 1] * S, cx = uv[c * 2] * S, cy = uv[c * 2 + 1] * S;
    const minx = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), maxx = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
    const miny = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), maxy = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-9) continue;
    const invDet = 1 / det;
    // edge expansion: accept barycentrics slightly negative (≈1 texel) to pad seams
    const pad = -1.2 / Math.sqrt(Math.abs(det));
    for (let y = miny; y <= maxy; y++) {
      const py = y + 0.5;
      for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5;
        let w1 = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)); // for c
        let w2 = ((px - ax) * (cy - ay) - (cx - ax) * (py - ay)); // for b
        w1 *= invDet; w2 *= invDet;
        const w0 = 1 - w1 - w2;
        if (w0 < pad || w1 < pad || w2 < pad) continue;
        const k = y * S + x;
        const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
        if (mask[k] === 2 || (mask[k] === 1 && !inside)) continue;
        // clamp weights for padded texels
        let u0 = Math.max(w0, 0), u1 = Math.max(w2, 0), u2 = Math.max(w1, 0);
        const sum = u0 + u1 + u2; u0 /= sum; u1 /= sum; u2 /= sum;
        const o = k * 4;
        for (let q = 0; q < 3; q++) P[o + q] = pos[a * 3 + q] * u0 + pos[b * 3 + q] * u1 + pos[c * 3 + q] * u2;
        P[o + 3] = info[a * 4 + 3];
        I[o] = info[a * 4] * u0 + info[b * 4] * u1 + info[c * 4] * u2;
        // v wraps around: pick the vertex nearest to avoid 0/1 seam blending
        let v = info[a * 4 + 1] * u0 + info[b * 4 + 1] * u1 + info[c * 4 + 1] * u2;
        I[o + 1] = v;
        I[o + 2] = info[a * 4 + 2] * u0 + info[b * 4 + 2] * u1 + info[c * 4 + 2] * u2;
        I[o + 3] = 1;
        mask[k] = inside ? 2 : 1;
      }
    }
  }
  // dilation (3 passes)
  const P2 = new Float32Array(P), I2 = new Float32Array(I), m2 = new Uint8Array(mask);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x;
      if (mask[k]) continue;
      let found = -1;
      for (let dy = -1; dy <= 1 && found < 0; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy < 0 || yy >= S || xx < 0 || xx >= S) continue;
        const kk = yy * S + xx;
        if (mask[kk]) { found = kk; break; }
      }
      if (found >= 0) {
        for (let q = 0; q < 4; q++) { P2[k * 4 + q] = P[found * 4 + q]; I2[k * 4 + q] = I[found * 4 + q]; }
        I2[k * 4 + 3] = 0.5; m2[k] = 1;
      }
    }
    P.set(P2); I.set(I2); mask.set(m2);
  }
  const mk = (arr) => {
    const t = new THREE.DataTexture(arr, S, S, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  };
  return { pos: mk(P), info: mk(I) };
}
