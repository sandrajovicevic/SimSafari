// Showcase presets for props. stage() generates the terrain first (so props land on real heights and
// biomes), scatters the whole park with the module's own rules, then moves the preset cameras onto the
// features the seeded terrain actually produced.
import { PLANTS, PLANT_INDEX } from '../../core/Plants.js';

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
  plants: {
    camera: { target: [120, 300], distance: 145, pitch: 28, yaw: 200 }, tod: 13,
    description: 'All 10 P1 food-web plants side by side: four grass tussocks (red-oat, couch, '
      + 'lovegrass, sedge), aloe rosette and sour-plum bush, then umbrella thorn, knobthorn, marula '
      + 'and baobab, drawn from world.vegetation cover — staged test values (docs/specs/p1-food-web.md), '
      + 'not gameplay data',
  },
  unburnt: {
    camera: { target: [120, 300], distance: 230, pitch: 34, yaw: 200 }, tod: 14,
    description: 'Control for `burnt`: same view, same staged natural baseline, cover = natural everywhere '
      + '(the scatter drawn exactly as today)',
  },
  burnt: {
    camera: { target: [120, 300], distance: 230, pitch: 34, yaw: 200 }, tod: 14,
    description: 'Vegetation grid test: cover staged to 0 in a 60 m disc and to 35 % of natural in a ring out '
      + 'to 95 m — the biome scatter\'s trees, shrubs and grass follow world.vegetation (P2 fire prerequisite)',
  },
};

// STAGING ONLY (burnt / unburnt). Without `simulation` loaded the showcase has no natural baseline
// (world.vegetation.natural is all zeros → the scatter is drawn unchanged), so these presets stage a
// uniform baseline in BOTH natural and cover, then (burnt) cut cover in a disc + partial ring. props
// never writes world.vegetation anywhere else.
const BURN_BASE = { red_oat: 0.55, couch: 0.25, umbrella_thorn: 0.12, baobab: 0.05, knobthorn: 0.05, marula: 0.04, sour_plum: 0.1, aloe: 0.05 };
const BURN_R0 = 60, BURN_R1 = 95, BURN_RING = 0.35;

function stageBurn(ctx, w, cx, cz, burnt) {
  const v = w.vegetation, res = v.res, N = res * res, half = w.half;
  v.cover.fill(0);
  if (v.natural) v.natural.fill(0);
  for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
    const c = iz * res + ix;
    const x = (ix + 0.5) * v.cell - half, z = (iz + 0.5) * v.cell - half;
    const d = Math.hypot(x - cx, z - cz);
    const k = !burnt ? 1 : d < BURN_R0 ? 0 : d < BURN_R1 ? BURN_RING : 1;
    for (const [id, base] of Object.entries(BURN_BASE)) {
      const t = PLANT_INDEX[id];
      if (v.natural) v.natural[t * N + c] = base;
      v.cover[t * N + c] = base * k;
    }
  }
  v.version++;
  ctx.events.emit('vegetation:changed', { x0: -half, z0: -half, x1: half, z1: half });
}

// STAGING ONLY — see stageVegetationTestCover below. Local offsets (m) from the preset's camera
// target. Placement within a 16 m vegetation cell jitters across the WHOLE cell (real gameplay
// placement, not simplified for the showcase), so offsets are spaced ≥ 20 m apart — comfortably
// wider than one cell — to keep the ten plants in separate cells and stop worst-case jitter from
// dropping one species behind another (grass/shrub row in front, spaced-out tree row behind it).
const PLANT_STAGE_OFFSETS = {
  red_oat: [-50, -14], couch: [-30, -14], lovegrass: [-10, -14], sedge: [10, -14],
  aloe: [30, -14], sour_plum: [50, -14],
  umbrella_thorn: [-39, 14], knobthorn: [-13, 14], marula: [13, 14], baobab: [39, 14],
};

/**
 * STAGING ONLY. The simulation builder's world.vegetation seeding is on another branch and has not
 * landed here, so the grid is all zeros in the real game — props only ever READS world.vegetation
 * (docs/specs/p1-food-web.md §props). This writes test cover directly into it so the `plants` preset
 * has something to draw; it exists only in showcase.js, for this preset, and nowhere else in the
 * module.
 */
function stageVegetationTestCover(ctx, w, cx, cz) {
  const v = w.vegetation, res = v.res;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of PLANTS) {
    const [dx, dz] = PLANT_STAGE_OFFSETS[p.id];
    const x = cx + dx, z = cz + dz;
    const idx = w.vegCell(x, z);
    v.cover[PLANT_INDEX[p.id] * res * res + idx] = p.maxCover;
    x0 = Math.min(x0, x - 10); x1 = Math.max(x1, x + 10);
    z0 = Math.min(z0, z - 10); z1 = Math.max(z1, z + 10);
  }
  v.version++;
  ctx.events.emit('vegetation:changed', { x0, z0, x1, z1 });
}

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
  presets.plants.camera.target = [plain[0], plain[1] + 70];
  presets.burnt.camera.target = [plain[0] + 20, plain[1] - 20];
  presets.unburnt.camera.target = presets.burnt.camera.target;

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
  // a wooded patch so the burn reads in one frame (same RULES, higher density)
  if (presetName === 'burnt' || presetName === 'unburnt') { rules.acacia = { density: 2.4 }; rules.shrub = { density: 1.6 }; }
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

  if (presetName === 'plants') {
    const [px, pz] = presets.plants.camera.target;
    props.clear({ x0: px - 65, z0: pz - 35, x1: px + 65, z1: pz + 35 });
    stageVegetationTestCover(ctx, ctx.world, px, pz);
  }

  if (presetName === 'burnt' || presetName === 'unburnt') {
    const [bx, bz] = presets.burnt.camera.target;
    stageBurn(ctx, ctx.world, bx, bz, presetName === 'burnt');
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
