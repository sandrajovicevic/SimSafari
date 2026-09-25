#!/usr/bin/env node
// Headless test of the SimSafari simulation: runs 90 game days on synthetic parks and asserts the spec behaviours.
//   node src/modules/simulation/test.mjs
// Plain node, no dependencies beyond src/core/Rng.js (pure JS). Exit code 1 on any failed assertion.
import { Rng } from '../../core/Rng.js';
import { Simulation } from './sim.js';
import { createPlainWorld, buildPark, applyPark } from './worldgen.js';
import { PLANTS, PLANT_INDEX } from '../../core/Plants.js';

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
