// savannah — showcase presets + stage(). Composes terrain, environment, props, animals, roads,
// traffic, effects and audio through their public APIs into one coherent 1024 m African savannah:
// a river with riverine forest, open golden grassland with scattered umbrella acacias, a granite
// kopje with a resting lion pride, a waterhole with elephants and giraffes, a zebra/wildebeest
// herd on the move, and a dirt track carrying one safari vehicle. See README.md for the honest
// per-preset verdict on what still reads as CG vs photography.
//
// Every stage() call rebuilds the whole world (a fresh page load per showcase preset, so there is
// no persistent state to preserve) and then re-anchors every preset's camera onto the real feature
// positions terrain generated for the active seed — the same pattern terrain/props/animals use in
// their own showcases, so the composition holds for any seed, not just seed 1.

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** yaw (degrees) that places the camera along direction (nx,nz) from its target, per CameraRig's convention. */
const degOf = (nx, nz) => Math.atan2(nx, nz) / DEG;

export const presets = {
  overview: {
    camera: { target: [0, 0], distance: 780, pitch: 40, yaw: 205 }, tod: 16.5,
    description: 'The whole composed world from height: river and gallery forest, golden grassland with acacias, a kopje, a waterhole, a herd on the move and a dirt track, all in one 1024 m scene.',
  },
  close: {
    camera: { target: [0, 0], distance: 15, pitch: 10, yaw: 205 }, tod: 16,
    description: 'Foreground grass and an acacia trunk at eye level, the kopje softening into haze behind.',
  },
  hero: {
    camera: { target: [0, 0], distance: 220, pitch: 12, yaw: 205 }, tod: 17.4,
    description: 'Golden hour, the flagship shot: an acacia in the left third, grazing herd across the middle distance, kopje silhouette on the horizon at the right third, warm haze layering the depth.',
  },
  waterhole: {
    camera: { target: [0, 0], distance: 40, pitch: 13, yaw: 100 }, tod: 8,
    description: 'Elephants and giraffes drinking at the waterhole in low morning light, zebra at the shore behind them.',
  },
  kopje: {
    camera: { target: [0, 0], distance: 74, pitch: 17, yaw: 300 }, tod: 17.8,
    description: 'The pride at the kopje\'s foot in golden-hour light: the lens sits just beyond the male on the sun-facing flank, looking away from the low sun, so he is three-quarter front-lit at ~8 m — mane and modelled flank against the boulder backdrop, lionesses resting in the grass around him (camera, light and a props-free sightline are re-derived from the male\'s real spawn each seed).',
  },
  herd: {
    camera: { target: [0, 0], distance: 34, pitch: 9, yaw: 220 }, tod: 16,
    description: 'Zebra and wildebeest crossing open grassland at eye level, dust catching the light.',
  },
  river: {
    camera: { target: [0, 0], distance: 92, pitch: 11, yaw: 130 }, tod: 9.5,
    description: 'Riverine gallery forest along the water in soft morning light.',
  },
  storm: {
    camera: { target: [0, 0], distance: 330, pitch: 22, yaw: 205 }, tod: 15,
    description: 'A storm gathering over the grassland: dark sky, rain approaching, the dirt track leading toward it.',
  },
  night: {
    camera: { target: [0, 0], distance: 44, pitch: 15, yaw: 110 }, tod: 22,
    description: 'Moonlit hippos at the waterhole, the herd asleep on the plain beyond.',
  },
  dawn: {
    camera: { target: [0, 0], distance: 120, pitch: 9, yaw: 130 }, tod: 6.3,
    description: 'Dawn mist over the river and grassland, the sun just above the escarpment.',
  },
};

// ---------------------------------------------------------------------------------------------
// World feature discovery — real positions when terrain exists, deterministic fallbacks otherwise.

function findKopje(f) {
  if (f?.kopjes?.length) return [...f.kopjes].sort((a, b) => b.h - a.h)[0];
  return { x: -260, z: -160, r: 40, h: 20 };
}

