// Inline SVG icon set (24×24 grid, stroke-based, currentColor). Drawn by hand — no image files, no emoji.

const P = {
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2v9.6M9.6 9.6h3.6a1.6 1.6 0 0 1 0 3.2h-2.4a1.6 1.6 0 0 0 0 3.2H14.4"/>',
  visitors: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.4a3 3 0 0 1 0 5.2M20.5 19a5.5 5.5 0 0 0-3.7-5.2"/>',
  star: '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
  starFill: '<path fill="currentColor" stroke="none" d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  cloud: '<path d="M7 18.5h9.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 5.6 12.3 3.2 3.2 0 0 0 7 18.5z"/>',
  rain: '<path d="M7 15.5h9.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 5.6 9.3 3.2 3.2 0 0 0 7 15.5z"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
  moon: '<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z"/>',
  wind: '<path d="M3.5 9h10a2.5 2.5 0 1 0-2.5-2.5M3.5 13h14a2.5 2.5 0 1 1-2.5 2.5M3.5 17h7a2 2 0 1 1-2 2"/>',
  thermo: '<path d="M10 4.5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0z"/><path d="M12 10v6"/>',
  pause: '<path d="M8 6v12M16 6v12" stroke-width="2.4"/>',
  play: '<path fill="currentColor" stroke="none" d="M7.5 5.5v13l10-6.5z"/>',
  fast: '<path fill="currentColor" stroke="none" d="M4 6v12l7.5-6zM12.5 6v12l7.5-6z"/>',
  faster: '<path fill="currentColor" stroke="none" d="M2.5 7v10l5.5-5zM9 7v10l5.5-5zM15.5 7v10l5.5-5z"/>',
  select: '<path d="M6 4.5l12 8-5.2 1.3L10 19.5z"/>',
  raise: '<path d="M3 19c3-5 5-8 8-8s5 3 10 8"/><path d="M15 8h6M18 5v6" stroke-width="2"/>',
  lower: '<path d="M3 19c3-5 5-8 8-8s5 3 10 8"/><path d="M15 6.5h6" stroke-width="2"/>',
  flatten: '<path d="M3.5 19h17"/><path d="M5 19c2-6 4-10 7-10s5 4 7 10"/><path d="M5.5 13h13" stroke-dasharray="2 2"/>',
  smooth: '<path d="M3 15c2-4 4-6 6-6s3 3 5 3 3-5 7-5"/><path d="M3 19.5h18"/>',
  paint: '<path d="M14.5 4.5l5 5-7.5 7.5-5-5z"/><path d="M8.5 13.5L5 17a2.1 2.1 0 1 0 3 3l3.5-3.5"/>',
  road: '<path d="M8 20l2.5-16M16 20l-2.5-16"/><path d="M12 6v2.5M12 11v2.5M12 16v2.5"/>',
  roadDirt: '<path d="M8 20l2.5-16M16 20l-2.5-16"/><circle cx="12" cy="8" r=".6" fill="currentColor"/><circle cx="12" cy="12" r=".6" fill="currentColor"/><circle cx="12" cy="16" r=".6" fill="currentColor"/>',
  roadGravel: '<path d="M8 20l2.5-16M16 20l-2.5-16"/><path d="M11 8h2M10.7 12h2.6M10.4 16h3.2" stroke-dasharray="1 1.4"/>',
  roadPaved: '<path d="M8 20l2.5-16M16 20l-2.5-16"/><path d="M12 6v2.5M12 11v2.5M12 16v2.5" stroke-width="2"/>',
  bulldoze: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  zone: '<rect x="4" y="4" width="16" height="16" rx="1.5" stroke-dasharray="3 2.2"/><path d="M8.5 12h7M12 8.5v7"/>',
  habitat: '<path d="M5 19c0-8 4-13 14-14-1 10-6 14-14 14z"/><path d="M5 19c4-5 7-8 10-10"/>',
  visitorZone: '<circle cx="12" cy="7.5" r="3"/><path d="M6 20a6 6 0 0 1 12 0"/><path d="M3.5 3.5h17v17h-17z" stroke-dasharray="3 2.2"/>',
  service: '<path d="M14.5 6.5a4 4 0 0 0-5 5L4 17a1.8 1.8 0 1 0 2.5 2.5l5.5-5.5a4 4 0 0 0 5-5l-2.4 2.4-2.6-2.6z"/>',
  erase: '<path d="M4 15l8-8 6 6-5 5H8.5z"/><path d="M13 20h7M9.5 9.5l6 6"/>',
  building: '<path d="M3.5 20.5h17M5.5 20.5V10l6.5-5.5L18.5 10v10.5"/><path d="M10 20.5v-5h4v5M9 12h2M13 12h2"/>',
  lodge: '<path d="M3 11l9-6.5L21 11"/><path d="M5.5 10v10.5h13V10"/><path d="M9 20.5v-6h6v6M8 9.5h8"/>',
  gate: '<path d="M4 20.5V8a8 8 0 0 1 16 0v12.5"/><path d="M8 20.5V11a4 4 0 0 1 8 0v9.5M12 11v9.5"/>',
  hide: '<path d="M3.5 20l8.5-15 8.5 15z"/><path d="M12 20v-6M9.5 20l2.5-6 2.5 6"/>',
  water: '<path d="M3 10c2 0 2-1.5 4.5-1.5S10 10 12 10s2-1.5 4.5-1.5S19 10 21 10M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2-1.5 4.5-1.5S19 15 21 15"/>',
  ranger: '<path d="M6 20.5V4"/><path d="M6 5h12l-3 3.5 3 3.5H6"/>',
  shop: '<path d="M4 9l1.5-4.5h13L20 9"/><path d="M4 9a2.6 2.6 0 0 0 5.3 0 2.6 2.6 0 0 0 5.4 0 2.6 2.6 0 0 0 5.3 0"/><path d="M5.5 11.5v9h13v-9M10 20.5v-5h4v5"/>',
  viewpoint: '<path d="M4 20.5h16M7 20.5V9l5-4 5 4v11.5"/><path d="M9.5 12h5M9.5 15.5h5"/>',
  fence: '<path d="M5 8v12M12 8v12M19 8v12M5 8l1.2-3 1.3 3M12 8l1.2-3 1.3 3M19 8l1.2-3 1.3 3M4 12h16M4 17h16"/>',
  paw: '<circle cx="8" cy="8" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="5" cy="12.5" r="1.6"/><circle cx="19" cy="12.5" r="1.6"/><path d="M12 11.5c3 0 5.5 2.6 5.5 5.2 0 1.5-1 2.3-2.3 2.3-1.2 0-2.1-.8-3.2-.8s-2 .8-3.2.8C7.5 19 6.5 18.2 6.5 16.7c0-2.6 2.5-5.2 5.5-5.2z"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  layers: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5"/>',
  heat: '<path d="M12 3.5c-3 4-6 6.5-6 10.5a6 6 0 0 0 12 0c0-4-3-6.5-6-10.5z"/><path d="M12 12.5c-1.2 1.6-2.4 2.6-2.4 4.2a2.4 2.4 0 0 0 4.8 0c0-1.6-1.2-2.6-2.4-4.2z"/>',
  traffic: '<path d="M4 17l3-7h10l3 7z"/><path d="M3.5 17h17M7 17v2.5M17 17v2.5M8 13.5h8"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V7M16 16v-3M20 16V9" stroke-width="2.2"/>',
  report: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6M9 8.5h2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/><circle cx="12" cy="12" r="7" stroke-dasharray="3.3 2.2"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  focus: '<circle cx="12" cy="12" r="5.5"/><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.3 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  food: '<path d="M5 19c0-8 4-13 14-14-1 10-6 14-14 14z"/><path d="M5 19c4-5 7-8 10-10"/>',
  drop: '<path d="M12 3.5c-3.5 4.5-6.5 7.5-6.5 11a6.5 6.5 0 0 0 13 0c0-3.5-3-6.5-6.5-11z"/>',
  rest: '<path d="M3.5 18.5V9.5M3.5 15h17v3.5M20.5 15v-3a2 2 0 0 0-2-2H11v5"/><circle cx="7" cy="11.5" r="1.8"/>',
  shield: '<path d="M12 3.5l7.5 2.8v5.4c0 4.6-3 8-7.5 9.8-4.5-1.8-7.5-5.2-7.5-9.8V6.3z"/><path d="M9 12l2 2 4-4.5"/>',
  social: '<circle cx="8.5" cy="9" r="2.8"/><circle cx="15.5" cy="9" r="2.8"/><path d="M2.5 19a6 6 0 0 1 9.4-4.9M12.1 14.1A6 6 0 0 1 21.5 19"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  error: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  map: '<path d="M3.5 6l5.5-2 6 2 5.5-2v14l-5.5 2-6-2-5.5 2z"/><path d="M9 4v14M15 6v14"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  trendUp: '<path d="M3.5 17l5.5-5.5 4 4L20.5 7"/><path d="M14.5 7h6v6"/>',
  trendDown: '<path d="M3.5 7l5.5 5.5 4-4L20.5 17"/><path d="M14.5 17h6v-6"/>',
  camera: '<path d="M4 8.5h3.5l1.5-2.5h6l1.5 2.5H20v10H4z"/><circle cx="12" cy="13" r="3"/>',
  fps: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7 15V9h3M7 12h2.5M12 15V9h2.5a1.5 1.5 0 0 1 0 3H12M17.5 9.2a2 2 0 0 0-1.5 0c-1 .5-1 1.6 0 2s2 1 2 2a1.4 1.4 0 0 1-2.5.8"/>',
  keyboard: '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M6 13.5h1M9.5 13.5h5M16.5 13.5h1"/>',
  loan: '<path d="M4 18h16M6 18V8l6-4 6 4v10"/><path d="M12 9.5v6M10 11.2h3a1.2 1.2 0 0 1 0 2.4h-2a1.2 1.2 0 0 0 0 2.4H14"/>',
  staff: '<circle cx="12" cy="7.5" r="3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/><path d="M8.5 4.5h7"/>',
  dry: '<path d="M12 3.5v6M8 6.5l8 0M6 20c0-3 2.5-5 6-5s6 2 6 5"/><path d="M4 20h16"/>',
  wet: '<path d="M8 15.5c-2 3-2 5.5 0 5.5s2-2.5 0-5.5zM16 15.5c-2 3-2 5.5 0 5.5s2-2.5 0-5.5z"/><path d="M7 12.5h9.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 5.6 6.3 3.2 3.2 0 0 0 7 12.5z"/>',
  species: '<path d="M4 20l3-7 2 2 3-5 2 3 3-6 3 13z"/>',
  ruler: '<path d="M3.5 15.5l12-12 5 5-12 12z"/><path d="M8 11l1.5 1.5M10.5 8.5L12 10M13 6l1.5 1.5"/>',
  weight: '<path d="M5 20h14l-1.5-11h-11z"/><circle cx="12" cy="6.5" r="2.5"/>',
  herd: '<circle cx="7" cy="8" r="2.2"/><circle cx="14" cy="6.5" r="2.2"/><circle cx="17.5" cy="12" r="2.2"/><path d="M3 18a4 4 0 0 1 8 0M10 16.5a4 4 0 0 1 8 0M13.5 21.5a4 4 0 0 1 8 0"/>',
  age: '<path d="M6 20.5V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14.5"/><path d="M6 10h12M6 15h12M12 4v3"/>',
  sex: '<circle cx="10" cy="14" r="5"/><path d="M13.5 10.5L20 4M15 4h5v5"/>',
  // ---- species silhouettes (side view, facing left) ----
  sp_elephant: '<ellipse cx="13.5" cy="12.5" rx="6.5" ry="4.5"/><circle cx="6" cy="10.5" r="2.8"/><path d="M4 12.5c-1.2 1.5-1.4 3.5-.6 5.5M4.6 12.8l-1.4 1.4M8 8.6a2.6 2.6 0 0 1 .4 4.2M9 16.5v4M12 17v3.5M15.5 17v3.5M18.5 16.5v4M20 12.5l1.2 3"/>',
  sp_giraffe: '<ellipse cx="14" cy="14" rx="5" ry="3"/><path d="M10.4 12.6L7.2 4.6M12.6 11.8L9.5 4.4"/><ellipse cx="7.6" cy="4.2" rx="2.1" ry="1.3"/><path d="M7.4 2.9V1.5M9 2.9V1.7M10.5 16.5v5M13 17v4.5M15.5 17v4.5M18 16.5v5"/><circle cx="13" cy="13.6" r=".75" fill="currentColor" stroke="none"/><circle cx="16.2" cy="14.6" r=".75" fill="currentColor" stroke="none"/><circle cx="15" cy="12.4" r=".75" fill="currentColor" stroke="none"/>',
  sp_zebra: '<ellipse cx="13.5" cy="13" rx="6" ry="3.5"/><path d="M8.6 11.2L6.2 7.6"/><ellipse cx="5.2" cy="6.8" rx="2" ry="1.3"/><path d="M5.6 5.6V4.2M7.4 9.4l1.2-1.4M9.5 16.3v4.2M12 16.5v4M15 16.5v4M17.5 16.3v4.2M19.4 12.5l1.6 3"/><path d="M11 10.2v5.6M13.5 9.6v6.8M16 10.2v5.6" stroke-width="1.3"/>',
  sp_wildebeest: '<path d="M8 12.5c0-3 3-4.8 6.5-4.6 3.2.2 5.2 2 5.2 4.6 0 2.4-2.2 4-5.5 4H8z"/><path d="M8.4 12.2L6.2 15.2"/><path d="M4.4 14.6h3v3h-3z"/><path d="M4.8 14.4c-1.2-1.4-.8-2.6.8-2.6M7 14.4c1.2-1.4.8-2.6-.8-2.6M5.3 17.7v1.4M6.4 17.7v1.6M9.6 16.5v4M12 16.6v3.9M15 16.6v3.9M17.6 16.5v4M19.6 12l1.4 3"/>',
  sp_buffalo: '<ellipse cx="13.5" cy="13" rx="6.5" ry="4"/><circle cx="6" cy="12.6" r="2.4"/><path d="M4.2 10.9c-1.6-1.8-.4-3.9 1.6-3.1M7.8 10.9c1.6-1.8.4-3.9-1.6-3.1M9.4 16.7v3.8M12 17v3.5M15.4 17v3.5M18 16.7v3.8M19.8 12.4l1.4 3"/>',
  sp_lion: '<ellipse cx="14" cy="13.5" rx="6" ry="3.3"/><circle cx="6.8" cy="10.5" r="3.6"/><circle cx="6.2" cy="10.8" r="1.7"/><path d="M10 16.5v4M12.6 16.8v3.7M15.6 16.8v3.7M18.2 16.5v4M20 12.5c1.5 1 2 3 1 4.5"/><circle cx="21" cy="17.6" r=".9" fill="currentColor" stroke="none"/>',
  sp_cheetah: '<ellipse cx="13.5" cy="13" rx="6.5" ry="2.6"/><circle cx="6.1" cy="10.6" r="1.9"/><path d="M8 11.4l-.4-.3M5.4 11.3l.3 1.4M9.4 15.4v5M12 15.6v4.8M15.2 15.6v4.8M18 15.4v5M20 12.5c2 .5 3 2.5 2 4.5"/><circle cx="11" cy="12.3" r=".6" fill="currentColor" stroke="none"/><circle cx="13.5" cy="13.6" r=".6" fill="currentColor" stroke="none"/><circle cx="15.8" cy="12.2" r=".6" fill="currentColor" stroke="none"/><circle cx="17.6" cy="13.4" r=".6" fill="currentColor" stroke="none"/>',
  sp_hippo: '<rect x="6.5" y="8.8" width="14" height="8.6" rx="4.2"/><path d="M6.8 11.4H3.4a2 2 0 0 0-2 2v1.4a2 2 0 0 0 2 2h3.4"/><circle cx="7.2" cy="10.2" r=".6" fill="currentColor" stroke="none"/><path d="M9.4 17.4v2.8M12.6 17.4v2.8M16 17.4v2.8M18.8 17.4v2.8"/>',
  sp_rhino: '<ellipse cx="13.5" cy="13" rx="7" ry="4.2"/><path d="M7 11.4c-2 0-3.6 1.3-4.1 3.3l-.4 1.5h4.3"/><path d="M3.3 14.2L2.1 10.6l2.7 3.2M7 10.6v-1.6M9.4 16.9v3.6M12.2 17.2v3.3M15.4 17.2v3.3M18.2 16.9v3.6M20.3 12.6l1.2 2.8"/>',
  sp_ostrich: '<ellipse cx="14" cy="11" rx="5" ry="3.6"/><path d="M10 9.4C8 7 7.4 5 8 2.6"/><circle cx="8.2" cy="2.6" r="1.3"/><path d="M6.9 2.6H5.2M13 14.4l-1 6.6M15.5 14.4l1 6.6M10.8 21h2.6M15.4 21h2.6M18.4 9.4l2.4-1.6M19 11.2h2.6"/>',
  sp_warthog: '<ellipse cx="13" cy="13.5" rx="6" ry="3.6"/><path d="M7.4 12.6L4.2 13.4M3 12.6h3.6v2.6H3z"/><path d="M3.8 15.2l-.6 1.3M6 15.2l.6 1.3M9 10.4l1-1.4M11 9.8l1-1.4M19 12.4l1.2-3.2"/><circle cx="20.4" cy="9" r=".7" fill="currentColor" stroke="none"/><path d="M9.6 16.8v3.4M12 17v3.2M14.6 17v3.2M17 16.8v3.4"/>',
  sp_impala: '<ellipse cx="13.5" cy="13.5" rx="5.5" ry="2.8"/><path d="M9 11.8L6.8 7"/><ellipse cx="6" cy="6.4" rx="1.6" ry="1.1"/><path d="M5.5 5.3c-1.6-1.2-1.4-3.2.2-4M6.8 5.3c1.6-1.2 1.4-3.2-.2-4M10 16v5M12 16.2v4.8M15 16.2v4.8M17 16v5"/>',
};

/** Icon name for a species id: its silhouette when we have one, else the paw. */
export function animalIconName(species) {
  const k = 'sp_' + String(species || '').toLowerCase();
  return P[k] ? k : 'paw';
}

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Returns an inline SVG markup string for `name` (falls back to a dot). */
export function iconMarkup(name) {
  const body = P[name] || '<circle cx="12" cy="12" r="3" fill="currentColor"/>';
  return SVG_OPEN + body + '</svg>';
}

/** Returns an SVG element wrapped in <span class="ic"> (add extra classes via cls). */
export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'ic' + (cls ? ' ' + cls : '');
  span.innerHTML = iconMarkup(name);
  return span;
}

export function hasIcon(name) { return !!P[name]; }
