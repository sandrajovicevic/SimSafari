// Behaviour: needs, state machine, herds (boids), predator/prey, sleep. Decisions run in fixed 0.2 s
// steps (deterministic via ctx.rng), movement/blend easing runs per frame in integrate(dt), and needs
// drift in game-hours from tick(). No allocation in steady state.
import { ANIM } from './anim.js';

const STEP = 0.2;
export { STEP };

export const STATES = ['idle', 'graze', 'walk', 'run', 'drink', 'rest', 'sleep', 'alert', 'flee', 'stalk', 'chase', 'eat'];

function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

export function isNight(hour) { return hour < 5.5 || hour > 19.5; }
export function wantsSleep(spec, hour) {
  if (spec.activity === 'nocturnal') return hour > 8 && hour < 16;
  if (spec.activity === 'crepuscular') return (hour > 10.5 && hour < 15.5) || (hour > 23 || hour < 4);
  return hour < 5 || hour > 21;
}

export class Behaviour {
  constructor(S) {
    this.S = S;
    this.rng = S.rng;
    this._scratch = { x: 0, z: 0 };
  }

  // ---------------- transitions ----------------
  setState(a, state, duration = 0) {
    if (a.state !== state) {
      a.state = state;
      a._timer = duration;
      this.S.events.emit('animal:state', { id: a.id, species: a.species, state });
    } else a._timer = duration;
    a._targetSpeed = this.stateSpeed(a, state);
  }

  stateSpeed(a, state) {
    const sp = a._spec.speed;
    switch (state) {
      case 'walk': case 'stalk': return sp.walk * (state === 'stalk' ? 0.55 : 1) * a._scale;
      case 'graze': return sp.walk * 0.22;
      case 'run': case 'flee': case 'chase': return sp.run * a._scale;
      default: return 0;
    }
  }

  walkTo(a, x, z, arrive, timeout = 60) {
    a._tx = x; a._tz = z; a._hasTarget = true; a._arrive = arrive;
    this.setState(a, 'walk', timeout);
  }

  // ---------------- herds ----------------
  herdWander(h, dt) {
    const S = this.S, rng = this.rng;
    h.timer -= dt;
    if (h.timer > 0) return;
    h.timer = rng.range(25, 55);
    // thirsty herd → go to water
    let thirst = 0;
    for (const m of h.members) thirst += m.needs.water;
    thirst = h.members.length ? thirst / h.members.length : 1;
    if (thirst < 0.45 && S.water.length) {
      let best = null, bd = 1e9;
      for (const w of S.water) { const d = (w.x - h.home.x) ** 2 + (w.z - h.home.z) ** 2; if (d < bd) { bd = d; best = w; } }
      if (best && bd < 500 * 500) { h.tx = best.x + best.nx * 3; h.tz = best.z + best.nz * 3; h.intent = 'drink'; h.water = best; return; }
    }
    const ang = rng.float() * Math.PI * 2, rad = Math.sqrt(rng.float()) * h.home.r;
    h.tx = h.home.x + Math.cos(ang) * rad; h.tz = h.home.z + Math.sin(ang) * rad; h.intent = 'graze'; h.water = null;
  }

  herdCentroid(h) {
    let x = 0, z = 0, n = 0;
    for (const m of h.members) { x += m.x; z += m.z; n++; }
    if (n) { x /= n; z /= n; }
    h.cx = x; h.cz = z;
    return n;
  }

