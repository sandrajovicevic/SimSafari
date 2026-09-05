// Dashboard renderer for the simulation showcase: draws sparklines + the last daily report onto a 2D canvas.
// No DOM lookups here: the canvas is handed in (document.createElement in showcase.js), so the same drawing
// feeds both the #ui-root panel and the WebGL CanvasTexture quad the screenshot tool captures.
import { STAFF, STAFF_ORDER } from './tables.js';

export const PANEL_W = 1728, PANEL_H = 972;

const C = {
  bg: 'rgba(13,17,22,0.95)', card: 'rgba(255,255,255,0.045)', line: 'rgba(255,255,255,0.10)',
  text: '#ebe8e1', muted: '#9aa4ad', dim: '#6b7580',
  gold: '#e3b34f', blue: '#6db3f2', green: '#7fd17a', red: '#e4685b', orange: '#e6a04c', violet: '#b48ef0', teal: '#63cdc0',
};
const F = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

const money = (n) => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
const pct = (v) => `${Math.round((v || 0) * 100)} %`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function card(g, x, y, w, h) { g.fillStyle = C.card; roundRect(g, x, y, w, h, 10); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke(); }
function text(g, s, x, y, { font = F(400, 16), color = C.text, align = 'left', max } = {}) {
  g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic';
  if (max) { let t = String(s); while (t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -2) + '…'; s = t; }
  g.fillText(String(s), x, y);
}
function bar(g, x, y, w, h, v, color, track = 'rgba(255,255,255,0.08)') {
  g.fillStyle = track; roundRect(g, x, y, w, h, h / 2); g.fill();
  const vv = Math.max(0, Math.min(1, v || 0));
  if (vv > 0) { g.fillStyle = color; roundRect(g, x, y, Math.max(h, w * vv), h, h / 2); g.fill(); }
}
function happinessColor(h) { return h >= 0.7 ? C.green : h >= 0.45 ? C.orange : C.red; }

