#!/usr/bin/env node
// Gameplay-fidelity harness (ARCHITECTURE.md §10 checklist). Drives the LIVE game's own APIs
// in headless Chrome and writes tools/shots/fidelity-<scenario>.json per scenario.
//
//   node tools/fidelity.mjs                     # all scenarios
//   node tools/fidelity.mjs --scenarios baseline,water
//   node tools/fidelity.mjs --seed 1 --days 30
//
// Every scenario is a fresh page load of the full game (park demo auto-builds), clock paused
// via &speed=0. Sim time advances only through simulation.runDays; vehicle time (which the
// game advances on real frame dt) is advanced by pumping the traffic/animals module update()
// functions with synthetic dt — the same calls the render loop makes, just not throttled to
// SwiftShader's ~1 fps. No scenario reads or patches module internals; everything goes through
// public APIs and the module definition's contract methods (update/tick).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'shots');

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith('--')) { const k = s.slice(2); const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { a[k] = next; i++; } else a[k] = true; }
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const URL_BASE = args.url || process.env.SIM_URL || 'http://127.0.0.1:5173';
const SEED = +(args.seed || 1);
const DAYS = +(args.days || 30);
const TIMEOUT = +(args.timeout || 120000);
const SCENARIOS = (args.scenarios ? String(args.scenarios).split(',') : ['baseline', 'elasticity', 'water', 'sightings', 'bankruptcy', 'determinism', 'poaching', 'drought', 'disease', 'prosperity', 'price-sweep', 'plant-aloe', 'remove-prey', 'spread']);

async function launch() {
  const gpuArgs = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
  const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  if (fs.existsSync(exe)) { try { return await chromium.launch({ headless: true, executablePath: exe, args: gpuArgs }); } catch {} }
  return await chromium.launch({ headless: true, args: gpuArgs });
}

/** Load the full game paused, wait for ready + park demo, settle, return an API handle. */
async function loadGame(browser, { label, tod = 10 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const consoleErrors = [], pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 800)); });
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 800)));
  const url = `${URL_BASE}/?speed=0&seed=${SEED}&tod=${tod}&quality=medium`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction(() => window.__SIM__ && window.__SIM__.ready === true, null, { timeout: TIMEOUT });
  await page.waitForFunction(() => {
    const sim = window.__SIM__.app.registry.modules.get('simulation');
    const park = window.__SIM__.app.registry.modules.get('park');
    return sim?.status === 'ok' && park?.status === 'ok' && window.__SIM__.world.animals.size > 0;
  }, null, { timeout: TIMEOUT });
  await page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), 20);
  const errors = [...new Set([...consoleErrors, ...pageErrors])];
  console.log(`  [${label}] game ready in ${((Date.now() - t0) / 1000).toFixed(1)}s, animals=${await page.evaluate(() => window.__SIM__.world.animals.size)}, errors=${errors.length}`);
  return { page, errors };
}

/** Run the daily sim for n days and return the reports array. price != null sets the ticket price first. */
async function runDays(page, n, price = null) {
  return page.evaluate(async ({ days, price }) => {
    const sim = window.__SIM__.app.registry.modules.get('simulation').def.api;
    if (price !== null) sim.setTicketPrice(price);
    sim.markStart();
    sim.runDays(days);
    return sim.getReports(days);
  }, { days: n, price });
}

function summarizeReports(reports) {
  if (!reports?.length) return null;
  const n = reports.length;
  const mean = (f) => +(reports.reduce((s, r) => s + f(r), 0) / n).toFixed(2);
  const sum = (f) => reports.reduce((s, r) => s + f(r), 0);
  const habitats = reports[reports.length - 1].habitats || {};
  // report.habitats[id] = {id, name, species: {key: {n, quality, happiness, unhappyDays, ...}}} —
  // quality/happiness live per species, so aggregate across the species present.
  const qualities = Object.entries(habitats).map(([id, h]) => {
    const sp = Object.entries(h.species || {}).filter(([, r]) => (r.n ?? 0) > 0);
    const qs = sp.map(([, r]) => r.quality ?? 0), hs = sp.map(([, r]) => r.happiness ?? 0);
    return {
      id, name: h.name,
      population: sp.reduce((s, [, r]) => s + (r.n || 0), 0),
      qualityMin: qs.length ? +Math.min(...qs).toFixed(3) : null, qualityMean: qs.length ? +(qs.reduce((a, b) => a + b, 0) / qs.length).toFixed(3) : null,
      happinessMin: hs.length ? +Math.min(...hs).toFixed(3) : null,
      worstSpecies: sp.sort((a, b) => (a[1].quality ?? 1) - (b[1].quality ?? 1)).slice(0, 2).map(([k, r]) => `${k}:q${(r.quality ?? 0).toFixed(2)}/h${(r.happiness ?? 0).toFixed(2)}/n${r.n}`),
    };
  });
  return {
    days: n,
    cashStart: reports[0].cash - reports[0].net, cashEnd: reports[reports.length - 1].cash,
    netPerDay: mean((r) => r.net),
    incomePerDay: mean((r) => r.income), expensesPerDay: mean((r) => r.expenses),
    arrivalsPerDay: mean((r) => r.visitors),
    satisfactionStart: +reports[0].satisfaction.toFixed(3), satisfactionEnd: +reports[reports.length - 1].satisfaction.toFixed(3),
    reputationEnd: +(reports[reports.length - 1].reputation ?? 0).toFixed(3),
    born: sum((r) => r.born || 0), died: sum((r) => r.died || 0), left: sum((r) => r.left || 0), predation: sum((r) => r.predation || 0),
    bankrupt: reports[reports.length - 1].bankrupt === true,
    sightings: sum((r) => r.sightings || 0),
    habitats: qualities.sort((a, b) => a.quality - b.quality),
  };
}