/** Grassland anchor away from the river/kopje/pans: open, dry/grass biome, gentle slope. */
function findGrassland(ctx, terrain, kopje, pan) {
  const w = ctx.world;
  const cands = [[160, 260], [220, 60], [-60, 200], [260, -160], [40, 320], [-200, 40], [120, -220]];
  let best = null, bestScore = -Infinity;
  for (const [px, pz] of cands) {
    for (let k = 0; k < 9; k++) {
      const x = clamp(px + (k % 3) * 40 - 40, -w.half + 60, w.half - 60);
      const z = clamp(pz + Math.floor(k / 3) * 40 - 40, -w.half + 60, w.half - 60);
      if (!w.inBounds?.(x, z)) continue;
      const h = w.getHeight(x, z);
      const wl = terrain?.getWaterLevelAt ? terrain.getWaterLevelAt(x, z) : w.terrain.waterLevel;
      if (h < wl + 2) continue;
      const slope = w.getSlope(x, z);
      if (slope > 0.11) continue;
      const b = w.biomeAt(x, z);
      if (b !== 0 && b !== 1) continue;
      const dKop = Math.hypot(kopje.x - x, kopje.z - z) - kopje.r;
      const dPan = pan ? Math.hypot(pan.x - x, pan.z - z) - pan.r : 200;
      const score = -slope * 30 + Math.min(dKop, 220) * 0.01 + Math.min(dPan, 180) * 0.015;
      if (score > bestScore) { bestScore = score; best = [x, z]; }
    }
  }
  return best || [160, 260];
}

/** A pan farthest from the kopje (cleaner composition), or a calm river bend if this seed made no pans. */
function findWaterSpot(f, kopje) {
  if (f?.pans?.length) {
    let best = null, bestScore = -Infinity;
    for (const p of f.pans) {
      const d = Math.hypot(p.x - kopje.x, p.z - kopje.z);
      if (d > bestScore) { bestScore = d; best = p; }
    }
    return { x: best.x, z: best.z, r: best.r, kind: 'pan' };
  }
  if (f?.pointOnRiver) {
    const rp = f.pointOnRiver(0.74);
    return { x: rp.x + rp.nx * (rp.hw + 10), z: rp.z + rp.nz * (rp.hw + 10), r: 16, kind: 'river-bank' };
  }
  return { x: 150, z: -60, r: 22, kind: 'fallback' };
}

/** March outward from a water body's centre in `n` directions to find real shore points. */
function shorePoints(ctx, terrain, spot, n = 10) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2;
    let d = spot.r * 0.25;
    const isWater = (x, z) => (terrain?.isWaterAt ? terrain.isWaterAt(x, z) : d < spot.r);
    while (d < spot.r * 2.5 && isWater(spot.x + Math.cos(ang) * d, spot.z + Math.sin(ang) * d)) d += 1.4;
    pts.push({ x: spot.x + Math.cos(ang) * (d + 2.2), z: spot.z + Math.sin(ang) * (d + 2.2), ang });
  }
  return pts;
}

function towards(x, z, tx, tz) { return Math.atan2(tx - x, tz - z); }
function aim(P, x, z) { if (P?.camera?.target) { P.camera.target[0] = x; P.camera.target[1] = z; } }

// ---------------------------------------------------------------------------------------------

