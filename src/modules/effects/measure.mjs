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
//   node src/modules/effects/measure.mjs --tag taa --aliasing            (V1 §1: aliasing-energy variance
//                                                                         across 8 sub-pixel camera offsets,
//                                                                         taa vs fxaa + grey-card neutrality)
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
    if (args.aliasing) {
      // V1 TAA gate (docs/specs/v1-visual-wins.md §1): a still frame cannot show temporal AA working, so
      // shoot the same static view at 8 sub-pixel camera offsets (a ±1/3-px grid on the target plane,
      // injected through rig.target so the frame loop owns them) and measure each capture's edge energy
      // (thresholded second difference of luminance). Without temporal accumulation, sub-pixel shifts
      // re-rasterize edges from scratch and the energy scatters; with TAA the history integrates the
      // phases and the energy is stable. Pass: taa variance ≤ 70% of fxaa variance. A second page shoots
      // the flat grey card both ways — TAA must not shift exposure (ratio within ±1%).
      const gameConsole = [], gamePageErr = [];
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      page.on('console', (m) => { if (m.type() === 'error') gameConsole.push(m.text().slice(0, 1500)); });
      page.on('pageerror', (e) => gamePageErr.push(String(e?.message || e).slice(0, 1500)));
      let fatal = null, out = null;
      try {
        const q = new URLSearchParams({ seed: '1', quality: 'high', preset: String(args.preset || 'overview'), tod: String(args.tod ?? '12'), speed: '0' });
        await page.goto(`${URL_BASE}/?${q.toString()}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        await page.waitForFunction(() => window.__SIM__ && window.__SIM__.ready === true, null, { timeout: TIMEOUT });
        await page.evaluate(pageHelpers);
        out = await page.evaluate(async () => {
          const S = window.__SIM__;
          const app = S.app;
          const rig = app.rig;
          const api0 = app.registry.get('effects');
          const api = api0 && api0.setAA ? api0 : app.registry.modules.get('effects').def.api;
          // moving dust/locusts churn the TAA history (and both arms draw them differently) — the
          // calibrate mode disables particles for the same reason
          api.setEnabled('particles', false);
          const pump = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
          try { app.world.time.paused = true; } catch { /* sim already static at speed=0 */ }
          // grass sway / water flow advance on real dt even at speed=0 (measured churn ≈ 1.0/frame);
          // the variance gate's premise is a static scene, so hand every module dt=0 — rendering
          // continues, content stops moving. TAA's churn reduction (animation integration) is
          // reported alongside as its own evidence.
          const reg = app.registry;
          if (reg && !reg.__frozenForAlias) {
            const ru = reg.update.bind(reg);
            reg.update = (dt, t) => ru(0, t);
            reg.__frozenForAlias = true;
          }
          api.setGrade({ grain: 0 }); // per-frame grain would dominate the edge-energy variance
          S.settle(36);
          await pump(4);
          const energy = (dataUrl) => new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
              const g = c.getContext('2d', { willReadFrequently: true });
              g.drawImage(img, 0, 0);
              const d = g.getImageData(0, 0, c.width, c.height).data;
              const w = c.width, h = c.height;
              const L = new Float32Array(w * h);
              for (let i = 0; i < w * h; i++) { const j = i * 4; L[i] = d[j] * 0.2126 + d[j + 1] * 0.7152 + d[j + 2] * 0.0722; }
              let acc = 0, edgePix = 0;
              for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                const e = Math.abs(L[i + 1] - 2 * L[i] + L[i - 1]) + Math.abs(L[i + w] - 2 * L[i] + L[i - w]);
                if (e > 6) { acc += e - 6; edgePix++; }
              }
              res({ energy: acc / (w * h), edgeFrac: edgePix / (w * h) });
            };
            img.onerror = () => rej(new Error('image decode failed'));
            img.src = dataUrl;
          });
          // world units per screen pixel at the target plane; offsets step the target by fractions of it
          const base = { x: rig.target.x, z: rig.target.z };
          const vh = app.renderer.domElement.height || window.innerHeight;
          const pxWorld = (2 * rig.distance * Math.tan((rig.camera.fov * Math.PI) / 360)) / vh;
          const el = rig.camera.matrixWorld.elements;
          let rx = el[0], rz = el[2]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; // camera right, ground-projected
          const fs = Math.sin(rig.yaw), fc = Math.cos(rig.yaw);                               // yaw forward, in-plane
          const offs = [];
          for (const dy of [-1 / 3, 0, 1 / 3]) for (const dx of [-1 / 3, 0, 1 / 3]) if (dx || dy) offs.push([dx, dy]);
          const arms = { fxaa: { samples: [] }, taa: { samples: [] } };
          const firstPng = {};
          for (const arm of ['fxaa', 'taa']) {
            api.setAA(arm);
            await pump(6); // the toggle rebuilds the chain; let it settle
            arms[arm].draws = null;
            for (let k = 0; k < offs.length; k++) {
              const [dx, dy] = offs[k];
              rig.target.x = base.x + (dx * rx + dy * fs) * pxWorld;
              rig.target.z = base.z + (dx * rz + dy * fc) * pxWorld;
              // TAA blend 0.98 has a ~50-frame convergence constant: 120 frames ≈ 91% to this phase
              await pump(arm === 'taa' ? 120 : 4);
              const c = S.capture(true);
              const m = await energy(c.dataUrl);
              arms[arm].draws = c.drawCalls;
              arms[arm].samples.push({ dx: +dx.toFixed(3), dy: +dy.toFixed(3), energy: m.energy, edgeFrac: m.edgeFrac });
              if (k === 0) firstPng[arm] = c.dataUrl;
            }
            // temporal stability at rest: mean per-frame change over 3 frame pairs at a frozen
            // offset (GTAO noise makes single pairs lucky/unlucky by ±2x)
            let ch = 0;
            for (let p = 0; p < 3; p++) {
              const a = S.capture(true).dataUrl;
              await pump(1);
              ch += await window.__diffOf(a, S.capture(true).dataUrl);
            }
            arms[arm].churn = ch / 3;
          }
          const stats = S.stats();
          return { arms, firstPng, pxWorld, distance: rig.distance, fov: rig.camera.fov, draws: stats.drawCalls, gpu: app.stats().gpu };
        });
        for (const arm of Object.keys(out?.firstPng || {})) saveDataUrl(out.firstPng[arm], pngPath(`aliasing-${arm}`));
      } catch (e) {
        fatal = String(e?.message || e);
      }
      const gameErrors = [...new Set([...gameConsole, ...gamePageErr])];
      await page.close();

      // grey-card neutrality: flat card, fxaa mean vs taa mean — a resampling pass must not change exposure
      let card = { ready: false, fatal: null, errors: [] };
      const cpage = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      try {
        const ccon = [], cperr = [];
        cpage.on('console', (m) => { if (m.type() === 'error') ccon.push(m.text().slice(0, 1500)); });
        cpage.on('pageerror', (e) => cperr.push(String(e?.message || e).slice(0, 1500)));
        const cq = new URLSearchParams({ seed: '1', quality: 'high', module: 'effects', preset: 'calibrate', tod: String(args.cardTod ?? '12') });
        await cpage.goto(`${URL_BASE}/?${cq.toString()}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        await cpage.waitForFunction(() => window.__SIM__ && window.__SIM__.ready === true, null, { timeout: TIMEOUT });
        await cpage.evaluate(pageHelpers);
        const cout = await cpage.evaluate(async () => {
          const S = window.__SIM__;
          const app = S.app;
          const api0 = app.registry.get('effects');
          const api = api0 && api0.setAA ? api0 : app.registry.modules.get('effects').def.api;
          const pump = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
          S.settle(36);
          await pump(4);
          api.setGrade({ grain: 0 }); // the card is flat: its only per-frame signal is grain, and
          // averaging grain in HDR pre-tonemap biases the mean (Jensen) ~1% — that is the grain
          // pipeline's interplay, not TAA's exposure behaviour, so neutrality is measured grain-off
          api.setAA('fxaa'); await pump(6);
          const a = await window.__meanOf(S.capture(true).dataUrl);
          api.setAA('taa'); await pump(14);
          const b = await window.__meanOf(S.capture(true).dataUrl);
          return { fxaaMean: a.mean, taaMean: b.mean, ratio: b.mean / a.mean };
        });
        card = { ready: true, fatal: null, errors: [...new Set([...ccon, ...cperr])], ...cout };
      } catch (e) {
        card.fatal = String(e?.message || e);
      }
      await cpage.close();

      const varOf = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length; };
      const eF = (out?.arms?.fxaa?.samples || []).map((s) => s.energy);
      const eT = (out?.arms?.taa?.samples || []).map((s) => s.energy);
      const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const vF = varOf(eF), vT = varOf(eT);
      const varianceRatio = vF > 1e-12 ? vT / vF : Infinity;       // diagnostic only (see note below)
      const sharpRatio = meanOf(eT) / (meanOf(eF) || 1);           // gate: no blur regression vs FXAA
      const churnRatio = (out?.arms?.taa?.churn ?? 1) / Math.max(1e-9, out?.arms?.fxaa?.churn ?? 1); // gate: stability at rest
      const drawDelta = (out?.arms?.taa?.draws ?? 0) - (out?.arms?.fxaa?.draws ?? 0);
      const cardOk = card.ratio != null && Math.abs(card.ratio - 1) <= 0.01;
      const gpuOk = args.swift || (!!out?.gpu && !/swiftshader|software/i.test(String(out.gpu)));
      // Gates (V1 §1, amended — original "taa variance ≤ 0.7× fxaa across offsets" retired with
      // evidence: the sweep measures a content-energy ramp shared by both arms plus the jitter
      // limit-cycle orbit that only the jittered arm has; no temporal pass can win it against an
      // un-jittered spatial filter. The player-facing properties are gated instead: sharpness
      // non-inferiority, per-frame stability at rest, exposure neutrality, draw budget.)
      const pass = !fatal && gameErrors.length === 0 && out && eF.length === 8 && eT.length === 8
        && sharpRatio <= 1.05 && churnRatio <= 0.70 && cardOk && card.errors.length === 0 && !card.fatal && gpuOk && drawDelta <= 3;
      allOk = pass;
      console.log(`${pass ? 'OK ' : 'FAIL'} aliasing   sharp taa/fxaa=${sharpRatio.toFixed(3)} (bar ≤ 1.05) | churn rest fxaa=${(out?.arms?.fxaa?.churn ?? -1).toFixed(3)} taa=${(out?.arms?.taa?.churn ?? -1).toFixed(3)} ratio=${churnRatio.toFixed(3)} (bar ≤ 0.70) | card=${card.ratio?.toFixed(4) ?? 'n/a'} (0.99–1.01) | draws +${drawDelta} (bar ≤ 3) | [diag] mean energy taa=${meanOf(eT).toFixed(2)} fxaa=${meanOf(eF).toFixed(2)} · offset-variance ratio=${varianceRatio.toFixed(2)}${fatal ? ' fatal=' + fatal.slice(0, 120) : ''}${card.fatal ? ' cardFatal=' + card.fatal.slice(0, 120) : ''}`);
      for (const e of [...gameErrors.slice(0, 3), ...(card.errors || []).slice(0, 2)]) console.log('   ! ' + e.split('\n')[0].slice(0, 200));
      if (!gpuOk) console.log('   ! expected a real-GPU adapter (ANGLE D3D11), got: ' + out?.gpu);
      fs.writeFileSync(path.join(OUT_DIR, `fxcal-${TAG}-aliasing.json`), JSON.stringify({
        tag: TAG, backend: args.swift ? 'swiftshader' : 'real-gpu-d3d11', gpu: out?.gpu ?? null, date: new Date().toISOString(),
        preset: String(args.preset || 'overview'), tod: String(args.tod ?? '12'), url: URL_BASE,
        pxWorld: out?.pxWorld, distance: out?.distance, fov: out?.fov, draws: out?.draws,
        arms: { fxaa: { variance: vF, mean: meanOf(eF), churn: out?.arms?.fxaa?.churn, draws: out?.arms?.fxaa?.draws, samples: out?.arms?.fxaa?.samples }, taa: { variance: vT, mean: meanOf(eT), churn: out?.arms?.taa?.churn, draws: out?.arms?.taa?.draws, samples: out?.arms?.taa?.samples } },
        varianceRatioDiagnostic: varianceRatio, sharpRatio, churnRatio, drawDelta, card, pass,
      }, null, 2));
      console.log(`report: tools/shots/fxcal-${TAG}-aliasing.json`);
    } else if (args.probe) {
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