async function scenarioBaseline(browser, { price = 25, label = 'baseline', degradeWater = false } = {}) {
  const { page, errors } = await loadGame(browser, { label });
  let waterNote = null;
  if (degradeWater) {
    waterNote = await page.evaluate(() => {
      const terrain = window.__SIM__.app.registry.modules.get('terrain').def.api;
      const before = window.__SIM__.world.terrain.waterLevel;
      terrain.setWaterLevel(before - 6);
      return { before, after: window.__SIM__.world.terrain.waterLevel };
    });
  }
  const reports = await runDays(page, DAYS, price);
  const out = { scenario: label, price, degradeWater, waterNote, result: summarizeReports(reports), reports, consoleErrors: errors };
  writeJson(label, out);
  await page.close();
  return out;
}

/** Sightings loop, A/B/C on one page. Vehicle time is advanced by pumping the traffic and animals
 * modules' real per-frame update() with synthetic dt (the render loop's own calls, not throttled to
 * SwiftShader's ~1 fps). A: the demo park's own pre-started tours. B (control): all vehicles removed
 * — sightings must drop to 0. C: fresh tours started through the public API from the southernmost
 * road node (the demo's gate). D: flush a sim day and read the daily report's sightings tally. */
async function scenarioSightings(browser) {
  const { page, errors } = await loadGame(browser, { label: 'sightings' });
  const out = await page.evaluate(async ({ secondsA, secondsB, secondsC }) => {
    const reg = window.__SIM__.app.registry.modules;
    const traffic = reg.get('traffic').def, animals = reg.get('animals').def;
    const trafficApi = traffic.api, roadsApi = reg.get('roads').def.api, sim = reg.get('simulation').def.api;
    const pump = async (seconds) => {
      let n = 0;
      const onSight = () => { n++; };
      window.__SIM__.events.on('visitor:sighting', onSight);
      const dt = 0.05;
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) {
        animals.update(dt, i * dt);
        traffic.update(dt, i * dt);
        if (i % 2000 === 0) await new Promise((r) => setTimeout(r));
      }
      window.__SIM__.events.off('visitor:sighting', onSight);
      return n;
    };
    const vehicles = () => window.__SIM__.world.vehicles.size;

    // A — the demo's own tours
    const vehiclesA = vehicles();
    const sightingsA = await pump(secondsA);

    // B — control: no vehicles at all
    for (const v of trafficApi.list()) trafficApi.remove(v.id);
    const vehiclesB = vehicles();
    const sightingsB = await pump(secondsB);

    // C — fresh tours started through the public API, from the park's gate (southernmost node)
    let gate = null;
    for (const node of roadsApi.nodes().values()) if (!gate || node.z > gate.z) gate = node;
    const tours = [];
    for (let i = 0; i < 4; i++) { const t = trafficApi.startTour({ from: gate?.id, stops: [gate?.id] }); if (t) tours.push(t); }
    const vehiclesC = vehicles();
    const sightingsC = await pump(secondsC);

    // D — flush the current sim day so the sightings feed through the visitor/satisfaction model
    sim.markStart();
    sim.runDays(1);
    const rep = sim.getReports(1)[0] || {};
    return {
      A_demoTours: { vehicleSeconds: secondsA, vehicles: vehiclesA, sightings: sightingsA },
      B_noVehicles: { vehicleSeconds: secondsB, vehicles: vehiclesB, sightings: sightingsB },
      C_newTours: { vehicleSeconds: secondsC, vehicles: vehiclesC, toursStarted: tours.length, sightings: sightingsC },
      D_dailyReport: { day: rep.day, visitors: rep.visitors, sightings: rep.sightings, satisfaction: +(rep.satisfaction ?? 0).toFixed(3) },
    };
  }, { secondsA: 1800, secondsB: 600, secondsC: 900 });
  const result = { scenario: 'sightings', result: out, consoleErrors: errors };
  writeJson('sightings', result);
  await page.close();
  return result;
}

