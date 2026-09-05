// Tiny DOM helpers + number formatting shared by every UI component. No framework.

/**
 * el('div.a.b', {attrs}, ...children) — children may be nodes, strings, arrays or null.
 * attrs: class, text, html (trusted markup only: our own SVG), style (string), dataset keys via 'data-*', on* handlers.
 */
export function el(spec, attrs, ...children) {
  const parts = spec.split('.');
  const node = document.createElement(parts[0] || 'div');
  if (parts.length > 1) node.className = parts.slice(1).join(' ');
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
    else node.appendChild(c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/** Set textContent only when it changed (avoids layout churn in the per-frame path). */
export function setText(node, text) {
  if (node._t !== text) { node._t = text; node.textContent = text; }
}

export function toggleClass(node, cls, on) {
  if (on) node.classList.add(cls); else node.classList.remove(cls);
}

// ---------- formatting ----------
const NBSP = ' ';
export function fmtInt(n) {
  n = Math.round(Number(n) || 0);
  const s = Math.abs(n).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const j = s.length - i;
    out += s[i];
    if (j > 1 && (j - 1) % 3 === 0) out += ',';
  }
  return (n < 0 ? '−' : '') + out;
}
export function fmtMoney(n, { sign = false } = {}) {
  n = Number(n) || 0;
  const body = '$' + fmtInt(Math.abs(n));
  if (n < 0) return '−' + body;
  return (sign && n > 0 ? '+' : '') + body;
}
export function fmtCompact(n) {
  n = Number(n) || 0;
  const a = Math.abs(n);
  const s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k' : fmtInt(a);
  return (n < 0 ? '−' : '') + s;
}
export function fmtClock(hour) {
  hour = ((hour % 24) + 24) % 24;
  const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
export function fmtPct(v) { return Math.round((Number(v) || 0) * 100) + '%'; }
export function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + NBSP + 'km' : Math.round(m) + NBSP + 'm'; }
export function fmtArea(m2) { return m2 >= 10000 ? (m2 / 10000).toFixed(1) + NBSP + 'ha' : Math.round(m2) + NBSP + 'm²'; }
export function titleCase(s) { return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Colour for a 0..1 score: red → amber → green. */
export function scoreColor(v) {
  v = clamp01(v);
  const h = 8 + v * 112; // 8 (red) → 120 (green)
  return `hsl(${h.toFixed(0)} 72% ${(52 - v * 6).toFixed(0)}%)`;
}
