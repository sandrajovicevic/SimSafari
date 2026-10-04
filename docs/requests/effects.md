# effects → core / other-module notes

## 1. CameraRig: expose the previous frame's view-projection (Wave V1 TAA, 2026-10-04) — APPLIED

**What:** `CameraRig` owns one new field, `prevViewProjection: THREE.Matrix4`, set to the camera's
`projectionMatrix × matrixWorldInverse` at the END of every `update(dt)` (after `lookAt`
positions the camera), plus a `jitter` hook effects' TAA sets each frame. One writer: the rig;
effects reads it for temporal reprojection. Per-object motion vectors are out of scope (V1 spec:
the park is static and the rig is a slow orbit — fast movers live on rejection).

Applied as the integrator commit on `claude/v1-visual-wins`:

```js
// constructor
this.prevViewProjection = new THREE.Matrix4();
this._vp = new THREE.Matrix4();   // scratch — no per-frame allocation
this.jitter = null;               // [x, y] NDC offsets, set by effects before update

// end of update(dt)
this.camera.updateMatrixWorld();
if (this.jitter) {           // jitter in NDC units; elements 12/13 are the NDC xy offsets
  this.camera.projectionMatrix.elements[12] += this.jitter[0];
  this.camera.projectionMatrix.elements[13] += this.jitter[1];
}
this._vp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
this.prevViewProjection.copy(this._vp);
```

The jitter offsets the projection's NDC xy terms (elements 8/9) after `updateProjectionMatrix`
ran elsewhere; capturing `prevViewProjection` after the offset keeps history reprojection in
consistent jittered clip space. `jitter` stays null whenever TAA is off (quality < high, or the
`aa` pipeline flag forces `fxaa`) — then the only cost is the one matrix multiply per frame.

---

None of the older notes below block `effects` — filed for visibility only, per `docs/STATUS.json`'s
existing entries under `environment`.

## (not new, reproduced) `environment`'s hard dark horizon band

`environment`'s own round-2 entry in `docs/STATUS.json` already flags "Hard dark band at the horizon
where the sky dome meets its ground colour" as a major, not yet independently re-checked since the
exposure fixes. Reproduced here in `tools/shots/effects-heat-13.png` and `tools/shots/effects-night-22.png`
(both show a sharp dark navy line right at the skyline, visible even at a bright clear midday in `heat`).
Worth noting for `effects` specifically: it sits right where the `heat` preset's heat-haze band and
skyline silhouettes are supposed to read, and it makes the shimmer band's ground-level context harder to
judge. Not filed as a new issue — just confirming it is still present post the exposure/shadow fixes, and
that it affects at least one other module's showcase (this one) besides `environment`'s own.

No diff proposed — `effects` does not own the sky dome and doesn't have enough context on how
`environment`'s horizon blend is built to suggest one.
