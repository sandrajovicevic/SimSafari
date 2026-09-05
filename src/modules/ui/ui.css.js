// The whole UI stylesheet as a string; index.js injects it as one <style id="sf-ui-style">.
// Design language: restrained dark translucent panels, 8 px rhythm, crisp sans, amber accent (savannah sun).

export const CSS = `
#ui-root > .sf { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.sf {
  --bg: rgba(15, 19, 25, 0.86);
  --bg-2: rgba(24, 29, 37, 0.94);
  --bg-3: rgba(255, 255, 255, 0.05);
  --bg-hover: rgba(255, 255, 255, 0.09);
  --bg-active: rgba(255, 255, 255, 0.13);
  --line: rgba(255, 255, 255, 0.08);
  --line-2: rgba(255, 255, 255, 0.16);
  --text: #e9edf2;
  --muted: #9aa5b3;
  --dim: #6d7885;
  --accent: #f0b13c;
  --accent-2: #ffd47a;
  --accent-ink: #1c1406;
  --good: #62cf7e;
  --bad: #f06a5a;
  --info: #5db3f0;
  --warn: #f0b13c;
  --water: #4c97d6;
  --shadow: 0 10px 28px rgba(0, 0, 0, 0.42), 0 1px 0 rgba(255, 255, 255, 0.05) inset;
  --r: 8px; --r-s: 6px;
  font: 13px/1.35 "Segoe UI", Roboto, "Helvetica Neue", "Liberation Sans", Arial, system-ui, sans-serif;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  user-select: none;
  font-variant-numeric: tabular-nums;
}
.sf * { box-sizing: border-box; }
.sf .pe { pointer-events: auto; }
.sf.hidden { display: none; }
.sf .ic { display: inline-flex; width: 18px; height: 18px; flex: 0 0 auto; vertical-align: middle; }
.sf .ic svg { width: 100%; height: 100%; display: block; }
.sf .ic.lg { width: 24px; height: 24px; }
.sf .ic.xl { width: 30px; height: 30px; }
.sf .ic.sm { width: 14px; height: 14px; }
.sf .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace; }
.sf .muted { color: var(--muted); }
.sf .good { color: var(--good); } .sf .bad { color: var(--bad); } .sf .accent { color: var(--accent); }

/* panels */
.sf .panel {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
}

/* keycap */
.sf .key {
  display: inline-block; min-width: 18px; padding: 1px 5px; margin-left: 6px;
  font: 600 10px/14px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  color: var(--muted); text-align: center; text-transform: uppercase; letter-spacing: 0.02em;
  background: rgba(255,255,255,0.06); border: 1px solid var(--line-2); border-bottom-width: 2px; border-radius: 4px;
}

/* buttons */
.sf .btn {
  display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
  font: inherit; font-weight: 500; color: var(--text); background: var(--bg-3);
  border: 1px solid var(--line); border-radius: var(--r-s); cursor: pointer; white-space: nowrap;
  transition: background 0.12s, border-color 0.12s, transform 0.08s;
}
.sf .btn:hover { background: var(--bg-hover); border-color: var(--line-2); }
.sf .btn:active { background: var(--bg-active); transform: translateY(1px); }
.sf .btn.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
.sf .btn.primary:hover { background: var(--accent-2); }
.sf .btn.icon { width: 30px; padding: 0; justify-content: center; }
.sf .btn.ghost { background: transparent; border-color: transparent; }
.sf .btn.ghost:hover { background: var(--bg-hover); }
.sf .btn.danger:hover { border-color: var(--bad); color: var(--bad); }
.sf .btn[disabled] { opacity: 0.45; cursor: default; pointer-events: none; }

/* ---------- top bar ---------- */
.sf .topbar {
  position: absolute; top: 0; left: 0; right: 0; height: 46px;
  display: flex; align-items: stretch;
  background: linear-gradient(180deg, rgba(14,18,24,0.94), rgba(14,18,24,0.86));
  border-bottom: 1px solid var(--line);
  box-shadow: 0 4px 18px rgba(0,0,0,0.35);
  backdrop-filter: blur(12px) saturate(1.2); -webkit-backdrop-filter: blur(12px) saturate(1.2);
}
.sf .topbar::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: rgba(255,255,255,0.06); }
.sf .tb-seg { display: flex; align-items: center; gap: 8px; padding: 0 14px; border-right: 1px solid var(--line); position: relative; }
.sf .tb-seg.grow { flex: 1; border-right: 0; justify-content: center; }
.sf .tb-seg.end { border-right: 0; border-left: 1px solid var(--line); }
.sf .tb-seg.clickable { cursor: pointer; transition: background 0.12s; }
.sf .tb-seg.clickable:hover { background: var(--bg-hover); }
.sf .tb-seg.clickable:active { background: var(--bg-active); }
.sf .park { font-weight: 650; font-size: 14px; letter-spacing: 0.01em; display: flex; align-items: center; gap: 9px; }
.sf .park .logo {
  width: 26px; height: 26px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center;
  background: linear-gradient(145deg, #f2b23e, #c8781e); color: #2a1a05; box-shadow: 0 1px 0 rgba(255,255,255,0.25) inset;
}
.sf .park .sub { font-size: 10.5px; font-weight: 500; color: var(--muted); letter-spacing: 0.06em; text-transform: uppercase; display: block; line-height: 1.1; }
.sf .park .name { display: block; line-height: 1.15; }
.sf .cash { display: flex; align-items: center; gap: 8px; }
.sf .cash .ic { color: var(--accent); }
.sf .cash .val { font-size: 16px; font-weight: 650; letter-spacing: 0.01em; min-width: 92px; }
.sf .cash .val.neg { color: var(--bad); }
.sf .delta { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: rgba(98,207,126,0.14); color: var(--good); display: inline-flex; align-items: center; gap: 3px; }
.sf .delta.neg { background: rgba(240,106,90,0.16); color: var(--bad); }
.sf .delta .ic { width: 13px; height: 13px; }
.sf .stat { display: flex; align-items: center; gap: 7px; }
.sf .stat .ic { color: var(--muted); }
.sf .stat .v { font-weight: 600; font-size: 13.5px; }
.sf .stat .l { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; line-height: 1; margin-top: 2px; display: block; }
.sf .stat .col { display: flex; flex-direction: column; line-height: 1.15; }
.sf .stars { display: inline-flex; gap: 1px; }
.sf .stars .ic { width: 15px; height: 15px; color: rgba(255,255,255,0.18); }
.sf .stars .ic.on { color: var(--accent); }
.sf .stars .ic.half { color: var(--accent); opacity: 0.55; }
.sf .clock { display: flex; align-items: center; gap: 12px; }
.sf .clock .time { font-size: 17px; font-weight: 650; letter-spacing: 0.02em; }
.sf .clock .day { font-weight: 600; }
.sf .clock .season { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; display: block; line-height: 1.1; }
.sf .clock .col { display: flex; flex-direction: column; line-height: 1.15; }
.sf .clock .ic { color: var(--muted); }
.sf .speed { display: inline-flex; padding: 3px; gap: 2px; background: rgba(0,0,0,0.3); border: 1px solid var(--line); border-radius: 7px; }
.sf .speed button {
  width: 30px; height: 26px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; transition: background 0.12s, color 0.12s;
}
.sf .speed button:hover { background: var(--bg-hover); color: var(--text); }
.sf .speed button.on { background: var(--accent); color: var(--accent-ink); }
.sf .speed button.on.pause { background: var(--bad); color: #fff; }
.sf .speed button .ic { width: 16px; height: 16px; }
.sf .weather { display: flex; align-items: center; gap: 8px; }
.sf .weather .ic { color: var(--accent-2); width: 22px; height: 22px; }
.sf .weather .ic.night { color: #b9c9e6; }
.sf .weather .ic.rain { color: #8cc4f2; }
.sf .weather .ic.cloud { color: #c5ced9; }
.sf .weather .t { font-weight: 600; }
.sf .weather .w { font-size: 11px; color: var(--muted); display: block; line-height: 1.1; }
.sf .tb-btns { display: flex; gap: 4px; }
.sf .tb-btns .btn { height: 30px; }
.sf .satbar { width: 54px; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.12); overflow: hidden; margin-top: 3px; }
.sf .satbar i { display: block; height: 100%; border-radius: 3px; background: var(--good); }

/* ---------- toolbar ---------- */
.sf .toolbar { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.sf .tb-items { width: max-content; max-width: 1180px; padding: 10px 10px 10px; animation: sf-rise 0.16s ease-out; }
.sf .tb-items-h { display: flex; align-items: center; gap: 8px; padding: 0 4px 8px; }
.sf .tb-items-h .title { font-weight: 650; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.sf .tb-items-h .title .ic { color: var(--accent); }
.sf .tb-items-h .hint { color: var(--muted); font-size: 12px; margin-left: 6px; }
.sf .tb-items-h .sp { flex: 1; }
.sf .cards { display: flex; flex-wrap: wrap; gap: 6px; }
.sf .card {
  width: 108px; height: 104px; padding: 12px 6px 8px; display: flex; flex-direction: column; align-items: center; gap: 3px;
  background: var(--bg-3); border: 1px solid var(--line); border-radius: var(--r-s); cursor: pointer; position: relative;
  transition: background 0.12s, border-color 0.12s, transform 0.08s;
}
.sf .card:hover { background: var(--bg-hover); border-color: var(--line-2); transform: translateY(-1px); }
.sf .card:active { transform: translateY(0); }
.sf .card.on { background: rgba(240,177,60,0.14); border-color: var(--accent); box-shadow: 0 0 0 1px rgba(240,177,60,0.35) inset; }
.sf .card.on .card-ic { color: var(--accent); }
.sf .card-ic { width: 40px; height: 40px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); color: #d9e0e8; }
.sf .card-ic .ic { width: 26px; height: 26px; }
.sf .card-n { font-size: 11.5px; font-weight: 600; text-align: center; line-height: 1.15; height: 27px; display: flex; align-items: center; overflow: hidden; }
.sf .card-c { font-size: 11px; color: var(--muted); margin-top: auto; }
.sf .card-c.free { color: var(--good); }
.sf .card .key { position: absolute; top: 5px; right: 5px; margin: 0; padding: 0 4px; min-width: 16px; font-size: 9px; line-height: 13px; opacity: 0.85; }
.sf .card .tag { position: absolute; top: 6px; left: 6px; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; padding: 1px 5px; border-radius: 3px; background: rgba(93,179,240,0.2); color: var(--info); text-transform: uppercase; }
.sf .card .tag.warn { background: rgba(240,177,60,0.22); color: var(--accent-2); }
.sf .tb-cats { display: flex; align-items: stretch; padding: 5px; gap: 3px; }
.sf .cat {
  width: 86px; height: 60px; padding: 6px 4px 5px; border: 1px solid transparent; border-radius: var(--r-s); background: transparent; color: var(--muted);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; position: relative; font: inherit;
  transition: background 0.12s, color 0.12s;
}
.sf .cat:hover { background: var(--bg-hover); color: var(--text); }
.sf .cat.on { background: rgba(240,177,60,0.14); border-color: rgba(240,177,60,0.6); color: var(--text); }
.sf .cat.on .ic { color: var(--accent); }
.sf .cat .ic { width: 24px; height: 24px; }
.sf .cat .cl { font-size: 11px; font-weight: 600; letter-spacing: 0.01em; }
.sf .cat .key { position: absolute; top: 4px; right: 4px; margin: 0; padding: 0 4px; min-width: 15px; font-size: 9px; line-height: 13px; }
.sf .cat.sep { width: 1px; padding: 0; margin: 6px 3px; background: var(--line); pointer-events: none; }
.sf .cat.small { width: 56px; }
.sf .cat.active-tool::after { content: ""; position: absolute; left: 24px; right: 24px; bottom: 3px; height: 2px; border-radius: 1px; background: var(--accent); }

/* ---------- side panel ---------- */
.sf .side { position: absolute; right: 12px; top: 58px; width: 344px; max-height: calc(100% - 70px); display: flex; flex-direction: column; animation: sf-slide 0.18s ease-out; }
.sf .side-h { display: flex; align-items: center; gap: 10px; padding: 12px 12px 10px; border-bottom: 1px solid var(--line); }
.sf .side-h .ico { width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: rgba(240,177,60,0.16); color: var(--accent); }
.sf .side-h .ico .ic { width: 24px; height: 24px; }
.sf .side-h .t { flex: 1; min-width: 0; }
.sf .side-h .t b { display: block; font-size: 15px; font-weight: 650; }
.sf .side-h .t i { display: block; font-style: normal; font-size: 11.5px; color: var(--muted); margin-top: 1px; }
.sf .side-b { overflow: auto; padding: 4px 12px 12px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
.sf .side-b::-webkit-scrollbar { width: 8px; } .sf .side-b::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 4px; }
.sf .sec { padding: 10px 0 4px; }
.sf .sec + .sec { border-top: 1px solid var(--line); }
.sf .sec-h { font-size: 10.5px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.sf .sec-h .sp { flex: 1; }
.sf .sec-h .ic { width: 13px; height: 13px; }
.sf .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.08); color: var(--text); }
.sf .chip.good { background: rgba(98,207,126,0.16); color: var(--good); }
.sf .chip.bad { background: rgba(240,106,90,0.18); color: var(--bad); }
.sf .chip.warn { background: rgba(240,177,60,0.18); color: var(--accent-2); }
.sf .chip.info { background: rgba(93,179,240,0.18); color: var(--info); }
.sf .happy { display: flex; align-items: center; gap: 14px; }
.sf .ring { width: 74px; height: 74px; position: relative; flex: 0 0 auto; }
.sf .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.sf .ring .v { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 700; font-size: 17px; line-height: 1; }
.sf .ring .v small { font-size: 9px; color: var(--muted); font-weight: 600; letter-spacing: 0.06em; margin-top: 3px; }
.sf .happy .txt { flex: 1; font-size: 12px; color: var(--muted); line-height: 1.4; }
.sf .happy .txt b { color: var(--text); font-weight: 600; display: block; font-size: 13px; margin-bottom: 3px; }
.sf .bar-row { display: grid; grid-template-columns: 18px 64px 1fr 36px; align-items: center; gap: 8px; padding: 3px 0; }
.sf .bar-row .ic { color: var(--muted); width: 16px; height: 16px; }
.sf .bar-row .lab { font-size: 12px; }
.sf .bar-row .val { font-size: 11.5px; text-align: right; color: var(--muted); font-weight: 600; }
.sf .bar { height: 7px; border-radius: 4px; background: rgba(255,255,255,0.1); overflow: hidden; position: relative; }
.sf .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: var(--good); transition: width 0.3s; }
.sf .bar i.thin { opacity: 0.85; }
.sf .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
.sf .fact { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: rgba(255,255,255,0.04); border-radius: var(--r-s); min-width: 0; }
.sf .fact .ic { color: var(--muted); width: 16px; height: 16px; }
.sf .fact .k { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.1; }
.sf .fact .v { font-size: 12.5px; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf .fact .col { min-width: 0; }
.sf .desc { font-size: 12px; color: var(--muted); line-height: 1.45; }
.sf .actions { display: flex; gap: 6px; padding-top: 10px; }
.sf .actions .btn { flex: 1; justify-content: center; }
.sf .kv { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12.5px; }
.sf .kv b { font-weight: 600; }
.sf .kv + .kv { border-top: 1px solid rgba(255,255,255,0.04); }

/* ---------- toasts ---------- */
.sf .toasts { position: absolute; left: 12px; top: 58px; width: 340px; display: flex; flex-direction: column; gap: 6px; }
.sf .toast { display: flex; align-items: flex-start; gap: 10px; padding: 9px 10px 9px 12px; cursor: default; animation: sf-slide-l 0.2s ease-out; position: relative; overflow: hidden; }
.sf .toast::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--info); }
.sf .toast.warn::before { background: var(--warn); } .sf .toast.error::before { background: var(--bad); } .sf .toast.good::before { background: var(--good); }
.sf .toast .ic { color: var(--info); margin-top: 1px; width: 18px; height: 18px; }
.sf .toast.warn .ic { color: var(--warn); } .sf .toast.error .ic { color: var(--bad); } .sf .toast.good .ic { color: var(--good); }
.sf .toast .tx { flex: 1; font-size: 12.5px; line-height: 1.35; }
.sf .toast .tx small { display: block; color: var(--muted); font-size: 11px; margin-top: 2px; }
.sf .toast .x { width: 20px; height: 20px; border: 0; background: transparent; color: var(--muted); cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.sf .toast .x:hover { background: var(--bg-hover); color: var(--text); }
.sf .toast .x .ic { width: 14px; height: 14px; color: inherit; margin: 0; }
.sf .toast.focus { cursor: pointer; }
.sf .toast.focus:hover { background: var(--bg-2); }
.sf .toast.out { animation: sf-out 0.25s ease-in forwards; }

/* ---------- modal ---------- */
.sf .backdrop { position: absolute; inset: 0; background: rgba(4, 7, 12, 0.45); display: flex; align-items: center; justify-content: center; animation: sf-fade 0.15s ease-out; }
.sf .modal { width: 820px; max-width: calc(100% - 40px); max-height: calc(100% - 80px); display: flex; flex-direction: column; animation: sf-rise 0.18s ease-out; }
.sf .modal-h { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.sf .modal-h .ico { width: 36px; height: 36px; border-radius: 9px; background: rgba(240,177,60,0.16); color: var(--accent); display: inline-flex; align-items: center; justify-content: center; }
.sf .modal-h .ico .ic { width: 22px; height: 22px; }
.sf .modal-h .t { flex: 1; }
.sf .modal-h .t b { display: block; font-size: 16px; font-weight: 650; }
.sf .modal-h .t i { display: block; font-style: normal; color: var(--muted); font-size: 12px; margin-top: 1px; }
.sf .modal-b { padding: 14px 16px; overflow: auto; scrollbar-width: thin; }
.sf .modal-f { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); }
.sf .modal-f .sp { flex: 1; }
.sf .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.sf .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sf .tile { padding: 10px 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: var(--r-s); }
.sf .tile .th { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
.sf .tile .th .ic { width: 13px; height: 13px; }
.sf .tile .tv { display: flex; align-items: baseline; gap: 8px; margin: 4px 0 6px; }
.sf .tile .tv b { font-size: 20px; font-weight: 700; letter-spacing: 0.01em; }
.sf .tile canvas { display: block; width: 100%; height: 64px; }
.sf .tile .sub { font-size: 11px; color: var(--muted); display: flex; justify-content: space-between; margin-top: 4px; }
.sf .rows .kv { padding: 5px 0; }
.sf .rows .kv.total { border-top: 1px solid var(--line-2); margin-top: 4px; padding-top: 8px; font-weight: 650; }
.sf .tile h4 { margin: 0 0 6px; font-size: 12.5px; font-weight: 650; display: flex; align-items: center; gap: 6px; }
.sf .tile h4 .ic { color: var(--accent); width: 15px; height: 15px; }
.sf .pop { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; }
.sf .pop .bar-row { grid-template-columns: 128px 1fr 30px 34px; }
.sf .pop .bar-row .lab { font-size: 12px; display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; }
.sf .pop .bar-row .lab .ic { color: var(--muted); width: 18px; height: 18px; }
.sf .pop .bar-row .n { font-size: 12px; font-weight: 600; text-align: right; }
.sf .events { display: flex; flex-direction: column; gap: 4px; }
.sf .ev { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 5px 8px; border-radius: var(--r-s); background: rgba(255,255,255,0.04); }
.sf .ev .ic { width: 15px; height: 15px; color: var(--info); }
.sf .ev.warn .ic { color: var(--warn); } .sf .ev.error .ic { color: var(--bad); } .sf .ev.good .ic { color: var(--good); }
.sf .ev .when { margin-left: auto; color: var(--dim); font-size: 11px; }
.sf .gauge { display: flex; align-items: center; gap: 12px; }
.sf .gauge .ring { width: 58px; height: 58px; }
.sf .gauge .ring .v { font-size: 14px; }
.sf .checkbox { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; cursor: pointer; color: var(--muted); }
.sf .checkbox input { accent-color: var(--accent); width: 14px; height: 14px; margin: 0; }
.sf .checkbox:hover { color: var(--text); }

/* settings */
.sf .modal.settings { width: 560px; }
.sf .set-row { display: grid; grid-template-columns: 170px 1fr; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); }
.sf .set-row:last-child { border-bottom: 0; }
.sf .set-row .k { font-weight: 600; font-size: 13px; }
.sf .set-row .k small { display: block; color: var(--muted); font-weight: 400; font-size: 11.5px; margin-top: 1px; }
.sf .seg { display: inline-flex; padding: 3px; gap: 2px; background: rgba(0,0,0,0.3); border: 1px solid var(--line); border-radius: 7px; }
.sf .seg button { height: 26px; padding: 0 14px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-weight: 600; font-size: 12px; }
.sf .seg button:hover { background: var(--bg-hover); color: var(--text); }
.sf .seg button.on { background: var(--accent); color: var(--accent-ink); }
.sf .slider { display: flex; align-items: center; gap: 10px; }
.sf .slider input { flex: 1; accent-color: var(--accent); }
.sf .slider .v { width: 40px; text-align: right; font-weight: 600; font-size: 12px; }
.sf .keys { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; font-size: 12px; color: var(--muted); }
.sf .keys div { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; }
.sf .keys .key { margin: 0; }

/* ---------- minimap ---------- */
.sf .minimap { position: absolute; left: 12px; bottom: 12px; width: 216px; padding: 7px; }
.sf .minimap canvas { display: block; width: 200px; height: 200px; border-radius: 5px; cursor: crosshair; background: #1a2027; }
.sf .minimap .mm-h { display: flex; align-items: center; justify-content: space-between; padding: 0 2px 6px; font-size: 10.5px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
.sf .minimap .mm-h .ic { width: 13px; height: 13px; }
.sf .minimap .coord { font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--dim); }
.sf .minimap .n { position: absolute; left: 50%; top: 27px; transform: translateX(-50%); font: 700 10px/1 ui-monospace, monospace; color: rgba(255,255,255,0.7); pointer-events: none; text-shadow: 0 1px 2px #000; }

/* ---------- misc ---------- */
.sf .fps { position: absolute; right: 12px; top: 54px; padding: 4px 8px; font-size: 11px; color: var(--muted); }
.sf .fps b { color: var(--text); }
.sf .tooltip {
  position: absolute; z-index: 20; max-width: 280px; padding: 7px 10px; pointer-events: none;
  background: rgba(10, 13, 18, 0.96); border: 1px solid var(--line-2); border-radius: var(--r-s); box-shadow: 0 6px 18px rgba(0,0,0,0.45);
  font-size: 12px; line-height: 1.35; color: var(--text); opacity: 0; transition: opacity 0.1s;
}
.sf .tooltip.show { opacity: 1; }
.sf .tooltip .key { margin-left: 8px; }
.sf .tooltip small { display: block; color: var(--muted); margin-top: 2px; }
.sf .active-tool-pill { padding: 5px 10px 5px 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; animation: sf-rise 0.16s ease-out; }
.sf .active-tool-pill[hidden] { display: none; }
.sf .active-tool-pill .ic { color: var(--accent); width: 16px; height: 16px; }
.sf .active-tool-pill .muted { font-weight: 500; }
.sf .gameover { position: absolute; inset: 0; background: rgba(4,7,12,0.7); display: flex; align-items: center; justify-content: center; }
.sf .gameover .panel { width: 480px; padding: 24px; text-align: center; }
.sf .gameover h2 { margin: 0 0 8px; font-size: 22px; }

@keyframes sf-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes sf-slide { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
@keyframes sf-slide-l { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
@keyframes sf-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sf-out { to { opacity: 0; transform: translateX(-16px); } }
`;
