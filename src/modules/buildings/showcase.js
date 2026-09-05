// Showcase for the buildings module.
//
// stage() generates the terrain first (so everything sits on real ground), scatters props so the
// lodge is not standing on bare dirt, lays a road in through the gate, then builds a complete lodge
// complex with the module's own place() — the same code path the build tool uses.

export const presets = {
  overview: {
    camera: { target: [0, 0], distance: 190, pitch: 24, yaw: 205 }, tod: 16,
    description: 'The whole lodge complex from the south-west at 16:00 — entrance gate and car park, '
      + 'the thatched safari lodge on its stone plinth, restaurant boma, gift shop, hide and viewing tower.',
  },
  lodge: {
    camera: { target: [0, 0], distance: 62, pitch: 12, yaw: 182 }, tod: 17.5,
    description: 'The safari lodge at 17:30: makuti thatch with a ragged noise-displaced eave, round '
      + 'timber poles carrying the veranda, stone plinth, plank deck and railings, plunge pool.',
  },
  gate: {
    camera: { target: [0, 0], distance: 34, pitch: 11, yaw: 180 }, tod: 10,
    description: 'The entrance gate at 10:00: twin coursed-rubble piers, a pole lintel under a small '
      + 'thatch roof, the carved park-name board, the thatched ticket kiosk and the boom.',
  },
  close: {
    camera: { target: [0, 0], distance: 6.5, pitch: 20, yaw: 0 }, tod: 16.5,
    description: 'The veranda-to-terrace stair in close-up: round timber posts on stone footings, '
      + 'plank decking and stair treads, timber railings, and the stone-paved terrace, with the '
      + 'plastered back wall and its clerestory windows beyond the columns.',
  },
  hide: {
    camera: { target: [0, 0], distance: 26, pitch: 10, yaw: 150 }, tod: 8,
    description: 'The hide on stilts in morning light: pole legs, plank deck, reed screen walls with '
      + 'the viewing slot, and a low thatch roof.',
  },
  night: {
    camera: { target: [0, 0], distance: 34, pitch: 14, yaw: 130 }, tod: 21.5,
    description: 'The lodge at 21:30 — emissive windows and veranda lanterns lit against the dark '
      + 'thatch and stone, restaurant fire glow beyond, stars overhead.',
  },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Bounding box of every put() offset below, relative to the site centre (CX,CZ), padded by each
// building's half-footprint. Every point in this box (sampled on a grid) must read as open, dry,
// gently sloping ground or the complex ends up standing in — or half-submerged by — the river, a
// pan or a kopje.
const SITE_BOX = { x0: -118, x1: 88, z0: -68, z1: 132 };

// Anything painted water/wetland/riverbed/rock is disqualifying; grass, dry grass, dirt and sand
// are all fine ground for a building complex (real lodges stand on packed earth, not just grass).
const BAD_BIOME = new Set([3, 5, 6]); // rock, wetland, riverbed

/**
 * Open, dry, reasonably flat ground for the whole complex footprint (SITE_BOX). Checked at the
 * centre plus the box's four corners and four edge midpoints (9 points: enough to catch the box
 * straddling the river, a pan or a kopje, without requiring the natural, patchy variation of real
 * savannah ground — the odd dirt patch, a slightly steeper knoll — to be perfectly absent across the
 * whole 200-odd-metre box). Each building's own canPlace() + terrain.flatten() still handle the
 * fine-grained slope of its own footprint; put() in stage() also nudges a single failing building
 * toward the site centre before giving up. This function only needs to pick a good neighbourhood.
 *
 * A handful of hand-picked anchor points is not reliable on a map this size — the river's ~85 m
 * meander plus three kopjes and two pans cover enough of the map that an unlucky anchor list can
 * come back completely empty (measured: 0/240 hits). Scanning a uniform grid over the whole
 * buildable area instead finds open ground wherever it actually is.
 */
function findSite(ctx, terrain) {
  const w = ctx.world;
  let best = null, bestScore = -1e9;
  const SCAN = w.half - 200;
  const STEP = 40;
  const bx = (SITE_BOX.x0 + SITE_BOX.x1) / 2, bz = (SITE_BOX.z0 + SITE_BOX.z1) / 2;
  const CHECKS = [
    [bx, bz],
    [SITE_BOX.x0, SITE_BOX.z0], [SITE_BOX.x1, SITE_BOX.z0], [SITE_BOX.x0, SITE_BOX.z1], [SITE_BOX.x1, SITE_BOX.z1],
    [bx, SITE_BOX.z0], [bx, SITE_BOX.z1], [SITE_BOX.x0, bz], [SITE_BOX.x1, bz],
  ];

  for (let z = -SCAN; z <= SCAN; z += STEP) {
    for (let x = -SCAN; x <= SCAN; x += STEP) {
      let ok = true, slopeSum = 0, minMargin = Infinity;
      for (const [gx, gz] of CHECKS) {
        const px = x + gx, pz = z + gz;
        if (!w.inBounds(px, pz)) { ok = false; break; }
        if (BAD_BIOME.has(w.biomeAt(px, pz))) { ok = false; break; }
        const h = w.getHeight(px, pz);
        const wl = terrain?.getWaterLevelAt ? terrain.getWaterLevelAt(px, pz) : w.terrain.waterLevel;
        const margin = h - wl;
        if (margin < minMargin) minMargin = margin;
        if (margin < 2.0) { ok = false; break; }
        const slope = w.getSlope(px, pz);
        if (slope > 0.30) { ok = false; break; }
        slopeSum += slope;
      }
      if (!ok) continue;
      const avgSlope = slopeSum / CHECKS.length;
      const score = -avgSlope * 140 + Math.min(minMargin, 30) * 0.3;
      if (score > bestScore) { bestScore = score; best = [x, z]; }
    }
  }
  if (!best) ctx.log.warn('[buildings] showcase: no open dry site found scanning the whole map; using the fallback anchor');
  return best || [80, 40];
}

export async function stage(ctx, presetName) {
  const B = ctx.modules.get('buildings');
  if (!B) return;
  const terrain = ctx.modules.get('terrain');
  const roads = ctx.modules.get('roads');
  const props = ctx.modules.get('props');
  const env = ctx.modules.get('environment');

  // 1. real ground first
  if (terrain && !terrain.getFeatures?.()) terrain.generate?.({ preset: 'savannah' });
  if (env) {
    env.setWeather({
      cloud: 0.20, rain: 0, haze: 0.30, season: 'dry', wind: { x: 1, z: 0.3, speed: 3.6 },
    }, { immediate: true });
  }

  const [CX, CZ] = findSite(ctx, terrain);
  B.clear();
  B.setParkName('MARA RIDGE');

  // 2. roads in from the south, through the gate, past the lodge
  const GATE_Z = CZ + 96;
  if (roads?.addRoad) {
    roads.clear?.();
    roads.addRoad([[CX, GATE_Z + 45], [CX, GATE_Z + 18], [CX, GATE_Z - 6]], 'gravel', 6.5);
    roads.addRoad([[CX, GATE_Z - 6], [CX + 4, CZ + 60], [CX + 2, CZ + 34]], 'gravel', 6);
    roads.addRoad([[CX + 2, CZ + 34], [CX + 26, CZ + 34], [CX + 38, CZ + 28]], 'dirt', 5);
    roads.addRoad([[CX + 2, CZ + 34], [CX - 30, CZ + 36], [CX - 46, CZ + 26]], 'dirt', 5);
    roads.addRoad([[CX - 46, CZ + 26], [CX - 62, CZ + 58], [CX - 68, CZ + 92]], 'dirt', 4.5);
    roads.addRoad([[CX + 38, CZ + 28], [CX + 62, CZ + 6], [CX + 70, CZ - 30]], 'dirt', 4.5);
  }

  // 3. props so the site reads as savannah, not bare dirt
  if (props?.scatter) {
    props.scatter({ rules: { acacia: { density: 1.15 } } });
    props.clear?.({ x0: CX - 46, z0: CZ - 26, x1: CX + 46, z1: CZ + 40 });   // the lodge terrace
    props.clear?.({ x0: CX - 14, z0: GATE_Z - 16, x1: CX + 22, z1: GATE_Z + 14 });
  }

  // 4. the complex — placed through the module's own API
  const put = (type, x, z, rot = 0) => {
    let chk = B.canPlace(type, x, z, rot, { ignoreRoads: true });
    if (chk.ok) return B.place(type, x, z, rot, { ignoreRoads: true });
    // findSite() cleared the whole complex box for water/rock/wetland, but a single footprint can
    // still fail on its own local slope (checked densely, pre-flatten) even inside a good site.
    // Nudge it toward the dry site centre in a few steps — terrain.flatten() then levels the
    // footprint — before giving up and forcing.
    for (const t of [0.25, 0.5, 0.75, 0.9]) {
      const nx = x + (CX - x) * t, nz = z + (CZ - z) * t;
      chk = B.canPlace(type, nx, nz, rot, { ignoreRoads: true });
      if (chk.ok) return B.place(type, nx, nz, rot, { ignoreRoads: true });
    }
    // A pure "occupied" failure means this exact spot collides with a building already placed this
    // call — nudging toward the centre only makes that more likely. Spiral out from the ORIGINAL
    // spot instead, at a few radii and angles, so a crowded corner of the layout finds open ground
    // right next to where it was meant to go, rather than moving toward the centre.
    for (const r of [8, 14, 20, 28]) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
        chk = B.canPlace(type, nx, nz, rot, { ignoreRoads: true });
        if (chk.ok) return B.place(type, nx, nz, rot, { ignoreRoads: true });
      }
    }
    ctx.log.warn(`[buildings] showcase: "${type}" at (${x.toFixed(0)},${z.toFixed(0)}) failed canPlace `
      + `(${chk.reasons.join(',')}) even after nudging and spiralling — forcing`);
    return B.place(type, x, z, rot, { force: true, ignoreRoads: true });
  };

  put('lodge', CX, CZ, 0);
  put('gate', CX, GATE_Z, 0);
  put('parking', CX + 33, GATE_Z - 22, 0);
  put('restaurant', CX - 44, CZ + 16, 0.30);
  put('shop', CX + 36, CZ + 22, -0.34);
  put('toilets', CX + 48, CZ + 40, -0.34);
  put('ranger', CX - 66, CZ + 62, 0.18);
  put('workshop', CX - 78, CZ + 88, 0.10);
  put('clinic', CX - 44, CZ + 92, -0.12);
  put('tower', CX - 26, CZ - 40, 0.5);
  put('hide', CX + 62, CZ - 36, -1.15);
  put('pump', CX + 76, CZ - 58, 0.4);
  put('feeder', CX + 34, CZ - 54, 0.2);
  put('fencegate', CX + 70, CZ - 12, 1.57);

  // tented camp east of the lodge, staff village to the west
  for (let i = 0; i < 4; i++) put('tent', CX + 26 + i * 9, CZ - 16 - i * 3.5, -0.5 + i * 0.12);
  for (let i = 0; i < 7; i++) {
    const row = Math.floor(i / 4), col = i % 4;
    put('house', CX - 104 + col * 15, CZ + 104 + row * 17, (col % 2 ? 0.12 : -0.1) + row * 0.05);
  }

  // 5. cameras onto what actually got built
  const lodge = B.findNearest('lodge', CX, CZ);
  const gate = B.findNearest('gate', CX, GATE_Z);
  const hide = B.findNearest('hide', CX + 62, CZ - 36);

  if (lodge) {
    presets.overview.camera.target = [lodge.x + 2, lodge.z + 26];
    presets.lodge.camera.target = [lodge.x, lodge.z + 4];
    presets.close.camera.target = [lodge.x, lodge.z + 11.3];
    presets.night.camera.target = [lodge.x + 2, lodge.z + 22];
  }
  if (gate) presets.gate.camera.target = [gate.x + 2.5, gate.z + 1];
  if (hide) presets.hide.camera.target = [hide.x, hide.z];

  for (const [name, p] of Object.entries(presets)) {
    ctx.rig.registerPreset('buildings-' + name, { ...p.camera, tod: p.tod, description: p.description });
  }

  const s = B.stats();
  ctx.log.info(`[buildings] staged ${s.buildings} buildings of ${s.types} types: `
    + `${s.drawCalls} draw calls, ${s.triangles} triangles (preset "${presetName}")`);
}
