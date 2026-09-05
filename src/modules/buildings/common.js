// Shared sub-assemblies used by more than one building type, plus the build context handed to builders.
import * as THREE from 'three';
import { Parts, railing, railingRect, deck, window4, door, plinth, ironRoof, gableEnd, wallRun } from './kit.js';
import { thatchRoof, hipOutline, coneOutline } from './thatch.js';
import { TILE, layerOf } from './textures.js';

export { railing, railingRect, deck, window4, door, plinth, ironRoof, gableEnd, wallRun, thatchRoof, hipOutline, coneOutline, TILE };

/**
 * Handed to every builder. Collects geometry per material family (merged into one draw call per
 * render bucket later) plus the few things that cannot be merged: lamp positions, which become
 * night point lights, and spinning sub-assemblies (the windpump rotor).
 */
export class BuildCtx {
  constructor(rng, noise, opts = {}) {
    this.parts = new Parts(layerOf);
    this.rng = rng;
    this.noise = noise;
    this.opts = opts;
    this.lamps = [];
    this.spinners = [];
  }
  /** Buf for a material family. */
  f(name) { return this.parts.f(name); }
  /** Register a lamp position (local space). At night it becomes a small point light. */
  lamp(x, y, z, power = 1) { this.lamps.push([x, y, z, power]); return this; }
  /** A sub-assembly that rotates about `axis` at `speed` rad/s (windpump rotor). */
  spinner(x, y, z, axis = [0, 0, 1], speed = 0.9) {
    const p = new Parts(layerOf);
    this.spinners.push({ parts: p, pivot: [x, y, z], axis, speed });
    return p;
  }
}

// ---------------------------------------------------------------------------------------------------------
// small shared pieces
// ---------------------------------------------------------------------------------------------------------

/** Row of round timber poles between two points. */
export function poleRow(buf, x0, z0, x1, z1, n, y0, y1, r = 0.15, taper = 0.86) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    buf.cyl(x, z, y0, y1, r, r * taper, 8, TILE.pole, 'top');
  }
}

/** Stone footing pad under a post. */
export function footing(buf, x, z, y, r = 0.34, h = 0.22) {
  buf.cyl(x, z, y - 0.04, y + h, r, r * 0.86, 8, TILE.stone, 'top');
}

/**
 * Wall-mounted lantern: timber bracket, pressed-steel shade, warm globe. Registers a lamp light.
 * `dir` is the outward direction ('+z','-z','+x','-x') the bracket points.
 */
export function lantern(bc, x, y, z, dir = '+z', arm = 0.42) {
  const t = bc.f('timber'), m = bc.f('steel'), l = bc.f('lamp');
  const nx = dir === '+x' ? 1 : dir === '-x' ? -1 : 0;
  const nz = dir === '+z' ? 1 : dir === '-z' ? -1 : 0;
  const ex = x + nx * arm, ez = z + nz * arm;
  t.beam(x, y, z, ex, y + 0.06, ez, 0.07, 0.07, TILE.timber);
  m.cyl(ex, ez, y - 0.10, y + 0.03, 0.21, 0.075, 10, TILE.steel, 'top');
  l.tint(1.0, 0.66, 0.30);
  l.cyl(ex, ez, y - 0.25, y - 0.09, 0.085, 0.10, 8, 1, 'topbot');
  l.tint(1, 1, 1);
  bc.lamp(ex, y - 0.17, ez, 1);
}

/** Free-standing lamp on a timber post (path lighting). */
export function lampPost(bc, x, z, y0, h = 2.5) {
  const t = bc.f('pole'), m = bc.f('steel'), l = bc.f('lamp');
  t.cyl(x, z, y0, y0 + h, 0.085, 0.07, 8, TILE.pole, 'top');
  m.cyl(x, z, y0 + h, y0 + h + 0.28, 0.27, 0.07, 12, TILE.steel, 'top');
  l.tint(1.0, 0.70, 0.34);
  l.cyl(x, z, y0 + h - 0.20, y0 + h + 0.01, 0.10, 0.12, 8, 1, 'topbot');
  l.tint(1, 1, 1);
  bc.lamp(x, y0 + h - 0.10, z, 1.2);
}

