// CPU side of the atmosphere: sun/moon astronomy for an equatorial savannah, single-scattering sky model
// (same constants as the GPU LUT in shaders.js) used for sun colour, sky/horizon colours, fog and exposure.
import * as THREE from 'three';
import { DEG, clamp } from '../../core/Units.js';

// ---- physical constants shared with the GLSL LUT (metres) ----
export const ATMOS = {
  Re: 6360e3,          // earth radius
  Ra: 6460e3,          // atmosphere top
  ground: 1200,        // savannah plateau altitude above sea level
  observer: 150,       // representative camera height above ground used by the LUT
  Hr: 8000, Hm: 1200,  // Rayleigh / Mie scale heights
  betaR: [5.8e-6, 13.5e-6, 33.1e-6],
  betaM: 21e-6,        // × turbidity
  betaO: [0.65e-6, 1.881e-6, 0.085e-6], // ozone absorption at 25 km peak
  g: 0.76,
  sunE: 20,            // sun irradiance in scene-linear units (calibrated so noon exposure ≈ 0.75)
  moonRatio: 2.2e-3,   // full moon irradiance relative to the sun (physical is 2.5e-6; boosted for readability)
};

export const LATITUDE = -2.3 * DEG;         // Serengeti
export const SYNODIC_MONTH = 29.53;

/** Solar declination (radians) by season. Dry = southern winter (July), wet = southern summer (January). */
export function sunDeclination(season) { return (season === 'wet' ? -15 : 17) * DEG; }
export function moonDeclination(season) { return (season === 'wet' ? 9 : -8) * DEG; }

/** Moon phase in [0,1): 0 new, 0.5 full. */
export function moonPhase(day) { return (((day - 1 + 17.4) / SYNODIC_MONTH) % 1 + 1) % 1; }
export function moonIllumination(phase) { return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); }

/**
 * Direction TOWARD a celestial body from local hour angle H (radians, 0 at upper culmination, +west)
 * and declination. World frame: +X east, +Y up, -Z north.
 */
export function celestialDirection(H, decl, out) {
  const sφ = Math.sin(LATITUDE), cφ = Math.cos(LATITUDE);
  const sδ = Math.sin(decl), cδ = Math.cos(decl);
  const east = -cδ * Math.sin(H);
  const up = sφ * sδ + cφ * cδ * Math.cos(H);
  const north = cφ * sδ - sφ * cδ * Math.cos(H);
  return out.set(east, up, -north).normalize();
}

export function sunHourAngle(hour) { return (hour - 12) * 15 * DEG; }
export function sunDirection(hour, season, out) { return celestialDirection(sunHourAngle(hour), sunDeclination(season), out); }
export function moonDirection(hour, day, season, out) {
  const H = sunHourAngle(hour) - moonPhase(day) * Math.PI * 2;
  return celestialDirection(H, moonDeclination(season), out);
}

// ---- single scattering (JS port of the LUT shader; low sample counts, called on lighting updates only) ----
const _p = [0, 0, 0];

function raySphere(ox, oy, oz, dx, dy, dz, R) {
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - R * R;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  _p[0] = -b - s; _p[1] = -b + s;
  return _p;
}

function densities(h, out) {
  out[0] = Math.exp(-h / ATMOS.Hr);
  out[1] = Math.exp(-h / ATMOS.Hm);
  out[2] = Math.max(0, 1 - Math.abs(h - 25000) / 15000);
  return out;
}

const _d = [0, 0, 0], _ds = [0, 0, 0], _od = [0, 0, 0], _ld = [0, 0, 0];

/** Optical depth (R, M, O) from point p toward direction s to the top of the atmosphere; Infinity if the earth blocks. */
function lightDepth(px, py, pz, sx, sy, sz, out, n = 4) {
  const g = raySphere(px, py, pz, sx, sy, sz, ATMOS.Re);
  if (g && g[0] > 0) { out[0] = out[1] = out[2] = 1e9; return out; }
  const t = raySphere(px, py, pz, sx, sy, sz, ATMOS.Ra)[1];
  const step = t / n;
  out[0] = out[1] = out[2] = 0;
  for (let i = 0; i < n; i++) {
    const ti = (i + 0.5) * step;
    const x = px + sx * ti, y = py + sy * ti, z = pz + sz * ti;
    const h = Math.sqrt(x * x + y * y + z * z) - ATMOS.Re;
    densities(h, _ds);   // NOT _d: _d holds the view-ray density in scatter()'s loop — sharing it here
    out[0] += _ds[0] * step; out[1] += _ds[1] * step; out[2] += _ds[2] * step;
  }
  return out;
}

function extinction(odR, odM, odO, turb, out) {
  const A = ATMOS;
  const bm = A.betaM * turb * 1.1;
  out[0] = Math.exp(-(A.betaR[0] * odR + bm * odM + A.betaO[0] * odO));
  out[1] = Math.exp(-(A.betaR[1] * odR + bm * odM + A.betaO[1] * odO));
  out[2] = Math.exp(-(A.betaR[2] * odR + bm * odM + A.betaO[2] * odO));
  return out;
}

const _T = [0, 0, 0];

/**
 * In-scattered radiance along view direction d (unit) from the observer, for light direction s with
 * irradiance E; turbidity scales Mie. Writes linear RGB into out (array of 3) and returns it.
 * Also returns transmittance to the ray end in outT (array of 3) when provided.
 */
