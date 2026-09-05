// One shared tooltip. Any element with data-tip="…" (and optional data-key="…" / data-sub="…") gets one on hover.
import { el } from './dom.js';

export function createTooltip(root) {
  const node = el('div.tooltip', { role: 'tooltip' });
  root.appendChild(node);
  let timer = 0, current = null;

  function build(target) {
    node.textContent = '';
    node.appendChild(document.createTextNode(target.dataset.tip || ''));
    if (target.dataset.key) node.appendChild(el('span.key', { text: target.dataset.key }));
    if (target.dataset.sub) node.appendChild(el('small', { text: target.dataset.sub }));
  }

  function place(target) {
    const r = target.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    node.style.left = '0px'; node.style.top = '0px';
    const w = node.offsetWidth, h = node.offsetHeight;
    const below = target.dataset.tipPos === 'below';
    let x = r.left + r.width / 2 - w / 2 - rr.left;
    let y = below ? r.bottom + 8 - rr.top : r.top - h - 8 - rr.top;
    if (y < 8) y = r.bottom + 8 - rr.top;
    if (y + h > rr.height - 8) y = r.top - h - 8 - rr.top;
    x = Math.max(8, Math.min(rr.width - w - 8, x));
    node.style.left = Math.round(x) + 'px';
    node.style.top = Math.round(y) + 'px';
  }

  function show(target) {
    if (!target || !target.dataset.tip) return;
    current = target;
    build(target);
    place(target);
    node.classList.add('show');
  }
  function hide() { clearTimeout(timer); timer = 0; current = null; node.classList.remove('show'); }

  const onOver = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t || t === current) return;
    clearTimeout(timer);
    timer = setTimeout(() => show(t), 180);
  };
  const onOut = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) return;
    if (e.relatedTarget && t.contains(e.relatedTarget)) return;
    hide();
  };
  const onDown = () => hide();
  root.addEventListener('mouseover', onOver);
  root.addEventListener('mouseout', onOut);
  root.addEventListener('pointerdown', onDown, true);

  return {
    el: node,
    /** Force-show for an element (used by the showcase to demonstrate tooltips). */
    showFor: show,
    hide,
    dispose() {
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseout', onOut);
      root.removeEventListener('pointerdown', onDown, true);
      clearTimeout(timer);
      node.remove();
    },
  };
}