/**
 * Rectangular walled box: stone base course, rendered wall above, timber wall plate on top.
 * Add openings with window4() / door().
 */
export function walledBox(bc, x0, z0, x1, z1, y0, y1, { base = 1.0, wall = 'plaster', roofPlate = true } = {}) {
  const s = bc.f('stone'), w = bc.f(wall);
  if (base > 0.01) s.box(x0 - 0.05, y0, z0 - 0.05, x1 + 0.05, y0 + base, z1 + 0.05, TILE.stone, '-y');
  w.box(x0, y0 + base, z0, x1, y1, z1, TILE[wall], '-y');
  if (roofPlate) bc.f('timber').box(x0 - 0.12, y1, z0 - 0.12, x1 + 0.12, y1 + 0.17, z1 + 0.12, TILE.timber, '-y');
}

/** Thatched hip roof sitting on a rectangular plan. Returns the ridge height. */
export function hipThatch(bc, cx, cz, w, d, eaveY, height, overhang = 0.9, opts = {}) {
  const { seg = 14, underside = false, rows = 11, courses, ridgeRoll = true } = opts;
  const o = hipOutline(w, d, overhang, seg);
  const m = new THREE.Matrix4().makeTranslation(cx, 0, cz);
  const buf = bc.f('thatch');
  buf.xform(m);
  thatchRoof(buf, {
    eave: o.eave, ridge: o.ridge, eaveY, height, underside, ridgeRoll,
    rows, tile: TILE.thatch, noise: bc.noise, courses,
    seed: (cx * 0.31 + cz * 0.17 + w * 0.07),
  });
  buf.xform(null);
  return eaveY + height;
}

/** Conical thatch (rondavel / round hut). */
export function coneThatch(bc, cx, cz, r, eaveY, height, seg = 34) {
  const o = coneOutline(r, seg);
  const m = new THREE.Matrix4().makeTranslation(cx, 0, cz);
  const buf = bc.f('thatch');
  buf.xform(m);
  thatchRoof(buf, {
    eave: o.eave, ridge: o.ridge, eaveY, height, rows: 10, tile: TILE.thatch,
    noise: bc.noise, seed: cx * 0.53 + cz * 0.29, courses: [0.0, 0.20, 0.42, 0.66], ridgeRoll: false,
  });
  buf.xform(null);
  // bound cap where the straw is tied off
  bc.f('pole').cyl(cx, cz, eaveY + height - 0.18, eaveY + height + 0.55, 0.22, 0.10, 8, TILE.pole, 'top');
}

/** Corrugated water tank on a timber stand. */
export function waterTank(bc, x, z, y0, standH = 2.2, r = 1.15, h = 1.8) {
  const t = bc.f('pole'), m = bc.f('iron'), s = bc.f('steel');
  const q = r * 0.82;
  for (const [dx, dz] of [[-q, -q], [q, -q], [q, q], [-q, q]]) {
    t.cyl(x + dx, z + dz, y0, y0 + standH, 0.10, 0.09, 6, TILE.pole, 'top');
  }
  t.beam(x - q, y0 + standH * 0.55, z - q, x + q, y0 + standH * 0.55, z + q, 0.06, 0.10, TILE.pole);
  t.beam(x + q, y0 + standH * 0.55, z - q, x - q, y0 + standH * 0.55, z + q, 0.06, 0.10, TILE.pole);
  bc.f('timber').box(x - q - 0.14, y0 + standH, z - q - 0.14, x + q + 0.14, y0 + standH + 0.14, z + q + 0.14, TILE.timber, '-y');
  const b = y0 + standH + 0.14;
  m.cyl(x, z, b, b + h, r, r, 16, TILE.iron, '');
  for (const hy of [0.25, 0.9, 1.55]) if (hy < h) s.cyl(x, z, b + hy, b + hy + 0.07, r + 0.035, r + 0.035, 16, TILE.steel, '');
  m.cyl(x, z, b + h, b + h + 0.30, r, r * 0.55, 16, TILE.iron, 'top');
  s.cyl(x + r * 0.62, z, y0, b + 0.2, 0.05, 0.05, 6, TILE.steel, '');   // down pipe
}

