// Showcase for the headless simulation: stages a synthetic park, fast-forwards N game days, and shows a dashboard
// (sparklines + last daily report). The dashboard is drawn on a 2D canvas that is (a) mounted in #ui-root as a DOM
// panel and (b) used as a CanvasTexture on a camera-facing quad, because tools/screenshot.mjs captures only the
// WebGL canvas (renderer.domElement.toDataURL) — see docs/requests/simulation.md.
import * as THREE from 'three';
import { Simulation } from './sim.js';
import { buildPark, applyPark } from './worldgen.js';
import { drawDashboard, PANEL_W, PANEL_H } from './panel.js';

const CAM = { target: [0, 0], distance: 420, pitch: 42, yaw: 35 };

export const presets = {
  overview: { camera: CAM, tod: 15, days: 60, mode: 'overview', park: {},
    description: '60 accelerated days of the default park: 5 habitats, loop road with spurs, lodge, 3 water holes, $25 tickets — cash, visitors and population sparklines plus the last daily report' },
  boom: { camera: CAM, tod: 11, days: 60, mode: 'overview', park: { ticketPrice: 15, water: 0.2, shade: 0.1, roadKind: 'gravel' },
    description: 'Cheap $15 tickets, wetter and shadier habitats, gravel loop road: happier herds breed, word of mouth lifts arrivals, cash climbs' },
  bust: { camera: CAM, tod: 17, days: 60, mode: 'overview', park: { ticketPrice: 80, water: -1, waterholes: false, lodge: false, roads: 'loop', cash: 15000, loan: 200000 },
    description: 'No water in any habitat, $80 tickets, no lodge, a $200k loan: hippos and buffalo leave, visitors stay away, the bank forecloses' },
  close: { camera: CAM, tod: 16.5, days: 30, mode: 'report',
    description: 'Report close-up after 30 days: the habitat-quality matrix (every species × every habitat) that drives happiness, breeding and migration' },
  night: { camera: CAM, tod: 21.5, days: 60, mode: 'overview', park: {},
    description: 'The same 60-day run viewed at 21:30 — the dashboard is unlit HUD geometry so it stays readable at night' },
};

let S = null; // stage state

function clearStage(ctx) {
  if (!S) return;
  try { S.quad?.removeFromParent(); S.quad?.geometry?.dispose(); S.quad?.material?.dispose(); S.texture?.dispose(); } catch {}
  try { S.dom?.remove(); } catch {}
  S = null;
}

export async function stage(ctx, presetName, env = {}) {
  clearStage(ctx);
  const preset = presets[presetName] || presets.overview;
  const world = ctx.world;
  const seed = world.seed;
  // 1. synthetic park (zoning/buildings/roads/animals modules are not staged in this showcase)
  const park = buildPark(world, ctx.rng.fork('park:' + presetName), preset.park || {});
  const sim = new Simulation(world, ctx.rng.fork('sim:' + presetName + ':' + seed), env.hooks || {});
  applyPark(sim, park);
  env.setSim?.(sim);
  // 2. fast-forward
  const t0 = performance.now();
  sim.runDays(preset.days || 60);
  const simMs = performance.now() - t0;
  ctx.log.info(`simulation showcase "${presetName}": ${preset.days} days in ${simMs.toFixed(0)} ms, cash ${Math.round(world.economy.cash)}, pop ${sim.count()}`);
  // 3. dashboard canvas
  const canvas = document.createElement('canvas');
  drawDashboard(canvas, { preset: presetName, description: preset.description, sim, world, hour: Number.isFinite(ctx.params?.tod) ? ctx.params.tod : preset.tod, mode: preset.mode });
  // 4a. DOM panel in #ui-root (the spec's deliverable; visible in a real browser)
  let dom = null;
  try {
    const root = document.getElementById('ui-root'); // lint-allow — showcase panel per docs/specs/simulation.md
    if (root) {
      dom = document.createElement('div');
      dom.id = 'simulation-panel';
      dom.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:90vw;max-height:92vh;aspect-ratio:16/9;pointer-events:none;';
      const img = document.createElement('canvas');
      img.width = canvas.width; img.height = canvas.height;
      img.getContext('2d').drawImage(canvas, 0, 0);
      img.style.cssText = 'width:100%;height:100%;display:block;';
      dom.appendChild(img);
      root.appendChild(dom);
    }
  } catch (err) { ctx.log.warn('simulation panel DOM mount failed: ' + err.message); }
  // 4b. camera-facing quad so the WebGL capture shows the same dashboard
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  quad.name = 'simulation-dashboard';
  quad.renderOrder = 1000;
  quad.frustumCulled = false;
  (env.group || ctx.scene).add(quad);
  S = { quad, texture, dom, canvas, sim, _fwd: new THREE.Vector3(), _pos: new THREE.Vector3() };
  updateStage(ctx, 0, 0);
}

/** Keep the dashboard quad in front of the camera, filling 90 % of the view (no per-frame allocation). */
export function updateStage(ctx, dt, t) {
  if (!S || !ctx) return;
  const cam = ctx.camera;
  const d = 20;
  cam.getWorldDirection(S._fwd);
  S._pos.copy(cam.position).addScaledVector(S._fwd, d);
  S.quad.position.copy(S._pos);
  S.quad.quaternion.copy(cam.quaternion);
  const vh = 2 * d * Math.tan((cam.fov * Math.PI) / 360), vw = vh * cam.aspect;
  let qw = vw * 0.9, qh = qw * (PANEL_H / PANEL_W);
  if (qh > vh * 0.92) { qh = vh * 0.92; qw = qh * (PANEL_W / PANEL_H); }
  S.quad.scale.set(qw, qh, 1);
}

export function disposeStage(ctx) { clearStage(ctx); }
