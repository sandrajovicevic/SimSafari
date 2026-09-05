// Frame timing and renderer stats. Under SwiftShader (headless) fps is not representative.

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
    this.moduleMs = new Map(); // id → EMA of update ms
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

  recordModule(id, ms) {
    const prev = this.moduleMs.get(id);
    this.moduleMs.set(id, prev === undefined ? ms : prev * 0.95 + ms * 0.05);
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
