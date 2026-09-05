#!/usr/bin/env node
// Headless-Chrome verification tool. See ARCHITECTURE.md §6.
//   node tools/screenshot.mjs --module terrain --preset overview --tod 16 [--seed 1] [--quality high] [--w 1920 --h 1080] [--out name]
//   node tools/screenshot.mjs --module terrain --all-presets
//   node tools/screenshot.mjs --all                     every module × every preset
//   node tools/screenshot.mjs --game [--preset overview --tod 14]   full game
//   node tools/screenshot.mjs --game --all-presets      game at overview/close/low × 8h/14h/21.5h
//   node tools/screenshot.mjs --url http://127.0.0.1:5173 --probe   list modules + presets as JSON
// Flags: --dom        full-page screenshot (canvas + DOM UI) instead of canvas-only capture; suffix -dom
//        --gesture    synthetic click after ready (unlocks AudioContext), --gestureWait ms (1500)
//        --eval "js"  evaluate JS in the page after ready; result stored as evalResult in the JSON
//        --settle N   frames to wait after ready (40); --w/--h viewport; --seed/--quality
// Exit code 1 if the page never became ready or any console/page error was recorded.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'shots');

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith('--')) {
      const k = s.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { a[k] = next; i++; } else a[k] = true;
    } else a._.push(s);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const URL_BASE = args.url || process.env.SIM_URL || 'http://127.0.0.1:5173';
const W = +(args.w || 1920), H = +(args.h || 1080);
const SETTLE_FRAMES = +(args.settle || 40);
const TIMEOUT = +(args.timeout || 90000);

async function launch() {
  const gpuArgs = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
  const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  if (fs.existsSync(exe)) {
    try { return await chromium.launch({ headless: true, executablePath: exe, args: gpuArgs }); } catch {}
  }
  return await chromium.launch({ headless: true, args: gpuArgs });
}

async function shoot(browser, { module: mod, preset, tod, seed, quality, name, extra = '' }) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const consoleErrors = [], consoleWarnings = [], pageErrors = [];
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error') consoleErrors.push(m.text().slice(0, 1500));
    else if (t === 'warning') consoleWarnings.push(m.text().slice(0, 500));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 1500)));

  const q = new URLSearchParams();
  if (mod) q.set('module', mod);
  if (preset) q.set('preset', preset);
  if (tod !== undefined && tod !== null && tod !== '') q.set('tod', String(tod));
  q.set('seed', String(seed ?? 1));
  q.set('quality', quality || 'high');
  const url = `${URL_BASE}/?${q.toString()}${extra}`;
  const t0 = Date.now();
  let ready = false, stats = null, fatal = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForFunction(() => window.__SIM__ && window.__SIM__.ready === true, null, { timeout: TIMEOUT });
    ready = true;
    await page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), SETTLE_FRAMES);
    if (args.gesture) { // synthetic user gesture (audio context unlock)
      await page.mouse.move(W / 2, H / 2); await page.mouse.down(); await page.mouse.up();
      await page.waitForTimeout(+(args.gestureWait || 1500));
    }
    if (args.eval) { // arbitrary JS hook after ready, e.g. --eval "__SIM__.app.registry.get('audio').selfTest()"
      try { stats = { evalResult: await page.evaluate(args.eval) }; } catch (e) { stats = { evalError: String(e?.message || e) }; }
      const st = await page.evaluate(() => window.__SIM__.stats());
      stats = { ...st, ...stats };
      if (!args.dom) { const cap = await page.evaluate(() => window.__SIM__.capture(true)); stats.dataUrl = cap.dataUrl; }
    } else if (args.dom) {
      stats = await page.evaluate(() => window.__SIM__.capture(false));
    } else {
      stats = await page.evaluate(() => window.__SIM__.capture(true));
    }
  } catch (e) {
    fatal = String(e?.message || e);
    try { stats = await page.evaluate(() => window.__SIM__ ? window.__SIM__.stats() : null); } catch {}
  }
  const base = (name || [mod || 'game', preset || 'overview', tod !== undefined && tod !== null && tod !== '' ? String(tod).replace('.', '_') : 'auto'].join('-')) + (args.dom ? '-dom' : '');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pngPath = path.join(OUT_DIR, base + '.png');
  const jsonPath = path.join(OUT_DIR, base + '.json');
  let wrotePng = false;
  if (args.dom && ready) {
    // Full-page composite (WebGL canvas + DOM UI). Needed for ui/audio/simulation panels.
    try { await page.screenshot({ path: pngPath, fullPage: false }); wrotePng = true; } catch {}
    if (stats) delete stats.dataUrl;
  } else if (stats?.dataUrl) {
    fs.writeFileSync(pngPath, Buffer.from(stats.dataUrl.split(',')[1], 'base64'));
    wrotePng = true;
    delete stats.dataUrl;
  } else {
    try { await page.screenshot({ path: pngPath }); wrotePng = true; } catch {}
  }
  const errors = [...(stats?.errors?.map((e) => e.text) || []), ...pageErrors, ...consoleErrors.filter((t) => !stats?.errors?.some((e) => t.includes(e.text.slice(0, 80))))];
  const uniqErrors = [...new Set(errors)];
  const report = {
    module: mod || null, preset: preset || null, tod: tod ?? null, seed: seed ?? 1, quality: quality || 'high', url,
    ready, fatal, elapsedMs: Date.now() - t0,
    errors: uniqErrors,
    warnings: [...new Set([...(stats?.warnings?.map((e) => e.text) || []), ...consoleWarnings])].slice(0, 50),
    fps: stats?.fps ?? null, frameMs: stats?.frameMs ?? null, drawCalls: stats?.drawCalls ?? null, triangles: stats?.triangles ?? null,
    programs: stats?.programs ?? null, textures: stats?.textures ?? null, geometries: stats?.geometries ?? null, memoryMB: stats?.memoryMB ?? null,
    gpu: stats?.gpu ?? null, note: stats?.note, modules: stats?.modules ?? null, time: stats?.time ?? null, camera: stats?.camera ?? null, world: stats?.world ?? null,
    evalResult: stats?.evalResult, evalError: stats?.evalError, dom: !!args.dom,
    png: wrotePng ? path.relative(process.cwd(), pngPath) : null,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  await page.close();
  const ok = ready && uniqErrors.length === 0 && !fatal;
  const failedMods = report.modules ? Object.entries(report.modules).filter(([, m]) => m.status !== 'ok').map(([k, m]) => `${k}:${m.status}`) : [];
  console.log(`${ok ? 'OK ' : 'FAIL'} ${base.padEnd(40)} ready=${ready} errors=${uniqErrors.length} draws=${report.drawCalls} tris=${report.triangles} fps=${report.fps} ${failedMods.length ? 'modules[' + failedMods.join(',') + ']' : ''}${fatal ? ' fatal=' + fatal.slice(0, 120) : ''}`);
  for (const e of uniqErrors.slice(0, 5)) console.log('   ! ' + e.split('\n')[0].slice(0, 200));
  return { ok, report };
}

