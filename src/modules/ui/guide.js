// Field-guide panel (Wave P6, docs/specs/p6-field-guide.md): species + plants tabs with a live
// park block, and a generated quiz. DOM only — 0 draw calls, no update() work, closed = gone.
// The panel holds no state of its own beyond the open tab/page and the quiz session: species text
// comes from the animals module's guideEntry (ui never imports across modules), plant text from
// ui/guideData.js over core/Plants.js, live numbers from the simulation's existing reads.
import { el, clear, setText, fmtInt, titleCase } from './dom.js';
import { icon, animalIconName } from './icons.js';
import { plantGuideEntry, PLANT_GUIDE_IDS } from './guideData.js';
import { buildQuiz } from './quiz.js';

const PLANT_ICON = { grass: 'grass', shrub: 'shrub', tree: 'tree' };

export function createGuide(root, s) {
  let node = null;
  let tab = 'species';        // 'species' | 'plants' | 'quiz'
  let page = null;            // { kind: 'species'|'plant', id }
  let quiz = null;            // { q: [...questions], i, picked: [] , done }

  const animalsApi = () => { try { return s.ctx.modules.get('animals'); } catch { return null; } };
  const simApi = () => { try { return s.ctx.modules.get('simulation'); } catch { return null; } };

  function speciesEntries() {
    const a = animalsApi();
    const ids = a?.guideIds?.() || [];
    return ids.map((id) => a.guideEntry(id)).filter(Boolean);
  }
  function plantEntries() { return PLANT_GUIDE_IDS.map(plantGuideEntry).filter(Boolean); }

  /** Live population/happiness: the day's report, or — before the first day has been reported (a
   * fresh game: getReport() is null) — the simulation's current state, which carries the same counts.
   * The guide showed "none" for every species on day 1 without this (verifier, 2026-10-04). */
  function livePop() {
    const api = simApi();
    const r = api?.getReport?.();
    if (r?.population) return { population: r.population, happiness: r.happiness || {}, report: r };
    const st = api?.getState?.();
    return st?.population ? { population: st.population, happiness: st.happiness || {}, report: null } : null;
  }
  /** The live block: count and mean happiness (report, else current state) and best habitat quality
   * (report only — it is computed at the end of each day, so day 1 shows "—"). */
  function liveStats(speciesId) {
    const L = livePop();
    if (!L) return null;
    let bestQ = null;
    for (const h of Object.values(L.report?.habitats || {})) {
      const q = h.species?.[speciesId]?.quality;
      if (typeof q === 'number' && (bestQ === null || q > bestQ)) bestQ = q;
    }
    return { count: L.population[speciesId] ?? 0, happy: L.happiness[speciesId] ?? null, bestQ };
  }

  const kv = (k, v, cls) => el('div.kv' + (cls ? '.' + cls : ''), null, el('span.muted', { text: k }), el('b', { text: v }));
  const chipRow = (label, names) => !names?.length ? null
    : el('div.g-chips', null, el('span.muted.small', { text: label }), names.map((n) => el('span.chip.info', { text: n })));

  // ---------- pages ----------
  function speciesListBody() {
    const entries = speciesEntries();
    const live = livePop();
    const wrap = el('div.g-list');
    if (!entries.length) wrap.appendChild(el('div.ev', null, icon('info'), el('span', { text: 'The animals module is not running — species pages live there. Plant pages and the quiz still work.' })));
    for (const e of entries) {
      const n = live?.population?.[e.id] ?? 0;
      wrap.appendChild(el('button.g-item', { onclick: () => { page = { kind: 'species', id: e.id }; mount(); } },
        icon(animalIconName(e.id)),
        el('span.g-item-t', null, el('b', { text: e.name }), el('i', { text: e.latin })),
        el('span.chip' + (n > 0 ? '.good' : ''), { text: n > 0 ? n + ' in park' : 'none' })));
    }
    return wrap;
  }

  function plantListBody() {
    const wrap = el('div.g-list');
    for (const p of plantEntries()) {
      wrap.appendChild(el('button.g-item', { onclick: () => { page = { kind: 'plant', id: p.id }; mount(); } },
        icon(PLANT_ICON[p.form] || 'grass'),
        el('span.g-item-t', null, el('b', { text: p.name }), el('i', { text: p.latin })),
        el('span.chip', { text: titleCase(p.rainfall) + ' rain' })));
    }
    return wrap;
  }

  function speciesPage(id) {
    const a = animalsApi();
    const e = a?.guideEntry?.(id);
    if (!e) return el('div.ev', null, icon('info'), el('span', { text: 'No guide entry for this species.' }));
    const live = liveStats(id);
    const names = (ids) => ids.map((x) => a.guideEntry(x)?.name || titleCase(x));
    return el('div.g-page', null,
      el('button.btn.ghost.back', { onclick: () => { page = null; mount(); } }, '‹ All species'),
      el('div.g-head', null, icon(animalIconName(id)), el('div', null,
        el('h3', null, e.name, ' ', el('i.latin', { text: e.latin })),
        el('div.g-chips', null,
          el('span.chip.info', { text: titleCase(e.diet) }),
          el('span.chip', { text: 'Herds of ~' + e.herd }),
          el('span.chip', { text: '~' + e.lifespanYears + ' yr lifespan' })))),
      el('p.g-summary', { text: e.summary }),
      el('ul.g-facts', null, e.facts.map((f) => el('li', null, icon('check'), el('span', { text: f })))),
      el('h4', null, icon('chart'), 'In your park'),
      el('div.rows', null,
        kv('Count', live ? fmtInt(live.count) : '—', live && live.count > 0 ? 'good' : ''),
        kv('Mean happiness', live?.happy != null ? `${Math.round(live.happy * 100)} % (${live.happy >= 0.7 ? 'thriving' : live.happy >= 0.5 ? 'content' : live.happy >= 0.3 ? 'stressed' : 'miserable'})` : '—',
          live?.happy != null && live.happy >= 0.5 ? 'good' : live?.happy != null && live.happy < 0.3 ? 'bad' : ''),
        kv('Best habitat quality', live?.bestQ != null ? `${Math.round(live.bestQ * 100)} % (${live.bestQ >= 0.7 ? 'a strong fit' : live.bestQ >= 0.45 ? 'adequate' : 'poor'})` : '—')),
      chipRow('Attracted by', e.attracts),
      chipRow('Prey to', names(e.predators)),
      chipRow('Hunts', names(e.prey)));
  }

  function plantPage(id) {
    const p = plantGuideEntry(id);
    if (!p) return el('div.ev', null, icon('info'), el('span', { text: 'No guide entry for this plant.' }));
    const a = animalsApi();
    const names = (ids) => ids.map((x) => a?.guideEntry?.(x)?.name || titleCase(x));
    return el('div.g-page', null,
      el('button.btn.ghost.back', { onclick: () => { page = null; mount(); } }, '‹ All plants'),
      el('div.g-head', null, icon(PLANT_ICON[p.form] || 'grass'), el('div', null,
        el('h3', null, p.name, ' ', el('i.latin', { text: p.latin })),
        el('div.g-chips', null,
          el('span.chip.info', { text: titleCase(p.form) }),
          el('span.chip', { text: titleCase(p.rainfall) + ' rainfall' }),
          el('span.chip', { text: p.food + ' food/ha·day' })))),
      el('p.g-summary', { text: p.summary }),
      el('ul.g-facts', null, p.facts.map((f) => el('li', null, icon('check'), el('span', { text: f })))),
      chipRow('Feeds', names(p.attracts)));
  }

  // ---------- quiz ----------
  function quizStart() {
    // plant-only mode when the animals module is absent (ui's own showcase) — documented degradation
    quiz = { q: buildQuiz(speciesEntries(), plantEntries(), s.world.seed ?? 1).questions, i: 0, picked: [], done: false };
    mount();
  }
  function quizBody() {
    if (!quiz) return el('div.g-quiz-intro', null,
      el('h4', null, icon('star'), 'Guide quiz'),
      el('p', { text: 'Ten questions drawn from the guide — the same park seed always deals the same hand. No stakes: nothing about the park changes.' }),
      el('div.actions', null, el('button.btn.primary', { onclick: quizStart }, icon('play'), 'Start quiz')));
    const { q, i, picked, done } = quiz;
    if (done) {
      const right = q.reduce((a, qq, k) => a + (picked[k] === qq.answer ? 1 : 0), 0);
      return el('div.g-quiz-done', null,
        el('h3', null, icon('starFill'), ` ${right} / ${q.length}`),
        el('p', { text: right >= 8 ? 'Ranger material.' : right >= 5 ? 'Solid guiding — a few pages to review.' : 'The guide is free to re-read, you know.' }),
        el('div.actions', null, el('button.btn.primary', { onclick: quizStart }, 'Deal again'), el('button.btn', { onclick: () => { quiz = null; mount(); } }, 'Close')));
    }
    const qq = q[i];
    return el('div.g-quiz', null,
      el('div.g-quiz-lab', null, el('b', { text: `Question ${i + 1} of ${q.length}` }), el('span.muted', { text: titleCase(qq.kind) })),
      el('h3.g-quiz-q', { text: qq.q }),
      el('div.g-opts', null, qq.options.map((o, k) => el('button.g-opt', {
        class: picked[i] === k ? 'picked' : '',
        onclick: () => { if (picked[i] === undefined) { picked[i] = k; if (i + 1 < q.length) quiz.i = i + 1; mount(); } },
      }, el('span.g-opt-k', { text: 'ABCD'[k] }), o))),
      el('div.g-quiz-nav', null,
        i > 0 ? el('button.btn.ghost', { onclick: () => { quiz.i = i - 1; mount(); } }, '‹ Previous') : null,
        el('span.muted.small', { text: picked.filter((p) => p !== undefined).length + ' answered' }),
        i + 1 < q.length ? el('button.btn', { onclick: () => { quiz.i = i + 1; mount(); } }, 'Next ›')
          : el('button.btn.primary', { onclick: () => { quiz.done = true; mount(); } }, 'Finish')));
  }

  // ---------- shell ----------
  function body() {
    if (tab === 'quiz') return quizBody();
    const listBody = tab === 'plants' ? plantListBody() : speciesListBody();
    if (!page || (page.kind === 'species' && tab !== 'species') || (page.kind === 'plant' && tab !== 'plants')) page = null;
    const detail = page ? (page.kind === 'species' ? speciesPage(page.id) : plantPage(page.id)) : null;
    return el('div.g-two', null, el('div.g-left', null, listBody), detail ? el('div.g-right', null, detail) : null);
  }

  function build() {
    const tabs = el('div.g-tabs', null,
      ['species', 'plants', 'quiz'].map((t) => el('button.g-tab' + (tab === t ? '.on' : ''), {
        onclick: () => { tab = t; page = null; if (t !== 'quiz') quiz = null; mount(); },
      }, t === 'species' ? 'Species' : t === 'plants' ? 'Plants' : 'Quiz')));
    const modal = el('div.modal.panel.guide', { role: 'dialog' },
      el('div.modal-h', null, el('span.ico', null, icon('book')),
        el('span.t', null, el('b', { text: 'Field guide' }), el('i', { text: s.parkName + ' · the park\'s species, plants and a quiz' })),
        el('button.btn.icon.ghost', { 'data-tip': 'Close', 'data-key': 'Esc', onclick: hide }, icon('close'))),
      tabs,
      el('div.modal-b.g-body', null, body()));
    return el('div.backdrop.pe', { onclick: (e) => { if (e.target === e.currentTarget) hide(); } }, modal);
  }

  function mount() { if (node) node.remove(); node = build(); root.appendChild(node); }
  function show(opts = {}) {
    if (typeof opts === 'string') opts = { species: opts };
    if (opts.species) { tab = 'species'; page = { kind: 'species', id: opts.species }; }
    else if (opts.plant) { tab = 'plants'; page = { kind: 'plant', id: opts.plant }; }
    else if (opts.tab) { tab = opts.tab; page = null; }
    quiz = null;
    mount();
  }
  function hide() { if (node) { node.remove(); node = null; } page = null; quiz = null; }
  function isOpen() { return !!node; }
  function refresh() { if (isOpen()) mount(); }

  return { show, hide, isOpen, refresh, dispose: hide };
}
