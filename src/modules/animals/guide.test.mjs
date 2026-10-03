#!/usr/bin/env node
// Field-guide data tests (Wave P6, docs/specs/p6-field-guide.md §Tests). Plain node, no deps.
//   node src/modules/animals/guide.test.mjs
// Cross-checks guide.js against simulation/tables.js and core/Plants.js. A test importing another
// module's file is fine — tests are not runtime module code (the runtime path is ui → animals api).
import { GUIDE, GUIDE_IDS, guideEntry } from './guide.js';
import { SPECIES, SPECIES_ORDER, DIET } from '../simulation/tables.js';
import { PLANTS } from '../../core/Plants.js';

const failures = [], passes = [];
const assert = (cond, msg) => { (cond ? passes : failures).push(msg); console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); };
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

console.log('\nField guide — species entries (12, leopard absent)');
assert(GUIDE_IDS.length === 12 && SPECIES_ORDER.length === 12, `12 species entries (${GUIDE_IDS.length})`);
assert(!GUIDE_IDS.includes('leopard'), 'leopard has no page (not in the park)');
assert(JSON.stringify(GUIDE_IDS) === JSON.stringify(SPECIES_ORDER), 'entry ids match SPECIES_ORDER exactly');

for (const id of GUIDE_IDS) {
  const g = GUIDE[id];
  const t = SPECIES[id];
  const wc = words(g.summary);
  assert(wc >= 60 && wc <= 120, `${id}: summary ${wc} words (60–120)`);
  assert(Array.isArray(g.facts) && g.facts.length >= 3 && g.facts.length <= 5 && g.facts.every((f) => words(f) > 0),
    `${id}: ${g.facts.length} facts, none empty`);
  assert(/^[A-Z][a-zA-Z-]+ [a-z-]+$/.test(g.latin || ''), `${id}: latin binomial "${g.latin}"`);
  assert(g.diet === t.diet, `${id}: diet "${g.diet}" matches tables.js`);
  assert(g.herd === t.herd, `${id}: herd ${g.herd} matches tables.js`);
  assert(g.lifespanYears === t.lifespan / 365, `${id}: lifespan ${g.lifespanYears} yr matches tables.js`);
}

console.log('\nField guide — food-web cross-check against DIET');
for (const [pred, d] of Object.entries(DIET)) {
  assert(JSON.stringify(GUIDE[pred].prey) === JSON.stringify(d.prey), `${pred}: prey list matches DIET (${d.prey.join(', ')})`);
}
for (const id of GUIDE_IDS) {
  const hunters = GUIDE_IDS.filter((x) => DIET[x]?.prey.includes(id));
  assert(JSON.stringify(GUIDE[id].predators) === JSON.stringify(hunters),
    `${id}: predators (${hunters.join(', ') || 'none'}) match DIET in reverse`);
}

console.log('\nField guide — attractors + api shape');
for (const id of GUIDE_IDS) {
  const e = guideEntry(id);
  assert(e && e.id === id && e.name === GUIDE[id].name, `${id}: guideEntry round-trips`);
  const want = PLANTS.filter((p) => p.attracts.includes(id)).map((p) => p.name);
  assert(JSON.stringify(e.attracts) === JSON.stringify(want), `${id}: attracted-by list matches Plants.js (${want.length})`);
  if (SPECIES[id].diet !== 'predator') assert(e.attracts.length > 0, `${id}: a non-predator is attracted by at least one plant`);
}
assert(guideEntry('leopard') === null && guideEntry('nope') === null, 'unknown ids return null');

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) { console.log('failures:\n  ' + failures.join('\n  ')); process.exit(1); }