async function probe(browser) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.goto(`${URL_BASE}/?probe=1`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction(() => window.__SIM__ && window.__SIM__.ready === true, null, { timeout: TIMEOUT });
  const data = await page.evaluate(() => ({ presets: window.__SIM__.presets, corePresets: window.__SIM__.corePresets }));
  await page.close();
  return data;
}

(async () => {
  const browser = await launch();
  let allOk = true;
  try {
    if (args.probe) {
      const p = await probe(browser);
      console.log(JSON.stringify(p, null, 2));
    } else if (args.all) {
      const p = await probe(browser);
      for (const [mod, info] of Object.entries(p.presets)) {
        if (info.status !== 'loaded') { console.log(`FAIL ${mod}: import failed: ${info.error}`); allOk = false; continue; }
        const names = Object.keys(info.presets);
        if (!names.length) { console.log(`FAIL ${mod}: no showcase presets`); allOk = false; continue; }
        for (const preset of names) {
          const r = await shoot(browser, { module: mod, preset, tod: args.tod ?? info.presets[preset].tod, seed: args.seed, quality: args.quality });
          allOk = allOk && r.ok;
        }
      }
    } else if (args.module && args['all-presets']) {
      const p = await probe(browser);
      const info = p.presets[args.module];
      if (!info || info.status !== 'loaded') { console.log(`FAIL ${args.module}: ${info?.error || 'not found'}`); allOk = false; }
      else for (const preset of Object.keys(info.presets)) {
        const r = await shoot(browser, { module: args.module, preset, tod: args.tod ?? info.presets[preset].tod, seed: args.seed, quality: args.quality });
        allOk = allOk && r.ok;
      }
    } else if (args.game && args['all-presets']) {
      for (const preset of ['overview', 'close', 'low']) for (const tod of [8, 14, 21.5]) {
        const r = await shoot(browser, { preset, tod, seed: args.seed, quality: args.quality });
        allOk = allOk && r.ok;
      }
    } else {
      const r = await shoot(browser, { module: args.game ? null : args.module, preset: args.preset, tod: args.tod, seed: args.seed, quality: args.quality, name: args.out, extra: args.extra || '' });
      allOk = r.ok;
    }
  } finally {
    await browser.close();
  }
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error('screenshot tool crashed:', e); process.exit(2); });
