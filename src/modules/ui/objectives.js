// Objectives panel (Wave P3, docs/specs/p3-biodiversity-missions.md): mission picker, active
// mission with progress bar / days left / stars, and the won/failed result. DOM only (0 draw
// calls); refreshes on open and on sim:day / mission:* events — never per frame. The panel never
// computes progress or holds mission state: everything comes from the simulation's mission API.
import { el, clear, setText, fmtMoney, fmtInt, clamp01, scoreColor, titleCase } from './dom.js';
import { icon, animalIconName } from './icons.js';

const BIG_FIVE = ['elephant', 'rhino', 'buffalo', 'lion'];

/** goal → { line, stars } summary for the picker cards (static, no live numbers). */
function goalText(m) {
  const g = m.goal;
  if (g.type === 'population') return { line: `${g.n} ${g.species}s in the park`, stars: `${m.stars[0]} / ${m.stars[1]} / ${m.stars[2]} at the win` };
  if (g.type === 'hold') return { line: `hold ${titleCase((g.metric || '').split('.').pop())} ≥ ${g.min} for ${g.days} days`, stars: `1★ / mean +${m.stars[1]} / +${m.stars[2]} over the floor` };
  if (g.type === 'cash') return { line: `${fmtMoney(g.amount)} net of loans`, stars: `by the deadline / with ${Math.round(m.stars[1] * 100)}% / ${Math.round(m.stars[2] * 100)}% of it left` };
  return { line: `survive ${g.fires} fires — lose ≤ ${g.maxBuildingsLost} building${g.maxBuildingsLost === 1 ? '' : 's'}, ≤ ${g.maxHa} ha`, stars: `≤ ${m.stars[1].buildings} b / ≤ ${m.stars[1].ha} ha → 2★ · ≤ ${m.stars[2].ha} ha → 3★` };
}

