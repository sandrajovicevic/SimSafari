#!/usr/bin/env node
// effects — exposure-calibration harness (module-owned; modelled on tools/screenshot.mjs).
//
// Stages the 'calibrate' preset (a neutral grey card filling the frame, see showcase.js) and shoots
// it at a series of times of day with (a) the full default pipeline, (b) a "bare" chain (every
// optional pass off: scene -> resolve -> grade-identity -> output) and (c) the bypass path
// (setEnabled('pipeline', false) -> one direct renderer.render()). Reports mean luminance per shot
// plus the on/off ratios — the chain is exposure-neutral when ratio == 1 at every hour.
//
//   node src/modules/effects/measure.mjs --tag before
//   node src/modules/effects/measure.mjs --tag after --tods 12,17.5
//   node src/modules/effects/measure.mjs --tag after --game          (game 'low' view A/B, 14h + 21.5h)
//   node src/modules/effects/measure.mjs --tag after --tods 17 --probe   (list presets, no captures)
//
// Output: tools/shots/fxcal-<tag>.json + tools/shots/fxcal-<tag>-<name>-{full,bare,off}.png.
// Exit code 1 if the page never became ready or any console/page error was recorded.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../tools/shots');

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith('--')) { const k = s.slice(2); const next = argv[i + 1]; if (next !== undefined && !next.startsWith('--')) { a[k] = next; i++; } else a[k] = true; }
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const URL_BASE = args.url || process.env.SIM_URL || 'http://127.0.0.1:5173';
const TAG = args.tag || 'run';
const TODS = String(args.tods || '9,12,14,17,17.6,19,21.5').split(',').map(Number);
const W = args.w ? +args.w : 960, H = args.h ? +args.h : 540;
const TIMEOUT = +(args.timeout || 120000);

function pngPath(name) { return path.join(OUT_DIR, `fxcal-${TAG}-${name}.png`); }
function saveDataUrl(dataUrl, file) { fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64')); }

async function launch() {
  if (args.swift) { // fallback only: deterministic software GL
    const gpuArgs = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
    return chromium.launch({ headless: true, args: gpuArgs });
  }
  // Default: real GPU through ANGLE D3D11 (same flags as tools/gpu-check.mjs). ON and OFF are shot in
  // the same live page, so both sides of every ratio are the same backend by construction.
  const gpuArgs = ['--use-angle=d3d11', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
  return chromium.launch({ headless: true, args: gpuArgs });
}

/** Runs inside the page: luminance stats of a canvas data URL + pairwise mean abs diff. */
function pageHelpers() {
  window.__meanOf = (dataUrl) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const w = c.width, h = c.height;
      let sum = 0, cSum = 0, cN = 0, kSum = 0, kN = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
        sum += l;
        const inX = x < w * 0.15 || x > w * 0.85, inY = y < h * 0.15 || y > h * 0.85;
        if (Math.abs(x / w - 0.5) < 0.15 && Math.abs(y / h - 0.5) < 0.15) { cSum += l; cN++; }
        if (inX && inY) { kSum += l; kN++; }
      }
      res({ mean: sum / (w * h), centre: cSum / Math.max(1, cN), corners: kSum / Math.max(1, kN), w, h });
    };
    img.onerror = () => rej(new Error('image decode failed'));
    img.src = dataUrl;
  });
  window.__diffOf = (aUrl, bUrl) => Promise.all([window.__meanOfKeep(aUrl), window.__meanOfKeep(bUrl)]).then(([A, B]) => {
    const w = A.img.width, h = A.img.height, dA = A.data, dB = B.data;
    let sum = 0;
    for (let i = 0; i < dA.length; i += 4) sum += Math.abs(dA[i] - dB[i]) + Math.abs(dA[i + 1] - dB[i + 1]) + Math.abs(dA[i + 2] - dB[i + 2]);
    return sum / (w * h * 3);
  });
  // keep-pixel-data variants used by __diffOf
  window.__meanOfKeep = (dataUrl) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      res({ img, data: g.getImageData(0, 0, img.width, img.height).data });
    };
    img.onerror = () => rej(new Error('image decode failed'));
    img.src = dataUrl;
  });
}

