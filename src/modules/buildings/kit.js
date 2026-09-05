// Geometry construction kit for the buildings module.
//
// Everything is built into a `Buf` (positions / normals / uvs / colours / surface-layer indices /
// indices as plain arrays). At the end every Buf of a building type is concatenated into ONE
// geometry per render bucket, so a whole building — thatch, timber, stone, plaster, iron, canvas,
// reed, steel — is a single draw call: the per-vertex `aLayer` index selects a slice of the
// buildings DataArrayTexture (see textures.js / material.js).
//
// UVs are always in WORLD METRES divided by a per-family tile size, so texel density is identical
// on a 0.14 m post and a 12 m wall — no visible scale jumps.
//
// Nothing in here allocates during update(); this is all build-time code.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

/** A growable triangle soup with an optional current transform, tint and surface layer. */
export class Buf {
  constructor(layer = 0) {
    this.p = []; this.n = []; this.u = []; this.c = []; this.l = []; this.idx = [];
    this.m = null; this._nm = null;
    this.lay = layer;
    this.tr = 1; this.tg = 1; this.tb = 1;
  }

  get vcount() { return this.p.length / 3; }
  get tcount() { return this.idx.length / 3; }

  /** Set (or clear with null) the transform applied to every subsequent vertex. */
  xform(m) {
    this.m = m || null;
    this._nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    return this;
  }

  /** Multiply subsequent vertices by this albedo tint (values > 1 are allowed: painted steel). */
  tint(r = 1, g = 1, b = 1) { this.tr = r; this.tg = g; this.tb = b; return this; }

  /** Override the surface-array layer for subsequent vertices. */
  layer(i) { this.lay = i; return this; }

