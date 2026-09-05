// GPU-instanced grass field.
//
// Two chunk grids are cached around the camera target:
//   near grid (16 m chunks, dense)  → LOD0 tufts (5 curved blades) and LOD1 tufts (3 short blades)
//   far  grid (64 m chunks, sparse) → LOD2 tufts (2 wide blades) out to the ring edge
// Chunks are generated once and kept in an LRU; moving the camera only re-packs the three
// InstancedMeshes (3 draw calls for the whole field). Instances fade out by shrinking toward the
// ring edge, so there is no visible circle. Wind comes from ctx.materials.withWind.
import * as THREE from 'three';

// LOD rings are only invisible if the GROUND-MAT COVERAGE PER SQUARE METRE is the same on both sides
// of every boundary. That is what `mat` is solved for below, not picked by eye:
//
//   coverage = density(tufts/m2) * (2 * mat * mulXZ)^2        target 1.15 for every ring
//
// Getting this wrong is what produced the curved arc where the dense foreground met the sparse
// midground: LOD1 was carrying 1.65x LOD0's mat coverage and LOD2 only half of LOD1's, so the
// terrain showed through in bands. Change a spacing or a mulXZ and you must re-solve `mat`.
export const QUALITY = {
  high:   { r0: 44, r1: 96,  r2: 305, nearSpacing: 0.40, farSpacing: 1.5, lod1Keep: 0.90, cap: [34000, 92000, 92000] },
  medium: { r0: 34, r1: 84,  r2: 240, nearSpacing: 0.55, farSpacing: 2.0, lod1Keep: 0.82, cap: [20000, 58000, 56000] },
  low:    { r0: 24, r1: 60,  r2: 165, nearSpacing: 0.78, farSpacing: 2.8, lod1Keep: 0.70, cap: [10000, 26000, 30000] },
};

// horizontal scale applied per LOD when packing (see rebuild)
const MUL_XZ = [1.0, 1.10, 2.4];

const NEAR_CHUNK = 16;
const FAR_CHUNK = 64;
const STRIDE = 11;   // x,y,z, sx,sy, r,g,b, key, tilt, spare

/**
 * One grass tuft: `blades` tapered strips leaning outward from the origin.
 * Vertex colours darken the base so the field has depth without a texture; normals are bent
 * toward +Y so blades never go black when the sun is low.
 */
