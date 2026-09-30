#!/usr/bin/env node
// Headless test of the SimSafari simulation: runs 90 game days on synthetic parks and asserts the spec behaviours.
//   node src/modules/simulation/test.mjs
// Plain node, no dependencies beyond src/core/Rng.js (pure JS). Exit code 1 on any failed assertion.
import { Rng } from '../../core/Rng.js';
import { Simulation } from './sim.js';
import { createPlainWorld, buildPark, applyPark } from './worldgen.js';
import { PLANTS, PLANT_INDEX } from '../../core/Plants.js';
import { VEG } from './tables.js';
import { computeBiodiversity } from './biodiversity.js';
import { advise } from './advisors.js';

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

console.log('births mechanics, spend() and forced events (round 3)');
{
  // births: the well-watered baseline park (keepers hired, habitats above the drive gate) breeds
  const breed = run('breed-90d', 21, {}, 90);
  assert(breed.sim.totals.born > 10, `a well-kept park breeds freely over 90 days (${breed.sim.totals.born} born)`);
  assert(bust.sim.totals.born < breed.sim.totals.born / 10, `no water anywhere → happiness under the breeding drive → almost no births (${bust.sim.totals.born} vs ${breed.sim.totals.born} per 90 days)`);
  // the room term caps births at carrying capacity: 400 impala on the plains are at/over capacity
  const full = makeSim(22);
  const plains = [...full.world.habitats.values()][0];
  full.sim.setPopulation(plains.id, 'impala', 400);
  full.sim.runDays(10);
  const plainsBorn = full.sim.reports.slice(-10).reduce((a, r) => a + ((r.habitats[plains.id]?.species?.impala?.born) ?? 0), 0);
  const plainsNow = full.sim.getReport().habitats[plains.id]?.species?.impala?.n ?? -1;
  assert(plainsBorn === 0 && plainsNow >= 0 && plainsNow <= 400 && full.sim.totals.born > 0,
    `at capacity the room term stops births in that habitat (${plainsBorn} born, herd ${plainsNow}/400) while other herds keep breeding (${full.sim.totals.born} park-wide)`);
  // replan(): a park built after module init plans day 1 from an empty park (attraction 0)
  const rp = makeSim(23);
  const before = rp.sim.getState().plannedArrivals;
  assert(rp.sim.attraction === 0, 'before replan, the day-1 plan sees an empty park (attraction 0)');
  const after = rp.sim.replan();
  assert(rp.sim.attraction > 0.5, `replan() re-derives attraction from the live population (${rp.sim.attraction.toFixed(2)})`);
  assert(after > before, `replan() plans day 1 from the real park (${before} → ${after} planned arrivals)`);
  // spend(): the public economy API other modules charge through (docs/requests/tools.md #1)
  const sp = makeSim(24);
  const cash0 = sp.world.economy.cash;
  const afterCharge = sp.sim.spend(1500, 'terraform:raise');
  assert(afterCharge === cash0 - 1500 && sp.world.economy.cash === cash0 - 1500, 'spend(1500) charges cash and returns the new balance');
  const afterRefund = sp.sim.spend(-300, 'terraform:lower');
  assert(afterRefund === cash0 - 1200, 'a negative spend() refunds');
  assert(sp.sim.spend(0, 'noop') === cash0 - 1200 && sp.sim.spend(NaN, 'noop') === cash0 - 1200, 'spend(0/NaN) is a no-op on cash');
  sp.sim.runDays(1);
  assert(sp.events.some((e) => e.n === 'economy:updated' && e.p.spend === 1500 && e.p.reason === 'terraform:raise'), 'spend() emits economy:updated with the amount + reason');
  const srep = sp.sim.getReport();
  assert(srep.spend['terraform:raise'] === 1500 && srep.spend['terraform:lower'] === -300, `the daily report groups the day\'s spend by reason (${JSON.stringify(srep.spend)})`);
  const log = sp.sim.getSpendLog(5);
  assert(log.length === 2 && log[0].reason === 'terraform:raise' && log[1].amount === -300, 'getSpendLog() returns the {day, amount, reason} history');
  // injectEvent(): forced events walk the same paths as the daily roll
  const dr = makeSim(25);
  const river = [...dr.world.habitats.values()].find((h) => h.name === 'River Bend');
  const wetBefore = dr.sim.habitatStat(river, true).water;
  const dev = dr.sim.injectEvent('drought', { duration: 12, strength: 1 });
  assert(dev && dev.type === 'drought' && dr.sim.getReport() === null, 'injectEvent(drought) records the event (report only appears at day end)');
  const wetAfter = dr.sim.habitatStat(river, true).water;
  assert(wetAfter < wetBefore - 0.2, `drought dries the habitat stats (water ${wetBefore.toFixed(2)} → ${wetAfter.toFixed(2)})`);
  dr.sim.runDays(1);
  assert(dr.sim.getState().activeEvents.some((e) => e.type === 'drought'), 'the drought is active the next day');
  const dz = makeSim(26);
  dz.sim.runDays(2);
  const vetBase = dz.sim.getReport().expenseBreakdown.vet;
  dz.sim.injectEvent('disease', { species: 'zebra', duration: 8 });
  dz.sim.runDays(1);
  assert(dz.sim.getReport().expenseBreakdown.vet > vetBase, `disease raises vet spend ($${fmt(vetBase)} → $${fmt(dz.sim.getReport().expenseBreakdown.vet)})`);
  assert(dz.sim.getReport().activeEvents.some((e) => e.type === 'disease' && e.species === 'zebra'), 'activeEvents carries the diseased species');
  const po = makeSim(27);
  const lions0 = po.sim.count('lion');
  const rep0 = po.sim.getState().reputation;
  const pev = po.sim.injectEvent('poachers', { species: 'lion', n: 1 });
  assert(pev && pev.type === 'poachers' && po.sim.count('lion') === lions0 - 1, `poachers remove the animal (${lions0} → ${po.sim.count('lion')} lions)`);
  assert(po.sim.getState().reputation < rep0 && po.sim.totals.poached === 1, 'poaching costs reputation and books totals.poached');
  assert(makeSim(28).sim.injectEvent('nope') === null, 'injectEvent rejects unknown types');
  // a water pump inside a habitat must count even though zoning carves the building's own footprint
  // out of the habitat (occupancy → NO_BUILD → habitatId 0): the stat attributes by neighbourhood
  const wp = makeSim(29);
  const wood = [...wp.world.habitats.values()].find((h) => h.name === 'Giraffe Woodland');
  const g = wp.world.grid, gres = g.res;
  const midCell = wood.cells[Math.floor(wood.cells.length / 2)];
  const mix = midCell % gres, miz = (midCell - mix) / gres;
  const centre = wp.world.cellCenter(mix, miz);
  const hadMid = g.habitatId[midCell];
  wp.world.buildings.set('pump_test', { id: 'pump_test', type: 'pump', x: centre.x, z: centre.z, rot: 0 });
  g.habitatId[midCell] = 0; // simulate zoning carving the footprint under the pump
  const stWith = wp.sim.habitatStat(wood, true);
  assert(stWith.waterholes === 1 && stWith.water >= 1, `a pump inside a habitat is attributed despite the carved footprint (waterholes ${stWith.waterholes}, water ${stWith.water.toFixed(2)})`);
  wp.world.buildings.delete('pump_test');
  g.habitatId[midCell] = hadMid;
  const gateCell = wp.world.cellAt(0, 0);
  const hadGate = g.habitatId[gateCell.index];
  g.habitatId[gateCell.index] = 0;
  wp.world.buildings.set('pump_far', { id: 'pump_far', type: 'pump', x: 0, z: 0, rot: 0 });
  const stFar = wp.sim.habitatStat(wood, true);
  assert(stFar.waterholes === 0, `a pump outside every habitat is not attributed (waterholes ${stFar.waterholes})`);
  wp.world.buildings.delete('pump_far');
  g.habitatId[gateCell.index] = hadGate;
}

