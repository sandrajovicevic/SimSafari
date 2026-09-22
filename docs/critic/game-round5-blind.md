# Game round 5 — blind visual test (2026-09-22) — independent critic

Fresh, independently-captured re-run of the round-4 protocol. Every image in this round was
captured, read and scored by the independent critic in this session — none of round 4's numbers
were reused. Where a fresh score materially disagrees with round 4's own claim for the same shot,
that is called out explicitly with what was actually seen.

## Protocol

* Game subject: `overview` × tod 8 / 14 / 21.5, `close` × tod 14 / 21.5, one DOM composite (canvas +
  UI) at `overview` tod 14 — same 6 shots as round 3/4, `quality=high seed=1`, 1920×1080, clock
  paused (`&speed=0`).
* Savannah subject: `overview`, `waterhole`, `kopje`, `night` — captured via `?module=savannah` at
  1280×720 as part of this session's independent `savannah` module review (same day, same seed,
  same quality tier as this pass); reused here rather than re-captured a second time at 1920×1080,
  since they were already freshly taken and read in full by this same critic pass. Noted as a
  methodology deviation from round 4's exact resolution, not expected to change merit scoring.
* Each image scored 0–10 on the brief's §12 anchors purely on what is visible in the image, cross-
  checked against `errors`/`drawCalls`/`triangles` in each capture's JSON.

## Game subject (park demo) — per-image scores

| shot | tod | round 4 | round 5 (this pass) | notes |
|---|---|---|---|---|
| blind5-game-overview-8 | 8h | 8.5 | 8.0 | Coherent whole-park view: river with two bridges, escarpment, kopjes, two pans, lodge complex, hexagonal road network. No sparkle, no world-edge cut. Genuinely close to round 4's own read. |
| blind5-game-overview-14 | 14h | 8.5 | 8.0 | Same composition at midday; clean waterline banks and pan rims, no speckle. Matches round 4's "sparkle fix holds" claim. |
| blind5-game-overview-21_5 | 21.5h | 7.5 | **3.5** | **Sharp disagreement with round 4.** The entire river and both waterhole pans render as a single glaring, near-white, blown-out fill — by far the brightest thing in the frame, brighter than the lodge's own lamps. Round 4 described this exact shot as "waterhole rims trace as clean warm glow rather than pale sparkle, river shows plausible dark-water highlights" — that is not what this capture shows: there is no dark water with highlights, the water is uniformly overexposed across its entire visible surface. This is the same terrain/environment night-water brightness defect independently found and measured (via raw pixel readback) in `terrain`'s, `animals`', `traffic`'s, `savannah`'s and `park`'s reviews this round — at the game's own default full-overview-at-night shot, it is not a minor tell, it is the single most visually dominant thing in the image. |
| blind5-game-close-14 | 14h | 8.0 | 8.0 | Correct acacia silhouettes, natural zebra/wildebeest placement, dappled canopy shade reads as organic. A hide structure visible at frame left. Genuinely good, matches round 4. |
| blind5-game-close-21_5 | 21.5h | 6.0 | 5.0 | Very dark, dominated by self-shadowed tree canopy exactly as round 4's own investigation describes (the fixed camera sits ~66 m up inside a dense tree cluster) — that part of round 4's characterization holds up. Scored half a point lower than round 4 because the same bright-water patch visible in `overview-21.5` is also visible here (top-left corner), an additional defect round 4 did not mention for this specific shot. |
| blind5-game-dom-14 | 14h | 8.5 | 8.5 | UI composite over clean terrain: top bar, minimap (correctly showing habitat outlines), numbered toolbar all crisp; no sparkle underneath. Matches round 4 exactly. |

**Game subset average: (8.0+8.0+3.5+8.0+5.0+8.5)/6 = 6.83 → `game.blindVisual = 6.8`** (round 4: 7.8).
The drop is driven almost entirely by one shot (`overview-21.5`) where this round's independent
read directly contradicts the previous round's own scoring of the same subject — see the systemic
finding below.

**Budget note**: `close-14` and `close-21.5` both measured slightly over the project's ≤6 M triangle
budget (6,107,590 and 6,076,342 respectively) — a minor, newly-observed overage, not present in the
`overview` shots (4.7–4.8 M each). Zero console errors on all 6 shots.

## Savannah subject — per-image scores (reported, not part of `game.blindVisual`)

