# Modules

One folder per subsystem. Each folder is owned by exactly one builder. See `../../ARCHITECTURE.md` §2 for the contract.

Minimal skeleton:

```js
// src/modules/<id>/index.js
import * as THREE from 'three';
import { presets, stage } from './showcase.js';

let group, ctx;

export default {
  id: '<id>',
  version: 1,
  dependencies: [],
  optional: [],
  api: {},
  async init(c) {
    ctx = c;
    group = new THREE.Group(); group.name = '<id>';
    ctx.scene.add(group);
  },
  update(dt, t) {},
  tick(simDt) {},
  dispose() { group?.removeFromParent(); },
  showcase: { presets, stage },
};
```

```js
// src/modules/<id>/showcase.js
export const presets = {
  overview: { camera: { target: [0, 0], distance: 400, pitch: 40, yaw: 35 }, tod: 15, description: '…' },
  close:    { camera: { target: [0, 0], distance: 60, pitch: 20, yaw: 60 }, tod: 16.5, description: '…' },
  night:    { camera: { target: [0, 0], distance: 120, pitch: 25, yaw: 120 }, tod: 21.5, description: '…' },
};
export async function stage(ctx, presetName) { /* build the representative scene */ }
```
