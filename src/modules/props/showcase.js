// Showcase presets for props. stage() generates the terrain first (so props land on real heights and
// biomes), scatters the whole park with the module's own rules, then moves the preset cameras onto the
// features the seeded terrain actually produced.

export const presets = {
  overview: {
    camera: { target: [120, 300], distance: 340, pitch: 20, yaw: 205 }, tod: 16.5,
    description: 'Acacia savannah at 16:30 — flat-topped umbrella thorns scattered across a golden grass plain, groves thickening toward the river, haze on the horizon',
  },
  grass: {
    camera: { target: [120, 340], distance: 8, pitch: 9, yaw: 250 }, tod: 17,
    description: 'Grass at 7 m, almost eye level: individual tufts, per-blade shading, colour drift from macro noise, blades swaying in the wind',
  },
  acacia: {
    camera: { target: [0, 0], distance: 30, pitch: 15, yaw: 220 }, tod: 15,
    description: 'One umbrella thorn acacia at 21 m: bare trunk, limbs spreading up and out, wide flat crown of bipinnate foliage, shadow on the grass',
  },
  kopje: {
    camera: { target: [-300, -190], distance: 95, pitch: 15, yaw: 300 }, tod: 17.5,
    description: 'Granite kopje: piled lichen-stained boulders, thorn scrub in the cracks, evening light raking across the rock',
  },
  riverine: {
    camera: { target: [0, 0], distance: 85, pitch: 10, yaw: 120 }, tod: 8,
    description: 'Riverine gallery in morning light: yellow-barked fever trees along the water, greener grass on the damp floodplain',
  },
  close: {
    camera: { target: [0, 0], distance: 15, pitch: 12, yaw: 210 }, tod: 16,
    description: 'Ground detail at 15 m: grass tufts, a thorn bush, a termite mound and a fallen log against dry-season grass',
  },
  night: {
    camera: { target: [120, 300], distance: 120, pitch: 12, yaw: 210 }, tod: 21.5,
    description: 'Moonlit savannah at 21:30: acacia silhouettes against the star field, grass reading as blue-grey texture',
  },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const degOf = (nx, nz) => (Math.atan2(nx, nz) * 180) / Math.PI;

/** Find open, dry, gently sloping plain away from the river and the kopjes. */
function findPlain(ctx, t, prefer = [120, 340]) {
  const w = ctx.world;
  const f = t?.getFeatures?.();
  let best = null, bestScore = -1e9;
  const cands = [prefer, [180, 250], [-120, 250], [250, -60], [-220, 90], [60, 150], [-60, -260], [300, 300]];
  for (const [px, pz] of cands) {
    for (let k = 0; k < 26; k++) {
      const x = clamp(px + (k % 6) * 34 - 85, -w.half + 60, w.half - 60);
      const z = clamp(pz + Math.floor(k / 6) * 34 - 68, -w.half + 60, w.half - 60);
      const h = w.getHeight(x, z);
      const wl = t?.getWaterLevelAt ? t.getWaterLevelAt(x, z) : w.terrain.waterLevel;
      if (h < wl + 2.5) continue;
      const slope = w.getSlope(x, z);
      if (slope > 0.10) continue;
      const b = w.biomeAt(x, z);
      if (b !== 1 && b !== 0) continue;
      let dKop = 1e9;
      if (f) for (const kp of f.kopjes) dKop = Math.min(dKop, Math.hypot(kp.x - x, kp.z - z) - kp.r);
      const m = t?.sampleMoisture ? t.sampleMoisture(x, z) : 0.3;
      const score = -slope * 40 + Math.min(dKop, 200) * 0.02 - Math.abs(m - 0.25) * 6;
      if (score > bestScore) { bestScore = score; best = [x, z]; }
    }
  }
  return best || prefer;
}

export async function stage(ctx, presetName) {
  const t = ctx.modules.get('terrain');
  const props = ctx.modules.get('props');
  const env = ctx.modules.get('environment');
  if (!props) return;

  // 1. terrain first: props must sit on real heights, slopes and biomes.
  //    terrain.init() already generated for this seed; only generate again if it somehow has not.
  if (t && !t.getFeatures?.()) t.generate?.({ preset: 'savannah' });
  const f = t?.getFeatures?.();

  if (env) {
    env.setWeather({ cloud: 0.22, rain: 0, haze: presetName === 'riverine' ? 0.42 : 0.34, season: 'dry', wind: { x: 1, z: 0.35, speed: 3.4 } }, { immediate: true });
  }

  // 2. camera anchors from the real feature layout
  const plain = findPlain(ctx, t, [120, 340]);
  presets.overview.camera.target = [plain[0], plain[1]];
  presets.grass.camera.target = [plain[0] + 6, plain[1] + 6];
  presets.night.camera.target = [plain[0], plain[1]];
  presets.close.camera.target = [plain[0] - 30, plain[1] - 25];
  presets.acacia.camera.target = [plain[0] + 40, plain[1] - 40];

  if (f) {
    const kop = [...f.kopjes].sort((a, b) => b.h - a.h)[0];
    presets.kopje.camera.target = [kop.x, kop.z];
    presets.kopje.camera.distance = Math.max(80, kop.r * 1.7);
    // riverine: stand back from a bend, look across the water
    const rp = f.pointOnRiver(0.46);
    const side = 1;
    presets.riverine.camera.target = [rp.x + rp.nx * (rp.hw + 6) * side, rp.z + rp.nz * (rp.hw + 6) * side];
    presets.riverine.camera.yaw = degOf(rp.nx * side, rp.nz * side) + 168;
    // overview: look from the open plain back toward the river gallery
    presets.overview.camera.yaw = degOf(plain[0] - rp.x, plain[1] - rp.z);
    presets.night.camera.yaw = presets.overview.camera.yaw;
  }

  // 3. scatter the whole park with the module's own rules
  const rules = {};
  if (presetName === 'overview' || presetName === 'night') rules.acacia = { density: 1.35 };
  props.scatter({ rules });

  // 4. preset extras
  if (presetName === 'acacia') {
    const [hx, hz] = presets.acacia.camera.target;
    props.clear({ x0: hx - 26, z0: hz - 26, x1: hx + 26, z1: hz + 26 });
    props.place('acacia', hx, hz, { variant: 0, scale: 1.12, rotY: 0.9 });
    props.place('shrub', hx + 9.5, hz + 5.5, { scale: 1.1 });
    props.place('shrub', hx - 11, hz - 7.5, { scale: 0.9 });
    props.place('termite', hx - 14, hz + 9, { scale: 1.15 });
    presets.acacia.camera.target = [hx, hz];
  }

  if (presetName === 'close') {
    const [cx, cz] = presets.close.camera.target;
    props.clear({ x0: cx - 18, z0: cz - 18, x1: cx + 18, z1: cz + 18 });
    props.place('termite', cx + 5.5, cz - 3.0, { scale: 1.25, variant: 0 });
    props.place('shrub', cx - 5.5, cz + 3.5, { scale: 1.3, variant: 0 });
    props.place('shrub', cx + 1.0, cz + 7.0, { scale: 0.85, variant: 1 });
    props.place('log', cx - 2.0, cz - 6.5, { scale: 1.1, rotY: 0.6 });
    props.place('boulder', cx + 9.0, cz + 6.0, { scale: 1.1 });
    props.place('acacia', cx - 16, cz - 15, { scale: 1.0 });
  }

  if (presetName === 'kopje') {
    // make sure the showcase kopje really is loaded with boulders and scrub
    const [kx, kz] = presets.kopje.camera.target;
    const r = presets.kopje.camera.distance * 0.55;
    props.scatter({
      region: { x0: kx - r, z0: kz - r, x1: kx + r, z1: kz + r },
      kinds: ['boulder', 'shrub', 'dead'],
      rules: { boulder: { density: 2.4 }, shrub: { density: 1.6 } },
      clear: false,
    });
  }

  if (presetName === 'riverine') {
    const [rx, rz] = presets.riverine.camera.target;
    props.scatter({
      region: { x0: rx - 130, z0: rz - 130, x1: rx + 130, z1: rz + 130 },
      kinds: ['fever', 'shrub'],
      rules: { fever: { density: 1.9 }, shrub: { density: 1.4 } },
      clear: false,
    });
  }

  // register the views as rig presets so the game can jump to them
  for (const [name, p] of Object.entries(presets)) {
    ctx.rig.registerPreset('props-' + name, { ...p.camera, tod: p.tod, description: p.description });
  }
  props.refresh();
}
