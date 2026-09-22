// park/showcase.js — presets for the playable demo park. stage() builds the real park (build.js,
// the same routine api.loadDemo()/api.newGame() use) then re-anchors each preset's camera onto
// whatever actually got placed for the active seed, following the same "mutate the exported presets
// object in place, core applies it after stage() returns" idiom terrain/showcase.js uses.
import { buildPark } from './build.js';

const DEG = Math.PI / 180;
/** yaw (degrees) that places the camera along direction (nx,nz) from its target, per CameraRig's convention. */
const degOf = (nx, nz) => Math.atan2(nx, nz) / DEG;

export const presets = {
  overview: { camera: { target: [0, -20], distance: 760, pitch: 52, yaw: 30 }, tod: 15,
    description: 'the whole demo park: entrance + lodge complex to the south, a gravel loop with two dirt spurs, four fenced habitats' },
  gate:     { camera: { target: [0, 400], distance: 90, pitch: 20, yaw: 20 }, tod: 9,
    description: 'the entrance gate at morning opening, ticket kiosk and boom, safari trucks queued on the paved approach' },
  lodge:    { camera: { target: [0, 250], distance: 75, pitch: 20, yaw: 55 }, tod: 17.5,
    description: 'the lodge complex at golden hour: lodge, restaurant, shop, ranger station and car park' },
  habitat:  { camera: { target: [200, -60], distance: 130, pitch: 26, yaw: 40 }, tod: 16,
    description: 'the plains-grazer habitat: zebra, wildebeest and impala behind the wooden-post fence, a viewing hide at the boundary' },
  tour:     { camera: { target: [-150, -180], distance: 95, pitch: 24, yaw: 100 }, tod: 16.5,
    description: 'a safari truck on the dirt spur beside the pride kopje, passengers turned toward the lions' },
  close:    { camera: { target: [0, 250], distance: 30, pitch: 18, yaw: 110 }, tod: 16.5,
    description: 'the lodge veranda close: thatch, timber poles, stone plinth and the pool' },
  night:    { camera: { target: [0, 250], distance: 110, pitch: 24, yaw: 130 }, tod: 21.5,
    description: 'the lodge lit at night: lantern glow on the thatch, an emissive window, stars overhead' },
};

function setTarget(p, x, z, extra = {}) {
  p.camera = { ...p.camera, target: [x, z], ...extra };
}

let lastReport = null;