/** Player-reachable path to bankruptcy: $0 tickets + a bloated payroll, run until flagged. */
async function scenarioBankruptcy(browser) {
  const { page, errors } = await loadGame(browser, { label: 'bankruptcy' });
  const out = await page.evaluate(async (maxDays) => {
    const reg = window.__SIM__.app.registry.modules;
    const sim = reg.get('simulation').def.api;
    sim.setTicketPrice(0);
    for (const role of sim.staffRoles()) sim.hire(role, 40);
    let bankruptEvent = null;
    window.__SIM__.events.on('sim:bankrupt', (p) => { bankruptEvent = p; });
    sim.markStart();
    let reports = [];
    for (let i = 0; i < maxDays / 10; i++) {
      sim.runDays(10);
      reports = sim.getReports(10);
      if (reports.some((r) => r.bankrupt)) break;
      await new Promise((r) => setTimeout(r));
    }
    const all = sim.getReports(maxDays);
    const dayBankrupt = all.find((r) => r.bankrupt);
    return {
      bankruptFlag: !!dayBankrupt, bankruptDay: dayBankrupt?.day ?? null, bankruptEvent,
      cashAtBankruptcy: dayBankrupt?.cash ?? null,
      cashEnd: all[all.length - 1].cash,
      netPerDay: +(all.reduce((s, r) => s + r.net, 0) / all.length).toFixed(0),
    };
  }, 150);
  const result = { scenario: 'bankruptcy', result: out, consoleErrors: errors };
  writeJson('bankruptcy', result);
  await page.close();
  return result;
}

/** Determinism: the baseline run twice on fresh pages must reproduce identical daily cash. */
async function scenarioDeterminism(browser, baselineA, baselineB) {
  const histA = baselineA.reports.map((r) => [r.day, r.cash]);
  const histB = baselineB.reports.map((r) => [r.day, r.cash]);
  let diverge = null;
  if (baselineB.seed !== baselineA.seed) {
    diverge = !(JSON.stringify(histA) === JSON.stringify(histB));
  }
  const result = { scenario: 'determinism', identical: JSON.stringify(histA) === JSON.stringify(histB), comparedDays: histA.length, seed: SEED };
  writeJson('determinism', result);
  return result;
}

// -------------------------------------------------------------------------------------------------
// Round-3 scenarios (2026-09-08) — all ADDITIVE; the six scenarios above are untouched.
// -------------------------------------------------------------------------------------------------

/** Poaching: strip the guard (no rangers, poverty wages → morale collapses) and the organic,
 * ranger-staffing-driven poach risk fires on its own — no forced events. 100 deterministic days. */
async function scenarioPoaching(browser) {
  const { page, errors } = await loadGame(browser, { label: 'poaching' });
  const out = await page.evaluate(async (days) => {
    const sim = window.__SIM__.app.registry.modules.get('simulation').def.api;
    for (const role of sim.staffRoles()) {
      const st = sim.getState().staff[role];
      if (role === 'ranger') sim.fire(role, st.n);
      sim.setWage(role, 10);
    }
    const rep0 = sim.getState().reputation;
    const animals0 = window.__SIM__.world.animals.size;
    sim.markStart();
    const poachEvents = [];
    for (let i = 0; i < days / 10; i++) {
      sim.runDays(10);
      for (const r of sim.getReports(10)) for (const e of r.events) if (e.type === 'poachers') poachEvents.push({ day: e.day, text: e.text });
      await new Promise((r) => setTimeout(r));
    }
    const st = sim.getState();
    return {
      poached: st.totals.poached, poachEvents,
      moraleEnd: +st.morale.toFixed(3),
      reputationStart: +rep0.toFixed(3), reputationEnd: +st.reputation.toFixed(3),
      animalsStart: animals0, animalsEnd: window.__SIM__.world.animals.size,
      lionsEnd: st.population.lion ?? 0, elephantsEnd: st.population.elephant ?? 0, rhinosEnd: st.population.rhino ?? 0,
    };
  }, 100);
  const result = { scenario: 'poaching', result: out, consoleErrors: errors };
  writeJson('poaching', result);
  await page.close();
  return result;
}

/** Drought: forced via the sim's debug injectEvent (same code path as the daily roll), then the
 * effect chain is measured: habitat water/grass stats drop → habitat quality drops for the thirsty
 * species → extra deaths; stats recover after the drought expires. */