/** Sparkline with area fill, zero line when the series crosses zero, min/max ticks. */
function sparkline(g, series, x, y, w, h, color, { zeroLine = false } = {}) {
  if (!series.length) return;
  let mn = Math.min(...series), mx = Math.max(...series);
  if (zeroLine) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); }
  if (mx - mn < 1e-9) { mx += 1; mn -= 1; }
  const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
  const X = (i) => x + (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
  const Y = (v) => y + h - ((v - mn) / (mx - mn)) * h;
  // grid
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
  for (let k = 0; k <= 2; k++) { const yy = y + (h * k) / 2; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
  if (zeroLine && mn < 0 && mx > 0) { g.setLineDash([4, 4]); g.strokeStyle = 'rgba(228,104,91,0.6)'; g.beginPath(); g.moveTo(x, Y(0)); g.lineTo(x + w, Y(0)); g.stroke(); g.setLineDash([]); }
  // area
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '05');
  g.beginPath(); g.moveTo(X(0), y + h);
  for (let i = 0; i < series.length; i++) g.lineTo(X(i), Y(series[i]));
  g.lineTo(X(series.length - 1), y + h); g.closePath(); g.fillStyle = grad; g.fill();
  // line
  g.beginPath(); g.strokeStyle = color; g.lineWidth = 2.5; g.lineJoin = 'round';
  for (let i = 0; i < series.length; i++) (i ? g.lineTo : g.moveTo).call(g, X(i), Y(series[i]));
  g.stroke();
  // end dot
  const lx = X(series.length - 1), ly = Y(series[series.length - 1]);
  g.beginPath(); g.arc(lx, ly, 4, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  g.beginPath(); g.arc(lx, ly, 7, 0, Math.PI * 2); g.strokeStyle = color + '66'; g.lineWidth = 2; g.stroke();
}

function kpiCard(g, x, y, w, h, { label, value, sub, series, color, format, zeroLine, series2, color2, legend }) {
  card(g, x, y, w, h);
  text(g, label.toUpperCase(), x + 18, y + 28, { font: F(600, 13), color: C.muted });
  text(g, value, x + 18, y + 64, { font: F(700, 30), color: C.text });
  if (sub) text(g, sub, x + w - 18, y + 64, { font: F(500, 15), color: C.muted, align: 'right' });
  const sx = x + 18, sy = y + 82, sw = w - 36, sh = h - 82 - 34;
  sparkline(g, series, sx, sy, sw, sh, color, { zeroLine });
  if (series2) sparkline(g, series2, sx, sy, sw, sh, color2);
  const mn = Math.min(...series), mx = Math.max(...series);
  text(g, `min ${format(mn)}`, sx, y + h - 12, { font: F(400, 12), color: C.dim });
  text(g, `max ${format(mx)}`, sx + sw, y + h - 12, { font: F(400, 12), color: C.dim, align: 'right' });
  if (legend) text(g, legend, sx + sw / 2, y + h - 12, { font: F(400, 12), color: C.dim, align: 'center' });
}

function stars(g, x, y, v, size = 14) {
  const n = Math.round(v * 10) / 2; // 0..5 in halves
  for (let i = 0; i < 5; i++) {
    const cx = x + i * (size + 4) + size / 2, cy = y;
    g.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? size * 0.22 : size * 0.5, a = -Math.PI / 2 + (k * Math.PI) / 5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.closePath();
    g.fillStyle = i + 1 <= n ? C.gold : i + 0.5 === n ? C.gold + '88' : 'rgba(255,255,255,0.12)';
    g.fill();
  }
}

/**
 * Draw the dashboard. opts: { title, preset, description, sim, world, hour, mode:'overview'|'report' }
 */
export function drawDashboard(canvas, opts) {
  const { sim, world } = opts;
  canvas.width = PANEL_W; canvas.height = PANEL_H;
  const g = canvas.getContext('2d');
  const W = PANEL_W, H = PANEL_H;
  g.clearRect(0, 0, W, H);
  g.fillStyle = C.bg; roundRect(g, 0, 0, W, H, 18); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1.5; g.stroke();

  const hist = world.economy.history;
  const R = sim.getReport() || {};
  const S = sim.getState();
  const days = hist.length;

  // ---- header
  const hour = opts.hour ?? 15;
  const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
  text(g, 'SimSafari', 28, 44, { font: F(800, 30), color: C.gold });
  g.font = F(800, 30);
  const titleW = g.measureText('SimSafari').width;
  text(g, 'simulation  ·  park economy, visitors, habitats, animals, staff & events', 28 + titleW + 18, 44, { font: F(400, 18), color: C.muted });
  const wx = R.weather || {};
  const wxText = wx.rain > 0.05 ? `rain ${Math.round(wx.rain * 100)} %` : wx.cloud > 0.5 ? 'overcast' : 'clear';
  text(g, `day ${R.day ?? S.day}  ·  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ·  ${R.season || S.season} season  ·  ${wxText}  ·  seed ${world.seed}`, W - 28, 44, { font: F(500, 17), color: C.text, align: 'right' });
  text(g, `${cap(opts.preset)} — ${opts.description}`, 28, 72, { font: F(400, 15), color: C.muted, max: W - 56 });

  // ---- KPI row
  const isReport = opts.mode === 'report';
  const rowY = 90, rowH = isReport ? 170 : 236, gap = 16, cw = (W - 28 * 2 - gap * 3) / 4;
  const cash = hist.map((r) => r.cash), vis = hist.map((r) => r.visitors), pop = hist.map((r) => r.population), sat = hist.map((r) => r.satisfaction), rep = hist.map((r) => r.reputation);
  const d0 = hist[0] || {}, dN = hist[days - 1] || {};
  const delta = (a, b, f) => (b === undefined || a === undefined ? '' : `${b - a >= 0 ? '+' : '−'}${f(Math.abs(b - a))} over ${days} d`);
  const cashMin = Math.min(...cash), cashMax = Math.max(...cash);
  kpiCard(g, 28, rowY, cw, rowH, { label: 'Cash', value: money(dN.cash ?? world.economy.cash), sub: delta(d0.cash, dN.cash, money), series: cash, color: C.gold, format: money, zeroLine: cashMin < 0.25 * cashMax });
  kpiCard(g, 28 + (cw + gap), rowY, cw, rowH, { label: 'Visitors per day', value: `${dN.visitors ?? 0}`, sub: `avg ${Math.round(vis.reduce((a, b) => a + b, 0) / Math.max(1, days))} / d`, series: vis, color: C.blue, format: (v) => Math.round(v) });
  kpiCard(g, 28 + 2 * (cw + gap), rowY, cw, rowH, { label: 'Animal population', value: `${dN.population ?? sim.count()}`, sub: `${sim.totals.born} born · ${sim.totals.died} died · ${sim.totals.left} left`, series: pop, color: C.green, format: (v) => Math.round(v) });
  kpiCard(g, 28 + 3 * (cw + gap), rowY, cw, rowH, { label: 'Satisfaction / reputation', value: `${pct(dN.satisfaction)}`, sub: `reputation ${pct(dN.reputation)}`, series: sat, color: C.violet, format: pct, series2: rep, color2: C.teal, legend: 'violet satisfaction · teal reputation' });

  // ---- lower panels
  const top = rowY + rowH + 16, bottom = H - 40, ph = bottom - top;
  const c1 = 400, c3 = 430, c2 = W - 56 - c1 - c3 - gap * 2;
  const x1 = 28, x2 = x1 + c1 + gap, x3 = x2 + c2 + gap;
  drawReport(g, x1, top, c1, ph, R, S, world);
  if (isReport) drawQualityMatrix(g, x2, top, c2, ph, sim, world); else drawAnimals(g, x2, top, c2, ph, R, sim, world);
  drawStaffEvents(g, x3, top, c3, ph, R, S, sim);

  // ---- footer
  text(g, `ticket $${world.economy.ticketPrice}  ·  loans ${money(world.economy.loans || 0)}  ·  ${days} days simulated at 10 ticks / game-hour  ·  seeded (same seed → identical numbers)  ·  node src/modules/simulation/test.mjs`, 28, H - 14, { font: F(400, 13), color: C.dim });
  if (S.bankrupt) {
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.18);
    g.font = F(900, 120); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(228,104,91,0.18)'; g.fillText('BANKRUPT', 0, 0);
    g.strokeStyle = 'rgba(228,104,91,0.85)'; g.lineWidth = 4; g.strokeText('BANKRUPT', 0, 0);
    g.restore();
  }
}

