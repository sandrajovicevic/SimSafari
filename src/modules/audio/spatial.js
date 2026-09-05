// Spatialisation: an AudioListener wrapper (the "virtual ear") and a per-source distance chain.
//
// Per spatial source:   input → air-absorption lowpass → PannerNode (inverse distance) → bus
//                                                            └→ reverb send (grows with distance) → convolver
// The lowpass closes with distance (18 kHz at 0 m → ~7.5 kHz at 300 m → 1 kHz at 1 km) and the
// reverb send rises with distance, so a far lion is dull, wet and quiet while a near zebra is dry
// and bright — the three cues a listener uses to judge distance outdoors.
import { clamp } from './dsp.js';

export function airCutoff(d) { return clamp(18000 * Math.exp(-d / 350), 500, 18000); }
export function reverbSend(d) { return clamp(0.06 + (d / 250) * 0.35, 0.06, 0.7); }

export class Listener {
  constructor(ac) {
    this.ac = ac;
    this.l = ac.listener;
    this.x = 0; this.y = 2; this.z = 0;
    this.fx = 0; this.fy = 0; this.fz = -1;
    this.ux = 0; this.uy = 1; this.uz = 0;
    this.hasParams = !!(this.l.positionX && this.l.forwardX);
    this._last = -1;
  }

  /** Throttled to 20 Hz; params are smoothed so a camera cut never zips. */
  set(px, py, pz, fx, fy, fz, ux, uy, uz) {
    this.x = px; this.y = py; this.z = pz;
    this.fx = fx; this.fy = fy; this.fz = fz;
    this.ux = ux; this.uy = uy; this.uz = uz;
    const now = this.ac.currentTime;
    if (now - this._last < 0.05) return;
    this._last = now;
    const l = this.l;
    if (this.hasParams) {
      const T = 0.06;
      l.positionX.setTargetAtTime(px, now, T); l.positionY.setTargetAtTime(py, now, T); l.positionZ.setTargetAtTime(pz, now, T);
      l.forwardX.setTargetAtTime(fx, now, T); l.forwardY.setTargetAtTime(fy, now, T); l.forwardZ.setTargetAtTime(fz, now, T);
      l.upX.setTargetAtTime(ux, now, T); l.upY.setTargetAtTime(uy, now, T); l.upZ.setTargetAtTime(uz, now, T);
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  distanceTo(x, y, z) { const dx = x - this.x, dy = y - this.y, dz = z - this.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
}

/**
 * Build a distance chain for one source. `dest` is the bus, `reverbIn` the shared convolver (or null).
 * Returns { input, distance, setPosition(x,y,z), dispose() }.
 */
export function spatialize(ac, dest, reverbIn, listener, x, y, z, { ref = 25, rolloff = 0.85 } = {}) {
  const input = ac.createGain();
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
  const p = ac.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = ref;
  p.maxDistance = 6000;
  p.rolloffFactor = rolloff;
  p.coneInnerAngle = 360; p.coneOuterAngle = 360;
  const send = ac.createGain();
  input.connect(lp); lp.connect(p); p.connect(dest);
  if (reverbIn) { p.connect(send); send.connect(reverbIn); }
  const hasParams = !!p.positionX;
  const d0 = listener.distanceTo(x, y, z);
  if (hasParams) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  lp.frequency.value = airCutoff(d0);
  send.gain.value = reverbSend(d0);
  const s = {
    input, distance: d0, x, y, z,
    setPosition(nx, ny, nz) {
      const now = ac.currentTime;
      s.x = nx; s.y = ny; s.z = nz;
      if (hasParams) { p.positionX.setTargetAtTime(nx, now, 0.04); p.positionY.setTargetAtTime(ny, now, 0.04); p.positionZ.setTargetAtTime(nz, now, 0.04); }
      else p.setPosition(nx, ny, nz);
      const d = listener.distanceTo(nx, ny, nz);
      s.distance = d;
      lp.frequency.setTargetAtTime(airCutoff(d), now, 0.08);
      send.gain.setTargetAtTime(reverbSend(d), now, 0.08);
    },
    dispose() { try { input.disconnect(); lp.disconnect(); p.disconnect(); send.disconnect(); } catch { /* ignore */ } },
  };
  return s;
}
