// Right-hand selection panel: animal / building / habitat / road details read from world.* and module APIs.
import { el, clear, fmtMoney, fmtInt, fmtPct, fmtDist, fmtArea, titleCase, clamp01, scoreColor } from './dom.js';
import { icon, animalIconName } from './icons.js';
import { speciesFacts, BUILDINGS } from './species.js';

const NEEDS = [
  { k: 'food', name: 'Food', icon: 'food' },
  { k: 'water', name: 'Water', icon: 'drop' },
  { k: 'rest', name: 'Rest', icon: 'rest' },
  { k: 'safety', name: 'Safety', icon: 'shield' },
  { k: 'social', name: 'Social', icon: 'social' },
];
const STATE_WORDS = { graze: 'Grazing', browse: 'Browsing', walk: 'Walking', drink: 'Drinking', rest: 'Resting', sleep: 'Sleeping', flee: 'Fleeing', hunt: 'Hunting', stalk: 'Stalking', social: 'Socialising', idle: 'Idle', alert: 'Alert', wander: 'Wandering', eat: 'Eating' };

export function createSidePanel(root, s) {
  const node = el('div.side.panel.pe', { hidden: true });
  const head = el('div.side-h');
  const body = el('div.side-b');
  node.append(head, body);
  root.appendChild(node);

  let current = null; // { kind, id }
  let live = [];      // functions to call on refresh (bars etc.)

  function ring(value, label, size = 74) {
    const v = clamp01(value);
    const r = 30, c = 2 * Math.PI * r;
    const wrap = el('div.ring');
    wrap.innerHTML = `<svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="6"/>` +
      `<circle cx="36" cy="36" r="${r}" fill="none" stroke="${scoreColor(v)}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
    wrap.appendChild(el('div.v', null, Math.round(v * 100) + '%', el('small', { text: label })));
    return wrap;
  }

  function barRow(ic, label, value, { color } = {}) {
    const fill = el('i');
    const val = el('span.val');
    const row = el('div.bar-row', null, icon(ic), el('span.lab', { text: label }), el('span.bar', null, fill), val);
    const set = (v) => { v = clamp01(v); fill.style.width = Math.round(v * 100) + '%'; fill.style.background = color || scoreColor(v); val.textContent = Math.round(v * 100) + '%'; };
    set(value);
    row._set = set;
    return row;
  }

  function fact(ic, k, v) {
    return el('div.fact', null, icon(ic), el('span.col', null, el('span.k', { text: k }), el('span.v', { text: v })));
  }

  function section(title, ic, ...children) {
    return el('div.sec', null, el('div.sec-h', null, ic ? icon(ic) : null, title), ...children);
  }

  function setHeader(ic, title, sub, onClose) {
    clear(head);
    head.append(el('span.ico', null, icon(ic)), el('span.t', null, el('b', { text: title }), el('i', { text: sub })),
      el('button.btn.icon.ghost', { 'data-tip': 'Close panel', 'data-key': 'Esc', onclick: onClose }, icon('close')));
  }

  const deselect = () => {
    s.ctx.events.emit('selection:clear', {});
    if (!s.ctx.modules.get('tools')) { s.world.selection.kind = null; s.world.selection.id = null; }
    hide();
  };

  // ---------- renderers ----------
  function renderAnimal(id) {
    const a = s.world.animals.get(id);
    if (!a) return false;
    const animals = s.ctx.modules.get('animals');
    const f = speciesFacts(a.species, animals);
    let happy = typeof a.happiness === 'number' ? a.happiness : 0.5;
    try { const h = animals?.getHappiness?.(id); if (typeof h === 'number') happy = h; } catch {}
    const displayName = a.name || (f.name + ' ' + shortId(id));
    setHeader(animalIconName(a.species), displayName, f.latin ? f.latin + ' · ' + titleCase(f.diet) : titleCase(f.diet), deselect);
    clear(body); live = [];

    const stateWord = STATE_WORDS[a.state] || titleCase(a.state || 'idle');
    const mood = happy >= 0.7 ? 'Thriving' : happy >= 0.5 ? 'Content' : happy >= 0.3 ? 'Stressed' : 'Miserable';
    const moodChip = el('span.chip' + (happy >= 0.5 ? '.good' : happy >= 0.3 ? '.warn' : '.bad'), { text: mood });
    const stateChip = el('span.chip.info', { text: stateWord });
    const ringEl = ring(happy, 'HAPPY');
    const txt = el('div.txt', null, el('b', null, moodChip, ' ', stateChip), happinessAdvice(a, happy, f));
    body.appendChild(section('Wellbeing', 'heart', el('div.happy', null, ringEl, txt)));

    const needs = a.needs || {};
    const rows = NEEDS.map((n) => barRow(n.icon, n.name, needs[n.k] ?? 0.5));
    body.appendChild(section('Needs', null, ...rows));
    live.push(() => {
      const b = s.world.animals.get(id); if (!b) return;
      NEEDS.forEach((n, i) => rows[i]._set(b.needs?.[n.k] ?? 0.5));
      stateChip.textContent = STATE_WORDS[b.state] || titleCase(b.state || 'idle');
    });

    const habitat = a.habitat || habitatNameAt(a.x, a.z);
    body.appendChild(section('Facts', null, el('div.facts', null,
      fact('age', 'Age', a.age !== undefined ? fmtAge(a.age) : '—'),
      fact('sex', 'Sex', a.sex ? (String(a.sex)[0].toLowerCase() === 'f' ? 'Female' : 'Male') : '—'),
      fact('ruler', 'Shoulder', f.shoulder.toFixed(1) + ' m'),
      fact('weight', 'Mass', fmtInt(f.mass) + ' kg'),
      fact('herd', 'Herd', a.herd ? ('Herd ' + shortId(String(a.herd)) + ' · ' + herdSize(a.herd)) : 'Solitary'),
      fact('map', 'Habitat', habitat || 'Unfenced'),
      fact('star', 'Appeal', '★'.repeat(Math.max(1, Math.min(5, Math.round(f.appeal)))) ),
      fact(f.activity === 'night' ? 'moon' : 'sun', 'Active', f.activity === 'night' ? 'Night' : 'Day'),
    ), f.desc ? el('p.desc', { text: f.desc, style: 'margin:8px 0 0' }) : null));

    body.appendChild(el('div.actions', null,
      el('button.btn.primary', { 'data-tip': 'Move the camera to this animal', onclick: () => focusAt(a.x, a.z, 32, 18) }, icon('focus'), 'Follow'),
      el('button.btn', { 'data-tip': 'Move to another habitat', onclick: () => s.requestTool('animal.move', { id }, { name: 'Move ' + f.name, icon: 'paw' }) }, icon('pin'), 'Relocate'),
      el('button.btn.danger', { 'data-tip': 'Sell to another park for ' + fmtMoney(Math.round(f.cost * 0.6)), onclick: () => s.ctx.events.emit('tool:request', { tool: 'animal.sell', options: { id } }) }, icon('coin'), 'Sell')));
    return true;
  }

  function renderBuilding(id) {
    const b = s.world.buildings.get(id);
    if (!b) return false;
    const cat = BUILDINGS.find((x) => x.type === b.type);
    let info = null;
    try { info = s.ctx.modules.get('buildings')?.info?.(id) || null; } catch {}
    const name = b.name || info?.name || cat?.name || titleCase(b.type);
    setHeader(cat?.icon || 'building', name, titleCase(b.state || 'operating') + ' · ' + Math.round(b.w || cat?.w || 0) + ' × ' + Math.round(b.d || cat?.d || 0) + ' m', deselect);
    clear(body); live = [];
    const staff = b.staff ?? cat?.staff ?? 0, staffMax = info?.staffMax ?? cat?.staff ?? staff;
    const visitors = b.visitors ?? 0, cap = info?.capacity ?? b.capacity ?? Math.max(1, visitors);
    const upkeep = info?.upkeep ?? cat?.upkeep ?? 0;
    const occ = barRow('visitors', 'Occupancy', cap ? visitors / cap : 0, { color: 'var(--info)' });
    const st = barRow('staff', 'Staffing', staffMax ? staff / staffMax : 1, { color: 'var(--accent)' });
    body.appendChild(section('Operation', null, occ, st,
      el('div.kv', null, el('span.muted', { text: 'Visitors now' }), el('b', { text: fmtInt(visitors) + ' / ' + fmtInt(cap) })),
      el('div.kv', null, el('span.muted', { text: 'Staff' }), el('b', { text: fmtInt(staff) + ' / ' + fmtInt(staffMax) })),
      el('div.kv', null, el('span.muted', { text: 'Upkeep' }), el('b', { text: fmtMoney(upkeep) + ' / day' })),
      el('div.kv', null, el('span.muted', { text: 'Income today' }), el('b.good', { text: fmtMoney(info?.incomeToday ?? b.income ?? 0) }))));
    live.push(() => { const c = s.world.buildings.get(id); if (c) occ._set(cap ? (c.visitors || 0) / cap : 0); });
    if (cat?.desc || info?.desc) body.appendChild(section('About', null, el('p.desc', { text: info?.desc || cat.desc, style: 'margin:0' })));
    body.appendChild(el('div.actions', null,
      el('button.btn.primary', { onclick: () => focusAt(b.x, b.z, 70, 30) }, icon('focus'), 'Focus'),
      el('button.btn.danger', { 'data-tip': 'Demolish (50% refund)', onclick: () => s.ctx.events.emit('tool:request', { tool: 'bulldoze', options: { id } }) }, icon('bulldoze'), 'Demolish')));
    return true;
  }

  function renderHabitat(id) {
    const h = s.world.habitats.get(id) ?? s.world.habitats.get(Number(id));
    if (!h) return false;
    setHeader('habitat', h.name || 'Habitat ' + id, fmtArea(h.area || (h.cells?.length || 0) * 16) + ' · ' + (h.species?.size || 0) + ' species', deselect);
    clear(body); live = [];
    const q = clamp01(h.quality ?? 0.6);
    body.appendChild(section('Quality', 'layers', el('div.happy', null, ring(q, 'QUALITY'),
      el('div.txt', null, el('b', { text: q >= 0.7 ? 'Good habitat' : q >= 0.45 ? 'Adequate habitat' : 'Poor habitat' }), 'Overall fit for the species living here. Improve water, shade and cover to raise it.'))));
    body.appendChild(section('Resources', null,
      barRow('drop', 'Water', h.water ?? 0, { color: 'var(--water)' }), barRow('sun', 'Shade', h.shade ?? 0, { color: 'var(--accent)' }), barRow('habitat', 'Cover', h.cover ?? 0, { color: 'var(--good)' })));
    const sim = s.ctx.modules.get('simulation');
    const sp = [...(h.species || [])];
    if (sp.length) {
      const rows = sp.map((spId) => {
        let sq = q;
        try { const v = sim?.scoreHabitat?.(h, spId); if (typeof v === 'number') sq = v; } catch {}
        if (h.qualityBySpecies && typeof h.qualityBySpecies[spId] === 'number') sq = h.qualityBySpecies[spId];
        return barRow(animalIconName(spId), speciesFacts(spId, s.ctx.modules.get('animals')).name, sq);
      });
      body.appendChild(section('Fit per species', null, ...rows));
    }
    body.appendChild(el('div.actions', null,
      el('button.btn.primary', { onclick: () => { const c = habitatCenter(h); focusAt(c.x, c.z, 220, 45); } }, icon('focus'), 'Focus'),
      el('button.btn', { onclick: () => s.requestTool('zone.habitat', null, { name: 'Habitat', icon: 'habitat' }) }, icon('paint'), 'Edit zone')));
    return true;
  }

  function renderRoad(id) {
    const e = s.world.roads.edges.get(id);
    if (!e) return false;
    const len = roadLength(e);
    setHeader('road', titleCase(e.kind || 'dirt') + ' road', fmtDist(len) + ' · ' + (e.width || 5) + ' m wide', deselect);
    clear(body); live = [];
    const usage = clamp01(e.traffic ?? e.usage ?? 0);
    const cost = { dirt: 40, gravel: 110, paved: 260 }[e.kind] || 40;
    body.appendChild(section('Traffic', 'traffic', barRow('traffic', 'Usage', usage, { color: 'var(--info)' }),
      el('div.kv', null, el('span.muted', { text: 'Vehicles today' }), el('b', { text: fmtInt(e.vehiclesToday ?? Math.round(usage * 40)) })),
      el('div.kv', null, el('span.muted', { text: 'Comfort' }), el('b', { text: { dirt: 'Bumpy', gravel: 'Good', paved: 'Smooth' }[e.kind] || 'Bumpy' })),
      el('div.kv', null, el('span.muted', { text: 'Upkeep' }), el('b', { text: fmtMoney(Math.round(len * cost * 0.004)) + ' / day' }))));
    body.appendChild(el('div.actions', null,
      el('button.btn.primary', { onclick: () => { const p = e.points || []; const m = p.length >= 2 ? Math.floor(p.length / 4) * 2 : 0; focusAt(p[m] ?? 0, p[m + 1] ?? 0, 90, 30); } }, icon('focus'), 'Focus'),
      el('button.btn', { onclick: () => s.requestTool('road.paved', null, { name: 'Paved road', icon: 'roadPaved' }) }, icon('roadPaved'), 'Upgrade'),
      el('button.btn.danger', { onclick: () => s.ctx.events.emit('tool:request', { tool: 'bulldoze', options: { id } }) }, icon('bulldoze'), 'Remove')));
    return true;
  }

  // ---------- helpers ----------
  function focusAt(x, z, dist, pitch) { try { s.ctx.rig.lookAt(x, z, dist, pitch); } catch {} }
  function habitatNameAt(x, z) {
    try {
      const c = s.world.cellAt(x, z); const hid = s.world.grid.habitatId[c.index];
      if (!hid) return null; const h = s.world.habitats.get(hid); return h?.name || 'Habitat ' + hid;
    } catch { return null; }
  }
  function habitatCenter(h) {
    if (typeof h.x === 'number') return { x: h.x, z: h.z };
    const cells = h.cells; if (!cells || !cells.length) return { x: 0, z: 0 };
    let sx = 0, sz = 0; const res = s.world.grid.res;
    for (let i = 0; i < cells.length; i++) { const c = s.world.cellCenter(cells[i] % res, Math.floor(cells[i] / res)); sx += c.x; sz += c.z; }
    return { x: sx / cells.length, z: sz / cells.length };
  }
  function herdSize(herd) { let n = 0; for (const a of s.world.animals.values()) if (a.herd === herd) n++; return n + ' animals'; }
  function roadLength(e) { const p = e.points || []; let L = 0; for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); if (!L && e.length) L = e.length; return L; }

  // ---------- public ----------
  function show(kind, id) {
    const ok = kind === 'animal' ? renderAnimal(id) : kind === 'building' ? renderBuilding(id) : kind === 'habitat' ? renderHabitat(id) : kind === 'road' ? renderRoad(id) : false;
    if (!ok) { hide(); return false; }
    current = { kind, id };
    node.hidden = false;
    body.scrollTop = 0;
    return true;
  }
  function hide() { current = null; node.hidden = true; live = []; }
  function refresh() { if (!current) return; for (const f of live) { try { f(); } catch {} } }
  function isOpen() { return !!current; }
  function currentSel() { return current; }

  return { el: node, show, hide, refresh, isOpen, current: currentSel, dispose() { node.remove(); } };
}

function shortId(id) { const m = String(id).match(/(\d+)$/); return m ? '#' + m[1] : String(id); }
function fmtAge(years) { if (years < 1) return Math.round(years * 12) + ' months'; return years.toFixed(years < 3 ? 1 : 0) + ' years'; }
function happinessAdvice(a, happy, f) {
  const n = a.needs || {};
  const worst = Object.entries(n).sort((p, q) => (p[1] ?? 1) - (q[1] ?? 1))[0];
  if (happy >= 0.7) return 'All needs met. Breeding likely if the habitat has room.';
  if (worst && worst[1] < 0.35) return ({ food: 'Not enough grazing here — enlarge the habitat or lower stocking.', water: 'Too far from water. Add a water hole nearby.', rest: 'No shade or quiet. Add trees or move vehicles away.', safety: 'Predators too close. Fence them apart.', social: 'Herd is too small for this species (' + f.herd + '+ preferred).' })[worst[0]] || 'Needs attention.';
  return 'Doing fine, but watch the lowest need bar.';
}