function drawReport(g, x, y, w, h, R, S, world) {
  card(g, x, y, w, h);
  text(g, `DAILY REPORT — DAY ${R.day ?? S.day}`, x + 18, y + 28, { font: F(600, 13), color: C.muted });
  let yy = y + 56;
  const row = (label, value, color = C.text, bold = false) => { text(g, label, x + 18, yy, { font: F(400, 15), color: C.muted }); text(g, value, x + w - 18, yy, { font: F(bold ? 700 : 500, 15), color, align: 'right' }); yy += 22; };
  const inc = R.incomeBreakdown || {}, exp = R.expenseBreakdown || {};
  row('Income', money(R.income || 0), C.green, true);
  row('   tickets', money(inc.tickets || 0)); row('   lodge nights', `${money(inc.lodge || 0)}  (${R.lodgeNights ?? 0} beds)`); row('   shop', money(inc.shop || 0));
  yy += 4;
  row('Expenses', money(R.expenses || 0), C.red, true);
  row('   staff wages', money(exp.staff || 0)); row('   building upkeep', money(exp.buildings || 0)); row('   road upkeep', money(exp.roads || 0));
  row('   animal feed', money(exp.feed || 0)); row('   vet care', money(exp.vet || 0));
  if (exp.interest > 0) row('   loan interest', money(exp.interest));
  if (exp.events > 0) row('   incidents', money(exp.events));
  yy += 4;
  row('Net for the day', (R.net >= 0 ? '+' : '') + money(R.net || 0), R.net >= 0 ? C.green : C.red, true);
  row('Cash', money(R.cash ?? world.economy.cash), C.gold, true);
  yy += 8;
  g.strokeStyle = C.line; g.beginPath(); g.moveTo(x + 18, yy - 12); g.lineTo(x + w - 18, yy - 12); g.stroke();
  row('Visitors today', `${R.visitors ?? 0}  (peak in park ${R.inParkPeak ?? 0})`);
  text(g, 'Reputation', x + 18, yy, { font: F(400, 15), color: C.muted }); stars(g, x + w - 18 - 5 * 18, yy - 5, R.reputation ?? S.reputation); yy += 22;
  row('Park attraction', pct(R.attraction ?? S.attraction));
  yy += 6;
  text(g, 'VISITOR SATISFACTION', x + 18, yy, { font: F(600, 13), color: C.muted }); text(g, pct(R.satisfaction ?? S.satisfaction), x + w - 18, yy, { font: F(700, 15), color: C.violet, align: 'right' }); yy += 12;
  const B = R.satisfactionBreakdown || {};
  const labels = { variety: 'species variety', rarity: 'rare sightings', closeness: 'close encounters', roadComfort: 'road comfort', lodge: 'lodge quality', fairness: 'price fairness', crowding: 'uncrowded' };
  for (const k in labels) {
    if (yy > y + h - 14) break;
    text(g, labels[k], x + 18, yy + 12, { font: F(400, 13), color: C.muted });
    bar(g, x + 160, yy + 3, w - 160 - 62, 10, B[k] ?? 0, C.violet);
    text(g, pct(B[k] ?? 0), x + w - 18, yy + 12, { font: F(500, 12), color: C.text, align: 'right' });
    yy += 20;
  }
}

