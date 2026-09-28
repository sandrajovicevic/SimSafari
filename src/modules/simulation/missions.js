// Missions (Wave P3, docs/specs/p3-biodiversity-missions.md). A data table plus the objective
// evaluator. simulation owns both and exposes them through its API (listMissions / startMission /
// abandonMission / getMissionState); ui renders, park wires the &mission= URL param. Pure JS: runs
// in Node (test.mjs) and in the browser. The evaluator never touches the sim's main rng stream —
// scheduled fire days/places come from a forked Rng('mission:<id>:<seed>'), so free play (no active
// mission) is bit-identical to the pre-P3 game.
import { Rng } from '../../core/Rng.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Mission rows. `goal` types (docs/specs/p3-biodiversity-missions.md):
 *   population   { species, n }                ledger count >= n on or before the deadline
 *   hold         { metric, min?, max?, days }  a report metric (dot path) stays in range for
 *                                              `days` consecutive days, within the deadline
 *   cash         { amount }                    cash − loans >= amount on or before the deadline
 *   survive-fire { fires, stamina, maxBuildingsLost, maxHa }
 *                                              `fires` scripted ignitions (deterministic days and
 *                                              places from Rng('mission:<id>:<seed>'), each with its
 *                                              own `stamina` cell budget); won if the season ends
 *                                              inside both loss limits, hard-failed the moment a
 *                                              limit is crossed
 *
 * `stars` = [1-star, 2-star, 3-star] margins, measured on the same quantity the goal measures at
 * the moment the mission is won (kept simple and per-type):
 *   population   lion count at award               [n, n+2, n+4]
 *   hold         consecutive days, then the run's mean metric above the floor [days, +2, +4]
 *   cash         net cash, then how much of the deadline was still left   [amount, 0.25, 0.5]
 *   survive-fire loss limits                       [{b,ha}, {b,ha}, {b,ha}]
 *
 * Placeholder numbers are calibrated by measurement on the demo park (seed 1) — every value below
 * is the measured one; see the simulation README "Wave P3" section for the calibration table.
 */
export const MISSIONS = Object.freeze([
  {
    id: 'pride',
    name: 'The Pride Grows',
    brief: 'Visitors cross the world for a big cat sighting. Grow the lion pride to a healthy size — the rangers will call it a success at six.',
    goal: Object.freeze({ type: 'population', species: 'lion', n: 6 }),
    deadlineDays: 180,
    stars: Object.freeze([6, 8, 10]),
  },
  {
    id: 'balanced-range',
    name: 'A Balanced Range',
    brief: 'A good park is not just a list of species — herds in balance, browse and grass everywhere. Hold the biodiversity index high for two months.',
    goal: Object.freeze({ type: 'hold', metric: 'biodiversity.index', min: 68, days: 60 }),
    deadlineDays: 240,
    stars: Object.freeze([60, 2, 4]),
  },
  {
    id: 'in-the-black',
    name: 'In the Black',
    brief: 'Conservation is expensive. Build the park into a business the bank believes in — a season of profit, clear of any loans.',
    goal: Object.freeze({ type: 'cash', amount: 600000 }),
    deadlineDays: 365,
    stars: Object.freeze([600000, 0.25, 0.5]),
  },
  {
    id: 'fire-season',
    name: 'Fire Season',
    brief: 'The long dry is here and the lightning is looking for fuel. Three wildfires will threaten the park — hold the line: protect the buildings and the range.',
    goal: Object.freeze({ type: 'survive-fire', fires: 3, stamina: 150, maxBuildingsLost: 1, maxHa: 15 }),
    deadlineDays: 90,
    stars: Object.freeze([
      Object.freeze({ buildings: 1, ha: 15 }),
      Object.freeze({ buildings: 0, ha: 10 }),
      Object.freeze({ buildings: 0, ha: 4 }),
    ]),
  },
]);

const byId = new Map(MISSIONS.map((m) => [m.id, m]));

/** Read a dot path ('biodiversity.index', 'satisfaction') out of a report → number | null. */
export function metricValue(report, path) {
  if (!path) return null;
  let v = report;
  for (const k of String(path).split('.')) {
    if (v == null || typeof v !== 'object') return null;
    v = v[k];
  }
  return typeof v === 'number' ? v : null;
}

/**
 * Per-sim mission state machine. The sim calls:
 *   ignitions(day)  at the TOP of its day end (before the vegetation/fire step) so a scheduled
 *                   ignition lands in that day's report and spreads the same evening;
 *   step(day, report) once per day end AFTER the report is built (the evaluator proper);
 *   noteBuildingLost() from its burnt-building path while a survive-fire mission runs.
 * Emits mission:progress {id, progress, day} daily while active and mission:completed
 * {id, won, stars, day} once, through the sim's event hook.
 */
