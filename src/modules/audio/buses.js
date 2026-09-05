// Mix buses: ambience / animals / vehicles / ui → master → compressor → destination.
// Each bus has an AnalyserNode tap for the meters; the master analyser also feeds the spectrum.
// A shared ConvolverNode (synthesised outdoor IR) is the distance-reverb return into master.
import { impulseResponse, dB, clamp } from './dsp.js';

export const BUS_NAMES = ['master', 'ambience', 'animals', 'vehicles', 'ui'];
const DEFAULTS = { master: 0.9, ambience: 0.8, animals: 0.9, vehicles: 0.7, ui: 0.6 };

export class Buses {
  constructor(ac, rng) {
    this.ac = ac;
    this.volumes = { ...DEFAULTS };
    this.muted = false;

    this.master = ac.createGain(); this.master.gain.value = DEFAULTS.master;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.008; comp.release.value = 0.25;
    this.comp = comp;
    this.master.connect(comp); comp.connect(ac.destination);

    this.an = {};
    this.an.master = ac.createAnalyser(); this.an.master.fftSize = 2048; this.an.master.smoothingTimeConstant = 0.7;
    comp.connect(this.an.master);

    this.bus = {};
    for (const n of ['ambience', 'animals', 'vehicles', 'ui']) {
      const g = ac.createGain(); g.gain.value = DEFAULTS[n]; g.connect(this.master);
      const an = ac.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.5; g.connect(an);
      this.bus[n] = g; this.an[n] = an;
    }

    this.reverb = ac.createConvolver();
    this.reverb.buffer = impulseResponse(ac, rng);
    this.reverbReturn = ac.createGain(); this.reverbReturn.gain.value = 0.5;
    this.reverb.connect(this.reverbReturn); this.reverbReturn.connect(this.master);

    this.levels = new Float32Array(BUS_NAMES.length).fill(-90); // dBFS rms, order = BUS_NAMES
    this.peaks = new Float32Array(BUS_NAMES.length).fill(-90);  // peak-hold with 12 dB/s fall
    this._td = new Float32Array(2048);
    this.spectrum = new Uint8Array(this.an.master.frequencyBinCount);
  }

  setVolume(name, v) {
    v = clamp(+v || 0, 0, 2);
    const g = name === 'master' ? this.master : this.bus[name];
    if (!g) return false;
    this.volumes[name] = v;
    if (!(name === 'master' && this.muted)) g.gain.setTargetAtTime(v, this.ac.currentTime, 0.03);
    return true;
  }
  getVolume(name) { return this.volumes[name]; }
  mute(on) {
    this.muted = !!on;
    this.master.gain.setTargetAtTime(on ? 0 : this.volumes.master, this.ac.currentTime, 0.03);
  }

  /** Read every bus meter (rms dBFS) and the master spectrum. Allocation-free. */
  meter(dt) {
    const td = this._td;
    for (let i = 0; i < BUS_NAMES.length; i++) {
      const an = this.an[BUS_NAMES[i]];
      an.getFloatTimeDomainData(td);
      const N = an.fftSize;
      let s = 0;
      for (let j = 0; j < N; j++) s += td[j] * td[j];
      const db = dB(Math.sqrt(s / N));
      this.levels[i] = db;
      const p = this.peaks[i] - 12 * dt;
      this.peaks[i] = db > p ? db : p;
    }
    this.an.master.getByteFrequencyData(this.spectrum);
  }

  dispose() {
    try {
      this.master.disconnect(); this.comp.disconnect(); this.reverb.disconnect(); this.reverbReturn.disconnect();
      for (const k in this.bus) this.bus[k].disconnect();
      for (const k in this.an) this.an[k].disconnect();
    } catch { /* ignore */ }
  }
}