function drawAnimals(g, x, y, w, h, R, sim, world) {
  card(g, x, y, w, h);
  text(g, 'ANIMALS — POPULATION, HAPPINESS, HABITAT QUALITY', x + 18, y + 28, { font: F(600, 13), color: C.muted });
  const pop = R.population || sim.population(), hp = R.happiness || sim.happinessBySpecies();
  const species = Object.keys(pop).sort((a, b) => pop[b] - pop[a]);
  // per-species born/died/left from the habitats block
  const tot = {};
  for (const hid in R.habitats || {}) for (const s in R.habitats[hid].species) { const r = R.habitats[hid].species[s]; tot[s] = tot[s] || { q: 0, n: 0 }; tot[s].q += r.quality * r.n; tot[s].n += r.n; }
  const colN = x + 175, colBar = x + 215, barW = Math.min(220, w - 460), colQ = colBar + barW + 130, colTrend = x + w - 18;
  let yy = y + 52;
  text(g, 'species', x + 18, yy, { font: F(500, 12), color: C.dim }); text(g, 'count', colN, yy, { font: F(500, 12), color: C.dim, align: 'right' });
  text(g, 'happiness', colBar, yy, { font: F(500, 12), color: C.dim }); text(g, 'quality', colQ, yy, { font: F(500, 12), color: C.dim, align: 'right' }); text(g, 'diet · appeal', colTrend, yy, { font: F(500, 12), color: C.dim, align: 'right' });
  yy += 10;
  const rowH = 24;
  const maxRows = Math.floor((y + h - 150 - yy) / rowH);
  for (const s of species.slice(0, maxRows)) {
    yy += rowH;
    const sp = sim.species(s), hv = hp[s] ?? 0, q = tot[s] && tot[s].n ? tot[s].q / tot[s].n : sim.scoreHabitat([...world.habitats.values()][0], s);
    text(g, cap(s), x + 18, yy, { font: F(500, 15), color: C.text });
    text(g, pop[s], colN, yy, { font: F(600, 15), color: C.text, align: 'right' });
    bar(g, colBar, yy - 11, barW, 12, hv, happinessColor(hv));
    text(g, pct(hv), colBar + barW + 8, yy, { font: F(500, 12), color: happinessColor(hv) });
    text(g, pct(q), colQ, yy, { font: F(500, 13), color: C.text, align: 'right' });
    text(g, `${sp.diet} · ${'★'.repeat(Math.max(1, Math.round(sp.rarity * 5)))}`, colTrend, yy, { font: F(400, 12), color: C.muted, align: 'right' });
  }
  // habitats strip
  let hy = y + h - 132;
  g.strokeStyle = C.line; g.beginPath(); g.moveTo(x + 18, hy - 14); g.lineTo(x + w - 18, hy - 14); g.stroke();
  const habs = [...world.habitats.values()].slice(0, 5);
  const anyDrought = habs.some((hb) => sim.habitatStat(hb).drought > 0);
  text(g, 'HABITATS — water · shade · cover · road coverage', x + 18, hy, { font: F(600, 13), color: C.muted });
  if (anyDrought) text(g, '● drought active — water reduced', x + w - 18, hy, { font: F(600, 13), color: C.red, align: 'right' });
  hy += 10;
  const hw = (w - 36 - 10 * (habs.length - 1)) / Math.max(1, habs.length);
  habs.forEach((hb, i) => {
    const hx = x + 18 + i * (hw + 10);
    const st = sim.habitatStat(hb);
    const info = (R.habitats || {})[hb.id];
    const n = info ? Object.values(info.species).reduce((a, r) => a + r.n, 0) : 0;
    text(g, hb.name || `habitat ${hb.id}`, hx, hy + 18, { font: F(600, 13), color: C.text, max: hw });
    text(g, `${(st.area / 10000).toFixed(1)} ha · ${n} animals`, hx, hy + 36, { font: F(400, 12), color: C.muted, max: hw });
    const bars = [[st.water, C.blue], [st.shade, C.green], [st.cover, C.orange], [st.roadCoverage, C.gold]];
    bars.forEach(([v, col], k) => bar(g, hx, hy + 46 + k * 15, hw - 4, 8, v, col));
    if (st.drought > 0) { g.beginPath(); g.arc(hx + hw - 10, hy + 13, 5, 0, Math.PI * 2); g.fillStyle = C.red; g.fill(); }
  });
}

