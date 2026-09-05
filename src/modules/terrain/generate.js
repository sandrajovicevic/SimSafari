// Savannah heightfield generation + biome classification. CPU, seeded (ctx.noise / ctx.rng), deterministic.
// Layout (world 1024 m, +Y up, z+ = south): escarpment along the north edge, a meandering river from the
// escarpment foot in the NE to the SW edge with a floodplain, 3 granite kopjes, 2 shallow pans.
import { BIOME } from '../../core/World.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const BIOME_NAMES = ['grass', 'dryGrass', 'dirt', 'rock', 'sand', 'wetland', 'riverbed', 'roadDust'];

/** Point–segment distance² and parameter. */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return ex * ex + ez * ez;
}

function buildRiver(noise, rng, S) {
  // S = scale factor (half / 512). Parametric polyline from NE (below the escarpment) to SW edge.
  const A = { x: 470 * S, z: -215 * S }, B = { x: -560 * S, z: 340 * S };
  const dx = B.x - A.x, dz = B.z - A.z;
  const len = Math.hypot(dx, dz);
  const nx = -dz / len, nz = dx / len; // left normal
  const phase = rng.range(0, Math.PI * 2);
  const amp = (85 + rng.range(-15, 15)) * S;
  const pts = [];
  const N = 180;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const sway = amp * Math.sin(t * Math.PI * 2 * 2.2 + phase) * (0.35 + 0.65 * Math.sin(t * Math.PI))
      + 55 * S * noise.fbm2D(t * 5.5 + 3.1, 7.7, 3);
    const hw = (15 + 6 * noise.fbm2D(t * 9 + 11, 2.2, 2) + 4 * Math.sin(t * 19 + phase)) * S; // channel half width 9–25 m
    pts.push({ x: A.x + dx * t + nx * sway, z: A.z + dz * t + nz * sway, hw: Math.max(9 * S, hw), t });
  }
  return { points: pts, start: A, end: B };
}

function pointOnRiver(river, t) {
  const p = river.points;
  const f = clamp(t, 0, 1) * (p.length - 1);
  const i = Math.min(p.length - 2, Math.floor(f)), u = f - i;
  const a = p[i], b = p[i + 1];
  const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
  return { x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u), hw: lerp(a.hw, b.hw, u), tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l };
}

/**
 * Generate into world.terrain. Returns a `gen` state object used for reclassification after edits.
 */
