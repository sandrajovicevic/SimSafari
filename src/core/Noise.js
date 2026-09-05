// Seeded simplex noise 2D/3D + fbm helpers (CPU). GLSL equivalents live in Textures.js (GLSL_NOISE).
import { Rng } from './Rng.js';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

export class Noise {
  constructor(seed = 1) {
    const rng = seed instanceof Rng ? seed : new Rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    rng.shuffle(p);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  /** 2D simplex, range ≈ [-1, 1] */
  noise2D(xin, yin) {
    const perm = this.perm, permMod12 = this.permMod12;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { const gi = permMod12[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { const gi = permMod12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { const gi = permMod12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2 = t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  }

  /** 3D simplex, range ≈ [-1, 1] */
  noise3D(xin, yin, zin) {
    const perm = this.perm, permMod12 = this.permMod12;
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) { const gi = permMod12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0 + GRAD3[gi + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) { const gi = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1 + GRAD3[gi + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) { const gi = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2 + GRAD3[gi + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) { const gi = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (GRAD3[gi] * x3 + GRAD3[gi + 1] * y3 + GRAD3[gi + 2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }

  /** fractal Brownian motion, normalised to ≈ [-1, 1] */
  fbm2D(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2D(x * f, y * f);
      norm += amp; amp *= gain; f *= lacunarity;
    }
    return sum / norm;
  }

  fbm3D(x, y, z, octaves = 5, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise3D(x * f, y * f, z * f);
      norm += amp; amp *= gain; f *= lacunarity;
    }
    return sum / norm;
  }

  /** ridged multifractal in [0, 1], sharp ridges — good for rocky terrain */
  ridged2D(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise2D(x * f, y * f));
      sum += amp * n * n;
      norm += amp; amp *= gain; f *= lacunarity;
    }
    return sum / norm;
  }

  /** domain-warped fbm — organic, cloud/river-like */
  warped2D(x, y, warp = 1, octaves = 5) {
    const qx = this.fbm2D(x, y, 3), qy = this.fbm2D(x + 5.2, y + 1.3, 3);
    return this.fbm2D(x + warp * qx, y + warp * qy, octaves);
  }

  /** cellular / worley 2D: returns distance to nearest feature point (0..~1.4) */
  worley2D(x, y) {
    const perm = this.perm;
    const xi = Math.floor(x), yi = Math.floor(y);
    let best = 8;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const h = perm[(cx & 255) + perm[cy & 255]];
      const h2 = perm[(h + 37) & 255];
      const px = cx + h / 255, py = cy + h2 / 255;
      const dx = px - x, dy = py - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
}
