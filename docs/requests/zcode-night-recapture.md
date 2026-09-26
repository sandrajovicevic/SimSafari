# Z Code task: real-GPU recapture of the round-7 blind protocol (night exposure gate)

**Owner:** a critic session on the Z Code machine (real GPU). **Writes no code.**
**Why:** round 7 (`docs/critic/game-round7-blind.md`, SwiftShader) scored the game's night shots
3.0 / 2.5 ("near-total blackout") and ranked night legibility the top blocker. The integrator's
SwiftShader re-shot of `close` 21.5 h on the same render code (with the real LFS assets) was very dark
but legible. Round 6 (real GPU) was "murky but readable". Night exposure is **not retuned** until this
recapture says whether the problem is the backend or the build.

## Before you start
1. `git fetch origin && git checkout main && git pull` — must include the ideas-phase merge (PR #6:
   `docs/specs/p1-food-web.md` present). Record the head SHA in the report.
2. Confirm the authored assets are real files, not LFS pointers:
   `head -c 4 public/assets/models/polypizza/Lion.glb` must print `glTF`. If it prints `vers`, run
   `git lfs pull` (or `bash tools/lfs-fetch.sh`). Round 7 scored 100 % procedural fallbacks because of this.
3. `npm run dev` once (port 5173); keep it up.

## Captures (same protocol as rounds 3/5/6/7, 1920×1080, seed 1, quality high, clock pinned)
Use `tools/gpu-check.mjs` with the round-6 ANGLE D3D11 flags. Every capture's JSON `gpu` field must
name the real adapter (not SwiftShader); discard any that does not.

| shot | url / args |
|---|---|
| game overview 8 / 14 / 21.5 | `--url "http://127.0.0.1:5173/?preset=overview&tod=<h>&seed=1&quality=high&speed=0"` |
| game close 14 / 21.5 | `--url "http://127.0.0.1:5173/?preset=close&tod=<h>&seed=1&quality=high&speed=0"` |
| savannah hero / waterhole / kopje / night | `--module savannah --preset <p>` |
| savannah overview (anchor, not in the mean) | `--module savannah --preset overview` |

Plus, for the night question specifically, the **same two night shots on SwiftShader** from this
machine (`node tools/screenshot.mjs --game --preset overview --tod 21.5` and `--preset close`) so
the backend difference is measured on one checkout.

## Report
Write `docs/critic/game-round8-blind.md` in the round-7 format (per-image scores, Δ vs round 6 as the
real-GPU baseline, top-5 issues, JSON block). In addition, for both night shots on both backends,
give the **mean frame luminance (0–255)** and one sentence on what is legible. Update
`docs/STATUS.json` `game.blindVisual` (real GPU) only; leave `game.blindVisualSwiftShader` alone.

**Decision rule for the integrator afterwards:** if the real-GPU night shots are legible (≥ 6) the
round-7 blackout is a SwiftShader artefact → no exposure change, note it in STATUS. If they are dark
on the real GPU too → a night-exposure pass on `effects`/`environment` is opened with these images
as the before-state.
