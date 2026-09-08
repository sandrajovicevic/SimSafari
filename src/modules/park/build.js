// park/build.js — builds the complete playable demo park through every module's public API.
// No pointer events, no `tools`: this seeds the actual game state directly (the same idiom
// buildings/zoning/props' own showcases use), then documents itself so the whole thing is honest
// about what it assumed. Deterministic: every random draw comes from `ctx.rng` forks.
import { ZONE } from '../../core/World.js';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------
// generic helpers
// ---------------------------------------------------------------------------------------------

function dist(x1, z1, x2, z2) { return Math.hypot(x1 - x2, z1 - z2); }
function clampHalf(v, half, margin = 8) { return v < -half + margin ? -half + margin : v > half - margin ? half - margin : v; }

function validGround(world, x, z, maxSlopeDeg = 10) {
  if (!world.inBounds(x, z)) return false;
  if (world.isWater(x, z)) return false;
  return (world.getSlope(x, z) / DEG) <= maxSlopeDeg;
}

/** Spiral-search a valid (non-water, gentle-slope) point around (cx,cz). Falls back to (cx,cz) itself. */
function findSpot(world, cx, cz, rng, { tries = 60, spread = 90, maxSlopeDeg = 10, extra } = {}) {
  for (let i = 0; i < tries; i++) {
    const rad = i === 0 ? 0 : rng.range(6, spread);
    const ang = rng.range(0, Math.PI * 2);
    const x = clampHalf(cx + Math.cos(ang) * rad, world.half);
    const z = clampHalf(cz + Math.sin(ang) * rad, world.half);
    if (!validGround(world, x, z, maxSlopeDeg)) continue;
    if (extra && !extra(x, z)) continue;
    return { x, z, forced: false };
  }
  return { x: clampHalf(cx, world.half), z: clampHalf(cz, world.half), forced: true };
}

/** Spiral-search a valid building placement around (cx,cz) using the real canPlace() rule set.
 * `facing: {x,z}` (a habitat anchor, say) makes the building's local +Z front face that point —
 * matching the heading convention used project-wide (atan2(dx,dz), z+ = south) — instead of a fixed
 * or random `rot`; used for hides/the tower so their viewing side actually faces what it overlooks. */
function placeBuilding(ctx, buildings, type, cx, cz, rng, { tries = 60, spread = 70, rot, facing } = {}) {
  const half = ctx.world.half;
  const rotAt = (x, z) => (facing ? Math.atan2(facing.x - x, facing.z - z) : rot !== undefined ? rot : rng.pick([0, Math.PI / 2, Math.PI, Math.PI * 1.5]));
  for (let i = 0; i < tries; i++) {
    const rad = i === 0 ? 0 : rng.range(6, spread);
    const ang = rng.range(0, Math.PI * 2);
    const x = clampHalf(cx + Math.cos(ang) * rad, half);
    const z = clampHalf(cz + Math.sin(ang) * rad, half);
    const r = rotAt(x, z);
    if (buildings.canPlace(type, x, z, r).ok) {
      const id = buildings.place(type, x, z, r, { flatten: true });
      if (id) return { id, x, z, rot: r, forced: false };
    }
  }
  const r = rotAt(cx, cz);
  const id = buildings.place(type, cx, cz, r, { force: true, flatten: true });
  return { id, x: cx, z: cz, rot: r, forced: true };
}

/** Nearest distance from (x,z) to any kopje's rock (negative = inside it). */
function distToKopjes(x, z, features) {
  if (!features?.kopjes?.length) return Infinity;
  let best = Infinity;
  for (const k of features.kopjes) best = Math.min(best, dist(x, z, k.x, k.z) - k.r);
  return best;
}
/** Nearest distance from (x,z) to the river centreline (sampled) or any pan. */
function distToWater(x, z, features) {
  let best = Infinity;
  if (features?.river) {
    for (let t = 0; t <= 1; t += 0.04) {
      const p = features.pointOnRiver(t);
      best = Math.min(best, dist(x, z, p.x, p.z) - p.hw);
    }
  }
  if (features?.pans) for (const p of features.pans) best = Math.min(best, dist(x, z, p.x, p.z) - p.r);
  return best;
}

