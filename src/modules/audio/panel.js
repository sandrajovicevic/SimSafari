// Showcase-only live analyser panel drawn into a 2D canvas inside #ui-root: context state,
// environment readout, per-bus meters with peak hold, log-frequency master spectrum, ambience
// layer mix and the last triggered sounds with positions. Not used in the game (ui owns the HUD).
import { BUS_NAMES } from './buses.js';
import { LAYER_NAMES } from './ambience.js';

const W = 616, H = 608;
const BAR_X0 = 92, BAR_X1 = 540, DB_MIN = -60;
const LAYER_COLORS = ['#7fb3ff', '#9be08a', '#ffd166', '#c9a3ff', '#5fe0c0', '#8ecae6', '#ff8fa3'];
const BUS_COLORS = { master: '#f2f2f2', ambience: '#9be08a', animals: '#ffb347', vehicles: '#b0bec5', ui: '#7fb3ff' };
const SPEC_BARS = 96, SPEC_F0 = 40, SPEC_F1 = 16000;

export class Panel {
  constructor(engine, ctx) {
    this.engine = engine; this.ctx = ctx; this.frame = 0;
    const root = document.getElementById('ui-root'); // lint-allow — showcase analyser panel
    this.el = document.createElement('div');
    this.el.id = 'audio-panel';
    this.el.style.cssText = 'position:absolute;top:12px;right:12px;width:' + (W + 24) + 'px;background:rgba(8,12,16,.84);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:10px 12px;color:#dfe6ec;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 8px 30px rgba(0,0,0,.45);cursor:pointer;user-select:none';
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H; this.canvas.style.cssText = 'display:block;width:' + W + 'px;height:' + H + 'px';
    this.el.appendChild(this.canvas);
    (root || document.body).appendChild(this.el); // lint-allow — showcase analyser panel
    this.g = this.canvas.getContext('2d');
    this.el.addEventListener('pointerdown', () => { this.engine.start(); });
    // Self-timed (10 Hz) so the meters stay live even when the render loop is throttled.
    this.timer = setInterval(() => this.update(), 100);
  }

  update() {
    if (this.engine.buses && this.engine.ac) this.engine.buses.meter(0.1);
    try { this.draw(); } catch (e) { this.ctx.log.warn('panel draw failed', e); }
  }

