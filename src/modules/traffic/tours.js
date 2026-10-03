// Tour planning (api.startTour) and the sighting behaviour it drives: a tour vehicle checks the
// nearest animal group every frame while driving, and — within 60 m with an (approximate, terrain-only)
// line of sight — stops for 20-60 s, turns its passengers' heads toward it, and emits
// `visitor:sighting`. Ambient (non-tour) vehicles spawned via api.spawn/setDensity never sight-stop;
// see README "Known gaps".
//
// `mgr` (passed in by index.js) is { addVehicle(v), dropVehicle(v) } — the same helpers that keep the
// module's id->vehicle Map and its flat per-frame update array in sync, so tours never touch either
// structure directly.
import * as THREE from 'three';
import { createVehicle, planRouteTo } from './vehicle.js';
import { getEdge, getNode, route as routeBetween } from './graph.js';

const SIGHT_RADIUS = 60;
const SIGHT_MIN_STOP = 20, SIGHT_MAX_STOP = 60;
const SIGHT_COOLDOWN = 40; // s before the same vehicle can sight-stop again
const AVG_TOUR_SPEED_MS = 8; // rough natural pace used only to scale toward a requested durationHours

const _toDespawn = []; // module-level scratch, reused every stepTours() call — never grows unbounded

function totalRouteLength(graph, waypoints) {
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const r = routeBetween(graph, waypoints[i], waypoints[i + 1]);
    if (!r) return null;
    total += r.length;
  }
  return total;
}

export function startTour(ctx, kit, graph, mgr, opts) {
  const { from, stops = [], durationHours = 1 } = opts || {};
  const startNode = getNode(graph, from);
  if (!startNode || !startNode.edges.length) { ctx.log.warn(`[traffic] startTour: unknown or disconnected gate node "${from}"`); return null; }
  const edgeId = startNode.edges[0];
  const edge = getEdge(graph, edgeId);
  const forward = edge.a === startNode.id;
  const validStops = stops.filter((n) => getNode(graph, n));
  if (validStops.length !== stops.length) ctx.log.warn('[traffic] startTour: some stops are not valid node ids and were dropped');

  const id = ctx.world.nextId('veh');
  const v = createVehicle(ctx, kit, graph, id, 'safari', edgeId, forward ? 0 : edge.length, forward, {
    tour: { stops: validStops, idx: 0, from, durationHours, returning: false, needsAdvance: false },
  });
  if (!v) return null;

  const waypoints = [startNode.id, ...validStops, from];
  const total = totalRouteLength(graph, waypoints);
  if (total) v._paceMul = THREE.MathUtils.clamp(total / AVG_TOUR_SPEED_MS / Math.max(1, durationHours * 3600), 0.4, 1.8);

  const firstTarget = validStops.length ? validStops[0] : from;
  if (!planRouteTo(graph, v, firstTarget)) { kit.free(v._handle); return null; }

  mgr.addVehicle(v);
  ctx.events.emit('vehicle:spawned', { id });
  return id;
}

function lineOfSight(world, ax, az, ay, bx, bz, by, steps = 6) {
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const eyeY = ay + (by - ay) * t;
    if (world.getHeight(x, z) > eyeY + 0.15) return false;
  }
  return true;
}

function checkSighting(ctx, v) {
  const animals = ctx.modules.get('animals');
  if (!animals) return false;
  // candidates reach out to the lick-boosted sightline (120 m), not the base 60 m: with the pool
  // pre-filtered to SIGHT_RADIUS the boost could never fire (dist ≤ 60 always passed the base
  // check anyway) — that is why ×1.5 measured as parity with control in P5's staggered re-measure.
  // No-lick rolls are unaffected: the radius test below still requires the nearest animal ≤ 60 m.
  const near = animals.nearest(v.x, v.z, SIGHT_RADIUS * 2);
  if (!near || !near.length) return false;
  const a = near[0];
  let radius = SIGHT_RADIUS;
  // Wave P5 salt lick (docs/specs/p5-rainfall-locusts-licks.md): an animal at a mineral lick stands
  // in the open trampled patch and lingers — the emergent wander bias alone measured too weak to
  // move the sighting rate (15/15, 19/20, 25/20 across three designs), so the spec's fallback kicks
  // in: a visitor's sightline reaches twice as far onto a lick. (×1.5 shipped in P5; raised to ×2
  // 2026-10-02 with the owner's OK: after the predation-stability fix, staggered-tour measurement
  // showed ×1.5's corridor — 2·√(90²−60²) ≈ 134 m of road with the lick 60 m off it — left with-lick
  // sightings at parity with control (38 vs 39 over 8 tours); ×2's ≈ 208 m corridor clears the bar
  // without touching the base 60 m radius or any no-lick roll. docs/requests/p5.md #4.)
  const licks = ctx.world.saltLicks;
  if (licks?.size) {
    for (const l of licks.values()) {
      if ((a.x - l.x) ** 2 + (a.z - l.z) ** 2 <= (l.radius ?? 10) ** 2) { radius = SIGHT_RADIUS * 2; break; }
    }
  }
  const dist = Math.hypot(a.x - v.x, a.z - v.z);
  if (dist > radius) return false;
  const world = ctx.world;
  if (!lineOfSight(world, v.x, v.z, v.y + 1.6, a.x, a.z, (a.y ?? 0) + 1)) return false;
  v._state = 'sighting';
  v._stopTimer = v._rng.range(SIGHT_MIN_STOP, SIGHT_MAX_STOP);
  v._sightAnimalId = a.id;
  v._sightYaw = Math.atan2(a.x - v.x, a.z - v.z) - v.heading;
  ctx.events.emit('visitor:sighting', { species: a.species, vehicleId: v.id, distance: dist });
  return true;
}

/** Per-frame tour bookkeeping: stop timers, sighting checks, and advancing to the next stop / home.
 * `vehicleArr` is the same flat array update() iterates — read-only here except for the state fields
 * on each vehicle; actual removal is deferred to `mgr.dropVehicle` after the loop so a tour finishing
 * mid-scan can never disturb the array index another vehicle is being read from. */
export function stepTours(ctx, graph, vehicleArr, mgr, dt) {
  _toDespawn.length = 0;
  for (let i = 0; i < vehicleArr.length; i++) {
    const v = vehicleArr[i];
    if (v._sightCooldown > 0) v._sightCooldown -= dt;

    if (v._state === 'sighting' || v._state === 'stopped') {
      v._stopTimer -= dt;
      if (v._stopTimer <= 0) { v._state = 'drive'; v._sightAnimalId = null; v._sightCooldown = SIGHT_COOLDOWN; }
      continue;
    }

    if (v._tour && v._state === 'drive' && (v._sightCooldown ?? 0) <= 0) checkSighting(ctx, v);

    if (v._tour && v._tour.needsAdvance) {
      v._tour.needsAdvance = false;
      const t = v._tour;
      if (t.idx < t.stops.length) {
        const target = t.stops[t.idx++];
        if (!planRouteTo(graph, v, target)) { t.returning = true; if (!planRouteTo(graph, v, t.from)) _toDespawn.push(v); }
      } else if (!t.returning) {
        t.returning = true;
        if (!planRouteTo(graph, v, t.from)) _toDespawn.push(v);
      } else {
        _toDespawn.push(v);
      }
    }
  }
  for (let i = 0; i < _toDespawn.length; i++) {
    const v = _toDespawn[i];
    mgr.dropVehicle(v);
    ctx.events.emit('vehicle:despawned', { id: v.id });
  }
}