export class MissionRunner {
  /** @param {import('./sim.js').Simulation} sim */
  constructor(sim) {
    this.sim = sim;
    this.reset();
  }

  /** Clear all mission state (fresh game, reset(), or abandon). */
  reset() {
    this.mission = null;
    this.status = 'none';       // 'none' | 'active' | 'won' | 'failed'
    this.startDay = 0;
    this.deadline = 0;
    this.progress = 0;
    this.stars = 0;
    this.endDay = 0;            // day the mission was won/failed
    this.detail = null;
    this.streak = 0;            // hold: consecutive in-range days
    this.streakSum = 0;         // hold: Σ metric over the current streak
    this.schedule = null;       // survive-fire: [{day, done}]
    this.fire = null;           // survive-fire: { buildings, haStart }
    this.rng = null;            // the mission's forked stream (days + places)
  }

  list() { return MISSIONS; }

  /** Start a mission on `day`. `id` is a table id, or a mission row object (test path — synthetic
   * goals against synthetic reports). Resets any prior mission state, not the park. */
  start(id, day) {
    const m = typeof id === 'string' ? byId.get(id) : id && id.goal ? id : null;
    if (!m) return { ok: false, error: `unknown mission "${id}"` };
    this.reset();
    this.mission = m;
    this.status = 'active';
    this.startDay = day;
    this.deadline = day + m.deadlineDays;
    this.rng = new Rng(`mission:${m.id}:${this.sim.seed}`);
    if (m.goal.type === 'survive-fire') {
      const W = m.deadlineDays, F = m.goal.fires;
      this.schedule = [];
      for (let i = 0; i < F; i++) {
        // spread the ignitions across the window (fire 0 in the first sixth, last one early enough
        // to burn out before the season ends); exact days from the mission's own stream
        const d = day + Math.max(1, Math.round(W * (i + 0.2 + 0.3 * this.rng.float()) / F));
        this.schedule.push({ day: d, done: false });
      }
      this.schedule.sort((a, b) => a.day - b.day);
      this.fire = { buildings: 0, haStart: this.sim.veg.burntOutTotal };
    }
    this.detail = this._goalSummary();
    return { ok: true };
  }

  /** Give up: back to no mission (no completed event — nothing was completed). */
  abandon() {
    if (this.status !== 'active') return;
    this.reset();
  }

  /** The public state payload (simulation.getMissionState()). */
  state() {
    return {
      id: this.mission?.id ?? null,
      status: this.status,
      day: this.sim.clock.day,
      deadline: this.status === 'none' ? null : this.deadline,
      progress: +clamp01(this.progress).toFixed(4),
      stars: this.status === 'won' ? this.stars : 0,
      detail: this.detail,
    };
  }

  /** Scheduled ignitions for `day` (top of the sim's day end). Each fire gets its OWN stamina
   * budget: ignite() resets the budget whenever nothing is burning, and the schedule spaces fires
   * far apart, so the second (third…) fire never inherits the first one's spent budget. */
  ignitions(day) {
    if (this.status !== 'active' || !this.schedule) return;
    for (const s of this.schedule) {
      if (s.done || s.day !== day) continue;
      s.done = true;
      this._ignite(s);
    }
  }

  /** One scripted ignition near a stream-picked building (a fire season threatens the park's
   * assets — the player has something to defend), 70 m out in a stream-picked direction; falls
   * back to the deterministic fuel-richest site when the disc finds nothing to burn. */
  _ignite(sched) {
    const g = this.mission.goal, sim = this.sim;
    let x = null, z = null;
    const bs = [];
    for (const b of sim.world.buildings.values()) if (b && b.state !== 'burnt') bs.push(b);
    if (bs.length) {
      const b = bs[Math.floor(this.rng.float() * bs.length)];
      const ang = this.rng.float() * Math.PI * 2;
      x = b.x + Math.cos(ang) * 70;
      z = b.z + Math.sin(ang) * 70;
    }
    let lit = x !== null ? sim.veg.ignite(x, z, 24, g.stamina) : { cells: 0 };
    if (!lit.cells) {
      const spot = sim.veg.pickFireSite(this.rng.float(), 24);
      if (spot) { x = spot.x; z = spot.z; lit = sim.veg.ignite(x, z, 24, g.stamina); }
    }
    if (lit.cells) {
      sim.firesIgnited = (sim.firesIgnited ?? 0) + 1;
      sim._addEvent(this.sim.clock.day, { type: 'fire', level: 'error', text: `Fire! About ${lit.ha} ha are alight near ${Math.round(x)}, ${Math.round(z)}.` });
    }
  }

  /** Count a building the fire took (called from the sim's burnt-building path). */
  noteBuildingLost() {
    if (this.status === 'active' && this.fire) this.fire.buildings++;
  }

