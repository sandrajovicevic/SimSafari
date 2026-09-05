// Toast stack: ui:notify {level, text, x?, z?, title?, ttl?} → top-left stack. Click a located toast to fly the camera there.
import { el } from './dom.js';
import { icon } from './icons.js';

const ICONS = { info: 'info', warn: 'warn', error: 'error', good: 'check' };
const MAX = 5;

export function createNotifications(root, s) {
  const node = el('div.toasts');
  root.appendChild(node);
  const items = []; // { el, ttl, dying }

  function push(level, text, opts = {}) {
    level = ICONS[level] ? level : 'info';
    const hasPos = typeof opts.x === 'number' && typeof opts.z === 'number';
    const tx = el('div.tx', null, opts.title ? el('b', { text: opts.title + ' ' }) : null, String(text ?? ''));
    if (opts.sub || hasPos) tx.appendChild(el('small', { text: opts.sub || 'Click to view' }));
    const x = el('button.x', { 'aria-label': 'Dismiss', onclick: (e) => { e.stopPropagation(); remove(item); } }, icon('close'));
    const toast = el('div.toast.panel.pe.' + level + (hasPos ? '.focus' : ''), {
      onclick: () => {
        if (hasPos) { try { s.ctx.rig.lookAt(opts.x, opts.z, opts.distance ?? Math.min(s.ctx.rig.distance, 120)); } catch {} }
        remove(item);
      },
    }, icon(ICONS[level]), tx, x);
    const item = { el: toast, ttl: opts.ttl ?? (level === 'error' ? 14 : level === 'warn' ? 10 : 7), dying: false };
    items.push(item);
    node.appendChild(toast);
    while (items.length > MAX) remove(items[0], true);
    try { s.ctx.modules.get('audio')?.play?.(level === 'error' ? 'ui_error' : 'ui_notify', { gain: 0.5 }); } catch {}
    return item;
  }

  function remove(item, instant = false) {
    const i = items.indexOf(item);
    if (i < 0) return;
    items.splice(i, 1);
    if (instant) { item.el.remove(); return; }
    item.dying = true;
    item.el.classList.add('out');
    item.el.addEventListener('animationend', () => item.el.remove(), { once: true });
    setTimeout(() => item.el.remove(), 400);
  }

  function update(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.dying) continue;
      if (it.ttl < 0) continue; // sticky
      it.ttl -= dt;
      if (it.ttl <= 0) remove(it);
    }
  }

  function clear() { for (const it of items.slice()) remove(it, true); }

  return { el: node, push, update, clear, count: () => items.length, dispose() { clear(); node.remove(); } };
}
