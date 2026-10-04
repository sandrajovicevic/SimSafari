#!/usr/bin/env node
// Field-guide ui tests (Wave P6, docs/specs/p6-field-guide.md §Tests): plant entries + quiz.
//   node tools/guide-ui.test.mjs
// The quiz checker re-derives every answer key from the same guide data the generator used — a
// hand-typed wrong key cannot pass. It imports ui and animals, so it lives in tools/ (tools/lint.mjs
// forbids cross-module imports inside src/modules/, tests included).
import { buildQuiz, DIET_LABEL, RAIN_LABEL, FORM_LABEL } from '../src/modules/ui/quiz.js';
import { PLANT_GUIDE, plantGuideEntry, PLANT_GUIDE_IDS } from '../src/modules/ui/guideData.js';
import { PLANTS, PLANT_INDEX } from '../src/core/Plants.js';
import { guideEntry, GUIDE_IDS } from '../src/modules/animals/guide.js';

const failures = [], passes = [];
const assert = (cond, msg) => { (cond ? passes : failures).push(msg); console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); };
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

console.log('\nField guide — plant entries (10)');
assert(PLANT_GUIDE_IDS.length === 10 && PLANTS.length === 10, '10 plants');
assert(JSON.stringify(PLANT_GUIDE_IDS) === JSON.stringify(PLANTS.map((p) => p.id)), 'plant ids follow core/Plants.js order');
for (const id of PLANT_GUIDE_IDS) {
  const g = PLANT_GUIDE[id];
  const e = plantGuideEntry(id);
  const wc = words(g.summary);
  assert(wc >= 60 && wc <= 120, `${id}: summary ${wc} words (60–120)`);
  assert(Array.isArray(g.facts) && g.facts.length >= 3 && g.facts.length <= 5 && g.facts.every((f) => words(f) > 0),
    `${id}: ${g.facts.length} facts, none empty`);
  const p = PLANTS[PLANT_INDEX[id]];
  assert(e.name === p.name && e.latin === p.latin && e.rainfall === p.rainfall && e.food === p.food,
    `${id}: entry mirrors core/Plants.js (name/latin/rainfall/food)`);
  assert(g.summary.length > 0 && !/wikipedia|https?:\/\//i.test(g.summary + g.facts.join(' ')), `${id}: text present, no lifted-source markers`);
}

console.log('\nField guide — quiz');
const species = GUIDE_IDS.map(guideEntry);
const plants = PLANT_GUIDE_IDS.map(plantGuideEntry);
const nameOf = (id) => species.find((x) => x.id === id)?.name || id;

/** Is option `a` a correct answer to q, derived from the data? Defaults to the keyed option. */
function checkKey(q, a = q.options[q.answer]) {
  const text = q.q;
  if (!a) return false;
  switch (q.kind) {
    case 'diet': case 'latin': case 'attracts': {
      const e = species.find((x) => text.includes(x.name));
      if (!e) return false;
      if (q.kind === 'diet') return a === DIET_LABEL[e.diet];
      if (q.kind === 'latin') return a === e.latin;
      return e.attracts.includes(a);
    }
    case 'prey': case 'predators': {
      if (q.kind === 'prey') { const e = species.find((x) => text.startsWith(`The ${x.name} hunts`)); return e ? e.prey.map(nameOf).includes(a) : false; }
      const e = species.find((x) => text.endsWith(`takes the ${x.name}?`)); return e ? e.predators.map(nameOf).includes(a) : false;
    }
    case 'lifespan': case 'herd': {
      const four = q.options.map((n) => species.find((x) => x.name === n)).filter(Boolean);
      if (four.length !== q.options.length) return false;
      const best = four.reduce((x, y) => (q.kind === 'lifespan' ? (y.lifespanYears > x.lifespanYears ? y : x) : (y.herd > x.herd ? y : x)));
      const val = (x) => (q.kind === 'lifespan' ? x.lifespanYears : x.herd);
      const ties = four.filter((x) => val(x) === val(best));
      return ties.length === 1 && a === best.name;
    }
    case 'feeds': {
      const p = plants.find((x) => text.startsWith(`The ${x.name} feeds`));
      return p ? p.attracts.map(nameOf).includes(a) : false;
    }
    case 'rainfall': case 'form': {
      const p = plants.find((x) => text.includes(x.name));
      if (!p) return false;
      return q.kind === 'rainfall' ? a === RAIN_LABEL[p.rainfall] : a === FORM_LABEL[p.form];
    }
    default: return false;
  }
}

for (const seed of [1, 7, 42, 99]) {
  const quiz = buildQuiz(species, plants, seed);
  assert(quiz.questions.length === 10, `seed ${seed}: 10 questions`);
  assert(quiz.questions.every((q) => q.options.length >= 3 && q.options.length <= 4 && new Set(q.options).size === q.options.length),
    `seed ${seed}: every question has 3–4 distinct options`);
  assert(quiz.questions.every((q) => checkKey(q)), `seed ${seed}: every answer key re-derives correctly from the data`);
  assert(JSON.stringify(buildQuiz(species, plants, seed)) === JSON.stringify(quiz), `seed ${seed}: same seed → identical quiz`);
}
// exactly ONE option is correct — a distractor that is also true makes the quiz mark a right answer
// wrong (verifier 2026-10-04: 'which plant feeds the Warthog?' offered Marula as a wrong option)
{
  const bad = [];
  for (let seed = 1; seed <= 500; seed++) {
    for (const q of buildQuiz(species, plants, seed).questions) {
      const nCorrect = q.options.filter((o) => checkKey(q, o)).length;
      if (nCorrect !== 1) bad.push(`seed ${seed} [${q.kind}] ${q.q} → ${nCorrect} correct`);
    }
  }
  assert(bad.length === 0, `seeds 1–500: every question has exactly one correct option${bad.length ? ` (${bad.length} bad, e.g. ${bad[0]})` : ''}`);
}
const a1 = JSON.stringify(buildQuiz(species, plants, 1)), a2 = JSON.stringify(buildQuiz(species, plants, 2));
assert(a1 !== a2, 'different seeds deal different quizzes');
const plantOnly = buildQuiz([], plants, 5);
assert(plantOnly.questions.length === 10 && plantOnly.questions.every((q) => ['feeds', 'rainfall', 'form'].includes(q.kind) === false || checkKey(q)),
  'plant-only mode (no animals module) still deals 10 valid questions');

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) { console.log('failures:\n  ' + failures.join('\n  ')); process.exit(1); }