  // ---------------- main fixed step ----------------
  step(dt) {
    const S = this.S, rng = this.rng;
    const hour = S.world.time.hour;
    for (const h of S.herds.values()) { this.herdWander(h, dt); this.herdCentroid(h); }
    const animals = S.animals;
    for (let i = 0; i < animals.length; i++) {
      const a = animals[i];
      if (!a._spec) continue;
      const spec = a._spec, P = ANIM[spec.id];
      a._timer -= dt;
      // idle look-around
      a._lookTimer -= dt;
      if (a._lookTimer < 0) { a._lookTimer = rng.range(2, 7); a._lookTarget = a.state === 'graze' || a.state === 'sleep' ? 0 : rng.range(-0.7, 0.7) * (rng.float() < 0.5 ? 1 : 0); }
      // ear flicks (deterministic schedule)
      if (S.time > a._nextFlick) { a._nextFlick = S.time + rng.range(1.5, 7); if (rng.float() < 0.5) a._earFlickL = S.time; else a._earFlickR = S.time; }

      const held = a._hold > 0;
      if (held) a._hold -= dt;

      // fear: prey react to predators that are hunting or moving toward them
      if (spec.prey && !held && a.state !== 'flee' && spec.alertRadius > 0) {
        const pr = this.nearestPredator(a, spec.alertRadius);
        if (pr) {
          if (pr.state === 'chase' || pr.state === 'stalk' || (pr.speed > 0.5 && rng.float() < 0.4)) this.flee(a, pr);
          else if (a.state !== 'alert' && rng.float() < 0.3) this.setState(a, 'alert', rng.range(2, 5));
        }
      }

      const h = a.herd !== null ? S.herds.get(a.herd) : null;
      const sleepy = wantsSleep(spec, hour);

      switch (a.state) {
        case 'idle':
          if (held) break;
          if (a._timer < 0) {
            if (sleepy) this.setState(a, 'sleep', rng.range(30, 90));
            else if (spec.predator && a.needs.food < 0.45 && this.startHunt(a)) break;
            else if (h && h.intent === 'drink' && h.water && a.needs.water < 0.7) this.walkTo(a, h.tx + rng.range(-4, 4), h.tz + rng.range(-4, 4), 'drink', 90);
            else if (h && this.dist2(a, h.cx, h.cz) > (h.spread * 1.4) ** 2) this.walkTo(a, h.cx + rng.range(-h.spread, h.spread) * 0.5, h.cz + rng.range(-h.spread, h.spread) * 0.5, 'graze', 60);
            else if (spec.predator) this.setState(a, rng.float() < spec.lieProb ? 'rest' : 'graze', rng.range(15, 60));
            else if (rng.float() < spec.lieProb * 0.5) this.setState(a, 'rest', rng.range(20, 60));
            else this.setState(a, 'graze', rng.range(10, 40));
          }
          break;
        case 'graze':
          // drift with the herd, slow
          if (h && !held) {
            const d2 = this.dist2(a, h.tx, h.tz);
            if (d2 > (h.spread * 2.2) ** 2) { this.walkTo(a, h.tx + rng.range(-h.spread, h.spread) * 0.6, h.tz + rng.range(-h.spread, h.spread) * 0.6, h.intent === 'drink' ? 'drink' : 'graze', 90); break; }
            if (d2 > 4) { a._tx = h.tx + rng.range(-h.spread, h.spread) * 0.4; a._tz = h.tz + rng.range(-h.spread, h.spread) * 0.4; a._hasTarget = true; }
            else a._hasTarget = false;
          }
          if (!held && a._timer < 0) this.setState(a, 'idle', rng.range(2, 8));
          break;
        case 'walk': {
          const d2 = this.dist2(a, a._tx, a._tz);
          if (d2 < 2.5 * 2.5 || a._timer < 0) {
            a._hasTarget = false;
            const nxt = a._arrive || 'idle';
            if (nxt === 'drink') { this.faceWater(a); this.setState(a, 'drink', rng.range(12, 30)); }
            else this.setState(a, nxt, rng.range(10, 40));
          }
          break;
        }
        case 'drink':
          if (!held && a._timer < 0) { a.needs.water = 1; this.setState(a, 'idle', rng.range(3, 8)); }
          break;
        case 'rest':
          if (!held && a._timer < 0 && !sleepy) this.setState(a, 'idle', rng.range(2, 6));
          if (!held && sleepy) this.setState(a, 'sleep', rng.range(30, 90));
          break;
        case 'sleep':
          if (!held && !sleepy && a._timer < 0) this.setState(a, 'idle', rng.range(2, 10));
          break;
        case 'alert':
          if (!held && a._timer < 0) this.setState(a, 'idle', rng.range(1, 4));
          break;
        case 'flee': {
          const pr = a._fleeFrom;
          const far = !pr || !pr._spec || this.dist2(a, pr.x, pr.z) > (spec.alertRadius * 2.2) ** 2;
          if (pr && pr._spec) { a._desired = Math.atan2(a.x - pr.x, a.z - pr.z); }
          if ((far && a._timer < 0) || a._timer < -15) { a._fleeFrom = null; this.setState(a, 'alert', rng.range(2, 5)); }
          // herd mates panic too
          if (h) for (const m of h.members) if (m !== a && m.state !== 'flee' && m._hold <= 0 && this.dist2(m, a.x, a.z) < 30 * 30) this.flee(m, pr || a);
          break;
        }
        case 'stalk': case 'chase': {
          const prey = a._prey;
          if (!prey || !prey._spec || prey.state === 'dead') { a._prey = null; this.setState(a, 'idle', 3); break; }
          const d2 = this.dist2(a, prey.x, prey.z);
          a._desired = Math.atan2(prey.x - a.x, prey.z - a.z);
          if (a.state === 'stalk') {
            if (d2 < 22 * 22) this.setState(a, 'chase', 12);
            else if (d2 > 160 * 160 || a._timer < 0) { a._prey = null; this.setState(a, 'idle', 5); }
          } else {
            if (d2 < 2.0 * 2.0) { this.kill(a, prey); }
            else if (a._timer < 0 || d2 > 90 * 90) { a._prey = null; this.setState(a, 'rest', rng.range(20, 40)); }
          }
          break;
        }
        case 'eat':
          if (a._timer < 0) { a.needs.food = 1; this.setState(a, 'rest', rng.range(30, 80)); }
          break;
        case 'run':
          if (!held && a._timer < 0) this.setState(a, 'idle', 3);
          break;
      }

      // steering (desired heading) for moving states with a target
      if (a.state === 'walk' || a.state === 'graze' || a.state === 'run') {
        if (a._hasTarget) {
          let vx = a._tx - a.x, vz = a._tz - a.z;
          const len = Math.hypot(vx, vz) || 1; vx /= len; vz /= len;
          // separation
          const sepR = a._dims.radius * 2.4;
          for (let j = 0; j < animals.length; j++) {
            const o = animals[j]; if (o === a) continue;
            const dx = a.x - o.x, dz = a.z - o.z; const d2 = dx * dx + dz * dz;
            const rr = sepR + o._dims.radius * 1.2;
            if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2); const f = (1 - d / rr) * 1.6; vx += dx / d * f; vz += dz / d * f; }
          }
          a._desired = Math.atan2(vx, vz);
          if (a.state === 'graze') a._targetSpeed = this.dist2(a, a._tx, a._tz) > 2 ? spec.speed.walk * 0.25 : 0;
        } else if (a.state === 'graze') a._targetSpeed = 0;
      } else if (a.state === 'idle' || a.state === 'drink' || a.state === 'alert' || a.state === 'rest' || a.state === 'sleep' || a.state === 'eat') {
        // gentle separation while standing: shuffle apart if overlapping
        a._targetSpeed = 0;
      }
    }
  }

  dist2(a, x, z) { const dx = a.x - x, dz = a.z - z; return dx * dx + dz * dz; }

  faceWater(a) {
    const h = a.herd !== null ? this.S.herds.get(a.herd) : null;
    const w = h?.water || this.nearestWater(a);
    if (w) a._desired = Math.atan2(w.x - a.x, w.z - a.z);
  }

  nearestWater(a) {
    let best = null, bd = 1e12;
    for (const w of this.S.water) { const d = this.dist2(a, w.x, w.z); if (d < bd) { bd = d; best = w; } }
    return best;
  }

  nearestPredator(a, r) {
    const preds = this.S.predators;
    let best = null, bd = r * r;
    for (let i = 0; i < preds.length; i++) {
      const p = preds[i]; if (p.state === 'rest' || p.state === 'sleep' || p.state === 'eat') continue;
      const d = this.dist2(a, p.x, p.z); if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  flee(a, from) {
    a._fleeFrom = from;
    a._hasTarget = false;
    if (from) a._desired = Math.atan2(a.x - from.x, a.z - from.z);
    this.setState(a, 'flee', this.rng.range(6, 12));
  }

  startHunt(a) {
    const prey = this.S.prey;
    let best = null, bd = 150 * 150;
    for (let i = 0; i < prey.length; i++) { const p = prey[i]; const d = this.dist2(a, p.x, p.z); if (d < bd) { bd = d; best = p; } }
    if (!best) return false;
    a._prey = best; a._hasTarget = false;
    this.setState(a, 'stalk', 60);
    return true;
  }

  kill(pred, prey) {
    const S = this.S;
    pred._prey = null;
    this.setState(pred, 'eat', this.rng.range(25, 45));
    S.remove(prey.id, 'killed');
  }

  // ---------------- per-frame ----------------
  integrate(a, dt, live) {
    const spec = a._spec, P = ANIM[spec.id], dims = a._dims, world = this.S.world;
    if (live) {
      // heading
      const maxTurn = (a.state === 'flee' || a.state === 'chase' ? 2.6 : 1.6) * dt;
      const diff = wrapAngle(a._desired - a.heading);
      a.heading += clamp(diff, -maxTurn, maxTurn);
      // speed
      const ts = (a.state === 'walk' || a.state === 'graze') && Math.abs(diff) > 1.2 ? a._targetSpeed * 0.3 : a._targetSpeed;
      const accel = (a.state === 'flee' || a.state === 'chase') ? 9 : 2.5;
      a.speed += clamp(ts - a.speed, -accel * 1.5 * dt, accel * dt);
      if (a.speed < 0.01) a.speed = 0;
      // move
      if (a.speed > 0) {
        const sx = Math.sin(a.heading), sz = Math.cos(a.heading);
        let nx = a.x + sx * a.speed * dt, nz = a.z + sz * a.speed * dt;
        const H = world.half - 12;
        if (nx < -H || nx > H || nz < -H || nz > H) { a._desired = Math.atan2(-a.x, -a.z); nx = clamp(nx, -H, H); nz = clamp(nz, -H, H); }
        if (a.state !== 'drink' && spec.id !== 'hippo' && world.terrain.waterLevel > -1e8 && world.isWater(nx, nz)) {
          a._desired = a.heading + Math.PI * 0.6; a.speed *= 0.5;
        } else { a.x = nx; a.z = nz; }
      }
    }
    a.y = world.getHeight(a.x, a.z);
    // slope pitch/roll (smoothed)
    const n = this.S._n;
    world.getNormal(a.x, a.z, n);
    const sx = Math.sin(a.heading), sz = Math.cos(a.heading);
    const targetPitch = Math.atan2(-(n.x * sx + n.z * sz), n.y);
    const targetRoll = Math.atan2((n.x * sz - n.z * sx), n.y);
    const k = 1 - Math.exp(-dt * 4);
    a._pitch += (targetPitch - a._pitch) * k; a._roll += (targetRoll - a._roll) * k;
    // gait phase
    const walk = spec.speed.walk;
    const runTarget = clamp((a.speed - walk * 1.4) / (walk * 2.5), 0, 1);
    a._runW += (runTarget - a._runW) * (1 - Math.exp(-dt * 3));
    const moveTarget = a.speed > 0.03 ? 1 : 0;
    a._moveW += (moveTarget - a._moveW) * (1 - Math.exp(-dt * 6));
    const stride = dims.legLen * lerp(P.stride, P.stride * 2.1, a._runW);
    if (live) a._phase += (a.speed / Math.max(0.3, stride)) * dt;
    // blends
    const st = a.state;
    const ease = (cur, target, rate) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
    const grazer = spec.diet !== 'predator';
    a._headDown = ease(a._headDown, (st === 'graze' && grazer && a.speed < walk * 0.5) || st === 'eat' ? 1 : 0, 1.4);
    a._drinkW = ease(a._drinkW, st === 'drink' ? 1 : 0, 1.2);
    const lying = (st === 'rest' || (st === 'sleep' && !P.sleepStand) || st === 'eat' && spec.predator);
    a._lieW = ease(a._lieW, lying ? 1 : 0, 0.9);
    a._sleepW = ease(a._sleepW, st === 'sleep' ? 1 : 0, 0.8);
    a._alertW = ease(a._alertW, st === 'alert' || st === 'stalk' ? 1 : 0, 2.5);
    a._lookYaw = ease(a._lookYaw, a._lookTarget, 1.5);
  }

  /** Needs drift in game-hours. */
  tick(a, simDt) {
    const n = a.needs, st = a.state, spec = a._spec;
    n.food = clamp(n.food + (st === 'graze' || st === 'eat' ? 0.25 : -0.04) * simDt, 0, 1);
    n.water = clamp(n.water + (st === 'drink' ? 0.6 : -0.05) * simDt, 0, 1);
    n.rest = clamp(n.rest + (st === 'rest' || st === 'sleep' ? 0.2 : st === 'flee' || st === 'chase' ? -0.3 : -0.03) * simDt, 0, 1);
    n.safety = clamp(n.safety + (st === 'flee' || st === 'alert' ? -0.4 : 0.08) * simDt, 0, 1);
    const h = a.herd !== null ? this.S.herds.get(a.herd) : null;
    const social = h ? clamp(h.members.length / Math.max(1, spec.herd[0]), 0, 1) : (spec.herd[0] <= 1 ? 1 : 0.3);
    n.social = lerp(n.social, social, 0.1 * simDt);
    a.age += simDt / 24 / 365;
    const q = this.S.qualityFn ? clamp(this.S.qualityFn(a.herd, a.species) ?? 0.6, 0, 1) : 0.6;
    a.happiness = clamp((n.food * 0.3 + n.water * 0.25 + n.rest * 0.15 + n.safety * 0.15 + n.social * 0.15) * (0.4 + 0.6 * q), 0, 1);
  }
}
