// Quiz generator (Wave P6 field guide) — pure data in, quiz out. Same seed → byte-identical quiz
// (forked Rng('quiz:<seed>'), no Math.random — the lint enforces that everywhere). Questions and
// answer keys are DERIVED from the guide entries passed in; nothing is hand-typed, so a wrong
// entry can only make a hard quiz, never a wrong one. quiz.test.mjs re-derives every key.
import { Rng } from '../../core/Rng.js';

export const DIET_LABEL = { grazer: 'grass, grazed', browser: 'bush and browse, picked', mixed: 'a mixed diet of grass and browse', predator: 'live prey, hunted' };
export const RAIN_LABEL = { drought: 'little — it rides out drought', low: 'not much (low tier)', medium: 'a fair amount (medium tier)', high: 'plenty — wet ground (high tier)' };
export const FORM_LABEL = { grass: 'a grass — leafy tussocks, no wood', shrub: 'a shrub — low woody growth', tree: 'a tree — a proper trunk and crown' };

function shuffled(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.float() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function distinctOthers(pool, exclude, n, rng) {
  const cand = shuffled(pool.filter((x) => x !== exclude && !exclude?.includes?.(x)), rng);
  return cand.slice(0, n);
}
/** One MCQ: correct text at a rng-chosen position among 2–3 distractors (3-option questions are
 * fine where the pool only has 3 distinct values, e.g. growth forms). */
function mcq(rng, q, correct, distractors, kind) {
  const opts = distractors.slice(0, 3);
  if (opts.length < 2) return null;
  const at = rng.int(0, opts.length);
  opts.splice(at, 0, correct);
  return { q, options: opts, answer: at, kind };
}

/**
 * Build a 10-question quiz. `species` = guideEntry() rows (may be empty — plant-only mode, e.g. the
 * ui showcase without the animals module), `plants` = plantGuideEntry() rows, `seed` = park seed.
 */
export function buildQuiz(species, plants, seed) {
  const rng = new Rng('quiz:' + seed);
  const qs = [];
  const sp = species.slice();
  const pl = plants.slice();
  const spNames = sp.map((e) => e.name);
  const plNames = pl.map((e) => e.name);

  // ---- question builders (each returns one MCQ or null when the subject lacks the data)
  const kinds = [
    () => { // diet class of a species
      const e = rng.pick(sp); if (!e) return null;
      const others = distinctOthers(Object.values(DIET_LABEL), DIET_LABEL[e.diet], 3, rng);
      return mcq(rng, `In the park's books, what does the ${e.name} eat?`, DIET_LABEL[e.diet], others, 'diet');
    },
    () => { // a predator's prey
      const e = rng.pick(sp.filter((x) => x.prey.length)); if (!e) return null;
      const correct = rng.pick(e.prey);
      const label = (id) => sp.find((x) => x.id === id)?.name || id;
      const others = distinctOthers(spNames.filter((n) => n !== e.name && !e.prey.map(label).includes(n)), null, 3, rng);
      return mcq(rng, `The ${e.name} hunts here — which of these is on its menu?`, label(correct), others, 'prey');
    },
    () => { // who hunts a prey species
      const e = rng.pick(sp.filter((x) => x.predators.length)); if (!e) return null;
      const label = (id) => sp.find((x) => x.id === id)?.name || id;
      const correct = rng.pick(e.predators);
      const others = distinctOthers(spNames.filter((n) => !e.predators.map(label).includes(n) && n !== e.name), null, 3, rng);
      return mcq(rng, `Which hunter takes the ${e.name}?`, label(correct), others, 'predators');
    },
    () => { // latin binomial
      const e = rng.pick(sp); if (!e) return null;
      const others = distinctOthers(sp.map((x) => x.latin), e.latin, 3, rng);
      return mcq(rng, `Which scientific name belongs to the ${e.name}?`, e.latin, others, 'latin');
    },
    () => { // longest-lived of four (ties excluded so the key is unique)
      const four = shuffled(sp, rng).slice(0, 4); if (four.length < 4) return null;
      const best = four.reduce((a, b) => (b.lifespanYears > a.lifespanYears ? b : a));
      const others = four.filter((x) => x !== best && x.lifespanYears !== best.lifespanYears).map((x) => x.name);
      return mcq(rng, 'Which of these animals lives longest?', best.name, others, 'lifespan');
    },
    () => { // biggest herds of four (ties excluded)
      const four = shuffled(sp, rng).slice(0, 4); if (four.length < 4) return null;
      const best = four.reduce((a, b) => (b.herd > a.herd ? b : a));
      const others = four.filter((x) => x !== best && x.herd !== best.herd).map((x) => x.name);
      return mcq(rng, 'Which of these forms the biggest herds?', best.name, others, 'herd');
    },
    () => { // a plant that attracts a species
      const e = rng.pick(sp.filter((x) => x.attracts.length)); if (!e) return null;
      const correct = rng.pick(e.attracts);
      const others = distinctOthers(plNames, correct, 3, rng);
      return mcq(rng, `Which plant is listed as food for the ${e.name}?`, correct, others, 'attracts');
    },
    () => { // which animal a plant feeds
      const p = rng.pick(pl.filter((x) => x.attracts.length)); if (!p) return null;
      const label = (id) => sp.find((x) => x.id === id)?.name || id;
      const correct = label(rng.pick(p.attracts));
      const others = distinctOthers(spNames.filter((n) => !p.attracts.map(label).includes(n)), null, 3, rng);
      return mcq(rng, `The ${p.name} feeds which animal?`, correct, others, 'feeds');
    },
    () => { // a plant's rainfall tier
      const p = rng.pick(pl); if (!p) return null;
      const others = distinctOthers(Object.values(RAIN_LABEL), RAIN_LABEL[p.rainfall], 3, rng);
      return mcq(rng, `How much rain does the ${p.name} want?`, RAIN_LABEL[p.rainfall], others, 'rainfall');
    },
    () => { // a plant's growth form
      const p = rng.pick(pl); if (!p) return null;
      const others = distinctOthers(Object.values(FORM_LABEL), FORM_LABEL[p.form], 3, rng);
      return mcq(rng, `The ${p.name} grows as…`, FORM_LABEL[p.form], others, 'form');
    },
  ];

  // draw 10: shuffle the kind pool and cycle it so the mix varies but every kind can appear;
  // failed builders (missing data) are retried on the next kind
  let order = shuffled(kinds.map((_, i) => i), rng);
  let guard = 0;
  while (qs.length < 10 && guard++ < 60) {
    if (!order.length) order = shuffled(kinds.map((_, i) => i), rng);
    const q = kinds[order.shift()]();
    if (q) qs.push(q);
  }
  return { seed, questions: qs };
}
