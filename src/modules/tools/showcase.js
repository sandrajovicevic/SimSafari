// Showcase: a scripted, deterministic session (no real pointer events — every action goes through
// ctx.modules.get('tools')'s own public API plus synthetic `input:down/up`/`input:key` events on
// ctx.events, exactly the path a real click takes) so a static screenshot shows the tool in use, not
// an empty toolbox. generate terrain -> raise at 3 points -> draw a road (5 points) -> paint a
// habitat (if zoning exists) -> place a lodge + a gate -> release zebras. Then each preset leaves a
// different tool live in-frame (mid-raise, road preview, ghost) by setting ctx.app.input directly.
import * as THREE from 'three';

const TERRAIN_PTS = [[-150, -70], [10, 110], [140, -60]];
const TERRAIN_LIVE_PT = [70, 30];
const ROAD_PATH = [[-220, -70], [-110, 20], [10, -40], [120, 50], [230, -10]];
const LODGE_TARGET = [-50, -60];
const GATE_TARGET = [-225, -80];
const HABITAT_TARGET = [110, 110];
const HABITAT_RADIUS = 48;
const ANIMAL_SPOTS = [[95, 95], [125, 118], [105, 135]]; // inside the painted habitat above

export const presets = {
  overview: {
    camera: { target: [40, 60], distance: 640, pitch: 60, yaw: 14 },
    tod: 15,
    description: 'after the scripted build session: raised ground, a gravel road, a lodge + gate, a painted habitat with zebras',
  },
  road: {
    camera: { target: [270, -40], distance: 145, pitch: 24, yaw: 40 },
    tod: 16,
    description: 'road tool live: a new paved path snapped onto the end of the committed gravel road, with a preview ribbon, grade colouring and a snap indicator',
  },
  terrain: {
    camera: { target: TERRAIN_LIVE_PT, distance: 80, pitch: 26, yaw: 70 },
    tod: 16.5,
    description: 'terrain tool live: a mound mid-raise under the ring cursor, drag still held',
  },
  building: {
    camera: { target: LODGE_TARGET, distance: 65, pitch: 20, yaw: 40 },
    tod: 17,
    description: 'building tool live: the placed lodge, plus a ghost preview (red = invalid, overlapping the existing building)',
  },
  close: {
    camera: { target: LODGE_TARGET, distance: 42, pitch: 18, yaw: 100 },
    tod: 16.5,
    description: 'select tool: the lodge picked, selection marker + world.selection set',
  },
  night: {
    camera: { target: LODGE_TARGET, distance: 130, pitch: 24, yaw: 130 },
    tod: 21.5,
    description: 'the same park at night',
  },
};

function worldToNdc(camera, x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return { ndcX: v.x, ndcY: v.y };
}

function simDown(ctx, x, z, extra = {}) {
  ctx.events.emit('input:down', { button: 0, ground: { x, y: ctx.world.getHeight(x, z), z }, ...extra });
}
function simUp(ctx, x, z, extra = {}) {
  ctx.events.emit('input:up', { button: 0, ground: { x, y: ctx.world.getHeight(x, z), z }, ...extra });
}
function simKey(ctx, code) { ctx.events.emit('input:key', { code, key: code, shift: false, ctrl: false }); }

function clampHalf(v, half) { return v < -half + 4 ? -half + 4 : v > half - 4 ? half - 4 : v; }

/** Spiral-search a valid building spot around (cx,cz); falls back to a forced placement. */
function findBuildSpot(ctx, buildings, type, cx, cz, rng, tries = 50, spread = 70) {
  const half = ctx.world.half;
  for (let i = 0; i < tries; i++) {
    const rad = i === 0 ? 0 : rng.range(4, spread);
    const ang = rng.range(0, Math.PI * 2);
    const x = clampHalf(cx + Math.cos(ang) * rad, half);
    const z = clampHalf(cz + Math.sin(ang) * rad, half);
    const rot = rng.pick([0, Math.PI / 2, Math.PI, Math.PI * 1.5]);
    if (buildings.canPlace(type, x, z, rot).ok) return { x, z, rot, forced: false };
  }
  return { x: cx, z: cz, rot: 0, forced: true };
}

