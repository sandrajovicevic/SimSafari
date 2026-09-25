# roads — round 4 — score 7.0 / 10 — FAIL

The round-3 finding (asphalt swirl) is fixed at normal viewing range: commit a0139d3 works. But two extra angles
the builder does not stage (a top-down junction and a water-span measurement) show two structural defects that the
preset cameras hide. The score drops from 7.5 to 7.0. The module did not regress. Round 3 scored a 3-way junction
that it had only seen from 46 m at a grazing angle.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/roads-overview-15.png`: the loop network reads well at a glance (grey paved spine, tan gravel, rutted dirt) and conforms to the terrain. However, at least three pale "bridges" run **along** the river channel for long stretches instead of crossing it: the gravel loop and a dirt track are laid lengthwise over the water.
- `tools/shots/roads-close-16_5.png`: dirt two-track at about 20 m. The ruts are convincing, the shoulder dust blends in with no mesh edge, and the track follows the ground well. The dirt albedo/normal has a strong combed, wind-rippled "sand dune" micro-pattern instead of "dry dirt with pebbles". The bridge is a speck on the horizon.
- `tools/shots/roads-paved-10.png`: tar road with crown, solid edge lines, dashed centre and a km stone. **The swirl is gone.** The surface is now uniform dark-grey worn tar with no macro sweep. The trade-off is that it is almost featureless: none of the patches the preset description promises are visible, and there are no cracks at this range.
- `tools/shots/roads-junction-17.png`: 3-way paved/rutted-branch junction with fingerpost. Even at the preset angle, the patch shows as a darker square slab with hard straight edges. The paved edge lines stop with stubs, the centre dashes do not continue across the patch, and the two paved legs look laterally offset. A white concrete arch bridge at left reads as untextured.
- `tools/shots/roads-bridge-9.png`: the timber deck, posts and railings are well made. But the bridge is laid about 150 m lengthwise along the river rather than across it, with a second lengthwise bridge in the distance. No safari track does this.
- `tools/shots/roads-night-21_5.png`: still the strongest night scene in the project. Warm solar-lamp pools at the junction/signposts and legible reflective paint. The edge lines glow uniformly at full brightness along their whole length, which looks more like neon tube than retro-reflective paint, a nit.
- `tools/shots/roads-critic4-paved-close-6_5.png` (extra: paved at 12 m / pitch 12°, dawn 6.5 h): no macro swirl, confirming the fix holds at close range. Under grazing low sun, the crack Worley network in the normal map shows as a dense wormy/leathery relief over the whole surface, and the tar takes on the sand colour of the dawn light. Acceptable, but it reads as crazed clay more than aggregate.
- `tools/shots/roads-critic4-junction-top-12.png` (extra: junction target at 28 m / pitch 60°, noon): **broken junction geometry.** The patch is a flat, untextured grey polygon with hard straight borders. A crumpled/folded triangle flap sits at the node centre. One paved leg ends in a wedge that pokes past the road edge. The edge lines end in short perpendicular stubs. The dirt branch meets the patch along a hard rectangular line. This is the kind of seam the spec's "blended patch" exists to prevent.
- `tools/shots/roads-critic4-night-3.png` (extra: night preset camera at 3 h, plus eval readback): matches 21.5 h; the lamp pools and paint hold. The eval readback is in the perf section below.

## Contract / errors / perf (frame totals; road-owned: 9 drawables / 44,753 triangles per `stats()` readback)
| preset | drawCalls (frame) | triangles (frame) | errors | roads updateMs |
|---|---|---|---|---|
| overview 15 | 66 | 1,492,149 | [] | 0.010 |
| close 16.5 | 60 | 1,197,673 | [] | 0.022 |
| paved 10 | 60 | 1,197,673 | [] | 0.012 |
| junction 17 | 64 | 1,264,057 | [] | 0.022 |
| bridge 9 | 65 | 1,329,169 | [] | 0.021 |
| night 21.5 | 67 | 1,361,937 | [] | 0.016 |
| extra paved-close 6.5 | 64 | 1,296,401 | [] | — |
| extra junction-top 12 | 56 | 1,034,257 | [] | — |
| extra night 3 | 63 | 1,230,865 | [] | — |

- Zero console errors in all 9 captures. `modules.roads.status === 'ok'` in every capture. `node tools/lint.mjs src/modules/roads` → ok.
- Budget: road-owned geometry is 9 drawables and 44,753 tris for 12 edges, well inside the spec's ≤ 40 draws / ≤ 200 k for 20 edges.
- `update()`: no allocations (it only sets uniforms and checks the dirty flag). `dispose()` releases meshes, materials, every texture key and the moon light. Event listeners are registered through the owner-scoped `ctx.events`, which core removes with `offOwner`. `dependencies: []` and `optional: ['terrain','environment']` are truthful. Every README API function exists in `index.js`.
- The eval readback measured each edge's water span at 1 m steps (`sampleEdge` + `terrain.isWaterAt`). The longest continuous wet runs were **80 m** (dirt e_21, with 133 of its 298 m over water), **73 m** (gravel e_12) and **45 m** (gravel e_18). The river is roughly 30–40 m wide in the shots, so these are lengthwise spans, not crossings.
- `stats().build.ms` = **1,601.7 ms** for one synchronous rebuild, which includes terrain conform/refresh. The README says "a 20-edge network takes a few ms". In-game this is a 1.6 s hitch on every road edit (SwiftShader inflates it, but it is still orders of magnitude off the claim).

## Ranked issues (most damaging first)

1. **[major] Junction patches are geometrically broken at close range.**
   - **What:** the patch is flat and untextured, with a folded/torn triangle at the node, a wedge poking past the road edge, edge-line stubs, dashes that stop, and a hard rectangular seam to the dirt branch.
   - **Where:** `roads-critic4-junction-top-12.png`, and partly visible in `roads-junction-17.png` and the dark notch in `roads-critic4-paved-close-6_5.png`.
   - **Why it matters:** in Cities: Skylines II, junctions are the part players look at most, and they are seamless: markings continue or end in proper stop lines, and the surface has the same texture as the legs. The spec says "blended patch at nodes with ≥ 3 edges".
   - **Fix:** build the patch from the incident legs' trimmed end cross-sections (a convex fan over their corner points, with no free triangles at the centre). Apply the same road material with `aRoad` across-coordinates, so aggregate, crown and dust continue. End edge lines at the patch boundary with a proper bell-mouth curve instead of stubs. Carry the paved leg's centreline straight through when two legs are collinear.
2. **[major] The showcase network lays roads lengthwise along the river on "bridges" of 45–80 m.**
   - **What:** gravel and dirt edges run parallel to the channel instead of crossing it.
   - **Where:** `roads-overview-15.png` (at least three long white spans) and `roads-bridge-9.png` (the hero bridge is a lengthwise causeway, with a second one behind it).
   - **Why it matters:** it reads as an obvious generation error; nobody builds 150 m of timber deck along a river. It also makes the `bridge` preset showcase a defect.
   - **Fix:** derive the control points from `terrain.getFeatures()` (the README already lists this as a known gap). Make each water crossing near-perpendicular: find the channel tangent and route through a short crossing. Or reject or reroute any edge whose continuous wet run is more than about 1.5× the local channel width.
3. **[minor] Asphalt is now clean but under-authored.**
   - **What:** the swirl fix removed the albedo patches and crack darkening entirely.
   - **Where:** at 10 h (`roads-paved-10.png`) the tar is a featureless uniform grey, and the "patches" in the preset description are not visible. At a grazing 6.5 h sun (`roads-critic4-paved-close-6_5.png`) the normal-map crack web shows as dense wormy relief over the whole surface.
   - **Why it matters:** the spec asks for "asphalt with cracks/patches" and "macro variation along length".
   - **Fix:** add sparse, discrete features, not a low-frequency blend field:
     - a few rectangular repair patches with hard edges;
     - isolated crack lines at 5–10 % coverage;
     - a faint oil/wear darkening confined to the two wheel paths (driven by `aRoad.x`, not noise).
   - Also lower the crack normal contribution so it does not cover the whole surface.
4. **[minor] Dirt surface micro-pattern reads as wind-rippled sand.**
   - **Where:** `roads-close-16_5.png`: strong combed ripples across the whole track, including between the ruts.
   - **Why it matters:** the spec asks for "dry dirt with pebbles". Compacted laterite tracks read as fine grit plus scattered pebbles, not ripples.
   - **Fix:** lower the amplitude of the directional noise in the dirt height and add a pebble Worley layer.
5. **[minor] The README's rebuild-time claim does not reproduce.** "A few ms" is measured at 1,601.7 ms (`stats().build.ms`). Either profile and split terrain conform off the synchronous path, or correct the README.
6. **[minor] Concrete bridge (`junction` shot, left) and timber decks from above read pale and flat.** The planks' albedo is close to grey-white at distance. Weathered African timber should read mid grey-brown.
7. **[minor, carried] `sampleEdge` `out` footgun and the two-lane-only `getLanes()`** are still documented honestly and still unaddressed.

## What is genuinely good
- **The round-3 asphalt swirl is gone.** It is verified at 10 h (preset) and at 12 m with a 6.5 h grazing sun (extra). The bisection write-up in the commit is exemplary engineering.
- The dirt two-track ruts and shoulder dust blending are convincing. The ribbon's mesh edge is invisible everywhere.
- The timber bridge *asset* (deck, posts, rails, slight arch) is well made; its placement is the problem.
- Night remains the best in the project: lamp pools, legible paint, and consistent results at 21.5 h and 3 h.
- The contract is clean: zero errors, lint ok, no per-frame allocations, dispose complete, far inside the draw-call and triangle budget.

## Verdict
**FAIL at 7.0.**
- **Improved:** the requested fix landed.
- **Blocking a pass:** two major defects. The 3-way junction is a torn, untextured slab when viewed from above, and the showcase network builds lengthwise causeways along the river.
- **Standard:** against the Cities: Skylines II reference, junction quality alone keeps this below AAA.
- **Next round:** fix the junction patch construction and route water crossings perpendicular to the channel, then revisit asphalt detail. Critics should always include a top-down junction shot from now on.
