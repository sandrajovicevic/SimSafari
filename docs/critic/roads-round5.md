# roads — round 5 — score 7.5 / 10 — FAIL

**Backend: SwiftShader (software GL), not a real GPU.** Every capture was taken in a Linux container
(`tools/screenshot.mjs`, JSON `gpu` = `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …))`, 1920×1080, seed 1,
`--timeout 400000`, LFS assets resolved: `head -c 4 public/assets/models/polypizza/Lion.glb` → `glTF`).
There is no D3D11 adapter here, so none of the four real-GPU-only verdicts the tasking lists is issued.
Roads does not depend on any of them except night legibility at ground level, which is judged on the
SwiftShader `night` shot only and marked as such.

Head: `418fcb3` (PR #12 merge, verified in `git log`). Every `.json` was checked for timestamp and `errors`
before its PNG was read; all are from this session (10:30–11:15) and none is a stale leftover. Every PNG
below was read.

Round 4's two majors were the junction patch and the lengthwise river causeways. The causeways are
genuinely fixed and I measured it. The junction patch is much better but is not fixed: from above it now has
terrain triangles poking through the asphalt on two of three junctions, including in the `junction` preset's own
frame, and every lesser-kind leg still ends in a hard square cut against the patch. Surfaces improved a lot.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/roads-overview-15.png` — spine (paved) and two branches now cross the river **square**, one concrete bridge and one timber bridge; no lengthwise causeways anywhere. It reads as a spine with spurs, not the "loop network" the README promises; the paved spine's lower end stops in open plain beside a rock outcrop (bottom-right). The concrete deck reads cream-white at this range. The river surface has a bright specular hot-spot at far left.
- `tools/shots/roads-close-16_5.png` — dirt two-track at ~20 m: fine grit, a few pebbles, ruts and dusty shoulder blending with no mesh edge. **The wind-ripple/combed-sand look is gone** and it now reads as compacted laterite. The bank on both sides is terrain: heavy dark wet-mud slab with ~0.5–1 m cobble-plate polygons at left.
- `tools/shots/roads-paved-10.png` — tar with crown, edge lines, dashes and one hard-edged darker repair patch (a lane wide). Uniform worn tar rather than a featureless slab now. The patch is a single dark rectangle and looks more like a rubber mat than a patch, but it is present. The concrete bridge in the distance is pale cream. A dirt track from the left runs into the tar mid-frame and ends in a hard, straight-cut dark end (see issue 2).
- `tools/shots/roads-junction-17.png` — the preset T at 46 m, 32° pitch. **No folded flap and the edge lines now curve round the corners** (big improvement), but **a green/brown terrain triangle sits in the middle of the asphalt** and there is a visible lighter/darker tone break diagonal across the road where the patch meets the paved leg. A 4× crop of that spot confirms grass and dirt texture inside the road surface.
- `tools/shots/roads-bridge-9.png` — timber bridge over a ~26 m channel, deck now a mid **grey-brown** (round 4 said near-white): planks, posts, rails, abutment piers all read. It is square to the channel. Composition nit: water fills the lower 55 % of the frame.
- `tools/shots/roads-night-21_5.png` — lamp pool and fingerpost at the junction, legible reflective paint. The edge lines still glow at uniform full brightness like neon tube; the concrete deck is the brightest solid surface in frame and reads as a pale slab. The road itself is near-black against near-black ground, so legibility comes from the paint and the lamp only. (SwiftShader; ground-level night legibility beyond this framing not judged.)
- `tools/shots/roads-r5-jtop-n16-12.png` (**extra: top-down junction, preset node n16 paved/paved/dirt, 28 m, pitch 60°, noon**) — one continuous asphalt patch with two curved fillet edge lines, no torn geometry. The dirt leg ends in a **dead-straight diagonal cut** against the asphalt (no bell-mouth, no blend); the dirt near the cut has a **concentric ring/swirl pattern** and a regular grid of small dark dots. A small yellow marker sits on the fillet line.
- `tools/shots/roads-r5-jtop-n7-12.png` (**extra: a second real junction, n7 paved/gravel/paved**) — **five to six terrain shards (grass, one with a rock face) poke through the asphalt** across the junction centre and along the left edge, up to ~4 m across. The gravel leg meets the patch in another dead-straight diagonal cut. Fillets and edge lines otherwise good. Terrain at bottom-left beside the road is covered in ~1–2 m cracked-mud plates (the steep-bank triplanar path).
- `tools/shots/roads-r5-jtop-n21-12.png` (**extra: 4-way gravel/dirt junction n21**) — a square gravel slab whose surface is a different texture from the two dirt legs (uniform gravel vs rutted dirt), hard straight seams at both dirt-leg mouths, ruts on the through road stop at the slab, and **tan grass shards show through the gravel in three places** (two small at the top-right of the slab, one larger at bottom-centre).
- `tools/shots/roads-r5-paved-close-6_5.png` (**extra: paved close-up at 6.5 h, 12 m, pitch 12°, grazing dawn sun**) — warm-lit tar with aggregate grain, dashes and edge lines crisp, a faint hairline rectangle marks the repair patch. The round-4 wormy crack web is **gone**; what remains is faint diagonal scratch streaks at bottom-right that read as brushed rather than crazed. No wheel-path wear, no crack lines (the README admits both).
- `tools/shots/roads-r5-measure.png` + `.json` (**extra: water-crossing measurement**, table below) — the eval readback.

## Contract / errors / perf (table)

Capture backend SwiftShader; frame totals from the JSON. Roads' own steady-state `updateMs` is 0.000–0.002 on
every preset.

| capture | drawCalls | triangles | errors | modules.roads |
|---|---|---|---|---|
| overview 15 | 63 | 1,345,216 | [] | ok |
| close 16.5 | 47 | 821,778 | [] | ok |
| paved 10 | 57 | 1,049,014 | [] | ok |
| junction 17 | 54 | 978,783 | [] | ok |
| bridge 9 | 46 | 789,010 | [] | ok |
| night 21.5 | 62 | 1,116,950 | [] | ok |
| extra jtop n16 12 | 49 | 845,841 | [] | ok |
| extra jtop n7 12 | 49 | 845,841 | [] | ok |
| extra jtop n21 12 | 49 | 845,841 | [] | ok |
| extra paved-close 6.5 | 58 | 1,081,782 | [] | ok |
| extra measure (overview) | 63 | 1,345,216 | [] | ok |
| game overview 14 (context) | 363 | 4,049,189 | [] | ok |
| game overview 17 (context) | 365 | 4,255,559 | [] | ok |

- 13 captures, zero console errors, `modules.roads.status === 'ok'` on all. `node tools/lint.mjs src/modules/roads` → **lint ok**.
- **Game overview draw calls: 363 (14 h) and 365 (17 h) against the 1500 budget** → pass; 4.05 / 4.26 M triangles.
- Road-owned geometry (`stats()`): 9 drawables, **18,350 triangles** for 10 edges/10 nodes/4 junctions/2 bridges (r4: 44,753 for 12 edges). Well inside the ≤ 40 draws / ≤ 200 k spec.
- `update()` only sets uniforms and checks the dirty flag: no per-frame allocation. `dispose()` releases meshes, materials, every texture key, the moon light. README API functions all exist.
- **Rebuild cost claim reproduces.** README says 138–166 ms for a full rebuild; `stats().build` in my run: `ms 175.3` (`conformMs 117.6`, `meshMs 55.9`, `propsMs 1.9`, 10 conformed edges), measured while another capture ran (load average ~3–7 on 4 cores), so ~5 % above the range is contention. The round-4 1,601 ms is gone. In the game captures the rebuild still shows as a single-frame `updatePeakMs` of 182–351 ms (SwiftShader, contended): a real hitch on every road edit, documented in the README.

### Water-crossing measurement (every crossing, 1 m steps via `sampleEdge` + `terrain.isWaterAt`; channel width = narrowest wet chord through the crossing midpoint over 60 directions at 0.5 m)

| edge | kind | at (x,z) | wet run along edge | local channel width | ratio | skew vs channel |
|---|---|---|---|---|---|---|
| e_17 | paved | (68,122) | 32 m | 32 m | 1.00 | 3° |
| e_26 | dirt | (−217,88) | 25 m | 25.5 m | 0.98 | 3° |

The other 8 edges have **0 m** of water (`wetTotal`). Round 4: 80 / 73 / 45 m wet runs against a ~30–40 m channel. **Resolved.** Both crossings are square within 3° and have wet length equal to channel width. Junctions found: n7 (paved/gravel/paved), n10 (paved/paved/gravel), n16 (paved/paved/dirt — the preset node), n21 (gravel/gravel/dirt/dirt).

### Same measurement on the park demo's own network (`--game`, 14 h; built by the park/zoning scenario through `addRoad`, not by roads' showcase)
14 edges, 5 junctions, 7 wet crossings. Three are square (gravel e_3 21 m/21.5 m, gravel e_9 22/23 m, dirt e_27 12/12.5 m, all ≤ 4° skew). Four dirt crossings cluster within ~20 m of each other around (117–135, −36…−24) and are oblique or short-chorded (e_24 wet 10 m vs 26 m chord, skew 20°; e_25 17/26, 28°; e_27 second span 20/29, 48°; e_28 22/24, 60°). The roads module builds whatever it is given, so this is not a roads defect, but `tools/shots/r5-game-mid330-14.png` (lower left) shows the resulting bridge sprawl; the measurement is in `tools/shots/r5-game-roads-measure.json`. Cross-module (park/zoning authoring), listed for the record. `stats().build`: 14 edges, 35,620 triangles, 118.6 ms.

## Round 4 issues — status and evidence

| # | round-4 issue | status | evidence |
|---|---|---|---|
| 1 | [major] Junction patches geometrically broken | **improved, still major** | Fixed: folded triangle, wedge past the edge, edge-line stubs, dashes-that-stop (`roads-r5-jtop-n16-12.png`). Not fixed: terrain shards through the asphalt (n7, n21, and the preset frame `roads-junction-17.png`), hard square seam to the lesser-kind leg (all three), patch surface differs from leg surface. New issue 1–3 below. |
| 2 | [major] Lengthwise river causeways | **resolved** | measurement table above; `roads-overview-15.png`, `roads-bridge-9.png` |
| 3 | [minor] Asphalt featureless / wormy crack relief | **improved** | `roads-paved-10.png` (repair patch), `roads-r5-paved-close-6_5.png` (crack web gone). Remaining: single slab patch, no cracks, no wheel-path wear. |
| 4 | [minor] Dirt reads as wind-rippled sand | **resolved at the `close` preset, unchanged at junction legs** | `roads-close-16_5.png` grit + pebbles, no comb. But the leg at n16 shows concentric swirl (`roads-r5-jtop-n16-12.png`). |
| 5 | [minor] README rebuild claim (1,601 ms) | **resolved** | 175.3 ms measured; README updated and honest |
| 6 | [minor] Pale bridge decks | **improved (timber), unchanged (concrete)** | timber grey-brown in `roads-bridge-9.png`; concrete cream in `roads-paved-10.png`, pale slab in `roads-night-21_5.png` |
| 7 | [minor, carried] `sampleEdge` footgun, two-lane-only `getLanes()` | **unchanged** | README, `index.js` |

## Ranked issues (most damaging first)

1. **[major] Terrain triangles poke through junction patches.**
   - **What:** patches on all three junction frames I inspected (n7, n21, and n16 in the preset view) have terrain triangles (grass, and in one case a rock face) visible on top of the asphalt/gravel, 1–4 m across, with sharp polygon edges.
   - **Where:** `roads-r5-jtop-n7-12.png` (five to six shards); `roads-r5-jtop-n21-12.png` (three tan grass shards in the gravel); and in the mandated `junction` preset frame, `roads-junction-17.png` (one shard mid-asphalt). It is view-dependent: node n16 from 28 m at 60° pitch is clean, but the same node in the preset (46 m, 32° pitch) shows a shard. [Guessing] terrain triangles sitting at or just above the patch surface (a depth-bias/coplanarity loss, worse at grazing angles); n7 and n21 show them at 60° too, so the patch is not reliably above the ground. I did not confirm the mechanism in code.
   - **Why it matters:** round 4 named "grass through the asphalt" as part of the junction failure and the README says a mid ring "lifted above the terrain" fixed it. It didn't, on two of three junctions. Cities: Skylines II junctions have no ground breach; players inspect junctions constantly.
   - **Fix:** after building a junction patch, sample the terrain at the patch's boundary and interior at ≤ 1 m and lower the terrain via `terrainConform` (or raise the patch) so the patch sits a few cm above every terrain vertex; add a check that walks every junction and fails if any terrain vertex is above the patch surface.
2. **[major] The patch does not blend into the lesser-kind legs; every leg mouth is a hard straight cut.**
   - **What:** the patch is authored in the highest-rank kind (paved > gravel > dirt); the dirt and gravel legs end at a dead-straight line against it with no bell-mouth, no material crossfade and no ruts running into the patch.
   - **Where:** n16 (`roads-r5-jtop-n16-12.png`, diagonal cut, no blend), n7 (gravel leg, top-right), n21 (both dirt legs; the gravel slab is texturally different from the legs and the through-road ruts stop at it), and mid-frame in `roads-paved-10.png` (a dirt crossing meets the tar in a hard dark rectangle).
   - **Why it matters:** this is the "hard seam where a paved apron meets a gravel/dirt leg" the README lists as a remaining nit, but it is the first thing you see on every junction. Real safari junctions have a splayed, dusty mouth where the dirt track spreads onto the tar.
   - **Fix:** feather the patch's alpha/`aRoad` weights over the last 3–4 m of each lesser-kind leg (the ribbon shader already has a `uSkirt` feather), splay the leg's outline at the mouth, and let the lesser-kind ruts run 3 m into the patch. For paved-over-dirt, add a dust-tinted transition strip.
3. **[minor] Concentric ring/swirl texture on dirt near junction legs, plus a grid of small dark dots.** `roads-r5-jtop-n16-12.png` (the dirt leg's end). Round 3 found a swirl on asphalt; this is the same failure on a different material, visible at 28 m from above. Fix: check the dirt height/normal generator for a low-frequency ring term or a domain warp that is not applied along `aRoad.y`, and break the dot grid with per-cell jitter.
4. **[minor] The overview reads as a spine with spurs, not the loop network the README and preset description promise.** `roads-overview-15.png`; README admits "the gravel loop is dropped on this seed". Two paved dead ends in open field. Fix: either close the loop with a dry-reachable route or rewrite the preset description and README; a dead end into a rock (bottom-right) reads like a generation accident.
5. **[minor] Concrete deck reads cream-white in daylight and as a glowing slab at night.** `roads-paved-10.png`, `roads-night-21_5.png`. The timber deck is fixed; the concrete one wasn't touched and shows no texture or railings at range. Fix: lower concrete albedo ~30 %, add parapet geometry, and cap the night emissive contribution.
6. **[minor] Night edge lines glow at uniform full brightness** (carried nit from round 4). `roads-night-21_5.png`. Fix: modulate retro-reflection by view-angle/lamp distance instead of a flat emissive.
7. **[minor] Repair patch is a single dark rectangle with no sealed edge and no cracks.** `roads-paved-10.png`. Real patches have a raised, slightly glossy sealed border and are irregular. Fix: add a 4–5 cm sealed edge line, jitter the outline, add a few isolated cracks.
8. **[minor] Rebuild hitch in game:** `roads.updatePeakMs` 182–351 ms on game captures (single frame, SwiftShader, contended). README documents 138–166 ms; the rebuild is synchronous and regenerates every edge on any edit. Fix (already named in the README): per-edge mesh caching.
9. **[minor, carried] `sampleEdge` `out` footgun and two-lane-only `getLanes()`** — unchanged, honestly documented.

## What is genuinely good
- **The lengthwise causeway defect is really gone**: both crossings measure square (3° skew) with wet length equal to channel width, and every other edge is dry. The builder's own measurement claim reproduces.
- **The junction outline is now correct geometry**: filleted corners, curved edge lines, no torn or folded triangles, no stubs. The remaining problems are height conformance and leg blending, not shape.
- **Dirt reads as dirt** at the `close` preset: grit, sparse pebbles, ruts, dust shoulder with no ribbon edge.
- **Timber bridge deck and abutments are convincing** at 3/4 view; the asphalt at grazing dawn light no longer shows the crack-web artefact.
- Contract is clean: zero errors on 13 captures, lint ok, `update()` allocation-free, road-owned geometry 9 draws / 18k triangles, dispose complete.

## Verdict
**FAIL at 7.5** (was 7.0). One major is verifiably resolved (causeways) and one is improved but not resolved
(junctions), with two new defect classes exposed by the top-down angle the preset cameras do not use: terrain
poking through the patch and hard leg-mouth seams. Surfaces are up from "programmer art" to convincing at
`close` and `paved`. The Cities: Skylines II reference is not met at junctions, which is where a road builder
is judged. Stays below 8.5 until issues 1 and 2 are fixed and re-verified top-down. Real-GPU checks for night
ground-level legibility not performed (no adapter in this container).

```json
{
  "roads": {
    "score": 7.5,
    "round": 5,
    "status": "fail",
    "errors": 0,
    "drawCalls": 63
  }
}
```
