#!/usr/bin/env node
// Headless test of the SimSafari simulation: runs 90 game days on synthetic parks and asserts the spec behaviours.
//   node src/modules/simulation/test.mjs
// Plain node, no dependencies beyond src/core/Rng.js (pure JS). Exit code 1 on any failed assertion.
import { Rng } from '../../core/Rng.js';
import { Simulation } from './sim.js';
import { createPlainWorld, buildPark, applyPark } from './worldgen.js';

const failures = [];
const passes = [];
function assert(cond, msg) { (cond ? passes : failures).push(msg); console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); }
const fmt = (n) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : (+n).toFixed(Math.abs(n) < 10 ? 2 : 0));
const pad = (s, n, right = false) => { s = String(s); return right ? s.padStart(n) : s.padEnd(n); };

function makeSim(seed, opts = {}, hooks = {}) {
  const world = createPlainWorld({ seed });
  const rng = new Rng(seed);
  const park = buildPark(world, rng.fork('park'), opts);
  const notes = [];
  const events = [];
  const sim = new Simulation(world, rng.fork('sim'), { notify: (l, t) => notes.push(`${l}: ${t}`), emit: (n, p) => events.push({ n, p }), ...hooks });
  applyPark(sim, park);
  return { world, sim, notes, events, park };
}

function run(label, seed, opts, days = 90, before) {
  const t0 = performance.now();
  const s = makeSim(seed, opts);
  if (before) before(s);
  s.sim.runDays(days);
  s.ms = performance.now() - t0;
  s.label = label;
  s.first = s.world.economy.history[0];
  s.last = s.world.economy.history[s.world.economy.history.length - 1];
  return s;
}

console.log('\nSimSafari simulation — 90-day headless test\n');

// ---------------------------------------------------------------- scenarios
const scenarios = [
  run('baseline', 1, {}),
  run('boom', 1, { ticketPrice: 15, water: 0.2, shade: 0.1, roadKind: 'gravel' }),
  run('bust', 1, { ticketPrice: 80, water: -1, waterholes: false, lodge: false, roads: 'loop', cash: 15000, loan: 200000 }),
  run('no-roads', 1, { roads: 'none', hides: false }),
  run('terrain-biome', 1, { biome: true }),
];

// ---------------------------------------------------------------- summary table
const cols = [['scenario', 14], ['cash d1', 11, 1], ['cash d90', 11, 1], ['Δcash', 11, 1], ['visit/d', 8, 1], ['sat', 6, 1], ['rep', 6, 1], ['pop d1', 7, 1], ['pop d90', 8, 1], ['born', 5, 1], ['died', 5, 1], ['left', 5, 1], ['morale', 7, 1], ['events', 7, 1], ['ms', 6, 1]];
console.log(cols.map(([n, w, r]) => pad(n, w, r)).join(' '));
console.log(cols.map(([, w]) => '-'.repeat(w)).join(' '));
for (const s of scenarios) {
  const h = s.world.economy.history;
  const avgVisitors = h.reduce((a, r) => a + r.visitors, 0) / h.length;
  const nEvents = s.sim.reports.reduce((a, r) => a + r.events.length, 0);
  const row = [s.label, fmt(s.first.cash), fmt(s.last.cash), fmt(s.last.cash - s.first.cash), fmt(avgVisitors), s.last.satisfaction.toFixed(2), s.last.reputation.toFixed(2),
    s.first.population, s.last.population, s.sim.totals.born, s.sim.totals.died, s.sim.totals.left, s.last.morale.toFixed(2), nEvents, s.ms.toFixed(0)];
  console.log(row.map((v, i) => pad(v, cols[i][1], cols[i][2])).join(' '));
}
console.log('');

// ---------------------------------------------------------------- assertions
const base = scenarios[0], boom = scenarios[1], bust = scenarios[2], noRoads = scenarios[3], biome = scenarios[4];