function drawQualityMatrix(g, x, y, w, h, sim, world) {
  card(g, x, y, w, h);
  text(g, 'HABITAT QUALITY PER SPECIES — how well each habitat fits each species (design → happiness)', x + 18, y + 28, { font: F(600, 13), color: C.muted });
  const habs = [...world.habitats.values()].slice(0, 6);
  const species = sim.allSpecies();
  const labelW = 120, cellW = (w - 36 - labelW) / Math.max(1, habs.length), rowH = Math.min(40, (h - 100) / (species.length + 1));
  let yy = y + 56;
  habs.forEach((hb, i) => text(g, hb.name || `habitat ${hb.id}`, x + 18 + labelW + i * cellW + cellW / 2, yy, { font: F(600, 12), color: C.muted, align: 'center', max: cellW - 8 }));
  species.forEach((s, r) => {
    const ry = yy + 14 + r * rowH;
    text(g, cap(s), x + 18, ry + rowH * 0.62, { font: F(500, 14), color: C.text });
    habs.forEach((hb, i) => {
      const q = sim.scoreHabitat(hb, s, { n: sim._rec(hb.id, s, false)?.n || 0 });
      const cx = x + 18 + labelW + i * cellW;
      g.fillStyle = q >= 0.7 ? `rgba(127,209,122,${0.15 + q * 0.5})` : q >= 0.45 ? `rgba(230,160,76,${0.15 + q * 0.5})` : `rgba(228,104,91,${0.15 + (1 - q) * 0.4})`;
      roundRect(g, cx + 3, ry + 3, cellW - 6, rowH - 6, 6); g.fill();
      const n = sim._rec(hb.id, s, false)?.n || 0;
      text(g, pct(q) + (n ? `  (${n})` : ''), cx + cellW / 2, ry + rowH * 0.62, { font: F(n ? 700 : 400, 13), color: C.text, align: 'center' });
    });
  });
  text(g, 'green ≥ 70 %  ·  orange 45–70 %  ·  red < 45 % (animals leave after 3 days under 30 % happiness)  ·  (n) = animals living there', x + 18, y + h - 16, { font: F(400, 12), color: C.dim });
}

