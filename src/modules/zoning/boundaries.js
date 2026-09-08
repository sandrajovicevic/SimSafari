// Smoothed boundary ribbons for the zoning overlay. The zone grid's own cell edges form a 4 m
// staircase; drawing dashes along them reads as zigzag chains of chunky pills. This module instead
// traces every region interface once as a "crack" polyline (grid-edge following, interior-on-left),
// merges collinear runs, rounds every corner with three rounds of Chaikin cutting, and emits ONE
// indexed ribbon carrying a per-vertex arc-length (`aAlong`) + cross-axis (`aCross`) coordinate. The
// fragment shader draws the round-2-verified warm marching-ants dash along that true contour, so
// boundaries read as smooth contour lines (the Cities: Skylines II reference) at any angle.
// Topology guarantee: a physical interface between two cells contributes exactly one crack; each
// Chaikin round only ever cuts the corner of the polyline toward the convex hull of its own
// neighbours, so a smoothed loop can never wander into a neighbouring region or cross water/rock
// invalidly — the smoothed curve stays within one cell of the exact partition at all times.
import * as THREE from 'three';
import { Z } from './state.js';

export const HALF_WIDTH = 0.55;   // ribbon half width (m) — ~1.1 m line, matching the old soft line
export const Y_LIFT = 0.16;       // above world.getHeight — clears the overlay decal (+0.06 baked)
const DASH_CYCLE = 11.4;          // metres per dash cycle (round-2 verified rhythm)
const DASH_SPEED = 2.2;           // dash cycles per second (marching ants)
const CHAIKIN_ITERS = 3;
const MAX_POINTS = 120000;        // global cap across all loops before we degrade smoothing

const LINE_VERT = /* glsl */ `
attribute float aAlong;
attribute float aCross;
varying float vAlong;
varying float vCross;
void main() {
  vAlong = aAlong;
  vCross = aCross;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const LINE_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uOpacity;
varying float vAlong;
varying float vCross;
void main() {
  float lineA = 1.0 - smoothstep(0.24, ${HALF_WIDTH}, abs(vCross));
  float ph = fract(vAlong * ${ (1 / DASH_CYCLE).toFixed(6) } - uTime * ${DASH_SPEED});
  float fw = fwidth(ph);
  float w = min(fw * 1.5 + 0.001, 0.249);
  float dash = smoothstep(0.42 - w, 0.42 + w, ph) * (1.0 - smoothstep(0.92 - w, 0.92 + w, ph));
  // dash contrast: gaps drop to ~0.1 alpha — the old 0.55 floor all but vanished over bright dry-grass
  // ground at overview distance. Rhythm (11.4 m cycle, ~50% duty, 2.2 cycles/s) is unchanged.
  float a = lineA * mix(0.12, 1.0, dash) * 0.9 * uOpacity;
  if (a <= 0.004) discard;
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.55), a);
}`;

/** Zone-region key — must match the overlay data texture packing (R=zone, G/B=habitatId bytes). */
function regionKey(zone, hid) { return zone * 65536 + hid; }

/**
 * Trace + smooth the region partition and return a ribbon BufferGeometry (or null when nothing is
 * painted). Called only on overlay rebuilds (paint events / terrain edits), never per frame.
 */
