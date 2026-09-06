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
const SCENARIOS = (args.scenarios ? String(args.scenarios).split(',') : ['baseline', 'elasticity', 'water', 'sightings', 'bankruptcy', 'determinism']);

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