export function scatter(dx, dy, dz, sx, sy, sz, E, turb, out, outT = null, n = 10) {
  const A = ATMOS;
  const oy = A.Re + A.ground + A.observer;
  let tmax = raySphere(0, oy, 0, dx, dy, dz, A.Ra)[1];
  const gh = raySphere(0, oy, 0, dx, dy, dz, A.Re + A.ground);
  if (gh && gh[0] > 0) tmax = gh[0];
  let sR0 = 0, sR1 = 0, sR2 = 0, sM0 = 0, sM1 = 0, sM2 = 0;
  _od[0] = _od[1] = _od[2] = 0;
  let tPrev = 0;
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    const t = tmax * f * f; // denser sampling near the observer
    const step = t - tPrev;
    const tm = (t + tPrev) * 0.5; tPrev = t;
    const x = dx * tm, y = oy + dy * tm, z = dz * tm;
    const h = Math.sqrt(x * x + y * y + z * z) - A.Re;
    densities(h, _d);
    _od[0] += _d[0] * step; _od[1] += _d[1] * step; _od[2] += _d[2] * step;
    lightDepth(x, y, z, sx, sy, sz, _ld);
    if (_ld[0] > 1e8) continue;
    extinction(_od[0] + _ld[0], _od[1] + _ld[1], _od[2] + _ld[2], turb, _T);
    sR0 += _d[0] * _T[0] * step; sR1 += _d[0] * _T[1] * step; sR2 += _d[0] * _T[2] * step;
    sM0 += _d[1] * _T[0] * step; sM1 += _d[1] * _T[1] * step; sM2 += _d[1] * _T[2] * step;
  }
  const mu = dx * sx + dy * sy + dz * sz;
  const phaseR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const g = A.g, g2 = g * g;
  const phaseM = 3 / (8 * Math.PI) * ((1 - g2) * (1 + mu * mu)) / ((2 + g2) * Math.pow(1 + g2 - 2 * g * mu, 1.5));
  const bm = A.betaM * turb;
  out[0] = E * (A.betaR[0] * phaseR * sR0 + bm * phaseM * sM0);
  out[1] = E * (A.betaR[1] * phaseR * sR1 + bm * phaseM * sM1);
  out[2] = E * (A.betaR[2] * phaseR * sR2 + bm * phaseM * sM2);
  if (outT) extinction(_od[0], _od[1], _od[2], turb, outT);
  return out;
}

/** Transmittance from an observer at `alt` metres above the plateau toward direction s (unit). */
export function transmittance(sx, sy, sz, turb, out, alt = 2) {
  const A = ATMOS;
  const oy = A.Re + A.ground + alt;
  lightDepth(0, oy, 0, sx, sy, sz, _ld, 6);
  if (_ld[0] > 1e8) { out[0] = out[1] = out[2] = 0; return out; }
  return extinction(_ld[0], _ld[1], _ld[2], turb, out);
}

export const LUM = [0.2126, 0.7152, 0.0722];
export function luminance(c) { return c[0] * LUM[0] + c[1] * LUM[1] + c[2] * LUM[2]; }

/**
 * Evaluates all the scalar lighting quantities for the current sky. Allocation-free after first call.
 * state: { sunDir, moonDir (Vector3), moonIllum, turbidity, cloud, rain }
 */
export class SkySampler {
  constructor() {
    this.sunT = [0, 0, 0]; this.sunTHigh = [0, 0, 0]; this.moonT = [0, 0, 0];
    this.zenith = [0, 0, 0]; this.horizon = [0, 0, 0]; this.horizonSun = [0, 0, 0]; this.horizonAnti = [0, 0, 0];
    this._tmp = [0, 0, 0];
    this._t2 = [0, 0, 0];
  }

  _sky(dx, dy, dz, s, out) {
    const A = ATMOS;
    scatter(dx, dy, dz, s.sunDir.x, s.sunDir.y, s.sunDir.z, A.sunE, s.turbidity, out, null, 8);
    if (s.moonE > 0) {
      scatter(dx, dy, dz, s.moonDir.x, s.moonDir.y, s.moonDir.z, s.moonE, s.turbidity, this._t2, null, 6);
      out[0] += this._t2[0]; out[1] += this._t2[1]; out[2] += this._t2[2];
    }
    return out;
  }

  update(s) {
    transmittance(s.sunDir.x, s.sunDir.y, s.sunDir.z, s.turbidity, this.sunT, 2);
    transmittance(s.sunDir.x, s.sunDir.y, s.sunDir.z, s.turbidity, this.sunTHigh, 8000);
    transmittance(s.moonDir.x, s.moonDir.y, s.moonDir.z, s.turbidity, this.moonT, 2);
    this._sky(0, 1, 0, s, this.zenith);
    // horizon: average of 6 azimuths at +2° elevation
    const h = this.horizon; h[0] = h[1] = h[2] = 0;
    const el = Math.sin(2 * DEG), ch = Math.cos(2 * DEG);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this._sky(Math.cos(a) * ch, el, Math.sin(a) * ch, s, this._tmp);
      h[0] += this._tmp[0] / 6; h[1] += this._tmp[1] / 6; h[2] += this._tmp[2] / 6;
    }
    const az = Math.atan2(s.sunDir.z, s.sunDir.x);
    this._sky(Math.cos(az) * ch, el, Math.sin(az) * ch, s, this.horizonSun);
    this._sky(-Math.cos(az) * ch, el, -Math.sin(az) * ch, s, this.horizonAnti);
  }
}

export function clamp01(v) { return clamp(v, 0, 1); }
export const _v = new THREE.Vector3();
