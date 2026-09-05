// Showcase presets for the terrain module. Camera objects hold defaults for seed 1; stage() moves them onto the
// actual generated feature positions (kopje/river/pan) for whatever seed is active, before core applies them.
export const presets = {
  overview:   { camera: { target: [0, 20], distance: 1150, pitch: 44, yaw: 22 }, tod: 15,   description: 'Whole park from the south-east: escarpment across the north, river valley, kopjes, pans' },
  plains:     { camera: { target: [120, 380], distance: 42, pitch: 17, yaw: 250 }, tod: 16.5, description: 'Dry-season grass plain at 40 m: golden grass, bare laterite patches, afternoon light' },
  kopje:      { camera: { target: [-300, -190], distance: 175, pitch: 19, yaw: 305 }, tod: 17,   description: 'Granite kopje — piled boulders with lichen, long evening shadows' },
  river:      { camera: { target: [0, 0], distance: 130, pitch: 30, yaw: 120 }, tod: 9,    description: 'River channel, sand bars, wetland margin and green floodplain in morning light' },
  escarpment: { camera: { target: [0, -330], distance: 430, pitch: 14, yaw: 12 }, tod: 7,    description: 'Escarpment ridge along the north edge at sunrise: cliff band, talus, plateau' },
  close:      { camera: { target: [0, 0], distance: 26, pitch: 24, yaw: 200 }, tod: 16,   description: 'Ground detail at the river bank: grass, cracked mud, sand and water edge' },
  night:      { camera: { target: [0, 0], distance: 220, pitch: 24, yaw: 120 }, tod: 21.5, description: 'Night over the river bend and a kopje silhouette' },
};

function setTarget(p, x, z, extra = {}) {
  p.camera.target = [x, z];
  Object.assign(p.camera, extra);
}

export async function stage(ctx, presetName) {
  const api = ctx.modules.get('terrain');
  const f = api?.getFeatures?.();
  if (!f) return;
  const rad = (nx, nz) => (Math.atan2(nx, nz) * 180) / Math.PI;

  // kopje: the tallest one
  const kop = [...f.kopjes].sort((a, b) => b.h - a.h)[0];
  setTarget(presets.kopje, kop.x, kop.z);

  // river: mid-course point; look upstream along the tangent
  const rp = f.pointOnRiver(0.5);
  setTarget(presets.river, rp.x, rp.z, { yaw: rad(-rp.tx, -rp.tz) + 25 });

  // close: on the bank beside a slightly later point, looking across the water
  const cp = f.pointOnRiver(0.56);
  const side = 1;
  setTarget(presets.close, cp.x + cp.nx * (cp.hw + 4) * side, cp.z + cp.nz * (cp.hw + 4) * side, { yaw: rad(cp.nx * side, cp.nz * side) + 150 });

  // night: river bend with a kopje behind
  const np = f.pointOnRiver(0.42);
  setTarget(presets.night, np.x, np.z, { yaw: rad(np.x - kop.x, np.z - kop.z) });

  // escarpment: foot of the cliff, mid-map, looking north
  setTarget(presets.escarpment, 0, f.escarpment.zLine + 60);

  // plains: keep the default anchor but make sure it's away from the river / pans (seed variance)
  const [px, pz] = presets.plains.camera.target;
  const pan = f.pans.find((p) => Math.hypot(p.x - px, p.z - pz) < p.r * 2.5);
  if (pan) setTarget(presets.plains, px + 120, pz - 60);

  // register the same views as rig presets so users can jump to them from the game
  for (const [name, p] of Object.entries(presets)) ctx.rig.registerPreset('terrain-' + name, { ...p.camera, tod: p.tod, description: p.description });
}