async function scenarioDrought(browser) {
  const { page, errors } = await loadGame(browser, { label: 'drought' });
  const out = await page.evaluate(async () => {
    const sim = window.__SIM__.app.registry.modules.get('simulation').def.api;
    const world = window.__SIM__.world;
    const stats = () => {
      const o = {};
      for (const h of world.habitats.values()) {
        const st = sim.habitatStat(h, true);
        o[h.name] = { water: +st.water.toFixed(2), grass: +st.grass.toFixed(2) };
      }
      return o;
    };
    sim.markStart();
    const before = stats();
    const ev = sim.injectEvent('drought', { duration: 14, strength: 1 });
    sim.runDays(7);
    const during = stats();
    const midReports = sim.getReports(7);
    const deathsDuring = midReports.reduce((a, r) => a + r.died, 0);
    const activeDuring = midReports.every((r) => r.activeEvents.some((e) => e.type === 'drought'));
    const habitatsMid = midReports[midReports.length - 1].habitats;
    sim.runDays(21);
    const after = stats();
    const tail = sim.getReports(21);
    const deathsAfter = tail.reduce((a, r) => a + r.died, 0);
    return {
      event: ev, notified: midReports.some((r) => r.events.some((e) => e.type === 'drought')), activeDuring,
      before, during, after,
      deathsDuring7: deathsDuring, deathsAfter21: deathsAfter,
      wetlandQualityDuring: Object.values(habitatsMid).find((h) => /wetland/i.test(h.name))?.species?.hippo ?? null,
      droughtOver: !sim.getState().activeEvents.some((e) => e.type === 'drought'),
    };
  });
  const result = { scenario: 'drought', result: out, consoleErrors: errors };
  writeJson('drought', result);
  await page.close();
  return result;
}

/** Disease: forced outbreak among the impala — vet spend roughly 2.5x for the species while active,
 * measurable excess deaths, then it runs its course. */
async function scenarioDisease(browser) {
  const { page, errors } = await loadGame(browser, { label: 'disease' });
  const out = await page.evaluate(async () => {
    const sim = window.__SIM__.app.registry.modules.get('simulation').def.api;
    sim.markStart();
    sim.runDays(2);
    const vetBase = sim.getReports(2).reduce((a, r) => a + r.expenseBreakdown.vet, 0) / 2;
    const ev = sim.injectEvent('disease', { species: 'impala', duration: 10 });
    sim.runDays(10);
    const during = sim.getReports(10);
    const vetDuring = during.reduce((a, r) => a + r.expenseBreakdown.vet, 0) / 10;
    let impalaDeaths = 0;
    for (const r of during) for (const h of Object.values(r.habitats)) impalaDeaths += h.species?.impala?.died ?? 0;
    sim.runDays(14);
    const afterDied = sim.getReports(14).reduce((a, r) => a + r.died, 0);
    return {
      event: ev, vetBasePerDay: Math.round(vetBase), vetDuringPerDay: Math.round(vetDuring),
      vetMultiple: +(vetDuring / Math.max(1, vetBase)).toFixed(2),
      impalaDeathsDuring: impalaDeaths, parkDeathsAfter: afterDied,
      diseaseOver: !sim.getState().activeEvents.some((e) => e.type === 'disease'),
      impalaEnd: sim.getState().population.impala ?? 0,
    };
  });
  const result = { scenario: 'disease', result: out, consoleErrors: errors };
  writeJson('disease', result);
  await page.close();
  return result;
}

/** Village prosperity: the same park run rich (volume price, fair wages) vs starved ($60 tickets,
 * poverty wages) — prosperity, feed cost per animal (the prosperity multiplier) and the organic
 * poach exposure all move together. Two fresh pages, both deterministic on the seed. */
async function scenarioProsperity(browser) {
  const run = async (label, starved) => {
    const { page, errors } = await loadGame(browser, { label });
    const r = await page.evaluate(async (starved) => {
      const sim = window.__SIM__.app.registry.modules.get('simulation').def.api;
      if (starved) {
        sim.setTicketPrice(60);
        for (const role of sim.staffRoles()) sim.setWage(role, 10);
      }
      const animals0 = Object.values(sim.getState().population || {}).reduce((a, b) => a + b, 0);
      sim.markStart();
      sim.runDays(45);
      const rs = sim.getReports(45);
      const last = rs[rs.length - 1];
      const st = sim.getState();
      return {
        arrivalsPerDay: +(rs.reduce((a, r) => a + r.visitors, 0) / rs.length).toFixed(1),
        prosperity: last.prosperity, morale: last.morale, efficiency: last.efficiency,
        feedPerDay: Math.round(rs.reduce((a, r) => a + r.expenseBreakdown.feed, 0) / rs.length),
        feedPerAnimalPerDay: +(rs.reduce((a, r) => a + r.expenseBreakdown.feed, 0) / rs.length / Math.max(1, animals0)).toFixed(2),
        poached: st.totals.poached,
        netPerDay: Math.round(rs.reduce((a, r) => a + r.net, 0) / rs.length),
        consoleErrors: [],
      };
    }, starved);
    await page.close();
    return { ...r, consoleErrors: errors };
  };
  const rich = await run('prosperity-rich', false);
  const starved = await run('prosperity-starved', true);
  const out = {
    rich, starved,
    chain: {
      prosperityRisesWithSuccess: rich.prosperity > starved.prosperity + 0.15,
      feedCheaperWhenProsperous: rich.feedPerAnimalPerDay < starved.feedPerAnimalPerDay,
      poachExposureFallsWithProsperity: rich.poached <= starved.poached,
    },
  };
  const result = { scenario: 'prosperity', result: out, consoleErrors: [...rich.consoleErrors, ...starved.consoleErrors] };
  writeJson('prosperity', result);
  return result;
}

