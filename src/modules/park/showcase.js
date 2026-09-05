// park/showcase.js — presets for the playable demo park. stage() builds the real park (build.js,
// the same routine api.loadDemo()/api.newGame() use) then re-anchors each preset's camera onto
// whatever actually got placed for the active seed, following the same "mutate the exported presets
// object in place, core applies it after stage() returns" idiom terrain/showcase.js uses.
import { buildPark } from './build.js';

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
  if (lodge) { setTarget(presets.lodge, lodge.x, lodge.z); setTarget(presets.close, lodge.x, lodge.z); setTarget(presets.night, lodge.x, lodge.z); }
  if (plains) setTarget(presets.habitat, plains.x, plains.z, { distance: Math.max(110, plains.radius * 1.4) });
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
