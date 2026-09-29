// Biodiversity index (Wave P3, docs/specs/p3-biodiversity-missions.md). Pure functions of the
// population ledger + the vegetation layer — no rng, no timing, deterministic, so same-seed reports
// stay byte-identical. sim.getBiodiversity() gathers the inputs (species counts, per-plant park-wide
// mean cover) and rounds; this file owns the formula.
import { SPECIES_ORDER } from './tables.js';

/** The Big Five we have ( leopard is NOT in this park — reported as null, never a stand-in). */
export const BIG_FIVE = Object.freeze(['elephant', 'rhino', 'buffalo', 'lion']);
export const SPECIES_TOTAL = SPECIES_ORDER.length; // 12 catalogue species
export const PLANT_MEAN_MIN = 0.02;                // a plant counts as present at >= this park-wide mean cover

/**
 * Biodiversity of a park from its species counts and per-plant park-wide mean cover.
 *   counts: { [species]: n } (only n > 0 matter); plantMeans: number[] in core/Plants.js order.
 *   richness      species with n > 0
 *   shannon       H = -Σ pᵢ ln pᵢ over animal counts
 *   evenness      J = H / ln(richness), 0 when richness <= 1
 *   bigFive       { elephant, rhino, buffalo, lion: counts, leopard: null }
 *   plantRichness plants with mean cover >= 0.02 (of the 10)
 *   index         100 × (0.40 richness/12 + 0.30 evenness + 0.20 bigPresent/4 + 0.10 plantRichness/10)
 */
export function computeBiodiversity(counts, plantMeans) {
  let total = 0, richness = 0;
  for (const s in counts) {
    const n = counts[s];
    if (!(n > 0)) continue;
    richness++;
    total += n;
  }
  let H = 0;
  if (total > 0) {
    for (const s in counts) {
      const n = counts[s];
      if (!(n > 0)) continue;
      const p = n / total;
      H -= p * Math.log(p);
    }
  }
  const evenness = richness > 1 ? H / Math.log(richness) : 0;
  const bigFive = { elephant: 0, rhino: 0, buffalo: 0, lion: 0, leopard: null };
  let bigPresent = 0;
  for (const s of BIG_FIVE) {
    const n = counts?.[s] ?? 0;
    bigFive[s] = n > 0 ? n : 0;
    if (n > 0) bigPresent++;
  }
  let plantRichness = 0;
  if (plantMeans) for (const m of plantMeans) if (m >= PLANT_MEAN_MIN) plantRichness++;
  const nPlants = plantMeans?.length || 1;
  const index = 100 * (0.40 * richness / SPECIES_TOTAL + 0.30 * evenness + 0.20 * bigPresent / 4 + 0.10 * plantRichness / nPlants);
  return { richness, shannon: H, evenness, bigFive, plantRichness, index };
}
