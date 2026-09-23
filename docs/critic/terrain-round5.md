# terrain — round 5 — score 8.5 / 10 — PASS

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/terrain-overview-15.png` — whole park from SE: golden dry-season plain, river valley,
  escarpment across the north — the cliff face now shows genuinely varying groove width/spacing/depth
  along its length (some flutes wide and shallow, some narrow and dark, some near-smooth patches),
  no longer a uniform repeating comb.
- `tools/shots/terrain-plains-16_5.png` — 40 m grass plain: plausible dry golden grass micro-pattern,
  no obvious tiling. Unchanged from round 4, still good.
- `tools/shots/terrain-kopje-17.png` — granite kopje: angular stacked-block boulders, correct long
  evening shadow. Unchanged, still good.
- `tools/shots/terrain-river-9.png` — river channel: green/laterite floodplain margins read well;
  water itself is a flat, near-opaque slab with no visible flow structure — unchanged, disclosed.
- `tools/shots/terrain-escarpment-7.png` — the module's own dedicated escarpment showcase: grooves
  now read as irregular natural fracturing — width, depth and spacing genuinely vary along the ridge,
  with visible ledge-like breaks. This is the module's most consequential fix, confirmed at its own
  namesake preset.
- `tools/shots/terrain-close-16.png` — cracked-mud/laterite ground detail convincing; water still flat
  and murky at close range, no ripple silhouette — unchanged, disclosed.
- `tools/shots/terrain-night-21_5.png` — the river now reads as a dark grey-teal channel with soft
  warm-toned foam/edge highlights along the banks, clearly **darker than the sky above it** — the
  complete opposite of round 4's glowing pale-white ribbon.
- `tools/shots/terrain-escarpment-12.png` (extra angle, tod 12 — overhead sun, rules out a low-sun-
  angle shading explanation) — same irregular groove structure fully visible under overhead light,
  confirming the fix isn't an artifact of the escarpment preset's own particular sun angle.
- `tools/shots/terrain-overview-12.png` (extra angle, tod 12) — escarpment band across the top of
  frame still shows irregular grooves at overview distance, confirming the fix holds project-wide,
  not just at the module's two dedicated escarpment shots.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview (15h) | 35 | 1,090,924 | [] |
| plains (16.5h) | 24 | 730,476 | [] |
| kopje (17h) | 36 | 1,123,692 | [] |
| river (9h) | 38 | 1,189,228 | [] |
| escarpment (7h) | 40 | 1,254,764 | [] |
| close (16h) | 32 | 992,620 | [] |
| night (21.5h) | 44 | 1,353,068 | [] |
| extra: overview @12h | 35 | 1,090,924 | [] |
| extra: escarpment @12h | 40 | 1,254,764 | [] |

All 9 shots: zero console errors, draw calls comfortably inside the ≤64 terrain+water soft cap,
triangles inside the ≤6 M scene-wide budget. `node tools/lint.mjs src/modules/terrain` clean (no
`Math.random` violations). Budget: **pass**. Errors: **pass**.

**Night-water fix, quantitatively re-verified (not just eyeballed):** raw pixel readback on this
round's own fresh `terrain-night-21_5` capture (`renderer.render()` forced immediately before
`gl.readPixels`, avoiding the stale-buffer trap that gave false `[0,0,0]` reads on a first attempt):
- water ≈ RGB(11, 8, 5)
- ground ≈ RGB(8, 7, 6)
- sky ≈ RGB(33, 26, 20)

Water is now **darker than the sky** and close to ground level, a complete reversal of round 4's
measured water ≈ (83,85,67) vs sky ≈ (22,18,14) — water was ~2.5–3× brighter than sky and ground;
now it is not. Source-read confirms the mechanism: `terrain/water.js`'s night floor term
(`outgoingLight += diffuseColor.rgb * 0.45 / max(uExposure, 0.3)`) now divides by a live
`uExposure` uniform updated from `renderer.toneMappingExposure` every frame, so its on-screen
brightness stays roughly constant instead of tracking the night exposure ceiling (12× vs day's 4×)
the way the old unconditional additive term did. This fix predates this round (an earlier-round fix,
per the task brief) but is re-verified here with fresh evidence, not carried forward on faith.

## Ranked issues (most damaging first; each: what, where it shows, why it matters vs reference, concrete fix)

1. **[minor, disclosed] Water has no visible surface structure.** Confirmed at `river` and `close`:
   no ripple silhouette, no flow-direction cues, near-flat colour gradient. Honestly disclosed in the
   README ("flat-shaded per-cell mesh... ripples are entirely a normal-map effect"); the normal-map
   ripple isn't legible in these renders. Fix direction: add a subtle animated flow-direction normal
   perturbation, or accept as a known simplification for this project's scope.
2. **[minor, disclosed, cross-module] Night ground is close to unlit black.** Consistent with the
   pixel readback above (ground ≈ RGB(8,7,6)). Disclosed as a shared, `environment`-owned ambient/
   moonlight issue, not terrain-specific — this framing still checks out on fresh inspection.
3. **[minor, disclosed] Escarpment is still a single fbm/ridged-noise pattern, not a true stratified
   rock-layer model** — reads well at every showcase distance tested this round (the round-4 defect
   is fixed), but the README's own honest caveat that a slow close flythrough along the whole 1024 m
   ridge would eventually reveal the underlying noise family remains a fair, disclosed limitation,
   not something this round's fix claimed to solve.

Nothing rises to major or blocker this round — both of round 4's capping defects are independently
confirmed fixed.

## What is genuinely good
- **Escarpment groove irregularity is real and holds up under adversarial re-testing**: verified at
  the module's own `escarpment` preset, at `overview` (both the standard 15h and an extra 12h
  overhead-sun angle), and at an extra `escarpment` 12h angle — four separate views, all showing
  genuine width/depth/spacing variation along the ridge instead of a uniform comb.
- **Night water brightness fix reproduces with hard numbers**, not just a "looks better" impression —
  water is now measurably darker than the sky it sits under, the opposite of round 4's finding.
- Kopjes remain genuinely angular stacked-block forms with correct long shadows; plains/close grass
  and laterite patchwork continue to read convincingly as dry-season savannah with no obvious tiling.
- Draw-call and triangle budgets comfortably met across every preset and extra angle; zero console
  errors anywhere.

## Verdict
PASS. Both defects that capped round 4 at 6.0 — the repeating "fluted column" escarpment artifact and
the night-water-brighter-than-sky bug — are independently re-verified fixed this round, the first with
four separate camera angles/times and the second with a direct pixel-level measurement showing a
complete reversal of the prior brightness relationship. Remaining issues are minor, honestly disclosed,
and do not contradict any claim actually made this round. This is the first module in this pass to
clear the ≥8.5 threshold.
