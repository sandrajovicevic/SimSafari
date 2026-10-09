# effects → core / other-module notes

## 1. CameraRig: expose the previous frame's view-projection (Wave V1 TAA, 2026-10-04) — APPLIED

**What:** `CameraRig` owns one new field, `prevViewProjection: THREE.Matrix4`, set to the camera's
`projectionMatrix × matrixWorldInverse` at the START of every `update(dt)` — before this frame's
motion and jitter touch the camera, the matrices still hold the exact state the last frame (the one
sitting in TAA's history buffer) was rendered with. Plus a `jitter` hook effects' TAA sets each
frame. One writer: the rig; effects reads it for temporal reprojection. Per-object motion vectors
are out of scope (V1 spec: the park is static and the rig is a slow orbit — fast movers live on
rejection).

Applied on `claude/v1-visual-wins` (revised after the aliasing gate caught two bugs in the first
integrator version — see the note below):

```js
// constructor
this.prevViewProjection = new THREE.Matrix4();
this._vp = new THREE.Matrix4();   // scratch — no per-frame allocation
this.jitter = null;               // [x, y] NDC offsets, set by effects before update

// TOP of update(dt) — capture what history was rendered with, first
this._vp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
this.prevViewProjection.copy(this._vp);
// … existing body …
// end of update(dt)
this.camera.updateMatrixWorld();
// assign, never accumulate — 12/13 are the NDC xy offsets, zero in a centred projection
this.camera.projectionMatrix.elements[12] = this.jitter ? this.jitter[0] : 0;
this.camera.projectionMatrix.elements[13] = this.jitter ? this.jitter[1] : 0;
```

**Why not at the end (the first, buggy version):** computing `prevViewProjection` after applying
this frame's jitter makes it equal the CURRENT frame's view-projection — reprojection degenerates to
identity, the jitter never integrates (no supersampling), and any real camera motion is invisible to
the pass, so the neighbourhood clamp eats the history and TAA degrades to a near-passthrough. The
`--aliasing` gate measured exactly that before the fix (edge energy tracking the raw frame 8.42 vs
fxaa 6.58; final shipped numbers in `docs/specs/v1-visual-wins.md` §1). Likewise `elements[12] +=
jitter` accumulates — nothing resets the projection between frames (`updateProjectionMatrix` only
runs in `_resize`), so the offset random-walks by the Halton mean every frame. Assignment both
applies the new jitter and clears the old one, and writing 0 when `jitter` is null (quality < high,
or `setAA('fxaa')`) keeps the projection pristine for non-TAA paths at zero cost.

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