/** Price sweep around the volume price (the elasticity scenarios' $10/25/40/60 with $12/15/20 added):
 * where the price-factor clamp (2.0 at ≈$12) stops paying, and whether any price breaks even. */
async function scenarioPriceSweep(browser) {
  const consoleErrors = [];
  const prices = [];
  for (const price of [12, 15, 20]) {
    console.log(`[price-sweep] 30 days @ $${price}`);
    const r = await scenarioBaseline(browser, { price, label: `sweep-${price}` });
    consoleErrors.push(...(r.consoleErrors || []));
    prices.push({ price, arrivalsPerDay: r.result.arrivalsPerDay, incomePerDay: r.result.incomePerDay, expensesPerDay: r.result.expensesPerDay, netPerDay: r.result.netPerDay, satisfactionEnd: r.result.satisfactionEnd, born: r.result.born, left: r.result.left });
  }
  const result = { scenario: 'price-sweep', result: { prices }, consoleErrors };
  writeJson('price-sweep', result);
  return result;
}

// ---------------------------------------------------------------- Wave P1 food web (docs/specs/p1-food-web.md)

/** plant-aloe: aloe + marula planted over the woodland habitat vs an unplanted control page, 30 days
 * each (same seed). Measures the elephant's food capacity and carrying capacity (= min(space, food))
 * every day through simulation.getFoodReport. Pass: capacity(planted) − capacity(control) ≥ 1 on day 30. */
async function scenarioPlantAloe(browser) {
  const run = async (label, planted) => {
    const { page, errors } = await loadGame(browser, { label });
    const r = await page.evaluate(async ({ planted, days }) => {
      const sim = window.__SIM__.app.registry.modules.get('simulation').def.api;
      const world = window.__SIM__.world;
      const h = [...world.habitats.values()].find((x) => /woodland/i.test(x.name || '')) || null;
      if (!h) return { error: 'no woodland habitat' };
      // centroid + radius of the habitat's grid cells
      const g = world.grid; let sx = 0, sz = 0;
      for (const idx of h.cells) { const ix = idx % g.res, iz = (idx - ix) / g.res; const c = world.cellCenter(ix, iz); sx += c.x; sz += c.z; }
      const cx = sx / h.cells.length, cz = sz / h.cells.length, radius = Math.sqrt(h.area / Math.PI) * 0.7;
      const ele = () => { const f = sim.getFoodReport(h.id)?.elephant || {}; return { n: f.n ?? 0, food: f.food ?? 0, capacity: f.capacity ?? 0, foodCapacity: f.foodCapacity ?? 0, spaceCapacity: f.spaceCapacity ?? 0 }; };
      const cash0 = world.economy.cash; // cashSpent is read right after planting, before any day runs
      const plantings = planted ? [sim.plant('aloe', cx, cz, radius, 0.3), sim.plant('marula', cx, cz, radius, 0.25)] : [];
      const cashAfterPlant = world.economy.cash;
      const day0 = ele();
      const series = [];
      for (let d = 0; d < days; d++) { sim.runDays(1); series.push(ele()); if (d % 10 === 9) await new Promise((res) => setTimeout(res)); }
      return { habitat: h.name, habitatHa: +(h.area / 1e4).toFixed(2), centre: [Math.round(cx), Math.round(cz)], radius: Math.round(radius),
        plantings, plantCost: +plantings.reduce((a, p) => a + (p.cost || 0), 0).toFixed(2), cashSpent: +(cash0 - cashAfterPlant).toFixed(2),
        day0, day30: series[series.length - 1], capacitySeries: series.map((e) => e.capacity), foodCapacitySeries: series.map((e) => e.foodCapacity),
        elephantsEnd: sim.getState().population.elephant ?? 0 };
    }, { planted, days: DAYS });
    await page.close();
    return { ...r, consoleErrors: errors };
  };
  const control = await run('plant-aloe-control', false);
  const planted = await run('plant-aloe', true);
  const out = {
    control, planted,
    capacityDelta: (planted.day30?.capacity ?? 0) - (control.day30?.capacity ?? 0),
    foodCapacityDelta: (planted.day30?.foodCapacity ?? 0) - (control.day30?.foodCapacity ?? 0),
  };
  out.pass = out.capacityDelta >= 1;
  const result = { scenario: 'plant-aloe', result: out, consoleErrors: [...control.consoleErrors, ...planted.consoleErrors] };
  writeJson('plant-aloe', result);
  return result;
}

