// Top bar: park identity, cash (tweened), daily delta, day + clock, season, speed controls, visitors, reputation, weather, report/settings.
import { el, setText, toggleClass, fmtMoney, fmtInt, fmtClock, clamp01 } from './dom.js';
import { icon } from './icons.js';

const SPEEDS = [
  { mult: 0, icon: 'pause', tip: 'Pause', key: 'Space', cls: 'pause' },
  { mult: 1, icon: 'play', tip: 'Normal speed (, and . step speed)', key: ',' },
  { mult: 3, icon: 'fast', tip: 'Fast — 3×', key: '.' },
  { mult: 10, icon: 'faster', tip: 'Very fast — 10×', key: '.' },
];

export function createTopbar(root, s) {
  const world = s.world;

  // --- park
  const nameEl = el('span.name', { text: s.parkName });
  const park = el('div.tb-seg.park', null, el('span.logo', null, icon('paw')), el('span', null, el('span.sub', { text: 'Safari park' }), nameEl));

  // --- cash
  const cashVal = el('span.val', { text: '$0' });
  const deltaIc = icon('trendUp');
  const deltaTx = el('span', { text: '' });
  const delta = el('span.delta', { 'data-tip': 'Net cash flow per game day (income − expenses)', 'data-tip-pos': 'below' }, deltaIc, deltaTx);
  const cash = el('div.tb-seg.cash', { 'data-tip': 'Park treasury', 'data-tip-pos': 'below' }, icon('coin', 'lg'), cashVal, delta);

  // --- visitors
  const visN = el('span.v', { text: '0' });
  const satFill = el('i');
  const visitors = el('div.tb-seg.stat', { 'data-tip': 'Visitors in the park today and their satisfaction', 'data-tip-pos': 'below' },
    icon('visitors', 'lg'), el('span.col', null, visN, el('span.satbar', null, satFill)));

  // --- reputation
  const starEls = [];
  const stars = el('span.stars');
  for (let i = 0; i < 5; i++) { const st = icon('starFill'); starEls.push(st); stars.appendChild(st); }
  const repTx = el('span.l', { text: 'Reputation' });
  const reputation = el('div.tb-seg.stat', { 'data-tip': 'Park reputation — drives visitor arrivals', 'data-tip-pos': 'below' }, el('span.col', null, stars, repTx));

  // --- clock (centre)
  const dayTx = el('span.day', { text: 'Day 1' });
  const seasonTx = el('span.season', { text: 'Dry season' });
  const timeTx = el('span.time', { text: '12:00' });
  const speedBtns = [];
  const speed = el('span.speed', { role: 'group' });
  for (const sp of SPEEDS) {
    const b = el('button', { 'data-tip': sp.tip, 'data-key': sp.key, 'data-tip-pos': 'below', class: sp.cls || '', onclick: () => s.setSpeed(sp.mult) }, icon(sp.icon));
    b._mult = sp.mult;
    speedBtns.push(b); speed.appendChild(b);
  }
  const clock = el('div.tb-seg.grow.clock', null,
    icon('calendar'), el('span.col', null, dayTx, seasonTx),
    el('span', { style: 'width:1px;height:22px;background:var(--line)' }),
    icon('clock'), timeTx, speed);

  // --- weather
  const wIc = icon('sun');
  const wTemp = el('span.t', { text: '28°' });
  const wLab = el('span.w', { text: 'Clear' });
  const weather = el('div.tb-seg.weather', { 'data-tip': 'Weather', 'data-tip-pos': 'below' }, wIc, el('span.col', null, wTemp, wLab));

  // --- buttons
  const btnReport = el('button.btn.icon', { 'data-tip': 'Daily report', 'data-key': 'J', 'data-tip-pos': 'below', onclick: () => s.api.openPanel('report') }, icon('report'));
  const btnSettings = el('button.btn.icon', { 'data-tip': 'Settings', 'data-key': 'O', 'data-tip-pos': 'below', onclick: () => s.api.openPanel('settings') }, icon('gear'));
  const btns = el('div.tb-seg.end.tb-btns', null, btnReport, btnSettings);

  const node = el('div.topbar.pe', null, park, cash, visitors, reputation, clock, weather, btns);
  root.appendChild(node);

  // --- state for tweening
  let shownCash = world.economy.cash, lastClock = '', lastDay = -1;

  function refreshStatic() {
    setText(nameEl, s.parkName);
    const eco = world.economy;
    const net = (eco.income || 0) - (eco.expenses || 0);
    setText(deltaTx, fmtMoney(net, { sign: true }) + '/day');
    toggleClass(delta, 'neg', net < 0);
    deltaIc.innerHTML = icon(net < 0 ? 'trendDown' : 'trendUp').innerHTML;

    const v = world.visitors;
    setText(visN, fmtInt(v.inPark || v.count || 0));
    satFill.style.width = Math.round(clamp01(v.satisfaction ?? 0.5) * 100) + '%';
    satFill.style.background = v.satisfaction >= 0.6 ? 'var(--good)' : v.satisfaction >= 0.4 ? 'var(--accent)' : 'var(--bad)';

    const rep = clamp01(s.reputation ?? 0.5) * 5;
    for (let i = 0; i < 5; i++) {
      const st = starEls[i];
      const full = rep >= i + 0.75, half = !full && rep >= i + 0.25;
      toggleClass(st, 'on', full); toggleClass(st, 'half', half);
    }
    setText(repTx, rep.toFixed(1) + ' / 5');

    const W = world.weather || {};
    const h = world.time.hour;
    const night = h < 6 || h >= 18.5;
    const rain = (W.rain || 0) > 0.25, cloud = (W.cloud || 0) > 0.6;
    const name = rain ? 'rain' : cloud ? 'cloud' : night ? 'moon' : 'sun';
    if (wIc._n !== name) { wIc._n = name; wIc.innerHTML = icon(name).innerHTML; }
    wIc.className = 'ic ' + (rain ? 'rain' : cloud ? 'cloud' : night ? 'night' : '');
    setText(wTemp, Math.round(W.temperature ?? 28) + '°');
    const wind = W.wind?.speed ?? 0;
    setText(wLab, (rain ? 'Rain' : cloud ? 'Overcast' : night ? 'Clear night' : 'Clear') + ' · ' + Math.round(wind) + ' m/s');
    setText(seasonTx, (W.season === 'wet' ? 'Wet' : 'Dry') + ' season');

    const paused = world.time.paused;
    const m = paused ? 0 : s.speedMult;
    for (const b of speedBtns) toggleClass(b, 'on', b._mult === m);
  }

  function update(dt) {
    const target = world.economy.cash;
    if (shownCash !== target) {
      const diff = target - shownCash;
      if (Math.abs(diff) < 1 || dt <= 0) shownCash = target;
      else shownCash += diff * Math.min(1, dt * 6);
      setText(cashVal, fmtMoney(shownCash));
      toggleClass(cashVal, 'neg', shownCash < 0);
    } else if (cashVal._t === undefined) { setText(cashVal, fmtMoney(target)); }
    const c = fmtClock(world.time.hour);
    if (c !== lastClock) { lastClock = c; setText(timeTx, c); }
    if (world.time.day !== lastDay) { lastDay = world.time.day; setText(dayTx, 'Day ' + world.time.day); }
  }

  return { el: node, refresh: refreshStatic, update, dispose() { node.remove(); } };
}
