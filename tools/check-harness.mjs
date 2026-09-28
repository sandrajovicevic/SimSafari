#!/usr/bin/env node
// Structural self-check of tools/fidelity.mjs, run in CI without a browser.
// Importing fidelity.mjs would launch the whole harness, so it is parsed, never executed.
//
// Asserts:
//   1. every scenarioX(...) call resolves to a TOP-LEVEL function declaration
//      (P2 lesson: a misplaced closing brace nested scenarioSpread inside scenarioFireResponse,
//      and the harness only crashed at run time, after ~20 minutes of browser work);
//   2. every name in the default SCENARIOS list has a `SCENARIOS.includes('<name>')` dispatcher
//      branch, and every dispatcher branch is in the default list (nothing silently skipped).
//
//   node tools/check-harness.mjs [path/to/fidelity.mjs]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(__dirname, 'fidelity.mjs');
const src = fs.readFileSync(file, 'utf8');

let parseAst;
try { ({ parseAst } = await import('rolldown/parseAst')); } catch (e) {
  console.error(`check-harness: cannot load a JS parser (rolldown/parseAst, shipped with vite): ${e.message}`);
  process.exit(2);
}

let ast;
try { ast = parseAst(src, { sourceType: 'module' }, file); } catch (e) {
  console.error(`check-harness: ${path.relative(process.cwd(), file)} does not parse: ${e.message}`);
  process.exit(1);
}

const problems = [];
const topLevel = new Set();
for (const n of ast.body) if (n.type === 'FunctionDeclaration' && n.id) topLevel.add(n.id.name);

// Walk every node; collect calls to scenario* and function declarations that are NOT top level.
const calls = new Map(); // name -> first offset
const nested = new Map();
const includes = new Set();
let defaultList = null;
function walk(node, depth) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'FunctionDeclaration' && node.id && depth > 0 && /^scenario/.test(node.id.name)) nested.set(node.id.name, node.start);
  if (node.type === 'CallExpression') {
    const c = node.callee;
    if (c.type === 'Identifier' && /^scenario[A-Z]/.test(c.name) && !calls.has(c.name)) calls.set(c.name, node.start);
    if (c.type === 'MemberExpression' && c.object?.type === 'Identifier' && c.object.name === 'SCENARIOS'
        && c.property?.name === 'includes' && node.arguments[0]?.type === 'Literal') includes.add(node.arguments[0].value);
  }
  if (node.type === 'VariableDeclarator' && node.id?.name === 'SCENARIOS') {
    // const SCENARIOS = (args.scenarios ? ... : [ 'a', 'b', ... ]);
    const find = (n) => { if (!n) return null; if (n.type === 'ArrayExpression') return n;
      if (n.type === 'ConditionalExpression') return find(n.alternate) || find(n.consequent);
      if (n.type === 'ParenthesizedExpression') return find(n.expression); return null; };
    const arr = find(node.init);
    if (arr) defaultList = arr.elements.filter((e) => e?.type === 'Literal').map((e) => e.value);
  }
  const fnDepth = depth + (/Function/.test(node.type) ? 1 : 0);
  for (const k in node) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) for (const x of v) walk(x, fnDepth); else if (v && typeof v === 'object') walk(v, fnDepth);
  }
}
for (const n of ast.body) walk(n, 0);

const lineOf = (off) => src.slice(0, off).split('\n').length;
for (const [name, off] of nested) problems.push(`${name} is declared inside another function (line ${lineOf(off)}) — a brace is misplaced`);
for (const [name, off] of calls) if (!topLevel.has(name) && !nested.has(name)) problems.push(`${name} is called (line ${lineOf(off)}) but never declared`);
if (!defaultList) problems.push('could not find the default SCENARIOS array literal');
else {
  for (const s of defaultList) if (!includes.has(s)) problems.push(`default scenario '${s}' has no SCENARIOS.includes('${s}') branch`);
  for (const s of includes) if (!defaultList.includes(s)) problems.push(`dispatcher branch '${s}' is missing from the default SCENARIOS list`);
}

if (problems.length) {
  console.error(`check-harness: ${problems.length} problem(s) in ${path.relative(process.cwd(), file)}`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`check-harness: OK — ${topLevel.size} top-level functions, ${calls.size} scenario functions called, ${defaultList.length} default scenarios all dispatched`);
