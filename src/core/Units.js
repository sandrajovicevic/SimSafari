// World units: metres, +Y up, world centred at origin.
export const M = 1;
export const KM = 1000;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Sun elevation (radians) for a given hour, simple sinusoid, sunrise 6h sunset 18h at equator-ish. */
export function hourToSunElevation(hour) {
  const t = ((hour - 6) / 12) * Math.PI; // 0 at 6h, PI at 18h
  return Math.sin(t) * (70 * DEG); // peaks at 70° at noon
}

/** Sun azimuth (radians, around +Y) for a given hour: east at sunrise, west at sunset. */
export function hourToSunAzimuth(hour) {
  return ((hour - 6) / 12) * Math.PI; // 0 = +X (east) at 6h → PI = -X (west) at 18h
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export function wrapHour(h) { h %= 24; return h < 0 ? h + 24 : h; }
