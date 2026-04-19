// Enhanced Khamis-Roche wrapper.
//
// The base khamisRoche() already uses height, weight, and parental heights.
// This wrapper adds two tempo signals when available:
//
// 1. Velocity / PHV state: post-PHV tightens SD (less growth left to
//    misjudge); at-PHV widens (in the thick of instability); pre-PHV stays
//    near baseline.
//
// 2. BMI adiposity rebound timing:
//    - early rebound (<5 yrs) correlates with earlier puberty. For kids not
//      yet post-PHV, nudge prediction DOWN by ~1.5 cm (less growth window)
//      and tighten SD slightly.
//    - late rebound (>6.5 yrs) correlates with later puberty. Nudge
//      prediction UP by ~1.5 cm.
//    - normal rebound: no adjustment.
//
// These are small, directional corrections — K-R's published SE is already
// ~3.4 cm boys / 2.6 cm girls, so the effects move predictions within that
// envelope.

import { khamisRoche } from './khamisRoche.js';

const EARLY_REBOUND_OFFSET_CM = -1.5;
const LATE_REBOUND_OFFSET_CM  = +1.5;

export function khamisRocheEnhanced(params) {
  const base = khamisRoche(params);
  if (!base) return null;

  const { velocityState, bmiRebound } = params;
  let predicted = base.predictedAdultHeightCm;
  let sd = base.sdCm;
  const adjustments = [];

  // Velocity-state SD scaling
  if (velocityState === 'post-phv') {
    sd = Math.max(1.5, sd * 0.7);
    adjustments.push({ signal: 'post-phv', effect: 'SD tightened' });
  } else if (velocityState === 'at-phv') {
    sd = sd * 1.15;
    adjustments.push({ signal: 'at-phv', effect: 'SD widened (in peak spurt)' });
  }

  // BMI rebound timing offset (only if not already post-PHV; past that, the
  // adjustment is already reflected in the trajectory).
  if (bmiRebound && bmiRebound.timing && velocityState !== 'post-phv') {
    if (bmiRebound.timing === 'early') {
      predicted += EARLY_REBOUND_OFFSET_CM;
      sd = Math.max(sd, sd * 1.0); // no SD change, just point shift
      adjustments.push({
        signal: 'bmi-rebound-early',
        effect: `-${Math.abs(EARLY_REBOUND_OFFSET_CM)} cm (earlier puberty, less growth window)`,
      });
    } else if (bmiRebound.timing === 'late') {
      predicted += LATE_REBOUND_OFFSET_CM;
      adjustments.push({
        signal: 'bmi-rebound-late',
        effect: `+${LATE_REBOUND_OFFSET_CM} cm (later puberty, more growth window)`,
      });
    } else {
      adjustments.push({
        signal: 'bmi-rebound-normal',
        effect: 'no adjustment',
      });
    }
  }

  const ci90 = 1.645 * sd;
  const ci95 = 1.96 * sd;

  return {
    ...base,
    method: 'khamis-roche-enhanced',
    predictedAdultHeightCm: predicted,
    sdCm: sd,
    rangeLowCm: predicted - ci95,
    rangeHighCm: predicted + ci95,
    ci90LowCm: predicted - ci90,
    ci90HighCm: predicted + ci90,
    adjustments,
    baseMethod: 'khamis-roche',
    basePredictedAdultHeightCm: base.predictedAdultHeightCm,
    baseSdCm: base.sdCm,
  };
}
