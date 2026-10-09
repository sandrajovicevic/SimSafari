# Wave P6 — Field guide + trivia (contract)

Shipped 2026-10-03 on `claude/p6-guide`. Below the fold is the original contract; measured results
here. Pure presentation, exactly as scoped — **no simulation change**: the full harness on this
branch is byte-identical to main (`baseline` −$2,883/day @ $25, `determinism.identical` true; the
224 sim tests unchanged), and the guide's draw-call cost is **zero, measured in-page**: 378 draws
before opening the panel, 378 open, 378 closed.

* **animals** — `guide.js` + `guideEntry(species)` on the api: 12 entries (leopard none), each an
  original 60–120-word summary (all landed in-band first pass), 3–5 facts, latin binomial, social
  note, and prey/predator lists that mirror `DIET` in `simulation/tables.js` **both directions**
  (a test cross-checks lion/cheetah prey lists and every prey species' hunters). Attractors come
  live from `core/Plants.js`. 124 node checks green (`tools/guide-animals.test.mjs`).
* **ui** — `guide.js` panel (top-bar button, **B** key, and a Guide action on any animal's side
  panel): Species | Plants | Quiz tabs, two-pane layout. The live block reads only existing sim
  APIs (count, mean happiness, best habitat quality from the day's report). Plant text lives in
  ui (`guideData.js`) over core/Plants.js data — 10 entries, same length rules. Quiz: 10 questions
  from a forked `Rng('quiz:<seed>')`, **answer keys derived from the data at build time** (a test
  re-derives every key across 4 seeds); same seed → identical quiz; no park effect. Degradation:
  without the animals module (ui's own showcase) the quiz deals plant-only questions — documented,
  tested. 61 node checks green (`tools/guide-ui.test.mjs`, incl. exactly-one-correct-option over 500 seeds — added after the verifier found a quiz grading bug).
* **Portraits**: not shipped (optional per the contract — text + icons carry the pages).
* Screenshots, all verified: `p6-guide-animal-dom.png` (lion page, live block populated, Hunts
  chips), `p6-guide-plant-dom.png` (marula/*Sclerocarya birrea*), `p6-guide-quiz-dom.png`
  (Question 1 of 10, 4 options, one picked), `p6-game-closed.png` (panel closed — the draw-call
  proof above). Verification note: the panel's first "visual check" was a hallucinated confirmation
  from a leading prompt while the eval had actually thrown — the re-verification uses neutral
  describe-first prompts plus DOM-side assertions (`.guide` present, latin text read back), and the
  quiz/animal pages were re-shot that way.

Agenda: `docs/ideas-roadmap.md` Wave P6. Pure presentation: **no simulation behaviour changes**.
Read `ideas-wave-rules.md` first. Branch: `claude/p6-guide`.

## Content rule (the main risk of this wave)

Every word is ours. Do not copy, paraphrase closely, or translate text from the original game's
field guide, from Wikipedia, or from any published guide. Facts are general natural-history
knowledge written in our own sentences. Numbers that also exist in `simulation/tables.js`
(herd size, lifespan, diet) must match the table, or the text says why the game differs.
No external images, fonts or remote fetches; portraits, if any, are rendered in-engine.

## Ownership

| owner | does | never |
|---|---|---|
| **animals** | species guide text: `guideEntry(species)` → `{ name, latin, summary, facts[], diet, social }` from a data file in its folder (12 species) | touch the DOM |
| **ui** | guide panel (species + plants tabs), plant guide text (10 plants; `core/Plants.js` stays data-only), quiz mode | change sim state |
| **simulation** | nothing new; existing `species()`, `getFoodReport()`, `getPopulation`-style reads | — |

## Required behaviour

1. **Guide panel** (from the top bar and from a species' side panel): per entry — name, latin name,
   a 60–120-word summary, 3–5 facts, and a **live** block: count in the park, mean happiness, best
   habitat quality, and for animals the plants that attract it (`Plants.js attracts`) and its prey
   or predators (sim `DIET`); for plants, which species it feeds and its rainfall tier.
2. Portraits are optional. If shipped: one shared offscreen render per entry on first open, cached
   as an image; never rendered per frame; leopard is not in the game and gets no page.
3. **Quiz**: 10 multiple-choice questions generated from the guide data with a forked
   `Rng('quiz:<seed>')` (same seed → same quiz), answer key derived from data, not hand-typed;
   score at the end. No effect on the park (no cash, no reputation).
4. Closed panel costs nothing: 0 draw calls, no `update()` work, DOM only.

## Tests (node)

Every one of the 12 species and 10 plants has an entry; summary length within 60–120 words; no
empty facts; quiz determinism (same seed → same questions); every generated answer key is correct
against the data it came from; numbers cross-checked against `tables.js`.

## Harness

No new fidelity scenario (no sim change). The full existing harness still runs once and must show
`baseline`/`determinism` byte-identical to `main` — the proof that P6 changed no behaviour.

## Screenshots

Guide open on an animal page, on a plant page, and the quiz mid-way; one full-game view with the
panel closed (draw calls identical to `main`).

## Wave exit

Per `ideas-wave-rules.md`, plus: the orchestrator reads a sample of five entries for tone and
accuracy, and confirms none is lifted from a source.
