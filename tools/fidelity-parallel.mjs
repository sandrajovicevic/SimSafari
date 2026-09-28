#!/usr/bin/env node
// Run the fidelity harness (tools/fidelity.mjs) as N parallel shards against the one running dev server.
// Verifier tooling: the harness is ~26 sequential page loads of the full game (~2 h on a 4-core
// SwiftShader box); shards cut the wall time without touching fidelity.mjs itself.
//
//   node tools/fidelity-parallel.mjs                    # every default scenario, 2 shards
//   node tools/fidelity-parallel.mjs --jobs 3
//   node tools/fidelity-parallel.mjs --scenarios spread,fire-response --jobs 2
//   node tools/fidelity-parallel.mjs --weights mission-replay=8   # cost hint for a new scenario
//   node tools/fidelity-parallel.mjs --dry-run                     # print the shard plan only
//
// Everything else (--seed, --days, --timeout, --url) is passed through to every shard. Each shard is a
// plain `node tools/fidelity.mjs --scenarios a,b,...`, so results, JSON files and pass/fail semantics are
// exactly the harness's own. Exit code: 0 only if every shard exits 0.
//
// Shards are balanced by page-load count (the dominant cost). `baseline` and `determinism` always share a
// shard: determinism reuses the baseline result from the same process instead of loading it again.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.join(__dirname, 'fidelity.mjs');

const argv = process.argv.slice(2);
const own = new Set(['jobs', 'scenarios', 'weights', 'dry-run']);
const args = {}, pass = [];
for (let i = 0; i < argv.length; i++) {
  const s = argv[i];
  if (!s.startsWith('--')) continue;
  const k = s.slice(2), next = argv[i + 1];
  const v = next !== undefined && !next.startsWith('--') ? (i++, next) : true;
  if (own.has(k)) args[k] = v; else pass.push(s, ...(v === true ? [] : [String(v)]));
}

/** The harness's own default scenario list, read from its source (importing it would run it). */
function defaultScenarios() {
  const src = fs.readFileSync(HARNESS, 'utf8');
  const m = src.match(/const SCENARIOS\s*=\s*\([^?]*\?[^:]*:\s*\[([^\]]*)\]\s*\)/);
  if (!m) throw new Error('cannot find the default SCENARIOS list in tools/fidelity.mjs');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

// Full-game page loads per scenario (measured on the harness as of the P2 merge). Unknown → 2.
const LOADS = {
  baseline: 1, elasticity: 3, water: 1, sightings: 1, bankruptcy: 1, determinism: 1, poaching: 1,
  drought: 1, disease: 1, prosperity: 2, 'price-sweep': 3, 'plant-aloe': 2, 'remove-prey': 2, spread: 3,
  'fire-response': 2, 'fire-regrowth': 1,
};
if (typeof args.weights === 'string') for (const kv of args.weights.split(',')) {
  const [k, v] = kv.split('='); if (k && Number.isFinite(+v)) LOADS[k] = +v;
}

const scenarios = typeof args.scenarios === 'string' ? args.scenarios.split(',').filter(Boolean) : defaultScenarios();
const jobs = Math.max(1, Math.min(+(args.jobs || 2) || 2, scenarios.length));

// Units: baseline+determinism travel together; everything else alone. Longest-processing-time first.
const units = [];
const has = (s) => scenarios.includes(s);
if (has('baseline') && has('determinism')) units.push({ names: ['baseline', 'determinism'], w: 2 });
for (const s of scenarios) {
  if (has('baseline') && has('determinism') && (s === 'baseline' || s === 'determinism')) continue;
  // determinism alone reloads the baseline itself
  units.push({ names: [s], w: s === 'determinism' && !has('baseline') ? 2 : (LOADS[s] ?? 2) });
}
units.sort((a, b) => b.w - a.w);
const shards = Array.from({ length: jobs }, () => ({ names: [], w: 0 }));
for (const u of units) { const s = shards.reduce((a, b) => (b.w < a.w ? b : a)); s.names.push(...u.names); s.w += u.w; }
// keep the harness's own order inside a shard (baseline before determinism matters)
for (const s of shards) s.names.sort((a, b) => scenarios.indexOf(a) - scenarios.indexOf(b));

console.log(`fidelity-parallel: ${scenarios.length} scenarios in ${jobs} shard(s)`);
shards.forEach((s, i) => console.log(`  shard ${i + 1}: ~${s.w} page loads — ${s.names.join(',')}`));
if (args['dry-run']) process.exit(0);

const t0 = Date.now();
const runShard = (s, i) => new Promise((resolve) => {
  if (!s.names.length) return resolve({ i, code: 0, s: 0 });
  const started = Date.now();
  const child = spawn(process.execPath, [HARNESS, '--scenarios', s.names.join(','), ...pass], { stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `[${i + 1}] `;
  let buf = '';
  const onData = (d) => {
    buf += d; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) { process.stdout.write(tag + buf.slice(0, nl) + '\n'); buf = buf.slice(nl + 1); }
  };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  child.on('close', (code) => {
    if (buf) process.stdout.write(tag + buf + '\n');
    resolve({ i, code: code ?? 1, s: (Date.now() - started) / 1000 });
  });
});

const results = await Promise.all(shards.map(runShard));
const min = (x) => (x / 60).toFixed(1) + ' min';
console.log(`\nfidelity-parallel: done in ${min((Date.now() - t0) / 1000)}`);
for (const r of results) console.log(`  shard ${r.i + 1}: exit ${r.code} after ${min(r.s)} — ${shards[r.i].names.join(',')}`);
const bad = results.filter((r) => r.code !== 0);
console.log(bad.length ? `FAIL: shard(s) ${bad.map((r) => r.i + 1).join(', ')} failed — see their FAIL line above` : 'OK all shards');
process.exit(bad.length ? 1 : 0);