  vert(x, y, z, nx, ny, nz, u, v) {
    if (this.m) {
      _v.set(x, y, z).applyMatrix4(this.m); x = _v.x; y = _v.y; z = _v.z;
      _v.set(nx, ny, nz).applyMatrix3(this._nm).normalize(); nx = _v.x; ny = _v.y; nz = _v.z;
    }
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v);
    this.c.push(this.tr, this.tg, this.tb); this.l.push(this.lay);
    return (this.p.length / 3) - 1;
  }

  /** Concatenate another Buf into this one (index offset applied). */
  append(o) {
    const off = this.p.length / 3;
    for (let i = 0; i < o.p.length; i++) this.p.push(o.p[i]);
    for (let i = 0; i < o.n.length; i++) this.n.push(o.n[i]);
    for (let i = 0; i < o.u.length; i++) this.u.push(o.u[i]);
    for (let i = 0; i < o.c.length; i++) this.c.push(o.c[i]);
    for (let i = 0; i < o.l.length; i++) this.l.push(o.l[i]);
    for (let i = 0; i < o.idx.length; i++) this.idx.push(o.idx[i] + off);
    return this;
  }

  tri(a, b, c) { this.idx.push(a, b, c); }

  /**
   * Quad a→b→c→d (counter-clockwise seen from the front). UVs map a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1).
   * Points are arrays [x,y,z].
   */
  quad(a, b, c, d, u0, v0, u1, v1) {
    _a.fromArray(a); _b.fromArray(b); _c.fromArray(c);
    _n.copy(_b).sub(_a).cross(_c.sub(_a)).normalize();
    const nx = _n.x, ny = _n.y, nz = _n.z;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, u0, v0);
    const i1 = this.vert(b[0], b[1], b[2], nx, ny, nz, u1, v0);
    const i2 = this.vert(c[0], c[1], c[2], nx, ny, nz, u1, v1);
    const i3 = this.vert(d[0], d[1], d[2], nx, ny, nz, u0, v1);
    this.tri(i0, i1, i2); this.tri(i0, i2, i3);
    return i0;
  }

  /** Flat triangle a→b→c with explicit uvs. */
  tri3(a, b, c, ua, ub, uc) {
    _a.fromArray(a); _b.fromArray(b); _c.fromArray(c);
    _n.copy(_b).sub(_a).cross(_c.sub(_a)).normalize();
    const i0 = this.vert(a[0], a[1], a[2], _n.x, _n.y, _n.z, ua[0], ua[1]);
    const i1 = this.vert(b[0], b[1], b[2], _n.x, _n.y, _n.z, ub[0], ub[1]);
    const i2 = this.vert(c[0], c[1], c[2], _n.x, _n.y, _n.z, uc[0], uc[1]);
    this.tri(i0, i1, i2);
  }

  /**
   * Axis-aligned box from (x0,y0,z0) to (x1,y1,z1) with world-scaled UVs.
   * skip: string containing any of 'x' '-x' 'y' '-y' 'z' '-z' faces to omit ('-y' = bottom).
   */
  box(x0, y0, z0, x1, y1, z1, tile, skip = '') {
    const t = 1 / tile;
    const has = (f) => skip.indexOf(f) < 0;
    const W = x1 - x0, H = y1 - y0, D = z1 - z0;
    // +x / -x  (u along z, v along y)
    if (has('+x')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], z1 * t, y0 * t, (z1 - D) * t, (y0 + H) * t);
    if (has('-x')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], z0 * t, y0 * t, (z0 + D) * t, (y0 + H) * t);
    // +z / -z  (u along x, v along y)
    if (has('+z')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], x0 * t, y0 * t, (x0 + W) * t, (y0 + H) * t);
    if (has('-z')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], x1 * t, y0 * t, (x1 - W) * t, (y0 + H) * t);
    // +y / -y  (u along x, v along z)
    if (has('+y')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], x0 * t, z1 * t, (x0 + W) * t, (z1 - D) * t);
    if (has('-y')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], x0 * t, z0 * t, (x0 + W) * t, (z0 + D) * t);
  }

  /** Horizontal plate at height y (deck, floor, pad). */
  plate(x0, z0, x1, z1, y, tile, up = true) {
    const t = 1 / tile;
    if (up) this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], x0 * t, z1 * t, x1 * t, z0 * t);
    else this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], x0 * t, z0 * t, x1 * t, z1 * t);
  }

  /**
   * Vertical (or matrix-transformed) cylinder from y0 to y1, radius r0 at the bottom, r1 at the top.
   * UV: u runs around the circumference, v runs along the axis — so wood grain follows the post.
   */
  cyl(cx, cz, y0, y1, r0, r1, seg, tile, caps = 'top') {
    const t = 1 / tile;
    const h = y1 - y0;
    const slope = (r0 - r1) / Math.max(1e-4, h);
    const ring0 = [], ring1 = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nl = 1 / Math.hypot(1, slope);
      const u = (i / seg) * (Math.PI * 2 * (r0 + r1) * 0.5) * t;
      ring0.push(this.vert(cx + ca * r0, y0, cz + sa * r0, ca * nl, slope * nl, sa * nl, u, y0 * t));
      ring1.push(this.vert(cx + ca * r1, y1, cz + sa * r1, ca * nl, slope * nl, sa * nl, u, y1 * t));
    }
    for (let i = 0; i < seg; i++) { this.tri(ring0[i], ring0[i + 1], ring1[i + 1]); this.tri(ring0[i], ring1[i + 1], ring1[i]); }
    if (caps.indexOf('top') >= 0 && r1 > 1e-4) {
      const cIdx = this.vert(cx, y1, cz, 0, 1, 0, cx * t, cz * t);
      const r = [];
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; r.push(this.vert(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0, (cx + Math.cos(a) * r1) * t, (cz + Math.sin(a) * r1) * t)); }
      for (let i = 0; i < seg; i++) this.tri(cIdx, r[i + 1], r[i]);
    }
    if (caps.indexOf('bot') >= 0 && r0 > 1e-4) {
      const cIdx = this.vert(cx, y0, cz, 0, -1, 0, cx * t, cz * t);
      const r = [];
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; r.push(this.vert(cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0, 0, -1, 0, (cx + Math.cos(a) * r0) * t, (cz + Math.sin(a) * r0) * t)); }
      for (let i = 0; i < seg; i++) this.tri(cIdx, r[i], r[i + 1]);
    }
  }

  /**
   * Rectangular beam between two arbitrary points, cross-section w (horizontal) × h (vertical-ish).
   * Used for rafters, braces, ladder rails, boom poles.
   */
  beam(ax, ay, az, bx, by, bz, w, h, tile) {
    _a.set(ax, ay, az); _b.set(bx, by, bz);
    _v.copy(_b).sub(_a); const len = _v.length();
    if (len < 1e-5) return;
    _v.multiplyScalar(1 / len);
    // side vector: perpendicular to the beam, as horizontal as possible
    _c.set(0, 1, 0);
    if (Math.abs(_v.y) > 0.98) _c.set(1, 0, 0);
    const sx = _c.clone().cross(_v).normalize();           // width axis
    const up = _v.clone().cross(sx).normalize();           // height axis
    const hw = w * 0.5, hh = h * 0.5, t = 1 / tile;
    const P = (s, e, f) => [
      _a.x + _v.x * s + sx.x * e + up.x * f,
      _a.y + _v.y * s + sx.y * e + up.y * f,
      _a.z + _v.z * s + sx.z * e + up.z * f,
    ];
    const L = len * t, W = w * t, H = h * t;
    this.quad(P(0, hw, -hh), P(len, hw, -hh), P(len, hw, hh), P(0, hw, hh), 0, 0, L, H);
    this.quad(P(len, -hw, -hh), P(0, -hw, -hh), P(0, -hw, hh), P(len, -hw, hh), 0, 0, L, H);
    this.quad(P(0, -hw, hh), P(0, hw, hh), P(len, hw, hh), P(len, -hw, hh), 0, 0, W, L);
    this.quad(P(0, hw, -hh), P(0, -hw, -hh), P(len, -hw, -hh), P(len, hw, -hh), 0, 0, W, L);
    this.quad(P(len, hw, -hh), P(len, -hw, -hh), P(len, -hw, hh), P(len, hw, hh), 0, 0, W, H);
    this.quad(P(0, -hw, -hh), P(0, hw, -hh), P(0, hw, hh), P(0, -hw, hh), 0, 0, W, H);
  }

  /** Triangle-strip loft between two rows of vertex indices (equal length). */
  strip(rowA, rowB) {
    for (let i = 0; i < rowA.length - 1; i++) {
      this.tri(rowA[i], rowA[i + 1], rowB[i + 1]);
      this.tri(rowA[i], rowB[i + 1], rowB[i]);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(this.l, 1));
    const n = this.p.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * A set of Bufs keyed by material family. `p.f('thatch')` returns the Buf for that family,
 * creating it with that family's surface layer and uv tile. `build(bucketOf, layerOf)` merges
 * every family into one geometry per render bucket.
 */
export class Parts {
  constructor(layerOf = null) {
    this.bufs = new Map();
    this.layerOf = layerOf || (() => 0);
  }
  f(family) {
    let b = this.bufs.get(family);
    if (!b) { b = new Buf(this.layerOf(family)); this.bufs.set(family, b); }
    return b;
  }
  /** bucketOf(family) → bucket name. Returns [{ bucket, geometry, triangles }]. */
  build(bucketOf) {
    const merged = new Map();
    for (const [family, b] of this.bufs) {
      if (!b.idx.length) continue;
      const bucket = bucketOf(family);
      let m = merged.get(bucket);
      if (!m) { m = new Buf(); merged.set(bucket, m); }
      m.append(b);
    }
    const out = [];
    for (const [bucket, b] of merged) out.push({ bucket, geometry: b.geometry(), triangles: b.tcount });
    return out;
  }
  get triangles() { let n = 0; for (const b of this.bufs.values()) n += b.tcount; return n; }
}

// ---------------------------------------------------------------------------------------------------------
// higher-level components shared by several building types
// ---------------------------------------------------------------------------------------------------------

/**
 * Timber railing along a straight run, with a top rail, a mid rail and vertical balusters.
 * Used on decks, hides, towers and bridges.
 */
export function railing(buf, x0, z0, x1, z1, y, height = 1.05, tile = 1.1, postEvery = 1.35) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return;
  const ux = dx / len, uz = dz / len;
  const n = Math.max(2, Math.round(len / postEvery));
  const r = 0.045;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * len;
    buf.cyl(x0 + ux * s, z0 + uz * s, y, y + height, r * 1.15, r, 6, tile, 'top');
  }
  // top rail + mid rail as beams
  buf.beam(x0, y + height, z0, x1, y + height, z1, 0.09, 0.075, tile);
  buf.beam(x0, y + height * 0.48, z0, x1, y + height * 0.48, z1, 0.07, 0.055, tile);
}

