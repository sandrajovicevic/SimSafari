#!/usr/bin/env node
// Real-GPU verification shots. Unlike tools/screenshot.mjs (which pins SwiftShader for
// deterministic captures), this forces the machine's real GPU through ANGLE D3D11.
// Default headless Chromium silently falls back to SwiftShader-Vulkan, so the D3D11
// flags MUST be passed for any "is it a real-GPU artifact?" cross-check (learned 2026-09-07).
//
// Usage:
//   node tools/gpu-check.mjs --url "http://127.0.0.1:5173/?preset=overview&tod=14&seed=1&quality=high" --out gpu-check-after-game-overview-14
//   node tools/gpu-check.mjs --module savannah --preset overview --tod 14 --out gpu-check-after-sav-overview-14
// Writes tools/shots/<out>.png + <out>.json (the JSON carries the page-reported gpu string —
// check it says a real adapter, not SwiftShader). Exit 1 if not ready / errors / no PNG.
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
const TIMEOUT = +(args.timeout || 120000);

// Real GPU only: D3D11 ANGLE. NO swiftshader flags of any kind here.
const GPU_ARGS = ['--use-angle=d3d11', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'];

(async () => {
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const consoleErrors = [], pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 1500)); });
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 1500)));

  const q = new URLSearchParams();
  if (args.module) q.set('module', args.module);
  if (args.preset) q.set('preset', args.preset);
  if (args.tod !== undefined) q.set('tod', String(args.tod));
  if (!args.url) {
    q.set('seed', String(args.seed ?? 1));
    q.set('quality', args.quality || 'high');
  }
  const url = args.url || `${URL_BASE}/?${q.toString()}`;
  const name = args.out || 'gpu-check';
  const t0 = Date.now();
  let ready = false, stats = null, fatal = null, dataUrl = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForFunction(() => window.__SIM__ && window.__SIM__.ready === true, null, { timeout: TIMEOUT });
    ready = true;
    await page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), SETTLE_FRAMES);
    stats = await page.evaluate(() => window.__SIM__.capture(true));
    dataUrl = stats.dataUrl;
    delete stats.dataUrl;
  } catch (e) {
    fatal = String(e?.message || e);
    try { stats = await page.evaluate(() => window.__SIM__ ? window.__SIM__.stats() : null); } catch {}
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pngPath = path.join(OUT_DIR, name + '.png');
  let wrote = false;
  if (dataUrl) {
    fs.writeFileSync(pngPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
    wrote = true;
  } else {
    try { await page.screenshot({ path: pngPath, timeout: 180000 }); wrote = true; } catch {}
  }
  const errors = [...new Set([...(stats?.errors?.map((e) => e.text) || []), ...pageErrors, ...consoleErrors])];
  const report = {
    url, ready, fatal, elapsedMs: Date.now() - t0, errors,
    warnings: stats?.warnings?.map((e) => e.text) ?? null,
    gpu: stats?.gpu ?? null, fps: stats?.fps ?? null, frameMs: stats?.frameMs ?? null,
    drawCalls: stats?.drawCalls ?? null, triangles: stats?.triangles ?? null,
    programs: stats?.programs ?? null, textures: stats?.textures ?? null, memoryMB: stats?.memoryMB ?? null,
    modules: stats?.modules ?? null, time: stats?.time ?? null, camera: stats?.camera ?? null,
    renderer: 'real-gpu-d3d11',
    png: wrote ? path.relative(process.cwd(), pngPath) : null,
  };
  fs.writeFileSync(path.join(OUT_DIR, name + '.json'), JSON.stringify(report, null, 2));
  await page.close();
  await browser.close();
  const ok = ready && errors.length === 0 && !fatal && wrote && report.gpu && !/swiftshader|software/i.test(String(report.gpu));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(40)} gpu=${report.gpu} draws=${report.drawCalls} tris=${report.triangles} fps=${report.fps} errors=${errors.length}${fatal ? ' fatal=' + fatal.slice(0, 150) : ''}${!report.png ? ' NO-PNG' : ''}`);
  for (const e of errors.slice(0, 5)) console.log('   ! ' + e.split('\n')[0].slice(0, 200));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('gpu-check crashed:', e); process.exit(2); });