export async function stage(ctx, presetName) {
  const report = await buildPark(ctx, { seed: ctx.world.seed });
  lastReport = report;

  const gate = report.gate, lodge = report.lodgeSite;
  const plains = report.habitats.plains, browsers = report.habitats.browsers;
  const predators = report.habitats.predators, wetland = report.habitats.wetland;

  if (gate) setTarget(presets.gate, gate.x, gate.z);
  if (lodge) { setTarget(presets.lodge, lodge.x, lodge.z); setTarget(presets.night, lodge.x, lodge.z); }

  // 'habitat' preset: the old version aimed at the disc's dead centre from 110-140 m at a static 40°
  // yaw — at that distance, on whatever else happened to sit in that fixed compass direction for this
  // seed, the habitat itself was a small element in a wide shot (once literally the river/gallery
  // forest, per critic: "shows a wide river-and-gallery-forest scene instead... a completely different
  // biome"). The hide is placed at the disc boundary facing the anchor (build.js), exactly where a
  // visitor stands to watch the grazers — so aim from partway toward the hide (near the fence line,
  // where the animals actually cluster) and shoot from close to the hide's own position looking back
  // across the habitat, instead of a wide aerial view of the whole disc.
  const hidePlains = report.buildings?.hidePlains;
  if (plains && hidePlains) {
    const tx = plains.x + (hidePlains.x - plains.x) * 0.35, tz = plains.z + (hidePlains.z - plains.z) * 0.35;
    setTarget(presets.habitat, tx, tz, { distance: 55, pitch: 14, yaw: degOf(hidePlains.x - plains.x, hidePlains.z - plains.z) });
  } else if (plains) {
    setTarget(presets.habitat, plains.x, plains.z, { distance: Math.max(110, plains.radius * 1.4) });
  }

  // 'close' preset: "the lodge veranda close... thatch, timber poles, stone plinth and the pool" was
  // aimed at the lodge's own centre with a static yaw and a 30 m distance — for whichever direction
  // the lodge happened to be rotated that seed, this could land on any side of the building (car
  // park, back-of-house, plain wall), not the veranda/pool side (critic: "a wide, elevated road-level
  // view of tented camp units... no pool, no close veranda framing"). The pool's local-space position
  // is fixed by the lodge builder (lodge.js): local (7.5, 14.15), local +z = front/veranda/terrace
  // side. Rotate that local point into world space using the building's real placement rotation, and
  // look back at it from beyond the pool (local +z side) so deck, poles, roofline and pool are all
  // in frame, eye level.
  // Note: use the lodge BUILDING's actual placed x/z/rot (report.buildings.lodge), not lodgeSite —
  // placeBuilding can offset the real building up to 60 m from the site anchor to find valid ground.
  const lodgeBldg = report.buildings?.lodge;
  if (lodgeBldg && lodgeBldg.rot !== undefined) {
    const rot = lodgeBldg.rot;
    const c = Math.cos(rot), s = Math.sin(rot);
    // target the deck/pool transition (between the poled veranda at z~9 and the pool at z~12.9-15.4)
    // rather than the pool's dead centre — a target sitting AT the water surface put the 17 m/9°
    // camera almost at pool level, clipped under the roof eave looking into the tiled floor instead
    // of across the scene (first attempt, re-verified via screenshot and corrected here).
    //
    // yaw sign, corrected after a second bad screenshot (extreme roof-thatch close-up, camera
    // clipped through the mesh): CameraRig places the camera at target + distance*(sin(yaw),cos(yaw))
    // and looks BACK at target (see CameraRig.js). Local +z is the front/terrace side (lodge.js), and
    // a local point (0,1) maps to world (sinθ,cosθ) for building rotation θ (verified against
    // buildings/index.js's own lamp-placement transform) — so yaw=θ places the camera FURTHER along
    // local +z (beyond the pool, in the open), looking back at the deck/roofline. yaw=θ+180 (what was
    // here before) does the opposite: it puts the camera on the building's *interior* side, walking it
    // straight into the roof structure as distance grows — exactly what the second screenshot showed.
    const lx = 3.5, lz = 10; // local building space (see lodge.js)
    const px = lodgeBldg.x + lx * c + lz * s, pz = lodgeBldg.z - lx * s + lz * c;
    setTarget(presets.close, px, pz, { distance: 24, pitch: 18, yaw: (rot / DEG + 360) % 360 });
  }
  const overviewCx = ((gate?.x ?? 0) + (lodge?.x ?? 0)) / 2;
  const overviewCz = ((gate?.z ?? 200) + (lodge?.z ?? 100)) / 2 - 80;
  setTarget(presets.overview, overviewCx, overviewCz, { distance: Math.max(650, ctx.world.half * 1.5) });

  // 'tour' preset: aim at whichever habitat got the dirt spur closer to a kopje, and place one extra
  // vehicle right beside it — the four demo tour trucks reach every habitat in real transit time, but
  // a screenshot's settle window (a few seconds of sim time) isn't enough for one to arrive naturally.
  // See README "Known gaps" for why this one extra vehicle is showcase-only, not part of loadDemo().
  const tourSite = predators || wetland || plains;
  if (tourSite) {
    setTarget(presets.tour, tourSite.x, tourSite.z);
    const roads = ctx.modules.get('roads'), traffic = ctx.modules.get('traffic');
    if (roads && traffic) {
      const ne = roads.nearestEdge(tourSite.x, tourSite.z, 250);
      if (ne) traffic.spawn('safari', ne.edge.id, ne.s);
    }
  }

  for (const [name, p] of Object.entries(presets)) ctx.rig.registerPreset('park-' + name, { ...p.camera, tod: p.tod, description: p.description });
}

export function getLastReport() { return lastReport; }