/** Perimeter railing around a rectangle, optionally leaving one side open. open: '+x'|'-x'|'+z'|'-z'|null */
export function railingRect(buf, x0, z0, x1, z1, y, height, tile, open = null, gap = 0) {
  if (open !== '-z') railing(buf, x0, z0, x1, z0, y, height, tile);
  if (open !== '+z') railing(buf, x0, z1, x1, z1, y, height, tile);
  if (open !== '-x') railing(buf, x0, z0 + gap, x0, z1 - gap, y, height, tile);
  if (open !== '+x') railing(buf, x1, z0 + gap, x1, z1 - gap, y, height, tile);
}

/** Plank deck: a slab of individual boards with 12 mm gaps, plus a fascia board around the edge. */
export function deck(buf, x0, z0, x1, z1, y, tile = 1.1, thickness = 0.14, plankW = 0.19, alongX = false) {
  const gap = 0.012;
  if (alongX) {
    const n = Math.max(1, Math.round((z1 - z0) / plankW));
    const w = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const a = z0 + i * w, b = a + w - gap;
      buf.box(x0, y - thickness, a, x1, y, b, tile, '-y');
    }
  } else {
    const n = Math.max(1, Math.round((x1 - x0) / plankW));
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const a = x0 + i * w, b = a + w - gap;
      buf.box(a, y - thickness, z0, b, y, z1, tile, '-y');
    }
  }
}

