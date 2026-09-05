// savannah — DEMO (wave 3): a hand-tuned, art-directed African savannah scene composing terrain,
// environment, props, animals, roads, traffic and effects into one coherent 1024 m world, purely
// through their public APIs (ctx.modules.get(id), always null-checked). No gameplay: this is the
// module the blind visual A/B test against real photography uses. See docs/specs/savannah.md and
// README.md (per-preset shot list + an honest CG-vs-photography verdict).
import * as THREE from 'three';
import { presets, stage } from './showcase.js';

let ctx = null, group = null;

export default {
  id: 'savannah',
  version: 1,
  dependencies: [],
  optional: ['terrain', 'environment', 'props', 'animals', 'roads', 'traffic', 'effects'],
  api: {
    /** Preset names this module's showcase stages. */
    presetNames() { return Object.keys(presets); },
  },

  async init(c) {
    ctx = c;
    group = new THREE.Group();
    group.name = 'savannah';
    ctx.scene.add(group);
    // savannah owns no geometry of its own — every visible thing is built by the other modules'
    // public APIs during stage(). The group exists (per ARCHITECTURE §2) so the integrator/
    // screenshot tool can find/toggle this module, but stays empty outside showcase mode.
  },

  update(dt, t) { void dt; void t; },
  tick(simDt) { void simDt; },

  dispose() {
    group?.removeFromParent();
    group = null; ctx = null;
  },

  showcase: {
    presets,
    async stage(c, presetName) { return stage(c, presetName); },
  },
};
