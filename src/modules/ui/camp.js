// Camp & advisors panel (Wave P4, docs/specs/p4-camp-advisors.md): per-tier room-rate sliders +
// occupancy readout, and the three advisor personas with their current highest-level message
// (click a persona for their full list). DOM only (0 draw calls); rebuilt on open and refreshed on
// sim:day while open — never per frame. All numbers come from simulation's getLodging()/getAdvice();
// the panel computes nothing but the slider position it was handed.
import { el, setText, fmtMoney, clamp01, scoreColor } from './dom.js';
import { icon } from './icons.js';

const TIER_LABEL = { tent: 'Tented camp', cottage: 'Cottages', lodge: 'Lodge' };
const PERSONAS = [
  { id: 'ecologist', name: 'Ecologist', icon: 'species', tip: 'Animals, vegetation and fire' },
  { id: 'treasurer', name: 'Treasurer', icon: 'coin', tip: 'Cash, rates and occupancy' },
  { id: 'liaison', name: 'Community liaison', icon: 'social', tip: 'Staff balance, trust and poaching' },
];
const LEVEL_CLS = { info: 'chip.info', warn: 'chip.warn', critical: 'chip.bad' };
const RANK = { info: 0, warn: 1, critical: 2 };

export function createCamp(root, s) {
  let node = null;
  const expanded = new Set(); // advisor ids whose full list is open

  const sim = () => { try { return s.ctx.modules.get('simulation'); } catch { return null; } };

  function tierRow(t, L) {
    const rate = el('input', { type: 'range', min: 10, max: 400, value: L.rate, step: 5 });
    const rateV = el('span.v', { text: '$' + L.rate });
    rate.addEventListener('input', () => {
      const r = sim()?.setRoomRate?.(t, +rate.value);
      if (r != null) setText(rateV, '$' + r);
    });
    const pct = Math.round(clamp01(L.occupancy) * 100);
    return el('div.obj-card', null,
      el('div.obj-h', null, el('span.t', null, el('b', { text: TIER_LABEL[t] ?? t }),
        el('span.chip' + (pct >= 80 ? '.good' : pct >= 45 ? '.warn' : '.bad'), { text: pct + '% full' }))),
      el('div.kv', null, el('span.muted', { text: 'Guests' }), el('b', { text: `${L.occupied} / ${L.beds} beds (demand ${Math.round(L.want)})` })),
      el('div.kv', null, el('span.muted', { text: 'Revenue' }), el('b', { text: fmtMoney(L.revenue) + '/day' })),
      el('div.obj-progress', null,
        el('div.bar', null, el('i', { style: `width:${pct}%;background:${scoreColor(clamp01(L.occupancy))}` }))),
      el('div', null, el('span.muted', { text: 'Room rate', style: 'font-size:11px' }), el('span.slider', null, rate, rateV)));
  }

  function advisorRow(p, messages) {
    const top = messages.length ? messages.reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a)) : null;
    const isOpen = expanded.has(p.id);
    const head = el('button.adv-person', { onclick: () => { expanded.has(p.id) ? expanded.delete(p.id) : expanded.add(p.id); refresh(); } },
      el('span.adv-ic', null, icon(p.icon)),
      el('span.adv-t', null, el('b', { text: p.name }),
        top ? el('span', { class: LEVEL_CLS[top.level] || 'chip', text: top.text }) : el('span.muted', { text: 'Nothing to report — good.' })),
      el('span.ic.muted', null, icon(isOpen ? 'up' : 'down')));
    if (!isOpen || !messages.length) return el('div.adv', null, head);
    return el('div.adv', null, head,
      el('div.adv-list', null, ...messages.map((m) => el('div.ev.' + (m.level === 'critical' ? 'error' : m.level === 'warn' ? 'warn' : 'info'), null,
        icon({ info: 'info', warn: 'warn', error: 'error' }[m.level] || 'info'),
        el('span', { text: m.text }), el('span.when', { text: 'since day ' + m.since })))));
  }

  function build() {
    const simApi = sim();
    const L = simApi?.getLodging?.() || {};
    const advice = simApi?.getAdvice?.() || [];
    const trust = simApi?.getVillageTrust?.();
    const rows = Object.keys(L).filter((t) => (L[t]?.beds ?? 0) > 0).map((t) => tierRow(t, L[t]));
    const modal = el('div.modal.panel.pe', { role: 'dialog' },
      el('div.modal-h', null, el('span.ico', null, icon('lodge')),
        el('span.t', null, el('b', { text: 'Camp & Advisors' }), el('i', { text: 'Room rates, occupancy and the morning briefing' })),
        el('button.btn.icon.ghost', { 'data-tip': 'Close', 'data-key': 'Esc', onclick: hide }, icon('close'))),
      el('div.modal-b', null,
        el('div.sec-h', null, icon('lodge'), 'Rooms — set the rate, the market answers'),
        rows.length ? el('div.obj-cards', null, ...rows) : el('div.ev', null, icon('info'), 'No guest buildings yet — the camp needs beds to sell.'),
        el('div.sec-h', { style: 'margin-top:14px' }, icon('social'), `Advisors${trust != null ? ' — village trust ' + Math.round(trust * 100) + '%' : ''}`),
        ...PERSONAS.map((p) => advisorRow(p, advice.filter((m) => m.advisor === p.id)))));
    return el('div.backdrop.pe', { onclick: (e) => { if (e.target.classList.contains('backdrop')) hide(); } }, modal);
  }

  function show() { hide(); node = build(); root.appendChild(node); }
  function hide() { if (node) { node.remove(); node = null; } }
  function isOpen() { return !!node; }
  function refresh() { if (isOpen()) show(); }

  return { show, hide, isOpen, refresh, dispose: hide };
}