console.log('economy');
assert(base.world.economy.history.length === 90, 'history has one entry per day (90)');
assert(base.last.cash !== base.first.cash, 'cash changes over time');
assert(base.last.income > 0 && base.last.expenses > 0, `daily income ($${fmt(base.last.income)}) and expenses ($${fmt(base.last.expenses)}) are both positive`);
const rep = base.sim.getReport();
assert(rep && rep.day === 90 && rep.incomeBreakdown.tickets > 0 && rep.incomeBreakdown.lodge > 0 && rep.expenseBreakdown.staff > 0 && rep.expenseBreakdown.feed > 0,
  'report has ticket + lodge income and staff + feed expenses');
assert(Math.abs(rep.income - Math.round(Object.values(rep.incomeBreakdown).reduce((a, b) => a + b, 0))) <= 1, 'income equals the sum of its breakdown');
assert(base.last.cash > base.first.cash, `a well-designed park makes money (d1 $${fmt(base.first.cash)} → d90 $${fmt(base.last.cash)})`);
assert(boom.last.cash - boom.first.cash > base.last.cash - base.first.cash, 'boom (cheap tickets, better habitats, gravel roads) earns more than baseline');
assert(bust.last.cash < bust.first.cash, `bust (no water, expensive tickets, loan) loses money (d1 $${fmt(bust.first.cash)} → d90 $${fmt(bust.last.cash)})`);
assert(bust.sim.bankrupt === true, `bust park goes bankrupt (cash < -50k for 5 days) — flagged on day ${bust.sim.reports.find((r) => r.bankrupt)?.day}`);
assert(bust.events.some((e) => e.n === 'sim:bankrupt'), 'sim:bankrupt event emitted');
assert(bust.sim.reports.some((r) => r.expenseBreakdown.interest > 0), 'loan interest is charged daily');

console.log('visitors');
const boomVisitors = boom.world.economy.history.slice(-30).reduce((a, r) => a + r.visitors, 0) / 30;
const bustVisitors = bust.world.economy.history.slice(-30).reduce((a, r) => a + r.visitors, 0) / 30;
const baseVisitors = base.world.economy.history.slice(-30).reduce((a, r) => a + r.visitors, 0) / 30;
assert(boomVisitors > baseVisitors && baseVisitors > bustVisitors, `arrivals respond to price + reputation: boom ${boomVisitors.toFixed(0)}/d > baseline ${baseVisitors.toFixed(0)}/d > bust ${bustVisitors.toFixed(0)}/d`);
{
  const withVisitors = bust.world.economy.history.filter((r) => r.visitors > 0);
  const early = withVisitors.slice(0, 10).reduce((a, r) => a + r.satisfaction, 0) / 10;
  const late = withVisitors.slice(-10).reduce((a, r) => a + r.satisfaction, 0) / 10;
  assert(base.last.reputation > base.first.reputation + 0.1, `reputation follows satisfaction: baseline ${base.first.reputation}→${base.last.reputation}`);
  assert(late < early - 0.05 && bust.last.reputation < base.last.reputation - 0.15,
    `bust satisfaction decays as animals leave (${early.toFixed(2)}→${late.toFixed(2)} while visitors still come) and its reputation (${bust.last.reputation}) ends far below baseline (${base.last.reputation}); after bankruptcy nobody visits so reputation freezes`);
}
assert(base.world.visitors.seenSpecies.size >= 8, `visitors saw ${base.world.visitors.seenSpecies.size} species`);
assert(noRoads.last.satisfaction < base.last.satisfaction, `no roads/hides → lower satisfaction (${noRoads.last.satisfaction} < ${base.last.satisfaction})`);
assert(base.sim.reports.some((r) => r.lodgeNights > 0), 'lodge takes overnight guests');
{
  // visitor flow inside a day: arrivals only inside the gate window, in-park count rises then falls
  const s = makeSim(3);
  let maxIn = 0, arrivedBefore7 = 0;
  for (let i = 0; i < 240; i++) { s.sim.tick(0.1); if (s.sim.clock.hour < 7 && s.sim.todayArrivals > 0) arrivedBefore7++; maxIn = Math.max(maxIn, s.sim.inPark); }
  assert(arrivedBefore7 === 0 && maxIn > 0, `intraday flow: nobody arrives before the gate opens, peak in park ${Math.round(maxIn)}`);
}

