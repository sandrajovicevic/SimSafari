// traffic showcase: presets + stage(). Lays a small loop-with-a-junction network via the real `roads`
// module's API when present (roads' own init() never lays a network — only its own showcase does —
// so traffic must build one for its own demo), or relies on the built-in FallbackGraph loop otherwise.
import { edgesOf as edgesOfGraph, getEdge } from './graph.js';

export const presets = {
  overview: {
    camera: { target: [10, 60], distance: 430, pitch: 42, yaw: 28 }, tod: 16,
    description: '6 vehicles (safari, ranger, minibus, service) on a loop with a paved/gravel/dirt junction',
  },
  close: {
    camera: { target: [80, -100], distance: 11, pitch: 20, yaw: 195 }, tod: 16.5,
    description: 'open safari truck at ~8 m, 3/4 rear-side view — tiered bench seats, passengers, canopy, roof rack, spare wheel',
  },
  sighting: {
    camera: { target: [-150, 172], distance: 30, pitch: 18, yaw: 205 }, tod: 17.5,
    description: 'safari truck stopped near a zebra herd (needs the animals module; falls back to a plain stop otherwise)',
  },
  night: {
    camera: { target: [80, -100], distance: 14, pitch: 16, yaw: 195 }, tod: 21.5,
    description: 'night, same 3/4 view as "close" — headlights/taillights lit, ground-projected spotlight beam, 2 more vehicles passing behind',
  },
};

function layNetwork(roadsApi) {
  roadsApi.addRoad([[-260, -40], [-100, -90], [80, -100], [240, -60], [320, 20]], 'paved');
  roadsApi.addRoad([[320, 20], [300, 150], [160, 220], [-20, 230], [-160, 180], [-230, 70], [-100, -90]], 'gravel');
  roadsApi.addRoad([[160, 220], [240, 290], [330, 260]], 'dirt');
  roadsApi.rebuild();
}

/** Lay the showcase network if the real roads module is present and empty; return a gate node id. */
function ensureNetwork(ctx, iface) {
  const graph = iface.getGraph();
  if (graph.backend === 'fallback') return graph.api.gate;
  const roads = graph.api;
  if (roads.edges().size === 0) {
    try { layNetwork(roads); } catch (err) { ctx.log.error('[traffic] showcase: failed laying road network', err); }
  }
  const first = [...roads.edges().values()][0];
  return first ? first.a : null;
}

function edgeNear(iface, x, z) {
  const edges = [...edgesOfGraph(iface.getGraph()).values()];
  let best = null, bd = Infinity;
  for (const e of edges) {
    for (let i = 0; i < e.points.length; i += 2) {
      const d = Math.hypot(e.points[i] - x, e.points[i + 1] - z);
      if (d < bd) { bd = d; best = { edge: e, s: e.cum[i / 2] }; }
    }
  }
  return best;
}

function spawnOverview(ctx, iface) {
  const edges = [...edgesOfGraph(iface.getGraph()).values()];
  if (!edges.length) return;
  const plan = [
    { kind: 'safari', frac: 0.15, forward: true }, { kind: 'safari', frac: 0.55, forward: false },
    { kind: 'ranger', frac: 0.3, forward: true }, { kind: 'minibus', frac: 0.7, forward: true },
    { kind: 'service', frac: 0.1, forward: false }, { kind: 'minibus', frac: 0.85, forward: true },
  ];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const edge = edges[i % edges.length];
    iface.spawnVehicle(p.kind, edge.id, edge.length * p.frac, p.forward);
  }
}

function spawnClose(ctx, iface) {
  const near = edgeNear(iface, 80, -100);
  if (!near) return;
  iface.spawnVehicle('safari', near.edge.id, near.s, true, { seatCount: 8 });
}

function spawnSighting(ctx, iface) {
  const herdX = -140, herdZ = 165;
  const animals = ctx.modules.get('animals');
  const near = edgeNear(iface, -160, 180);
  if (!near) return;
  const v = iface.spawnVehicle('safari', near.edge.id, near.s, true, { seatCount: 7 });
  if (!v) return;
  if (animals) {
    try { animals.spawn('zebra', herdX, herdZ, 5, { spread: 6 }); } catch (err) { ctx.log.warn('[traffic] showcase: animals.spawn failed: ' + (err?.message || err)); }
    v._state = 'sighting';
    v._stopTimer = 999;
    v._sightYaw = Math.atan2(herdX - v.x, herdZ - v.z) - v.heading;
    ctx.events.emit('visitor:sighting', { species: 'zebra', vehicleId: v.id, distance: Math.hypot(herdX - v.x, herdZ - v.z) });
  } else {
    v._state = 'stopped';
    v._stopTimer = 999;
    ctx.log.warn('[traffic] showcase "sighting": animals module not present — showing a plain stop instead');
  }
}

function spawnNight(ctx, iface) {
  // one vehicle parked right where the camera looks (same spot "close" uses) so its lit headlights/
  // taillights and ground spotlight are actually legible, not just a distant pinprick at 150 m.
  const near = edgeNear(iface, 80, -100);
  if (near) iface.spawnVehicle('safari', near.edge.id, near.s, true, { seatCount: 6 });
  const edges = [...edgesOfGraph(iface.getGraph()).values()];
  if (!edges.length) return;
  const plan = [{ kind: 'minibus', frac: 0.5, forward: false }, { kind: 'ranger', frac: 0.75, forward: true }];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const edge = edges[(i + 2) % edges.length];
    iface.spawnVehicle(p.kind, edge.id, edge.length * p.frac, p.forward);
  }
}

export async function stage(ctx, presetName, iface) {
  iface.clearAll();
  const gate = ensureNetwork(ctx, iface);
  void gate;
  if (presetName === 'overview') spawnOverview(ctx, iface);
  else if (presetName === 'close') spawnClose(ctx, iface);
  else if (presetName === 'sighting') spawnSighting(ctx, iface);
  else if (presetName === 'night') spawnNight(ctx, iface);
  else spawnOverview(ctx, iface);
}
