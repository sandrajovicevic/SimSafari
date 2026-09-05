// Showcase presets for zoning. stage() generates terrain if the module exists, paints three organic
// habitats plus a visitor boardwalk path and a small service patch, turns the overlay on, and spawns a
// few animals inside each habitat if the animals module exists.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const presets = {
  overview: {
    camera: { target: [0, 20], distance: 260, pitch: 34, yaw: 28 }, tod: 15,
    description: 'Three painted habitats with fences and the ground overlay on: green grazing land, a tan visitor boardwalk stitching them together, a grey service yard',
  },
  close: {
    camera: { target: [0, 0], distance: 15, pitch: 16, yaw: 40 }, tod: 16.5,
    description: 'Fence detail at 15 m: wooden posts, two wire rails, terrain-conforming along a habitat boundary',
  },
  overlay: {
    camera: { target: [0, 20], distance: 300, pitch: 78, yaw: 20 }, tod: 13,
    description: 'Top-down over all three habitats: the overlay reads as a zoning-tool map — tinted fills, soft cell edges, an animated dashed boundary',
  },
  night: {
    camera: { target: [0, 20], distance: 220, pitch: 26, yaw: 200 }, tod: 21.5,
    description: 'Habitats at night: overlay tint and fence silhouettes still legible under moonlight',
  },
};

function setTarget(p, x, z, extra = {}) { p.camera.target = [x, z]; Object.assign(p.camera, extra); }

/** Nudge (px,pz) toward nearby dry, gentle ground when terrain is present; identity otherwise. */
function findSpot(world, terrain, px, pz) {
  let best = [px, pz], bestScore = -1e9;
  for (let k = 0; k < 18; k++) {
    const ang = (k / 18) * Math.PI * 2;
    const rad = 18 + (k % 3) * 30;
    const x = clamp(px + Math.cos(ang) * rad, -world.half + 70, world.half - 70);
    const z = clamp(pz + Math.sin(ang) * rad, -world.half + 70, world.half - 70);
    const h = world.getHeight(x, z);
    const wl = terrain?.getWaterLevelAt ? terrain.getWaterLevelAt(x, z) : world.terrain.waterLevel;
    if (h < wl + 2.5) continue;
    const slope = world.getSlope(x, z);
    if (slope > 0.22) continue;
    const score = -slope * 30 - Math.hypot(x, z) * 0.01;
    if (score > bestScore) { bestScore = score; best = [x, z]; }
  }
  return best;
}

/** Paint an organic blob of `zone` centred at (cx,cz): several overlapping discs, seeded and reproducible. */
function paintBlob(zoning, rng, cx, cz, baseR, zone, lobes = 6) {
  zoning.paint(cx, cz, baseR, zone);
  for (let i = 0; i < lobes; i++) {
    const ang = (i / lobes) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const rad = baseR * rng.range(0.35, 0.85);
    const r2 = baseR * rng.range(0.45, 0.75);
    zoning.paint(cx + Math.cos(ang) * rad, cz + Math.sin(ang) * rad, r2, zone);
  }
}

/**
 * Paint a boardwalk strip of VISITOR zone between two points. Stops short of both ends (tStart/tEnd)
 * so it never overwrites the HABITAT paint at either endpoint — a path that ran flush to (ax,az) would
 * repaint that exact cell VISITOR, which is exactly what happened here in an earlier version: the
 * "close" preset's camera anchor (a habitat's paint centre) turned into a VISITOR cell and `habitatAt()`
 * came back null, silently falling through to the preset's unchanged [0,0] default target.
 */
function paintPath(zoning, ax, az, bx, bz, width = 4, tStart = 0.16, tEnd = 0.84) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round((d * (tEnd - tStart)) / 6));
  for (let i = 0; i <= n; i++) {
    const t = tStart + (tEnd - tStart) * (i / n);
    zoning.paint(ax + (bx - ax) * t, az + (bz - az) * t, width, zoning.ZONE.VISITOR);
  }
}

/** Point on any of habitat `id`'s boundary loops closest to (tx,tz), for aiming a "fence detail" camera. */
function closestBoundaryPoint(zoning, id, tx, tz) {
  const loops = zoning.boundary(id);
  let best = null, bestD = Infinity;
  for (const loop of loops) for (const [x, z] of loop) {
    const d = (x - tx) * (x - tx) + (z - tz) * (z - tz);
    if (d < bestD) { bestD = d; best = [x, z]; }
  }
  return best;
}