console.log('staged population reconciliation (round-3 critic sweep)');
{
  // The showcase stages 193 animals via setPopulation() on a LIVE world whose animals module owns
  // world.animals, and reconcileFromWorld() takes that census as truth at every day end.
  // Regression (2026-09-08 critic sweep): the sim's first birth spawned through the animals hook,
  // which made world.animals non-empty (1 newborn), and the next reconcile silently ZEROED the
  // whole staged herd down to that 1 animal — 193 → 1 within days with born/died/left ≈ 0 and no
  // counter moving. Any ledger animal the world has lost must be written off as a COUNTED removal.
  const crash = makeSim(31);
  crash.world.animals.set('an_1', { id: 'an_1', species: 'impala', x: -250, z: -250, habitat: 1 });
  crash.sim.runDays(5);
  const crashRep = crash.sim.getReport();
  assert(crash.sim.totals.unmanaged === 192, `ledger-only staged animals are written off as counted removals, not dropped silently (${crash.sim.totals.unmanaged} unmanaged over 5 days)`);
  assert(crash.sim.count() === crash.world.animals.size, `reported population follows the world census after the write-off (${crash.sim.count()} vs ${crash.world.animals.size} in world.animals)`);
  assert(Object.values(crashRep.population).reduce((a, b) => a + b, 0) === crash.sim.count(), 'the daily report population equals the reconciled census (no phantoms)');
  // The showcase path: stage() mirrors every staged herd into world.animals through the same
  // spawn/remove hooks the animals module provides — 30 days later the population must still be
  // there, and staged + born − died − left must equal exactly what is reported.
  {
    const world = createPlainWorld({ seed: 32 });
    const rng = new Rng(32);
    const park = buildPark(world, rng.fork('park'), {});
    const add = (species, hid, n) => { for (let i = 0; i < n; i++) { const id = world.nextId('an'); world.animals.set(id, { id, species, x: 0, z: 0, habitat: hid }); } };
    const removeAnimals = (species, hid, n) => { let l = n; for (const [id, a] of world.animals) { if (l <= 0) break; if (a.species !== species || a.habitat !== hid) continue; world.animals.delete(id); l--; } };
    const sim = new Simulation(world, rng.fork('sim'), { spawn: add, remove: removeAnimals });
    applyPark(sim, park);
    for (const p of park.populations) add(p.species, p.habitatId, p.n); // what showcase.stage() now does
    sim.replan();
    sim.runDays(30);
    const staged0 = park.populations.reduce((a, p) => a + p.n, 0);
    const popNow = sim.count();
    const repPop = Object.values(sim.getReport().population).reduce((a, b) => a + b, 0);
    assert(world.animals.size === popNow && repPop === popNow, `mirrored staged park: world.animals ${world.animals.size} and report ${repPop} both equal the ledger (${popNow})`);
    assert(popNow >= staged0, `staged population holds or grows over 30 days (${staged0} staged → ${popNow} on day 30)`);
    assert(sim.totals.unmanaged === 0, `no unaccounted removals in the mirrored park (${sim.totals.unmanaged})`);
    assert(staged0 + sim.totals.born - sim.totals.died - sim.totals.left === popNow,
      `every animal accounted for: ${staged0} staged + ${sim.totals.born} born − ${sim.totals.died} died − ${sim.totals.left} left = ${popNow}`);
    assert(sim.totals.born > 0, `the staged park breeds (${sim.totals.born} born in 30 days)`);
  }
  // Adoption: animals the world already has but the ledger lacks (the park demo spawns herds
  // through the animals module before the sim ever saw them) join the ledger, booked as adopted.
  {
    const world = createPlainWorld({ seed: 33 });
    const rng = new Rng(33);
    buildPark(world, rng.fork('park'), {});
    const sim = new Simulation(world, rng.fork('sim'), {});
    for (let i = 0; i < 5; i++) world.animals.set(`an_${i}`, { id: `an_${i}`, species: 'zebra', x: 0, z: 0, habitat: 1 });
    const ok = sim.reconcileFromWorld() === true && sim.count('zebra') === 5 && sim.totals.adopted === 5;
    assert(ok, `world animals absent from the ledger are adopted, not dropped (zebra ${sim.count('zebra')}, adopted ${sim.totals.adopted})`);
  }
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

console.log('food web + vegetation (Wave P1)');
{
  const T = PLANT_INDEX;
  const layer = (w, t) => w.vegetation.cover.subarray(t * 4096, (t + 1) * 4096);
  const mean = (a, idx) => idx.reduce((x, i) => x + a[i], 0) / Math.max(1, idx.length);
  // seeding from biomes: a plain world painted GRASS | WETLAND strip | ROAD_DUST strip
  const w0 = createPlainWorld({ seed: 5 });
  const t0 = w0.terrain, r0 = t0.res;
  for (let iz = 0; iz < r0; iz++) for (let ix = 0; ix < r0; ix++) t0.biome[iz * r0 + ix] = ix < 200 ? 0 : ix < 300 ? 5 : ix < 340 ? 7 : 1;
  const ev0 = [];
  const s0 = new Simulation(w0, new Rng(5), { emit: (n, p) => ev0.push({ n, p }) });
  const cellsWhere = (x0, x1) => { const out = []; for (let iz = 4; iz < 60; iz++) for (let ix = 0; ix < 64; ix++) { const cx = (ix + 0.5) * 16; if (cx >= x0 && cx < x1) out.push(iz * 64 + ix); } return out; };
  const grassCells = cellsWhere(16, 380), wetCells = cellsWhere(420, 580), roadCells = cellsWhere(620, 660);
  const oat = layer(w0, T.red_oat), sedge = layer(w0, T.sedge), umb = layer(w0, T.umbrella_thorn);
  assert(mean(oat, grassCells) > 0.4 && mean(sedge, wetCells) > 1.5 * mean(oat, wetCells) && mean(sedge, grassCells) < 0.1,
    `seeding follows biomes: red-oat ${mean(oat, grassCells).toFixed(2)} on GRASS, sedge ${mean(sedge, wetCells).toFixed(2)} vs red-oat ${mean(oat, wetCells).toFixed(2)} on WETLAND`);
  let roadMax = 0; for (let t = 0; t < PLANTS.length; t++) for (const i of roadCells) roadMax = Math.max(roadMax, w0.vegetation.cover[t * 4096 + i]);
  const treeShare = grassCells.filter((i) => umb[i] > 0).length / grassCells.length;
  assert(roadMax === 0 && treeShare > 0.1 && treeShare < 0.8, `roads bare (max ${roadMax}), trees are individuals: umbrella thorn in ${(treeShare * 100).toFixed(0)} % of grass cells`);
  assert(ev0.some((e) => e.n === 'vegetation:changed' && e.p.x0 === -512 && e.p.x1 === 512), 'seeding emits a whole-world vegetation:changed');
  const s0b = new Simulation(createPlainWorld({ seed: 5 }), new Rng(5));
  assert(Object.keys(s0.getVegetation(-300, 0)).length === PLANTS.length && s0.getVegetation(-300, 0).red_oat > 0 && s0b.getVegetation(0, 0).red_oat > 0, 'getVegetation(x, z) → { [plant]: cover }');

  // spread: bare grassland (red oat cleared, e.g. after a fire), plant a 24 m patch, 30 days, no herds
  const spreadRun = (drought) => {
    const w = createPlainWorld({ seed: 6 });
    const s = new Simulation(w, new Rng(6));
    layer(w, T.red_oat).fill(0);
    const res = s.plant('red_oat', 8, 8, 24, 0.25);
    const count = () => { let n = 0; for (const c of layer(w, T.red_oat)) if (c >= 0.05) n++; return n; };
    const n0 = count();
    if (drought) s.injectEvent('drought', { duration: 40, strength: 1 });
    s.runDays(30);
    const cov = layer(w, T.red_oat).reduce((a, c) => a + c, 0);
    return { res, n0, n30: count(), cov, ms: s.veg.lastStepMs };
  };
  const sp = spreadRun(false), spD = spreadRun(true);
  assert(sp.res.ok && sp.n0 === sp.res.cells && sp.n30 > sp.n0 * 1.5, `a planted red-oat patch spreads outward: ${sp.n0} → ${sp.n30} cells ≥ 0.05 cover in 30 days`);
  assert(spD.n30 < sp.n30 && spD.cov < sp.cov * 0.8, `drought slows spread: ${spD.n30} cells / Σcover ${spD.cov.toFixed(1)} vs ${sp.n30} / ${sp.cov.toFixed(1)} without`);

  // plant(): cost = cost × ha through spend('plant'); refused when unaffordable; unknown type
  const pw = makeSim(21);
  const cash0 = pw.world.economy.cash;
  const pr = pw.sim.plant('aloe', -250, 250, 40, 0.3);
  const exp = Math.round(PLANTS[T.aloe].cost * pr.cells * 0.0256 * 100) / 100;
  assert(pr.ok && pr.cells > 10 && Math.abs(pr.cost - exp) < 0.01 && Math.abs(cash0 - pw.world.economy.cash - pr.cost) < 0.01,
    `plant('aloe', r 40 m) charges cost × ha: ${pr.cells} cells = ${(pr.cells * 0.0256).toFixed(2)} ha × $900 = $${pr.cost}`);
  assert(pw.sim.getSpendLog(1)[0].reason === 'plant' && pw.events.some((e) => e.n === 'vegetation:changed' && e.p.x0 <= -290 && e.p.x1 >= -210), 'plant() books spend reason "plant" and emits vegetation:changed for the planted rect');
  assert(Math.abs(pw.sim.getVegetation(-250, 250).aloe - 0.3) < 1e-6, 'planted cells carry the requested cover');
  // plantQuote() prices without writing; unplant() restores cover bit-for-bit and refunds
  const q = pw.sim.plantQuote('marula', 250, -250, 30);
  const coverSnap = Float32Array.from(pw.world.vegetation.cover), cashQ = pw.world.economy.cash;
  assert(q.cells > 0 && q.cost > 0 && q.affordable && pw.world.economy.cash === cashQ, `plantQuote('marula', r 30 m) = ${q.cells} cells, $${q.cost}, nothing charged`);
  const pu = pw.sim.plant('marula', 250, -250, 30, 0.25);
  assert(pu.ok && Math.abs(pu.cost - q.cost) < 0.01, 'plant() charges exactly the quoted cost');
  pw.sim.unplant(pu.undo);
  assert(pw.world.vegetation.cover.every((c, i) => c === coverSnap[i]) && Math.abs(pw.world.economy.cash - cashQ) < 0.01, 'unplant() restores every cover value exactly and refunds the cost');
  pw.world.economy.cash = 10;
  const before = pw.sim.getVegetation(250, 250).marula;
  const poor = pw.sim.plant('marula', 250, 250, 40);
  assert(!poor.ok && pw.world.economy.cash === 10 && pw.sim.getVegetation(250, 250).marula === before, 'plant() is refused (nothing written, nothing charged) when the park cannot afford it');
  assert(pw.sim.plant('cactus', 0, 0, 20).ok === false, 'plant() rejects an unknown plant id');

  // capacity coupling: capacity = min(space, food ÷ need)
  const cw = makeSim(22);
  const fr0 = cw.sim.getFoodReport(1);
  const hab1 = cw.world.habitats.get(1);
  const zebraSpace = Math.floor(hab1.area / 1200);
  assert(fr0.zebra.spaceCapacity === zebraSpace && fr0.zebra.capacity === Math.min(zebraSpace, fr0.zebra.foodCapacity) && fr0.zebra.food > 0 && fr0.zebra.need === +(14 * 1.1).toFixed(2),
    `getFoodReport: zebra food ${fr0.zebra.food}/d, need ${fr0.zebra.need}/d, capacity ${fr0.zebra.capacity} = min(space ${zebraSpace}, food ${fr0.zebra.foodCapacity})`);
  const hc = cw.sim.veg.habitatCells(hab1);
  for (const t of [T.red_oat, T.couch]) for (const i of hc.idx) cw.world.vegetation.cover[t * 4096 + i] = 0;
  cw.world.vegetation.version++;
  const fr1 = cw.sim.getFoodReport(1);
  assert(fr1.zebra.food === 0 && fr1.zebra.capacity === 1 && fr1.wildebeest.food > 0 && fr1.wildebeest.capacity < fr0.wildebeest.capacity,
    `no zebra food → zebra capacity 1 (was ${fr0.zebra.capacity}); wildebeest keeps its lovegrass (capacity ${fr0.wildebeest.capacity} → ${fr1.wildebeest.capacity})`);
  cw.sim.runDays(10);
  const zh = cw.sim.getReport().habitats[1].species.zebra, zc = makeSim(22); zc.sim.runDays(10);
  assert(zh.happiness < zc.sim.getReport().habitats[1].species.zebra.happiness - 0.05, `a herd over its food capacity is unhappier (zebra h ${zh.happiness} vs ${zc.sim.getReport().habitats[1].species.zebra.happiness} fed)`);

  // consumption: normal stocking holds the grass; 3000 zebra overgraze it and the capacity falls with it
  const grazeRun = (n) => {
    const g = makeSim(23);
    if (n) g.sim.setPopulation(1, 'zebra', n);
    const hc1 = g.sim.veg.habitatCells(g.world.habitats.get(1));
    const cov = () => mean(layer(g.world, T.red_oat), [...hc1.idx]) + mean(layer(g.world, T.couch), [...hc1.idx]);
    const c0 = cov(), cap0 = g.sim.getFoodReport(1).zebra.foodCapacity;
    g.sim.runDays(5);
    return { c0, c5: cov(), cap0, cap5: g.sim.getFoodReport(1).zebra.foodCapacity };
  };
  const gN = grazeRun(0), gO = grazeRun(3000);
  assert(gN.c5 > gN.c0 * 0.95, `normal stocking: grass cover holds (${gN.c0.toFixed(3)} → ${gN.c5.toFixed(3)})`);
  assert(gO.c5 < gO.c0 * 0.6 && gO.cap5 < gO.cap0 * 0.6, `overgrazing (3000 zebra): cover ${gO.c0.toFixed(3)} → ${gO.c5.toFixed(3)} in 5 days, zebra food capacity ${gO.cap0} → ${gO.cap5}`);

  // predators follow prey after a lag: strip Lion Ridge (habitat 4) of prey
  const lionRun = (strip) => {
    const l = makeSim(24);
    if (strip) for (const s of ['wildebeest', 'zebra', 'impala']) l.sim.setPopulation(4, s, 0);
    const series = [], caps = [];
    for (let d = 0; d < 40; d++) { l.sim.runDays(1); series.push(l.sim.pop.get(4).get('lion').n); caps.push(l.sim.getFoodReport(4).lion.capacity); }
    return { series, caps };
  };
  const lc = lionRun(false), ls = lionRun(true);
  const firstDrop = ls.series.findIndex((n, i) => n < lc.series[i]);
  assert(ls.caps[0] > 1 && ls.caps[0] > ls.caps[39], `lion capacity follows prey biomass with a lag: ${ls.caps[0]} on day 1 → ${ls.caps[39]} on day 40 (control ${lc.caps[39]})`);
  assert(firstDrop >= 3 && ls.series[39] < lc.series[39], `prey removed → lions decline after a lag: first below control on day ${firstDrop + 1}, day 40: ${ls.series[39]} vs ${lc.series[39]} (control)`);
  const pk = makeSim(25); pk.sim.setPopulation(4, 'elephant', 20); pk.sim.runDays(60);
  assert(pk.sim.pop.get(4).get('elephant').died <= 3, `lions only take prey in their diet (elephants in the pride habitat: ${pk.sim.pop.get(4).get('elephant').died} deaths in 60 days)`);

  // determinism of the vegetation layer + daily budget
  const d1 = makeSim(31), d2 = makeSim(31), d3 = makeSim(32);
  for (const d of [d1, d2, d3]) d.sim.runDays(60);
  const same = d1.world.vegetation.cover.every((c, i) => c === d2.world.vegetation.cover[i]);
  const diff = d1.world.vegetation.cover.some((c, i) => c !== d3.world.vegetation.cover[i]);
  assert(same && diff, 'same seed → bit-identical vegetation cover after 60 days; a different seed differs');
  let msSum = 0, msMax = 0;
  const b = makeSim(33);
  for (let d = 0; d < 30; d++) { b.sim.runDays(1); const ms = b.sim.getState().vegetation.stepMs; msSum += ms; msMax = Math.max(msMax, ms); }
  assert(msSum / 30 < 5, `daily vegetation update ${(msSum / 30).toFixed(2)} ms mean, ${msMax.toFixed(2)} ms max (budget 5 ms, 64² × ${PLANTS.length})`);
}

// ---------------------------------------------------------------- Wave P2: fire
console.log('\nWave P2 — fire');
{
  // ignite -> burn-out: cover drops to the residue share, scorch set, then slow regrowth
  const { sim } = makeSim(11, {});
  const veg = sim.veg;
  const cx = 0, cz = 0;
  const before = veg.fuelAt(veg.cellIndex(cx, cz));
  // a NATURAL fire carries containment stamina (~150 cells, ~3.8 ha): it self-contains like a
  // real backburn; scripted/harness fires pass no stamina and burn until fuel or rain stops them
  const lit = veg.ignite(cx, cz, 24, VEG.fire.stamina);
  assert(lit.cells > 0, `fire: ignite lights cells in fuel (${lit.cells} cells, ${lit.ha} ha)`);
  sim.runDays(4); // 2 days burning + spread tail
  let anyBurnt = 0, anyScorch = 0;
  for (let i = 0; i < veg.nCells; i++) { if (veg.burn[i] === 2) anyBurnt++; if (veg.scorch[i] > 0) anyScorch++; }
  assert(anyBurnt > 0, `fire: cells reach the burnt state (${anyBurnt} cells)`);
  assert(anyScorch >= anyBurnt, `fire: burnt cells carry scorch (${anyScorch} cells)`);
  sim.runDays(27);
  const stats = veg.fireStats();
  assert(stats.burning === 0, `fire: contained front burns out (${stats.burning} cells still burning after 31 d)`);
  // containment stops SPREAD once the stamina is claimed; the front alive at that moment burns out,
  // so the total is stamina + one front width (~7-8 ha here) vs ~47 ha unchecked
  assert(stats.burntHa <= 9, `fire: containment holds the burn small (${stats.burntHa} ha)`);
  assert(stats.burntHa > 0.5, `fire: the contained burn still has real extent (${stats.burntHa} ha)`);
  // a LATER natural fire gets its own budget: the stamina used to be a single running minimum, so after
  // the first contained fire every later fire started contained and never spread past its ignition disc
  const burntBefore = stats.burntHa;
  const lit2 = veg.ignite(-300, 300, 24, VEG.fire.stamina);
  sim.runDays(8);
  const grew = veg.fireStats().burntHa - burntBefore;
  assert(lit2.cells > 0 && grew > lit2.ha * 1.5, `fire: a second natural fire spreads beyond its ignition (${lit2.ha} ha lit -> +${grew.toFixed(2)} ha burnt)`);

  // an UNCONTAINED fire (scripted disaster, or a player who ignores it) keeps growing until fuel
  // or rain stops it — 45 days lets a circular front eat a real share of the test park
  const u = makeSim(12, {});
  u.sim.veg.ignite(0, 0, 16);
  u.sim.runDays(45);
  const ust = u.sim.veg.fireStats();
  assert(ust.burntHa > 30, `fire: an unchecked fire consumes real area (${ust.burntHa} ha in 45 d)`);

  // spread: a fire in dry grassland with no rain grows beyond its ignition disc
  const s2world = makeSim(12, {});
  const v2 = s2world.sim.veg;
  v2.ignite(0, 0, 16);
  s2world.sim.runDays(8);
  const half2 = s2world.world.half ?? s2world.world.size / 2, c2 = v2.cell;
  let beyond = 0;
  for (let iz = 0; iz < v2.res; iz++) for (let ix = 0; ix < v2.res; ix++) {
    const i = iz * v2.res + ix;
    if (v2.burn[i] === 0) continue;
    const x = (ix + 0.5) * c2 - half2, z = (iz + 0.5) * c2 - half2;
    if (x * x + z * z > 16 * 16) beyond++;
  }
  assert(beyond >= 4, `fire: front spreads past the ignition disc (${beyond} cells beyond 16 m)`);

  // a wet WALL (stacked water drops) blocks the front completely
  const w = makeSim(13, {});
  const v3 = w.sim.veg;
  const half = w.world.half ?? w.world.size / 2, c = v3.cell;
  for (let z = -200; z <= 200; z += c) v3.wetRing(-2 * c, z, c * 1.2);
  v3.ignite(2 * c, 0, 12);
  w.sim.runDays(8);
  let crossed = 0;
  for (let iz = 0; iz < v3.res; iz++) for (let ix = 0; ix < v3.res; ix++) {
    const i = iz * v3.res + ix;
    const x = (ix + 0.5) * c - half;
    if (v3.burn[i] !== 0 && x < -c * 3.2) crossed++;
  }
  assert(crossed === 0, `fire: wet wall holds (${crossed} cells burnt west of it)`);

  // firebreak (cleared line) blocks the front
  const f = makeSim(14, {});
  const v4 = f.sim.veg;
  v4.clearLine(-c * 1.5, -200, -c * 1.5, 200, 16);
  v4.ignite(c * 1.5, 0, 12);
  f.sim.runDays(8);
  let crossedFb = 0;
  for (let iz = 0; iz < v4.res; iz++) for (let ix = 0; ix < v4.res; ix++) {
    const i = iz * v4.res + ix;
    const x = (ix + 0.5) * c - half;
    if (v4.burn[i] !== 0 && x < -c * 2.5) crossedFb++;
  }
  assert(crossedFb === 0, `fire: firebreak holds (${crossedFb} cells burnt west of the cleared line)`);

  // regrowth: a burnt grass cell recovers and its scorch fades
  const r = makeSim(15, {});
  const v5 = r.sim.veg;
  const gi = v5.cellIndex(0, 0);
  v5.ignite(0, 0, 24);
  r.sim.runDays(3);
  const minAfter = v5.cover[gi];
  assert(v5.scorch[gi] > 0, 'fire: scorch present right after the burn');
  r.sim.runDays(75);
  assert(v5.scorch[gi] < 0.25, `fire: scorch fades over a season (${v5.scorch[gi].toFixed(2)})`);
  assert(v5.cover[gi] > minAfter, `fire: burnt cell regrows (${minAfter.toFixed(3)} -> ${v5.cover[gi].toFixed(3)})`);

  // determinism: same seed, same fire -> identical burnt maps
  const d1 = makeSim(16, {}), d2 = makeSim(16, {});
  d1.sim.veg.ignite(0, 0, 24); d2.sim.veg.ignite(0, 0, 24);
  d1.sim.runDays(10); d2.sim.runDays(10);
  let same = true;
  for (let i = 0; i < d1.sim.veg.nCells; i++) if (d1.sim.veg.burn[i] !== d2.sim.veg.burn[i] || d1.sim.veg.scorch[i] !== d2.sim.veg.scorch[i]) { same = false; break; }
  assert(same, 'fire: two runs of the same seed produce identical burnt maps');

  // injectEvent('fire') lights and reports
  const ev = makeSim(17, {});
  const rec = ev.sim.injectEvent('fire', { x: 0, z: 0, radius: 24 });
  assert(rec && rec.type === 'fire', 'fire: injectEvent(fire) records the event');
  assert(ev.sim.veg.fireStats().burning > 0, 'fire: injectEvent(fire) lights cells');
}

// ---------------------------------------------------------------- Wave P3: biodiversity + missions
console.log('\nWave P3 — biodiversity + missions');
{
  const T = PLANT_INDEX;
  // ---- computeBiodiversity edge cases (pure function, synthetic inputs)
  {
    const zero = computeBiodiversity({}, new Array(10).fill(0));
    assert(zero.richness === 0 && zero.shannon === 0 && zero.evenness === 0 && zero.plantRichness === 0 && zero.index === 0
      && zero.bigFive.leopard === null && zero.bigFive.lion === 0, 'biodiversity: empty park → all zeros, leopard null');
    const one = computeBiodiversity({ lion: 5 }, new Array(10).fill(0));
    assert(one.richness === 1 && one.shannon === 0 && one.evenness === 0, `biodiversity: one species → H 0, J 0 by definition (richness ${one.richness}, H ${one.shannon})`);
    const eq = computeBiodiversity({ a: 10, b: 10, c: 10 }, new Array(10).fill(0));
    assert(Math.abs(eq.shannon - Math.log(3)) < 1e-12 && Math.abs(eq.evenness - 1) < 1e-12, `biodiversity: equal counts → H ln 3, J exactly 1 (H ${eq.shannon.toFixed(4)}, J ${eq.evenness.toFixed(4)})`);
    const dom = computeBiodiversity({ a: 97, b: 1, c: 1, d: 1 }, new Array(10).fill(0));
    assert(dom.evenness < 0.5, `biodiversity: a dominant herd crushes evenness (J ${dom.evenness.toFixed(3)})`);
    const pr = computeBiodiversity({ lion: 2 }, [0, 0.0199, 0.02, 0.5, 0, 0, 0, 0, 0, 0]);
    assert(pr.plantRichness === 2, `biodiversity: plant counts at mean cover ≥ 0.02 exactly (${pr.plantRichness} of [0.0199, 0.02, 0.5])`);
    assert(pr.bigFive.lion === 2 && pr.bigFive.leopard === null, 'biodiversity: big five carries counts, leopard stays null');
    const idx = computeBiodiversity({ lion: 2 }, new Array(10).fill(1));
    const expect = 100 * (0.40 * 1 / 12 + 0.30 * 0 + 0.20 * 1 / 4 + 0.10 * 10 / 10);
    assert(Math.abs(idx.index - expect) < 1e-9, `biodiversity: index formula = 100 × (0.40 r/12 + 0.30 J + 0.20 big/4 + 0.10 p/10) = ${expect.toFixed(2)}`);
  }

  // ---- getBiodiversity() on the synthetic park + richness sensitivity
  {
    const s = makeSim(35);
    const b0 = s.sim.getBiodiversity();
    assert(b0.richness === 12 && b0.plantRichness > 0 && b0.index > 50, `biodiversity: synthetic park reads ${b0.richness} species, ${b0.plantRichness} plants, index ${b0.index}`);
    assert(b0.bigFive.elephant === 6 && b0.bigFive.rhino === 3 && b0.bigFive.leopard === null, 'biodiversity: big five counts the herd sizes');
    for (const m of s.sim.pop.values()) if (m.has('zebra')) m.get('zebra').n = 0;
    s.sim.clock.day++; // bust the per-day cache
    const b1 = s.sim.getBiodiversity();
    assert(b1.richness === b0.richness - 1 && b1.index < b0.index, `biodiversity: removing every zebra drops richness exactly 1 (${b0.richness} → ${b1.richness}) and the index (${b0.index} → ${b1.index})`);
    // planting a sparse species park-wide lifts plantRichness: baobab over ~14% of the map
    const p = makeSim(36);
    const pb0 = p.sim.getBiodiversity();
    p.world.economy.cash = 1e9;
    p.sim.plant('baobab', 0, 0, 430, 0.15);
    p.sim.clock.day++;
    const pb1 = p.sim.getBiodiversity();
    assert(pb1.plantRichness === pb0.plantRichness + 1 && pb1.index > pb0.index, `biodiversity: planting baobab over ~14% of the park adds the plant (${pb0.plantRichness} → ${pb1.plantRichness}) and index points`);
    // the report carries it
    const rep = makeSim(37); rep.sim.runDays(1);
    assert(rep.sim.getReport().biodiversity?.index === rep.sim.getBiodiversity().index, 'biodiversity: the daily report carries the same reading');
  }

  // ---- goal types against synthetic reports (met / missed / deadline edge day)
  {
    const mkRunner = () => { const s = makeSim(38); return { s, mr: s.sim.mission }; };
    const rep = (o) => ({ population: {}, biodiversity: { index: 50 }, cash: 0, loans: 0, ...o });
    // population: met on the deadline day itself, missed the day after the deadline
    {
      const { s, mr } = mkRunner();
      mr.start({ id: 't-pop', name: 't', brief: '', goal: { type: 'population', species: 'lion', n: 6 }, deadlineDays: 10, stars: [6, 8, 10] }, 1);
      for (let d = 1; d <= 10; d++) mr.step(d, rep({ population: { lion: 5 } }));
      assert(mr.status === 'active', 'population: 5 lions for 10 days → still active on the deadline day');
      mr.step(11, rep({ population: { lion: 5 } }));
      assert(mr.status === 'failed', 'population: deadline day ends under target → failed');
      mr.start({ id: 't-pop', name: 't', brief: '', goal: { type: 'population', species: 'lion', n: 6 }, deadlineDays: 10, stars: [6, 8, 10] }, 1);
      mr.step(11, rep({ population: { lion: 6 } }));
      assert(mr.status === 'won' && mr.stars === 1, 'population: the deadline-day report itself counts (won at exactly 6 → 1 star)');
      void s;
    }
    // population stars: 8 → 2 stars, 10 → 3 stars, evaluated at the moment of the win
    {
      const { mr } = mkRunner();
      for (const [n, stars] of [[6, 1], [8, 2], [10, 3], [14, 3]]) {
        mr.start({ id: 't-pop', name: 't', brief: '', goal: { type: 'population', species: 'lion', n: 6 }, deadlineDays: 10, stars: [6, 8, 10] }, 1);
        mr.step(2, rep({ population: { lion: n } }));
        assert(mr.status === 'won' && mr.stars === stars, `population stars: ${n} lions at the win → ${stars} star(s)`);
      }
    }
    // hold: streak resets on an out-of-range day; stars from the run's mean above the floor
    {
      const { mr } = mkRunner();
      const row = { id: 't-hold', name: 't', brief: '', goal: { type: 'hold', metric: 'biodiversity.index', min: 68, days: 5 }, deadlineDays: 40, stars: [5, 2, 4] };
      mr.start(row, 1);
      mr.step(1, rep({ biodiversity: { index: 70 } }));
      mr.step(2, rep({ biodiversity: { index: 71 } }));
      mr.step(3, rep({ biodiversity: { index: 67.9 } })); // out of range: streak resets
      assert(mr.status === 'active' && mr.detail.streak === 0, 'hold: one day under the floor resets the streak');
      mr.step(4, rep({ biodiversity: { index: 70 } }));
      mr.step(5, rep({ biodiversity: { index: 70 } }));
      mr.step(6, rep({ biodiversity: { index: 70 } }));
      mr.step(7, rep({ biodiversity: { index: 70 } }));
      assert(mr.status === 'active' && mr.detail.streak === 4, 'hold: 4 of 5 consecutive days → still active');
      mr.step(8, rep({ biodiversity: { index: 70.5 } }));
      assert(mr.status === 'won' && mr.stars === 2, `hold: streak of 5 at mean 70.2 (+2.2 over the floor) → 2 stars (mean ${mr.detail.mean})`);
      mr.start(row, 1);
      for (let d = 1; d <= 5; d++) mr.step(d, rep({ biodiversity: { index: 69.5 } }));
      assert(mr.status === 'won' && mr.stars === 1, `hold stars: run mean +1.5 over the floor → 1 star (mean ${mr.detail.mean})`);
      mr.start(row, 1);
      for (let d = 1; d <= 5; d++) mr.step(d, rep({ biodiversity: { index: 71 } }));
      assert(mr.status === 'won' && mr.stars === 2, 'hold stars: run mean +3 over the floor → 2 stars');
      mr.start(row, 1);
      for (let d = 1; d <= 5; d++) mr.step(d, rep({ biodiversity: { index: 73 } }));
      assert(mr.status === 'won' && mr.stars === 3, 'hold stars: run mean +5 over the floor → 3 stars');
      // a metric the report lacks never counts as in range
      mr.start({ id: 't-hold2', name: 't', brief: '', goal: { type: 'hold', metric: 'nope.nope', min: 1, days: 2 }, deadlineDays: 5, stars: [2, 1, 2] }, 1);
      for (let d = 1; d <= 6; d++) mr.step(d, rep({}));
      assert(mr.status === 'failed', 'hold: a missing metric never satisfies the range');
    }
    // cash: net of loans; deadline-earliness stars
    {
      const { mr } = mkRunner();
      const row = { id: 't-cash', name: 't', brief: '', goal: { type: 'cash', amount: 1000 }, deadlineDays: 100, stars: [1000, 0.25, 0.5] };
      mr.start(row, 1);
      mr.step(5, rep({ cash: 1500, loans: 600 }));
      assert(mr.status === 'active' && mr.detail.net === 900, 'cash: loans count against the goal (net 900 < 1000 → active)');
      mr.step(90, rep({ cash: 1500, loans: 499 }));
      assert(mr.status === 'won' && mr.stars === 1, 'cash: crossing with 11% of the window left → won 1 star');
      mr.start(row, 1);
      mr.step(60, rep({ cash: 1000, loans: 0 }));
      assert(mr.status === 'won' && mr.stars === 2, 'cash stars: 41% of the window left → 2 stars');
      mr.start(row, 1);
      mr.step(20, rep({ cash: 1000, loans: 0 }));
      assert(mr.status === 'won' && mr.stars === 3, 'cash stars: 80% of the window left → 3 stars');
    }
    // API surface + events
    {
      const s = makeSim(39);
      const evs = [];
      const onP = (p) => evs.push(['progress', p]);
      const onC = (p) => evs.push(['completed', p]);
      s.sim.hooks.emit = (n, p) => { if (n === 'mission:progress') onP(p); if (n === 'mission:completed') onC(p); };
      assert(s.sim.listMissions().length === 4 && s.sim.listMissions().every((m) => m.goal && m.deadlineDays && m.stars.length === 3), 'missions: listMissions() exposes the four starter rows');
      assert(s.sim.getMissionState().status === 'none', 'missions: no mission by default (free play)');
      assert(s.sim.startMission('nope').ok === false, 'missions: unknown id rejected');
      const st = s.sim.startMission('pride');
      assert(st.ok && s.sim.getMissionState().id === 'pride' && s.sim.getMissionState().status === 'active' && s.sim.getMissionState().deadline === 1 + 180, 'missions: startMission sets active state with start-day deadline');
      // the state is right on frame one, before any day end (critic simulation-round8 issue 1):
      // the demo has lions already, so a fresh pride mission must not read "0 / 6, 0 %"
      const lions0 = s.sim.population().lion ?? 0;
      const st0 = s.sim.getMissionState();
      assert(lions0 > 0 && st0.detail.count === lions0 && st0.detail.target === 6 && Math.abs(st0.progress - Math.min(1, lions0 / 6)) < 1e-3,
        `missions: a fresh mission shows the live count before the first day end (${st0.detail.count} / ${st0.detail.target}, progress ${st0.progress}, ${lions0} lions in the park)`);
      assert(evs.length === 0 && st0.status === 'active', 'missions: seeding at start emits nothing and does not resolve the mission');
      s.sim.runDays(2);
      assert(evs.filter((e) => e[0] === 'progress').length === 2, 'missions: mission:progress emitted daily while active');
      // buying to the target wins and emits completed once
      const lionHab = [...s.world.habitats.keys()].find((h) => (s.sim.pop.get(h)?.get('lion')?.n ?? 0) > 0);
      s.sim.buyAnimals('lion', lionHab, 3);
      s.sim.runDays(1);
      const done = evs.filter((e) => e[0] === 'completed');
      assert(s.sim.getMissionState().status === 'won' && done.length === 1 && done[0][1].won === true, 'missions: mission:completed fires exactly once on the win');
      // reset clears mission state
      s.sim.reset(39);
      assert(s.sim.getMissionState().status === 'none', 'missions: reset() clears mission state');
      // abandon returns to the picker without a completed event
      s.sim.startMission('pride');
      s.sim.abandonMission();
      assert(s.sim.getMissionState().status === 'none', 'missions: abandonMission() returns to no-mission');
    }
    // start-of-mission seeding: cash goal, and a goal that is already satisfied when the mission starts
    {
      const c = makeSim(39);
      c.sim.startMission('in-the-black');
      const eco = c.world.economy, cs = c.sim.getMissionState();
      const net = Math.round(eco.cash) - Math.round(eco.loans || 0);
      const target = c.sim.listMissions().find((m) => m.id === 'in-the-black').goal.amount; // recalibrated by P4 (800k -> 1.3M)
      assert(cs.detail.net === net && Math.abs(cs.progress - Math.min(1, Math.max(0, net) / target)) < 1e-3,
        `missions: a fresh cash mission shows the live net of loans (${cs.detail.net}, progress ${cs.progress})`);
      const p = makeSim(39);
      const hab = [...p.world.habitats.keys()].find((h) => (p.sim.pop.get(h)?.get('lion')?.n ?? 0) > 0);
      p.sim.buyAnimals('lion', hab, 3);
      p.sim.startMission('pride');
      const ps = p.sim.getMissionState();
      assert(ps.progress === 1 && ps.status === 'active', 'missions: an already-met goal reads 100 % at start but stays active until the day-end evaluator decides');
      p.sim.runDays(1);
      assert(p.sim.getMissionState().status === 'won', 'missions: the day-end evaluator then wins it');
      // seeding must not perturb the simulation: start-then-abandon stays byte-identical (also asserted above), and
      // a seeded start does not change the reports of a mission run vs the same mission run after a no-op seed
      const q1 = makeSim(39), q2 = makeSim(39);
      q1.sim.startMission('in-the-black'); q2.sim.startMission('in-the-black'); q2.sim.getMissionState();
      q1.sim.runDays(20); q2.sim.runDays(20);
      assert(JSON.stringify(q1.sim.getReports(20)) === JSON.stringify(q2.sim.getReports(20)), 'missions: reading the mission state is side-effect free');
    }
  }

  // ---- fire-season: scheduling, own stamina per fire, idle loss / defended win
  {
    // a compact fire mission on the synthetic park (2 fires in 30 days, stamina 12 for a small burn;
    // loss limits non-binding so the run cannot hard-fail before the second ignition)
    const row = { id: 't-fire', name: 't', brief: '', goal: { type: 'survive-fire', fires: 2, stamina: 12, maxBuildingsLost: 99, maxHa: 999 }, deadlineDays: 30, stars: [{ buildings: 0, ha: 15 }, { buildings: 0, ha: 8 }, { buildings: 0, ha: 3 }] };
    const s = makeSim(40);
    s.sim.mission.start(row, 1);
    const sched = s.sim.mission.schedule;
    assert(sched.length === 2 && sched[0].day >= 2 && sched[1].day > sched[0].day && sched[1].day <= 30, `fire-season: ${sched.length} ignitions scheduled inside the window (days ${sched.map((x) => x.day).join(', ')})`);
    // same seed + same mission → same schedule
    const s2 = makeSim(40);
    s2.sim.mission.start(row, 1);
    assert(JSON.stringify(s2.sim.mission.schedule) === JSON.stringify(sched), 'fire-season: schedule days deterministic per seed');
    // run to the SECOND ignition: it must carry its own stamina (the P2 bug: a second fire inherited
    // the first fire's spent budget and never spread)
    let sawSecond = null;
    let lastBurnt = 0;
    for (let d = 1; d <= 30; d++) {
      s.sim.runDays(1);
      if (d === sched[1].day) {
        // the ignition happens at the top of day end: right after runDays the new fire is burning
        // and the budget was RESET to the goal's stamina (nothing was burning when it ignited)
        sawSecond = s.sim.veg.fireStats().burning > 0 ? s.sim.veg.fireStamina : null;
      }
      if (s.sim.mission.status !== 'active') break;
      lastBurnt = s.sim.veg.burntOutTotal;
    }
    assert(sawSecond === 12, `fire-season: the second scripted fire gets its own stamina (${sawSecond} cells)`);
    assert(lastBurnt > 12, `fire-season: fires burned beyond a single budget (${lastBurnt} cells burnt out across the season)`);
    // idle on the full-size mission loses buildings → failed (the synthetic park has 12 buildings)
    const s3 = makeSim(1);
    s3.sim.startMission('fire-season');
    let idleEnd = null;
    for (let d = 0; d < 95; d++) { s3.sim.runDays(1); if (s3.sim.getMissionState().status !== 'active') { idleEnd = s3.sim.getMissionState(); break; } }
    assert(idleEnd && idleEnd.status === 'failed' && idleEnd.detail.buildingsLost > idleEnd.detail.maxBuildingsLost,
      `fire-season: an idle park fails on building losses (${idleEnd.detail.buildingsLost} buildings vs limit ${idleEnd.detail.maxBuildingsLost})`);
    // defended (water drops on every building, refreshed weekly) wins the season
    const s4 = makeSim(1);
    s4.sim.startMission('fire-season');
    const drops = [...s4.world.buildings.values()].map((b) => [b.x, b.z]);
    let defEnd = null;
    for (let d = 0; d < 95; d++) {
      if (d % 6 === 0) for (const [x, z] of drops) s4.sim.waterDrop(x, z, 40);
      s4.sim.runDays(1);
      if (s4.sim.getMissionState().status !== 'active') { defEnd = s4.sim.getMissionState(); break; }
    }
    assert(defEnd && defEnd.status === 'won' && defEnd.detail.buildingsLost === 0 && defEnd.detail.haLost <= defEnd.detail.maxHa,
      `fire-season: defended park survives the season (0 buildings, ${defEnd?.detail.haLost} ha of ${defEnd?.detail.maxHa}) → won ${defEnd?.stars} star(s)`);
  }

  // ---- free play unchanged + reset round-trip (ideas-wave-rules #12: run → reset → identical run)
  {
    const a = makeSim(41), b = makeSim(41);
    // free play stays byte-identical between two same-seed runs WITH and WITHOUT a mission started
    // (then abandoned before any day passes — the mission must not draw from the main stream)
    b.sim.startMission('pride'); b.sim.abandonMission();
    a.sim.runDays(60); b.sim.runDays(60);
    assert(JSON.stringify(a.sim.getReports(60)) === JSON.stringify(b.sim.getReports(60)), 'missions: a started-and-abandoned mission leaves free play byte-identical');
    // run → reset → identical run (mission active during the run, mission fires included)
    const c = makeSim(42);
    c.sim.startMission('fire-season');
    let days = 0;
    while (c.sim.getMissionState().status === 'active' && days < 95) { c.sim.runDays(1); days++; }
    const run1 = JSON.stringify(c.sim.getReports(95));
    const end1 = JSON.stringify(c.sim.getMissionState());
    // reset() with NO argument restores the exact construction seed (rng.fork('sim')) — passing a
    // seed explicitly is "restart with a NEW seed" and deliberately uses a different stream
    c.sim.reset();
    assert(c.sim.getMissionState().status === 'none' && c.sim.veg.burntOutTotal === 0, 'missions: reset() clears the mission and the fire counters');
    c.sim.startMission('fire-season');
    let days2 = 0;
    while (c.sim.getMissionState().status === 'active' && days2 < 95) { c.sim.runDays(1); days2++; }
    assert(JSON.stringify(c.sim.getReports(95)) === run1 && JSON.stringify(c.sim.getMissionState()) === end1,
      `missions: run → reset → re-run is byte-identical, mission outcome included (${days} days, end ${end1.slice(0, 60)}…)`);
    // daily cost of the evaluator + biodiversity (budget: < 0.5 ms/day)
    const t = makeSim(43);
    t.sim.startMission('balanced-range');
    const t0 = performance.now();
    t.sim.runDays(30);
    const perDay = (performance.now() - t0) / 30;
    assert(perDay < 5, `missions+biodiversity: whole-day step incl. evaluator ${perDay.toFixed(2)} ms/day mean (sanity bound: the whole day < 5 ms)`);
    // the P3 slice itself (spec budget < 0.5 ms/day): time getBiodiversity() with its cache defeated (worst case,
    // recomputed every day) plus one evaluator step against a mission that never ends. The whole-day bound above
    // does not measure this (critic simulation-round8: the label claimed it did).
    const u = makeSim(43);
    u.sim.runDays(5);
    const report = u.sim.getReports(1)[0] || {};
    report.biodiversity = u.sim.getBiodiversity();
    u.sim.startMission({ id: 'budget-probe', name: 'x', brief: '', goal: { type: 'hold', metric: 'biodiversity.index', min: 1e9, days: 60 }, deadlineDays: 1e9, stars: [60, 2, 4] });
    for (let i = 0; i < 20; i++) { u.sim._bioCache = null; u.sim.getBiodiversity(); u.sim.mission.step(u.sim.clock.day, report); }   // warm-up
    const N = 200, s0 = performance.now();
    for (let i = 0; i < N; i++) { u.sim._bioCache = null; u.sim.getBiodiversity(); u.sim.mission.step(u.sim.clock.day, report); }
    const slice = (performance.now() - s0) / N;
    assert(slice < 0.5, `missions+biodiversity: the P3 slice alone (biodiversity recompute + evaluator step) ${slice.toFixed(3)} ms/day mean (budget < 0.5 ms)`);
  }
}

// ---------------------------------------------------------------- Wave P4: lodging tiers + trust + advisors
console.log('\nWave P4 — tiers, trust, advisors');
{
  const TIERS = ['tent', 'cottage', 'lodge'];
  /** A park with a tiered camp (2 tents + 1 cottage + the layout's lodge) built directly on the world. */
  const makeTierPark = (seed) => {
    const s = makeSim(seed);
    for (const [type, x, z] of [['tent', 80, 468], ['tent', 100, 460], ['cottage', -80, 465]]) {
      const id = s.world.nextId('b');
      s.world.buildings.set(id, { id, type, x, z, rot: 0, w: 8, d: 8, state: 'ok', staff: 0, visitors: 0 });
      s.world.grid.occupancy[s.world.cellAt(x, z).index] = 1;
    }
    s.sim.invalidateCaches();
    return s;
  };

  // ---- tier demand: monotone in rate; elasticity ordering; zero beds → zero occupancy
  {
    const s = makeTierPark(51);
    s.sim.todayArrivals = 200; // a known demand base (getLodging falls back to on-demand math)
    s.sim.satisfaction = 0.8;
    const wantAt = (tier, rate) => { s.sim.setRoomRate(tier, rate); return s.sim.getLodging()[tier]; };
    const REF = { tent: 60, cottage: 110, lodge: 180 };
    const eps = {};
    for (const t of TIERS) {
      const lo = wantAt(t, REF[t] * 0.7), mid = wantAt(t, REF[t]), hi = wantAt(t, REF[t] * 1.5);
      assert(lo.want > mid.want && mid.want > hi.want, `tiers: ${t} demand falls as the rate rises (${lo.want} → ${mid.want} → ${hi.want})`);
      assert(lo.occupied >= mid.occupied && mid.occupied >= hi.occupied, `tiers: ${t} occupancy non-increasing in rate (${lo.occupied}/${mid.occupied}/${hi.occupied})`);
      eps[t] = Math.log(lo.want / hi.want) / Math.log(1.5 / 0.7);
    }
    assert(eps.tent > eps.cottage && eps.cottage > eps.lodge,
      `tiers: measured elasticity orders tent ${eps.tent.toFixed(2)} > cottage ${eps.cottage.toFixed(2)} > lodge ${eps.lodge.toFixed(2)}`);
    const noTents = makeSim(52); // the plain park has only the lodge
    noTents.sim.todayArrivals = 200;
    const L = noTents.sim.getLodging();
    assert(L.tent.beds === 0 && L.tent.occupied === 0 && L.tent.occupancy === 0, 'tiers: a tier with no beds has zero occupancy');
    assert(L.lodge.beds > 0 && L.lodge.want > 0, `tiers: the lone lodge absorbs the whole share (want ${L.lodge.want})`);
  }

  // ---- tiers run end-to-end: report.lodging, revenue lands in the ledger, getLodging matches
  {
    const s = makeTierPark(53);
    s.sim.runDays(5);
    const rep = s.sim.getReport();
    assert(rep.lodging && rep.lodging.cottage.beds === 6 && rep.lodging.tent.beds === 4 && rep.lodging.lodge.beds > 0,
      `tiers: report.lodging carries each tier's beds (${rep.lodging.tent.beds}+${rep.lodging.cottage.beds}+${rep.lodging.lodge.beds})`);
    let sum = 0; for (const t of TIERS) sum += rep.lodging[t].occupied * rep.lodging[t].rate * (0.8 + 0.4 * ({ tent: 0.55, cottage: 0.7, lodge: 0.85 })[t]);
    assert(Math.abs(rep.incomeBreakdown.lodge - sum) < 1, `tiers: lodge income is the per-tier revenue sum ($${Math.round(rep.incomeBreakdown.lodge)})`);
    assert(rep.lodgeNights === TIERS.reduce((a, t) => a + rep.lodging[t].occupied, 0), 'tiers: lodgeNights is Σ occupied across tiers');
    assert(typeof rep.villageTrust === 'number' && typeof rep.poachRisk === 'number', 'tiers: report carries villageTrust and poachRisk');
  }

  // ---- trust: layoff hit (capped), re-hire does not restore, slow drift, poach term
  {
    const a = makeTierPark(54), b = makeTierPark(54);
    a.sim.fire('keeper', 4); // 0.03 × 4 = 0.12
    assert(Math.abs((b.sim.getVillageTrust() - a.sim.getVillageTrust()) - 0.12) < 1e-9,
      `trust: firing 4 costs 0.12 immediately (${b.sim.getVillageTrust().toFixed(3)} → ${a.sim.getVillageTrust().toFixed(3)})`);
    a.sim.fire('keeper', 20); // would be 0.6 — capped at 0.3/day
    const afterCap = a.sim.getVillageTrust();
    assert(afterCap >= b.sim.getVillageTrust() - 0.12 - 0.3 - 1e-9, `trust: the daily layoff hit is capped at 0.3 (${afterCap.toFixed(3)})`);
    const beforeHire = a.sim.getVillageTrust();
    a.sim.hire('keeper', 24);
    assert(a.sim.getVillageTrust() === beforeHire, 'trust: re-hiring does not restore trust');
    // the layoff is still remembered 10 days later vs a same-seed park that never fired anyone
    a.sim.runDays(10); b.sim.runDays(10);
    assert(a.sim.getVillageTrust() < b.sim.getVillageTrust() - 0.05,
      `trust: 10 days after re-hiring, trust is still below the control (${a.sim.getVillageTrust().toFixed(3)} vs ${b.sim.getVillageTrust().toFixed(3)}) — a memory, not an event`);
    // the poach term: same park, same seed, only trust forced apart → poachRisk differs by
    // ~poachK × Δmax(0, 0.5 − trust) (a hair under 0.03: the day's drift runs before the term)
    const lo = makeTierPark(55), hi = makeTierPark(55);
    lo.sim.trust = 0; hi.sim.trust = 0.6;
    lo.sim.runDays(1); hi.sim.runDays(1);
    const d = lo.sim.getReport().poachRisk - hi.sim.getReport().poachRisk;
    assert(d > 0.025 && d <= 0.03 + 1e-9, `trust: poachRisk gains ~0.06 × max(0, 0.5 − trust) (Δ ${d.toFixed(4)} at trust 0 vs 0.6)`);
  }
  // the cap is per DAY across calls (the ui fires one person per click), and only people actually let go count
  {
    const c = makeTierPark(58);
    c.sim.hire('keeper', 20);
    const t0 = c.sim.getVillageTrust();
    for (let i = 0; i < 12; i++) c.sim.fire('keeper', 1); // 12 × 0.03 = 0.36 uncapped
    assert(Math.abs((t0 - c.sim.getVillageTrust()) - 0.3) < 1e-9,
      `trust: 12 one-person layoffs in one day cost exactly the 0.3 daily cap (${t0.toFixed(3)} → ${c.sim.getVillageTrust().toFixed(3)})`);
    c.sim.runDays(1);
    const t1 = c.sim.getVillageTrust();
    c.sim.fire('keeper', 1);
    assert(Math.abs((t1 - c.sim.getVillageTrust()) - 0.03) < 1e-9, 'trust: the cap resets the next day (one more layoff costs 0.03)');
    const e = makeTierPark(58);
    e.sim.fire('guide', e.sim.staff.guide.n);
    const t2 = e.sim.getVillageTrust();
    e.sim.fire('guide', 5);
    assert(e.sim.getVillageTrust() === t2, 'trust: "firing" from an empty role costs nothing');
  }

  // ---- advisors: pure advise() — thresholds, hysteresis band, cooldown, null-clear
  {
    const rep = (day, o = {}) => ({ day, happiness: {}, habitats: {}, events: [], net: 0, cash: 50000,
      staffCoverage: {}, lodging: {}, villageTrust: 0.6, poachRisk: 0.004, morale: 0.6, died: 0, ...o });
    let out = advise(rep(1, { morale: 0.3 }));
    assert(out.messages.some((m) => m.key === 'morale-low'), 'advise: low morale fires the liaison warning');
    let state = out.state;
    out = advise(rep(2, { morale: 0.45 }), state); // above start (0.4), below clear (0.5): hysteresis holds
    assert(out.messages.some((m) => m.key === 'morale-low'), 'advise: hysteresis — the message stays inside the band');
    state = out.state;
    out = advise(rep(3, { morale: 0.55 }), state); // past clear: message clears
    assert(!out.messages.some((m) => m.key === 'morale-low'), 'advise: recovered past the clear line → cleared');
    state = out.state;
    out = advise(rep(4, { morale: 0.3 }), state); // bad again one day later: cooldown blocks
    assert(!out.messages.some((m) => m.key === 'morale-low'), 'advise: a cleared message cannot re-fire within 3 days');
    state = out.state;
    out = advise(rep(7, { morale: 0.3 }), state); // 4 days after clearing: fires again
    assert(out.messages.some((m) => m.key === 'morale-low'), 'advise: after the cooldown the message returns');
    // raw metrics keep a message up inside its band (a metric that returned null below `start` cleared the next day)
    let st = advise(rep(1, { poachRisk: 0.03 })).state;
    out = advise(rep(2, { poachRisk: 0.012 }), st);
    assert(out.messages.some((m) => m.key === 'poach-risk'), 'advise: poach-risk stays up between its clear (0.008) and start (0.02) lines');
    out = advise(rep(3, { poachRisk: 0.005 }), out.state);
    assert(!out.messages.some((m) => m.key === 'poach-risk'), 'advise: poach-risk clears once below 0.008');
    // smoothed money: one loss day in a profitable week is not advice; a losing week is
    st = null;
    for (let d = 1; d <= 6; d++) st = advise(rep(d, { net: 3000 }), st).state;
    out = advise(rep(7, { net: -8000 }), st);
    assert(!out.messages.some((m) => m.key === 'losing-money'), 'advise: one loss day after six profitable ones does not fire losing-money (7-day mean)');
    st = null;
    for (let d = 1; d <= 7; d++) { out = advise(rep(d, { net: -2000 }), st); st = out.state; }
    assert(out.messages.some((m) => m.key === 'losing-money' && /2,000 a day/.test(m.text)), 'advise: a losing week fires losing-money with the weekly mean');
    // overgrazing reads report.habitats[*].species[*].need vs food (the field it used to read never existed there)
    out = advise(rep(1, { habitats: { 1: { species: { zebra: { n: 40, food: 30, need: 44 } } } } }));
    assert(out.messages.some((m) => m.key === 'overgrazed'), 'advise: overgrazed fires when a habitat\'s need exceeds its food');
    const sim = makeTierPark(59); sim.sim.runDays(2);
    const hs = Object.values(sim.sim.getReport().habitats || {});
    assert(hs.length && hs.every((h) => Object.values(h.species).every((x) => 'need' in x)), 'report: every habitat species row carries need (the overgrazing input)');
    // critical ranks above warn; advisor attribution
    out = advise(rep(8, { morale: 0.3, net: -5000, died: 5 }));
    assert(out.messages[0].level === 'critical', 'advise: critical sorts first');
    const advisors = new Set(out.messages.map((m) => m.advisor));
    assert(advisors.has('liaison') && advisors.has('treasurer') && advisors.has('ecologist'), 'advise: the three personas all speak');
    // determinism of the sim's daily pass: same seed, tiered park → identical advice series
    const x = makeTierPark(56), y = makeTierPark(56);
    x.sim.runDays(20); y.sim.runDays(20);
    assert(JSON.stringify(x.sim.getAdvice()) === JSON.stringify(y.sim.getAdvice()), 'advise: same-seed runs produce identical advice');
  }

  // ---- determinism with tiers present (rates in play)
  {
    const a = makeTierPark(57), b = makeTierPark(57);
    a.sim.setRoomRate('tent', 45); b.sim.setRoomRate('tent', 45);
    a.sim.setRoomRate('lodge', 250); b.sim.setRoomRate('lodge', 250);
    a.sim.runDays(60); b.sim.runDays(60);
    assert(JSON.stringify(a.sim.getReports(60)) === JSON.stringify(b.sim.getReports(60)), 'tiers: same seed + same rates → byte-identical 60-day reports');
  }
}

const R = base.sim.getReport();
console.log(`\nbaseline day ${R.day}: cash $${fmt(R.cash)}  income $${fmt(R.income)}  expenses $${fmt(R.expenses)}  visitors ${R.visitors}  sat ${(R.satisfaction * 100).toFixed(0)} %  rep ${(R.reputation * 100).toFixed(0)} %  morale ${(R.morale * 100).toFixed(0)} %  village ${(R.prosperity * 100).toFixed(0)} %  season ${R.season}`);
console.log('  population: ' + Object.entries(R.population).map(([s, n]) => `${s} ${n} (${(R.happiness[s] * 100).toFixed(0)} %)`).join(', '));
console.log('  income: ' + Object.entries(R.incomeBreakdown).map(([k, v]) => `${k} $${fmt(v)}`).join(', '));
console.log('  expenses: ' + Object.entries(R.expenseBreakdown).map(([k, v]) => `${k} $${fmt(v)}`).join(', '));
const evs = base.sim.reports.flatMap((r) => r.events).slice(-5);
console.log('  recent events: ' + (evs.length ? evs.map((e) => `d${e.day} ${e.type}`).join(', ') : 'none'));

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) { console.log('failures:\n  ' + failures.join('\n  ')); process.exit(1); }