export async function stage(ctx, presetName) {
  const terrain = ctx.modules.get('terrain');
  const props = ctx.modules.get('props');
  const animals = ctx.modules.get('animals');
  const environment = ctx.modules.get('environment');
  const roads = ctx.modules.get('roads');
  const traffic = ctx.modules.get('traffic');
  const effects = ctx.modules.get('effects');

  // 1. Terrain first — everything else needs real heights/biomes/water to sit on.
  if (terrain && !terrain.getFeatures?.()) { try { await terrain.generate({ preset: 'savannah' }); } catch (err) { ctx.log.error('[savannah] terrain.generate failed', err); } }
  const f = terrain?.getFeatures?.() || null;

  const kopje = findKopje(f);
  const water = findWaterSpot(f, kopje);
  const [gx, gz] = findGrassland(ctx, terrain, kopje, water);
  const riverMid = f?.pointOnRiver ? f.pointOnRiver(0.5) : { x: 0, z: 0, nx: 1, nz: 0, tx: 0, tz: 1, hw: 15 };
  const riverGallery = f?.pointOnRiver ? f.pointOnRiver(0.34) : riverMid;

  // 2. Weather / time-of-day art direction per preset. Golden-hour default: light haze, a few clouds,
  //    dry season, gentle wind. storm/night/dawn get their own regime.
  if (environment) {
    const W = {
      overview: { cloud: 0.28, rain: 0, haze: 0.34, season: 'dry', wind: { x: 1, z: 0.3, speed: 3.2 } },
      close:    { cloud: 0.24, rain: 0, haze: 0.26, season: 'dry', wind: { x: 1, z: 0.3, speed: 2.4 } },
      hero:     { cloud: 0.30, rain: 0, haze: 0.40, season: 'dry', wind: { x: 1, z: 0.35, speed: 3.6 } },
      waterhole:{ cloud: 0.32, rain: 0, haze: 0.30, season: 'dry', wind: { x: 0.6, z: 1, speed: 2.0 } },
      kopje:    { cloud: 0.26, rain: 0, haze: 0.38, season: 'dry', wind: { x: 1, z: 0.2, speed: 3.0 } },
      herd:     { cloud: 0.30, rain: 0, haze: 0.36, season: 'dry', wind: { x: 1, z: 0.4, speed: 4.2 } },
      river:    { cloud: 0.34, rain: 0, haze: 0.30, season: 'wet', wind: { x: 0.4, z: 1, speed: 1.6 } },
      storm:    { cloud: 0.95, rain: 0.35, haze: 0.5, season: 'wet', wind: { x: 0.7, z: 1, speed: 9.5 } },
      night:    { cloud: 0.16, rain: 0, haze: 0.20, season: 'dry', wind: { x: 0.5, z: 0.5, speed: 1.4 } },
      dawn:     { cloud: 0.24, rain: 0, haze: 0.6, season: 'dry', wind: { x: 0.3, z: 1, speed: 1.0 } },
    }[presetName] || { cloud: 0.28, rain: 0, haze: 0.34, season: 'dry', wind: { x: 1, z: 0.3, speed: 3.2 } };
    environment.setWeather(W, { immediate: true });
  }
  if (effects) { try { effects.setAmbientDust(-1); } catch { /* optional */ } }

  // 3. Vegetation — one persistent world: grassland+acacias everywhere, reinforced riverine gallery
  //    and kopje scrub, exactly as props' own showcase reinforces its kopje/riverine presets.
  if (props) {
    props.scatter({ rules: { acacia: { density: 1.25 } } });
    props.scatter({
      region: { x0: kopje.x - kopje.r * 2.6, z0: kopje.z - kopje.r * 2.6, x1: kopje.x + kopje.r * 2.6, z1: kopje.z + kopje.r * 2.6 },
      kinds: ['boulder', 'shrub', 'dead'],
      rules: { boulder: { density: 2.2 }, shrub: { density: 1.6 } },
      clear: false,
    });
    props.scatter({
      region: { x0: riverGallery.x - 150, z0: riverGallery.z - 150, x1: riverGallery.x + 150, z1: riverGallery.z + 150 },
      kinds: ['fever', 'shrub'],
      rules: { fever: { density: 1.9 }, shrub: { density: 1.3 } },
      clear: false,
    });
  }

  // 4. A dirt track: from the grassland, past the kopje, across the river (roads builds a bridge
  //    automatically wherever the polyline crosses water). The final leg toward the waterhole is only
  //    added if it stays dry: when the straight line clips the pan, roads would build its auto-bridge
  //    straight through the drinking scene (verified on seed 1, waterhole-8 shot) and a wild
  //    waterhole should not carry a road bridge.
  let roadEdgeId = null, roadS = 0;
  if (roads) {
    const kopjeApproach = { x: kopje.x + (kopje.r + 55) * Math.cos(0.6), z: kopje.z + (kopje.r + 55) * Math.sin(0.6) };
    const crossing = { x: riverMid.x + riverMid.tx * 40, z: riverMid.z + riverMid.tz * 40 };
    const waterApproach = { x: water.x + water.r * 2.4, z: water.z - water.r * 0.6 };
    const isWater = (x, z) => (terrain?.isWaterAt ? terrain.isWaterAt(x, z) : false);
    let legWet = 0;
    for (let k = 1; k < 12; k++) {
      const t = k / 12;
      if (isWater(crossing.x + (waterApproach.x - crossing.x) * t, crossing.z + (waterApproach.z - crossing.z) * t)) legWet++;
    }
    const pts = [[gx + 90, gz - 40], [kopjeApproach.x, kopjeApproach.z], [crossing.x, crossing.z]];
    if (legWet <= 1) pts.push([waterApproach.x, waterApproach.z]);
    try {
      roads.addRoad(pts, 'dirt');
      const near = roads.nearestEdge(kopjeApproach.x, kopjeApproach.z, 400);
      if (near) { roadEdgeId = near.edge.id; roadS = near.s; }
    } catch (err) { ctx.log.error('[savannah] roads.addRoad failed', err); }
  }
  if (traffic && roadEdgeId != null) {
    try { traffic.spawn('safari', roadEdgeId, clamp(roadS, 6, Math.max(6, (roads.getEdge(roadEdgeId)?.length || 20) - 6))); } catch (err) { ctx.log.error('[savannah] traffic.spawn failed', err); }
  }

  // 5. Animals — one persistent cast: lion pride on the kopje, elephants/giraffes/zebra at the
  //    waterhole, a zebra/wildebeest/impala herd on the grassland, hippos at the waterhole for night.
  //    (prideBrg lives at stage scope: the kopje preset's camera is staged off the male's position.)
  //    Radii > 1.0: the pride stands on the grass at the kopje's foot — inside the boulder mass the
  //    cats end up occluded by the very rocks they're standing on (verified seed 1, kopje-17.8).
  //    All five share ONE bearing (the old ring spread them ~344° around the rock, so at most one
  //    lion could ever share a frame): the male sits closest to the lens in the head-high 'alert'
  //    sentry pose (anim.js raises neck/head/ears on _alertW), two lionesses stand behind him and
  //    two lie in the grass deeper in — a pride at rest with its sentry, all inside one frame.
  //
  //    WHICH flank comes from the LIGHT, not the rock. At the preset's 17.8 h the sun sits WNW and
  //    only ~2° up (environment/atmosphere.js celestialDirection with the dry-season declination).
  //    The old east-flank staging (prideBrg 0.9) put the lens on the sun side looking back INTO
  //    that low sun: the male was unoccluded and in frame (kopje-fix-a/-b/-c) but backlit into a
  //    pale flat box nobody reads as a lion. Staging the pride on the SUN-FACING flank with the
  //    lens just beyond the male on the same bearing line means the camera looks straight AWAY
  //    from the sun: he is front-lit warm and the sun itself stays behind the lens, never in
  //    frame. The bearing is seeded 0.35 rad (~20°) off the sun so the light rakes across him at
  //    a three-quarter angle — dead-centre front light is what flattened him into a pale box
  //    (sav-kopje-baseline). The formula is environment's own sun geometry evaluated at the
  //    preset hour (same numbers as celestialDirection).
  //    The spot itself must be DRY and FLAT: a cat planted on a >0.14 slope ends up heel-deep
  //    behind his own ledge (verified sav-kopje-baseline — legs occluded by a lip at the kopje
  //    foot). If the seeded spot fails, walk the bearing around the rock until one passes both
  //    tests; 1.18 r sits on the flattened skirt just outside the boulder crest.
  const Hs = (presets.kopje.tod - 12) * 15 * DEG, dcl = 17 * DEG, lat = -2.3 * DEG;
  const sunAz = Math.atan2(
    -Math.cos(dcl) * Math.sin(Hs),
    -(Math.cos(lat) * Math.sin(dcl) - Math.sin(lat) * Math.cos(dcl) * Math.cos(Hs)),
  );
  const spotOK = (brg, rr) => {
    const x = kopje.x + Math.sin(brg) * kopje.r * rr, z = kopje.z + Math.cos(brg) * kopje.r * rr;
    const wl = terrain?.getWaterLevelAt ? terrain.getWaterLevelAt(x, z) : ctx.world.terrain.waterLevel;
    if (terrain?.isWaterAt?.(x, z) || ctx.world.getHeight(x, z) <= wl + 1.2) return false;
    return ctx.world.getSlope(x, z) < 0.14;
  };
  const seedBrg = sunAz + 0.35;
  let prideBrg = seedBrg;
  for (const off of [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0, Math.PI]) {
    if (spotOK(seedBrg + off, 1.18)) { prideBrg = seedBrg + off; break; }
  }
  // spots are [radiusMultiple, bearingOffset] in the yaw convention (x = sin, z = cos), so the
  // camera block below can reuse prideBrg directly; smaller radii sit deeper, toward the rock.
  const lionSpots = [[1.18, 0], [1.12, 0.09], [1.14, -0.09], [1.07, 0.18], [1.05, -0.2]];
  if (animals) {
    animals.clear();
    const hold = 1e6;
    const shores = shorePoints(ctx, terrain, water, 10);

    // -- kopje: lion pride on the lower flanks of the boulder pile
    for (let i = 0; i < lionSpots.length; i++) {
      const [rr, off] = lionSpots[i];
      const brg = prideBrg + off;
      const x = kopje.x + Math.sin(brg) * kopje.r * rr, z = kopje.z + Math.cos(brg) * kopje.r * rr;
      const st = i === 0 ? 'alert' : i === 1 ? 'idle' : i === 2 ? 'rest' : i === 3 ? 'sleep' : 'rest';
      // heading: tangent to the ring = profile to the lens; the male breaks the rectangle
      // silhouette with a +0.6 rad three-quarter turn so the mane reads as mass, not a box
      // (spawn jitters every heading by ±0.35 rad — still safely off head-on and tail-on).
      const heading = towards(x, z, kopje.x, kopje.z) + Math.PI * 0.5 + (i === 0 ? 0.6 : 0);
      animals.spawn('lion', x, z, 1, { heading, state: st, hold, sex: i === 0 ? 'male' : 'female' });
    }

    // -- waterhole: elephants + giraffes drinking, zebra at the shore
    for (const s of [shores[0], shores[2], shores[4]]) {
      animals.spawn('elephant', s.x, s.z, 1, { heading: towards(s.x, s.z, water.x, water.z), state: 'drink', hold });
    }
    const gA = shores[6], gB = shores[7];
    animals.spawn('giraffe', gA.x, gA.z, 1, { heading: towards(gA.x, gA.z, water.x, water.z), state: 'drink', hold, sex: 'male' });
    animals.spawn('giraffe', gB.x, gB.z, 1, { heading: towards(gB.x, gB.z, water.x, water.z) + 0.5, state: 'idle', hold });
    const zw = shores[8];
    animals.spawn('zebra', zw.x, zw.z, 4, { heading: towards(zw.x, zw.z, water.x, water.z), state: 'drink', hold, spread: 4 });
    animals.spawn('warthog', water.x + water.r * 1.8, water.z + water.r * 1.4, 3, { state: 'graze', hold, spread: 3 });
    animals.addWaterPoint?.(water.x, water.z, 1, 0);

    // -- grassland herd on the move
    const herdYaw = presets.herd.camera.yaw;
    const dir = herdYaw * DEG + Math.PI / 2 - 0.15;
    const dx = Math.sin(dir), dz = Math.cos(dir);
    animals.spawn('zebra', gx - 6 + dx * -8, gz + 6 + dz * -8, 12, { heading: dir, state: 'walk', hold, target: [gx - 6 + dx * 110, gz + 6 + dz * 110], spread: 10 });
    animals.spawn('wildebeest', gx + 12 + dx * 5, gz - 8 + dz * 5, 16, { heading: dir + 0.12, state: 'walk', hold, target: [gx + 12 + dx * 110, gz - 8 + dz * 110], spread: 12 });
    animals.spawn('impala', gx - 30, gz - 40, 9, { state: 'graze', hold, spread: 9 });
    animals.spawn('ostrich', gx + 40, gz + 30, 3, { state: 'graze', hold, spread: 6 });

    // -- night: hippos at the waterhole
    if (presetName === 'night') {
      const out = (ang, d, st) => {
        const x = water.x + Math.cos(ang) * (water.r + d), z = water.z + Math.sin(ang) * (water.r + d);
        animals.spawn('hippo', x, z, 1, { heading: towards(water.x, water.z, x, z), state: st, hold });
      };
      out(-0.4, 1.5, 'walk'); out(0.1, 4, 'walk'); out(0.5, 2, 'idle'); out(-0.9, -2.5, 'graze'); out(0.85, -3.5, 'idle');
    }
  }

  // 6. Camera anchors — real feature positions, rule-of-thirds framing per preset.
  aim(presets.overview, gx - 60, gz - 40);
  presets.overview.camera.yaw = degOf(gx - kopje.x, gz - kopje.z) + 20;
  aim(presets.close, gx, gz);
  // hero: close enough that the walking herd reads as animals (at 220 m a zebra is ~10 px) —
  // frame the herd's own spawn line with the kopje silhouette beyond it.
  presets.hero.camera.distance = 130;
  aim(presets.hero, gx - 6, gz + 6);
  presets.hero.camera.yaw = degOf(gx - kopje.x, gz - kopje.z) + 8;
  aim(presets.waterhole, water.x + water.r * 0.3, water.z - water.r * 0.2);
  // kopje: stage the shot around the pride's MALE. Camera sits just beyond him on the rock-outward
  // line, looking back: he reads large with the boulder mass directly behind (the old aims used
  // the pride MEAN, but the mean of a ring sits inside the rock and no camera there can work).
  // The bearing itself is chosen in section 5 — the sun-facing flank seeded 20° off the sun — so
  // this backlook has the low golden-hour sun behind the lens raking across the male at three
  // quarters. Distances are LION-SCALE — a lion is ~1.2 m at the shoulder, so the march starts at
  // 8 m (the hero fix showed the same lesson: at 220 m a zebra is ~10 px; and at 12-16 m the
  // male still read as an ambiguous tan quadruped — the mane and tail tuft only carry from
  // ~8-10 m; verified kopje-fix-a/-fix-b vs the 7 m diagnostic). The camera spot must also be
  // FLAT (<0.18 slope): a lens parked on the steep skirt stares into a rock wall that swallows
  // half the frame (verified sav-kopje-baseline).
  // The heightfield LOS march can only see terrain, never props, and the round-2 shot proved the
  // subject can still hide behind a staged shrub — so after picking the camera we carve a
  // props-free staging ground with props.clear:
  //   • a sightline corridor of overlapping rects (±3.5 m) from 4 m behind the lens to 1.2 m
  //     short of the male — on open golden grass the ~7 m lane reads as a game trail;
  //   • a 9 m patch centred on the male: tall dead shrubs rooted OUTSIDE a small patch still
  //     lean their branches across the subject (verified sav-kopje-baseline — a branch crossed
  //     the male from a root 3 m off the lane);
  //   • a 5 m patch on each lioness so no shrub swallows a resting cat;
  //   • a 20 m fore-court at the lens itself: boulders rooted within ~10 m of the camera loom
  //     into the frame edge even when well off-axis (the giant rock filling the left half of
  //     sav-kopje-baseline was rooted beside the camera).
  // The boulders BEHIND the male stay — they are the backdrop. All clearing is showcase-only
  // staging inside this module; wild behaviour never sees it.
  {
    const P = presets.kopje;
    const world = ctx.world;
    const lions = [...world.animals.values()].filter((a) => a.species === 'lion');
    const hero = lions.find((a) => a.sex === 'male') || lions[0];
    if (hero) {
      P.camera.yaw = degOf(hero.x - kopje.x, hero.z - kopje.z);
      P.camera.pitch = 10;
      const losClear = (px, py, pz) => {
        const ty = world.getHeight(hero.x, hero.z) + 0.7;
        for (let i = 1; i < 12; i++) {
          const t = i / 12;
          if (world.getHeight(px + (hero.x - px) * t, pz + (hero.z - pz) * t) + 0.4 > py + (ty - py) * t) return false;
        }
        return true;
      };
      for (const d of [8, 11, 15, 21, 30]) {
        const cp = Math.cos(P.camera.pitch * DEG), sp = Math.sin(P.camera.pitch * DEG);
        const px = hero.x + Math.sin(P.camera.yaw * DEG) * cp * d, pz = hero.z + Math.cos(P.camera.yaw * DEG) * cp * d;
        let py = world.getHeight(hero.x, hero.z) + sp * d;
        const ground = world.getHeight(px, pz);
        if (py < ground + 1.7) py = ground + 1.7;
        P.camera.distance = d;
        if (losClear(px, py, pz) && world.getSlope(px, pz) < 0.18) break;
      }
      aim(P, hero.x, hero.z);
      if (props?.clear) {
        const sy = Math.sin(P.camera.yaw * DEG), cy = Math.cos(P.camera.yaw * DEG);
        const cp = Math.cos(P.camera.pitch * DEG);
        const camX = hero.x + sy * cp * P.camera.distance, camZ = hero.z + cy * cp * P.camera.distance;
        const ax = camX - sy * 4, az = camZ - cy * 4; // start 4 m behind the camera
        const bx = hero.x - sy * 1.2, bz = hero.z - cy * 1.2; // stop short of the male
        const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
          props.clear({ x0: cx - 3.5, z0: cz - 3.5, x1: cx + 3.5, z1: cz + 3.5 });
        }
        props.clear({ x0: hero.x - 4.5, z0: hero.z - 4.5, x1: hero.x + 4.5, z1: hero.z + 4.5 });
        for (const a of lions) {
          if (a === hero) continue;
          props.clear({ x0: a.x - 2.5, z0: a.z - 2.5, x1: a.x + 2.5, z1: a.z + 2.5 });
        }
        props.clear({ x0: camX - 10, z0: camZ - 10, x1: camX + 10, z1: camZ + 10 });
      }
    }
  }
  aim(presets.herd, gx, gz);
  // river: shoot from ON the water looking down the channel — the old bank-side aim sat inside the
  // riverine scatter box and framed a wall of leaves with no river in it (verified seed 1, river-9.5).
  {
    const ahead = f?.pointOnRiver ? f.pointOnRiver(0.30) : riverGallery;
    presets.river.camera.distance = 58;
    presets.river.camera.pitch = 8;
    presets.river.camera.yaw = degOf(ahead.x - riverGallery.x, ahead.z - riverGallery.z);
    aim(presets.river, riverGallery.x, riverGallery.z);
  }
  aim(presets.storm, gx - 40, gz - 20);
  presets.storm.camera.yaw = degOf(gx - kopje.x, gz - kopje.z) + 20;
  aim(presets.night, water.x + water.r * 0.4, water.z);
  const dawnP = f?.pointOnRiver ? f.pointOnRiver(0.6) : riverMid;
  aim(presets.dawn, dawnP.x + dawnP.nx * (dawnP.hw + 8), dawnP.z + dawnP.nz * (dawnP.hw + 8));
  presets.dawn.camera.yaw = degOf(dawnP.nx, dawnP.nz) + 160;

  // register the views as rig presets so the full game can jump to them
  for (const [name, p] of Object.entries(presets)) {
    ctx.rig.registerPreset('savannah-' + name, { ...p.camera, tod: p.tod, description: p.description });
  }
  props?.refresh?.();
}