function drawStaffEvents(g, x, y, w, h, R, S, sim) {
  card(g, x, y, w, h);
  text(g, 'STAFF & VILLAGE', x + 18, y + 28, { font: F(600, 13), color: C.muted });
  let yy = y + 52;
  const needs = S.staffNeeds || {};
  for (const r of STAFF_ORDER) {
    const st = S.staff[r], need = needs[r] ?? 0, cov = S.staffCoverage?.[r] ?? 1;
    text(g, STAFF[r].label, x + 18, yy + 12, { font: F(500, 14), color: C.text });
    text(g, `${st.n} / ${need} needed · $${st.wage}/d`, x + w - 18, yy + 12, { font: F(400, 12), color: C.muted, align: 'right' });
    bar(g, x + 120, yy + 3, w - 120 - 175, 10, cov, cov >= 0.99 ? C.green : cov >= 0.6 ? C.orange : C.red);
    yy += 24;
  }
  yy += 6;
  const meters = [['Staff morale', S.morale, C.teal], ['Upkeep efficiency', S.efficiency, C.blue], ['Village prosperity', S.prosperity, C.gold]];
  for (const [l, v, col] of meters) {
    text(g, l, x + 18, yy + 12, { font: F(500, 14), color: C.text });
    bar(g, x + 160, yy + 3, w - 160 - 70, 10, v, col);
    text(g, pct(v), x + w - 18, yy + 12, { font: F(600, 13), color: col, align: 'right' });
    yy += 24;
  }
  // events
  yy += 10;
  g.strokeStyle = C.line; g.beginPath(); g.moveTo(x + 18, yy - 4); g.lineTo(x + w - 18, yy - 4); g.stroke();
  text(g, 'EVENTS (seeded)', x + 18, yy + 16, { font: F(600, 13), color: C.muted });
  const active = (R.activeEvents || []).map((e) => `${e.type}${e.species ? ' ' + e.species : ''} ${e.daysLeft} d`).join(' · ');
  if (active) text(g, active, x + w - 18, yy + 16, { font: F(500, 12), color: C.orange, align: 'right', max: w - 160 });
  yy += 30;
  const all = sim.getReports(120).flatMap((r) => r.events);
  const recent = all.slice(-8).reverse();
  const colors = { drought: C.orange, poachers: C.red, disease: C.red, viral: C.green, badpress: C.red, grant: C.gold, breakdown: C.orange };
  if (!recent.length) text(g, 'no events yet', x + 18, yy + 14, { font: F(400, 14), color: C.dim });
  for (const e of recent) {
    if (yy > y + h - 30) break;
    g.beginPath(); g.arc(x + 26, yy + 9, 5, 0, Math.PI * 2); g.fillStyle = colors[e.type] || C.blue; g.fill();
    text(g, `d${e.day}`, x + 40, yy + 14, { font: F(600, 13), color: C.muted });
    const lines = wrap(g, e.text, F(400, 13), w - 100);
    lines.slice(0, 2).forEach((ln, i) => text(g, ln, x + 82, yy + 14 + i * 17, { font: F(400, 13), color: C.text }));
    yy += 14 + Math.min(2, lines.length) * 17;
  }
  text(g, `${all.length} events in ${sim.getReports(120).length} days`, x + w - 18, y + h - 14, { font: F(400, 12), color: C.dim, align: 'right' });
}

function wrap(g, s, font, maxW) {
  g.font = font;
  const words = String(s).split(' '), lines = [];
  let cur = '';
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