| shot | round 4 | round 5 (this pass) | notes |
|---|---|---|---|
| sav-overview | 8.0 | 8.0 | Coherent composed world: river, gallery, grassland, kopjes, waterhole, dirt track — matches this session's own fresh `savannah` module review. |
| sav-waterhole | 8.0 | 8.0 | Elephants and giraffes at a muddy pan, zebra at the shore, detailed acacia — the strongest single image in the set, consistent with round 4 and this session's own module review. |
| sav-kopje | 8.0 | 8.0 | Pride legible at the kopje's foot, male's mane and build readable — the round-3 fix holds up under fresh inspection (confirmed independently in this session's savannah module review). |
| sav-night | 7.5 | **4.0** | **Disagrees with round 4.** The waterhole pan is a uniform bright cream-tan fill, the single brightest object in the frame — the same defect found in the game subject's `overview-21.5` above, and independently measured via pixel readback in this session's `terrain` review. Round 4 described this shot as "moonlit waterhole reads well — bright moon-glint on water" — a moon-glint highlight is a small, tight specular feature; what this capture shows is the entire pan surface uniformly bright, not a glint. |

**Savannah subset average: (8.0+8.0+8.0+4.0)/4 = 7.0** (round 4: 7.9) — consistent with this
session's independent `savannah` module score of 6.0, which found comparable defects.

## Systemic findings, this round

1. **The night-water-overbright bug is real, severe, and project-wide — not resolved, contrary to round 4's characterization.** This session independently found and, in `terrain`'s review, directly measured via raw pixel readback (water ≈2.5–3× brighter than surrounding ground and sky at night) the same defect in six separate contexts this round: `terrain`, `animals`, `traffic`, `savannah` (module review), `park` (module review), and now both the game's own default `overview-21.5` and the savannah subject's `night` shot in this blind pass. Round 4's blind pass scored the game's `overview-21.5` at 7.5 and the savannah `night` at 7.5, describing the water as showing "plausible dark-water highlights" and "bright moon-glint" — a fresh, independent look at the same class of shot finds the water is not dark with highlights, it is uniformly and severely overexposed, the dominant visual feature of the frame. **This is the single most damaging, most-corroborated defect found in this entire critic pass** — it affects the game's own default night view, not just an obscure preset.
2. **Camera-anchor mis-targeting in the wave-3 composite modules (new this round, see below) is a second, independent, also-damaging pattern** — not part of the blind visual protocol's shot list (which doesn't include `savannah`'s `close` or `park`'s `habitat`), but found during this session's module-level reviews and worth flagging here since it affects the same class of "what you see is not what was promised" trust issue as the night-water bug.
3. **Daytime overview/close shots (8h, 14h) are genuinely strong and stable** — both this round and round 4 agree closely on these, and the underlying terrain/props/environment fixes from earlier rounds (waterline sparkle, grass mottle, tiled cracks) continue to hold up under a fresh independent look.
4. **A newly-observed, minor triangle-budget overage** on the `close` presets (~6.08–6.11 M vs the ≤6 M target) — small, not present at `overview`, not scored against `game.blindVisual` here but worth a note for the next pass.

## Note on the camera-anchor pattern (raised by the coordinator)

This session's independent module reviews found: `savannah`'s `close` preset shows a zebra/wildebeest
herd crossing (near-duplicate of the `herd` preset) instead of its own promised quiet foreground-
grass-and-acacia-trunk-with-hazy-kopje composition; and `park`'s `habitat` preset shows a river/
gallery scene instead of the promised plains-grazer habitat with its fence, hide and three named
species, while `park`'s own `close` preset also shows a wide establishing view instead of a lodge-
veranda close-up. **These are very likely the same underlying class of defect, not three unrelated
one-offs**: both `savannah` and `park` explicitly document (in their own READMEs) using the *same
shared idiom* — recomputing each preset's camera anchor from real, per-seed feature/placement
positions at `stage()` time, by mutating the exported `presets` object in place before core reads it
(the same pattern `terrain`'s showcase also uses, without incident there). Because `savannah` and
`park` are separate modules, this is not literally one shared function with one bug — each module
implements its own anchor-recomputation logic — but the fact that the *same failure mode* (a
preset's camera ends up aimed at content belonging to a different subject/habitat/preset instead of
its own) appears independently in both modules, and specifically in the presets whose subjects sit
close to other populated content (a herd's path near `savannah close`; a habitat boundary near `park
habitat`), points to a systemic weakness in how "real per-seed anchor" cameras are chosen — most
likely insufficient separation/exclusion between a preset's intended anchor point and other live
content's positions (herd targets, adjacent habitat centroids) when both are derived from the same
terrain-feature data on the same seed. **Recommend the integrator treat this as one shared-idiom
issue to fix once** (e.g. a common anchor-validation helper that rejects a candidate anchor too close
to another preset's subject or another habitat's footprint) rather than patching `savannah` and
`park` independently, since a third wave-3 module built the same way would likely reproduce it again.

## Gameplay fidelity — not re-verified this round

`tools/fidelity.mjs` was not re-run in this session (time budget spent on the 15-module pass and this
blind visual pass). `game.gameplayFidelity` is left at its existing value (8.0); flagged for the next
round to re-run directly rather than carry forward un-re-verified.
