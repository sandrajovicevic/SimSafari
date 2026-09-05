// Settings modal: quality (reload with ?quality=), audio volume, FPS counter, auto daily report, shortcuts reference.
import { el } from './dom.js';
import { icon } from './icons.js';

export const SHORTCUTS = [
  ['Pan camera', 'W A S D'], ['Rotate', 'Q / E'], ['Tilt', 'R / F'], ['Zoom', 'Wheel / + −'],
  ['Pause / resume', 'Space'], ['Slower / faster', ', / .'], ['Toolbar category', '1 – 6'], ['Cancel / close', 'Esc'],
  ['Daily report', 'J'], ['Settings', 'O'], ['Toggle minimap', 'M'], ['Hide interface', 'H'],
];

export function createSettings(root, s) {
  let node = null;

  function seg(options, value, onPick) {
    const wrap = el('span.seg');
    for (const o of options) {
      const b = el('button', { class: o.v === value ? 'on' : '', text: o.n, 'data-tip': o.tip, onclick: () => { for (const c of wrap.children) c.classList.toggle('on', c === b); onPick(o.v); } });
      wrap.appendChild(b);
    }
    return wrap;
  }
  function row(label, sub, control) { return el('div.set-row', null, el('div.k', null, label, sub ? el('small', { text: sub }) : null), control); }

  function build() {
    const audio = s.ctx.modules.get('audio');
    const quality = s.ctx.quality || 'high';
    const vol = el('input', { type: 'range', min: 0, max: 100, value: Math.round(s.settings.volume * 100) });
    const volV = el('span.v', { text: Math.round(s.settings.volume * 100) + '%' });
    vol.addEventListener('input', () => { s.settings.volume = vol.value / 100; volV.textContent = vol.value + '%'; try { audio?.setVolume?.('master', s.settings.volume); } catch {} });
    const fps = el('input', { type: 'checkbox', checked: s.settings.fps ? true : undefined, onchange: (e) => { s.settings.fps = e.target.checked; s.api.showFps(s.settings.fps); } });
    const auto = el('input', { type: 'checkbox', checked: s.settings.autoReport ? true : undefined, onchange: (e) => { s.settings.autoReport = e.target.checked; } });
    const keys = el('div.keys');
    for (const [what, k] of SHORTCUTS) keys.appendChild(el('div', null, el('span', { text: what }), el('span.key', { text: k })));

    const modal = el('div.modal.settings.panel.pe', { role: 'dialog' },
      el('div.modal-h', null, el('span.ico', null, icon('gear')), el('span.t', null, el('b', { text: 'Settings' }), el('i', { text: 'Graphics, audio and interface' })),
        el('button.btn.icon.ghost', { 'data-tip': 'Close', 'data-key': 'Esc', onclick: hide }, icon('close'))),
      el('div.modal-b', null,
        row('Graphics quality', 'Reloads the page with ?quality=', seg([{ v: 'low', n: 'Low', tip: 'No shadows, fewer props' }, { v: 'medium', n: 'Medium' }, { v: 'high', n: 'High', tip: 'Cascaded shadows, full density' }], quality, (v) => reloadWithQuality(v))),
        row('Master volume', audio ? 'Ambience, animals, vehicles and interface' : 'Audio module not loaded', el('span.slider', null, icon('wind'), vol, volV)),
        row('Show frame rate', 'Overlay with fps, frame time and draw calls', el('label.checkbox', null, fps, 'Enabled')),
        row('Daily report', 'Open the report automatically at the start of each day', el('label.checkbox', null, auto, 'Auto-open')),
        row('Camera', 'Return to the park overview', el('span', null, el('button.btn', { onclick: () => { try { s.ctx.rig.setPreset('overview'); } catch {} } }, icon('camera'), 'Reset view'))),
        el('div.sec', { style: 'padding-top:12px' }, el('div.sec-h', null, icon('keyboard'), 'Keyboard shortcuts'), keys)),
      el('div.modal-f', null, el('span.muted', { text: 'SimSafari · seed ' + s.world.seed + ' · quality ' + quality, style: 'font-size:11.5px' }), el('span.sp'), el('button.btn.primary', { onclick: hide }, 'Done')));
    return el('div.backdrop.pe', { onclick: (e) => { if (e.target.classList.contains('backdrop')) hide(); } }, modal);
  }

  function reloadWithQuality(v) {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('quality', v);
      window.location.href = u.toString();
    } catch {}
  }

  function show() { hide(); node = build(); root.appendChild(node); }
  function hide() { if (node) { node.remove(); node = null; } }
  function isOpen() { return !!node; }
  return { show, hide, isOpen, dispose: hide };
}