/** remove-prey: every impala/warthog/zebra in the lions' habitat removed through the animals API
 * (the sim's daily census writes them off) vs a control page; lion count, lion capacity and lion
 * happiness recorded daily for 40 days. Pass: lions fall below the control only after ≥ 3 days. */
async function scenarioRemovePrey(browser) {
  const DAYS_RP = 40;
  const run = async (label, strip) => {
    const { page, errors } = await loadGame(browser, { label });
    const r = await page.evaluate(async ({ strip, days }) => {
      const reg = window.__SIM__.app.registry.modules;
      const sim = reg.get('simulation').def.api, animals = reg.get('animals').def.api;
      const world = window.__SIM__.world;
      let hid = null;
      for (const h of world.habitats.values()) if ((sim.getFoodReport(h.id)?.lion?.n ?? 0) > 0) { hid = h.id; break; }
      if (hid == null) return { error: 'no lions' };
      const hab = world.habitats.get(hid);
      let removed = 0;
      if (strip) {
        const ids = [];
        for (const a of world.animals.values()) {
          if (!a || !['impala', 'warthog', 'zebra'].includes(a.species)) continue;
          const ah = a.habitat ?? a.habitatId ?? (world.grid.habitatId[world.cellAt(a.x, a.z).index] || 0);
          if (ah === hid) ids.push(a.id);
        }
        for (const id of ids) { animals.remove(id); removed++; }
      }
      const lions = [], caps = [], happy = [], preyKg = [];
      for (let d = 0; d < days; d++) {
        sim.runDays(1);
        const rec = sim.getReport()?.habitats?.[hid]?.species?.lion;
        const f = sim.getFoodReport(hid)?.lion;
        lions.push(rec?.n ?? 0); happy.push(rec?.happiness ?? 0);
        caps.push(f?.capacity ?? 0); preyKg.push(f?.food ?? 0);
        if (d % 10 === 9) await new Promise((res) => setTimeout(res));
      }
      return { habitat: hab?.name, removed, lions, capacity: caps, happiness: happy, preyOfftakeKg: preyKg };
    }, { strip, days: DAYS_RP });
    await page.close();
    return { ...r, consoleErrors: errors };
  };
  const control = await run('remove-prey-control', false);
  const removed = await run('remove-prey', true);
  const firstBelow = (removed.lions || []).findIndex((n, i) => n < control.lions[i]);
  const out = { control, removed, lagDays: firstBelow < 0 ? null : firstBelow + 1,
    lionsDay40: { removed: removed.lions?.at(-1), control: control.lions?.at(-1) } };
  out.pass = out.lagDays !== null && out.lagDays >= 3;
  const result = { scenario: 'remove-prey', result: out, consoleErrors: [...control.consoleErrors, ...removed.consoleErrors] };
  writeJson('remove-prey', result);
  return result;
}

/** spread: a 24 m red-oat patch planted on free grassland outside every habitat (no grazing), four
 * runs on one page from the same start state via simulation.reset(): control (no planting), planted,
 * control + drought, planted + a forced 30-day drought. The patch's reach = cells within 200 m whose red-oat cover exceeds
 * the unplanted run's under the same weather by ≥ 0.01; extra cover-ha = Σ (planted − control) × 0.0256 ha;
 * covered ha = cells with red-oat cover ≥ 0.3. The site is the free ground with the least red oat. */