console.log('habitats & population');
{
  const hab = base.world.habitats;
  const plains = [...hab.values()].find((h) => h.name === 'Acacia Plains'), river = [...hab.values()].find((h) => h.name === 'River Bend'), wood = [...hab.values()].find((h) => h.name === 'Giraffe Woodland');
  const qHippoRiver = base.sim.scoreHabitat(river, 'hippo'), qHippoPlains = base.sim.scoreHabitat(plains, 'hippo');
  assert(qHippoRiver > qHippoPlains, `hippo prefers River Bend (${qHippoRiver.toFixed(2)}) over Acacia Plains (${qHippoPlains.toFixed(2)})`);
  const qGiraffeWood = base.sim.scoreHabitat(wood, 'giraffe'), qGiraffePlains = base.sim.scoreHabitat(plains, 'giraffe');
  assert(qGiraffeWood > qGiraffePlains, `giraffe prefers the woodland (${qGiraffeWood.toFixed(2)}) over the plains (${qGiraffePlains.toFixed(2)})`);
  const qZebraPlains = base.sim.scoreHabitat(plains, 'zebra');
  assert(qZebraPlains > 0.7, `zebra habitat quality on the plains is high (${qZebraPlains.toFixed(2)})`);
  for (const s of ['zebra', 'lion', 'hippo']) for (const h of hab.values()) { const q = base.sim.scoreHabitat(h, s); if (!(q >= 0 && q <= 1)) failures.push(`score out of range ${s} ${h.name} ${q}`); }
  assert(true, 'all habitat scores in [0,1]');
  const ex = base.sim.explainHabitat(river, 'hippo');
  assert(ex && ex.water === 1 && ex.capacity > 0, `explainHabitat: hippo water term ${ex.water}, capacity ${ex.capacity}`);
  // water is the decisive lever: same habitat, water removed → lower score
  const dry = { ...river, id: 999, cells: river.cells, water: 0 };
  base.world.habitats.set(999, dry);
  assert(base.sim.scoreHabitat(dry, 'hippo') < qHippoRiver - 0.15, `removing water drops hippo quality (${base.sim.scoreHabitat(dry, 'hippo').toFixed(2)} vs ${qHippoRiver.toFixed(2)})`);
  base.world.habitats.delete(999);
  // crowding: 200 zebras on the plains is worse than 14
  assert(base.sim.scoreHabitat(plains, 'zebra', { n: 400 }) < base.sim.scoreHabitat(plains, 'zebra', { n: 14 }), 'over capacity lowers the space term');
}
assert(base.last.population > base.first.population, `population grows when happy (${base.first.population} → ${base.last.population}, born ${base.sim.totals.born})`);
assert(bust.last.population < bust.first.population, `population falls when unhappy (${bust.first.population} → ${bust.last.population}, died ${bust.sim.totals.died}, left ${bust.sim.totals.left})`);
assert(bust.sim.totals.left > 0, `unhappy animals migrate out after 3 days below 0.3 (${bust.sim.totals.left} left)`);
assert(bust.notes.some((n) => /leaving/.test(n)), 'migration is announced via notify');
{
  const hp = base.sim.getReport().happiness;
  assert(hp.hippo > 0.6 && hp.zebra > 0.6, `happy species in the baseline park: hippo ${hp.hippo}, zebra ${hp.zebra}`);
  const bp = bust.sim.getReport().happiness;
  const hipposLeft = bust.sim.count('hippo');
  assert(hipposLeft === 0 || bp.hippo < 0.45, `hippos without water are unhappy or gone (happiness ${bp.hippo ?? '-'}, count ${hipposLeft})`);
}
assert(base.sim.totals.predation > 0, `lions and cheetahs hunt (${base.sim.totals.predation} prey taken)`);
{
  const fresh = makeSim(1, { biome: true }), plain = makeSim(1, {});
  const g1 = fresh.sim.habitatStat([...fresh.world.habitats.values()][0]).grass, g0 = plain.sim.habitatStat([...plain.world.habitats.values()][0]).grass;
  assert(g1 === 1 && g0 === 0.85, `terrain-derived grass density is used when the terrain has been built (biome ${g1} vs hint ${g0})`);
  assert(biome.last.cash > biome.first.cash, 'terrain-biome park still runs a full 90 days');
}