  /** Hectares burned out since the mission started (any fire in the window counts — it is a fire
   * season; the counter is monotone, so cells recovering or re-burning cannot double-count). */
  haLost() {
    if (!this.fire) return 0;
    return Math.max(0, this.sim.veg.burntOutTotal - this.fire.haStart) * this.sim.veg.cellHa;
  }

  /** The evaluator: once per day end, after the report is built. */
  step(day, report) {
    if (this.status !== 'active') return;
    const m = this.mission, g = m.goal;
    if (g.type === 'population') {
      const n = report.population?.[g.species] ?? 0;
      this.progress = clamp01(n / g.n);
      this.detail = { ...this.detail, count: n, target: g.n };
      if (n >= g.n) this._won(day, n >= m.stars[2] ? 3 : n >= m.stars[1] ? 2 : 1);
    } else if (g.type === 'hold') {
      const v = metricValue(report, g.metric);
      const inRange = v !== null && (g.min == null || v >= g.min) && (g.max == null || v <= g.max);
      if (inRange) { this.streak++; this.streakSum += v; } else { this.streak = 0; this.streakSum = 0; }
      this.progress = clamp01(this.streak / g.days);
      const mean = this.streak > 0 ? this.streakSum / this.streak : null;
      this.detail = { ...this.detail, value: v, streak: this.streak, need: g.days, mean: mean === null ? null : +mean.toFixed(2) };
      if (this.streak >= g.days) {
        const over = mean !== null ? mean - (g.min ?? 0) : 0;
        this._won(day, over >= m.stars[2] ? 3 : over >= m.stars[1] ? 2 : 1);
      }
    } else if (g.type === 'cash') {
      const net = (report.cash ?? 0) - (report.loans ?? 0);
      this.progress = clamp01(Math.max(0, net) / g.amount);
      this.detail = { ...this.detail, net: Math.round(net), target: g.amount };
      if (net >= g.amount) {
        const left = (this.deadline - day) / m.deadlineDays;
        this._won(day, left >= m.stars[2] ? 3 : left >= m.stars[1] ? 2 : 1);
      }
    } else if (g.type === 'survive-fire') {
      const ha = this.haLost();
      const next = this.schedule.find((s) => !s.done);
      this.progress = clamp01((day - this.startDay) / m.deadlineDays);
      this.detail = { ...this.detail, buildingsLost: this.fire.buildings, haLost: +ha.toFixed(2), maxBuildingsLost: g.maxBuildingsLost, maxHa: g.maxHa, firesLeft: this.schedule.filter((s) => !s.done).length, nextFireDay: next ? next.day : null };
      if (this.fire.buildings > g.maxBuildingsLost || ha > g.maxHa) {
        this._failed(day, `the season cost ${this.fire.buildings} building(s) and ${ha.toFixed(1)} ha of range — over the limit`);
      } else if (day >= this.deadline) {
        const [s1, s2, s3] = m.stars;
        const stars = this.fire.buildings <= s3.buildings && ha <= s3.ha ? 3 : this.fire.buildings <= s2.buildings && ha <= s2.ha ? 2 : 1;
        this._won(day, stars);
      }
    }
    if (this.status === 'active' && day >= this.deadline && g.type !== 'survive-fire') {
      this._failed(day, 'the deadline passed');
    }
    if (this.status === 'active') {
      this.sim._emit('mission:progress', { id: m.id, progress: +clamp01(this.progress).toFixed(4), day });
    }
  }

  /** Human-readable goal line for the picker/panel (no live numbers — those live in detail). */
  _goalSummary() {
    const g = this.mission.goal;
    if (g.type === 'population') return { goal: `${g.n} ${g.species}s`, species: g.species, target: g.n };
    if (g.type === 'hold') return { goal: `hold ${g.metric} ${g.min != null ? '≥ ' + g.min : ''}${g.max != null ? ' ≤ ' + g.max : ''} for ${g.days} days`, metric: g.metric, min: g.min, max: g.max, days: g.days };
    if (g.type === 'cash') return { goal: `$${g.amount.toLocaleString('en-US')} net of loans`, amount: g.amount };
    return { goal: `survive ${g.fires} fires: ≤ ${g.maxBuildingsLost} building(s), ≤ ${g.maxHa} ha lost`, fires: g.fires, maxBuildingsLost: g.maxBuildingsLost, maxHa: g.maxHa };
  }

  _won(day, stars) {
    this.status = 'won';
    this.endDay = day;
    this.stars = stars;
    this.progress = 1;
    this.sim._emit('mission:completed', { id: this.mission.id, won: true, stars, day });
  }

  _failed(day, reason) {
    this.status = 'failed';
    this.endDay = day;
    this.detail = { ...(this.detail || {}), reason };
    this.sim._emit('mission:completed', { id: this.mission.id, won: false, stars: 0, day });
  }
}
