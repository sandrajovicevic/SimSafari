// Shared mutable module state, imported by every file in this folder (never by another module's folder).
export const Z = {
  ctx: null,
  world: null,
  group: null,
  overlay: null,      // { mesh, material, dataTex, data:Uint8Array, dirty:bool, res }
  fences: null,        // { postMesh, railMesh, postGeo, railGeo, postMat, railMat }
  nextHabitatId: 1,
  overlayOn: false,
  _pendingNoBuild: null, // {ix0,iz0,ix1,iz1} rect queued for the next update() tick, or null
};