console.log('staff & village');
{
  const s = makeSim(5);
  const before = s.sim.hire('ranger', 0);
  s.sim.hire('keeper', 4); s.sim.runDays(2);
  const wages1 = s.sim.getReport().expenseBreakdown.staff;
  s.sim.fire('keeper', 4); s.sim.fire('ranger', 3); s.sim.runDays(2);
  const wages2 = s.sim.getReport().expenseBreakdown.staff;
  assert(wages1 > wages2, `hire/fire changes wages ($${fmt(wages1)} → $${fmt(wages2)})`);
  s.sim.hire('ranger', 3);
  const lowWage = makeSim(5); for (const r of ['ranger', 'keeper', 'guide', 'maintenance', 'lodge']) lowWage.sim.setWage(r, 20);
  lowWage.sim.runDays(60);
  const fair = makeSim(5); fair.sim.runDays(60);
  assert(lowWage.sim.morale < fair.sim.morale - 0.1, `low wages → low morale (${lowWage.sim.morale.toFixed(2)} vs ${fair.sim.morale.toFixed(2)})`);
  assert(lowWage.sim.efficiency < fair.sim.efficiency, `low morale → lower upkeep efficiency (${lowWage.sim.efficiency.toFixed(2)} vs ${fair.sim.efficiency.toFixed(2)})`);
  assert(lowWage.sim.getReport().expenseBreakdown.buildings > fair.sim.getReport().expenseBreakdown.buildings, 'low efficiency → higher building upkeep');
  assert(fair.sim.prosperity > 0.5, `village prosperity rises with a successful park (${fair.sim.prosperity.toFixed(2)})`);
  assert(before === 3, 'starting staff applied');
}

console.log('events');
{
  const all = [];
  for (const s of scenarios) for (const r of s.sim.reports) for (const e of r.events) all.push(e.type);
  const types = new Set(all);
  assert(all.length > 0, `random events occurred (${all.length} across scenarios: ${[...types].join(', ')})`);
  assert(types.has('poachers') || types.has('disease') || types.has('drought'), 'at least one hazard type (poachers/disease/drought) fired');
  assert(scenarios.some((s) => s.notes.length > 0), 'events notify via hooks.notify');
  // a park with no rangers and terrible morale gets poached more often over 400 days
  const risky = makeSim(9, { staff: { ranger: 0, keeper: 1, guide: 1, maintenance: 1, lodge: 1 } }); for (const r of ['ranger', 'keeper', 'guide', 'maintenance', 'lodge']) risky.sim.setWage(r, 10);
  risky.sim.runDays(400);
  const safe = makeSim(9, { staff: { ranger: 8 } }); safe.sim.runDays(400);
  assert(risky.sim.totals.poached > safe.sim.totals.poached, `poaching risk rises with low morale and no rangers (${risky.sim.totals.poached} vs ${safe.sim.totals.poached} animals poached in 400 days)`);
}