export function generateSavannah(world, noise, rng, opts = {}) {
  const T = world.terrain;
  const res = T.res, cell = T.cell, half = world.half;
  const S = half / 512;
  const H = T.heights;
  const N = res * res;
  const WATER = -0.6;

  const fb = (x, z, s, o) => noise.fbm2D(x / s + 37.3, z / s + 91.7, o);

  // ---- features ----------------------------------------------------------------------------------
  const river = buildRiver(noise, rng.fork('river'), S);
  const rk = rng.fork('kopjes');
  const kopjeAnchors = [[-300, -190], [250, 210], [20, -190]];
  // A kopje is a STACK of angular granite blocks, not a smooth dome. Each block has a superellipse
  // footprint (p = 3..7 → rounded-rectangular in plan), near-vertical sides, a flat top, and is sliced by
  // 2–3 tilted fracture planes — the exfoliation joints that give real kopjes their flat faces and sharp
  // arêtes. Blocks are unioned with max(), so where they meet the crease stays sharp. Tiers stack:
  // plinth → mid blocks → cap block, plus a talus of half-buried slabs around the foot.
  const kopjes = kopjeAnchors.map(([ax, az], k) => {
    const x = (ax + rk.range(-35, 35)) * S, z = (az + rk.range(-35, 35)) * S;
    const r = rk.range(46, 66) * S;
    const hMax = rk.range(24, 36) * S;
    const boulders = [];
    const block = (br, bh, lift, dist, ang, sunk) => {
      const rot = rk.range(0, Math.PI), asp = rk.range(1.0, 1.75);
      const p = rk.range(3.0, 7.0);            // 2 = ellipse, ∞ = rectangle
      const shoulder = rk.range(0.07, 0.19);   // fraction of the footprint the sides plunge over
      const cuts = [];
      const nc = rk.int(2, 3);
      for (let c = 0; c < nc; c++) {
        const ca = rk.range(0, Math.PI * 2);
        const tilt = rk.range(0.10, 0.85);     // fracture-plane gradient, rise per metre
        cuts.push({ gx: Math.cos(ca) * tilt, gz: Math.sin(ca) * tilt, c: lift + bh * rk.range(0.72, 1.04) });
      }
      boulders.push({ dx: Math.cos(ang) * dist, dz: Math.sin(ang) * dist, r: br, h: bh, rot, asp, p, shoulder, lift, sunk, cuts });
    };
    // plinth: the weathered base the tor sits on
    const plinthR = rk.range(0.52, 0.66) * r;
    block(plinthR, hMax * rk.range(0.34, 0.46), 0, rk.range(0, 0.06) * r, rk.range(0, 6.28), 0.10);
    if (rk.range(0, 1) > 0.4) block(plinthR * rk.range(0.6, 0.85), hMax * rk.range(0.28, 0.42), 0, rk.range(0.2, 0.45) * r, rk.range(0, 6.28), 0.10);
    // mid tier: 2–3 blocks resting on the plinth
    const midLift = hMax * rk.range(0.30, 0.40);
    const nMid = rk.int(2, 3);
    for (let i = 0; i < nMid; i++) {
      const br = rk.range(0.20, 0.34) * r;
      const dist = Math.min(rk.range(0.05, 0.40) * r, Math.max(0, plinthR * 0.92 - br));
      block(br, hMax * rk.range(0.30, 0.46), midLift, dist, rk.range(0, 6.28), 0);
    }
    // cap: the block that gives the kopje its skyline
    const capLift = midLift + hMax * rk.range(0.26, 0.36);
    block(rk.range(0.13, 0.24) * r, hMax * rk.range(0.22, 0.34), capLift, rk.range(0, 0.10) * r, rk.range(0, 6.28), 0);
    // talus: half-buried slabs shed around the foot
    const nT = rk.int(4, 7);
    for (let i = 0; i < nT; i++) {
      block(rk.range(0.07, 0.17) * r, hMax * rk.range(0.10, 0.26), 0, rk.range(0.55, 1.05) * r, rk.range(0, 6.28), rk.range(0.25, 0.6));
    }
    return { id: k, x, z, r, h: hMax, boulders, baseH: rk.range(2.5, 4.5) * S };
  });
  const rp = rng.fork('pans');
  const panAnchors = [[-150, 420], [380, 60]];
  const pans = panAnchors.map(([ax, az], k) => ({ id: k, x: (ax + rp.range(-25, 25)) * S, z: (az + rp.range(-25, 25)) * S, r: rp.range(38, 52) * S, depth: rp.range(2.0, 2.6), level: 0, center: 0 }));
  const escarp = { zLine: -365 * S, height: 78 + rng.fork('esc').range(-6, 10) };

  // ---- river distance field ---------------------------------------------------------------------
  const dRiver = new Float32Array(N);
  const hwAt = new Float32Array(N);
  const tAt = new Float32Array(N);
  {
    const P = river.points, M = P.length - 1;
    // per segment bbox for early reject
    const sb = new Float32Array(M * 4);
    for (let s = 0; s < M; s++) {
      sb[s * 4] = Math.min(P[s].x, P[s + 1].x); sb[s * 4 + 1] = Math.max(P[s].x, P[s + 1].x);
      sb[s * 4 + 2] = Math.min(P[s].z, P[s + 1].z); sb[s * 4 + 3] = Math.max(P[s].z, P[s + 1].z);
    }
    for (let iz = 0; iz < res; iz++) {
      const z = iz * cell - half;
      for (let ix = 0; ix < res; ix++) {
        const x = ix * cell - half;
        let best = 1e12, bs = 0;
        for (let s = 0; s < M; s++) {
          // reject segments whose bbox is farther than current best
          const ex = x < sb[s * 4] ? sb[s * 4] - x : x > sb[s * 4 + 1] ? x - sb[s * 4 + 1] : 0;
          const ez = z < sb[s * 4 + 2] ? sb[s * 4 + 2] - z : z > sb[s * 4 + 3] ? z - sb[s * 4 + 3] : 0;
          if (ex * ex + ez * ez >= best) continue;
          const d2 = segDist(x, z, P[s].x, P[s].z, P[s + 1].x, P[s + 1].z);
          if (d2 < best) { best = d2; bs = s; }
        }
        const i = iz * res + ix;
        dRiver[i] = Math.sqrt(best);
        hwAt[i] = (P[bs].hw + P[bs + 1].hw) * 0.5;
        tAt[i] = (bs + 0.5) / M;
      }
    }
  }

  // ---- heights ----------------------------------------------------------------------------------
  const plainsAt = (x, z) => 5.5 + 7.0 * fb(x, z, 430, 4) + 2.6 * fb(x, z, 135, 3) + 0.5 * fb(x, z, 23, 2) - (z / half) * 2.5;

  for (const p of pans) { p.center = plainsAt(p.x, p.z); p.level = p.center - 1.2; }

  const kopjeMask = new Float32Array(N);
  const cliffMask = new Float32Array(N);
  const plateauMask = new Float32Array(N);
  const localLevel = new Float32Array(N);
  const patch = new Float32Array(N);

  for (let iz = 0; iz < res; iz++) {
    const z = iz * cell - half;
    for (let ix = 0; ix < res; ix++) {
      const x = ix * cell - half;
      const i = iz * res + ix;
      let h = plainsAt(x, z);
      let level = WATER;

      // river valley + floodplain + channel
      const d = dRiver[i], hw = hwAt[i];
      const floodH = 0.6 + 1.3 * fb(x, z, 65, 3) + 0.35 * fb(x, z, 14, 2) - 0.8 * (1 - smooth(hw, hw + 30, d));
      const valleyEdge = 110 * S + 45 * S * fb(x, z, 180, 2);
      const vm = 1 - smooth(30 * S, valleyEdge, d);
      h = lerp(h, floodH, vm);
      const bedH = -3.2 - 2.0 * tAt[i] + 0.6 * fb(x, z, 9, 2) - 0.8 * (1 - smooth(0, hw * 0.5, d));
      const ch = 1 - smooth(hw * 0.5, hw * 1.2, d);
      h = lerp(h, bedH, ch);

      // pans
      for (const p of pans) {
        const pd = Math.hypot(x - p.x, z - p.z);
        if (pd > p.r * 1.8) continue;
        const flat = smooth(p.r * 1.8, p.r * 0.5, pd);
        h = lerp(h, p.center + 0.3 * fb(x, z, 12, 2), flat);
        h -= p.depth * smooth(p.r, p.r * 0.25, pd) * (0.85 + 0.15 * fb(x, z, 20, 2));
        if (pd < p.r * 1.3) level = p.level;
      }

      // kopjes: stacked angular granite blocks unioned with max() on a low mound of weathered debris.
      let km = 0;
      for (const k of kopjes) {
        const kd = Math.hypot(x - k.x, z - k.z);
        if (kd > k.r * 1.6) continue;
        h += k.baseH * smooth(k.r * 1.5, k.r * 0.3, kd);
        let rock = 0;
        for (const b of k.boulders) {
          const lx = x - (k.x + b.dx), lz = z - (k.z + b.dz);
          const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
          const px = lx * cs + lz * sn, pz = -lx * sn + lz * cs;
          const ux = px / (b.r * b.asp), uz = pz / b.r;
          // superellipse radius: |u|^p + |v|^p = 1 ⇒ rectangular-ish footprint at high p
          let q = Math.pow(Math.pow(Math.abs(ux), b.p) + Math.pow(Math.abs(uz), b.p), 1 / b.p);
          q += 0.085 * fb(x, z, 11, 2) + 0.05 * fb(x, z, 4, 2);   // jagged plan outline, not a smooth rectangle
          if (q >= 1) continue;
          // near-vertical sides, flat top: full height until the last `shoulder` of the footprint
          let bh = b.lift + b.h * (Math.pow(smooth(1.0, 1.0 - b.shoulder, q), 0.45) - b.sunk);
          if (bh <= 0) continue;
          for (const cut of b.cuts) {              // fracture planes, block-local metres
            const plane = cut.c + cut.gx * px + cut.gz * pz;
            if (plane < bh) bh = plane;
          }
          if (bh > rock) rock = bh;
        }
        if (rock > 0) {
          // coarse granite grain: decimetres only, never enough to round the arêtes off
          rock += 0.5 * fb(x, z, 7, 2) + 0.3 * fb(x, z, 2.5, 2);
          h += Math.max(0, rock);
        }
        km = Math.max(km, smooth(0.4, 2.5, rock));
      }
      kopjeMask[i] = km;

      // escarpment (north edge)
      {
        // strong meander: promontories and re-entrants whose flanks face E and W, so the cliff catches
        // morning and afternoon sun instead of presenting one flat, permanently shadowed southern face
        const lineZ = escarp.zLine + 118 * S * fb(x, 0, 240, 3) + 46 * S * fb(x, 0, 88, 3)
          + 14 * fb(x, 0, 34, 2) + 22 * S * fb(x, z, 90, 2);
        const de = lineZ - z; // > 0 on the plateau side
        const profile = smooth(-75, 0, de) * 0.22 + smooth(0, 32, de) * 0.62 + smooth(32, 120, de) * 0.16;
        let he = escarp.height * profile;
        const cm = smooth(-6, 8, de) * (1 - smooth(30, 52, de));
        const flute = noise.ridged2D(x / 26 + 5, z / 26 + 9, 3);
        const flute2 = noise.ridged2D(x / 8.5 + 21, z / 8.5 + 3, 2);
        he += cm * (7.5 * flute - 3.4) + cm * 3.4 * fb(x, z, 60, 2) + cm * 1.8 * (flute2 - 0.5);
        // scree / talus cone at the foot: real escarpments are not a dam wall down to the plain
        const tal = smooth(-62, -6, de) * (1 - smooth(-6, 14, de));
        he += tal * (4.5 + 3.2 * noise.ridged2D(x / 15 + 21, z / 15 + 7, 2) + 1.2 * fb(x, z, 30, 2));
        const pl = smooth(30, 120, de);
        he += pl * (4 * fb(x, z, 150, 3) + 1.5 * noise.ridged2D(x / 40 + 1, z / 40 + 2, 3));
        he += smooth(-70, 0, de) * (1 - smooth(0, 20, de)) * 1.2 * fb(x, z, 9, 2);
        h += he;
        cliffMask[i] = cm;
        plateauMask[i] = pl;
      }

      H[i] = h;
      localLevel[i] = level;
      patch[i] = fb(x, z, 90, 3);
    }
  }

  T.waterLevel = WATER;
  world.updateHeightStats();

  // ---- moisture --------------------------------------------------------------------------------
  const moisture = new Float32Array(N);
  for (let iz = 0; iz < res; iz++) {
    const z = iz * cell - half;
    for (let ix = 0; ix < res; ix++) {
      const x = ix * cell - half;
      const i = iz * res + ix;
      const d = dRiver[i];
      const mRiver = 1 - smooth(0, 240 * S, d);
      const above = H[i] - localLevel[i];
      const mHeight = 1 - smooth(0.3, 4.5, above);
      let m = 0.5 * mRiver + 0.45 * mRiver * mHeight + 0.1 + 0.16 * fb(x, z, 300, 2);
      for (const p of pans) {
        const pd = Math.hypot(x - p.x, z - p.z);
        m += 0.7 * (1 - smooth(p.r * 0.9, p.r * 2.2, pd));
      }
      m -= 0.35 * plateauMask[i];
      m -= 0.5 * kopjeMask[i];
      moisture[i] = clamp(m, 0, 1);
    }
  }

  const gen = {
    river, kopjes, pans, escarp, waterLevel: WATER,
    dRiver, hwAt, tAt, kopjeMask, cliffMask, plateauMask, localLevel, patch, moisture,
    painted: new Uint8Array(N),
    pointOnRiver: (t) => pointOnRiver(river, t),
  };
  classifyAll(world, gen);
  return gen;
}