/** Largest kopje in the feature set, or null. */
function biggestKopje(features) {
  if (!features?.kopjes?.length) return null;
  let best = features.kopjes[0];
  for (const k of features.kopjes) if (k.r > best.r) best = k;
  return best;
}

/** A point beside the river (not in the channel) roughly at parametric t, biased toward whichever
 * bank is dry ground. Falls back to null if there is no river. */
function pointBesideRiver(world, features, t) {
  if (!features?.river) return null;
  const p = features.pointOnRiver(t);
  const margin = p.hw + 45;
  for (const sign of [1, -1]) {
    const x = p.x + p.nx * margin * sign, z = p.z + p.nz * margin * sign;
    if (world.inBounds(x, z) && !world.isWater(x, z)) return { x, z };
  }
  return { x: p.x + p.nx * margin, z: p.z + p.nz * margin };
}

// ---------------------------------------------------------------------------------------------
// road network
// ---------------------------------------------------------------------------------------------

/** Build a closed hexagonal gravel loop from 6 nudged vertices. Returns { verts, nodeIds }. */
function buildLoop(ctx, roads, rng, center, radiusX, radiusZ) {
  const world = ctx.world;
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const ang = (90 + i * 60) * DEG; // start due "south" (toward the lodge), then around
    const cx = center.x + Math.cos(ang) * radiusX, cz = center.z + Math.sin(ang) * radiusZ;
    verts.push(findSpot(world, cx, cz, rng, { spread: 55, maxSlopeDeg: 12 }));
  }
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const mid = { x: (a.x + b.x) / 2 + rng.range(-20, 20), z: (a.z + b.z) / 2 + rng.range(-20, 20) };
    roads.addRoad([[a.x, a.z], [mid.x, mid.z], [b.x, b.z]], 'gravel');
  }
  const nodeIds = verts.map((v) => roads.nearestNode(v.x, v.z, 8)?.id ?? null);
  return { verts, nodeIds };
}

function addSpur(ctx, roads, rng, from, to, kind = 'dirt') {
  const mid = { x: (from.x + to.x) / 2 + rng.range(-15, 15), z: (from.z + to.z) / 2 + rng.range(-15, 15) };
  roads.addRoad([[from.x, from.z], [mid.x, mid.z], [to.x, to.z]], kind);
  return roads.nearestNode(to.x, to.z, 10)?.id ?? null;
}

/** The habitat region whose sampled cells lie nearest to (x,z), within maxDist — used to resolve a
 * painted habitat def to its real flood-filled region (the disc can fragment; see buildPark step 5).
 * `claimed` holds region ids already owned by another def: regions are connectivity-based, so a def
 * must never resolve to — or rename — another def's region. */
