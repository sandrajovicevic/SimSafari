# effects → core / other-module notes

None of these block `effects` — filed for visibility only, per `docs/STATUS.json`'s existing entries
under `environment`.

## 1. (not new, reproduced) `environment`'s hard dark horizon band

`environment`'s own round-2 entry in `docs/STATUS.json` already flags "Hard dark band at the horizon
where the sky dome meets its ground colour" as a major, not yet independently re-checked since the
exposure fixes. Reproduced here in `tools/shots/effects-heat-13.png` and `tools/shots/effects-night-22.png`
(both show a sharp dark navy line right at the skyline, visible even at a bright clear midday in `heat`).
Worth noting for `effects` specifically: it sits right where the `heat` preset's heat-haze band and
skyline silhouettes are supposed to read, and it makes the shimmer band's ground-level context harder to
judge. Not filed as a new issue — just confirming it is still present post the exposure/shadow fixes, and
that it affects at least one other module's showcase (this one) besides `environment`'s own.

No diff proposed — `effects` does not own the sky dome and doesn't have enough context on how
`environment`'s horizon blend is built to suggest one.