/** Normal y-component (slope) from central differences on the heightfield. */
export function normalAt(H, res, cell, ix, iz, out) {
  const xl = ix > 0 ? ix - 1 : ix, xr = ix < res - 1 ? ix + 1 : ix;
  const zd = iz > 0 ? iz - 1 : iz, zu = iz < res - 1 ? iz + 1 : iz;
  const hl = H[iz * res + xl], hr = H[iz * res + xr], hd = H[zd * res + ix], hu = H[zu * res + ix];
  const nx = (hl - hr), ny = (xr - xl) * cell, nz = (hd - hu);
  const ny2 = (zu - zd) * cell;
  // average the two spacings (differs only at borders)
  const yy = (ny + ny2) * 0.5;
  const l = Math.hypot(nx, yy, nz) || 1;
  out[0] = nx / l; out[1] = yy / l; out[2] = nz / l;
  return out;
}

const _n = [0, 0, 0];

/** Classify one sample. Respects gen.painted. */
export function classifySample(world, gen, ix, iz) {
  const T = world.terrain, res = T.res, cell = T.cell, H = T.heights;
  const i = iz * res + ix;
  if (gen.painted[i]) return T.biome[i];
  const h = H[i];
  normalAt(H, res, cell, ix, iz, _n);
  const slope = 1 - _n[1]; // 0 flat .. 1 vertical
  const d = gen.dRiver[i], hw = gen.hwAt[i];
  const level = gen.localLevel[i];
  const above = h - level;
  const m = gen.moisture[i];
  const pt = gen.patch[i];
  const nearRiver = d < Math.max(hw * 3.5, 130);   // the whole valley floor is silt/laterite, not scree
  let b;
  if (gen.kopjeMask[i] > 0.5 || gen.cliffMask[i] > 0.65) b = BIOME.ROCK;
  else if (above < 0.2) b = BIOME.RIVERBED;                                  // under water: channel floor, pan floor
  else if (above < 1.0 && m > 0.42) b = BIOME.WETLAND;                       // saturated margin
  else if (slope > 0.19) b = (nearRiver ? BIOME.DIRT : BIOME.ROCK);          // cut banks are earth, not scree
  else if (d < hw + 7 && above < 2.5 && pt > -0.1) b = BIOME.SAND;           // sand bar
  else if (slope > 0.09) b = (nearRiver || pt <= 0.15 ? BIOME.DIRT : BIOME.ROCK);
  else if (above < 2.2 && m > 0.55 && d > hw * 1.6 && gen.localLevel[i] !== gen.waterLevel && pt < 0.2) b = BIOME.DIRT; // trampled pan rim
  else if (m + 0.22 * pt > 0.58) b = BIOME.GRASS;
  else if (pt > 0.42 && m < 0.4) b = BIOME.DIRT;                            // bare laterite patches
  else if (gen.plateauMask[i] > 0.5 && pt > 0.25) b = BIOME.ROCK;             // rocky plateau top
  else b = BIOME.DRY_GRASS;
  T.biome[i] = b;
  return b;
}