function regionNear(zoning, world, x, z, maxDist, claimed) {
  const gres = world.grid.res, gcell = world.grid.cell, half = world.half;
  let best = null, bestD = maxDist;
  for (const h of zoning.listHabitats()) {
    if (claimed?.has(h.id)) continue;
    const cells = h.cells || [];
    const step = Math.max(1, Math.floor(cells.length / 32));
    for (let i = 0; i < cells.length; i += step) {
      const idx = cells[i], ix = idx % gres, iz = (idx - ix) / gres;
      const cx = (ix + 0.5) * gcell - half, cz = (iz + 0.5) * gcell - half;
      const d = dist(x, z, cx, cz);
      if (d < bestD) { bestD = d; best = h; }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// main build
// ---------------------------------------------------------------------------------------------

const SPECIES = {
  // Round-3 content growth (2026-09-08): 8 → 11 species. Variety is the satisfaction term the sim
  // weights highest that content can move (variety = Σ sighting-probability / 7), and attraction
  // feeds arrivals; rhino/ostrich/warthog are cheap feed, small herds, and their enclosure space
  // clears tables.space with room to breed (plains ≈ 31 k m²: rhino cap 6, ostrich cap 26).
  plains: [['zebra', 10], ['wildebeest', 10], ['impala', 14], ['ostrich', 6], ['rhino', 2]],
  browsers: [['giraffe', 4], ['elephant', 5], ['warthog', 6]],
  // the pride shares its kopje habitat with impala: the sim's predator score is prey/(predators×8),
  // so a prey-less kopje is unliveable by construction (the round-1 demo lost all 5 lions inside
  // 12 days). predation is gentle — one kill per lion per ~33 days (tables.predationRate 0.03).
  // Impala 10 → 14 lifts the lions' prey score 0.42 → 0.58 now that a pump lifted their water term.
  predators: [['lion', 3], ['impala', 14]],
  // herds are sized to their enclosure: the wetland region is bankside strips (the channel is
  // NO_BUILD), and buffalo at 8 in it carried a −0.6 overcrowding penalty on happiness
  wetland: [['hippo', 3], ['buffalo', 3]],
};

export async function buildPark(ctx, opts = {}) {
  const world = ctx.world;
  const half = world.half;
  const rng = ctx.rng.fork('park:' + (opts.seed ?? world.seed));
  const log = ctx.log;

  const terrain = ctx.modules.get('terrain');
  const roads = ctx.modules.get('roads');
  const zoning = ctx.modules.get('zoning');
  const buildings = ctx.modules.get('buildings');
  const props = ctx.modules.get('props');
  const animals = ctx.modules.get('animals');
  const traffic = ctx.modules.get('traffic');
  const simulation = ctx.modules.get('simulation');

  const report = { habitats: {}, buildings: {}, roads: {}, animals: {}, vehicles: [], warnings: [] };

  // ---- 1. terrain features (already generated by terrain's own init(); we only read it) --------
  let features = null;
  if (terrain?.getFeatures) { try { features = terrain.getFeatures(); } catch (err) { log.warn('[park] getFeatures failed: ' + err.message); } }
  if (!features) report.warnings.push('terrain module or its features are unavailable; using flat-world fallback anchors');

  // ---- 2. gate + lodge complex, south edge (z+ = south, per terrain/generate.js) ----------------
  const gateAnchor = findSpot(world, 0, half * 0.80, rng, { spread: 70, maxSlopeDeg: 7 });
  const lodgeAnchor = findSpot(world, gateAnchor.x, gateAnchor.z - 150, rng, { spread: 110, maxSlopeDeg: 8 });

  // ---- 3. gravel loop + habitat siting -----------------------------------------------------------
  const loopCenter = { x: 0, z: -half * 0.05 };
  let loop = { verts: [], nodeIds: [] };
  if (roads) loop = buildLoop(ctx, roads, rng, loopCenter, half * 0.56, half * 0.42);

  let plainsIdx = 0, browsersIdx = 1, predIdx = 2, wetIdx = 3;
  const kopje = biggestKopje(features);
  const predatorsAnchor = kopje
    ? { x: kopje.x, z: kopje.z, r: kopje.r + 42 }
    : { x: (loop.verts[predIdx]?.x ?? half * 0.2) + 60, z: (loop.verts[predIdx]?.z ?? -half * 0.2) + 40, r: 70 };

  if (loop.verts.length === 6) {
    const openness = loop.verts.map((v) => Math.min(distToKopjes(v.x, v.z, features), distToWater(v.x, v.z, features)));
    const order = openness.map((_, i) => i).sort((a, b) => openness[b] - openness[a]);
    const remaining = order.slice(2);
    predIdx = remaining.reduce((best, i) => (distToKopjes(loop.verts[i].x, loop.verts[i].z, features) < distToKopjes(loop.verts[best].x, loop.verts[best].z, features) ? i : best), remaining[0]);
    wetIdx = remaining.filter((i) => i !== predIdx).reduce((best, i) => (distToWater(loop.verts[i].x, loop.verts[i].z, features) < distToWater(loop.verts[best].x, loop.verts[best].z, features) ? i : best), remaining.find((i) => i !== predIdx) ?? remaining[0]);
    // Habitat discs must not touch: zoning flood-fills contiguous HABITAT cells into ONE region, so
    // overlapping paints merge — on seed 1 the plains and kopje discs touched, both defs resolved to
    // the merged region and the kopje def renamed it, leaving no plains habitat at all. Pick the
    // plains/browsers vertices subject to a pairwise disc-separation constraint (12 m gap).
    const PL_R = 100, BR_R = 105;
    const sepFrom = (i, a, ar, own) => !a || dist(loop.verts[i].x, loop.verts[i].z, a.x, a.z) > own + (a.r ?? 85) + 12;
    plainsIdx = order.find((i) => sepFrom(i, predatorsAnchor, predatorsAnchor.r, PL_R)) ?? order[0];
    browsersIdx = order.find((i) => i !== plainsIdx
      && sepFrom(i, predatorsAnchor, predatorsAnchor.r, BR_R)
      && sepFrom(i, loop.verts[plainsIdx], PL_R, BR_R)) ?? order.find((i) => i !== plainsIdx) ?? order[1];
  }

  const riverSpot = pointBesideRiver(world, features, 0.5) || pointBesideRiver(world, features, 0.35) || pointBesideRiver(world, features, 0.65);
  let wetlandAnchor = riverSpot
    ? { x: riverSpot.x, z: riverSpot.z, r: 110 }
    : { x: (loop.verts[wetIdx]?.x ?? -half * 0.2) - 60, z: (loop.verts[wetIdx]?.z ?? half * 0.2) + 40, r: 110 };

  // Habitat discs must sit OFF the roads: a disc centred on its loop vertex is bisected by the loop
  // road (roads force NO_BUILD, and flood-fill treats that as a wall), shredding the habitat into
  // fragments — on seed 1 the largest "Plains" fragment was 3,552 m², giving zebra a capacity of 2
  // and an overcrowding penalty that pinned happiness at the migration threshold. Offset each anchor
  // inward from its vertex so the road only clips the disc's rim; tours still pass within a disc
  // radius of the herd. Radii are sized so every species' capacity (area / tables.space) clears its
  // population: the wetland disc reaches over the channel (water cells are excluded from the region),
  // so it is the largest and is pulled back from the bank.
  const offRoad = (v, r) => {
    if (!v) return null;
    const dx = loopCenter.x - v.x, dz = loopCenter.z - v.z, d = Math.hypot(dx, dz) || 1;
    const at = findSpot(world, v.x + (dx / d) * (r * 0.7), v.z + (dz / d) * (r * 0.7), rng, { spread: 30, maxSlopeDeg: 10 });
    return { x: at.x, z: at.z, r };
  };
  const plainsAnchor = offRoad(loop.verts[plainsIdx], 100) || findSpot(world, half * 0.3, -half * 0.15, rng, { spread: 140, maxSlopeDeg: 8 });
  const browsersAnchor = offRoad(loop.verts[browsersIdx], 105) || findSpot(world, -half * 0.32, -half * 0.05, rng, { spread: 140, maxSlopeDeg: 8 });
  if (riverSpot) {
    const dx = loopCenter.x - wetlandAnchor.x, dz = loopCenter.z - wetlandAnchor.z, d = Math.hypot(dx, dz) || 1;
    wetlandAnchor = { x: wetlandAnchor.x + (dx / d) * 30, z: wetlandAnchor.z + (dz / d) * 30, r: 110 };
  }

  /** Where a habitat's access spur should end: the disc rim facing the road, never the centre. */
  const rimPoint = (from, anchor) => {
    const dx = anchor.x - from.x, dz = anchor.z - from.z, d = Math.hypot(dx, dz) || 1;
    const r = (anchor.r ?? 85) * 0.92;
    return { x: anchor.x - (dx / d) * r, z: anchor.z - (dz / d) * r };
  };

  // ---- 4. roads: paved spine, connector, two dirt spurs ------------------------------------------
  let gateNode = null, lodgeNode = null, predatorsNode = null, wetlandNode = null;
  if (roads) {
    const midGL = { x: (gateAnchor.x + lodgeAnchor.x) / 2, z: (gateAnchor.z + lodgeAnchor.z) / 2 };
    roads.addRoad([[gateAnchor.x, gateAnchor.z], [midGL.x, midGL.z], [lodgeAnchor.x, lodgeAnchor.z]], 'paved');
    gateNode = roads.nearestNode(gateAnchor.x, gateAnchor.z, 8)?.id ?? null;
    lodgeNode = roads.nearestNode(lodgeAnchor.x, lodgeAnchor.z, 8)?.id ?? null;

    if (loop.verts.length === 6) {
      let nearestI = 0, nd = Infinity;
      loop.verts.forEach((v, i) => { const d = dist(lodgeAnchor.x, lodgeAnchor.z, v.x, v.z); if (d < nd) { nd = d; nearestI = i; } });
      addSpur(ctx, roads, rng, lodgeAnchor, loop.verts[nearestI], 'gravel');

      predatorsNode = addSpur(ctx, roads, rng, loop.verts[predIdx], rimPoint(loop.verts[predIdx], predatorsAnchor), 'dirt');
      wetlandNode = addSpur(ctx, roads, rng, loop.verts[wetIdx], rimPoint(loop.verts[wetIdx], wetlandAnchor), 'dirt');
    }
    report.roads = roads.stats?.() ?? {};

    // Flush the roads module's deferred rebuild NOW, before any zone is painted: the lazy rebuild
    // conforms the terrain under the roads and emits terrain:modified, and if that lands on a later
    // frame the zoning grid re-floods mid-build — habitats fragment under the animals and the sim
    // loses track of them (measured: 4 regions → 8 and 24 animals habitat-less within 20 frames).
    try { roads.rebuild?.(); } catch (err) { log.warn('[park] roads.rebuild failed: ' + err.message); }
  } else report.warnings.push('roads module absent: no road network, buildings placed with ignoreRoads');

  // ---- 5. four fenced habitats -------------------------------------------------------------------
  const habitatDefs = [
    { key: 'plains', name: 'Plains', anchor: plainsAnchor, species: SPECIES.plains },
    { key: 'browsers', name: 'Acacia Woodland', anchor: browsersAnchor, species: SPECIES.browsers },
    { key: 'predators', name: 'Pride Kopje', anchor: predatorsAnchor, species: SPECIES.predators },
    { key: 'wetland', name: 'River Wetland', anchor: wetlandAnchor, species: SPECIES.wetland },
  ];
  const claimedRegions = new Set();
  for (const h of habitatDefs) {
    const r = h.anchor.r ?? 85;
    if (zoning) {
      // several overlapping discs, not one plain circle, for an organic boundary (matches zoning's own showcase)
      zoning.paint(h.anchor.x, h.anchor.z, r, ZONE.HABITAT);
      zoning.paint(h.anchor.x + rng.range(-r * 0.35, r * 0.35), h.anchor.z + rng.range(-r * 0.35, r * 0.35), r * 0.65, ZONE.HABITAT);
      // resolve the region that actually owns this def: the painted disc can flood-fill into several
      // fragments around rock/water/road, and the anchor cell itself may be unpaintable (the kopje's
      // centre is rock), so habitatAt(anchor) can miss entirely. Nearest UNCLAIMED region within 1.3×
      // the disc; a merge with an earlier def's disc leaves this def nothing, and the warning says so.
      const region = regionNear(zoning, world, h.anchor.x, h.anchor.z, r * 1.3, claimedRegions);
      if (region) { zoning.renameHabitat(region.id, h.name); h.habitatId = region.id; h.region = region; claimedRegions.add(region.id); }
      else report.warnings.push(`habitat "${h.name}": no zoned region of its own near its anchor (disc merged with another habitat?); animals not released`);
    }
    report.habitats[h.key] = { id: h.habitatId ?? null, name: h.name, x: h.anchor.x, z: h.anchor.z, radius: r };
  }
  if (!zoning) report.warnings.push('zoning module absent: habitats have no zone/fence, only animal anchors');

  // ---- 6. lodge complex + gate + hides + tower ---------------------------------------------------
  const placed = {};
  if (buildings) {
    placed.gate = placeBuilding(ctx, buildings, 'gate', gateAnchor.x, gateAnchor.z, rng, { spread: 22, rot: Math.PI });
    placed.lodge = placeBuilding(ctx, buildings, 'lodge', lodgeAnchor.x, lodgeAnchor.z, rng, { spread: 60 });
    placed.restaurant = placeBuilding(ctx, buildings, 'restaurant', lodgeAnchor.x + 45, lodgeAnchor.z, rng, { spread: 55 });
    placed.shop = placeBuilding(ctx, buildings, 'shop', lodgeAnchor.x - 40, lodgeAnchor.z + 15, rng, { spread: 55 });
    placed.ranger = placeBuilding(ctx, buildings, 'ranger', lodgeAnchor.x, lodgeAnchor.z + 55, rng, { spread: 55 });
    placed.parking = placeBuilding(ctx, buildings, 'parking', lodgeAnchor.x + 15, lodgeAnchor.z - 55, rng, { spread: 55 });
    // tented camp: the lodge's 24 beds turn away most of the 35 % of arrivals that want a night
    // (CONST.lodgeShare) — at the volume price (~230-260 arrivals/day) demand is ~56 nights, so the
    // demo pitches 12 tents (24 cheap beds at $95/day each vs ~$100/night earned; every tent is
    // ~+10 $/day when the bed cap binds, and the cap binds all month). Round 3: 4 → 12.
    placed.tents = [];
    for (const [dx, dz] of [[-58, -20], [-52, 12], [-30, 32], [22, 30], [45, -15], [38, 22], [-12, -42], [60, -2], [-45, -45], [55, 15], [-35, 50], [70, -15]]) {
      const t = placeBuilding(ctx, buildings, 'tent', lodgeAnchor.x + dx, lodgeAnchor.z + dz, rng, { spread: 26 });
      if (t) placed.tents.push(t);
    }

    // Water pumps in the three habitats the terrain doesn't water (the wetland has the river): the
    // catalogue's `water: 1` is exactly what the sim's habitatStat adds to a habitat's water stat,
    // and the vital-water gate had crushed those habitats to q 0.16–0.30 (elephants/lions below the
    // breeding drive, one dry season from migrating). SimSafari-1998's own lever: you kept animals
    // by placing water sources. Must precede step 8's resolveRegions (flatten re-floods zones).
    for (const [key, anchor] of [['pumpPlains', plainsAnchor], ['pumpBrowsers', browsersAnchor], ['pumpPredators', predatorsAnchor]]) {
      if (anchor) placed[key] = placeBuilding(ctx, buildings, 'pump', anchor.x, anchor.z, rng, { spread: 24 });
    }

    // hide overlooking the wetland, from beside its access spur, facing the water
    const wetlandView = { x: wetlandAnchor.x + (loop.verts[wetIdx]?.x ? (wetlandAnchor.x - loop.verts[wetIdx].x) * 0.15 : 20), z: wetlandAnchor.z + (loop.verts[wetIdx]?.z ? (wetlandAnchor.z - loop.verts[wetIdx].z) * 0.15 : 20) };
    placed.hideWetland = placeBuilding(ctx, buildings, 'hide', wetlandView.x, wetlandView.z, rng, { spread: 30, facing: { x: wetlandAnchor.x, z: wetlandAnchor.z } });
    // hide overlooking the plains grazers, facing the herd
    placed.hidePlains = placeBuilding(ctx, buildings, 'hide', plainsAnchor.x + plainsAnchor.r * 0.8, plainsAnchor.z, rng, { spread: 35, facing: { x: plainsAnchor.x, z: plainsAnchor.z } });
    // viewing tower near the pride kopje — the tallest sightline in the park (its platform is open on
    // every side, so `facing` only orients the stair-access gap away from the habitat)
    placed.tower = placeBuilding(ctx, buildings, 'tower', predatorsAnchor.x + predatorsAnchor.r * 0.85, predatorsAnchor.z, rng, { spread: 35, facing: { x: predatorsAnchor.x, z: predatorsAnchor.z } });

    for (const [k, v] of Object.entries(placed)) report.buildings[k] = v ? { id: v.id, x: v.x, z: v.z, forced: v.forced } : null;
  } else report.warnings.push('buildings module absent: no structures placed');

  // ---- 7. props: biome scatter (auto in the real game via terrain:ready; explicit in showcase) ---
  if (props && ctx.isShowcase) {
    try { props.scatter({}); } catch (err) { log.warn('[park] props.scatter failed: ' + err.message); }
  }
  if (props?.scatter && browsersAnchor) {
    // extra acacia density in the browsers habitat, per spec ("browsers ... with acacias")
    const b = browsersAnchor, pad = (b.r ?? 88) + 20;
    try { props.scatter({ region: { x0: b.x - pad, z0: b.z - pad, x1: b.x + pad, z1: b.z + pad }, rules: { acacia: { density: 1.6 } }, clear: false }); } catch {}
  }

  // ---- 8. animals ----------------------------------------------------------------------------------
  // Re-resolve every def's region against the CURRENT grid first: building placement (step 6) edits
  // terrain (flatten) and each edit re-floods the zones, so the region objects captured in step 5 can
  // be stale — spawning into stale cells puts animals on habitatId-0 ground the sim cannot manage.
  const resolveRegions = () => {
    if (!zoning) return;
    const claimed = new Set();
    for (const h of habitatDefs) {
      const r = h.anchor.r ?? 85;
      const region = regionNear(zoning, world, h.anchor.x, h.anchor.z, r * 1.3, claimed);
      if (region) { if (region.id !== h.habitatId) zoning.renameHabitat(region.id, h.name); h.habitatId = region.id; h.region = region; claimed.add(region.id); }
      else if (h.habitatId != null) { h.habitatId = null; h.region = null; report.warnings.push(`habitat "${h.name}": its region vanished after later edits; animals not released`); }
    }
  };
  // Spawn each species as ONE herd centred on a dry cell inside the habitat's resolved region. An
  // anchor-centred scatter leaks across the fragment boundaries the flood-fill created (on seed 1
  // that put the lions in an unnamed orphan fragment with no prey, unmanaged by the sim), and a
  // per-animal spawn makes every animal its own herd with a full-size home range that straddles the
  // region edge — a group spawn keeps the herd's home centred well inside its habitat.
  const pickInRegion = (region) => {
    if (!region?.cells?.length) return null;
    // best-of-N by interior mass (7×7 block of same-region cells): a random cell can sit on a
    // fragment's road-cut edge, and a herd clustered there spills onto habitat-less ground
    const g = world.grid, res = g.res, half = world.half;
    let best = null, bestScore = -Infinity;
    const K = Math.min(region.cells.length, 40);
    for (let k = 0; k < K; k++) {
      const idx = region.cells[rng.int(0, region.cells.length - 1)];
      const ix = idx % res, iz = (idx - ix) / res;
      let score = 0;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= res || jz >= res) continue;
        if (g.habitatId[jz * res + jx] === region.id) score++;
      }
      const c = world.cellCenter(ix, iz);
      if (world.isWater(c.x, c.z)) score -= 20;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  };
  if (animals) {
    resolveRegions();
    for (const h of habitatDefs) {
      const r = h.anchor.r ?? 85;
      const region = h.region ?? (zoning && h.habitatId != null ? zoning.getHabitat(h.habitatId) : null);
      const ids = [];
      for (const [species, count] of h.species) {
        const c = (region && pickInRegion(region)) || h.anchor;
        const got = animals.spawn(species, c.x, c.z, count, { homeRadius: r * 0.4, herd: undefined });
        if (got) ids.push(...got);
      }
      report.animals[h.key] = ids.length;
      // verification measures immediately after release: a miss means the spawn itself failed to
      // place an animal inside the named region (roamers that wander out later are normal behaviour)
      if (region && zoning && ids.length) {
        const landed = ids.filter((id) => { const a = world.animals.get(id); return a && zoning.habitatAt(a.x, a.z)?.id === region.id; }).length;
        if (landed < ids.length) report.warnings.push(`habitat "${h.name}": only ${landed}/${ids.length} released animals landed inside the named region`);
      }
    }
  } else report.warnings.push('animals module absent: no animals released');

  // reconcile the headless sim's population bookkeeping against what we just spawned directly
  const sim = simulation?.getSim?.();
  if (sim) { try { sim.reconcileFromWorld(); } catch {} }

  // ---- 8b. opening economy: a staffed park at volume pricing -----------------------------------------
  // Zero staff means zero animal care (happiness = quality × (0.7 + 0.3·care)), which parks every
  // marginal habitat one dry season from the 3-day migration threshold; keepers are what make births
  // possible. Ticket price: the arrival model's price factor clamps at 2.0 (≈ $12 and below all
  // arrive identically), so $15 sells the same crowds for +50 % at the gate vs $10 while staying
  // under the fair-price line (fairness = 1 down to ~$50 attraction-adjusted) — measured
  // 2026-09-08, tools/fidelity.mjs price-sweep. The demo opens cheap and busy; reputation ramps
  // from there. replan() re-plans day 1 AFTER the animals/price/staff exist — without it day 1 is
  // planned from the empty init-time park (attraction 0, ~25 arrivals).
  let staffed = 0;
  if (simulation) {
    simulation.setTicketPrice(15);
    const nAnim = Object.values(report.animals).reduce((s, n) => s + n, 0);
    const hire = (role, n) => { if (n > 0) { try { simulation.hire(role, n); staffed += n; } catch {} } };
    hire('keeper', Math.max(2, Math.ceil(nAnim / 20)));   // one keeper per 20 animals (≈80 → 4)
    hire('guide', 7);                                     // full coverage at ~280 arrivals/day
    hire('maintenance', 2);                               // ~19 buildings + ~7 km of road (deliberately under: wages)
    hire('lodge', 3);                                     // lodge + tented camp beds
    hire('ranger', 2);                                    // poaching suppression across 4 habitats
    try { simulation.replan?.(); } catch {}
    report.staff = staffed;
  }
  if (sim) { try { sim.markStart(); } catch {} }

  // ---- 9. four safari vehicles on tour --------------------------------------------------------------
  if (traffic && gateNode) {
    const tourPlan = [
      [plainsIdx !== undefined ? loop.nodeIds[plainsIdx] : null, browsersIdx !== undefined ? loop.nodeIds[browsersIdx] : null],
      [wetlandNode],
      [predatorsNode],
      [loop.nodeIds[predIdx], wetlandNode],
    ];
    for (const stops of tourPlan) {
      const validStops = stops.filter(Boolean);
      if (!validStops.length) continue;
      const id = traffic.startTour({ from: gateNode, stops: validStops, durationHours: 4 });
      if (id) report.vehicles.push(id);
    }
  } else report.warnings.push('traffic module or gate road node absent: no tours started');

  // ---- 10. sim speed + sane starting economy (defaults from World.js are already sane; untouched) --
  // Speed 1 (one game-hour per real second) only in the live game, and only when the clock is not
  // explicitly paused (a capture page passes &speed=0). In a showcase page the clock must stay at the
  // preset's tod: under the screenshot tool's software renderer a 40-frame settle takes ~35 real
  // seconds, and an advancing clock pushed every capture into a random night hour.
  if (!ctx.isShowcase && !world.time.paused) { try { ctx.app.setSpeed?.(1); } catch {} }

  report.gate = { x: gateAnchor.x, z: gateAnchor.z, nodeId: gateNode };
  report.lodgeSite = { x: lodgeAnchor.x, z: lodgeAnchor.z, nodeId: lodgeNode };
  report.economy = { ...world.economy };
  return report;
}

/** Remove every park-placed entity (used by newGame()). Terrain/environment/props(base scatter) are left
 * alone — only the things this module itself adds are cleared, so a fresh buildPark() starts clean. */
export function clearPark(ctx) {
  if (!ctx) return;
  const world = ctx.world;
  const roads = ctx.modules.get('roads');
  const zoning = ctx.modules.get('zoning');
  const buildings = ctx.modules.get('buildings');
  const animals = ctx.modules.get('animals');
  const traffic = ctx.modules.get('traffic');
  try { roads?.clear(); } catch {}
  try { zoning?.erase(0, 0, world.half * 1.5); } catch {}
  try { buildings?.clear(); } catch {}
  try { animals?.clear(); } catch {}
  if (traffic) { try { for (const v of traffic.list()) traffic.remove(v.id); } catch {} }
}
