#!/usr/bin/env node
// DOM screenshot + selfTest for the audio showcase (the core screenshot tool captures only the canvas).
//   node src/modules/audio/shot.mjs                      all four presets
//   node src/modules/audio/shot.mjs --preset close --tod 16.5
//   node src/modules/audio/shot.mjs --url http://127.0.0.1:5173
// Writes tools/shots/audio-<preset>-<tod>-dom.png and tools/shots/audio-<preset>-<tod>-dom.json
// (selfTest table, bus levels, layer mix, event log, console errors). Exit 1 on any console error.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_DIR = path.join(ROOT, 'tools', 'shots');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const s = process.argv[i];
  if (s.startsWith('--')) { const n = process.argv[i + 1]; if (n !== undefined && !n.startsWith('--')) { args[s.slice(2)] = n; i++; } else args[s.slice(2)] = true; }
}
const URL_BASE = args.url || process.env.SIM_URL || 'http://127.0.0.1:5173';
const DEFAULTS = [['overview', 15], ['close', 16.5], ['night', 22], ['storm', 17]];
const runs = args.preset ? [[args.preset, args.tod ?? DEFAULTS.find((d) => d[0] === args.preset)?.[1] ?? 12]] : DEFAULTS;

const browser = await chromium.launch({
  headless: true,
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
let allOk = true;
try {
  for (const [preset, tod] of runs) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const consoleErrors = [], pageErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 1500)); });
    page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 1500)));
    const url = `${URL_BASE}/?module=audio&preset=${preset}&tod=${tod}&seed=1&quality=high`;
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__SIM__ && window.__SIM__.ready === true, null, { timeout: 90000 });
    // synthetic user gesture on the canvas (CDP input → counts as user activation)
    await page.mouse.move(960, 540);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(2000);
    const info = await page.evaluate(async () => {
      const api = window.__SIM__.app.registry.get('audio');
      const selfTest = await api.selfTest();
      return {
        state: api.state(), running: api.isRunning(), selfTest, detail: api.lastSelfTest(),
        levels: Array.from(api.getLevels()).map((v) => +v.toFixed(1)), buses: api.buses,
        layers: Array.from(api.getLayers()).map((v) => +v.toFixed(2)), layerNames: api.layers,
        log: api.getLog(), simErrors: window.__SIM__.errors.map((e) => e.text), modules: window.__SIM__.modules,
        drawCalls: window.__SIM__.drawCalls, triangles: window.__SIM__.triangles,
      };
    });
    await page.waitForTimeout(400);
    const base = `audio-${preset}-${String(tod).replace('.', '_')}-dom`;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const png = path.join(OUT_DIR, base + '.png');
    await page.screenshot({ path: png });
    const errors = [...new Set([...info.simErrors, ...pageErrors, ...consoleErrors])];
    const report = { module: 'audio', preset, tod, url, elapsedMs: Date.now() - t0, state: info.state, running: info.running, errors, selfTest: info.selfTest, selfTestDetail: info.detail, levels: Object.fromEntries(info.buses.map((b, i) => [b, info.levels[i]])), layers: Object.fromEntries(info.layerNames.map((l, i) => [l, info.layers[i]])), log: info.log, modules: info.modules, drawCalls: info.drawCalls, triangles: info.triangles, png: path.relative(process.cwd(), png) };
    fs.writeFileSync(path.join(OUT_DIR, base + '.json'), JSON.stringify(report, null, 2));
    const ok = errors.length === 0 && info.running;
    allOk = allOk && ok;
    console.log(`${ok ? 'OK ' : 'FAIL'} ${base.padEnd(30)} state=${info.state} errors=${errors.length} selfTest=${info.detail?.ms ?? '?'} ms  draws=${info.drawCalls} → ${path.relative(process.cwd(), png)}`);
    console.log('  bus levels dBFS: ' + info.buses.map((b, i) => `${b} ${info.levels[i]}`).join('  '));
    console.log('  layers: ' + info.layerNames.map((l, i) => `${l} ${info.layers[i]}`).join('  '));
    console.log('  selfTest {sound: rmsDb}:');
    const names = Object.keys(info.selfTest);
    for (const n of names) {
      const d = info.detail?.detail?.[n] || {};
      console.log(`    ${n.padEnd(16)} rms ${String(info.selfTest[n]).padStart(6)} dB   peak ${String(d.peakDb ?? '?').padStart(6)} dB   ~${String(d.zcrHz ?? '?').padStart(5)} Hz   ${d.seconds ?? '?'} s`);
    }
    console.log('  log: ' + info.log.slice(0, 6).map((e) => `${e.sound}@(${e.x},${e.z}) ${e.dist}m`).join(' | '));
    for (const e of errors.slice(0, 5)) console.log('   ! ' + e.split('\n')[0].slice(0, 200));
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(allOk ? 0 : 1);
