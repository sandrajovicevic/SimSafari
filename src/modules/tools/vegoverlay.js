// Vegetation overlay: a terrain-draped, vertex-coloured sheet showing world.vegetation cover (Wave P1,
// docs/specs/p1-food-web.md). Read-only on world.vegetation (owner: simulation). With a plant id it shows
// that plant's cover relative to its ceiling; with none it shows total forage (Σ cover × food).
// Geometry is allocated once; colours are rewritten only on show / vegetation:changed, never per frame.
import * as THREE from 'three';
import { PLANTS, PLANT_INDEX } from '../../core/Plants.js';

const SEG = 128;            // 8 m vertex spacing over the 1024 m world
const LIFT = 1.2;           // metres above the ground (depth-tested, so trees and animals stay in front)
const MAX_FORAGE = PLANTS.reduce((a, p) => a + p.maxCover * p.food, 0) * 0.6; // "lush" reference (seeded savannah reads mid-straw)

// brown (bare) → straw → green (full)
function ramp(t, out, o) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = t < 0.5 ? 0.55 + (0.85 - 0.55) * (t / 0.5) : 0.85 + (0.25 - 0.85) * ((t - 0.5) / 0.5);
  const g = t < 0.5 ? 0.30 + (0.75 - 0.30) * (t / 0.5) : 0.75 + (0.80 - 0.75) * ((t - 0.5) / 0.5);
  const b = t < 0.5 ? 0.15 + (0.25 - 0.15) * (t / 0.5) : 0.25 + (0.20 - 0.25) * ((t - 0.5) / 0.5);
  out[o] = r; out[o + 1] = g; out[o + 2] = b;
}

export class VegetationOverlay {
  constructor() {
    const n = SEG + 1;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * n * 3);
    this.col = new Float32Array(n * n * 4);
    const idx = new Uint32Array(SEG * SEG * 6);
    let k = 0;
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = 'tools-vegetation-overlay';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 40;
    this.mesh.visible = false;
    this.plant = null;       // plant id, or null for total forage
    this.world = null;
  }

  /** Show for `plant` (id or null = total forage). Re-drapes on the current terrain. */
  show(world, plant = null) {
    this.world = world;
    this.plant = plant && PLANT_INDEX[plant] !== undefined ? plant : null;
    this._drape();
    this.recolor();
    this.mesh.visible = true;
  }

  hide() { this.mesh.visible = false; }
  get visible() { return this.mesh.visible; }

  setPlant(plant) {
    const p = plant && PLANT_INDEX[plant] !== undefined ? plant : null;
    if (p === this.plant) return;
    this.plant = p;
    if (this.mesh.visible) this.recolor();
  }

  _drape() {
    const w = this.world, n = SEG + 1, step = w.size / SEG, half = w.half;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * step - half, z = j * step - half, o = (j * n + i) * 3;
      this.pos[o] = x; this.pos[o + 1] = w.getHeight(x, z) + LIFT; this.pos[o + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  /** Rewrite vertex colours from world.vegetation (call on vegetation:changed while visible). */
  recolor() {
    const w = this.world; if (!w?.vegetation) return;
    const v = w.vegetation, res = v.res, N = res * res, n = SEG + 1, step = w.size / SEG, half = w.half;
    const wl = w.terrain?.waterLevel ?? -Infinity;
    const t = this.plant ? PLANT_INDEX[this.plant] : -1;
    const maxC = t >= 0 ? PLANTS[t].maxCover : 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * step - half, z = j * step - half;
      let ix = Math.floor((x + half) / v.cell), iz = Math.floor((z + half) / v.cell);
      if (ix >= res) ix = res - 1; if (iz >= res) iz = res - 1;
      const c = iz * res + ix, o = (j * n + i) * 4;
      let val;
      if (t >= 0) val = v.cover[t * N + c] / maxC;
      else { let f = 0; for (let p = 0; p < PLANTS.length; p++) f += v.cover[p * N + c] * PLANTS[p].food; val = f / MAX_FORAGE; }
      ramp(val, this.col, o);
      const under = this.pos[(j * n + i) * 3 + 1] - LIFT < wl;
      this.col[o + 3] = under ? 0 : val > 0.02 ? 0.45 : 0.25;
    }
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