/** Tilted solar array on a small steel frame. */
export function solarArray(bc, x, z, y0, panels = 3, w = 1.05, d = 1.65, tilt = 0.42) {
  const m = bc.f('steel'), s = bc.f('solar');
  const totalW = panels * w + (panels - 1) * 0.06;
  const x0 = x - totalW * 0.5;
  const rise = Math.sin(tilt) * d, run = Math.cos(tilt) * d;
  m.beam(x0 - 0.1, y0, z - run * 0.5, x0 + totalW + 0.1, y0, z - run * 0.5, 0.05, 0.05, TILE.steel);
  m.beam(x0 - 0.1, y0 + rise, z + run * 0.5, x0 + totalW + 0.1, y0 + rise, z + run * 0.5, 0.05, 0.05, TILE.steel);
  m.cyl(x0 + 0.1, z + run * 0.5, y0 - 0.3, y0 + rise, 0.045, 0.045, 6, TILE.steel, 'top');
  m.cyl(x0 + totalW - 0.1, z + run * 0.5, y0 - 0.3, y0 + rise, 0.045, 0.045, 6, TILE.steel, 'top');
  m.cyl(x0 + 0.1, z - run * 0.5, y0 - 0.3, y0, 0.045, 0.045, 6, TILE.steel, 'top');
  m.cyl(x0 + totalW - 0.1, z - run * 0.5, y0 - 0.3, y0, 0.045, 0.045, 6, TILE.steel, 'top');
  s.tint(0.030, 0.038, 0.075);
  for (let i = 0; i < panels; i++) {
    const a = x0 + i * (w + 0.06), b = a + w;
    s.quad([a, y0, z - run * 0.5], [b, y0, z - run * 0.5], [b, y0 + rise, z + run * 0.5], [a, y0 + rise, z + run * 0.5], 0, 0, 1, 1);
    s.quad([b, y0 - 0.03, z - run * 0.5], [a, y0 - 0.03, z - run * 0.5], [a, y0 + rise - 0.03, z + run * 0.5], [b, y0 + rise - 0.03, z + run * 0.5], 0, 0, 1, 1);
  }
  s.tint(1, 1, 1);
}

/** Satellite dish on a short mast. */
export function satelliteDish(bc, x, z, y0, r = 0.72) {
  const m = bc.f('steel');
  m.cyl(x, z, y0, y0 + 0.9, 0.07, 0.06, 8, TILE.steel, 'top');
  const seg = 16;
  const cy = y0 + 1.05;
  const rim = [], back = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    rim.push(m.vert(x + px, cy + pz * 0.42 + 0.25, z + pz * 0.9, 0, 0.6, -0.8, i / seg, 1));
    back.push(m.vert(x, cy + 0.02, z, 0, 0.6, -0.8, i / seg, 0));
  }
  for (let i = 0; i < seg; i++) { m.tri(back[i], rim[i], rim[i + 1]); m.tri(back[i], rim[i + 1], rim[i]); }
  m.cyl(x, z, cy - 0.5, cy + 0.05, 0.05, 0.05, 6, TILE.steel, 'top');
}

/** Lattice mast: four raked legs with X bracing (radio masts, windpump towers). */
export function latticeMast(bc, x, z, y0, h, base = 1.15, top = 0.34, bays = 6, r = 0.055) {
  const m = bc.f('steel');
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (i, t) => {
    const s = base + (top - base) * t;
    return [x + legs[i][0] * s, y0 + h * t, z + legs[i][1] * s];
  };
  for (let i = 0; i < 4; i++) {
    for (let b = 0; b < bays; b++) {
      const a = at(i, b / bays), c = at(i, (b + 1) / bays);
      m.beam(a[0], a[1], a[2], c[0], c[1], c[2], r * 2, r * 2, TILE.steel);
    }
  }
  for (let b = 0; b < bays; b++) {
    const t0 = b / bays, t1 = (b + 1) / bays;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = at(i, t0), c = at(j, t1), d = at(j, t0), e = at(i, t1);
      m.beam(a[0], a[1], a[2], c[0], c[1], c[2], 0.05, 0.05, TILE.steel);
      if (b % 2 === 0) m.beam(d[0], d[1], d[2], e[0], e[1], e[2], 0.05, 0.05, TILE.steel);
      m.beam(a[0], a[1], a[2], d[0], d[1], d[2], 0.05, 0.05, TILE.steel);
    }
  }
  return top;
}