function buildTuft(rng, { blades = 5, segments = 4, height = 1, width = 0.030, lean = 0.42, spread = 0.10, mat = 0 }) {
  const pos = [], nrm = [], col = [], uv = [], idx = [];
  const a0 = rng.range(0, Math.PI * 2);

  // Ground mat: a flat quad in the grass colour under the blades. Without it the bare terrain shows
  // through between tufts and the field reads as spikes on soil instead of a continuous sward.
  if (mat > 0) {
    const base = 0;
    const ma = rng.range(0, Math.PI);
    const cm = Math.cos(ma) * mat, sm = Math.sin(ma) * mat;
    const shade = 0.86;
    pos.push(-cm + sm, 0.012, -sm - cm, cm + sm, 0.012, sm - cm, cm - sm, 0.012, sm + cm, -cm - sm, 0.012, -sm + cm);
    for (let i = 0; i < 4; i++) { nrm.push(0, 1, 0); col.push(shade, shade, shade); }
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  for (let b = 0; b < blades; b++) {
    const a = a0 + (b / blades) * Math.PI * 2 + rng.gaussian(0, 0.45);
    const ca = Math.cos(a), sa = Math.sin(a);
    const bx = ca * spread * rng.float(), bz = sa * spread * rng.float();
    const h = height * rng.range(0.58, 1.28);
    const w = width * rng.range(0.75, 1.30);
    const ln = lean * rng.range(0.35, 1.5);
    let nx = -sa * 0.45, ny = 1.0, nz = ca * 0.45;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    let px = bx, py = 0, pz = bz;
    const base = pos.length / 3;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const hw = (w * 0.5) * Math.pow(1 - t, 0.62);
      if (s > 0) {
        const ang = ln * Math.pow((s - 0.5) / segments, 1.15);
        const step = h / segments;
        px += ca * Math.sin(ang) * step; py += Math.cos(ang) * step; pz += sa * Math.sin(ang) * step;
      }
      // base is only slightly darker than the tip: a hard gradient made every blade read as a spike
      const shade = 0.80 + 0.28 * Math.pow(t, 0.8);
      if (s === segments) {
        pos.push(px, py, pz); nrm.push(nx, ny, nz); col.push(shade, shade, shade); uv.push(0.5, t);
      } else {
        pos.push(px - sa * hw, py, pz + ca * hw); nrm.push(nx, ny, nz); col.push(shade, shade, shade); uv.push(0, t);
        pos.push(px + sa * hw, py, pz - ca * hw); nrm.push(nx, ny, nz); col.push(shade, shade, shade); uv.push(1, t);
      }
    }
    for (let s = 0; s < segments - 1; s++) {
      const i0 = base + s * 2;
      idx.push(i0, i0 + 2, i0 + 3, i0, i0 + 3, i0 + 1);
    }
    const last = base + (segments - 1) * 2;
    idx.push(last, last + 2, last + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class GrassField {
  /**
   * @param ctx module ctx
   * @param group parent THREE.Group
   * @param sample fn(x, z) → this.out = { density, height, r, g, b } (density 0 skips the candidate)
   */
  constructor(ctx, group, sample) {
    this.ctx = ctx;
    this.group = group;
    this.sample = sample;
    this.q = QUALITY[ctx.quality] || QUALITY.high;
    this.near = new Map();     // "ix,iz" → Float32Array (stride STRIDE)
    this.far = new Map();
    this.meshes = [];
    this.center = new THREE.Vector3(1e9, 0, 1e9);
    this.enabled = true;
    this._built = false;
    this._counts = [0, 0, 0];

    const rng = ctx.rng.fork('grass-geo');
    const geos = [
      // mat sizes solved for equal coverage at each ring's density — see the QUALITY comment
      buildTuft(rng, { blades: 5, segments: 4, height: 1.0, width: 0.034, lean: 0.40, spread: 0.13, mat: 0.332 }),
      buildTuft(rng, { blades: 4, segments: 2, height: 1.0, width: 0.062, lean: 0.34, spread: 0.11, mat: 0.319 }),
      buildTuft(rng, { blades: 2, segments: 1, height: 1.0, width: 0.090, lean: 0.26, spread: 0.06, mat: 0.516 }),
    ];
    this.geos = geos;

    const mat = ctx.materials.standard({
      // roughness 1.0: at 0.92 the grazing-angle Fresnel lobe on millions of DoubleSide blades made
      // the whole sward shimmer like liquid metal at low sun (park-lodge golden hour). Dry grass is
      // close to a perfect diffuser; keep every specular response off the blades.
      color: 0xffffff, roughness: 1.0, metalness: 0,
      side: THREE.DoubleSide, vertexColors: true,
    });
    mat.userData.cacheKeyExtra = 'grass';
    ctx.materials.withWind(mat, { strength: 0.14, pivotY: 0.0, frequency: 1.6 });
    this.material = mat;

    for (let i = 0; i < 3; i++) {
      const m = new THREE.InstancedMesh(geos[i], mat, this.q.cap[i]);
      m.name = 'props-grass-lod' + i;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      // instanceColor: allocated up front so we can write the raw array
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.q.cap[i] * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      group.add(m);
      this.meshes.push(m);
    }
  }

  get instanceCount() { return this._counts[0] + this._counts[1] + this._counts[2]; }
  get counts() { return this._counts; }

  setEnabled(v) { this.enabled = v; for (const m of this.meshes) m.visible = v; }

  /** Drop cached chunks overlapping a world rect (terrain edits, roads, buildings, grazing). */
  invalidate(x0, z0, x1, z1) {
    for (const [key, _v] of this.near) {
      const [ix, iz] = key.split(',').map(Number);
      const cx0 = ix * NEAR_CHUNK, cz0 = iz * NEAR_CHUNK;
      if (cx0 + NEAR_CHUNK < x0 || cx0 > x1 || cz0 + NEAR_CHUNK < z0 || cz0 > z1) continue;
      this.near.delete(key);
    }
    for (const [key, _v] of this.far) {
      const [ix, iz] = key.split(',').map(Number);
      const cx0 = ix * FAR_CHUNK, cz0 = iz * FAR_CHUNK;
      if (cx0 + FAR_CHUNK < x0 || cx0 > x1 || cz0 + FAR_CHUNK < z0 || cz0 > z1) continue;
      this.far.delete(key);
    }
    this.center.set(1e9, 0, 1e9);   // force a repack
  }

  clearCache() { this.near.clear(); this.far.clear(); this.center.set(1e9, 0, 1e9); }

  _genChunk(ix, iz, chunkSize, spacing) {
    const out = [];
    const s = this.sample;
    const x0 = ix * chunkSize, z0 = iz * chunkSize;
    const n = Math.max(1, Math.round(chunkSize / spacing));
    const step = chunkSize / n;
    // cheap deterministic hash from the sample index — no Math.random, no per-candidate noise call
    let h = ((ix * 73856093) ^ (iz * 19349663)) >>> 0;
    const rnd = () => {
      h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
      return h / 4294967296;
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const rx = rnd(), rz = rnd(), ra = rnd(), rh = rnd(), rk = rnd(), rc = rnd();
        const x = x0 + (i + 0.15 + 0.7 * rx) * step;
        const z = z0 + (j + 0.15 + 0.7 * rz) * step;
        const d = s(x, z);
        if (d <= 0) continue;
        if (rnd() > d) continue;
        const o = s.out;
        const sy = o.height * (0.62 + 0.85 * rh);
        const sx = 0.75 + 0.55 * ra;
        const cv = 0.86 + 0.28 * rc;
        out.push(
          x, o.y, z,
          sx, sy,
          o.r * cv, o.g * cv * (0.96 + 0.08 * rk), o.b * cv,
          rk, ra * 6.2831853, 0,
        );
      }
    }
    return new Float32Array(out);
  }

  _chunkNear(ix, iz) {
    const key = ix + ',' + iz;
    let c = this.near.get(key);
    if (!c) { c = this._genChunk(ix, iz, NEAR_CHUNK, this.q.nearSpacing); this.near.set(key, c); }
    return c;
  }

  _chunkFar(ix, iz) {
    const key = ix + ',' + iz;
    let c = this.far.get(key);
    if (!c) { c = this._genChunk(ix, iz, FAR_CHUNK, this.q.farSpacing); this.far.set(key, c); }
    return c;
  }

  /** Rebuild the instance buffers around (cx, cz). Call when the camera has moved far enough. */
  rebuild(cx, cz) {
    if (!this.enabled) return 0;
    const t0 = performance.now();
    const q = this.q;
    const half = this.ctx.world.half;
    const A = this.meshes[0].instanceMatrix.array, B = this.meshes[1].instanceMatrix.array, C = this.meshes[2].instanceMatrix.array;
    const CA = this.meshes[0].instanceColor.array, CB = this.meshes[1].instanceColor.array, CC = this.meshes[2].instanceColor.array;
    const capA = q.cap[0], capB = q.cap[1], capC = q.cap[2];
    let nA = 0, nB = 0, nC = 0;

    const write = (M, colArr, n, p, i, mulXZ, mulY) => {
      const o = n * 16;
      const ang = p[i + 9];
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const sx = p[i + 3] * mulXZ, sy = p[i + 4] * mulY;
      M[o] = ca * sx; M[o + 1] = 0; M[o + 2] = -sa * sx; M[o + 3] = 0;
      M[o + 4] = 0; M[o + 5] = sy; M[o + 6] = 0; M[o + 7] = 0;
      M[o + 8] = sa * sx; M[o + 9] = 0; M[o + 10] = ca * sx; M[o + 11] = 0;
      M[o + 12] = p[i]; M[o + 13] = p[i + 1]; M[o + 14] = p[i + 2]; M[o + 15] = 1;
      const c = n * 3;
      colArr[c] = p[i + 5]; colArr[c + 1] = p[i + 6]; colArr[c + 2] = p[i + 7];
    };

    // ---- near grid: LOD0 + LOD1 ----
    const r1 = q.r1, r0 = q.r0;
    const nc0 = Math.floor((cx - r1) / NEAR_CHUNK), nc1 = Math.ceil((cx + r1) / NEAR_CHUNK);
    const nd0 = Math.floor((cz - r1) / NEAR_CHUNK), nd1 = Math.ceil((cz + r1) / NEAR_CHUNK);
    const r1sq = r1 * r1;
    for (let iz = nd0; iz <= nd1; iz++) {
      const cz0 = iz * NEAR_CHUNK;
      if (cz0 + NEAR_CHUNK < -half || cz0 > half) continue;
      for (let ix = nc0; ix <= nc1; ix++) {
        const cx0 = ix * NEAR_CHUNK;
        if (cx0 + NEAR_CHUNK < -half || cx0 > half) continue;
        // chunk-level reject
        const ex = Math.max(0, Math.max(cx0 - cx, cx - (cx0 + NEAR_CHUNK)));
        const ez = Math.max(0, Math.max(cz0 - cz, cz - (cz0 + NEAR_CHUNK)));
        if (ex * ex + ez * ez > r1sq) continue;
        const p = this._chunkNear(ix, iz);
        for (let i = 0; i < p.length; i += STRIDE) {
          const dx = p[i] - cx, dz = p[i + 2] - cz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > r1) continue;
          const key = p[i + 8];
          // LOD0 probability ramps down over the last 14 m of its ring
          // 26 m cross-fade, and the LOD1 keep ratio barely drops, so the handover is invisible
          const p0 = 1 - Math.min(1, Math.max(0, (d - (r0 - 26)) / 26));
          if (key < p0) {
            if (nA < capA) { write(A, CA, nA, p, i, 1, 1); nA++; }
          } else {
            const keep = 1 - (1 - q.lod1Keep) * Math.min(1, Math.max(0, (d - r0) / (r1 * 0.6 - r0)));
            const k2 = (key * 7.31) % 1;
            if (k2 > keep) continue;
            const fade = 1 - Math.min(1, Math.max(0, (d - (r1 - 26)) / 26));
            if (nB < capB) { write(B, CB, nB, p, i, 1.10, 0.12 + 0.88 * fade); nB++; }
          }
        }
      }
    }

    // ---- far grid: LOD2 ----
    const r2 = q.r2, rin = r1 - 34;
    const fc0 = Math.floor((cx - r2) / FAR_CHUNK), fc1 = Math.ceil((cx + r2) / FAR_CHUNK);
    const fd0 = Math.floor((cz - r2) / FAR_CHUNK), fd1 = Math.ceil((cz + r2) / FAR_CHUNK);
    const r2sq = r2 * r2;
    for (let iz = fd0; iz <= fd1; iz++) {
      const cz0 = iz * FAR_CHUNK;
      if (cz0 + FAR_CHUNK < -half || cz0 > half) continue;
      for (let ix = fc0; ix <= fc1; ix++) {
        const cx0 = ix * FAR_CHUNK;
        if (cx0 + FAR_CHUNK < -half || cx0 > half) continue;
        const ex = Math.max(0, Math.max(cx0 - cx, cx - (cx0 + FAR_CHUNK)));
        const ez = Math.max(0, Math.max(cz0 - cz, cz - (cz0 + FAR_CHUNK)));
        if (ex * ex + ez * ez > r2sq) continue;
        const p = this._chunkFar(ix, iz);
        for (let i = 0; i < p.length; i += STRIDE) {
          const dx = p[i] - cx, dz = p[i + 2] - cz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > r2 || d < rin) continue;
          const fin = Math.min(1, (d - rin) / 30);
          const fout = 1 - Math.min(1, Math.max(0, (d - (r2 - 55)) / 55));
          const f = Math.min(fin, fout);
          if (f <= 0.02) continue;
          if (nC < capC) { write(C, CC, nC, p, i, 2.4, 0.85 * (0.25 + 0.75 * f)); nC++; }
        }
      }
    }

    this._counts = [nA, nB, nC];
    const counts = [nA, nB, nC];
    for (let i = 0; i < 3; i++) {
      const m = this.meshes[i];
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
    this.center.set(cx, 0, cz);
    this._built = true;
    this.lastRebuildMs = performance.now() - t0;
    // bound the caches so long play sessions do not grow without limit
    if (this.near.size > 900) this._trim(this.near, NEAR_CHUNK, cx, cz, r1 * 1.6, 600);
    if (this.far.size > 400) this._trim(this.far, FAR_CHUNK, cx, cz, r2 * 1.4, 260);
    return this.instanceCount;
  }

  _trim(map, size, cx, cz, keepR, target) {
    const drop = [];
    for (const key of map.keys()) {
      const [ix, iz] = key.split(',').map(Number);
      const dx = ix * size + size * 0.5 - cx, dz = iz * size + size * 0.5 - cz;
      if (Math.hypot(dx, dz) > keepR) drop.push(key);
    }
    for (const k of drop) { map.delete(k); if (map.size <= target) break; }
  }

  /** Re-pack if the view centre has moved. Returns true when a rebuild happened. */
  update(cx, cz, threshold = 14) {
    if (!this.enabled) return false;
    const dx = cx - this.center.x, dz = cz - this.center.z;
    if (this._built && dx * dx + dz * dz < threshold * threshold) return false;
    this.rebuild(cx, cz);
    return true;
  }

  dispose() {
    for (const m of this.meshes) { m.removeFromParent(); m.dispose?.(); }
    for (const g of this.geos) g.dispose();
    this.ctx.materials.untrack(this.material);
    this.material.dispose();
    this.meshes.length = 0;
    this.near.clear(); this.far.clear();
  }
}
