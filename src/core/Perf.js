// Frame timing and renderer stats. Under SwiftShader (headless) fps is not representative.

const WARMUP = 5; // module update samples ignored at start-up

export class Perf {
  constructor(renderer) {
    this.renderer = renderer;
    this.fps = 0;
    this.frameMs = 0;
    this.frames = 0;
    this._t0 = 0;
    this._acc = 0;
    this._n = 0;
    this._last = performance.now();
    this.moduleMs = new Map();   // id → steady-state update ms (see recordModule)
    this.modulePeak = new Map(); // id → worst single update ms after warm-up
    this._modN = new Map();      // id → samples seen
  }

  beginFrame() { this._t0 = performance.now(); }

  endFrame() {
    const now = performance.now();
    const ms = now - this._t0;
    this.frames++;
    this._acc += now - this._last;
    this._last = now;
    this._n++;
    // update every ~0.5 s of wall time
    if (this._acc >= 500) {
      this.fps = (this._n * 1000) / this._acc;
      this._acc = 0; this._n = 0;
    }
    this.frameMs = this.frameMs === 0 ? ms : this.frameMs * 0.9 + ms * 0.1;
  }

  /** Steady-state module cost. The first WARMUP samples (lazy builds, first-use work) are skipped, the
   *  next samples form a plain running mean, then it becomes an EMA. Before 2026-09-25 this was an EMA
   *  seeded with the very first sample at α 0.05: after a ~44-frame capture ~10 % of a one-off start-up
   *  spike was still in the number (profiled: animals 0.39 ms real vs 4–5 ms reported; props 22 ms
   *  reported with no steady-state cost), so budget findings were measuring start-up, not frames. */
  recordModule(id, ms) {
    const n = (this._modN.get(id) || 0) + 1;
    this._modN.set(id, n);
    if (n <= WARMUP) return;
    const k = n - WARMUP, prev = this.moduleMs.get(id) || 0;
    this.moduleMs.set(id, k <= 20 ? prev + (ms - prev) / k : prev * 0.95 + ms * 0.05);
    if (ms > (this.modulePeak.get(id) || 0)) this.modulePeak.set(id, ms);
  }

  snapshot() {
    const info = this.renderer.info;
    const mem = performance.memory;
    return {
      fps: +this.fps.toFixed(1),
      frameMs: +this.frameMs.toFixed(2),
      frames: this.frames,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      memoryMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null,
    };
  }
}