/**
 * A window: a recessed reveal in `wall` material and a pane in the `glass` family.
 * `axis` is the wall normal: '+z','-z','+x','-x'. (cx,cz) is the centre on the wall plane.
 */
export function window4(parts, wallFam, cx, cz, y0, y1, halfW, axis, wallTile, depth = 0.16, frame = 0.07) {
  const w = parts.f(wallFam), g = parts.f('glass'), t = parts.f('timber');
  // glass vertex colour is the EMISSIVE tint: warm interior light after dusk (see material.js)
  g.tint(1.0, 0.60, 0.27);
  const nx = axis === '+x' ? 1 : axis === '-x' ? -1 : 0;
  const nz = axis === '+z' ? 1 : axis === '-z' ? -1 : 0;
  // reveal box (sill, head, jambs) pushed back into the wall
  const inset = depth;
  const px = cx - nx * inset, pz = cz - nz * inset;
  if (nz !== 0) {
    // glass pane
    g.quad(
      [cx - halfW, y0, pz], [cx + halfW, y0, pz], [cx + halfW, y1, pz], [cx - halfW, y1, pz],
      0, 0, halfW * 2 * 0.6, (y1 - y0) * 0.6,
    );
    if (nz < 0) { /* pane faces -z: flip by drawing the reverse too (cheap, 2 tris) */
      g.quad([cx + halfW, y0, pz], [cx - halfW, y0, pz], [cx - halfW, y1, pz], [cx + halfW, y1, pz], 0, 0, halfW * 2 * 0.6, (y1 - y0) * 0.6);
    }
    // reveal sides
    w.box(cx - halfW, y0, Math.min(pz, cz), cx - halfW + 0.05, y1, Math.max(pz, cz), wallTile, '');
    w.box(cx + halfW - 0.05, y0, Math.min(pz, cz), cx + halfW, y1, Math.max(pz, cz), wallTile, '');
    w.box(cx - halfW, y1 - 0.05, Math.min(pz, cz), cx + halfW, y1, Math.max(pz, cz), wallTile, '');
    // timber sill + head lintel proud of the wall
    t.box(cx - halfW - 0.1, y0 - 0.09, cz - 0.06 * (nz > 0 ? -1 : 1) + (nz > 0 ? 0 : -0.06), cx + halfW + 0.1, y0, cz + (nz > 0 ? 0.06 : 0.06), 1.1, '');
    t.box(cx - halfW - 0.12, y1, cz - 0.07, cx + halfW + 0.12, y1 + frame + 0.03, cz + 0.07, 1.1, '');
  } else {
    g.quad([px, y0, cz + halfW], [px, y0, cz - halfW], [px, y1, cz - halfW], [px, y1, cz + halfW], 0, 0, halfW * 2 * 0.6, (y1 - y0) * 0.6);
    g.quad([px, y0, cz - halfW], [px, y0, cz + halfW], [px, y1, cz + halfW], [px, y1, cz - halfW], 0, 0, halfW * 2 * 0.6, (y1 - y0) * 0.6);
    w.box(Math.min(px, cx), y0, cz - halfW, Math.max(px, cx), y1, cz - halfW + 0.05, wallTile, '');
    w.box(Math.min(px, cx), y0, cz + halfW - 0.05, Math.max(px, cx), y1, cz + halfW, wallTile, '');
    w.box(Math.min(px, cx), y1 - 0.05, cz - halfW, Math.max(px, cx), y1, cz + halfW, wallTile, '');
    t.box(cx - 0.06, y0 - 0.09, cz - halfW - 0.1, cx + 0.06, y0, cz + halfW + 0.1, 1.1, '');
    t.box(cx - 0.07, y1, cz - halfW - 0.12, cx + 0.07, y1 + frame + 0.03, cz + halfW + 0.12, 1.1, '');
  }
}