export async function stage(ctx, presetName) {
  const zoning = ctx.modules.get('zoning');
  if (!zoning) return;
  const t = ctx.modules.get('terrain');
  const props = ctx.modules.get('props');
  const animals = ctx.modules.get('animals');
  const env = ctx.modules.get('environment');
  const world = ctx.world;

  if (t && !t.getFeatures?.()) t.generate?.({ preset: 'savannah' });
  // props only auto-scatters itself in the full game (see props/index.js); in a single-module showcase
  // it needs an explicit nudge so the habitats sit in real grass/tree cover, not bare ground.
  if (props?.scatter) { try { props.scatter({}); } catch { /* scenery only */ } }
  if (env) env.setWeather?.({ cloud: 0.2, rain: 0, haze: 0.3, season: 'dry', wind: { x: 1, z: 0.3, speed: 3 } }, { immediate: true });

  // Fixed fork (NOT presetName-dependent): the painted world must be identical across every preset for a
  // given seed — a per-preset fork here previously gave each screenshot a different random lobe shape,
  // which occasionally clipped the river differently and split one habitat into two only in some presets
  // (caught by comparing world.counts.habitats across screenshots: 3 in three of them, 4 in the fourth).
  const rng = ctx.rng.fork('showcase');

  // three anchors spread around the origin, nudged onto real dry ground when terrain exists
  const anchors = [[-190, -70], [150, 40], [-30, 240]].map(([x, z]) => findSpot(world, t, x, z));
  const [h1, h2, h3] = anchors;

  paintBlob(zoning, rng.fork('h1'), h1[0], h1[1], 58, zoning.ZONE.HABITAT, 6);
  paintBlob(zoning, rng.fork('h2'), h2[0], h2[1], 66, zoning.ZONE.HABITAT, 7);
  paintBlob(zoning, rng.fork('h3'), h3[0], h3[1], 50, zoning.ZONE.HABITAT, 5);

  // visitor boardwalk stitching the three habitats together
  paintPath(zoning, h1[0], h1[1], h2[0], h2[1]);
  paintPath(zoning, h2[0], h2[1], h3[0], h3[1]);

  // a small service yard off habitat 2
  const svc = [h2[0] + 90, h2[1] - 40];
  zoning.paint(svc[0], svc[1], 22, zoning.ZONE.SERVICE);
  paintPath(zoning, h2[0] + 66 * 0.4, h2[1] - 66 * 0.15, svc[0], svc[1], 3.5);

  // name the habitats for the UI / tooltips
  const habs = zoning.listHabitats().sort((a, b) => b.area - a.area);
  const names = ['Acacia Plain', 'River Bend', 'Kopje Range'];
  habs.forEach((h, i) => zoning.renameHabitat(h.id, names[i] || h.name));

  if (animals) {
    const species = animals.allSpecies?.() || [];
    const pick = (want) => species.find((s) => s === want) || null;
    const spawns = [
      { at: h1, species: pick('zebra') || pick('impala') || species[0], n: 5 },
      { at: h2, species: pick('giraffe') || pick('elephant') || species[1], n: 3 },
      { at: h3, species: pick('lion') || pick('cheetah') || species[2], n: 2 },
    ];
    for (const s of spawns) {
      if (!s.species || !s.at) continue;
      const h = zoning.habitatAt(s.at[0], s.at[1]);
      try { animals.spawn(s.species, s.at[0], s.at[1], s.n, h ? { habitat: h.id } : {}); } catch { /* optional flourish only */ }
    }
  }

  zoning.setOverlay(true);

  // camera anchors from where the habitats actually landed
  const cx = (h1[0] + h2[0] + h3[0]) / 3, cz = (h1[1] + h2[1] + h3[1]) / 3;
  setTarget(presets.overview, cx, cz);
  setTarget(presets.overlay, cx, cz);
  setTarget(presets.night, cx, cz);
  // close: a real point on habitat 1's fence line, on the side facing habitat 2 (falls back to the
  // largest painted habitat if the anchor cell itself ever ends up not-HABITAT for any reason)
  const hab1 = zoning.habitatAt(h1[0], h1[1]) || habs[0];
  const fp = hab1 ? closestBoundaryPoint(zoning, hab1.id, h2[0], h2[1]) : null;
  if (fp) {
    // orbit yaw on the outward side of the fence (habitat centre -> boundary point -> camera)
    const yaw = (Math.atan2(fp[0] - hab1.centroid.x, fp[1] - hab1.centroid.z) * 180) / Math.PI;
    setTarget(presets.close, fp[0], fp[1], { yaw });
  }

  for (const [name, p] of Object.entries(presets)) ctx.rig.registerPreset('zoning-' + name, { ...p.camera, tod: p.tod, description: p.description });
}