export function classifyAll(world, gen) {
  const res = world.terrain.res;
  for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) classifySample(world, gen, ix, iz);
}

export function classifyRange(world, gen, ix0, iz0, ix1, iz1) {
  const res = world.terrain.res;
  ix0 = Math.max(0, ix0); iz0 = Math.max(0, iz0); ix1 = Math.min(res - 1, ix1); iz1 = Math.min(res - 1, iz1);
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) classifySample(world, gen, ix, iz);
}

/**
 * Pack biome weights (blurred one-hot, 8 channels → 2 RGBA8) and aux (moisture, wetness, macro) into byte arrays.
 * Writes into the provided Uint8Arrays (res*res*4 each).
 */
export function packControl(world, gen, noise, ctl0, ctl1, aux) {
  const T = world.terrain, res = T.res, cell = T.cell, half = world.half, H = T.heights, B = T.biome;
  const N = res * res;
  // 3x3 blur of one-hot weights, separable
  const tmp = new Float32Array(N * 8);
  const w = new Float32Array(N * 8);
  for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
    const i = iz * res + ix;
    const xl = ix > 0 ? ix - 1 : ix, xr = ix < res - 1 ? ix + 1 : ix;
    const a = B[iz * res + xl], b = B[i], c = B[iz * res + xr];
    tmp[i * 8 + a] += 0.25; tmp[i * 8 + b] += 0.5; tmp[i * 8 + c] += 0.25;
  }
  for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
    const i = iz * res + ix;
    const zd = iz > 0 ? iz - 1 : iz, zu = iz < res - 1 ? iz + 1 : iz;
    const a = (zd * res + ix) * 8, b = i * 8, c = (zu * res + ix) * 8;
    for (let k = 0; k < 8; k++) w[b + k] = tmp[a + k] * 0.25 + tmp[b + k] * 0.5 + tmp[c + k] * 0.25;
  }
  for (let iz = 0; iz < res; iz++) {
    const z = iz * cell - half;
    for (let ix = 0; ix < res; ix++) {
      const i = iz * res + ix;
      const x = ix * cell - half;
      const o = i * 4, k = i * 8;
      ctl0[o] = w[k] * 255; ctl0[o + 1] = w[k + 1] * 255; ctl0[o + 2] = w[k + 2] * 255; ctl0[o + 3] = w[k + 3] * 255;
      ctl1[o] = w[k + 4] * 255; ctl1[o + 1] = w[k + 5] * 255; ctl1[o + 2] = w[k + 6] * 255; ctl1[o + 3] = w[k + 7] * 255;
      const above = H[i] - gen.localLevel[i];
      const wet = 1 - smooth(-0.2, 1.6, above);
      const macro = 0.5 + 0.5 * (0.6 * noise.fbm2D(x / 210 + 3.3, z / 210 + 8.1, 3) + 0.4 * noise.fbm2D(x / 70 + 1.1, z / 70 + 4.4, 2));
      aux[o] = gen.moisture[i] * 255; aux[o + 1] = wet * 255; aux[o + 2] = clamp(macro, 0, 1) * 255; aux[o + 3] = 255;
    }
  }
}

/** Moisture sample (bilinear). */
export function sampleMoisture(world, gen, x, z) {
  const T = world.terrain, res = T.res, cell = T.cell;
  let fx = (x + world.half) / cell, fz = (z + world.half) / cell;
  fx = clamp(fx, 0, res - 1); fz = clamp(fz, 0, res - 1);
  const ix = Math.floor(fx), iz = Math.floor(fz), ix1 = Math.min(res - 1, ix + 1), iz1 = Math.min(res - 1, iz + 1);
  const tx = fx - ix, tz = fz - iz, M = gen.moisture;
  return (M[iz * res + ix] * (1 - tx) + M[iz * res + ix1] * tx) * (1 - tz) + (M[iz1 * res + ix] * (1 - tx) + M[iz1 * res + ix1] * tx) * tz;
}