async function scenarioSpread(browser) {
  const { page, errors } = await loadGame(browser, { label: 'spread' });
  const out = await page.evaluate(async (days) => {
    const sim = window.__SIM__.app.registry.modules.get('simulation').def.api;
    const world = window.__SIM__.world;
    const V = world.vegetation, R = V.res, C = V.cell, half = world.half;
    // pick free ground (no habitat, no building/road, dry land, GRASS/DRY_GRASS/DIRT biome) where red oat
    // is sparsest (so the patch is not hidden in an existing sward), nearest the centre on ties
    let best = null;
    for (let iz = 4; iz < R - 4; iz++) for (let ix = 4; ix < R - 4; ix++) {
      const x = (ix + 0.5) * C - half, z = (iz + 0.5) * C - half;
      let ok = true;
      for (let dz = -24; dz <= 24 && ok; dz += 8) for (let dx = -24; dx <= 24 && ok; dx += 8) {
        const c = world.cellAt(x + dx, z + dz);
        const b = world.biomeAt(x + dx, z + dz);
        if (world.grid.habitatId[c.index] || world.grid.occupancy[c.index] || world.isWater(x + dx, z + dz) || (b !== 0 && b !== 1 && b !== 2)) ok = false;
      }
      if (!ok) continue;
      const d = x * x + z * z;
      let oat = 0;
      for (let dz = -16; dz <= 16; dz += 16) for (let dx = -16; dx <= 16; dx += 16) oat += sim.getVegetation(x + dx, z + dz).red_oat;
      if (!best || oat < best.oat - 1e-6 || (Math.abs(oat - best.oat) <= 1e-6 && d < best.d)) best = { x, z, d, oat };
    }
    if (!best) return { error: 'no free grassland' };
    const window200 = [];
    for (let iz = 0; iz < R; iz++) for (let ix = 0; ix < R; ix++) {
      const x = (ix + 0.5) * C - half, z = (iz + 0.5) * C - half;
      if ((x - best.x) ** 2 + (z - best.z) ** 2 <= 200 * 200) window200.push([x, z]);
    }
    const oat = () => window200.map(([x, z]) => sim.getVegetation(x, z).red_oat);
    const runVariant = async (plant, drought) => {
      sim.reset();
      const res = plant ? sim.plant('red_oat', best.x, best.z, 24, 0.25) : null;
      if (drought) sim.injectEvent('drought', { duration: days, strength: 1 });
      const snaps = { 0: oat() };
      for (let d = 1; d <= days; d++) { sim.runDays(1); if (d % 10 === 0) { snaps[d] = oat(); await new Promise((r) => setTimeout(r)); } }
      return { res, snaps };
    };
    const control = await runVariant(false, false);
    const planted = await runVariant(true, false);
    const controlDrought = await runVariant(false, true);
    const droughtRun = await runVariant(true, true);
    // each planted run is compared with the unplanted run under the same weather
    const reach = (v, ctl, d) => v.snaps[d].filter((c, i) => c - ctl.snaps[d][i] >= 0.01).length;
    const extraHa = (v, ctl, d) => +(v.snaps[d].reduce((a, c, i) => a + Math.max(0, c - ctl.snaps[d][i]), 0) * (C * C / 1e4)).toFixed(3);
    const coveredHa = (v, d) => +(v.snaps[d].filter((c) => c >= 0.3).length * (C * C / 1e4)).toFixed(3);
    const days10 = [0, 10, 20, 30].filter((d) => d <= days);
    return {
      site: { x: Math.round(best.x), z: Math.round(best.z), biome: world.biomeAt(best.x, best.z), redOatAround: +(best.oat / 9).toFixed(3) },
      planting: planted.res,
      days: days10,
      reachCells: { planted: days10.map((d) => reach(planted, control, d)), drought: days10.map((d) => reach(droughtRun, controlDrought, d)) },
      extraCoverHa: { planted: days10.map((d) => extraHa(planted, control, d)), drought: days10.map((d) => extraHa(droughtRun, controlDrought, d)) },
      coveredHaOver03: { control: days10.map((d) => coveredHa(control, d)), planted: days10.map((d) => coveredHa(planted, d)),
        controlDrought: days10.map((d) => coveredHa(controlDrought, d)), drought: days10.map((d) => coveredHa(droughtRun, d)) },
    };
  }, DAYS);
  if (!out.error) {
    const ep = out.extraCoverHa.planted, ed = out.extraCoverHa.drought, cp = out.coveredHaOver03.planted, cd = out.coveredHaOver03.drought;
    out.pass = cp[cp.length - 1] > cp[0] && ep[ep.length - 1] > ep[0] && ed[ed.length - 1] < ep[ep.length - 1];
  }
  const result = { scenario: 'spread', result: out, consoleErrors: errors };
  writeJson('spread', result);
  await page.close();
  return result;
}

