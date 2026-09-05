#!/usr/bin/env node
// Project rules lint (ARCHITECTURE.md §2): no Math.random, no cross-module imports, no fetch, no core edits by modules.
// Usage: node tools/lint.mjs [src/modules/terrain]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'src', 'modules');
const problems = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

for (const file of walk(target)) {
  const rel = path.relative(root, file);
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const modMatch = rel.match(/^src\/modules\/([^/]+)\//);
  const modId = modMatch ? modMatch[1] : null;
  lines.forEach((line, i) => {
    const n = i + 1;
    if (/\bMath\.random\s*\(/.test(line)) problems.push(`${rel}:${n} Math.random() — use ctx.rng`);
    if (/\bfetch\s*\(/.test(line) && !/\/\/\s*lint-allow/.test(line)) problems.push(`${rel}:${n} fetch() — assets must be procedural`);
    if (/\bnew\s+XMLHttpRequest\b/.test(line)) problems.push(`${rel}:${n} XMLHttpRequest — no network`);
    const imp = line.match(/from\s+['"]([^'"]+)['"]/) || line.match(/import\s*\(\s*['"]([^'"]+)['"]/);
    if (imp && modId) {
      const spec = imp[1];
      if (spec.startsWith('.')) {
        const abs = path.resolve(path.dirname(file), spec);
        const relAbs = path.relative(root, abs);
        const m2 = relAbs.match(/^src\/modules\/([^/]+)/);
        if (m2 && m2[1] !== modId) problems.push(`${rel}:${n} imports another module's folder (${m2[1]}) — use ctx.modules.get('${m2[1]}')`);
        if (/^src\/core\/App\.js$/.test(relAbs)) problems.push(`${rel}:${n} imports core/App.js — use ctx.app`);
      } else if (/^https?:/.test(spec)) problems.push(`${rel}:${n} remote import — forbidden`);
    }
    if (modId && modId !== 'ui' && modId !== 'tools' && /document\.(getElementById|querySelector|body)/.test(line) && !/\/\/\s*lint-allow/.test(line)) {
      problems.push(`${rel}:${n} DOM access outside ui/tools — mark with // lint-allow if intentional (e.g. canvas texture)`);
    }
  });
}

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
} else {
  console.log('lint ok');
}
