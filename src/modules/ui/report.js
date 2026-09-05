// Daily report modal with canvas sparklines (cash / visitors / population, last 30 days), breakdowns, population, events.
import { el, clear, fmtMoney, fmtInt, fmtCompact, titleCase, clamp01, scoreColor } from './dom.js';
import { icon, animalIconName } from './icons.js';
import { speciesFacts } from './species.js';

export function createReport(root, s) {
  let node = null;
  let currentReport = null;

  function sparkline(canvas, values, { color = '#f0b13c', fill = true } = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 240, h = canvas.clientHeight || 64;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!values || values.length < 2) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '11px sans-serif'; g.fillText('no history yet', 4, h / 2 + 4); return; }
    let mn = Infinity, mx = -Infinity;
    for (const v of values) { if (v < mn) mn = v; if (v > mx) mx = v; }
    if (mx === mn) { mx += 1; mn -= 1; }
    const pad = 4, top = 8, bottom = 6;
    const X = (i) => pad + (i / (values.length - 1)) * (w - pad * 2);
    const Y = (v) => top + (1 - (v - mn) / (mx - mn)) * (h - top - bottom);
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
    for (let k = 0; k < 3; k++) { const y = Math.round(top + (k / 2) * (h - top - bottom)) + 0.5; g.beginPath(); g.moveTo(pad, y); g.lineTo(w - pad, y); g.stroke(); }
    // zero line if range crosses zero
    if (mn < 0 && mx > 0) { g.strokeStyle = 'rgba(240,106,90,0.45)'; g.setLineDash([3, 3]); const y = Math.round(Y(0)) + 0.5; g.beginPath(); g.moveTo(pad, y); g.lineTo(w - pad, y); g.stroke(); g.setLineDash([]); }
    // fill
    if (fill) {
      const grad = g.createLinearGradient(0, top, 0, h);
      grad.addColorStop(0, hexA(color, 0.35)); grad.addColorStop(1, hexA(color, 0.02));
      g.beginPath(); g.moveTo(X(0), h);
      for (let i = 0; i < values.length; i++) g.lineTo(X(i), Y(values[i]));
      g.lineTo(X(values.length - 1), h); g.closePath(); g.fillStyle = grad; g.fill();
    }
    // line
    g.beginPath(); g.strokeStyle = color; g.lineWidth = 1.8; g.lineJoin = 'round'; g.lineCap = 'round';
    for (let i = 0; i < values.length; i++) { const x = X(i), y = Y(values[i]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    // last point
    const lx = X(values.length - 1), ly = Y(values[values.length - 1]);
    g.beginPath(); g.arc(lx, ly, 3, 0, Math.PI * 2); g.fillStyle = color; g.fill();
    g.beginPath(); g.arc(lx, ly, 5.5, 0, Math.PI * 2); g.strokeStyle = hexA(color, 0.4); g.lineWidth = 1.5; g.stroke();
  }

  function tile(title, ic, valueText, deltaText, deltaGood, values, color, footer) {
    const canvas = el('canvas');
    const t = el('div.tile', null,
      el('div.th', null, icon(ic), title),
      el('div.tv', null, el('b', { text: valueText }), deltaText ? el('span.delta' + (deltaGood ? '' : '.neg'), { text: deltaText }) : null),
      canvas, footer ? el('div.sub', null, el('span', { text: footer[0] }), el('span', { text: footer[1] })) : null);
    t._draw = () => sparkline(canvas, values, { color });
    return t;
  }

  function rows(obj, order, total, totalLabel, cls) {
    const wrap = el('div.rows');
    const keys = order.filter((k) => obj && obj[k] !== undefined).concat(Object.keys(obj || {}).filter((k) => !order.includes(k)));
    for (const k of keys) wrap.appendChild(el('div.kv', null, el('span.muted', { text: titleCase(k) }), el('b', { text: fmtMoney(obj[k]) })));
    wrap.appendChild(el('div.kv.total', null, el('span', { text: totalLabel }), el('b.' + cls, { text: fmtMoney(total) })));
    return wrap;
  }

  function build(report) {
    const world = s.world;
    const hist = (report.history && report.history.length ? report.history : world.economy.history) || [];
    const last30 = hist.slice(-30);
    const cashSeries = last30.map((d) => d.cash ?? 0);
    const visSeries = last30.map((d) => d.visitors ?? 0);
    const popSeries = (report.populationHistory || s.popHistory || []).slice(-30).map((d) => (typeof d === 'number' ? d : d.n ?? d.population ?? 0));
    const popTotal = report.population ? Object.values(report.population).reduce((a, b) => a + (b || 0), 0) : world.animals.size;
    const prev = last30.length >= 2 ? last30[last30.length - 2] : null;
    const cashDelta = prev ? (report.cash ?? world.economy.cash) - (prev.cash ?? 0) : (report.income || 0) - (report.expenses || 0);
    const visDelta = prev ? (report.visitors ?? 0) - (prev.visitors ?? 0) : 0;
    const popPrev = popSeries.length >= 2 ? popSeries[popSeries.length - 2] : popTotal;
    const popDelta = popTotal - popPrev;
    const satisfaction = clamp01(report.satisfaction ?? world.visitors.satisfaction ?? 0.5);
    const reputation = clamp01(report.reputation ?? s.reputation ?? 0.5);
    const income = report.income ?? world.economy.income ?? 0, expenses = report.expenses ?? world.economy.expenses ?? 0;
    const net = income - expenses;
    const bd = report.breakdown || {};
    const inc = bd.income || report.incomeBreakdown || { tickets: income };
    const exp = bd.expenses || report.expenseBreakdown || { upkeep: expenses };

    const tiles = [
      tile('Treasury', 'coin', fmtMoney(report.cash ?? world.economy.cash), fmtMoney(cashDelta, { sign: true }) + ' today', cashDelta >= 0, cashSeries, '#f0b13c', ['30 days', 'low ' + fmtCompact(Math.min(...cashSeries)) + ' · high ' + fmtCompact(Math.max(...cashSeries))]),
      tile('Visitors', 'visitors', fmtInt(report.visitors ?? world.visitors.count), (visDelta >= 0 ? '+' : '−') + fmtInt(Math.abs(visDelta)) + ' vs yesterday', visDelta >= 0, visSeries, '#5db3f0', ['30 days', 'avg ' + fmtInt(avg(visSeries))]),
      tile('Population', 'paw', fmtInt(popTotal), (popDelta >= 0 ? '+' : '−') + fmtInt(Math.abs(popDelta)) + ' animals', popDelta >= 0, popSeries, '#62cf7e', ['30 days', Object.keys(report.population || {}).length + ' species']),
    ];

    // population per species
    const popWrap = el('div.pop');
    const animalsApi = s.ctx.modules.get('animals');
    const popEntries = Object.entries(report.population || countSpecies(world)).sort((a, b) => b[1] - a[1]);
    for (const [sp, n] of popEntries) {
      const h = clamp01(report.happiness?.[sp] ?? avgHappiness(world, sp));
      popWrap.appendChild(el('div.bar-row', null, el('span.lab', null, icon(animalIconName(sp)), speciesFacts(sp, animalsApi).name),
        el('span.bar', null, el('i', { style: `width:${Math.round(h * 100)}%;background:${scoreColor(h)}` })),
        el('span.n', { text: fmtInt(n) }), el('span.val', { text: Math.round(h * 100) + '%' })));
    }

    // events
    const evWrap = el('div.events');
    const evs = report.events || [];
    if (!evs.length) evWrap.appendChild(el('div.ev', null, icon('info'), 'A quiet day. Nothing to report.'));
    for (const e of evs) {
      const lvl = typeof e === 'string' ? 'info' : e.level || 'info';
      evWrap.appendChild(el('div.ev.' + lvl, null, icon({ info: 'info', warn: 'warn', error: 'error', good: 'check' }[lvl] || 'info'),
        el('span', { text: typeof e === 'string' ? e : e.text || e.title || '' }), e.when ? el('span.when', { text: e.when }) : null));
    }

    const gauge = (v, label, text) => el('div.gauge', null, ringSmall(v, label), el('div.txt', { style: 'font-size:12px;color:var(--muted);line-height:1.4' }, text));

    const day = report.day ?? world.time.day;
    const modal = el('div.modal.panel.pe', { role: 'dialog' },
      el('div.modal-h', null, el('span.ico', null, icon('report')),
        el('span.t', null, el('b', { text: 'Daily report — Day ' + day }), el('i', { text: (world.weather?.season === 'wet' ? 'Wet season' : 'Dry season') + ' · ' + s.parkName + ' · ticket ' + fmtMoney(world.economy.ticketPrice || 0) })),
        el('span.chip' + (net >= 0 ? '.good' : '.bad'), { text: (net >= 0 ? 'Profit ' : 'Loss ') + fmtMoney(Math.abs(net)) }),
        el('button.btn.icon.ghost', { 'data-tip': 'Close', 'data-key': 'Esc', onclick: hide }, icon('close'))),
      el('div.modal-b', null,
        el('div.grid3', null, ...tiles),
        el('div.grid3', { style: 'margin-top:10px' },
          el('div.tile', null, el('h4', null, icon('trendUp'), 'Income'), rows(inc, ['tickets', 'lodge', 'shop', 'donations'], income, 'Total income', 'good')),
          el('div.tile', null, el('h4', null, icon('trendDown'), 'Expenses'), rows(exp, ['staff', 'upkeep', 'animals', 'roads', 'interest'], expenses, 'Total expenses', 'bad')),
          el('div.tile', null, el('h4', null, icon('star'), 'Visitors'),
            gauge(satisfaction, 'SATISF.', satisfaction >= 0.7 ? 'Visitors are delighted — variety and close sightings are paying off.' : satisfaction >= 0.45 ? 'Mixed reviews. More species and smoother roads would help.' : 'Visitors are unhappy. Check ticket price and sightings.'),
            el('div', { style: 'height:8px' }),
            gauge(reputation, 'REPUT.', 'Word of mouth drives tomorrow\'s arrivals. ' + (report.arrivalsTomorrow ? 'Expected: ' + fmtInt(report.arrivalsTomorrow) + '.' : '')))),
        el('div.grid2', { style: 'margin-top:10px' },
          el('div.tile', null, el('h4', null, icon('paw'), 'Population & happiness'), popWrap),
          el('div.tile', null, el('h4', null, icon('info'), 'Events'), evWrap))),
      el('div.modal-f', null,
        el('label.checkbox', null, el('input', { type: 'checkbox', checked: s.settings.autoReport ? true : undefined, onchange: (e) => { s.settings.autoReport = e.target.checked; } }), 'Open automatically each day'),
        el('span.sp'),
        el('button.btn', { onclick: hide }, 'Close'),
        el('button.btn.primary', { 'data-tip': 'Close and resume', onclick: () => { hide(); if (s.world.time.paused) s.setSpeed(Math.max(1, s.speedMult || 1)); } }, icon('play'), 'Continue')));
    const backdrop = el('div.backdrop.pe', { onclick: (e) => { if (e.target === backdrop) hide(); } }, modal);
    return { backdrop, tiles };
  }

  function ringSmall(value, label) {
    const v = clamp01(value), r = 30, c = 2 * Math.PI * r;
    const wrap = el('div.ring');
    wrap.innerHTML = `<svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="7"/><circle cx="36" cy="36" r="${r}" fill="none" stroke="${scoreColor(v)}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
    wrap.appendChild(el('div.v', null, Math.round(v * 100) + '%', el('small', { text: label })));
    return wrap;
  }

  function show(report) {
    hide();
    currentReport = report || buildFallbackReport(s);
    const { backdrop, tiles } = build(currentReport);
    node = backdrop;
    root.appendChild(node);
    for (const t of tiles) t._draw();
  }
  function hide() { if (node) { node.remove(); node = null; } currentReport = null; }
  function isOpen() { return !!node; }

  return { show, hide, isOpen, dispose: hide };
}

/** When no simulation module exists, make a report from world.* so the button still shows something truthful. */
export function buildFallbackReport(s) {
  const w = s.world;
  return {
    day: w.time.day, cash: w.economy.cash, income: w.economy.income, expenses: w.economy.expenses,
    visitors: w.visitors.count, satisfaction: w.visitors.satisfaction, reputation: s.reputation,
    population: countSpecies(w), happiness: {}, events: [],
  };
}

function countSpecies(world) { const o = {}; for (const a of world.animals.values()) o[a.species] = (o[a.species] || 0) + 1; return o; }
function avgHappiness(world, sp) { let n = 0, t = 0; for (const a of world.animals.values()) if (a.species === sp) { n++; t += a.happiness ?? 0.5; } return n ? t / n : 0.5; }
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