  draw() {
    const g = this.g, E = this.engine, ac = E.ac;
    g.clearRect(0, 0, W, H);
    g.font = '12px ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = 'top';
    // ---- header
    g.fillStyle = '#ffffff'; g.font = 'bold 14px ui-monospace, Menlo, Consolas, monospace';
    g.fillText('AUDIO  ·  synthesised savannah', 0, 0);
    g.font = '12px ui-monospace, Menlo, Consolas, monospace';
    const st = ac ? ac.state : (E.state === 'unavailable' ? 'unavailable' : 'no context');
    const running = st === 'running';
    const badge = running ? 'RUNNING' : st === 'suspended' ? 'SUSPENDED — click to start' : st.toUpperCase();
    g.fillStyle = running ? '#5fe08a' : '#ffb347';
    const bw = g.measureText(badge).width + 14;
    g.fillRect(W - bw, 0, bw, 18);
    g.fillStyle = '#0b0f14'; g.fillText(badge, W - bw + 7, 3);
    // ---- environment readout
    const e = E.env, w = this.ctx.world;
    g.fillStyle = '#9fb3c8';
    const tgt = this.ctx.rig.target;
    g.fillText(`time ${w.time.hour.toFixed(1)} h (${periodLabel(w.time.hour)})   wind ${e.windSpeed.toFixed(1)} m/s   rain ${e.rain.toFixed(2)}   cloud ${e.cloud.toFixed(2)}   water ${e.water.toFixed(2)}${E.hint.storm ? '   STORM' : ''}`, 0, 24);
    const L = E.listener;
    g.fillText(`target (${tgt.x.toFixed(0)}, ${tgt.z.toFixed(0)})   ear (${L ? L.x.toFixed(0) : '-'}, ${L ? L.y.toFixed(0) : '-'}, ${L ? L.z.toFixed(0) : '-'})   voices ${E.stats.voices}   played ${E.stats.played}   sr ${ac ? ac.sampleRate : '-'}   ctx ${ac ? ac.currentTime.toFixed(1) : '-'} s   gust ${E.ambience ? E.ambience.gust.toFixed(2) : '-'}   lookahead ${E.lookahead.toFixed(1)} s`, 0, 40);
    // ---- bus meters
    let y = 64;
    g.fillStyle = '#6b7c8f'; g.fillText('bus meters (rms dBFS, peak hold)', 0, y); y += 18;
    const lv = E.buses ? E.buses.levels : null, pk = E.buses ? E.buses.peaks : null;
    for (let i = 0; i < BUS_NAMES.length; i++) {
      const name = BUS_NAMES[i];
      const db = lv ? lv[i] : -90, p = pk ? pk[i] : -90;
      g.fillStyle = BUS_COLORS[name]; g.fillText(name, 0, y + 3);
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(BAR_X0, y, BAR_X1 - BAR_X0, 16);
      const frac = clamp01((db - DB_MIN) / -DB_MIN);
      const grad = g.createLinearGradient(BAR_X0, 0, BAR_X1, 0);
      grad.addColorStop(0, '#2ecc71'); grad.addColorStop(0.7, '#f1c40f'); grad.addColorStop(1, '#e74c3c');
      g.fillStyle = grad; g.fillRect(BAR_X0, y, (BAR_X1 - BAR_X0) * frac, 16);
      const pf = clamp01((p - DB_MIN) / -DB_MIN);
      g.fillStyle = '#ffffff'; g.fillRect(BAR_X0 + (BAR_X1 - BAR_X0) * pf - 1, y, 2, 16);
      g.fillStyle = '#dfe6ec'; g.fillText((db <= -89 ? '  -inf' : db.toFixed(1).padStart(6)) + ' dB', BAR_X1 + 8, y + 3);
      // volume tick
      const vol = E.buses ? E.buses.getVolume(name) : 0;
      g.fillStyle = '#6b7c8f'; g.fillText(`×${vol.toFixed(2)}`, BAR_X0 - 40, y + 3);
      y += 22;
    }
    // ---- spectrum
    y += 6;
    g.fillStyle = '#6b7c8f'; g.fillText('master spectrum  40 Hz – 16 kHz (log)', 0, y); y += 16;
    const SH = 96;
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y, W, SH);
    if (E.buses && ac) {
      const spec = E.buses.spectrum, bw = ac.sampleRate / (2 * spec.length);
      const barW = W / SPEC_BARS;
      for (let i = 0; i < SPEC_BARS; i++) {
        const f0 = SPEC_F0 * Math.pow(SPEC_F1 / SPEC_F0, i / SPEC_BARS), f1 = SPEC_F0 * Math.pow(SPEC_F1 / SPEC_F0, (i + 1) / SPEC_BARS);
        let b0 = Math.floor(f0 / bw), b1 = Math.max(b0 + 1, Math.floor(f1 / bw));
        if (b1 > spec.length) b1 = spec.length;
        let m = 0; for (let b = b0; b < b1; b++) if (spec[b] > m) m = spec[b];
        const h = (m / 255) * SH;
        g.fillStyle = `hsl(${190 - (i / SPEC_BARS) * 150}, 80%, ${45 + (m / 255) * 25}%)`;
        g.fillRect(i * barW + 0.5, y + SH - h, barW - 1, h);
      }
    }
    g.fillStyle = '#9fb3c8';
    for (const [f, label] of [[100, '100 Hz'], [1000, '1 kHz'], [10000, '10 kHz']]) {
      const x = (Math.log(f / SPEC_F0) / Math.log(SPEC_F1 / SPEC_F0)) * W;
      g.fillRect(x, y, 1, SH + 4); g.fillText(label, x + 3, y + SH + 2);
    }
    y += SH + 20;
    // ---- ambience layer mix
    g.fillStyle = '#6b7c8f'; g.fillText('ambience layer mix (smoothed level 0–1)', 0, y); y += 16;
    const LH = 64, colW = W / LAYER_NAMES.length;
    const layers = E.ambience ? E.ambience.levels : null;
    for (let i = 0; i < LAYER_NAMES.length; i++) {
      const v = layers ? clamp01(layers[i]) : 0;
      const x = i * colW + 8, bwid = colW - 16;
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, y, bwid, LH);
      g.fillStyle = LAYER_COLORS[i]; g.fillRect(x, y + LH - LH * v, bwid, LH * v);
      g.fillStyle = '#dfe6ec'; g.fillText(LAYER_NAMES[i], x, y + LH + 4);
      g.fillStyle = '#9fb3c8'; g.fillText(v.toFixed(2), x, y + LH + 18);
    }
    y += LH + 36;
    // ---- event log
    g.fillStyle = '#6b7c8f'; g.fillText('last triggered sounds (newest first)', 0, y); y += 16;
    const n = Math.min(E.eventCount, 9), now = ac ? ac.currentTime : 0;
    if (n === 0) { g.fillStyle = '#9fb3c8'; g.fillText(running ? 'waiting for the first event…' : 'audio context not running — click the panel or the canvas', 0, y); }
    for (let i = 0; i < n; i++) {
      const ev = E.events[(E.eventHead - 1 - i + E.events.length) % E.events.length];
      g.fillStyle = i === 0 ? '#ffffff' : '#c7d2dc';
      const pos = ev.bus === 'ui' ? '      (non-spatial)' : `x ${ev.x.toFixed(0).padStart(5)}  z ${ev.z.toFixed(0).padStart(5)}  ${ev.dist.toFixed(0).padStart(4)} m`;
      const rel = now - ev.t;
      const when = rel >= 0 ? `${rel.toFixed(1).padStart(6)} s ago` : `in ${(-rel).toFixed(1).padStart(4)} s  `;
      g.fillText(`${when}  ${ev.sound.padEnd(16)} ${pos}   ${ev.bus}`, 0, y);
      y += 15;
    }
  }

  dispose() { clearInterval(this.timer); this.el.remove(); }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function periodLabel(h) { return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 19.5 ? 'dusk' : 'night'; }