function writeJson(name, data) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const p = path.join(OUT_DIR, `fidelity-${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log(`  -> ${path.relative(process.cwd(), p)}`);
}

(async () => {
  const browser = await launch();
  const results = {};
  try {
    if (SCENARIOS.includes('baseline')) {
      console.log('[baseline] 30 days @ $25');
      results.baseline = await scenarioBaseline(browser, { price: 25 });
      console.log(JSON.stringify(results.baseline.result, null, 2));
    }
    if (SCENARIOS.includes('elasticity')) {
      results.elasticity = [];
      for (const price of [10, 40, 60]) {
        console.log(`[elasticity] 30 days @ $${price}`);
        const r = await scenarioBaseline(browser, { price, label: `elasticity-${price}` });
        results.elasticity.push({ price, arrivalsPerDay: r.result.arrivalsPerDay, incomePerDay: r.result.incomePerDay, netPerDay: r.result.netPerDay, satisfactionEnd: r.result.satisfactionEnd });
      }
      console.log(JSON.stringify(results.elasticity, null, 2));
    }
    if (SCENARIOS.includes('water')) {
      console.log('[water] water table −6 m, 30 days');
      results.water = await scenarioBaseline(browser, { price: 25, degradeWater: true, label: 'water-degraded' });
      console.log(JSON.stringify(results.water.result?.habitats?.slice(0, 3), null, 2));
    }
    if (SCENARIOS.includes('sightings')) {
      console.log('[sightings] 4 tours, 1800 vehicle-seconds pumped through the real update loop');
      results.sightings = await scenarioSightings(browser);
      console.log(JSON.stringify(results.sightings, null, 2));
    }
    if (SCENARIOS.includes('bankruptcy')) {
      console.log('[bankruptcy] $0 tickets + 40×5 staff, until flagged');
      results.bankruptcy = await scenarioBankruptcy(browser);
      console.log(JSON.stringify(results.bankruptcy.result, null, 2));
    }
    if (SCENARIOS.includes('determinism')) {
      console.log('[determinism] baseline re-run, same seed');
      const base = results.baseline || await scenarioBaseline(browser, { price: 25 });
      const b2 = await scenarioBaseline(browser, { price: 25, label: 'determinism-rerun' });
      results.determinism = await scenarioDeterminism(browser, base, b2);
      console.log(JSON.stringify(results.determinism, null, 2));
    }
    if (SCENARIOS.includes('poaching')) {
      console.log('[poaching] rangers fired + poverty wages, 100 organic days');
      results.poaching = await scenarioPoaching(browser);
      console.log(JSON.stringify(results.poaching.result, null, 2));
    }
    if (SCENARIOS.includes('drought')) {
      console.log('[drought] injected 14-day drought, stats + quality + recovery');
      results.drought = await scenarioDrought(browser);
      console.log(JSON.stringify(results.drought.result, null, 2));
    }
    if (SCENARIOS.includes('disease')) {
      console.log('[disease] injected impala outbreak, vet + deaths + recovery');
      results.disease = await scenarioDisease(browser);
      console.log(JSON.stringify(results.disease.result, null, 2));
    }
    if (SCENARIOS.includes('prosperity')) {
      console.log('[prosperity] rich vs starved park, 45 days each');
      results.prosperity = await scenarioProsperity(browser);
      console.log(JSON.stringify(results.prosperity.result, null, 2));
    }
    if (SCENARIOS.includes('price-sweep')) {
      results['price-sweep'] = await scenarioPriceSweep(browser);
      console.log(JSON.stringify(results['price-sweep'].result, null, 2));
    }
    if (SCENARIOS.includes('plant-aloe')) {
      console.log('[plant-aloe] aloe + marula over the woodland vs control, 30 days each');
      results['plant-aloe'] = await scenarioPlantAloe(browser);
      const r = results['plant-aloe'].result;
      console.log(JSON.stringify({ capacityDelta: r.capacityDelta, foodCapacityDelta: r.foodCapacityDelta, pass: r.pass, control: r.control.day30, planted: r.planted.day30, cost: r.planted.plantCost }, null, 2));
    }
    if (SCENARIOS.includes('remove-prey')) {
      console.log('[remove-prey] impala/warthog/zebra removed from the lions\' habitat vs control, 40 days');
      results['remove-prey'] = await scenarioRemovePrey(browser);
      const r = results['remove-prey'].result;
      console.log(JSON.stringify({ lagDays: r.lagDays, lionsDay40: r.lionsDay40, pass: r.pass, removed: r.removed.removed, lions: r.removed.lions, control: r.control.lions }, null, 2));
    }
    if (SCENARIOS.includes('spread')) {
      console.log('[spread] red-oat patch on free grassland: control / planted / planted + drought');
      results.spread = await scenarioSpread(browser);
      console.log(JSON.stringify(results.spread.result, null, 2));
    }
  } finally {
    await browser.close();
  }
  const failed = SCENARIOS.filter((s) => {
    const r = results[s];
    if (!r) return true;
    const errs = r.consoleErrors?.length || 0;
    return errs > 0;
  });
  console.log(failed.length ? `FAIL: console errors in [${failed.join(', ')}]` : 'OK all scenarios, 0 console errors');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('fidelity harness crashed:', e); process.exit(2); });