console.log('API');
{
  const s = makeSim(7);
  s.sim.setTicketPrice(40);
  assert(s.world.economy.ticketPrice === 40, 'setTicketPrice writes world.economy.ticketPrice');
  const cash0 = s.world.economy.cash;
  const got = s.sim.takeLoan(50000);
  assert(got === 50000 && s.world.economy.cash === cash0 + 50000 && s.world.economy.loans === 50000, 'takeLoan adds cash and debt');
  s.sim.repayLoan(20000);
  assert(s.world.economy.loans === 30000, 'repayLoan reduces debt');
  const r = s.sim.buyAnimals('elephant', 2, 2);
  assert(r.ok && s.sim.count('elephant') === 8, 'buyAnimals costs cash and adds animals');
  s.sim.runDays(1);
  const st = s.sim.getState();
  assert(st.day === 2 && Number.isFinite(st.cash) && st.population.elephant === 8 && st.staff.ranger.n === 3, 'getState() reports day, cash, population, staff');
  assert(typeof s.sim.getVisitorSatisfaction() === 'number', 'getVisitorSatisfaction()');
  assert(s.events.filter((e) => e.n === 'sim:day').length === 1 && s.events.some((e) => e.n === 'economy:updated'), 'sim:day and economy:updated emitted once per day');
  // reset restores the start state and re-seeds
  s.sim.runDays(10);
  s.sim.reset(7);
  assert(s.sim.clock.day === 1 && s.sim.count('elephant') === 6 && s.world.economy.history.length === 0, 'reset(seed) restores day 1 and the start population (6 elephants, purchase undone)');
  // core-driven clock: hour/day passed in
  const c = makeSim(8);
  for (let d = 1; d <= 3; d++) for (let i = 0; i < 240; i++) c.sim.tick(0.1, (i + 1) * 0.1 % 24, i === 239 ? d + 1 : d);
  assert(c.sim.reports.length === 3, `core-driven clock triggers one report per day (${c.sim.reports.length})`);
  // hooks: spawn/remove called with counts, sightings from traffic blend in
  const calls = { spawn: 0, remove: 0 };
  const h = makeSim(11, {}, { spawn: (sp, hid, n) => { calls.spawn += n; }, remove: (sp, hid, n) => { calls.remove += n; }, takeSightings: () => new Map([['lion', 30]]) });
  h.sim.runDays(60);
  assert(calls.spawn === h.sim.totals.born && calls.remove === h.sim.totals.died + h.sim.totals.left, `spawn/remove hooks mirror births (${calls.spawn}) and deaths+migration (${calls.remove})`);
  // speciesInfo hook overrides the fallback table
  const o = makeSim(12, {}, { speciesInfo: (sp) => (sp === 'zebra' ? { prefs: { water: 1.0 }, rarity: 1 } : null) });
  assert(o.sim.species('zebra').prefs.water === 1 && o.sim.species('zebra').rarity === 1 && o.sim.species('lion').rarity === 0.95, 'speciesInfo hook merges over the fallback table');
}

console.log('determinism');
{
  const a = run('det-a', 42, {}, 90), b = run('det-b', 42, {}, 90), c = run('det-c', 43, {}, 90);
  const ja = JSON.stringify(a.world.economy.history), jb = JSON.stringify(b.world.economy.history), jc = JSON.stringify(c.world.economy.history);
  assert(ja === jb, `same seed → identical 90-day history (cash d90 $${fmt(a.last.cash)})`);
  assert(ja !== jc, `different seed → different history (cash d90 $${fmt(c.last.cash)})`);
  assert(JSON.stringify(a.sim.getReport()) === JSON.stringify(b.sim.getReport()), 'same seed → identical final report');
}

// ---------------------------------------------------------------- last report of the baseline park
const R = base.sim.getReport();
console.log(`\nbaseline day ${R.day}: cash $${fmt(R.cash)}  income $${fmt(R.income)}  expenses $${fmt(R.expenses)}  visitors ${R.visitors}  sat ${(R.satisfaction * 100).toFixed(0)} %  rep ${(R.reputation * 100).toFixed(0)} %  morale ${(R.morale * 100).toFixed(0)} %  village ${(R.prosperity * 100).toFixed(0)} %  season ${R.season}`);
console.log('  population: ' + Object.entries(R.population).map(([s, n]) => `${s} ${n} (${(R.happiness[s] * 100).toFixed(0)} %)`).join(', '));
console.log('  income: ' + Object.entries(R.incomeBreakdown).map(([k, v]) => `${k} $${fmt(v)}`).join(', '));
console.log('  expenses: ' + Object.entries(R.expenseBreakdown).map(([k, v]) => `${k} $${fmt(v)}`).join(', '));
const evs = base.sim.reports.flatMap((r) => r.events).slice(-5);
console.log('  recent events: ' + (evs.length ? evs.map((e) => `d${e.day} ${e.type}`).join(', ') : 'none'));

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) { console.log('failures:\n  ' + failures.join('\n  ')); process.exit(1); }