/** Straight timber stair from (x, z0, y0) up to (x, z1, y1) with treads and stringers. */
export function stair(bc, x, z0, z1, y0, y1, width = 1.1, steps = 0) {
  const t = bc.f('timber');
  const dz = z1 - z0, dy = y1 - y0;
  const n = steps || Math.max(2, Math.round(Math.abs(dy) / 0.21));
  const hw = width * 0.5;
  for (let i = 1; i <= n; i++) {
    const zz = z0 + (dz * i) / n;
    const yy = y0 + (dy * i) / n;
    t.box(x - hw, yy - 0.07, zz - Math.abs(dz) / n * 0.52, x + hw, yy, zz + Math.abs(dz) / n * 0.52, TILE.timber, '');
  }
  t.beam(x - hw - 0.06, y0 - 0.12, z0, x - hw - 0.06, y1 - 0.10, z1, 0.09, 0.26, TILE.timber);
  t.beam(x + hw + 0.06, y0 - 0.12, z0, x + hw + 0.06, y1 - 0.10, z1, 0.09, 0.26, TILE.timber);
}

/** Stone steps up onto a plinth. */
export function stoneSteps(bc, x, z0, z1, y0, y1, width = 3.0, steps = 4) {
  const s = bc.f('stone');
  const hw = width * 0.5;
  const dz = (z1 - z0) / steps, dy = (y1 - y0) / steps;
  for (let i = 1; i <= steps; i++) {
    s.box(x - hw - i * 0.03, y0 + dy * (i - 1) - 0.02, z0 + dz * (i - 1), x + hw + i * 0.03, y0 + dy * i, z1, TILE.stone, '-y');
  }
}

/** A run of reed screening between two points (hide walls, boma fences). */
export function reedScreen(buf, x0, z0, x1, z1, y0, y1, thick = 0.07) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const ux = dx / len, uz = dz / len;
  const px = -uz * thick * 0.5, pz = ux * thick * 0.5;
  const t = 1 / TILE.reed;
  const A = [x0 + px, y0, z0 + pz], B = [x1 + px, y0, z1 + pz];
  const C = [x1 - px, y0, z1 - pz], D = [x0 - px, y0, z0 - pz];
  buf.quad(A, B, [B[0], y1, B[2]], [A[0], y1, A[2]], 0, y0 * t, len * t, y1 * t);
  buf.quad(C, D, [D[0], y1, D[2]], [C[0], y1, C[2]], 0, y0 * t, len * t, y1 * t);
  buf.quad([A[0], y1, A[2]], [B[0], y1, B[2]], [C[0], y1, C[2]], [D[0], y1, D[2]], 0, 0, len * t, thick * t);
}

/** Fuel drums standing and tipped about a service yard. */
export function drums(bc, x, z, n, rng, y0 = 0) {
  const m = bc.f('iron');
  for (let i = 0; i < n; i++) {
    const dx = x + rng.range(-1.4, 1.4), dz = z + rng.range(-1.0, 1.0);
    m.tint(rng.range(0.5, 1.3), rng.range(0.45, 1.0), rng.range(0.4, 0.9));
    if (rng.bool(0.25)) {
      const mtx = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
      mtx.premultiply(new THREE.Matrix4().makeTranslation(dx, y0 + 0.30, dz));
      m.xform(mtx); m.cyl(0, 0, -0.44, 0.44, 0.30, 0.30, 12, TILE.iron, 'topbot'); m.xform(null);
    } else {
      m.cyl(dx, dz, y0, y0 + 0.88, 0.30, 0.30, 12, TILE.iron, 'top');
      m.cyl(dx, dz, y0 + 0.28, y0 + 0.34, 0.315, 0.315, 12, TILE.iron, '');
      m.cyl(dx, dz, y0 + 0.56, y0 + 0.62, 0.315, 0.315, 12, TILE.iron, '');
    }
  }
  m.tint(1, 1, 1);
}
