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

// ---------------------------------------------------------------------------------------------
// main build
// ---------------------------------------------------------------------------------------------

const SPECIES = {
  plains: [['zebra', 10], ['wildebeest', 10], ['impala', 14]],
  browsers: [['giraffe', 4], ['elephant', 5]],
  predators: [['lion', 5]],
  wetland: [['hippo', 6], ['buffalo', 8]],
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
  if (loop.verts.length === 6) {
    const openness = loop.verts.map((v) => Math.min(distToKopjes(v.x, v.z, features), distToWater(v.x, v.z, features)));
    const order = openness.map((_, i) => i).sort((a, b) => openness[b] - openness[a]);
    plainsIdx = order[0]; browsersIdx = order[1];
    const remaining = order.slice(2);
    predIdx = remaining.reduce((best, i) => (distToKopjes(loop.verts[i].x, loop.verts[i].z, features) < distToKopjes(loop.verts[best].x, loop.verts[best].z, features) ? i : best), remaining[0]);
    wetIdx = remaining.filter((i) => i !== predIdx).reduce((best, i) => (distToWater(loop.verts[i].x, loop.verts[i].z, features) < distToWater(loop.verts[best].x, loop.verts[best].z, features) ? i : best), remaining.find((i) => i !== predIdx) ?? remaining[0]);
  }

  const kopje = biggestKopje(features);
  const predatorsAnchor = kopje
    ? { x: kopje.x, z: kopje.z, r: kopje.r + 42 }
    : { x: (loop.verts[predIdx]?.x ?? half * 0.2) + 60, z: (loop.verts[predIdx]?.z ?? -half * 0.2) + 40, r: 70 };

  const riverSpot = pointBesideRiver(world, features, 0.5) || pointBesideRiver(world, features, 0.35) || pointBesideRiver(world, features, 0.65);
  const wetlandAnchor = riverSpot
    ? { x: riverSpot.x, z: riverSpot.z, r: 80 }
    : { x: (loop.verts[wetIdx]?.x ?? -half * 0.2) - 60, z: (loop.verts[wetIdx]?.z ?? half * 0.2) + 40, r: 80 };

  const plainsAnchor = loop.verts[plainsIdx]
    ? { x: loop.verts[plainsIdx].x, z: loop.verts[plainsIdx].z, r: 92 }
    : findSpot(world, half * 0.3, -half * 0.15, rng, { spread: 140, maxSlopeDeg: 8 });
  const browsersAnchor = loop.verts[browsersIdx]
    ? { x: loop.verts[browsersIdx].x, z: loop.verts[browsersIdx].z, r: 88 }
    : findSpot(world, -half * 0.32, -half * 0.05, rng, { spread: 140, maxSlopeDeg: 8 });

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

      predatorsNode = addSpur(ctx, roads, rng, loop.verts[predIdx], predatorsAnchor, 'dirt');
      wetlandNode = addSpur(ctx, roads, rng, loop.verts[wetIdx], wetlandAnchor, 'dirt');
    }
    report.roads = roads.stats?.() ?? {};
  } else report.warnings.push('roads module absent: no road network, buildings placed with ignoreRoads');

  // ---- 5. four fenced habitats -------------------------------------------------------------------
  const habitatDefs = [
    { key: 'plains', name: 'Plains', anchor: plainsAnchor, species: SPECIES.plains },
    { key: 'browsers', name: 'Acacia Woodland', anchor: browsersAnchor, species: SPECIES.browsers },
    { key: 'predators', name: 'Pride Kopje', anchor: predatorsAnchor, species: SPECIES.predators },
    { key: 'wetland', name: 'River Wetland', anchor: wetlandAnchor, species: SPECIES.wetland },
  ];
  for (const h of habitatDefs) {
    const r = h.anchor.r ?? 85;
    if (zoning) {
      // several overlapping discs, not one plain circle, for an organic boundary (matches zoning's own showcase)
      zoning.paint(h.anchor.x, h.anchor.z, r, ZONE.HABITAT);
      zoning.paint(h.anchor.x + rng.range(-r * 0.35, r * 0.35), h.anchor.z + rng.range(-r * 0.35, r * 0.35), r * 0.65, ZONE.HABITAT);
      const found = zoning.habitatAt(h.anchor.x, h.anchor.z);
      if (found) { zoning.renameHabitat(found.id, h.name); h.habitatId = found.id; }
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
  if (animals) {
    for (const h of habitatDefs) {
      const r = h.anchor.r ?? 85;
      const ids = [];
      for (const [species, count] of h.species) {
        const got = animals.spawn(species, h.anchor.x, h.anchor.z, count, { spread: r * 0.65, homeRadius: r });
        if (got) ids.push(...got);
      }
      report.animals[h.key] = ids.length;
    }
  } else report.warnings.push('animals module absent: no animals released');

  // reconcile the headless sim's population bookkeeping against what we just spawned directly
  const sim = simulation?.getSim?.();
  if (sim) { try { sim.reconcileFromWorld(); sim.markStart(); } catch {} }

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
  try { ctx.app.setSpeed?.(1); } catch {}

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
