#!/usr/bin/env node
// Full-page (DOM + canvas) screenshots of the ui showcase. The shared tools/screenshot.mjs captures only the WebGL
// canvas, so the HUD is invisible there; this script uses page.screenshot instead.
//   node src/modules/ui/shot.mjs                      every preset
//   node src/modules/ui/shot.mjs --preset report      one preset
//   node src/modules/ui/shot.mjs --preset night --tod 21.5 [--w 1920 --h 1080] [--game]
// Writes tools/shots/ui-<preset>-<tod>-dom.png and -dom.json (errors, warnings, ui state). Exit 1 on any error.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { presets } from './showcase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../tools/shots');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const n = process.argv[i + 1]; if (n !== undefined && !n.startsWith('--')) { args[a.slice(2)] = n; i++; } else args[a.slice(2)] = true; } }
const BASE = args.url || 'http://127.0.0.1:5173';
const W = +(args.w || 1920), H = +(args.h || 1080);
const list = args.preset ? [args.preset] : Object.keys(presets);

/** page.screenshot waits for a compositor frame, which a heavy WebGL scene under SwiftShader may never deliver in time;
 *  fall back to a raw CDP capture from the surface. */
async function capture(page, file) {
  const t0 = Date.now();
  try {
    await page.screenshot({ path: file, timeout: +(args.shotTimeout || 60000), animations: 'disabled', caret: 'hide' });
    console.log(`   screenshot via playwright in ${Date.now() - t0} ms`);
    return;
  } catch (e) {
    console.log(`   page.screenshot failed after ${Date.now() - t0} ms (${String(e.message).split('\n')[0].slice(0, 80)}); trying CDP`);
  }
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  await cdp.detach();
  console.log(`   screenshot via CDP in ${Date.now() - t0} ms`);
}

const browser = await chromium.launch({
  headless: true, executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
let allOk = true;
fs.mkdirSync(OUT, { recursive: true });
for (const preset of list) {
  const tod = args.tod ?? presets[preset]?.tod ?? 15;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const consoleErrors = [], pageErrors = [], warnings = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 800)); else if (m.type() === 'warning') warnings.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 800)));
  const q = new URLSearchParams({ preset, tod: String(tod), seed: String(args.seed || 1), quality: args.quality || 'high' });
  if (!args.game) q.set('module', 'ui');
  const url = `${BASE}/?${q}`;
  const base = `ui-${preset}-${String(tod).replace('.', '_')}-dom`;
  let ready = false, state = null, simErrors = [], fatal = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__SIM__ && window.__SIM__.ready === true, null, { timeout: 90000 });
    ready = true;
    await page.waitForTimeout(+(args.wait || 1200));
    if (args.hover) await page.hover(args.hover).catch(() => {});
    if (args.key) { await page.keyboard.press(args.key); await page.waitForTimeout(300); }
    state = await page.evaluate(() => ({ ui: globalThis.__SIMSAFARI_UI__?.api?.getState?.() ?? null, modules: window.__SIM__.modules, camera: window.__SIM__.getCamera(), time: { ...window.__SIM__.world.time }, drawCalls: window.__SIM__.drawCalls }));
    simErrors = await page.evaluate(() => window.__SIM__.errors.map((e) => e.text));
    await capture(page, path.join(OUT, base + '.png'));
  } catch (e) { fatal = String(e?.message || e); }
  const errors = [...new Set([...simErrors, ...pageErrors, ...consoleErrors])];
  const ok = ready && !fatal && errors.length === 0;
  allOk = allOk && ok;
  fs.writeFileSync(path.join(OUT, base + '.json'), JSON.stringify({ preset, tod, url, ready, fatal, errors, warnings: warnings.slice(0, 30), ...state, png: path.relative(process.cwd(), path.join(OUT, base + '.png')) }, null, 2));
  console.log(`${ok ? 'OK ' : 'FAIL'} ${base.padEnd(30)} ready=${ready} errors=${errors.length} ui=${state?.ui ? JSON.stringify(state.ui) : 'n/a'}${fatal ? ' fatal=' + fatal.slice(0, 160) : ''}`);
  for (const e of errors.slice(0, 5)) console.log('   ! ' + e.split('\n')[0].slice(0, 220));
  await page.close();
}
await browser.close();
process.exit(allOk ? 0 : 1);
