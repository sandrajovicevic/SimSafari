# props — round 4 — score 8.3 / 10 — FAIL

This round's claimed fix is behavioral (chunk generation amortized across frames), not visual, so
verification focused on reproducing the actual claim directly rather than re-shooting all 7 presets
for their own sake. Read `grass.js`/`index.js` source in full, then independently measured both the
showcase-mode and live-`--game`-mode behavior with my own `--eval` scripts (not the builder's).

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/props-overview-16_5.png` (this round's own fresh capture, via an `--eval` `getStats()`
  call) — acacia savannah at 16:30: flat-topped umbrella thorns thickening into a dense riverine grove,
  escarpment and two kopjes visible, naturalistic density gradient — visually unregressed, matches
  round 3's description of this exact preset precisely.
- Round-3's other 6 preset screenshots (`grass`, `acacia`, `kopje`, `riverine`, `close`, `night`) were
  not re-captured this round, since this round's change is a pure `update()`-performance refactor with
  no rendering-path changes to any of those scenes; the overview re-capture plus the exact-match
  instance-count evidence below stand in for a full resweep given the nature of the change.

## Contract / errors / perf — the actual claim, independently reproduced

**Showcase mode (`--module props --preset overview`) — must stay fully synchronous, per the fix's own
stated design**: `getStats()` immediately after settling returned
`grassInstances: 179808, grassCounts: [15302, 92000, 72506], grassChunks: 221, grassPendingChunks: 0`.
This is an **exact match, to the last digit**, against round 3's own README-recorded baseline for this
same preset (`grassInstances: 179808`, same `grassCounts`, same `grassChunks: 221`) — strong evidence
the amortization refactor produces byte-identical output in showcase mode, not just "looks about the
same." `grassPendingChunks: 0` confirms showcase mode still forces full completion before capture, as
claimed. `grassRebuildMs` for this one-time full showcase population was 399.4 ms (round 3's recorded
worst case for the same scenario was 792 ms; this round's 399 ms is a different, unrelated capture's
timing, not a regression — both are the *pre-existing, intentionally-kept* synchronous showcase cost,
not what this round's fix targets).

**Live `--game` mode, the actual behavior this round's fix targets** — independently reproduced with
my own script (not the builder's), a 424 m `lookAt()` jump exactly matching the task's suggested
reproduction:
```
before:    { grassInstances: 184626, grassRebuildMs: 15.8,  grassPendingChunks: 0   }
afterJump: { grassInstances: 12184,  grassRebuildMs: 8.2,   grassPendingChunks: 205 }
```
Both of the task's specific pass/fail criteria are met: `afterJump.grassRebuildMs` is a small,
single-digit-to-low-double-digit number (8.2 ms), not 100+ ms; and `afterJump.grassPendingChunks` is
205 (clearly > 0), directly confirming the field is streaming in rather than completing instantly. This
is a genuine, reproducible ~16–32× improvement over round 3's measured 132–263 ms **on literally every
preset switch** — the exact failure mode round 3 flagged as "not a rare edge case, the normal cost of
a camera jump."

`node tools/lint.mjs src/modules/props` — clean, no `Math.random` violations.

## Ranked issues (most damaging first; each: what, where it shows, why it matters, concrete fix)

1. **[minor, honestly disclosed, genuinely reduced from major] The streamed per-frame cost is still
   over the strict ARCHITECTURE §7 budget (≤1.5 ms avg) during an active camera jump.** My own
   measurement: 8.2 ms on the sampled frame right after a 424 m jump (the module's own README reports
   a 6–17 ms range across several sampled frames). This is real and means the module does not yet meet
   the letter of the per-module `update()` budget during the ~1–2 second window while a large jump's
   chunk queue is draining — which is why this module cannot be marked as fully "within budget" this
   round despite the dramatic improvement. It is categorically different from round 3's finding,
   though: round 3 was a guaranteed 132–263 ms **single-frame freeze on every preset switch**; this is
   a bounded, honestly-disclosed ~5–10× (not 90–175×) overage that only manifests as multiple small
   per-frame costs spread across roughly a second while the player is actively panning far, not a
   freeze. Fix direction (already correctly identified in the module's own README): amortize `_repack`
   itself, not just `_drainQueue`, since repack cost grows with the number of currently-cached chunks
   (observed up to ~54 ms once 221+ chunks were cached in this round's own showcase measurement).
2. **[minor, honestly disclosed]** The packing step (`_repack`) itself is not amortized and its cost
   grows as more chunks stream in — confirmed directly: `grassPackMs` was 1.3 ms right after a jump
   (few chunks cached) but 53.9 ms in the fully-populated showcase capture (221 chunks cached),
   consistent with the module's own README-disclosed "up to ~10 ms once several hundred chunks are
   cached" concern, actually somewhat higher in my own measurement. This is the natural next
   bottleneck once `_drainQueue`'s generation cost is no longer dominant, correctly flagged as such by
   the module's own README rather than smoothed over.

Nothing else rises above minor — the underlying visual/content quality (unchanged this round) remains
excellent, and I found no claim in the round-4 fix description I could not independently reproduce.

## What is genuinely good
- **The core, sole catastrophic defect that drove round 3's 7.0 score — a guaranteed 90–175× per-frame
  budget overage on every single preset switch — is genuinely and substantially fixed**, independently
  reproduced with my own eval script rather than trusted from the commit message, and matching both of
  the task's specific numeric criteria for what a real fix should look like.
- Showcase-mode visual output is provably unregressed: exact-match instance counts against round 3's
  own recorded baseline, not just an "it still looks fine" impression.
- The module's README is exemplary in how it discloses this fix: it states plainly what changed, what
  was independently measured (with real numbers from a `--game`-mode test, cross-checked against the
  pre-fix code via `git stash` in the same session), and what specific residual gap remains
  (`_repack` not yet amortized), rather than declaring the budget line fully solved.
- Lint clean; draw-call/triangle budgets remain comfortably met (unaffected by this round's change).

## Verdict
FAIL, but score raised substantially (7.0 → 8.3) to reflect a genuine, independently-reproduced fix of
the module's one dominant defect. The catastrophic, guaranteed-every-preset-switch freeze is gone,
replaced by a bounded, honestly-disclosed, ~5–10× (not 90–175×) residual overage during the brief
window while a large camera jump's chunk queue drains — real progress, but the per-module `update()`
budget is still not fully met on every frame, which is why this cannot be marked a pass under the
brief's "within budget" gate regardless of the scale of improvement.
