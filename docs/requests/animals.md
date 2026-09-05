# Core / cross-module change requests — `animals`

## 1. RESOLVED — Terrain chunks now receive shadows

`src/modules/terrain/mesh.js:31` used to ship `mesh.receiveShadow = false; // BENCH`. Fixed upstream —
verified by re-screenshotting `animals` `close`/`waterhole` with the module's own contact-shadow decal
hidden (`tools/shots/dbg-noshadow.png` and the A/B behind it): a full, correctly-shaped, soft-edged cast
shadow (trunk, ears, legs all read in the silhouette) now lands on the ground on its own.

`animals`' response: the contact-shadow decal (`ContactShadows` in `index.js`) is no longer the primary
grounding cue. It is demoted to a small, low-opacity (0.30, was 0.80), undirected contact-AO term sized
to the belly footprint — no more sun-offset/stretch, since shaping the shadow is now the real shadow's
job. This avoids double-darkening next to the real shadow while still tightening contact at the feet
where a shadow map's bias can leave a gap. Still one extra draw call for the whole module.

## 1b. (new, not core — `core` fallback lighting) Night preset is now unlit-black

Lowering the exposure ceiling (see §3 below) was correct for day/dusk but exposed a second bug: at
`tod 21.5` in a module-only showcase (no `environment` loaded, so only core's fallback sun+hemisphere
light the scene), the fallback sun's intensity is ~0.006 and **no `HemisphereLight` was found in the
scene at all** (`scene.traverse` over `isHemisphereLight` returns empty at night — it may exist earlier
in the day and be removed, or never have been added; not investigated further, out of this module's
folder). With exposure now correctly capped at 4, there is nothing left to make the scene visible:
`tools/shots/animals-night-r4.png` is essentially black except the CSM's faint moon/stars backdrop.
Previously the exposure=60 hack was accidentally compensating for this and made night dimly visible.
Proposed direction (core/environment owner): a minimum night ambient (moonlight) independent of
exposure, not a bigger exposure multiplier. Not filed as a diff — I don't own `core/environment` and
don't know which module is meant to provide night ambient in a module-only showcase.

## 2. (NOTE, `core/Textures.js`) Alpha channel of `gpu()` textures is not usable

A texture baked with `Textures.gpu()` that carries coverage in its **alpha** channel reads back
correctly with `readRenderTargetPixels` (verified: `(0,0,0,255)` at the centre of the disc) but
samples as ~0 alpha in a `MeshBasicMaterial` (`map`) *and* as ~0 through `alphaMap` (`.g`) in the
same frame; the identical mesh with `transparent: true` and no alpha texture renders fine. So the
render-target texture's alpha does not survive the round trip to the sampler in this environment
(WebGL2 + SwiftShader).

Not blocking — `animals` avoids it by carrying coverage in a per-vertex RGBA colour attribute
instead of a texture. Raised only so other modules do not lose time to it. No core change requested
until someone reproduces it on a real GPU.

## 3. PARTIALLY RESOLVED — tone-mapping exposure ceiling lowered from 60 to 4

Was 1.2–1.6 for most times of day but 5.46 at `tod 17.5` and 60 at `tod 21.5` (see the original table
below), which overexposed `predators`/`night` several-fold — confirmed at the time by reading back the
*baked* lion albedo texture directly (it decoded to the intended ~0.38 linear tawny even though the
on-screen render was near-white). Core lowered the ceiling to 4. Re-measured after the fix:

| tod | preset | exposure (before → after) |
|---|---|---|
| 8 | waterhole | 1.58 → 1.58 (unchanged) |
| 15 | close | 1.22 → 1.22 (unchanged) |
| 16 | overview | 1.58 → 1.58 (unchanged) |
| **17.5** | **predators** | **5.46 → 4.0** — better, but still ~2.5–3× the daytime baseline; `tools/shots/animals-predators-r4.png` still reads pale/washed rather than tawny |
| **21.5** | **night** | **60 → 4.0** — see §1b: with nothing else lighting the scene, this leaves `night` essentially black |

Downgraded from "note" to "partially resolved": dusk (`predators`) is better but not correct, and night
traded overexposure for underexposure. Not re-filed as a fix request — I don't own `core`/`environment`
and don't know the intended day/night exposure curve; flagging so it isn't mistaken for fixed.