/** A simple plank door recessed into a wall. */
export function door(parts, wallFam, cx, cz, y0, halfW, height, axis, wallTile) {
  const w = parts.f(wallFam), t = parts.f('timber');
  const nz = axis === '+z' ? 1 : axis === '-z' ? -1 : 0;
  const d = 0.12;
  if (nz !== 0) {
    const pz = cz - nz * d;
    t.quad(
      nz > 0 ? [cx - halfW, y0, pz] : [cx + halfW, y0, pz],
      nz > 0 ? [cx + halfW, y0, pz] : [cx - halfW, y0, pz],
      nz > 0 ? [cx + halfW, y0 + height, pz] : [cx - halfW, y0 + height, pz],
      nz > 0 ? [cx - halfW, y0 + height, pz] : [cx + halfW, y0 + height, pz],
      0, 0, halfW * 2 / 1.1, height / 1.1,
    );
    w.box(cx - halfW, y0, Math.min(pz, cz), cx - halfW + 0.05, y0 + height, Math.max(pz, cz), wallTile, '');
    w.box(cx + halfW - 0.05, y0, Math.min(pz, cz), cx + halfW, y0 + height, Math.max(pz, cz), wallTile, '');
    w.box(cx - halfW, y0 + height - 0.05, Math.min(pz, cz), cx + halfW, y0 + height, Math.max(pz, cz), wallTile, '');
    t.box(cx - halfW - 0.1, y0 + height, cz - 0.07, cx + halfW + 0.1, y0 + height + 0.12, cz + 0.07, 1.1, '');
  } else {
    const nx = axis === '+x' ? 1 : -1;
    const px = cx - nx * d;
    t.quad(
      nx > 0 ? [px, y0, cz + halfW] : [px, y0, cz - halfW],
      nx > 0 ? [px, y0, cz - halfW] : [px, y0, cz + halfW],
      nx > 0 ? [px, y0 + height, cz - halfW] : [px, y0 + height, cz + halfW],
      nx > 0 ? [px, y0 + height, cz + halfW] : [px, y0 + height, cz - halfW],
      0, 0, halfW * 2 / 1.1, height / 1.1,
    );
    w.box(Math.min(px, cx), y0, cz - halfW, Math.max(px, cx), y0 + height, cz - halfW + 0.05, wallTile, '');
    w.box(Math.min(px, cx), y0, cz + halfW - 0.05, Math.max(px, cx), y0 + height, cz + halfW, wallTile, '');
    t.box(cx - 0.07, y0 + height, cz - halfW - 0.1, cx + 0.07, y0 + height + 0.12, cz + halfW + 0.1, 1.1, '');
  }
}

/**
 * Battered (slightly tapered) stone plinth with a chamfered capping course.
 * Height h, walls lean in by `batter` metres over the height. Returns the top-of-plinth y.
 */
