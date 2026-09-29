// Advisors (Wave P4, docs/specs/p4-camp-advisors.md §4). Advisors are DATA, not sim: `advise()` is
// a pure function of one daily report plus the memo it returned yesterday — no DOM, no rng, no
// timing — so it is node-testable and free play stays bit-identical (it draws nothing).
//
// Signature note (recorded in docs/requests/p4.md): the spec sketches `advise(report, prevAdvice)
// → [{advisor, level, key, text}]`. Hysteresis ("a message that fired stays until its metric
// recovers past a second threshold") is derivable from yesterday's message list, but the ≥ 3-day
// cooldown per key needs the day a key last CLEARED, which a bare list cannot carry. `advise`
// therefore takes/returns a small state object and returns `{ messages, state }`; the messages are
// exactly the spec's rows (plus `since`, the day the message first fired). The sim stores the
// state between days and exposes the message list via `getAdvice()`.
//
// Personas (ours): ecologist (animals, vegetation, fire), treasurer (cash, rates, occupancy),
// community liaison (staff balance, trust, poaching).

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Rule table. Each rule: { advisor, key, level, metric(report) → number | null, start, clear, text }.
 * A rule FIRES when its metric crosses `start` (warn) / `start` (critical's own line) and CLEARS
 * only when the metric recovers past `clear` (hysteresis band). null metric = rule not applicable
 * today (e.g. no fires at all) — treated as clear.
 */
const RULES = [
  // ---- ecologist: animals, vegetation, fire
  { advisor: 'ecologist', key: 'herd-unhappy', level: 'warn', start: 0.45, clear: 0.55,
    metric: (r) => { const h = r.happiness || {}; let worst = 1; for (const k in h) worst = Math.min(worst, h[k]); return Object.keys(h).length ? worst : null; },
    text: (r) => { const h = r.happiness || {}; let w = '?'; for (const k in h) if (h[k] < (h[w] ?? 9)) w = k; return `The ${w.replace('_', ' ')}s are miserable — their habitat is missing something they need.`; } },
  { advisor: 'ecologist', key: 'animals-dying', level: 'critical', start: 3, clear: 1,
    metric: (r) => (r.died ?? 0) >= 3 ? r.died : null,
    text: () => 'Animals are dying faster than the herd can replace them. Check water, food and crowding today.' },
  { advisor: 'ecologist', key: 'overgrazed', level: 'warn', start: 1.0, clear: 0.85,
    metric: (r) => { const hs = r.habitats || {}; let worst = 0; for (const h of Object.values(hs)) for (const s of Object.values(h.species || {})) { const f = s.food, need = s.n && s.perAnimal ? s.n * s.perAnimal : null; if (f != null && need) worst = Math.max(worst, need / f); } return worst > 0 ? worst : null; },
    text: () => 'A habitat is being grazed faster than it regrows — the herds will feel it within weeks.' },
  { advisor: 'ecologist', key: 'fire-burning', level: 'critical', start: 1, clear: 1,
    metric: (r) => ((r.events || []).some((e) => e.type === 'fire') ? 1 : null),
    text: () => 'Fire on the range! Cut breaks ahead of the front and wet what matters.' },
  { advisor: 'ecologist', key: 'biodiversity-low', level: 'warn', start: 60, clear: 70, dir: 'below',
    metric: (r) => r.biodiversity?.index ?? null,
    text: () => 'The range is slipping toward a monoculture — species balance and plants matter as much as head-count.' },
  // ---- treasurer: cash, rates, occupancy
  { advisor: 'treasurer', key: 'losing-money', level: 'warn', start: 0, clear: 0.0001, dir: 'below',
    metric: (r) => (r.net ?? 0) < 0 ? r.net : null,
    text: (r) => `The books are under water (−$${Math.abs(Math.round(r.net)).toLocaleString('en-US')} yesterday). Ticket price, staffing or the feed bill.` },
  { advisor: 'treasurer', key: 'near-bankrupt', level: 'critical', start: -20000, clear: -5000, dir: 'below',
    metric: (r) => (r.cash ?? 0) < -20000 ? r.cash : null,
    text: () => 'The bank is at the door. Cut costs or raise the gate before foreclosure.' },
  { advisor: 'treasurer', key: 'rooms-idle', level: 'warn', start: 1, clear: 1,
    metric: (r) => { const L = r.lodging || {}; for (const t in L) if ((L[t].beds ?? 0) > 6 && (L[t].occupancy ?? 0) < 0.5) return 1; return null; },
    text: (r) => { const L = r.lodging || {}; const idle = Object.keys(L).filter((t) => (L[t].beds ?? 0) > 6 && (L[t].occupancy ?? 0) < 0.5); return `Half the ${idle.join(' and ')} beds sit empty — the room rate is above what travellers will pay.`; } },
  { advisor: 'treasurer', key: 'rooms-turning-away', level: 'info', start: 1, clear: 0,
    metric: (r) => { const L = r.lodging || {}; let lost = 0; for (const t in L) lost += Math.max(0, (L[t].want ?? 0) - (L[t].occupied ?? 0)); return lost >= 5 ? lost : null; },
    text: (r) => { const L = r.lodging || {}; let lost = 0; for (const t in L) lost += Math.max(0, (L[t].want ?? 0) - (L[t].occupied ?? 0)); return `We turned away about ${Math.round(lost)} would-be guests last night — beds, not price, are the constraint.`; } },
  // ---- community liaison: staff balance, trust, poaching
  { advisor: 'liaison', key: 'layoff-memory', level: 'warn', start: 0.5, clear: 0.58, dir: 'below',
    metric: (r) => r.villageTrust ?? null,
    text: () => 'The village has not forgotten the layoffs. Trust returns slowly — poaching will stay high until it does.' },
  { advisor: 'liaison', key: 'poach-risk', level: 'critical', start: 0.02, clear: 0.008,
    metric: (r) => (r.poachRisk ?? 0) >= 0.02 ? r.poachRisk : null,
    text: () => 'Poachers are circling. Rangers, wages and the village\'s goodwill are the only things they respect.' },
  { advisor: 'liaison', key: 'understaffed', level: 'warn', start: 1, clear: 0,
    metric: (r) => { const c = r.staffCoverage || {}; const gaps = Object.keys(c).filter((k) => c[k] < 0.7); return gaps.length ? 1 : null; },
    text: (r) => { const c = r.staffCoverage || {}; const gaps = Object.keys(c).filter((k) => c[k] < 0.7); return `${gaps.map((g) => g + 's').join(', ')} cannot cover the park — care, guiding and morale all suffer.`; } },
  { advisor: 'liaison', key: 'morale-low', level: 'warn', start: 0.4, clear: 0.5, dir: 'below',
    metric: (r) => r.morale ?? null,
    text: () => 'Crew morale is low — wages, workload or the village. Unhappy staff cost you everywhere.' },
];

const LEVEL_RANK = { info: 0, warn: 1, critical: 2 };
const COOLDOWN_DAYS = 3;

/**
 * One advisory pass.
 * @param {object} report  the day's report (sim.js shape)
 * @param {object|null} prevState  the state returned yesterday ({day, active, cleared}) or null
 * @returns {{messages: [{advisor, level, key, text, since}], state: {day, active, cleared}}}
 */
export function advise(report, prevState = null) {
  const day = report?.day ?? 0;
  const prev = prevState && prevState.day === day - 1 ? prevState : null;
  const activeIn = prev?.active || {};   // key → {level, since}
  const clearedIn = prev?.cleared || {}; // key → day it cleared
  const active = {};
  const cleared = { ...clearedIn };
  const messages = [];
  for (const rule of RULES) {
    const v = rule.metric(report);
    if (v === null) {
      // not applicable today (no fires, no idle wings, …): an active message clears immediately
      if (activeIn[rule.key]) cleared[rule.key] = day;
      continue;
    }
    const crossed = (rule.dir === 'below')
      ? v <= rule.start                 // bad when at/below start (trust, cash, morale, biodiversity)
      : v >= rule.start;                // bad when at/above start (deaths, poach risk…)
    const recovered = (rule.dir === 'below')
      ? v > rule.clear
      : v < rule.clear;
    const was = activeIn[rule.key];
    if (was) {
      if (recovered) {
        cleared[rule.key] = day; // hysteresis band left: clear and start the cooldown clock
      } else {
        active[rule.key] = was;  // sticky until the recovery line is crossed
        messages.push({ advisor: rule.advisor, level: was.level, key: rule.key, since: was.since, text: rule.text(report) });
      }
    } else if (crossed) {
      const cooled = cleared[rule.key] === undefined || day - cleared[rule.key] >= COOLDOWN_DAYS;
      if (cooled) {
        active[rule.key] = { level: rule.level, since: day };
        messages.push({ advisor: rule.advisor, level: rule.level, key: rule.key, since: day, text: rule.text(report) });
        delete cleared[rule.key];
      }
      // still on cooldown: stay silent this cycle (the metric will still be bad tomorrow)
    }
  }
  messages.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.key.localeCompare(b.key));
  return { messages, state: { day, active, cleared } };
}

/** The three personas (ui portraits). */
export const ADVISORS = Object.freeze([
  { id: 'ecologist', name: 'Ecologist', icon: 'species' },
  { id: 'treasurer', name: 'Treasurer', icon: 'coin' },
  { id: 'liaison', name: 'Community liaison', icon: 'social' },
]);

export { clamp01 };