/** One page, three shots: full default chain / bare chain / bypass. Returns a record per shot. */
async function shootSeries(browser, { url, label }) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const consoleErrors = [], pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 1500)); });
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 1500)));
  let ready = false, fatal = null, out = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForFunction(() => window.__SIM__ && window.__SIM__.ready === true, null, { timeout: TIMEOUT });
    ready = true;
    await page.evaluate((n) => window.__SIM__.settle(n), 36);
    await page.evaluate(() => new Promise((res) => { let i = 0; const f = () => (++i >= 4 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    await page.evaluate(pageHelpers);
    if (args.decompose) await page.evaluate(() => { window.__decompose = true; });
    if (args['measure-probe'] || args.measureProbe) await page.evaluate(() => { window.__measureProbe = true; });
    out = await page.evaluate(async () => {
      const app = window.__SIM__.app;
      const api = app.registry.get('effects');
      api.setEnabled('particles', false); // both paths draw particles differently (soft vs hardware depth); excluded from the gain measurement
      const grab = async (which) => {
        const st = window.__SIM__.capture(true);
        const m = await window.__meanOf(st.dataUrl);
        const png = st.dataUrl;
        delete st.dataUrl;
        return { which, mean: m.mean, centre: m.centre, corners: m.corners, w: m.w, h: m.h, draws: st.drawCalls, triangles: st.triangles, exposure: app.renderer.toneMappingExposure, gpu: app.stats().gpu, png };
      };
      const shots = {};
      shots.full = await grab('full'); // full default chain
      for (const k of ['ao', 'bloom', 'haze', 'grade', 'aa']) api.setEnabled(k, false);
      shots.bare = await grab('bare'); // bare chain: scene -> resolve -> identity grade -> output
      for (const k of ['ao', 'bloom', 'haze', 'grade', 'aa']) api.setEnabled(k, true);
      api.setEnabled('pipeline', false);
      shots.off = await grab('off'); // bypass: one direct renderer.render()
      api.setEnabled('pipeline', true);
      if (window.__decompose) { // per-term attribution: peel grade sub-terms off one by one
        api.setGrade({ vignette: 0, grain: 0 });
        shots.novig = await grab('novig'); // = full minus vignette/grain
        api.setGrade({ warmth: 0, saturation: 1 });
        shots.nowarm = await grab('nowarm'); // = novig minus warmth/saturation
        api.setGrade({ contrast: 1 });
        shots.flat = await grab('flat'); // = nowarm minus contrast -> should equal bare
        api.setGrade({ vignette: 0.28, grain: 0.02, warmth: 0.35, saturation: 1.05, contrast: 1.06 }); // restore defaults
      }
      const rec = {
        hour: app.world.time.hour, exposure: app.renderer.toneMappingExposure,
        sunUp: api.getSun ? api.getSun().up : null,
        shots: {}, diffs: {},
      };
      for (const w of Object.keys(shots)) { const { png, ...rest } = shots[w]; rec.shots[w] = rest; window.__pngs = window.__pngs || {}; window.__pngs[w] = png; }
      rec.diffs.fullOff = await window.__diffOf(shots.full.png, shots.off.png);
      rec.diffs.bareOff = await window.__diffOf(shots.bare.png, shots.off.png);
      rec.ratioFull = shots.full.mean / shots.off.mean;
      rec.ratioBare = shots.bare.mean / shots.off.mean;
      for (const w of ['novig', 'nowarm', 'flat']) if (shots[w]) rec['ratio_' + w] = shots[w].mean / shots.off.mean;
      if (window.__measureProbe) rec.drawCost = api.measure(); // renders direct + chain, diffs draw calls
      rec.grade = api.getGrade ? api.getGrade() : null;
      return rec;
    });
    for (const w of Object.keys(out?.shots || {})) {
      const dataUrl = await page.evaluate((w2) => window.__pngs[w2], w);
      saveDataUrl(dataUrl, pngPath(`${label}-${w}`));
    }
  } catch (e) {
    fatal = String(e?.message || e);
  }
  const errors = [...new Set([...consoleErrors, ...pageErrors])];
  await page.close();
  return { label, ready, fatal, errors, ...(out || {}) };
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await launch();
  const series = [];
  let allOk = true;
  try {
    if (args.probe) {
      const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
      await page.goto(`${URL_BASE}/?probe=1`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: TIMEOUT });
      console.log(JSON.stringify(await page.evaluate(() => window.__SIM__.presets?.effects), null, 2));
      await page.close();
    } else {
      for (const tod of TODS) {
        const label = args.game ? `game${String(tod).replace('.', '_')}` : `card${String(tod).replace('.', '_')}`;
        const q = new URLSearchParams({ seed: '1', quality: 'high' });
        if (args.game) { q.set('preset', 'low'); q.set('tod', String(tod)); q.set('speed', '0'); }
        else { q.set('module', 'effects'); q.set('preset', args.preset || 'calibrate'); q.set('tod', String(tod)); }
        const r = await shootSeries(browser, { url: `${URL_BASE}/?${q.toString()}`, label });
        series.push(r);
        const ok = r.ready && r.errors.length === 0 && !r.fatal;
        allOk = allOk && ok;
        const f = (x) => (x == null ? 'null' : x.toFixed(1));
        const dec = args.decompose ? ` novig=${r.ratio_novig?.toFixed(3)} nowarm=${r.ratio_nowarm?.toFixed(3)} flat=${r.ratio_flat?.toFixed(3)}` : '';
        const cost = r.drawCost ? ` extraDraws=${r.drawCost.extra} (direct ${r.drawCost.direct} -> chain ${r.drawCost.pipeline})` : '';
        console.log(`${ok ? 'OK ' : 'FAIL'} ${label.padEnd(14)} ratioFull=${r.ratioFull?.toFixed(3)} ratioBare=${r.ratioBare?.toFixed(3)} full=${f(r.shots?.full?.mean)} bare=${f(r.shots?.bare?.mean)} off=${f(r.shots?.off?.mean)} exp=${r.exposure?.toFixed(2)} draws full/off=${r.shots?.full?.draws}/${r.shots?.off?.draws}${dec}${cost}${r.fatal ? ' fatal=' + r.fatal.slice(0, 120) : ''}${r.errors.length ? ' errors=' + r.errors.length : ''}`);
        for (const e of r.errors.slice(0, 5)) console.log('   ! ' + e.split('\n')[0].slice(0, 200));
        if (!r.shots?.full?.gpu || /swiftshader|software/i.test(String(r.shots.full.gpu))) { if (!args.swift) { console.log('   ! expected a real-GPU adapter (ANGLE D3D11), got: ' + r.shots?.full?.gpu); allOk = false; } }
      }
      const report = { tag: TAG, game: !!args.game, backend: args.swift ? 'swiftshader' : 'real-gpu-d3d11', gpu: series[0]?.shots?.full?.gpu ?? null, tods: TODS, url: URL_BASE, date: new Date().toISOString(), series };
      fs.writeFileSync(path.join(OUT_DIR, `fxcal-${TAG}.json`), JSON.stringify(report, null, 2));
      console.log(`report: tools/shots/fxcal-${TAG}.json`);
    }
  } finally {
    await browser.close();
  }
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error('measure.mjs crashed:', e); process.exit(2); });