export function buildBoundaryGeometry(world) {
  const g = world.grid, res = g.res, cell = g.cell, half = world.half;
  const zone = g.zone, hid = g.habitatId;
  const key = (ix, iz) => (ix >= 0 && iz >= 0 && ix < res && iz < res) ? regionKey(zone[iz * res + ix], hid[iz * res + ix]) : -1;
  const painted = (ix, iz) => {
    if (ix < 0 || iz < 0 || ix >= res || iz >= res) return false;
    const zid = zone[iz * res + ix];
    return zid > 0 && zid < 4;
  };

  // ---- 1. collect directed interface cracks (interior-on-left / CCW around the owning cell) ----
  // Out-of-bounds counts as the same key (no crack) — matches the overlay shader's clamp.
  const cFrom = [];      // corner index (iz*(res+1)+ix)
  const cDir = [];       // 0=E 1=N 2=W 3=S (grid +x / +z)
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
  const corner = (ix, iz) => iz * (res + 1) + ix;
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      if (!painted(ix, iz)) continue;
      const k = key(ix, iz);
      // south edge (towards (ix,iz-1)): from (ix,iz) -> (ix+1,iz), E
      // east edge (towards (ix+1,iz)): from (ix+1,iz) -> (ix+1,iz+1), N
      // north edge (towards (ix,iz+1)): from (ix+1,iz+1) -> (ix,iz+1), W
      // west edge (towards (ix-1,iz)): from (ix,iz+1) -> (ix,iz), S
      const nb = [[ix, iz - 1, corner(ix, iz), 0], [ix + 1, iz, corner(ix + 1, iz), 1], [ix, iz + 1, corner(ix + 1, iz + 1), 2], [ix - 1, iz, corner(ix, iz + 1), 3]];
      for (const [nx, nz, c, d] of nb) {
        const oob = nx < 0 || nz < 0 || nx >= res || nz >= res;
        const nk = oob ? k : key(nx, nz);             // out-of-bounds counts as the same region (no crack)
        if (nk === k) continue;                       // same region — no crack
        if (painted(nx, nz) && k > nk) continue;      // painted/painted: emit once from the lower key
        cFrom.push(c); cDir.push(d);
      }
    }
  }
  const nCracks = cFrom.length;
  if (!nCracks) return null;

  // outgoing cracks per corner
  const out = new Map();
  for (let i = 0; i < nCracks; i++) {
    const c = cFrom[i];
    let list = out.get(c);
    if (!list) { list = []; out.set(c, list); }
    list.push(i);
  }

  // ---- 2. follow cracks into polylines (grid-corner points) --------------------------------------
  // Arrival rule (interior on the left): prefer turn-left, then straight, then turn-right; each
  // crack is consumed exactly once, so every physical interface lands in exactly one polyline.
  const used = new Uint8Array(nCracks);
  const ptX = [], ptZ = [], closed = [];
  for (let s = 0; s < nCracks; s++) {
    if (used[s]) continue;
    let cur = s;
    const xs = [], zs = [];
    const fx = cFrom[s] % (res + 1), fz = (cFrom[s] - fx) / (res + 1);
    xs.push(fx); zs.push(fz);
    let guard = nCracks + 4;
    while (guard-- > 0) {
      used[cur] = 1;
      const d = cDir[cur];
      const hx = (cFrom[cur] % (res + 1)) + DX[d], hz = ((cFrom[cur] - (cFrom[cur] % (res + 1))) / (res + 1)) + DZ[d];
      const hCorner = hz * (res + 1) + hx;
      xs.push(hx); zs.push(hz);
      const cands = out.get(hCorner);
      let next = -1, prio = 4;
      if (cands) {
        for (const c of cands) {
          if (used[c]) continue;
          const cd = cDir[c];
          const p = cd === ((d + 1) & 3) ? 0 : cd === d ? 1 : cd === ((d + 3) & 3) ? 2 : 3;
          if (p < prio) { prio = p; next = c; }
        }
      }
      if (next < 0) break;
      cur = next;
    }
    const isClosed = xs.length > 3 && xs[0] === xs[xs.length - 1] && zs[0] === zs[zs.length - 1];
    if (isClosed) { xs.pop(); zs.pop(); }
    closed.push(isClosed);
    ptX.push(xs); ptZ.push(zs);
  }

  // ---- 3. merge collinear grid runs, melt 1-cell teeth (Taubin), then round with Chaikin ----------
  // The water/NO_BUILD fringe and paint rims are ragged at 1-cell scale; drawing that faithfully
  // reads as a wave chain. A few Taubin (λ|μ) passes are a band-pass: they kill ~1-2 cell ripples
  // while barely shrinking the overall shape. Every point is then clamped to MAX_PULL metres of its
  // exact-crack position, so the smoothed line can never wander more than half a cell off the true
  // partition — it cannot leak into a neighbouring region, only cut across single-cell corners.
  const MAX_PULL = 2.0;    // max displacement from the exact crack polyline (m) — < half a cell
  const smoothChain = (xs, zs, isClosed) => {
    const n = xs.length;
    // collinear merge: drop the middle point of two consecutive unit steps in the same direction
    const qx = [], qz = [];
    const keep = new Uint8Array(n).fill(1);
    for (let i = 0; i < (isClosed ? n : n - 1); i++) {
      const a = i, b = (i + 1) % n, c = (i + 2) % n;
      if (xs[b] - xs[a] === xs[c] - xs[b] && zs[b] - zs[a] === zs[c] - zs[b]) keep[b] = 0;
    }
    for (let i = 0; i < n; i++) if (keep[i]) { qx.push(xs[i]); qz.push(zs[i]); }

    // Taubin smoothing in grid units (cell metres per unit)
    let m = qx.length;
    let sx2 = Float64Array.from(qx), sz2 = Float64Array.from(qz);
    const ox2 = Float64Array.from(qx), oz2 = Float64Array.from(qz);
    const maxD2 = (MAX_PULL * MAX_PULL) / (cell * cell);   // (grid units)²
    const pass = (w) => {
      const nx = new Float64Array(m), nz = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        const a = isClosed ? (i - 1 + m) % m : Math.max(0, i - 1);
        const b = isClosed ? (i + 1) % m : Math.min(m - 1, i + 1);
        nx[i] = sx2[i] * (1 - w) + (sx2[a] + sx2[b]) * 0.5 * w;
        nz[i] = sz2[i] * (1 - w) + (sz2[a] + sz2[b]) * 0.5 * w;
      }
      sx2 = nx; sz2 = nz;
    };
    for (let r = 0; r < 6; r++) { pass(0.5); pass(-0.53); }
    for (let i = 0; i < m; i++) {
      const dx = sx2[i] - ox2[i], dz = sz2[i] - oz2[i];
      const d2 = dx * dx + dz * dz;
      if (d2 > maxD2) { const f = Math.sqrt(maxD2 / d2); sx2[i] = ox2[i] + dx * f; sz2[i] = oz2[i] + dz * f; }
    }

    let px = Array.from(sx2), pz = Array.from(sz2);
    const iters = (px.length > 60000) ? 1 : (px.length > 20000) ? 2 : CHAIKIN_ITERS;
    for (let it = 0; it < iters; it++) {
      const n2 = px.length;
      const nx2 = [], nz2 = [];
      if (isClosed) {
        for (let i = 0; i < n2; i++) {
          const j = (i + 1) % n2;
          nx2.push(px[i] * 0.75 + px[j] * 0.25, px[i] * 0.25 + px[j] * 0.75);
          nz2.push(pz[i] * 0.75 + pz[j] * 0.25, pz[i] * 0.25 + pz[j] * 0.75);
        }
      } else {
        nx2.push(px[0]); nz2.push(pz[0]);
        for (let i = 0; i < n2 - 1; i++) {
          nx2.push(px[i] * 0.75 + px[i + 1] * 0.25, px[i] * 0.25 + px[i + 1] * 0.75);
          nz2.push(pz[i] * 0.75 + pz[i + 1] * 0.25, pz[i] * 0.25 + pz[i + 1] * 0.75);
        }
        nx2.push(px[n2 - 1]); nz2.push(pz[n2 - 1]);
      }
      px = nx2; pz = nz2;
      if (px.length > MAX_POINTS) break;
    }
    return { x: px, z: pz };
  };

  // ---- 4. emit one ribbon for all chains ----------------------------------------------------------
  const pos = [], along = [], cross = [], idx = [];
  let vCount = 0;
  for (let c = 0; c < ptX.length; c++) {
    const { x: sx, z: sz } = smoothChain(ptX[c], ptZ[c], closed[c]);
    const m = sx.length;
    if (m < 2) continue;
    // world-space points + cumulative arc length
    const wx = new Float32Array(m), wz = new Float32Array(m), arc = new Float32Array(m);
    let L = 0;
    for (let i = 0; i < m; i++) {
      wx[i] = sx[i] * cell - half;
      wz[i] = sz[i] * cell - half;
      if (i > 0) L += Math.hypot(wx[i] - wx[i - 1], wz[i] - wz[i - 1]);
      arc[i] = L;
    }
    for (let i = 0; i < m; i++) {
      const a = closed[c] ? (i - 1 + m) % m : Math.max(0, i - 1);
      const b = closed[c] ? (i + 1) % m : Math.min(m - 1, i + 1);
      let tx = wx[b] - wx[a], tz = wz[b] - wz[a];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const nx3 = -tz * HALF_WIDTH, nz3 = tx * HALF_WIDTH;   // left normal
      const rows = [[wx[i] + nx3, wz[i] + nz3, 1], [wx[i] - nx3, wz[i] - nz3, -1]];
      for (const [px2, pz2, side] of rows) {
        pos.push(px2, world.getHeight(px2, pz2) + Y_LIFT, pz2);
        along.push(arc[i]);
        cross.push(side);
      }
      if (i < m - 1) {
        const r0 = vCount + i * 2;
        idx.push(r0, r0 + 1, r0 + 2, r0 + 1, r0 + 3, r0 + 2);
      }
    }
    vCount += m * 2;
  }
  if (!vCount) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(along), 1));
  geo.setAttribute('aCross', new THREE.BufferAttribute(new Float32Array(cross), 1));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Create the boundary ribbon material; `timeUniform` is shared with the overlay fill material. */
export function createBoundaryMaterial(timeUniform) {
  const m = new THREE.ShaderMaterial({
    vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
    uniforms: { uTime: timeUniform, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: true,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    side: THREE.DoubleSide, fog: false,
  });
  m.name = 'zoning-overlay-boundary';
  return m;
}