export function plinth(buf, x0, z0, x1, z1, y0, h, tile = 1.7, batter = 0.14) {
  const b = batter;
  const t = 1 / tile;
  const y1 = y0 + h;
  const corners0 = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const corners1 = [[x0 + b, z0 + b], [x1 - b, z0 + b], [x1 - b, z1 - b], [x0 + b, z1 - b]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const a0 = corners0[i], b0 = corners0[j], a1 = corners1[i], b1 = corners1[j];
    const len = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]);
    buf.quad([a0[0], y0, a0[1]], [b0[0], y0, b0[1]], [b1[0], y1, b1[1]], [a1[0], y1, a1[1]], 0, y0 * t, len * t, y1 * t);
  }
  // capping slab, slightly proud
  const o = 0.07;
  buf.box(x0 + b - o, y1, z0 + b - o, x1 - b + o, y1 + 0.12, z1 - b + o, tile, '-y');
  return y1 + 0.12;
}

/** Solid stone/plaster wall run with world-metre UVs (a box without the inner faces). */
export function wallRun(buf, x0, z0, x1, z1, y0, y1, thick, tile) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return;
  const ux = dx / len, uz = dz / len;
  const px = -uz * thick * 0.5, pz = ux * thick * 0.5;
  const t = 1 / tile;
  const A = [x0 + px, y0, z0 + pz], B = [x1 + px, y0, z1 + pz];
  const C = [x1 - px, y0, z1 - pz], D = [x0 - px, y0, z0 - pz];
  const A1 = [A[0], y1, A[2]], B1 = [B[0], y1, B[2]], C1 = [C[0], y1, C[2]], D1 = [D[0], y1, D[2]];
  buf.quad(A, B, B1, A1, 0, y0 * t, len * t, y1 * t);
  buf.quad(C, D, D1, C1, 0, y0 * t, len * t, y1 * t);
  buf.quad(B, C, C1, B1, 0, y0 * t, thick * t, y1 * t);
  buf.quad(D, A, A1, D1, 0, y0 * t, thick * t, y1 * t);
  buf.quad(A1, B1, C1, D1, 0, 0, len * t, thick * t);
}

/** Corrugated-iron pitched roof panel between two ridge points and two eave points. */
export function ironRoof(buf, x0, z0, x1, z1, ridgeY, eaveY, tile = 0.85, overhang = 0.35) {
  const midZ = (z0 + z1) * 0.5;
  const ox = overhang;
  const run = (midZ - z0) + ox;
  const slope = Math.hypot(run, ridgeY - eaveY);
  // front slope
  buf.quad([x0 - ox, eaveY, z0 - ox], [x1 + ox, eaveY, z0 - ox], [x1 + ox, ridgeY, midZ], [x0 - ox, ridgeY, midZ],
    (x0 - ox) / tile, 0, (x1 + ox) / tile, slope / tile);
  buf.quad([x1 + ox, eaveY, z1 + ox], [x0 - ox, eaveY, z1 + ox], [x0 - ox, ridgeY, midZ], [x1 + ox, ridgeY, midZ],
    (x0 - ox) / tile, 0, (x1 + ox) / tile, slope / tile);
  // undersides (so it is not one-sided from below)
  buf.quad([x1 + ox, eaveY - 0.04, z0 - ox], [x0 - ox, eaveY - 0.04, z0 - ox], [x0 - ox, ridgeY - 0.04, midZ], [x1 + ox, ridgeY - 0.04, midZ],
    (x0 - ox) / tile, 0, (x1 + ox) / tile, slope / tile);
  buf.quad([x0 - ox, eaveY - 0.04, z1 + ox], [x1 + ox, eaveY - 0.04, z1 + ox], [x1 + ox, ridgeY - 0.04, midZ], [x0 - ox, ridgeY - 0.04, midZ],
    (x0 - ox) / tile, 0, (x1 + ox) / tile, slope / tile);
  // ridge cap
  buf.box(x0 - ox, ridgeY, midZ - 0.14, x1 + ox, ridgeY + 0.09, midZ + 0.14, tile, '-y');
}

/** Gable end triangle in the given family (fills the wall above the eave). */
export function gableEnd(buf, xa, xb, z, eaveY, ridgeY, tile) {
  const t = 1 / tile;
  const mid = (xa + xb) * 0.5;
  buf.tri3([xa, eaveY, z], [xb, eaveY, z], [mid, ridgeY, z], [xa * t, eaveY * t], [xb * t, eaveY * t], [mid * t, ridgeY * t]);
  buf.tri3([xb, eaveY, z], [xa, eaveY, z], [mid, ridgeY, z], [xb * t, eaveY * t], [xa * t, eaveY * t], [mid * t, ridgeY * t]);
}
