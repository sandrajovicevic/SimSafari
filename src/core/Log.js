// Captures console errors/warnings and uncaught exceptions into arrays the screenshot tool reads.

const MAX = 200;

export class Log {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.infos = [];
    this._orig = { error: console.error, warn: console.warn };
    const self = this;
    console.error = function (...args) { self._record('error', 'console', args); self._orig.error.apply(console, args); };
    console.warn = function (...args) { self._record('warning', 'console', args); self._orig.warn.apply(console, args); };
    window.addEventListener('error', (e) => this._record('error', 'window', [e.message, e.filename, e.lineno]));
    window.addEventListener('unhandledrejection', (e) => this._record('error', 'promise', [e.reason?.message || String(e.reason)]));
  }

  _fmt(args) {
    return args.map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
  }

  _record(level, source, args) {
    const text = this._fmt(args);
    const entry = { level, source, text: text.slice(0, 2000), t: performance.now() / 1000 };
    const arr = level === 'error' ? this.errors : level === 'warning' ? this.warnings : this.infos;
    if (arr.length < MAX) arr.push(entry);
    else if (arr.length === MAX) arr.push({ level, source: 'log', text: '…truncated', t: entry.t });
  }

  info(...a) { this._record('info', 'core', a); }
  warn(...a) { console.warn(...a); }
  error(...a) { console.error(...a); }

  /** Module-scoped logger; errors are tagged and counted per module. */
  scope(id, onError) {
    const tag = `[${id}]`;
    return {
      id,
      info: (...a) => this._record('info', id, [tag, ...a]),
      warn: (...a) => console.warn(tag, ...a),
      error: (...a) => { onError?.(a); console.error(tag, ...a); },
    };
  }

  clear() { this.errors.length = 0; this.warnings.length = 0; this.infos.length = 0; }
}