export function createObjectives(root, s) {
  let node = null;
  let confirmAbandon = 0;   // Date.now() of the first Abandon click; survives refresh() so a daily tick can't cancel it
  let startError = '';      // last refused startMission() reason, shown in the picker

  const sim = () => { try { return s.ctx.modules.get('simulation'); } catch { return null; } };

  function starsEl(n, size = 18) {
    const wrap = el('span.stars');
    for (let i = 0; i < 3; i++) {
      const st = icon('starFill');
      st.classList.toggle('on', i < n);
      if (i >= n) st.style.color = 'rgba(255,255,255,0.18)';
      st.style.width = st.style.height = size + 'px';
      wrap.appendChild(st);
    }
    return wrap;
  }

  /** Compact biodiversity strip (context for hold missions); null when no reading exists yet. */
  function bioStrip() {
    const simApi = sim();
    const b = simApi?.getBiodiversity?.();
    if (!b) return null;
    const row = el('div.big5');
    for (const sp of BIG_FIVE) {
      const n = b.bigFive?.[sp] ?? 0;
      // species name beside the count: the four glyphs are near-identical at this size (round-6 critic)
      row.appendChild(el('span.big5-item' + (n > 0 ? '' : '.off'), { 'data-tip': titleCase(sp) + (n > 0 ? ` — ${n} in the park` : ' — none'), 'data-tip-pos': 'below' },
        icon(animalIconName(sp)), el('span.nm', { text: titleCase(sp) }), el('b', { text: n > 0 ? String(n) : '—' })));
    }
    row.appendChild(el('span.big5-item.off.leopard', { 'data-tip': 'Leopard — not in this park', 'data-tip-pos': 'below' }, icon('paw'), el('span.nm', { text: 'Leopard' }), el('b', { text: '—' })));
    return el('div.tile.bio', null,
      el('h4', null, icon('species'), 'Biodiversity'),
      el('div.bio-h', null,
        el('span.bio-index', { style: `color:${scoreColor(clamp01(b.index / 100))}` }, String(Math.round(b.index))),
        // a div.rows (the CSS already sizes `.bio-h .rows`); a shrink-to-fit span glued "Species" to "12 / 12"
        el('div.rows', null,
          el('div.kv', null, el('span.muted', { text: 'Species' }), el('b', { text: `${b.richness} / 12` })),
          el('div.kv', null, el('span.muted', { text: 'Plants' }), el('b', { text: `${b.plantRichness} / 10` })),
          el('div.kv', null, el('span.muted', { text: 'Evenness' }), el('b', { text: b.evenness.toFixed(2) }))),
        // the Big Five beside the counts, not in a row below: the rows only need ~240 px and left the
        // tile's right half empty while the chips sat far from their label
        el('div.b5col', null, el('div.b5-label', { text: 'The Big Five' }), row)));
  }

  /** Live detail rows for the active/finished mission. */
  function detailRows(st, m) {
    const d = st.detail || {};
    const rows = el('div.rows');
    const add = (k, v,cls) => rows.appendChild(el('div.kv' + (cls ? '.' + cls : ''), null, el('span.muted', { text: k }), el('b', { text: v })));
    if (m.goal.type === 'population') {
      add(`${titleCase(m.goal.species)}s`, `${d.count ?? 0} / ${m.goal.n}`, (d.count ?? 0) >= m.goal.n ? 'good' : '');
    } else if (m.goal.type === 'hold') {
      add('Today', d.value != null ? d.value.toFixed(1) : '—');
      add('Streak', `${d.streak ?? 0} / ${m.goal.days} days`);
      add('Run mean', d.mean != null ? d.mean.toFixed(1) : '—', (d.mean ?? 0) >= m.goal.min ? 'good' : '');
    } else if (m.goal.type === 'cash') {
      add('Net of loans', fmtMoney(d.net ?? 0), (d.net ?? 0) >= m.goal.amount ? 'good' : '');
      add('Target', fmtMoney(m.goal.amount));
    } else if (m.goal.type === 'survive-fire') {
      add('Buildings lost', `${d.buildingsLost ?? 0} / ${m.goal.maxBuildingsLost}`, (d.buildingsLost ?? 0) > m.goal.maxBuildingsLost ? 'bad' : 'good');
      add('Range lost', `${(d.haLost ?? 0).toFixed(1)} / ${m.goal.maxHa} ha`, (d.haLost ?? 0) > m.goal.maxHa ? 'bad' : 'good');
      if (st.status === 'active' && d.nextFireDay != null) add('Rangers warn of fire weather', 'day ' + d.nextFireDay);
      if (d.reason) add('Outcome', d.reason, 'bad');
    }
    if (d.reason && m.goal.type !== 'survive-fire') add('Outcome', d.reason, 'bad');
    return rows;
  }

  function pickerBody(simApi) {
    const list = simApi?.listMissions?.() || [];
    const wrap = el('div.obj-cards');
    if (startError) wrap.appendChild(el('div.ev', null, icon('info'), el('span', { text: `Could not start the mission: ${startError}` })));
    if (!simApi || !list.length) {
      wrap.appendChild(el('div.ev', null, icon('info'), el('span', { text: 'No missions available — the simulation module is not running.' })));
      return wrap;
    }
    for (const m of list) {
      const gt = goalText(m);
      wrap.appendChild(el('div.obj-card', null,
        el('div.obj-h', null, el('span.t', null, el('b', { text: m.name }), el('span.chip.info', { text: m.deadlineDays + ' days' }))),
        el('p.brief', { text: m.brief }),
        el('div.kv', null, el('span.muted', { text: 'Goal' }), el('b', { text: gt.line })),
        el('div.kv', null, el('span.muted', { text: 'Stars' }), el('span.muted.small', { text: gt.stars })),
        el('div.actions', null, el('button.btn.primary', { onclick: () => {
          const r = simApi.startMission(m.id);
          startError = r && r.ok === false ? (r.error || 'the simulation refused it') : '';   // was ignored: a refused start looked like a dead button
          refresh();
        } }, icon('play'), 'Start'))));
    }
    return wrap;
  }

  function activeBody(simApi, st) {
    const m = simApi.listMissions().find((x) => x.id === st.id);
    if (!m) return pickerBody(simApi);
    const daysLeft = Math.max(0, (st.deadline ?? 0) - st.day);
    const pct = Math.round(clamp01(st.progress) * 100);
    const gt = goalText(m);
    const done = st.status !== 'active';
    const armed = () => confirmAbandon > 0 && Date.now() - confirmAbandon <= 2500;
    // built in the armed state when a daily refresh lands inside the window: the confirmation used to be
    // wiped by every mission:progress (refresh -> show -> hide zeroed it), so at speed it could not complete
    const abandon = el('button.btn.ghost', { onclick: () => {
      if (!armed()) { confirmAbandon = Date.now(); setText(abandon, 'Abandon — sure?'); return; }
      confirmAbandon = 0; simApi.abandonMission(); refresh();
    } }, armed() ? 'Abandon — sure?' : 'Abandon mission');
    return el('div.obj-active', null,
      el('div.obj-h', null,
        el('span.t', null, el('b', { text: m.name }), el('span.chip' + (st.status === 'won' ? '.good' : st.status === 'failed' ? '.bad' : '.info'),
          { text: st.status === 'won' ? 'Complete' : st.status === 'failed' ? 'Failed' : 'Active' })),
        starsEl(st.status === 'won' ? st.stars : 0, 20)),
      el('p.brief', { text: m.brief }),
      el('div.obj-progress' + (st.status === 'won' ? '.won' : st.status === 'failed' ? '.failed' : ''), null,
        el('div.bar', null, el('i', { style: `width:${pct}%;background:${st.status === 'failed' ? 'var(--bad)' : st.status === 'won' ? 'var(--good)' : 'var(--accent)'}` })),
        el('div.obj-progress-lab', null, el('b', { text: pct + '%' }), el('span.muted', { text: done ? `finished day ${st.day}` : `${fmtInt(daysLeft)} day${daysLeft === 1 ? '' : 's'} left (day ${st.day} of ${st.deadline})` }))),
      detailRows(st, m),
      el('div.kv', null, el('span.muted', { text: 'Goal' }), el('b', { text: gt.line })),
      el('div.actions', null,
        done ? el('button.btn.primary', { onclick: refresh }, icon('target'), 'Pick another mission') : null,
        st.status === 'active' ? abandon : null));
  }

  function build() {
    const simApi = sim();
    const st = simApi?.getMissionState?.() || { status: 'none' };
    const body = st.status === 'none' ? pickerBody(simApi) : activeBody(simApi, st);
    const bio = bioStrip();
    const modal = el('div.modal.panel.pe', { role: 'dialog' },
      el('div.modal-h', null, el('span.ico', null, icon('target')),
        el('span.t', null, el('b', { text: 'Objectives' }), el('i', { text: s.parkName + ' · free play unless a mission is started' })),
        st.status === 'active' ? el('span.chip.warn', { text: 'Mission in progress' }) : null,        el('button.btn.icon.ghost', { 'data-tip': 'Close', 'data-key': 'Esc', onclick: hide }, icon('close'))),
      el('div.modal-b', null, body, bio ? el('div', { style: 'margin-top:10px' }, bio) : null));
    const backdrop = el('div.backdrop.pe', { onclick: (e) => { if (e.target === backdrop) hide(); } }, modal);
    return backdrop;
  }

  // mount() rebuilds in place and keeps the Abandon confirmation; show() (a fresh open) and hide() reset it
  function mount() { if (node) node.remove(); node = build(); root.appendChild(node); }
  function show() { confirmAbandon = 0; startError = ''; mount(); }
  function hide() { if (node) { node.remove(); node = null; } confirmAbandon = 0; startError = ''; }
  function isOpen() { return !!node; }
  function refresh() { if (isOpen()) mount(); }

  return { show, hide, isOpen, refresh, dispose: hide };
}