async function runScriptedSession(ctx) {
  const world = ctx.world;
  const tools = ctx.modules.get('tools');
  const terrain = ctx.modules.get('terrain');
  const roads = ctx.modules.get('roads');
  const zoning = ctx.modules.get('zoning');
  const buildings = ctx.modules.get('buildings');
  const animals = ctx.modules.get('animals');
  const rng = ctx.rng.fork('showcase-session');

  if (terrain?.generate) terrain.generate({ preset: 'savannah' });

  // 1) terrain: raise at 3 points
  if (terrain) {
    tools.activate('terrain', { mode: 'raise', radius: 9, strength: 5 });
    for (const [x, z] of TERRAIN_PTS) { simDown(ctx, x, z); simUp(ctx, x, z); }
  }

  // 2) road: draw with 5 points, gravel
  const roadState = { ids: [] };
  if (roads) {
    tools.activate('road', { kind: 'gravel' });
    for (const [x, z] of ROAD_PATH) simDown(ctx, x, z);
    simKey(ctx, 'Enter');
  }

  // 3) zone: paint a habitat (zoning is optional; the animal release step below needs it to exist
  // to have anywhere it is allowed to release into, per the animal tool's habitat rule)
  if (zoning) {
    tools.activate('zone', { zone: 1, radius: HABITAT_RADIUS, mode: 'paint' });
    simDown(ctx, HABITAT_TARGET[0], HABITAT_TARGET[1]);
    simUp(ctx, HABITAT_TARGET[0], HABITAT_TARGET[1]);
  }

  // 4) buildings: a lodge + a gate
  let lodgeId = null, gateId = null;
  if (buildings) {
    tools.activate('building', { type: 'lodge', rot: 0 });
    const lodge = findBuildSpot(ctx, buildings, 'lodge', LODGE_TARGET[0], LODGE_TARGET[1], rng);
    tools.setOption('rot', lodge.rot);
    if (lodge.forced) { lodgeId = buildings.place('lodge', lodge.x, lodge.z, lodge.rot, { force: true }); ctx.log.warn('[tools] showcase: forced lodge placement'); }
    else simDown(ctx, lodge.x, lodge.z);
    lodgeId = lodgeId || buildings.findNearest('lodge', lodge.x, lodge.z)?.id || null;

    tools.activate('building', { type: 'gate', rot: Math.PI / 2 });
    const gate = findBuildSpot(ctx, buildings, 'gate', GATE_TARGET[0], GATE_TARGET[1], rng);
    tools.setOption('rot', gate.rot);
    if (gate.forced) { gateId = buildings.place('gate', gate.x, gate.z, gate.rot, { force: true }); }
    else simDown(ctx, gate.x, gate.z);
    gateId = gateId || buildings.findNearest('gate', gate.x, gate.z)?.id || null;
  }

  // 5) animals: release zebras
  if (animals) {
    tools.activate('animal', { species: 'zebra' });
    for (const [x, z] of ANIMAL_SPOTS) simDown(ctx, x, z);
  }

  return { lodgeId, gateId };
}

export async function stage(ctx, presetName) {
  const world = ctx.world;
  const tools = ctx.modules.get('tools');
  if (!tools) { ctx.log.error('[tools] showcase: own module api not available'); return; }

  const { lodgeId, gateId } = await runScriptedSession(ctx);

  // apply this preset's camera now so we can project world points to screen ndc for a live cursor
  const preset = presets[presetName] || presets.overview;
  ctx.rig.apply(preset.camera);
  ctx.rig.update(0);

  const input = ctx.app.input;
  input.buttons = 0; // clear any stray button state between preset switches in the same session

  if (presetName === 'terrain') {
    const terrain = ctx.modules.get('terrain');
    if (terrain) {
      // strength is deliberately modest: under SwiftShader's very low fps each real frame's dt is
      // clamped to 0.1s, so a strong rate compounds into a steep cone over the settle window instead
      // of a gentle mound — see README "Known gaps".
      tools.activate('terrain', { mode: 'raise', radius: 13, strength: 1.1 });
      const [x, z] = TERRAIN_LIVE_PT;
      const y = world.getHeight(x, z);
      const { ndcX, ndcY } = worldToNdc(ctx.camera, x, y, z);
      input.ndcX = ndcX; input.ndcY = ndcY;
      simDown(ctx, x, z); // opens the stroke; left un-released so update() keeps raising every frame
      input.buttons = 1;  // hold the (synthetic) left button so the drag continues in real frames
    } else tools.activate('select');
  } else if (presetName === 'road') {
    const roads = ctx.modules.get('roads');
    if (roads) {
      tools.activate('road', { kind: 'paved' });
      // p0 sits within SNAP_DIST of the committed gravel road's end node (230,-10) -> node-snaps
      const p0 = [227, -8], p1 = [300, -50], live = [370, -90];
      simDown(ctx, p0[0], p0[1]);
      simDown(ctx, p1[0], p1[1]);
      const y = world.getHeight(live[0], live[1]);
      const { ndcX, ndcY } = worldToNdc(ctx.camera, live[0], y, live[1]);
      input.ndcX = ndcX; input.ndcY = ndcY;
    } else tools.activate('select');
  } else if (presetName === 'building') {
    const buildings = ctx.modules.get('buildings');
    if (buildings && lodgeId) {
      const lodge = buildings.get(lodgeId);
      tools.activate('building', { type: 'lodge', rot: lodge ? lodge.rot : 0 });
      const x = lodge ? lodge.x + 3 : LODGE_TARGET[0], z = lodge ? lodge.z + 3 : LODGE_TARGET[1]; // nudge onto the real lodge -> invalid/red
      const y = world.getHeight(x, z);
      const { ndcX, ndcY } = worldToNdc(ctx.camera, x, y, z);
      input.ndcX = ndcX; input.ndcY = ndcY;
    } else tools.activate('select');
  } else if (presetName === 'close' || presetName === 'night') {
    tools.activate('select');
    if (lodgeId) tools.select('building', lodgeId);
  } else {
    // overview
    tools.activate('select');
    tools.deactivate?.();
    input.buttons = 0;
  }
}
