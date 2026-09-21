# props — round 3 — score 7.0 / 10 — FAIL

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/props-overview-16_5.png` — acacia savannah at 16:30: flat-topped umbrella thorns thickening into a dense riverine grove and thinning onto the open golden plain, escarpment and two kopjes visible, genuinely naturalistic distribution and density gradient. One of the best single images in the project.
- `tools/shots/props-grass-17.png` — grass at ~7 m: individual tufts with per-blade shading and colour variation read reasonably well; a couple of dark clumped silhouettes in the mid-ground look like they could be small shrubs rather than a rendering glitch, ambiguous at this resolution but not clearly wrong.
- `tools/shots/props-acacia-15.png` — one umbrella thorn at 21 m: correct bare-bole-forking-high silhouette, wide flat canopy, a termite mound and log visible nearby — matches the description precisely.
- `tools/shots/props-kopje-17_5.png` — a boulder pile with visible individual-boulder texture and evening raking light, but framed wide enough that the adjacent escarpment cliff dominates the shot; I could not clearly confirm "thorn scrub in the cracks" on the kopje itself at this framing.
- `tools/shots/props-riverine-8.png` — dense fever-tree gallery forest along the river in morning light with the escarpment behind — genuinely atmospheric, matches the description well.
- `tools/shots/props-close-16.png` — termite mound, dead skeletal tree, a mottled fallen log, a lichen-pale boulder and a thorn shrub against dry grass, exactly as the description promises; the log's bark texture reads a little busy/noisy up close but is a minor nit.
- `tools/shots/props-night-21_5.png` — moonlit acacia silhouettes over a near-black plain, consistent with the project-wide night-ambience issue documented in terrain/environment/animals' reviews (correctly out of scope for this module).

## Contract / errors / perf (table: preset, drawCalls, triangles, errors, props updateMs)
| preset | drawCalls | triangles | errors | props updateMs |
|---|---|---|---|---|
| overview (16.5h) | 127 | 3,995,078 | [] | 140.0 |
| grass (17h) | 125 | 3,727,967 | [] | 262.8 |
| acacia (15h) | 139 | 3,686,197 | [] | 216.7 |
| kopje (17.5h) | 137 | 3,356,559 | [] | 137.5 |
| riverine (8h) | 150 | 3,979,118 | [] | 132.5 |
| close (16h) | 141 | 3,671,827 | [] | 154.8 |
| night (21.5h) | 155 | 4,259,069 | [] | 177.1 |

Zero console errors on all 7 presets. Draw calls and triangle counts match the README's own measured table **exactly, to the last digit**, for every single preset — an unusually precise, independently-confirmed correspondence. Draw calls are comfortably inside the spec's ≤400 budget (instancing works as designed: 125–155 draws for 150k–250k+ grass instances plus thousands of trees/props).

## Ranked issues (most damaging first)

1. **[major] `update()` cost is 90×–175× over the ARCHITECTURE §7 budget (≤1.5 ms) on every single preset measured, not as an occasional worst case.** I measured 132.5–262.8 ms across all seven presets. The module's own README discloses a grass-rebuild cost of "792 ms" but frames it as something that "only runs when the camera crosses the 14 m re-pack threshold (not every frame)" and reads as a rare-worst-case caveat. What I found is that **every preset switch is exactly such a threshold crossing** — the showcase's whole purpose is to jump the camera between presets — so in practice this expensive rebuild fires on every preset load, every time, not occasionally. The measured range (132–263 ms) is lower than the README's cited 792 ms worst case but still two orders of magnitude over budget, and consistent enough across seven independent captures (never once under 130 ms) that it reads as the normal cost of a camera jump, not an edge case. In the live game this would be felt as a genuine, repeated stutter every time the player pans or teleports the camera far enough to cross a chunk boundary — worth escalating from the README's "Known gaps" framing to an active fix: the obvious lever is spreading the near/far chunk rebuild across multiple frames (a work-queue) instead of doing it synchronously in one `update()` call.

Nothing else rises above minor — this module's actual rendered content is excellent and I found no visual claim that didn't hold up.

## What is genuinely good
- Draw-call and triangle numbers for every preset match the README's own measurements exactly — the most precise, verifiable correspondence between a README's claims and independently-reproduced numbers of any module reviewed so far.
- `overview` and `riverine` are the strongest single images reviewed in this project: naturalistic density gradients, correct silhouettes, atmospheric lighting.
- `acacia` and `close` demonstrate individual species/prop silhouettes precisely matching their descriptions (forked bole, flat crown; termite mound, dead tree, log, boulder, shrub).
- Instancing genuinely delivers on its promise: 125–155 draw calls for a scene with 150k+ grass instances and thousands of trees, comfortably inside the ≤400 spec ceiling.
- `index.js`/`grass.js` API matches the README's table; `dispose()` releases every instanced mesh; `node tools/lint.mjs src/modules/props` is clean.

## Verdict
FAIL. Visual quality is arguably the best in the project — natural distribution, convincing individual species, atmospheric lighting — and draw-call/triangle budgets are met with room to spare. But `update()` cost is catastrophically over budget on literally every preset tested (132–263 ms vs a 1.5 ms target), and this is a real, repeatable, gameplay-visible stutter risk every time the camera crosses a chunk boundary, not the rare edge case the README's phrasing suggests. This alone rules out a pass regardless of visual quality.
